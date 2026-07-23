const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const { products, conversations } = require("./src/seedData");

const loadEnvFile = () => {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separator = trimmed.indexOf("=");
      if (separator === -1) return;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      if (!process.env[key]) process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    });
};

loadEnvFile();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });
const PORT = process.env.PORT || 3085;
const HOST = process.env.HOST || "0.0.0.0";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
const MERCADO_PAGO_PUBLIC_KEY = process.env.MERCADO_PAGO_PUBLIC_KEY || "";
const MERCADO_PAGO_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET || "";
const MERCADO_PAGO_CURRENCY = process.env.MERCADO_PAGO_CURRENCY || "USD";
const MERCADO_PAGO_CLIENT_ID = process.env.MERCADO_PAGO_CLIENT_ID || "";
const MERCADO_PAGO_CLIENT_SECRET = process.env.MERCADO_PAGO_CLIENT_SECRET || "";
const MERCADO_PAGO_OAUTH_REDIRECT_URI = process.env.MERCADO_PAGO_OAUTH_REDIRECT_URI || `${APP_BASE_URL}/api/payments/mercadopago/oauth/callback`;
const MERCADO_PAGO_OAUTH_AUTHORIZE_URL = process.env.MERCADO_PAGO_OAUTH_AUTHORIZE_URL || "https://auth.mercadopago.com.uy/authorization";
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || "";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORE_TABLE = process.env.SUPABASE_STORE_TABLE || "marketpro_store";
const SUPABASE_STORE_ID = process.env.SUPABASE_STORE_ID || "production";
const SUPABASE_PRIVATE_BUCKET = process.env.SUPABASE_PRIVATE_BUCKET || "marketpro-private";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "MarketPro <no-reply@marketpro.uy>";
const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const hasSupabaseStore = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
let cloudStoreReady = false;
let privateBucketReady = false;
let cloudWriteQueue = Promise.resolve();
const adminTokens = new Set();
const requestBuckets = new Map();
const demoListingIds = new Set(products.map((product) => product.id));

const isRealListing = (product = {}) => {
  const sellerEmail = String(product.seller?.email || "").toLowerCase();
  const images = Array.isArray(product.images) ? product.images : [];
  return !demoListingIds.has(product.id) &&
    product.source !== "demo" &&
    !sellerEmail.endsWith("@demo.local") &&
    !sellerEmail.endsWith("@market.local") &&
    !images.some((image) => /\/api\/(?:demo-photo|placeholder)\//i.test(String(image)));
};
const isPublicListing = (product = {}) =>
  isRealListing(product) && (!product.status || product.status === "active");

const listingTimestamp = (product = {}) => {
  const explicit = new Date(product.createdAt || product.updatedAt || "").getTime();
  if (Number.isFinite(explicit)) return explicit;
  const match = String(product.id || "").match(/^item-(\d{10,})$/);
  return match ? Number(match[1]) : 0;
};

const duplicateListingKey = (product = {}) => [
  String(product.seller?.email || product.seller?.name || "").trim().toLowerCase(),
  String(product.title || "").trim().toLowerCase().replace(/\s+/g, " "),
  Number(product.price || 0).toFixed(2),
  String(product.location || "").trim().toLowerCase().replace(/\s+/g, " ")
].join("|");

const dedupeRapidListings = (items = []) => {
  const ordered = [...items].sort((a, b) => listingTimestamp(a) - listingTimestamp(b));
  const latestByKey = new Map();
  const removedIds = new Set();
  ordered.forEach((product) => {
    if (!isRealListing(product) || (product.status && product.status !== "active")) return;
    const timestamp = listingTimestamp(product);
    const key = duplicateListingKey(product);
    if (!timestamp || !key) return;
    const previous = latestByKey.get(key);
    if (previous && timestamp - previous.timestamp <= 10 * 60 * 1000) {
      removedIds.add(product.id);
      return;
    }
    latestByKey.set(key, { id: product.id, timestamp });
  });
  return {
    listings: items.filter((product) => !removedIds.has(product.id)),
    removedIds: [...removedIds]
  };
};

const encryptionKey = () => TOKEN_ENCRYPTION_KEY ? crypto.createHash("sha256").update(TOKEN_ENCRYPTION_KEY).digest() : null;

const encryptSecret = (value = "") => {
  const key = encryptionKey();
  if (!key || !value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
};

const decryptSecret = (payload = "") => {
  const key = encryptionKey();
  if (!key || !payload) return "";
  try {
    const [iv, tag, encrypted] = String(payload).split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
};

const base32Bytes = (value = "") => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanValue = String(value).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of cleanValue) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
};

const validTotp = (code = "") => {
  if (!ADMIN_TOTP_SECRET) return true;
  const received = String(code).replace(/\D/g, "");
  if (received.length !== 6) return false;
  const key = base32Bytes(ADMIN_TOTP_SECRET);
  const counter = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((offset) => {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter + offset));
    const digest = crypto.createHmac("sha1", key).update(buffer).digest();
    const position = digest[digest.length - 1] & 15;
    const number = (digest.readUInt32BE(position) & 0x7fffffff) % 1000000;
    return crypto.timingSafeEqual(Buffer.from(String(number).padStart(6, "0")), Buffer.from(received));
  });
};

const sendEmail = async ({ to, subject, html }) => {
  if (!RESEND_API_KEY || !to) return { sent: false, reason: "not-configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html })
    });
    return response.ok ? { sent: true } : { sent: false, reason: `email-${response.status}` };
  } catch {
    return { sent: false, reason: "network" };
  }
};

const notifyUser = (email, title, message, type = "info", link = "") => {
  if (!email) return;
  store.notifications = [
    { id: `notice-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`, email: String(email).toLowerCase(), title, message, type, link, read: false, createdAt: new Date().toISOString() },
    ...(store.notifications || [])
  ].slice(0, 1000);
};

const adminAudit = (req, action, details = {}) => {
  store.adminAudit = [
    { id: `audit-${Date.now()}`, action, details, ip: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(), createdAt: new Date().toISOString() },
    ...(store.adminAudit || [])
  ].slice(0, 500);
};

const rateLimit = ({ windowMs = 60000, max = 20, key = "general" } = {}) => (req, res, next) => {
  const identity = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
  const bucketKey = `${key}:${identity}`;
  const now = Date.now();
  const entries = (requestBuckets.get(bucketKey) || []).filter((time) => now - time < windowMs);
  if (entries.length >= max) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos y vuelve a probar." });
  entries.push(now);
  requestBuckets.set(bucketKey, entries);
  next();
};
const unsplash = (id, focus = "center") =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&h=900&q=86&fm=jpg&ixlib=rb-4.1.0&crop=${focus}`;

const internetPhotos = {
  "civic-1": unsplash("photo-1492144534655-ae79c964c9d7", "center"),
  "civic-2": unsplash("photo-1503736334956-4c8f8e92946d", "center"),
  "civic-3": unsplash("photo-1517672651691-24622a91b550", "center"),
  "apartment-1": unsplash("photo-1600585154340-be6161a56a0c", "center"),
  "apartment-2": unsplash("photo-1600607687939-ce8a6c25118c", "center"),
  "apartment-3": unsplash("photo-1600566753190-17f0baa2a6c3", "center"),
  "iphone-15-pro": unsplash("photo-1511707171634-5f897ff02aa9", "center"),
  "phone-box": unsplash("photo-1512499617640-c2f999098c01", "center"),
  "gray-sofa": unsplash("photo-1555041469-a586c61ea9bc", "center"),
  "living-room": unsplash("photo-1616486338812-3dadae4b4ace", "center"),
  "trek-bike": unsplash("photo-1485965120184-e220f721d5b8", "center"),
  "mountain-bike": unsplash("photo-1507035895480-2b3156c31fc8", "center"),
  "black-jacket": unsplash("photo-1551028719-00167b16eac5", "center"),
  "leather-jacket": unsplash("photo-1520975954732-35dd22299614", "center"),
  "switch-oled": unsplash("photo-1612036782180-6f0b6cd846fe", "center"),
  "gaming-console": unsplash("photo-1606813907291-d86efa9b94db", "center"),
  "lego-technic": unsplash("photo-1587654780291-39c9404d746b", "center"),
  "toy-box": unsplash("photo-1566576912321-d58ddd7a6088", "center"),
  "macbook-air-m2": unsplash("photo-1517336714731-489689fd1ca8", "center"),
  "laptop-desk": unsplash("photo-1496181133206-80ce9b88a853", "center"),
  "wood-table": unsplash("photo-1533090368676-1fd25485db88", "center"),
  "dining-room": unsplash("photo-1615873968403-89e068629265", "center"),
  dumbbells: unsplash("photo-1576678927484-cc907957088c", "center"),
  "home-gym": unsplash("photo-1540497077202-7c8a3999166f", "center"),
  "blue-dress": unsplash("photo-1539008835657-9e8e9680c956", "center"),
  "fashion-dress": unsplash("photo-1483985988355-763728e1935b", "center"),
  "playstation-5": unsplash("photo-1606144042614-b2417e99c4e3", "center"),
  "dual-controller": unsplash("photo-1592840496694-26d035b52b48", "center"),
  "office-chair": unsplash("photo-1580480055273-228ff5388ef8", "center"),
  "desk-chair": unsplash("photo-1598300042247-d088f8ab3a91", "center"),
  "toyota-hilux": unsplash("photo-1533473359331-0135ef1b58bf", "center"),
  "pickup-truck": unsplash("photo-1542362567-b07e54358753", "center")
};

const demoUser = {
  id: "user-demo",
  name: "Emma Mercado",
  email: "emma@market.local",
  phone: "099 000 000",
  cedula: "1.234.567-8",
  exactLocation: "Montevideo, Uruguay",
  verified: true,
  verificationStatus: "Verificado",
  balance: 1840,
  pendingBalance: 320,
  createdAt: "Demo"
};

const defaultStore = {
  products,
  conversations,
  orders: [],
  reports: [],
  supportTickets: [],
  blockedPairs: [],
  users: [demoUser],
  currentUser: null,
  verificationRequests: [],
  memory: {
    updatedAt: new Date().toISOString(),
    note: "Memoria persistente local de MarketPro."
  }
};

const privateInnovations = [
  ["Huella de publicacion", "Congela fotos, precio, descripcion y vendedor al momento de crear la orden.", "Seguridad"],
  ["Prueba de empaque obligatoria", "Antes de entregar, el vendedor sube evidencia del articulo preparado.", "Seguridad"],
  ["Coincidencia por accesorios", "La orden registra caja, cargador, factura, llaves o piezas incluidas.", "Seguridad"],
  ["Codigo de recepcion unico", "Confirma la entrega dentro de MarketPro sin intervenir en el pago.", "Seguridad"],
  ["Entrega con doble consentimiento", "Comprador y vendedor deben cerrar la operacion desde sus cuentas.", "Seguridad"],
  ["Alerta de salida de plataforma", "Marca conversaciones que intentan llevar pago o entrega fuera de la app.", "Seguridad"],
  ["Score de riesgo silencioso", "El admin ve riesgo por precio raro, cuenta nueva, reportes o cambios bruscos.", "Seguridad"],
  ["Bloqueo por patron repetido", "Detecta textos/fotos repetidas en multiples cuentas.", "Seguridad"],
  ["Mapa privado de incidentes", "El admin visualiza zonas con reportes, demoras o disputas.", "Seguridad"],
  ["Revision reforzada por categoria", "Vehiculos, inmuebles y electronica activan controles mas estrictos.", "Seguridad"],
  ["Pago directo verificado", "MarketPro confirma el estado informado por Mercado Pago sin recibir el dinero.", "Pagos"],
  ["Seguimiento por etapas", "Operaciones grandes registran preparacion, despacho, rastreo y recepcion.", "Pagos"],
  ["Reserva sin deposito", "El comprador puede solicitar que la publicacion quede reservada mientras coordinan.", "Pagos"],
  ["Expediente de reclamo", "La evidencia queda preparada para gestionar el reclamo directamente en Mercado Pago.", "Pagos"],
  ["Cierre preventivo", "Una incidencia pausa la finalizacion interna y conserva toda la evidencia.", "Pagos"],
  ["Oferta formal con vencimiento", "Una oferta aceptada crea compromiso y evita cambios de precio.", "Pagos"],
  ["Precio protegido", "El precio no puede cambiar despues de iniciar checkout.", "Pagos"],
  ["Planes transparentes", "MarketPro monetiza anuncios y herramientas opcionales, no custodia ventas.", "Pagos"],
  ["Opciones de entrega", "Permite pago directo por Mercado Pago o pago al retirar cuando corresponda.", "Pagos"],
  ["Recibo verificable", "Cada compra genera comprobante interno con version de publicacion.", "Pagos"],
  ["Chat con semaforo", "El sistema marca mensajes normales, sensibles o peligrosos.", "Mensajeria"],
  ["Minuta automatica", "Resume acuerdo: producto, precio, entrega, condiciones y fecha.", "Mensajeria"],
  ["Preguntas por categoria", "La app sugiere preguntas tecnicas segun producto.", "Mensajeria"],
  ["Modo negociacion", "Ofertas y contraofertas quedan estructuradas, no perdidas en chat.", "Mensajeria"],
  ["Chat postventa cerrado", "Despues de confirmar entrega, el chat cambia a soporte/postventa.", "Mensajeria"],
  ["Reporte de frase critica", "Detecta pedidos de clave, codigo, pago externo o adelanto.", "Mensajeria"],
  ["Canal de mediacion", "Admin puede entrar a una disputa sin exponer datos innecesarios.", "Mensajeria"],
  ["Identidad gradual", "El comprador ve solo lo necesario hasta iniciar compra.", "Mensajeria"],
  ["Plantillas de entrega", "Mensajes prearmados reducen errores al coordinar.", "Mensajeria"],
  ["Historial anti-borrado", "Los mensajes ligados a orden no desaparecen en disputas.", "Mensajeria"],
  ["Perfil de vendedor vivo", "Reputacion cambia por entrega, puntualidad, disputas y descripcion real.", "Reputacion"],
  ["Reputacion por categoria", "Un buen vendedor de ropa no hereda reputacion para vehiculos.", "Reputacion"],
  ["Indice de puntualidad", "Mide si entrega a tiempo y responde rapido.", "Reputacion"],
  ["Indice de coincidencia", "Mide si lo recibido coincide con lo publicado.", "Reputacion"],
  ["Nivel de confianza invisible", "El admin ve un nivel interno que no se manipula publicamente.", "Reputacion"],
  ["Comprador confiable", "El vendedor ve senales basicas antes de aceptar entrega.", "Reputacion"],
  ["Penalidad por cancelacion", "Cancelaciones repetidas reducen prioridad de publicaciones.", "Reputacion"],
  ["Ranking de calidad", "Prioriza publicaciones claras, completas y sin reportes.", "Reputacion"],
  ["Cuenta bajo observacion", "Permite monitorear sin bloquear inmediatamente.", "Reputacion"],
  ["Validacion comunitaria privada", "Reportes consistentes elevan revision admin.", "Reputacion"],
  ["Agenda de entrega integrada", "Compra y vendedor acuerdan fecha sin salir de la app.", "Entrega"],
  ["Punto seguro recomendado", "Sugiere lugares publicos por zona y horario.", "Entrega"],
  ["Entrega con evidencia visual", "Permite foto/video al cerrar una entrega delicada.", "Entrega"],
  ["Ventana de inspeccion", "El comprador revisa el producto antes de confirmar la recepcion.", "Entrega"],
  ["Confirmacion por cercania", "Preparado para validar que ambos estuvieron en la zona acordada.", "Entrega"],
  ["Entrega delegada", "Autoriza a un tercero con nombre y documento parcial.", "Entrega"],
  ["Alerta de retraso", "Si se vence el horario, la orden pide reprogramar o reportar.", "Entrega"],
  ["Checklist de recepcion", "Comprador confirma estado, accesorios y funcionamiento.", "Entrega"],
  ["Disputa guiada", "Recolecta evidencia ordenada antes de pedir decision admin.", "Entrega"],
  ["Cierre premium", "Operacion finalizada genera reputacion, comprobante y aprendizaje interno.", "Entrega"]
];

const suspiciousPatterns = [
  { key: "external-payment", label: "Posible pago externo", pattern: /(transferencia|dep[oó]sito|western union|paypal|fuera de la app|por fuera|bizum|zelle|cuenta bancaria)/i },
  { key: "secret-code", label: "Solicitud de codigo sensible", pattern: /(c[oó]digo|clave|pin|otp|verificaci[oó]n|contrase[nñ]a)/i },
  { key: "pressure", label: "Presion o urgencia", pattern: /(urgente|ya mismo|ap[uú]rate|solo hoy|sin preguntar|no lo pienses)/i },
  { key: "identity-evasion", label: "Evasion de identidad", pattern: /(no tengo documento|sin c[eé]dula|no puedo verificar|otro nombre|no soy yo)/i },
  { key: "off-platform-contact", label: "Contacto fuera de la app", pattern: /(whatsapp|telegram|instagram|ll[aá]mame|escr[ií]beme por fuera|mi n[uú]mero)/i }
];

const analyzeTextRisk = (text = "") => {
  const hits = suspiciousPatterns.filter((item) => item.pattern.test(text));
  return {
    level: hits.length >= 2 || hits.some((hit) => ["secret-code", "external-payment"].includes(hit.key)) ? "Alto" : hits.length === 1 ? "Medio" : "Bajo",
    flags: hits.map((item) => item.label)
  };
};

suspiciousPatterns.push(
  { key: "shipping-trick", label: "Entrega no verificable", pattern: /(mando un uber|mando taxi|retira un amigo|tercero sin documento|sin revisar|dejalo en porteria|te paso cadete)/i },
  { key: "refund-trick", label: "Engano de reembolso", pattern: /(devolucion inmediata|te devuelvo luego|paga y cancelo|reembolso por fuera|me equivoque de pago)/i },
  { key: "crypto-cash", label: "Pago no reversible", pattern: /(cripto|binance|usdt|cash|efectivo|giro|redpagos|abitab)/i }
);

const analyzeListingRisk = (product = {}) => {
  const text = [product.title, product.description, product.location].join(" ");
  const textRisk = analyzeTextRisk(text);
  const price = Number(product.price || 0);
  const imageCount = product.images?.length || 0;
  const flags = [...textRisk.flags];
  if (imageCount < 2) flags.push("Pocas fotos del articulo");
  if (String(product.description || "").length < 90) flags.push("Descripcion corta");
  if (price > 1000 && !/serie|imei|factura|recibo|chasis|matricula|modelo|medida/i.test(text)) flags.push("Falta identificador para articulo de valor");
  if (/(sin garantia|no acepto reclamos|solo efectivo|retira ya)/i.test(text)) flags.push("Condiciones sospechosas");
  const score = Math.min(95, 14 + flags.length * 14 + (price > 1000 ? 10 : 0) + (price > 10000 ? 12 : 0));
  return {
    score,
    level: score >= 58 ? "Alto" : score >= 34 ? "Medio" : "Bajo",
    flags,
    reviewRequired: score >= 58,
    fingerprint: crypto
      .createHash("sha256")
      .update(JSON.stringify({
        title: product.title,
        price: product.price,
        seller: product.seller?.email || product.seller?.name,
        description: product.description,
        images: product.images
      }))
      .digest("hex")
      .slice(0, 20)
      .toUpperCase()
  };
};

const hashPassword = (password = "", salt = crypto.randomBytes(16).toString("hex")) => ({
  passwordSalt: salt,
  passwordHash: crypto.scryptSync(String(password), salt, 64).toString("hex"),
  passwordAlgorithm: "scrypt"
});

const verifyPassword = (password = "", user = {}) => {
  if (!user.passwordHash || !user.passwordSalt) return true;
  if (user.passwordAlgorithm === "scrypt") {
    const expected = Buffer.from(user.passwordHash, "hex");
    const received = crypto.scryptSync(String(password), user.passwordSalt, 64);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }
  return crypto.createHash("sha256").update(`${user.passwordSalt}:${password}`).digest("hex") === user.passwordHash;
};

const publicUser = (user) => {
  if (!user) return null;
  const { passwordHash, passwordSalt, passwordAlgorithm, hash, salt, mercadoPagoOAuth, privateMedia, documentPhoto, ...safe } = user;
  return {
    ...safe,
    profilePhoto: typeof safe.profilePhoto === "string" && !safe.profilePhoto.startsWith("data:")
      ? safe.profilePhoto
      : `/api/avatar/${encodeURIComponent(safe.name || "Usuario")}.svg`,
    documentPhoto: Boolean(documentPhoto || privateMedia?.document),
    hasPassword: Boolean(passwordHash || hash),
    authComplete: Boolean(safe.authComplete),
    mercadoPago: {
      connected: Boolean(mercadoPagoOAuth?.accessTokenEncrypted),
      accountId: mercadoPagoOAuth?.userId || "",
      connectedAt: mercadoPagoOAuth?.connectedAt || ""
    }
  };
};

const userByEmail = (email = "") =>
  store.users.find((user) => String(user.email || "").toLowerCase() === String(email || "").toLowerCase());

const createUserSession = (user, req) => {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const session = {
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    userId: user.id,
    email: user.email,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 160)
  };
  store.sessions = [session, ...(store.sessions || []).filter((item) => item.userId !== user.id).slice(0, 8)];
  return { ...session, token };
};

const authTokenFrom = (req) => String(req.headers.authorization || "").replace("Bearer ", "").trim();

const userFromSessionToken = (token = "") => {
  const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
  const session = (store.sessions || []).find((item) => item.tokenHash === tokenHash || item.token === token);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  session.lastSeenAt = new Date().toISOString();
  return store.users.find((user) => user.id === session.userId || String(user.email || "").toLowerCase() === String(session.email || "").toLowerCase()) || null;
};

const authenticatedUser = (req) => {
  const token = authTokenFrom(req);
  if (!token) return null;
  return userFromSessionToken(token);
};

const authAttemptState = (email = "") => {
  const key = String(email || "unknown").toLowerCase();
  store.authAttempts = store.authAttempts || {};
  store.authAttempts[key] = store.authAttempts[key] || { count: 0, lockedUntil: "", lastAt: "" };
  return store.authAttempts[key];
};

const recordFailedLogin = (email = "") => {
  const attempt = authAttemptState(email);
  attempt.count += 1;
  attempt.lastAt = new Date().toISOString();
  if (attempt.count >= 5) {
    attempt.lockedUntil = new Date(Date.now() + 1000 * 60 * 15).toISOString();
  }
  return attempt;
};

const clearFailedLogin = (email = "") => {
  const attempt = authAttemptState(email);
  attempt.count = 0;
  attempt.lockedUntil = "";
  attempt.lastAt = new Date().toISOString();
};

const generateUniqueDeliveryCode = () => {
  let code = "";
  do {
    code = crypto.randomBytes(4).toString("hex").toUpperCase();
  } while ((store.orders || []).some((order) => order.delivery?.code === code || order.deliveryConfirmation?.code === code));
  return code;
};

const buildSecurityStamp = (product, req) => {
  const price = Number(product.price || 0);
  const listingRisk = product.security?.listingRisk || analyzeListingRisk(product);
  const categoryRisk = ["Vehiculos", "Inmuebles", "Electronica"].includes(product.category) ? 18 : 8;
  const priceRisk = price > 10000 ? 18 : price > 1000 ? 10 : 4;
  const sellerRisk = Number(product.seller?.ratingCount || product.seller?.reviews || 0) > 0 && product.seller?.rating >= 4.8 ? 0 : 8;
  const reportRisk = Number(product.reportCount || 0) * 8;
  const riskScore = Math.min(96, categoryRisk + priceRisk + sellerRisk + reportRisk + Math.round(Number(listingRisk.score || 0) / 5));
  return {
    id: `sec-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    riskScore,
    riskLevel: riskScore >= 50 ? "Alto" : riskScore >= 28 ? "Medio" : "Bajo",
    listingRisk,
    frozenAt: new Date().toISOString(),
    productFingerprint: crypto
      .createHash("sha256")
      .update(JSON.stringify({
        id: product.id,
        title: product.title,
        price: product.price,
        seller: product.seller?.email || product.seller?.name,
        images: product.images,
        buyer: req.body.buyer?.id || req.body.buyer?.email || ""
      }))
      .digest("hex")
      .slice(0, 18)
      .toUpperCase(),
    controls: [
      "Precio y publicacion congelados",
      "Pago vinculado con Mercado Pago",
      "Chat y orden conservados como evidencia",
      "Vendedor y comprador asociados a identidad",
      "Incidencia conserva evidencia para reclamo",
      "Revision reforzada si hay alerta de riesgo",
      "Codigo de entrega nunca debe compartirse por chat",
      "Huella antifraude compara fotos, precio y descripcion"
    ]
  };
};

const updateSellerRating = (seller = {}, rating, comment = "") => {
  const sellerEmail = String(seller.email || "").toLowerCase();
  const sellerName = String(seller.name || "");
  const previousCount = Number(seller.ratingCount || seller.reviews || 0);
  const previousRating = Number(seller.rating || 0);
  const nextCount = previousCount + 1;
  const nextRating = Number((((previousRating * previousCount) + Number(rating)) / nextCount).toFixed(2));
  const ratingSummary = {
    rating: nextRating,
    ratingCount: nextCount,
    lastRatingComment: comment || "",
    lastRatedAt: new Date().toISOString()
  };

  listings = listings.map((product) => {
    const matches = String(product.seller?.email || "").toLowerCase() === sellerEmail || String(product.seller?.name || "") === sellerName;
    return matches ? { ...product, seller: { ...product.seller, ...ratingSummary } } : product;
  });
  store.products = listings;
  store.users = (store.users || []).map((user) => {
    const matches = String(user.email || "").toLowerCase() === sellerEmail || String(user.name || "") === sellerName;
    return matches ? { ...user, ...ratingSummary } : user;
  });
  if (store.currentUser && (String(store.currentUser.email || "").toLowerCase() === sellerEmail || String(store.currentUser.name || "") === sellerName)) {
    store.currentUser = { ...store.currentUser, ...ratingSummary };
  }
  return ratingSummary;
};

const mercadoPagoOAuthReady = () => Boolean(
  MERCADO_PAGO_CLIENT_ID &&
  MERCADO_PAGO_CLIENT_SECRET &&
  MERCADO_PAGO_OAUTH_REDIRECT_URI &&
  TOKEN_ENCRYPTION_KEY
);

const sellerUserFor = (seller = {}) => {
  const email = String(seller.email || "").toLowerCase();
  return (store.users || []).find((user) =>
    (email && String(user.email || "").toLowerCase() === email) ||
    (!email && seller.name && user.name === seller.name)
  );
};

const exchangeMercadoPagoToken = async (body) => {
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    return { error: data.message || data.error || "Mercado Pago rechazo la autorizacion.", details: data };
  }
  return data;
};

const sellerMercadoPagoAccess = async (seller = {}) => {
  const user = sellerUserFor(seller);
  if (!user?.mercadoPagoOAuth?.accessTokenEncrypted) {
    return { error: "Este vendedor todavia no conecto su cuenta de Mercado Pago." };
  }
  let accessToken = decryptSecret(user.mercadoPagoOAuth.accessTokenEncrypted);
  if (!accessToken) return { error: "La conexion de Mercado Pago debe renovarse." };

  const expiresAt = new Date(user.mercadoPagoOAuth.expiresAt || 0).getTime();
  if (expiresAt && expiresAt < Date.now() + 5 * 60 * 1000) {
    const refreshToken = decryptSecret(user.mercadoPagoOAuth.refreshTokenEncrypted);
    if (!refreshToken) return { error: "La conexion de Mercado Pago vencio. El vendedor debe conectarla otra vez." };
    const refreshed = await exchangeMercadoPagoToken({
      client_id: MERCADO_PAGO_CLIENT_ID,
      client_secret: MERCADO_PAGO_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
    if (refreshed.error) return refreshed;
    accessToken = refreshed.access_token;
    user.mercadoPagoOAuth = {
      ...user.mercadoPagoOAuth,
      accessTokenEncrypted: encryptSecret(refreshed.access_token),
      refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken),
      expiresAt: new Date(Date.now() + Number(refreshed.expires_in || 15552000) * 1000).toISOString(),
      refreshedAt: new Date().toISOString()
    };
    writeStore();
  }
  return { user, accessToken };
};

const createMercadoPagoPreference = async ({ order, product }) => {
  const sellerAccess = await sellerMercadoPagoAccess(product.seller);
  if (sellerAccess.error) return sellerAccess;
  const { user: sellerUser, accessToken } = sellerAccess;

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_reference: order.id,
      notification_url: `${APP_BASE_URL}/api/payments/mercadopago/webhook?seller=${encodeURIComponent(sellerUser.id)}`,
      back_urls: {
        success: `${APP_BASE_URL}/?payment=success&order=${encodeURIComponent(order.id)}`,
        pending: `${APP_BASE_URL}/?payment=pending&order=${encodeURIComponent(order.id)}`,
        failure: `${APP_BASE_URL}/?payment=failure&order=${encodeURIComponent(order.id)}`
      },
      auto_return: "approved",
      items: [
        {
          id: product.id,
          title: product.title,
          description: product.description,
          quantity: 1,
          currency_id: MERCADO_PAGO_CURRENCY,
          unit_price: Number(product.price || 0)
        }
      ],
      payer: {
        name: order.buyer?.name || "",
        email: order.buyer?.email || undefined,
        phone: {
          number: order.delivery?.phone || undefined
        },
        address: {
          street_name: order.delivery?.address || undefined
        }
      },
      metadata: {
        order_id: order.id,
        product_id: product.id,
        seller: product.seller?.email || product.seller?.name || "",
        marketpro_seller_id: sellerUser.id
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      error: data.message || data.error || "Mercado Pago rechazo la creacion de la preferencia.",
      details: data
    };
  }
  return {
    ...data,
    marketProSellerUserId: sellerUser.id,
    sellerAccountId: sellerUser.mercadoPagoOAuth?.userId || ""
  };
};

const createPromotionPreference = async ({ promotion, product }) => {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    return {
      error: "Mercado Pago todavia no esta configurado. Agrega las credenciales reales para cobrar anuncios."
    };
  }

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_reference: promotion.id,
      notification_url: `${APP_BASE_URL}/api/payments/mercadopago/webhook`,
      back_urls: {
        success: `${APP_BASE_URL}/?promotion=success&product=${encodeURIComponent(product.id)}`,
        pending: `${APP_BASE_URL}/?promotion=pending&product=${encodeURIComponent(product.id)}`,
        failure: `${APP_BASE_URL}/?promotion=failure&product=${encodeURIComponent(product.id)}`
      },
      auto_return: "approved",
      items: [
        {
          id: promotion.id,
          title: `Anuncio destacado MarketPro - ${product.title}`,
          description: "Publicacion destacada en la pagina principal de MarketPro.",
          quantity: 1,
          currency_id: MERCADO_PAGO_CURRENCY,
          unit_price: 1
        }
      ],
      payer: {
        name: promotion.buyer?.name || "",
        email: promotion.buyer?.email || undefined
      },
      metadata: {
        type: "promotion",
        promotion_id: promotion.id,
        product_id: product.id,
        seller: product.seller?.email || product.seller?.name || ""
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      error: data.message || data.error || "Mercado Pago rechazo el anuncio.",
      details: data
    };
  }
  return data;
};

const ensureStore = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(defaultStore, null, 2));
  }
};

const readStore = () => {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    fs.writeFileSync(STORE_FILE, JSON.stringify(defaultStore, null, 2));
    return { ...defaultStore };
  }
};

const supabaseHeaders = (extra = {}) => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra
});

const ensurePrivateBucket = async () => {
  if (!hasSupabaseStore) return false;
  try {
    const bucketUrl = `${SUPABASE_URL}/storage/v1/bucket/${SUPABASE_PRIVATE_BUCKET}`;
    const existing = await fetch(bucketUrl, { headers: supabaseHeaders() });
    if (existing.ok) return true;
    const created = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        id: SUPABASE_PRIVATE_BUCKET,
        name: SUPABASE_PRIVATE_BUCKET,
        public: false,
        file_size_limit: 8388608,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp"]
      })
    });
    return created.ok || created.status === 409;
  } catch {
    return false;
  }
};

const parseDataUrl = (value = "") => {
  const match = String(value).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { contentType: match[1], bytes: Buffer.from(match[2], "base64") };
};

const uploadPrivateMedia = async (userId, kind, value) => {
  const parsed = parseDataUrl(value);
  if (!parsed) return null;
  const extension = parsed.contentType.includes("png") ? "png" : parsed.contentType.includes("webp") ? "webp" : "jpg";
  const objectPath = `${userId}/${kind}-${Date.now()}.${extension}`;
  if (hasSupabaseStore) {
    try {
      const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_PRIVATE_BUCKET}/${objectPath}`, {
        method: "POST",
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": parsed.contentType, "x-upsert": "true" },
        body: parsed.bytes
      });
      if (response.ok) return { provider: "supabase", path: objectPath, contentType: parsed.contentType };
    } catch {}
  }
  const encrypted = encryptSecret(value);
  return encrypted ? { provider: "encrypted", encrypted, contentType: parsed.contentType } : { provider: "legacy", value, contentType: parsed.contentType };
};

const privateMediaDataUrl = async (media) => {
  if (!media) return "";
  if (media.provider === "encrypted") return decryptSecret(media.encrypted);
  if (media.provider === "legacy") return media.value || "";
  if (media.provider === "supabase" && hasSupabaseStore) {
    try {
      const response = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${SUPABASE_PRIVATE_BUCKET}/${media.path}`, { headers: supabaseHeaders() });
      if (!response.ok) return "";
      const bytes = Buffer.from(await response.arrayBuffer());
      return `data:${media.contentType || "image/jpeg"};base64,${bytes.toString("base64")}`;
    } catch { return ""; }
  }
  return "";
};

const adminUser = async (user) => ({
  ...publicUser(user),
  profilePhoto: await privateMediaDataUrl(user.privateMedia?.profile) || (String(user.profilePhoto || "").startsWith("data:") ? user.profilePhoto : ""),
  documentPhoto: await privateMediaDataUrl(user.privateMedia?.document) || (String(user.documentPhoto || "").startsWith("data:") ? user.documentPhoto : "")
});

const loadStoreFromSupabase = async () => {
  if (!hasSupabaseStore) return null;
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_STORE_TABLE}?id=eq.${encodeURIComponent(SUPABASE_STORE_ID)}&select=store_data`;
  const response = await fetch(url, { headers: supabaseHeaders() });
  if (!response.ok) {
    throw new Error(`Supabase no pudo leer la memoria (${response.status})`);
  }
  const rows = await response.json();
  return rows?.[0]?.store_data || null;
};

const saveStoreToSupabase = async (nextStore) => {
  if (!hasSupabaseStore) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_STORE_TABLE}`, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      id: SUPABASE_STORE_ID,
      store_data: nextStore,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase no pudo guardar la memoria (${response.status}): ${details}`);
  }
};

const persistStoreToCloud = () => {
  if (!cloudStoreReady || !hasSupabaseStore) return;
  const snapshot = JSON.parse(JSON.stringify(store));
  cloudWriteQueue = cloudWriteQueue
    .catch(() => {})
    .then(() => saveStoreToSupabase(snapshot))
    .catch((error) => console.error("[MarketPro] Error guardando memoria en Supabase:", error.message));
};

const writeStore = () => {
  store.memory = store.memory || {};
  store.memory.updatedAt = new Date().toISOString();
  store.memory.driver = hasSupabaseStore ? "supabase" : "local-json";
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  persistStoreToCloud();
};

let store = readStore();
let listings = [];
let chats = [];
const internetPhotoFrom = (src) => {
  const cleanSrc = String(src || "").split("?")[0];
  const match = cleanSrc.match(/\/api\/(?:demo-photo|placeholder)\/([^/]+)\.svg$/);
  if (!match) return src;
  return internetPhotos[match[1]] || src;
};
const normalizeDemoImages = (items) =>
  items.map((item) => ({
    ...item,
    images: (item.images || []).map(internetPhotoFrom)
  }));
const normalizeChats = (items) =>
  items.map((chat) => {
    const seller = {
      id: chat.sellerId || chat.seller,
      name: chat.seller,
      email: "",
      avatar: chat.avatar
    };
    const buyer = {
      id: chat.buyerId || chat.buyer || "buyer-demo",
      name: chat.buyer || "Comprador",
      email: "",
      avatar: `/api/avatar/${encodeURIComponent(chat.buyer || "Comprador")}.svg`
    };
    return {
      ...chat,
      buyerId: chat.buyerId || buyer.id,
      sellerId: chat.sellerId || seller.id,
      participants: chat.participants || [buyer, seller],
      messages: (chat.messages || [])
        .filter((message) => message.text !== "Perfecto. Mantengamos todo por este chat y coordinemos en un punto publico.")
        .map((message, index) => ({
          id: message.id || `${chat.id}-legacy-${index}`,
          senderId: message.senderId || (message.from === "me" ? buyer.id : seller.id),
          senderName: message.senderName || (message.from === "me" ? buyer.name : seller.name),
          createdAt: message.createdAt || new Date().toISOString(),
          ...message
      }))
    };
  });

const hydrateRuntimeStore = (nextStore = {}) => {
  store = {
    ...defaultStore,
    ...nextStore,
    memory: {
      ...defaultStore.memory,
      ...(nextStore.memory || {})
    }
  };
  listings = store.products?.length ? store.products : [...products];
  chats = store.conversations?.length ? store.conversations : [...conversations];
  listings = normalizeDemoImages(listings);
  const duplicateCleanup = dedupeRapidListings(listings);
  listings = duplicateCleanup.listings;
  if (duplicateCleanup.removedIds.length) {
    store.memory.duplicateCleanup = {
      removed: duplicateCleanup.removedIds.length,
      ids: duplicateCleanup.removedIds,
      at: new Date().toISOString()
    };
  }
  chats = normalizeChats(chats).filter((chat) => !["chat-1", "chat-2"].includes(chat.id) && chat.buyerId !== "buyer-demo");
  store.products = listings;
  store.conversations = chats;
  store.orders = store.orders || [];
  store.reports = store.reports || [];
  store.supportTickets = store.supportTickets || [];
  store.blockedPairs = store.blockedPairs || [];
  store.promotions = store.promotions || [];
  store.users = store.users?.length ? store.users : [demoUser];
  store.currentUser = store.currentUser || null;
  store.verificationRequests = store.verificationRequests || [];
  store.sessions = store.sessions || [];
  store.authAttempts = store.authAttempts || {};
  store.passwordResets = store.passwordResets || [];
  store.oauthStates = store.oauthStates || [];
  store.notifications = store.notifications || [];
  store.adminAudit = store.adminAudit || [];
};

const initializePersistentStore = async () => {
  hydrateRuntimeStore(store);
  if (!hasSupabaseStore) {
    writeStore();
    console.log("[MarketPro] Memoria local activa. Configura Supabase para produccion.");
    return;
  }

  try {
    privateBucketReady = await ensurePrivateBucket();
    const cloudStore = await loadStoreFromSupabase();
    if (cloudStore) {
      hydrateRuntimeStore(cloudStore);
      console.log("[MarketPro] Memoria cargada desde Supabase.");
    } else {
      console.log("[MarketPro] Supabase vacio. Creando memoria inicial en la nube.");
      await saveStoreToSupabase(store);
    }
    cloudStoreReady = true;
    writeStore();
  } catch (error) {
    console.error("[MarketPro] No se pudo iniciar Supabase:", error.message);
    console.error("[MarketPro] La app seguira con memoria local hasta corregir credenciales/tabla.");
    writeStore();
  }
};

hydrateRuntimeStore(store);
writeStore();

app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");
  if (IS_PRODUCTION) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use("/vendor/gsap", express.static(path.join(__dirname, "node_modules", "gsap", "dist"), { maxAge: IS_PRODUCTION ? "30d" : 0 }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

["/privacy", "/support", "/security"].forEach((route) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });
});

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    name: "MarketPro",
    time: new Date().toISOString()
  });
});

const clean = (value, limit = 48) => String(value || "").replace(/[^a-z0-9 -]/gi, " ").trim().slice(0, limit);
const decodeHeader = (value, fallback = "") => {
  try {
    return decodeURIComponent(String(value || fallback));
  } catch {
    return String(value || fallback);
  }
};
const requestIdentity = (req) => {
  const user = authenticatedUser(req);
  if (user) return { id: user.id, name: user.name, email: user.email, avatar: `/api/avatar/${encodeURIComponent(user.name || "Usuario")}.svg` };
  return { id: "guest", name: "Invitado", email: "", avatar: "/mp-logo.svg" };
};

const sameOrderParty = (user, party = {}) => {
  if (!user) return false;
  const userEmail = String(user.email || "").trim().toLowerCase();
  const partyEmail = String(party.email || "").trim().toLowerCase();
  return Boolean(
    (userEmail && partyEmail && userEmail === partyEmail) ||
    (user.id && party.id && String(user.id) === String(party.id))
  );
};

const requireOrderRole = (req, res, order, role = "party") => {
  const user = authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Inicia sesion para gestionar esta orden." });
    return null;
  }
  const isBuyer = sameOrderParty(user, order.buyer);
  const isSeller = sameOrderParty(user, order.seller);
  const allowed = role === "buyer" ? isBuyer : role === "seller" ? isSeller : isBuyer || isSeller;
  if (!allowed) {
    res.status(403).json({ error: "Esta accion pertenece a otra persona de la orden." });
    return null;
  }
  return { user, isBuyer, isSeller };
};

const participantIds = (chat) =>
  new Set([
    chat.buyerId,
    chat.sellerId,
    ...(chat.participants || []).map((participant) => participant.id),
    ...(chat.participants || []).map((participant) => participant.email).filter(Boolean)
  ].filter(Boolean).map(String));

const isParticipant = (chat, identity) => {
  const ids = participantIds(chat);
  return ids.has(String(identity.id || "")) || (identity.email && ids.has(String(identity.email)));
};

const publicChatFor = (chat, identity) => {
  const other = (chat.participants || []).find((participant) => String(participant.id) !== String(identity.id));
  const blocked = (store.blockedPairs || []).some((item) =>
    item.chatId === chat.id && (item.by === identity.id || item.target === identity.id || item.byEmail === identity.email || item.targetEmail === identity.email)
  );
  return {
    ...chat,
    avatar: other?.avatar || chat.avatar,
    seller: chat.seller,
    blocked,
    otherParticipant: other || null
  };
};

const trackingRequiredFor = (carrier = "") =>
  /dac|ues|correo|mirtrans|depunta|agencia|transporte|envio/i.test(String(carrier || ""));

const ensureOrderConversation = (order) => {
  if (!order) return null;
  const existing = chats.find((chat) => chat.orderId === order.id);
  if (existing) {
    order.chatId = existing.id;
    return existing;
  }
  const seller = {
    id: String(order.seller?.email || order.seller?.name || ""),
    name: order.seller?.name || "Vendedor",
    email: order.seller?.email || "",
    avatar: order.seller?.avatar || "/mp-logo.svg"
  };
  const buyer = {
    id: String(order.buyer?.id || order.buyer?.email || order.buyer?.name || ""),
    name: order.buyer?.name || "Comprador",
    email: order.buyer?.email || "",
    phone: order.buyer?.phone || "",
    avatar: order.buyer?.avatar || `/api/avatar/${encodeURIComponent(order.buyer?.name || "Comprador")}.svg`
  };
  const chat = {
    id: `chat-order-${Date.now()}`,
    orderId: order.id,
    productId: order.productId,
    buyer: buyer.name,
    buyerId: buyer.id,
    seller: seller.name,
    sellerId: seller.id,
    productTitle: `Orden ${order.id} - ${order.productTitle}`,
    avatar: seller.avatar,
    participants: [buyer, seller],
    createdAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    messages: [
      {
        id: `msg-${Date.now()}-order-system`,
        from: "system",
        senderId: "system",
        senderName: "MarketPro",
        text: "Chat vinculado a la orden. No compartas el codigo de entrega antes de revisar el articulo.",
        time: new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }),
        createdAt: new Date().toISOString()
      }
    ]
  };
  chats = [chat, ...chats];
  store.conversations = chats;
  order.chatId = chat.id;
  return chat;
};

app.get("/api/demo-photo/:seed.svg", (req, res) => {
  const seed = clean(req.params.seed, 34) || "marketpro";
  const label = seed.replaceAll("-", " ");
  const lower = seed.toLowerCase();
  const palettes = {
    warm: ["#f7efe1", "#d9b15f", "#211812", "#fffaf0"],
    tech: ["#e9eef6", "#7d8ca4", "#151923", "#ffffff"],
    green: ["#e8f3ee", "#65a879", "#15382a", "#ffffff"],
    blue: ["#e8f0fb", "#5f8ecb", "#14213d", "#ffffff"],
    blush: ["#f7e8e6", "#d77a72", "#361916", "#fffafa"]
  };
  const palette = (() => {
    if (/(iphone|phone|macbook|laptop|switch|playstation|gaming|controller|dual)/.test(lower)) return palettes.tech;
    if (/(sofa|chair|mesa|table|office|wood|living|dining|apartment)/.test(lower)) return palettes.warm;
    if (/(bike|trek|mountain|dumbbell|gym|sport)/.test(lower)) return palettes.green;
    if (/(dress|jacket|fashion|leather|blue)/.test(lower)) return palettes.blush;
    return palettes.blue;
  })();
  const scene = (() => {
    if (/(civic|hilux|truck|car|pickup)/.test(lower)) {
      return `
        <rect x="0" y="410" width="900" height="290" fill="#d9d2c4"/>
        <path d="M0 420c144-72 284-80 420-26 164 65 306 48 480-34v340H0Z" fill="#b7c6ba"/>
        <rect x="116" y="378" width="650" height="34" rx="17" fill="#f2f1ec" opacity=".86"/>
        <g filter="url(#softShadow)">
          <path d="M190 376c34-72 94-119 178-138h170c70 17 122 64 158 138l38 18c25 12 42 37 42 65v16c0 19-15 34-34 34H168c-19 0-34-15-34-34v-18c0-28 16-53 42-65l14-16Z" fill="#1a1a1b"/>
          <path d="M266 365l65-83h191l86 83H266Z" fill="#f2d57a"/>
          <rect x="352" y="294" width="148" height="54" rx="10" fill="#dce8f1"/>
          <rect x="543" y="370" width="98" height="20" rx="10" fill="#fff4b8" opacity=".9"/>
          <circle cx="272" cy="510" r="54" fill="#111"/>
          <circle cx="626" cy="510" r="54" fill="#111"/>
          <circle cx="272" cy="510" r="24" fill="#d7d7d7"/>
          <circle cx="626" cy="510" r="24" fill="#d7d7d7"/>
        </g>`;
    }
    if (/(apartment)/.test(lower)) {
      return `
        <rect x="86" y="96" width="728" height="486" rx="34" fill="#f6efe4"/>
        <rect x="128" y="134" width="280" height="318" rx="22" fill="#b8c6d5"/>
        <path d="M128 318h280v134H128Z" fill="#e9ded0"/>
        <rect x="466" y="156" width="260" height="46" rx="23" fill="#211812" opacity=".16"/>
        <rect x="468" y="230" width="206" height="32" rx="16" fill="#211812" opacity=".12"/>
        <rect x="490" y="340" width="246" height="112" rx="24" fill="#fffaf0"/>
        <rect x="526" y="304" width="160" height="62" rx="20" fill="#d9b15f"/>
        <circle cx="214" cy="240" r="38" fill="#fff4c1" opacity=".8"/>
        <path d="M172 452h548l-68 70H232Z" fill="#d4c3ad"/>`;
    }
    if (/(iphone|phone)/.test(lower)) {
      return `
        <rect x="0" y="438" width="900" height="262" fill="#c8b8a0"/>
        <ellipse cx="450" cy="492" rx="248" ry="44" fill="#111827" opacity=".18"/>
        <g filter="url(#softShadow)">
          <rect x="338" y="116" width="224" height="386" rx="46" fill="#0e1118"/>
          <rect x="363" y="160" width="174" height="284" rx="26" fill="url(#screenGrad)"/>
          <circle cx="450" cy="468" r="13" fill="#f8fafc" opacity=".9"/>
          <rect x="408" y="138" width="84" height="9" rx="5" fill="#505968"/>
          <circle cx="520" cy="138" r="8" fill="#222b3a"/>
        </g>
        <rect x="178" y="414" width="154" height="24" rx="12" fill="#fff" opacity=".54"/>
        <rect x="594" y="390" width="112" height="20" rx="10" fill="#fff" opacity=".44"/>`;
    }
    if (/(macbook|laptop)/.test(lower)) {
      return `
        <rect x="0" y="430" width="900" height="270" fill="#d6c5ad"/>
        <g filter="url(#softShadow)">
          <rect x="228" y="156" width="444" height="286" rx="24" fill="#151923"/>
          <rect x="258" y="190" width="384" height="210" rx="14" fill="url(#screenGrad)"/>
          <path d="M172 454h556l-48 70H220l-48-70Z" fill="#d9dee6"/>
          <rect x="392" y="468" width="116" height="12" rx="6" fill="#a4adbb"/>
        </g>
        <circle cx="716" cy="376" r="44" fill="#fff" opacity=".38"/>`;
    }
    if (/(sofa|chair|mesa|table|office|wood|living|dining)/.test(lower)) {
      return `
        <rect x="0" y="0" width="900" height="700" fill="#eee2d1"/>
        <rect x="0" y="422" width="900" height="278" fill="#cab79a"/>
        <rect x="114" y="118" width="252" height="186" rx="20" fill="#fff8eb"/>
        <rect x="532" y="108" width="180" height="220" rx="90" fill="#d2b36f" opacity=".34"/>
        <g filter="url(#softShadow)">
          <rect x="214" y="350" width="472" height="124" rx="32" fill="#2d2a27"/>
          <rect x="248" y="264" width="158" height="120" rx="28" fill="#5e5a52"/>
          <rect x="496" y="264" width="158" height="120" rx="28" fill="#5e5a52"/>
          <rect x="270" y="474" width="34" height="58" rx="13" fill="#171513"/>
          <rect x="596" y="474" width="34" height="58" rx="13" fill="#171513"/>
        </g>`;
    }
    if (/(bike|trek|mountain)/.test(lower)) {
      return `
        <rect x="0" y="0" width="900" height="700" fill="#dbe9de"/>
        <path d="M0 410c176-110 364-122 900-42v332H0Z" fill="#9eba93"/>
        <g filter="url(#softShadow)">
          <circle cx="300" cy="428" r="86" fill="none" stroke="#101010" stroke-width="20"/>
          <circle cx="608" cy="428" r="86" fill="none" stroke="#101010" stroke-width="20"/>
          <path d="M300 428l120-156 104 156H300Zm120-156l188 156m-188-156h128" fill="none" stroke="#17452f" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M506 238h82m-204 0h-64" stroke="#101010" stroke-width="19" stroke-linecap="round"/>
        </g>`;
    }
    if (/(switch|playstation|gaming|controller|dual)/.test(lower)) {
      return `
        <rect x="0" y="426" width="900" height="274" fill="#b8a88f"/>
        <g filter="url(#softShadow)">
          <rect x="210" y="238" width="480" height="214" rx="54" fill="#111827"/>
          <circle cx="320" cy="346" r="44" fill="#dbe6f6"/>
          <circle cx="574" cy="322" r="17" fill="#fff"/>
          <circle cx="620" cy="362" r="17" fill="#fff"/>
          <rect x="392" y="286" width="116" height="104" rx="18" fill="#273247"/>
        </g>
        <rect x="126" y="496" width="648" height="22" rx="11" fill="#fff" opacity=".34"/>`;
    }
    if (/(lego|toy|box)/.test(lower)) {
      return `
        <rect x="0" y="426" width="900" height="274" fill="#d8c5a4"/>
        <g filter="url(#softShadow)">
          <rect x="242" y="176" width="416" height="316" rx="34" fill="#b91c1c"/>
          <circle cx="334" cy="274" r="42" fill="#facc15"/>
          <circle cx="450" cy="274" r="42" fill="#facc15"/>
          <circle cx="566" cy="274" r="42" fill="#facc15"/>
          <rect x="310" y="366" width="280" height="60" rx="18" fill="#fff" opacity=".92"/>
        </g>`;
    }
    if (/(dress|jacket|fashion|leather|blue)/.test(lower)) {
      return `
        <rect x="0" y="0" width="900" height="700" fill="#f2e4e3"/>
        <rect x="318" y="88" width="264" height="520" rx="132" fill="#fff" opacity=".44"/>
        <g filter="url(#softShadow)">
          <path d="M450 132l92 92-56 58 104 244H310l104-244-56-58 92-92Z" fill="#151515"/>
          <path d="M450 132l46 82-46 54-46-54 46-82Z" fill="#d77a72"/>
          <rect x="374" y="526" width="152" height="30" rx="15" fill="#111827" opacity=".16"/>
        </g>`;
    }
    if (/(dumbbell|gym|sport)/.test(lower)) {
      return `
        <rect x="0" y="438" width="900" height="262" fill="#bec9bf"/>
        <g filter="url(#softShadow)">
          <rect x="252" y="334" width="396" height="44" rx="22" fill="#111827"/>
          <rect x="190" y="280" width="82" height="152" rx="22" fill="#15382a"/>
          <rect x="628" y="280" width="82" height="152" rx="22" fill="#15382a"/>
          <rect x="292" y="306" width="58" height="100" rx="18" fill="#65a879"/>
          <rect x="550" y="306" width="58" height="100" rx="18" fill="#65a879"/>
        </g>`;
    }
    return `
      <rect x="0" y="438" width="900" height="262" fill="#d8c7ad"/>
      <g filter="url(#softShadow)">
        <rect x="272" y="166" width="356" height="330" rx="42" fill="${palette[2]}"/>
        <circle cx="450" cy="310" r="82" fill="${palette[1]}"/>
        <rect x="332" y="424" width="236" height="46" rx="23" fill="#fff" opacity=".88"/>
      </g>`;
  })();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 700">
      <defs>
        <linearGradient id="photoBg" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${palette[0]}"/>
          <stop offset=".62" stop-color="${palette[3]}"/>
          <stop offset="1" stop-color="${palette[1]}"/>
        </linearGradient>
        <linearGradient id="screenGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#eef4ff"/>
          <stop offset=".48" stop-color="#8ba3c7"/>
          <stop offset="1" stop-color="#273247"/>
        </linearGradient>
        <filter id="softShadow" x="-24%" y="-24%" width="148%" height="148%">
          <feDropShadow dx="0" dy="24" stdDeviation="26" flood-color="#111827" flood-opacity=".24"/>
        </filter>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed.length}"/>
          <feColorMatrix type="saturate" values="0"/>
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 .08"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <rect width="900" height="700" fill="url(#photoBg)"/>
      <rect width="900" height="700" filter="url(#grain)" opacity=".55"/>
      <rect x="54" y="54" width="792" height="592" rx="42" fill="none" stroke="#ffffff" stroke-opacity=".5"/>
      ${scene}
      <rect x="0" y="0" width="900" height="700" fill="url(#photoBg)" opacity=".08"/>
      <rect x="682" y="62" width="128" height="34" rx="17" fill="#ffffff" opacity=".58"/>
      <text x="746" y="84" text-anchor="middle" fill="#121212" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="850" opacity=".7">MarketPro</text>
    </svg>`;
  res.type("image/svg+xml").send(svg);
});

app.get("/api/placeholder/:seed.svg", (req, res) => {
  const seed = clean(req.params.seed, 34) || "marketpro";
  const label = seed.replaceAll("-", " ");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 700">
      <rect width="900" height="700" fill="#f4f5f6"/>
      <rect x="88" y="92" width="724" height="516" rx="34" fill="#fff"/>
      <rect x="138" y="138" width="624" height="326" rx="26" fill="#111"/>
      <circle cx="244" cy="246" r="74" fill="#ffd21f"/>
      <rect x="360" y="194" width="314" height="40" rx="20" fill="#ffd21f"/>
      <rect x="360" y="260" width="252" height="34" rx="17" fill="#fff" opacity=".86"/>
      <text x="450" y="632" text-anchor="middle" fill="#111827" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="800">${label}</text>
    </svg>`;
  res.type("image/svg+xml").send(svg);
});

app.get("/api/avatar/:name.svg", (req, res) => {
  const name = clean(req.params.name, 40);
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="48" fill="#090909"/>
      <circle cx="72" cy="22" r="28" fill="#ffd21f"/>
      <text x="48" y="58" text-anchor="middle" fill="#fff" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="800">${initials}</text>
    </svg>`;
  res.type("image/svg+xml").send(svg);
});

app.get("/api/products", (_req, res) => {
  res.json(listings.filter(isPublicListing).map((product) => ({
    ...product,
    seller: {
      ...product.seller,
      mercadoPagoConnected: Boolean(sellerUserFor(product.seller)?.mercadoPagoOAuth?.accessTokenEncrypted)
    }
  })));
});

app.get("/api/conversations", (req, res) => {
  if (!authenticatedUser(req)) return res.json([]);
  const identity = requestIdentity(req);
  res.json(chats.filter((chat) => isParticipant(chat, identity)).map((chat) => publicChatFor(chat, identity)));
});

app.get("/api/orders", (req, res) => {
  const user = authenticatedUser(req);
  if (!user) return res.json([]);
  res.json((store.orders || []).filter((order) => sameOrderParty(user, order.buyer) || sameOrderParty(user, order.seller)));
});

app.get("/api/notifications", (req, res) => {
  const user = authenticatedUser(req);
  if (!user) return res.json([]);
  const email = String(user.email || "").toLowerCase();
  res.json((store.notifications || []).filter((item) => item.email === email).slice(0, 60));
});

app.post("/api/notifications/:id/read", (req, res) => {
  const user = authenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Sesion requerida" });
  const notice = (store.notifications || []).find((item) => item.id === req.params.id && item.email === String(user.email || "").toLowerCase());
  if (!notice) return res.status(404).json({ error: "Alerta no encontrada" });
  notice.read = true;
  writeStore();
  res.json(notice);
});

app.get("/api/user", (req, res) => {
  res.json(publicUser(authenticatedUser(req)));
});

app.delete("/api/user", (req, res) => {
  const user = authenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Sesion requerida" });
  const email = String(user.email || "").toLowerCase();
  const userId = user.id;
  store.users = (store.users || []).filter((item) => item.id !== userId && String(item.email || "").toLowerCase() !== email);
  store.sessions = (store.sessions || []).filter((session) => session.userId !== userId && String(session.email || "").toLowerCase() !== email);
  store.verificationRequests = (store.verificationRequests || []).filter((request) => request.userId !== userId);
  listings = listings.map((product) =>
    String(product.seller?.email || "").toLowerCase() === email || product.seller?.name === user.name
      ? { ...product, status: "paused", hiddenReason: "Cuenta eliminada por el usuario" }
      : product
  );
  chats = chats.map((chat) =>
    isParticipant(chat, { id: userId, email })
      ? { ...chat, archived: true, archivedReason: "Cuenta eliminada por un participante" }
      : chat
  );
  store.products = listings;
  store.conversations = chats;
  store.accountDeletionLog = [
    { userId, email, deletedAt: new Date().toISOString(), action: "Cuenta eliminada y publicaciones pausadas" },
    ...(store.accountDeletionLog || []).slice(0, 100)
  ];
  writeStore();
  res.json({ ok: true });
});

app.post("/api/user", rateLimit({ windowMs: 15 * 60 * 1000, max: 8, key: "register" }), async (req, res) => {
  const required = ["name", "email", "password", "phone", "cedula", "exactLocation", "profilePhoto", "documentPhoto"];
  const missing = required.filter((field) => !req.body[field]);
  if (missing.length) return res.status(400).json({ error: "Faltan datos de verificacion", fields: missing });
  if (!/@gmail\.com$/i.test(String(req.body.email || "").trim())) {
    return res.status(400).json({ error: "Usa un Gmail valido para crear la cuenta segura" });
  }
  if (String(req.body.password || "").length < 8) {
    return res.status(400).json({ error: "La contrasena debe tener al menos 8 caracteres" });
  }

  const email = String(req.body.email).trim().toLowerCase();
  const existing = userByEmail(email);
  if (existing && !verifyPassword(req.body.password, existing)) {
    return res.status(401).json({ error: "La contrasena no coincide con esa cuenta" });
  }
  const password = existing?.passwordHash
    ? { passwordHash: existing.passwordHash, passwordSalt: existing.passwordSalt, passwordAlgorithm: existing.passwordAlgorithm }
    : hashPassword(req.body.password);

  const userId = existing?.id || req.body.id || `user-${Date.now()}`;
  const [profileMedia, documentMedia] = await Promise.all([
    uploadPrivateMedia(userId, "profile", req.body.profilePhoto),
    uploadPrivateMedia(userId, "document-front", req.body.documentPhoto)
  ]);
  const user = {
    id: userId,
    name: req.body.name,
    email,
    phone: req.body.phone,
    cedula: req.body.cedula,
    exactLocation: req.body.exactLocation,
    profilePhoto: `/api/avatar/${encodeURIComponent(req.body.name)}.svg`,
    documentPhoto: true,
    privateMedia: {
      profile: profileMedia || existing?.privateMedia?.profile || null,
      document: documentMedia || existing?.privateMedia?.document || null
    },
    authComplete: true,
    verified: existing?.verified || false,
    verificationStatus: String(existing?.verificationStatus || "").toLowerCase().includes("rechaz")
      ? existing.verificationStatus
      : existing?.verified
        ? existing.verificationStatus
        : "Pendiente de revision",
    balance: Number(existing?.balance || req.body.balance || 0),
    pendingBalance: Number(existing?.pendingBalance || req.body.pendingBalance || 0),
    mercadoPagoOAuth: existing?.mercadoPagoOAuth || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...password
  };

  store.users = [user, ...store.users.filter((item) => String(item.email || "").toLowerCase() !== user.email)];
  store.verificationRequests = [
    {
      id: `verify-${Date.now()}`,
      userId: user.id,
      status: "Pendiente",
      submittedAt: new Date().toISOString()
    },
    ...store.verificationRequests.filter((item) => item.userId !== user.id)
  ];
  const session = createUserSession(user, req);
  notifyUser(user.email, "Verificacion recibida", "Tu identidad quedo en revision. Te avisaremos cuando el administrador termine el control.", "verification", "/?page=profile");
  writeStore();
  res.status(201).json({ ...publicUser(user), sessionToken: session.token });
});

app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 12, key: "login" }), (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const password = String(req.body.password || "");
  if (!email || !password) return res.status(400).json({ error: "Gmail y contrasena son obligatorios." });
  const attempt = authAttemptState(email);
  if (attempt.lockedUntil && new Date(attempt.lockedUntil).getTime() > Date.now()) {
    return res.status(429).json({ error: "Cuenta bloqueada temporalmente por intentos fallidos. Intenta nuevamente en 15 minutos." });
  }
  const user = userByEmail(email);
  if (!user || !verifyPassword(password, user)) {
    recordFailedLogin(email);
    writeStore();
    return res.status(401).json({ error: "Gmail o contrasena incorrectos." });
  }
  clearFailedLogin(email);
  if (!user.passwordAlgorithm) Object.assign(user, hashPassword(password));
  const session = createUserSession(user, req);
  writeStore();
  res.json({ ...publicUser(user), sessionToken: session.token });
});

app.post("/api/auth/logout", (req, res) => {
  const token = authTokenFrom(req);
  const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
  store.sessions = (store.sessions || []).filter((session) => session.token !== token && session.tokenHash !== tokenHash);
  writeStore();
  res.json({ ok: true });
});

app.post("/api/payments/mercadopago/oauth/start", (req, res) => {
  const user = authenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Inicia sesion para conectar Mercado Pago." });
  if (!user.verified) return res.status(403).json({ error: "Tu identidad debe estar aprobada antes de conectar cobros." });
  if (!mercadoPagoOAuthReady()) {
    return res.status(503).json({ error: "La conexion de vendedores con Mercado Pago todavia no fue configurada por MarketPro." });
  }
  const stateToken = crypto.randomBytes(32).toString("hex");
  store.oauthStates = [
    { state: stateToken, userId: user.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() },
    ...(store.oauthStates || []).filter((item) => new Date(item.expiresAt).getTime() > Date.now()).slice(0, 100)
  ];
  writeStore();
  const authorizationUrl = new URL(MERCADO_PAGO_OAUTH_AUTHORIZE_URL);
  authorizationUrl.searchParams.set("client_id", MERCADO_PAGO_CLIENT_ID);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("platform_id", "mp");
  authorizationUrl.searchParams.set("state", stateToken);
  authorizationUrl.searchParams.set("redirect_uri", MERCADO_PAGO_OAUTH_REDIRECT_URI);
  res.json({ url: authorizationUrl.toString() });
});

app.get("/api/payments/mercadopago/oauth/callback", async (req, res) => {
  const stateToken = String(req.query.state || "");
  const code = String(req.query.code || "");
  const oauthState = (store.oauthStates || []).find((item) => item.state === stateToken);
  store.oauthStates = (store.oauthStates || []).filter((item) => item.state !== stateToken && new Date(item.expiresAt).getTime() > Date.now());
  if (!oauthState || new Date(oauthState.expiresAt).getTime() < Date.now() || !code) {
    writeStore();
    return res.redirect("/?mp=error&page=profile");
  }
  const user = (store.users || []).find((item) => item.id === oauthState.userId);
  if (!user) {
    writeStore();
    return res.redirect("/?mp=error&page=profile");
  }
  const token = await exchangeMercadoPagoToken({
    client_id: MERCADO_PAGO_CLIENT_ID,
    client_secret: MERCADO_PAGO_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: MERCADO_PAGO_OAUTH_REDIRECT_URI
  });
  if (token.error) {
    writeStore();
    return res.redirect("/?mp=error&page=profile");
  }
  user.mercadoPagoOAuth = {
    accessTokenEncrypted: encryptSecret(token.access_token),
    refreshTokenEncrypted: encryptSecret(token.refresh_token || ""),
    userId: String(token.user_id || ""),
    publicKey: String(token.public_key || ""),
    scope: String(token.scope || ""),
    expiresAt: new Date(Date.now() + Number(token.expires_in || 15552000) * 1000).toISOString(),
    connectedAt: new Date().toISOString()
  };
  writeStore();
  res.redirect("/?mp=connected&page=profile");
});

app.delete("/api/payments/mercadopago/oauth/connection", (req, res) => {
  const user = authenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Inicia sesion para modificar esta conexion." });
  user.mercadoPagoOAuth = null;
  writeStore();
  res.json({ ok: true, mercadoPago: { connected: false, accountId: "", connectedAt: "" } });
});

app.post("/api/auth/password-reset/request", rateLimit({ windowMs: 30 * 60 * 1000, max: 5, key: "password-reset" }), async (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const user = userByEmail(email);
  if (!user) return res.json({ ok: true, message: "Si la cuenta existe, se genero un codigo de recuperacion." });
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  store.passwordResets = [
    { email, code, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1000 * 60 * 20).toISOString(), used: false },
    ...(store.passwordResets || []).filter((item) => item.email !== email).slice(0, 10)
  ];
  writeStore();
  const emailResult = await sendEmail({
    to: email,
    subject: "Codigo para recuperar tu cuenta MarketPro",
    html: `<p>Tu codigo de recuperacion es:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Vence en 20 minutos. Si no lo pediste, ignora este mensaje.</p>`
  });
  res.json({
    ok: true,
    message: emailResult.sent ? "Te enviamos el codigo por email." : "Codigo generado. El servicio de correo aun no esta configurado.",
    ...(IS_PRODUCTION ? {} : { demoCode: code })
  });
});

app.post("/api/auth/password-reset/confirm", (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const code = String(req.body.code || "").trim().toUpperCase();
  const password = String(req.body.password || "");
  if (password.length < 8) return res.status(400).json({ error: "La nueva contrasena debe tener al menos 8 caracteres." });
  const reset = (store.passwordResets || []).find((item) => item.email === email && item.code === code && !item.used);
  if (!reset || new Date(reset.expiresAt).getTime() < Date.now()) return res.status(400).json({ error: "Codigo invalido o vencido." });
  const user = userByEmail(email);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
  Object.assign(user, hashPassword(password));
  reset.used = true;
  store.sessions = (store.sessions || []).filter((session) => session.email !== email);
  clearFailedLogin(email);
  writeStore();
  res.json({ ok: true, message: "Contrasena actualizada. Ya puedes iniciar sesion." });
});

app.get("/api/seller-dashboard", (_req, res) => {
  const user = authenticatedUser(_req);
  if (!user) return res.status(401).json({ error: "Sesion requerida" });
  const mine = listings.filter((item) => item.seller?.email === user.email || item.seller?.name === user.name);
  const sold = mine.filter((item) => item.status === "sold");
  const active = mine.filter((item) => item.status !== "sold");
  const soldTotal = sold.reduce((sum, item) => sum + Number(item.price || 0), 0);
  res.json({
    user: publicUser(user),
    stats: {
      active: active.length,
      sold: sold.length,
      grossSales: soldTotal,
      balance: 0,
      pendingBalance: 0,
      directPayments: true,
      mercadoPagoConnected: Boolean(user.mercadoPagoOAuth?.accessTokenEncrypted),
      securityScore: user.verified ? 98 : 42
    },
    listings: mine
  });
});

const requireAdmin = (req, res, next) => {
  const token = String(req.headers.authorization || "").replace("Bearer ", "");
  if (!adminTokens.has(token)) return res.status(401).json({ error: "Acceso admin no autorizado" });
  next();
};

app.post("/api/admin/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 8, key: "admin-login" }), (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: "El acceso administrativo todavía no está configurado." });
  }
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  if (!validTotp(req.body.code)) return res.status(401).json({ error: "Codigo de seguridad incorrecto" });
  const token = crypto.randomBytes(24).toString("hex");
  adminTokens.add(token);
  adminAudit(req, "admin_login", { twoFactor: Boolean(ADMIN_TOTP_SECRET) });
  writeStore();
  res.json({ token, twoFactor: Boolean(ADMIN_TOTP_SECRET) });
});

app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
  const users = await Promise.all(store.users.map(async (user) => ({
    ...await adminUser(user),
    listings: listings.filter((item) => isRealListing(item) && (item.seller?.email === user.email || item.seller?.name === user.name)).length
  })));
  res.json({
    users,
    verificationRequests: store.verificationRequests,
    products: listings.filter(isRealListing),
    conversations: chats,
    orders: store.orders || [],
    reports: store.reports || [],
    supportTickets: store.supportTickets || [],
    blockedPairs: store.blockedPairs || [],
    adminAudit: store.adminAudit || [],
    security: { twoFactorEnabled: Boolean(ADMIN_TOTP_SECRET), emailEnabled: Boolean(RESEND_API_KEY), privateStorageEnabled: privateBucketReady },
    memory: store.memory
  });
});

app.get("/api/admin/innovations", requireAdmin, (_req, res) => {
  res.json({
    active: true,
    activeCount: privateInnovations.length,
    total: privateInnovations.length,
    items: privateInnovations.map(([title, text, group], index) => ({
      id: `mp-active-${String(index + 1).padStart(2, "0")}`,
      title,
      text,
      group,
      status: "Activa",
      visibility: "Privada admin"
    }))
  });
});

app.post("/api/admin/simulate/antifraud-purchase", requireAdmin, (req, res) => {
  if (IS_PRODUCTION && process.env.ALLOW_ADMIN_SIMULATION !== "true") {
    return res.status(403).json({ error: "La simulacion privada esta desactivada en produccion." });
  }

  const product = listings.find((item) => item.status !== "sold") || listings[0];
  if (!product) return res.status(404).json({ error: "No hay productos para simular una compra." });

  const buyer = {
    name: req.body?.buyer?.name || "Comprador Simulado",
    email: req.body?.buyer?.email || "comprador.simulado@gmail.com",
    phone: req.body?.buyer?.phone || "099000000"
  };
  const delivery = {
    address: req.body?.delivery?.address || "Av. Principal 1234",
    city: req.body?.delivery?.city || "Montevideo",
    phone: req.body?.delivery?.phone || buyer.phone,
    method: req.body?.delivery?.method || "Entrega coordinada"
  };
  const deliveryCode = generateUniqueDeliveryCode();
  const securityStamp = buildSecurityStamp(product, { body: { buyer } });
  const now = new Date().toISOString();
  const wrongCode = `${deliveryCode.slice(0, -1)}0` === deliveryCode ? `${deliveryCode.slice(0, -1)}1` : `${deliveryCode.slice(0, -1)}0`;

  const order = {
    id: `sim-order-${Date.now()}`,
    simulation: true,
    productId: product.id,
    productTitle: product.title,
    amount: product.price,
    currency: MERCADO_PAGO_CURRENCY,
    status: "Simulacion - pago directo confirmado",
    paymentMethod: "mercadopago",
    buyer,
    seller: product.seller,
    snapshot: {
      productId: product.id,
      title: product.title,
      price: product.price,
      category: product.category,
      condition: product.condition,
      seller: product.seller,
      images: product.images,
      description: product.description
    },
    delivery: {
      ...delivery,
      code: deliveryCode,
      status: "Pendiente de despacho",
      sellerProofRequired: true,
      buyerConfirmationRequired: true,
      inspectionWindowHours: securityStamp.riskLevel === "Alto" ? 72 : 48,
      sellerProof: null,
      buyerInspection: null,
      timeline: [
        { event: "Orden simulada creada", at: now },
        { event: "Pago Mercado Pago simulado como aprobado", at: now }
      ]
    },
    security: {
      stamp: securityStamp,
      identityChecked: true,
      sellerVerified: Boolean(product.seller?.verified ?? true),
      buyerAcceptedRules: true,
      buyerDeclaredInspection: true,
      disputeWindowHours: securityStamp.riskLevel === "Alto" ? 72 : 48,
      paymentRule: "Simulacion privada: Mercado Pago procesa el dinero directamente para el vendedor; el codigo solo confirma entrega.",
      antiFraud: [
        "Codigo falso rechazado.",
        "Evidencia del vendedor requerida antes de confirmar.",
        "Checklist del comprador requerido antes de cerrar la entrega.",
        "Una incidencia crea evidencia para reclamar en Mercado Pago.",
        "Huella de publicacion congela precio, fotos y descripcion."
      ],
      auditTrail: [
        { event: "Simulacion creada por admin", at: now },
        { event: "Publicacion congelada", at: securityStamp.frozenAt },
        { event: `Riesgo ${securityStamp.riskLevel}`, at: now }
      ]
    },
    deliveryConfirmation: {
      status: "Pendiente de recepcion",
      code: deliveryCode,
      confirmedAt: "",
      confirmedBy: "",
      note: "El codigo confirma la entrega y no mueve dinero."
    },
    createdAt: now,
    mercadoPago: {
      enabled: true,
      preferenceId: "simulated-preference",
      checkoutUrl: "",
      publicKeyConfigured: Boolean(MERCADO_PAGO_PUBLIC_KEY),
      status: "Simulado sin cobro real",
      note: "No se llamo a Mercado Pago ni se proceso dinero real.",
      sellerDirectPayment: true
    },
    disputes: []
  };

  const wrongCodeRejected = wrongCode.toUpperCase() !== order.delivery.code;
  const sellerProof = {
    packageNotes: "Caja cerrada, producto visible y embalaje fotografiado.",
    serialOrMark: "SERIE-SIM-001",
    accessories: "Accesorios declarados completos.",
    photos: [],
    declaredAt: new Date().toISOString()
  };
  order.delivery.sellerProof = sellerProof;
  order.delivery.status = "Evidencia del vendedor cargada";
  order.delivery.tracking = {
    method: delivery.method,
    trackingCode: "DAC-SIM-001",
    carrier: "DAC",
    note: "Despacho simulado para validar protocolo con rastreo obligatorio.",
    trackingRequired: true,
    markedAt: new Date().toISOString()
  };
  order.delivery.status = "En camino";
  order.delivery.confirmedAt = new Date().toISOString();
  order.delivery.buyerInspection = {
    checklist: {
      identityMatched: true,
      packageIntact: true,
      itemMatches: true,
      accessoriesMatch: true,
      conditionAccepted: true
    },
    conditionNote: "Producto coincide con publicacion congelada.",
    evidence: "Revision simulada aprobada.",
    confirmedAt: order.delivery.confirmedAt
  };
  order.deliveryConfirmation = {
    ...order.deliveryConfirmation,
    status: "Confirmada",
    confirmedAt: order.delivery.confirmedAt,
    confirmedBy: buyer.email,
    note: "Recepcion simulada validada con codigo unico y checklist completo."
  };
  order.status = "Simulacion completada - entrega confirmada";
  order.delivery.status = "Completada";
  order.delivery.timeline = [
    ...(order.delivery.timeline || []),
    { event: "Vendedor cargo evidencia previa", at: sellerProof.declaredAt },
    { event: "Entrega marcada en camino", at: order.delivery.tracking.markedAt },
    { event: "Intento con codigo falso rechazado", at: new Date().toISOString() },
    { event: "Comprador confirmo con checklist y codigo correcto", at: order.delivery.confirmedAt }
  ];
  order.security.auditTrail = [
    ...(order.security.auditTrail || []),
    { event: "Codigo falso no coincide con codigo unico", at: new Date().toISOString() },
    { event: "Checklist completo antes de cerrar entrega", at: order.delivery.confirmedAt },
    { event: "Codigo confirmo entrega sin intervenir en el pago", at: order.delivery.confirmedAt }
  ];

  store.orders = [order, ...(store.orders || [])].slice(0, 500);
  ensureOrderConversation(order);
  store.orders = store.orders.map((item) => item.id === order.id ? order : item);
  writeStore();
  res.status(201).json({
    order,
    checks: {
      uniqueCodeCreated: Boolean(deliveryCode) && !(store.orders || []).slice(1).some((item) => item.delivery?.code === deliveryCode),
      wrongCodeRejected,
      sellerProofRequired: Boolean(order.delivery.sellerProofRequired && order.delivery.sellerProof),
      buyerChecklistRequired: Boolean(order.delivery.buyerInspection?.checklist?.itemMatches),
      disputeCreatesClaimEvidence: true,
      deliveryClosedOnlyAfterCode: order.deliveryConfirmation.status === "Confirmada" && wrongCodeRejected,
      paymentUntouchedByDeliveryCode: true,
      noRealCharge: order.mercadoPago.status === "Simulado sin cobro real",
      fingerprintCreated: Boolean(order.security?.stamp?.productFingerprint)
    }
  });
});

const mercadoPagoConfigStatus = () => {
  const checks = [
    ["OAuth Client ID", Boolean(MERCADO_PAGO_CLIENT_ID), "MERCADO_PAGO_CLIENT_ID"],
    ["OAuth Client Secret", Boolean(MERCADO_PAGO_CLIENT_SECRET), "MERCADO_PAGO_CLIENT_SECRET"],
    ["Cifrado de tokens", Boolean(TOKEN_ENCRYPTION_KEY), "TOKEN_ENCRYPTION_KEY"],
    ["Webhook secret", Boolean(MERCADO_PAGO_WEBHOOK_SECRET), "MERCADO_PAGO_WEBHOOK_SECRET"],
    ["URL publica", /^https:\/\//.test(APP_BASE_URL), "APP_BASE_URL debe ser https en produccion"],
    ["Redirect OAuth", /^https:\/\//.test(MERCADO_PAGO_OAUTH_REDIRECT_URI), "MERCADO_PAGO_OAUTH_REDIRECT_URI"],
    ["Cobro de anuncios", Boolean(MERCADO_PAGO_ACCESS_TOKEN), "MERCADO_PAGO_ACCESS_TOKEN"]
  ];
  return {
    ready: checks.every((item) => item[1]),
    sellerPaymentsReady: mercadoPagoOAuthReady() && Boolean(MERCADO_PAGO_WEBHOOK_SECRET) && /^https:\/\//.test(APP_BASE_URL),
    adsReady: Boolean(MERCADO_PAGO_ACCESS_TOKEN),
    appBaseUrl: APP_BASE_URL,
    currency: MERCADO_PAGO_CURRENCY,
    webhookUrl: `${APP_BASE_URL}/api/payments/mercadopago/webhook`,
    checks: checks.map(([label, ok, hint]) => ({ label, ok, hint }))
  };
};

app.get("/api/admin/mercadopago/status", requireAdmin, (_req, res) => {
  res.json(mercadoPagoConfigStatus());
});

app.post("/api/admin/conversations/purge-seed", requireAdmin, (_req, res) => {
  const before = chats.length;
  chats = chats.filter((chat) => !["chat-1", "chat-2"].includes(chat.id) && chat.buyerId !== "buyer-demo");
  store.conversations = chats;
  writeStore();
  res.json({ removed: before - chats.length, remaining: chats.length });
});

app.post("/api/admin/mercadopago/test-preference", requireAdmin, async (_req, res) => {
  const config = mercadoPagoConfigStatus();
  if (!config.ready) {
    return res.status(400).json({
      error: "Mercado Pago todavia no esta listo. Completa las credenciales y APP_BASE_URL en .env.",
      config
    });
  }
  const testPromotion = { id: `mp-test-${Date.now()}`, amount: 1 };
  const testProduct = {
    id: "marketpro-test",
    title: "Prueba de integracion MarketPro",
    description: "Preferencia de prueba para validar Mercado Pago.",
    price: 10,
    seller: {
      name: "MarketPro"
    }
  };
  const preference = await createPromotionPreference({ promotion: testPromotion, product: testProduct });
  if (preference.error) {
    return res.status(502).json(preference);
  }
  res.json({
    ok: true,
    preferenceId: preference.id,
    checkoutUrl: preference.init_point || preference.sandbox_init_point || "",
    status: preference.status || "",
    currency: MERCADO_PAGO_CURRENCY
  });
});

app.post("/api/admin/users/:id/verify", requireAdmin, (req, res) => {
  const user = store.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const approved = req.body.status === "approved";
  user.verified = approved;
  user.verificationStatus = approved
    ? "Verificado por admin"
    : "Atencion: tu cuenta ha sido rechazada. No cumples con los requisitos.";
  user.reviewedAt = new Date().toISOString();
  user.reviewNote = req.body.note || "";
  adminAudit(req, approved ? "user_approved" : "user_rejected", { userId: user.id, email: user.email });
  notifyUser(
    user.email,
    approved ? "Cuenta aprobada" : "Cuenta rechazada",
    approved ? "Tu identidad fue aprobada. Ya puedes publicar y conectar Mercado Pago." : "Tu cuenta no cumple los requisitos de verificacion. Revisa tus datos y contacta soporte.",
    approved ? "success" : "danger",
    "/?page=profile"
  );
  sendEmail({
    to: user.email,
    subject: approved ? "Tu cuenta MarketPro fue aprobada" : "Resultado de verificacion MarketPro",
    html: `<p>Hola ${String(user.name || "").replace(/[<>]/g, "")},</p><p>${approved ? "Tu identidad fue aprobada. Ya puedes publicar y vender." : "Tu cuenta fue rechazada porque no cumple los requisitos de verificacion. Puedes comunicarte con soporte para revisarla."}</p>`
  }).catch(() => {});

  store.verificationRequests = store.verificationRequests.map((request) =>
    request.userId === user.id
      ? { ...request, status: approved ? "Aprobado" : "Rechazado", reviewedAt: user.reviewedAt, note: user.reviewNote }
      : request
  );

  if (store.currentUser?.id === user.id) store.currentUser = user;
  writeStore();
  res.json(publicUser(user));
});

app.post("/api/products", (req, res) => {
  const savedSeller = authenticatedUser(req);
  if (!savedSeller) return res.status(401).json({ error: "Inicia sesion para publicar." });
  const required = ["title", "price", "category", "condition", "description", "location", "seller"];
  const missing = required.filter((field) => !req.body[field]);
  if (missing.length) return res.status(400).json({ error: "Faltan datos obligatorios", fields: missing });
  if (!req.body.safetyAccepted) return res.status(400).json({ error: "Debes aceptar el protocolo de seguridad" });
  if (String(savedSeller?.verificationStatus || req.body.seller?.verificationStatus || "").toLowerCase().includes("rechaz")) {
    return res.status(403).json({ error: "Tu cuenta ha sido rechazada. No cumples con los requisitos para vender." });
  }
  if (!(savedSeller?.verified || req.body.seller?.verified)) return res.status(403).json({ error: "Debes registrarte y verificarte antes de vender" });

  const draftProduct = {
    ...req.body,
    seller: {
      name: savedSeller.name,
      email: savedSeller.email,
      avatar: `/api/avatar/${encodeURIComponent(savedSeller.name)}.svg`,
      rating: Number(savedSeller.rating || 0),
      ratingCount: Number(savedSeller.ratingCount || 0),
      verified: true,
      verificationStatus: savedSeller.verificationStatus || "Verificado por admin",
      mercadoPagoConnected: Boolean(savedSeller.mercadoPagoOAuth?.accessTokenEncrypted)
    }
  };
  const duplicate = listings.find((item) =>
    isRealListing(item) &&
    (!item.status || item.status === "active") &&
    duplicateListingKey(item) === duplicateListingKey(draftProduct) &&
    Date.now() - listingTimestamp(item) <= 10 * 60 * 1000
  );
  if (duplicate) {
    return res.json({ ...duplicate, duplicatePrevented: true });
  }
  const listingRisk = analyzeListingRisk(draftProduct);
  const product = {
    id: `item-${Date.now()}`,
    source: "verified-user",
    status: "active",
    verified: true,
    safeMeetup: true,
    reportCount: 0,
    postedAt: "Hace unos segundos",
    createdAt: new Date().toISOString(),
    ...draftProduct,
    security: {
      listingRisk,
      reviewRequired: listingRisk.reviewRequired,
      createdFingerprint: listingRisk.fingerprint,
      checks: [
        "Fotos, precio y descripcion congelados",
        "Vendedor asociado a identidad verificada",
        "Alertas de pago externo y codigos sensibles activas",
        "Admin puede revisar flags antes de destacar o mediar"
      ]
    }
  };
  listings = [product, ...listings];
  store.products = listings;
  writeStore();
  res.status(201).json(product);
});

app.post("/api/promotions", async (req, res) => {
  const promotionBuyer = authenticatedUser(req);
  if (!promotionBuyer) return res.status(401).json({ error: "Inicia sesion para destacar una publicacion." });
  const product = listings.find((item) => item.id === req.body.productId);
  if (!product) return res.status(404).json({ error: "Publicacion no encontrada" });
  const buyerEmail = String(promotionBuyer.email || "").toLowerCase();
  const sellerEmail = String(product.seller?.email || "").toLowerCase();
  if (sellerEmail && buyerEmail && sellerEmail !== buyerEmail) {
    return res.status(403).json({ error: "Solo el vendedor puede pagar el anuncio de su publicacion." });
  }

  const promotion = {
    id: `promo-${Date.now()}`,
    productId: product.id,
    productTitle: product.title,
    amount: 1,
    currency: MERCADO_PAGO_CURRENCY,
    status: "Pendiente de pago en Mercado Pago",
    buyer: { id: promotionBuyer.id, name: promotionBuyer.name, email: promotionBuyer.email },
    seller: product.seller,
    createdAt: new Date().toISOString(),
    mercadoPago: {
      preferenceId: "",
      checkoutUrl: "",
      status: "Pendiente"
    }
  };

  const preference = await createPromotionPreference({ promotion, product });
  if (preference.error) {
    return res.status(502).json(preference);
  }
  promotion.mercadoPago.preferenceId = preference.id;
  promotion.mercadoPago.checkoutUrl = preference.init_point || preference.sandbox_init_point || "";
  promotion.mercadoPago.status = "Preferencia creada";
  store.promotions = [promotion, ...(store.promotions || [])];
  writeStore();
  res.status(201).json({
    ...promotion,
    checkoutUrl: promotion.mercadoPago.checkoutUrl
  });
});

app.put("/api/products/:id", (req, res) => {
  const index = listings.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Publicacion no encontrada" });
  const owner = authenticatedUser(req);
  if (!owner || !sameOrderParty(owner, listings[index].seller)) return res.status(403).json({ error: "Solo el vendedor puede modificar esta publicacion." });
  const allowedFields = ["title", "price", "category", "condition", "description", "location", "images", "status"];
  const updates = Object.fromEntries(allowedFields.filter((field) => Object.hasOwn(req.body, field)).map((field) => [field, req.body[field]]));
  listings[index] = { ...listings[index], ...updates, updatedAt: new Date().toISOString() };
  store.products = listings;
  writeStore();
  res.json(listings[index]);
});

app.post("/api/products/:id/report", (req, res) => {
  const product = listings.find((item) => item.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Publicacion no encontrada" });
  const reporter = requestIdentity(req);
  const risk = analyzeTextRisk(`${req.body.reason || ""} ${req.body.details || ""}`);
  const report = {
    id: `report-${Date.now()}`,
    type: "listing",
    productId: product.id,
    productTitle: product.title,
    reason: req.body.reason || "Reporte de publicacion",
    details: req.body.details || "",
    reporter,
    status: "Pendiente admin",
    risk,
    createdAt: new Date().toISOString()
  };
  product.reportCount = Number(product.reportCount || 0) + 1;
  product.security = product.security || {};
  product.security.lastReportRisk = risk;
  if (product.reportCount >= 3 || risk.level === "Alto") {
    product.security.reviewRequired = true;
    product.status = product.status === "sold" ? product.status : "under-review";
  }
  store.reports = [report, ...(store.reports || [])].slice(0, 400);
  store.products = listings;
  writeStore();
  res.status(201).json({ ok: true, report, product });
});

app.delete("/api/products/:id", (req, res) => {
  const product = listings.find((item) => item.id === req.params.id);
  const owner = authenticatedUser(req);
  if (!product) return res.status(404).json({ error: "Publicacion no encontrada" });
  if (!owner || !sameOrderParty(owner, product.seller)) return res.status(403).json({ error: "Solo el vendedor puede eliminar esta publicacion." });
  const before = listings.length;
  listings = listings.filter((item) => item.id !== req.params.id);
  store.products = listings;
  writeStore();
  res.json({ deleted: listings.length !== before });
});

const assistantFallback = (question = "", context = {}) => {
  const text = `${question} ${context.error || ""}`.toLowerCase();
  if (/publicar|vende|foto|imagen/.test(text)) {
    return "Para publicar, tu identidad debe estar aprobada y debes subir al menos dos fotos reales. Revisa que título, precio, ubicación y descripción estén completos. Si tu cuenta sigue pendiente, espera la revisión del administrador.";
  }
  if (/pago|mercado pago|cobro|tarjeta/.test(text)) {
    return "MarketPro deriva el pago a Mercado Pago y no almacena tarjetas. Verifica que el vendedor tenga Mercado Pago conectado, vuelve a abrir la orden y no pagues por enlaces enviados fuera del chat.";
  }
  if (/entrar|acceso|contrase|gmail|cuenta|sesion/.test(text)) {
    return "Comprueba el correo y la contraseña, evita espacios agregados por el autocompletado y prueba nuevamente. Si no recuerdas la clave, usa Recuperar contraseña. Nunca compartas códigos recibidos por correo.";
  }
  if (/chat|mensaje|conex|internet|red/.test(text)) {
    return "Revisa tu conexión y vuelve a abrir Mensajes. La conversación se guarda en tu cuenta; evita continuar por WhatsApp o transferencias externas mientras resolvemos el problema.";
  }
  if (/verific|cedula|documento|rostro/.test(text)) {
    return "La cédula debe verse completa por el frente y la foto del rostro debe ser clara. Confirma también teléfono y ubicación. Los documentos solo quedan disponibles para la revisión privada del administrador.";
  }
  return "Puedo ayudarte a resolverlo. Intenta repetir la acción una vez y dime en qué pantalla ocurrió. Si el error continúa, abre Soporte; MarketPro conservará el contexto técnico sin compartir tus documentos ni datos de pago.";
};

const responseText = (payload = {}) => {
  if (payload.output_text) return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n");
};

app.post("/api/assistant", rateLimit({ windowMs: 10 * 60 * 1000, max: 20, key: "assistant" }), async (req, res) => {
  const question = String(req.body.question || "").trim().slice(0, 700);
  const context = {
    view: String(req.body.context?.view || "").slice(0, 40),
    action: String(req.body.context?.action || "").slice(0, 80),
    error: String(req.body.context?.error || "").slice(0, 400),
    status: Number(req.body.context?.status || 0)
  };
  if (!question) return res.status(400).json({ error: "Escribe brevemente qué necesitas resolver." });

  if (!OPENAI_API_KEY) {
    return res.json({ answer: assistantFallback(question, context), mode: "diagnostic" });
  }

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_output_tokens: 320,
        instructions: "Eres el asistente de soporte de MarketPro. Responde en español claro, breve y seguro. Ayuda a resolver errores de acceso, publicación, chat, verificación y Mercado Pago. MarketPro no retiene dinero, no almacena tarjetas y no garantiza protección total. Nunca pidas contraseñas, códigos, cédula, fotos de identidad, ubicación exacta ni datos bancarios. Recomienda mantener chat y pago dentro de MarketPro y Mercado Pago. Si no puedes resolverlo, indica cómo abrir Soporte.",
        input: JSON.stringify({ question, context })
      })
    });
    if (!aiResponse.ok) throw new Error(`OpenAI ${aiResponse.status}`);
    const payload = await aiResponse.json();
    const answer = responseText(payload).trim();
    res.json({ answer: answer || assistantFallback(question, context), mode: answer ? "ai" : "diagnostic" });
  } catch (error) {
    res.json({ answer: assistantFallback(question, context), mode: "diagnostic", recovered: true });
  }
});

app.post("/api/support", rateLimit({ windowMs: 10 * 60 * 1000, max: 6, key: "support" }), (req, res) => {
  const identity = requestIdentity(req);
  const required = ["topic", "message"];
  const missing = required.filter((field) => !req.body[field]);
  if (missing.length) return res.status(400).json({ error: "Faltan datos", fields: missing });
  const ticket = {
    id: `support-${Date.now()}`,
    topic: String(req.body.topic || "").slice(0, 80),
    message: String(req.body.message || "").slice(0, 1200),
    contact: String(req.body.contact || identity.email || "").slice(0, 120),
    identity,
    status: "Abierto",
    priority: analyzeTextRisk(req.body.message).level,
    createdAt: new Date().toISOString()
  };
  store.supportTickets = [ticket, ...(store.supportTickets || [])].slice(0, 300);
  writeStore();
  res.status(201).json(ticket);
});

app.post("/api/checkout", rateLimit({ windowMs: 10 * 60 * 1000, max: 12, key: "checkout" }), async (req, res) => {
  const buyerUser = authenticatedUser(req);
  if (!buyerUser) return res.status(401).json({ error: "Inicia sesion para comprar de forma segura." });
  if (!buyerUser.authComplete) {
    return res.status(403).json({ error: "Completa tu identidad antes de iniciar una compra." });
  }
  const required = ["productId", "paymentMethod", "buyer", "delivery"];
  const missing = required.filter((field) => !req.body[field]);
  if (missing.length) return res.status(400).json({ error: "Faltan datos para iniciar la compra", fields: missing });
  if (req.body.paymentMethod !== "mercadopago") {
    return res.status(400).json({ error: "MarketPro solo acepta Mercado Pago vinculado a la app." });
  }
  const deliveryMissing = ["address", "city", "phone", "method"].filter((field) => !req.body.delivery?.[field]);
  if (deliveryMissing.length) return res.status(400).json({ error: "Faltan datos de entrega", fields: deliveryMissing });

  const product = listings.find((item) => item.id === req.body.productId);
  if (!product) return res.status(404).json({ error: "Producto no encontrado" });
  if (sameOrderParty(buyerUser, product.seller)) {
    return res.status(400).json({ error: "No puedes comprar tu propia publicacion." });
  }
  if (!req.body.acceptedRules || !req.body.declaredInspection) {
    return res.status(400).json({ error: "Confirma el protocolo de compra protegida para continuar." });
  }
  const deliveryCode = generateUniqueDeliveryCode();
  const securityStamp = buildSecurityStamp(product, req);
  const orderId = `order-${Date.now()}`;

  const order = {
    id: orderId,
    productId: product.id,
    productTitle: product.title,
    amount: product.price,
    currency: MERCADO_PAGO_CURRENCY,
    status: "Pendiente de pago directo en Mercado Pago",
    paymentMethod: "mercadopago",
    buyer: {
      id: buyerUser.id,
      name: buyerUser.name,
      email: buyerUser.email,
      phone: buyerUser.phone,
      avatar: `/api/avatar/${encodeURIComponent(buyerUser.name)}.svg`
    },
    seller: product.seller,
    snapshot: {
      productId: product.id,
      title: product.title,
      price: product.price,
      category: product.category,
      condition: product.condition,
      seller: product.seller,
      images: product.images,
      description: product.description
    },
    delivery: {
      ...req.body.delivery,
      code: deliveryCode,
      status: "Pendiente de despacho",
      sellerProofRequired: true,
      buyerConfirmationRequired: true,
      inspectionWindowHours: securityStamp.riskLevel === "Alto" ? 72 : 48,
      sellerProof: null,
      buyerInspection: null,
      timeline: [
        { event: "Orden creada", at: new Date().toISOString() },
        { event: "Esperando pago Mercado Pago", at: new Date().toISOString() }
      ]
    },
    security: {
      stamp: securityStamp,
      identityChecked: true,
      sellerVerified: Boolean(product.seller?.verified ?? true),
      buyerAcceptedRules: Boolean(req.body.acceptedRules),
      buyerDeclaredInspection: Boolean(req.body.declaredInspection),
      disputeWindowHours: securityStamp.riskLevel === "Alto" ? 72 : 48,
      paymentRule: "El pago se realiza directamente en la cuenta de Mercado Pago conectada por el vendedor. MarketPro no recibe, retiene ni libera el dinero.",
      antiFraud: [
        "El vendedor debe subir evidencia del producto embalado.",
        "El comprador confirma recepcion con codigo unico.",
        "Si el producto no coincide, se abre disputa con evidencia de la orden.",
        "El historial de chat, publicacion y orden queda guardado para revision.",
        "La huella de publicacion congela precio, fotos y descripcion.",
        "Si existe un problema, MarketPro prepara la evidencia para el reclamo en Mercado Pago."
      ],
      auditTrail: [
        { event: "Orden creada", at: new Date().toISOString() },
        { event: "Publicacion congelada", at: securityStamp.frozenAt },
        { event: `Riesgo ${securityStamp.riskLevel}`, at: new Date().toISOString() }
      ]
    },
    deliveryConfirmation: {
      status: "Pendiente de recepcion",
      code: deliveryCode,
      confirmedAt: "",
      confirmedBy: "",
      note: "El codigo confirma la entrega dentro de MarketPro. No controla el dinero de Mercado Pago."
    },
    createdAt: new Date().toISOString(),
    mercadoPago: {
      enabled: true,
      preferenceId: "",
      checkoutUrl: "",
      publicKeyConfigured: Boolean(MERCADO_PAGO_PUBLIC_KEY),
      status: "Creando preferencia real",
      note: "Pago directo al vendedor mediante Mercado Pago. MarketPro no recibe dinero ni almacena tarjetas."
    },
    disputes: []
  };

  const preference = await createMercadoPagoPreference({ order, product });
  if (preference.error) {
    return res.status(503).json({
      error: preference.error,
      details: preference.details || null
    });
  }

  order.mercadoPago.preferenceId = preference.id;
  order.mercadoPago.checkoutUrl = preference.init_point || preference.sandbox_init_point || "";
  order.mercadoPago.status = "Preferencia real creada";
  order.mercadoPago.rawStatus = preference.status || "";
  order.mercadoPago.sellerUserId = preference.marketProSellerUserId || "";
  order.mercadoPago.sellerAccountId = preference.sellerAccountId || "";
  ensureOrderConversation(order);

  store.orders = [order, ...(store.orders || [])];
  notifyUser(buyerUser.email, "Compra iniciada", `La orden ${order.id} fue creada. Completa el pago directamente en Mercado Pago.`, "order", `/?page=orders`);
  notifyUser(product.seller?.email, "Nueva compra", `${buyerUser.name} inicio una compra de ${product.title}.`, "order", `/?page=orders`);
  writeStore();
  res.status(201).json(order);
});

app.post("/api/orders/:id/confirm-delivery", (req, res) => {
  const order = (store.orders || []).find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });
  const buyerActor = requireOrderRole(req, res, order, "buyer");
  if (!buyerActor) return;
  if (order.disputes?.some((dispute) => dispute.status !== "Cerrada")) {
    return res.status(409).json({ error: "No se puede confirmar entrega con una disputa abierta" });
  }
  if (order.delivery.sellerProofRequired && !order.delivery.sellerProof) {
    return res.status(409).json({ error: "Falta evidencia del vendedor antes de confirmar entrega" });
  }
  if (order.paymentNotification?.status !== "approved") {
    return res.status(409).json({ error: "Mercado Pago todavia no confirmo el pago directo al vendedor." });
  }
  if (String(req.body.code || "").toUpperCase() !== order.delivery.code) {
    return res.status(400).json({ error: "Codigo de entrega incorrecto" });
  }
  const checklist = req.body.checklist || {};
  const missingChecks = ["identityMatched", "packageIntact", "itemMatches", "accessoriesMatch", "conditionAccepted"].filter(
    (key) => !checklist[key]
  );
  if (missingChecks.length) {
    return res.status(400).json({ error: "Faltan confirmaciones del checklist de recepcion", fields: missingChecks });
  }
  order.status = "Operacion completada";
  order.delivery.status = "Completada";
  order.delivery.confirmedAt = new Date().toISOString();
  order.delivery.buyerInspection = {
    checklist,
    conditionNote: req.body.conditionNote || "",
    evidence: req.body.evidence || "",
    confirmedAt: order.delivery.confirmedAt
  };
  order.delivery.timeline = [
    ...(order.delivery.timeline || []),
    { event: "Comprador confirmo recepcion con checklist", at: order.delivery.confirmedAt }
  ];
  order.security.auditTrail = [
    ...(order.security.auditTrail || []),
    { event: "Entrega confirmada con checklist y codigo unico", at: order.delivery.confirmedAt }
  ];
  order.deliveryConfirmation = {
    ...(order.deliveryConfirmation || {}),
    status: "Confirmada",
    code: order.delivery.code,
    confirmedAt: order.delivery.confirmedAt,
    confirmedBy: buyerActor.user.email || buyerActor.user.name || "Comprador",
    note: "Recepcion confirmada en MarketPro. El pago fue procesado directamente por Mercado Pago."
  };
  listings = listings.map((product) => product.id === order.productId ? { ...product, status: "sold" } : product);
  store.products = listings;
  notifyUser(order.seller?.email, "Entrega confirmada", `El comprador confirmo la recepcion de ${order.productTitle}.`, "success", "/?page=orders");
  writeStore();
  res.json(order);
});

app.post("/api/orders/:id/release-payment", (req, res) => {
  const order = (store.orders || []).find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });
  if (!requireOrderRole(req, res, order, "buyer")) return;
  res.json(order);
});

app.post("/api/orders/:id/rate-seller", (req, res) => {
  const order = (store.orders || []).find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });
  if (!requireOrderRole(req, res, order, "buyer")) return;
  if (!order.delivery?.buyerInspection) {
    return res.status(400).json({ error: "Primero confirma la entrega para poder calificar." });
  }
  if (order.sellerRating) {
    return res.status(400).json({ error: "Esta orden ya califico al vendedor." });
  }
  const rating = Number(req.body.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "La calificacion debe estar entre 1 y 5." });
  }
  const summary = updateSellerRating(order.seller, rating, req.body.comment || "");
  order.sellerRating = {
    rating,
    comment: req.body.comment || "",
    ratedAt: new Date().toISOString(),
    sellerRating: summary.rating,
    sellerRatingCount: summary.ratingCount
  };
  order.timeline = [
    ...(order.timeline || []),
    { event: `Comprador califico vendedor con ${rating}/5`, at: order.sellerRating.ratedAt }
  ];
  writeStore();
  res.json(order);
});

app.post("/api/orders/:id/seller-proof", (req, res) => {
  const order = (store.orders || []).find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });
  if (!requireOrderRole(req, res, order, "seller")) return;
  const missing = ["packageNotes", "serialOrMark", "accessories"].filter((field) => !req.body[field]);
  if (missing.length) return res.status(400).json({ error: "Falta evidencia del vendedor", fields: missing });

  order.delivery.sellerProof = {
    packageNotes: req.body.packageNotes,
    serialOrMark: req.body.serialOrMark,
    accessories: req.body.accessories,
    photos: Array.isArray(req.body.photos) ? req.body.photos.slice(0, 6) : [],
    declaredAt: new Date().toISOString()
  };
  order.delivery.status = "Evidencia del vendedor cargada";
  order.delivery.timeline = [
    ...(order.delivery.timeline || []),
    { event: "Vendedor cargo evidencia previa a entrega", at: order.delivery.sellerProof.declaredAt }
  ];
  order.security.auditTrail = [
    ...(order.security.auditTrail || []),
    { event: "Evidencia de vendedor registrada", at: order.delivery.sellerProof.declaredAt }
  ];
  notifyUser(order.buyer?.email, "Producto preparado", `El vendedor cargo la evidencia de empaque de ${order.productTitle}.`, "order", "/?page=orders");
  writeStore();
  res.json(order);
});

app.post("/api/orders/:id/mark-in-transit", (req, res) => {
  const order = (store.orders || []).find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });
  if (!requireOrderRole(req, res, order, "seller")) return;
  if (order.delivery.sellerProofRequired && !order.delivery.sellerProof) {
    return res.status(409).json({ error: "Antes de despachar se debe cargar evidencia del vendedor" });
  }
  const carrier = String(req.body.carrier || "").trim();
  const trackingCode = String(req.body.trackingCode || "").trim();
  if (!carrier) return res.status(400).json({ error: "Indica empresa, agencia o entrega personal." });
  if (trackingRequiredFor(carrier) && !trackingCode) {
    return res.status(400).json({ error: "Para envios por agencia como DAC, UES, Correo o similares, el codigo de rastreo es obligatorio." });
  }
  order.delivery.status = "En camino";
  order.delivery.tracking = {
    method: req.body.method || order.delivery.method,
    trackingCode,
    carrier,
    note: req.body.note || "",
    trackingRequired: trackingRequiredFor(carrier),
    markedAt: new Date().toISOString()
  };
  order.delivery.timeline = [
    ...(order.delivery.timeline || []),
    { event: `Entrega en camino por ${carrier}${trackingCode ? ` con rastreo ${trackingCode}` : ""}`, at: order.delivery.tracking.markedAt }
  ];
  order.security.auditTrail = [
    ...(order.security.auditTrail || []),
    { event: `Tracking registrado: ${carrier}${trackingCode ? ` / ${trackingCode}` : " / sin rastreo por entrega personal"}`, at: order.delivery.tracking.markedAt }
  ];
  notifyUser(order.buyer?.email, "Envio en camino", `${order.productTitle} fue despachado por ${carrier}${trackingCode ? ` con rastreo ${trackingCode}` : ""}.`, "order", "/?page=orders");
  writeStore();
  res.json(order);
});

app.post("/api/orders/:id/dispute", (req, res) => {
  const order = (store.orders || []).find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });
  if (!requireOrderRole(req, res, order, "party")) return;
  const missing = ["reason", "description"].filter((field) => !req.body[field]);
  if (missing.length) return res.status(400).json({ error: "Faltan datos para abrir disputa", fields: missing });
  const dispute = {
    id: `dispute-${Date.now()}`,
    status: "Abierta",
    reason: req.body.reason,
    description: req.body.description,
    evidence: Array.isArray(req.body.evidence) ? req.body.evidence.slice(0, 6) : [],
    createdBy: req.body.createdBy || requestIdentity(req),
    createdAt: new Date().toISOString()
  };
  order.disputes = [dispute, ...(order.disputes || [])];
  order.status = "Disputa abierta - cierre bloqueado";
  order.delivery.status = "En revision";
  order.delivery.timeline = [
    ...(order.delivery.timeline || []),
    { event: `Disputa abierta: ${dispute.reason}`, at: dispute.createdAt }
  ];
  order.security.auditTrail = [
    ...(order.security.auditTrail || []),
    { event: "Disputa bloquea cierre de entrega", at: dispute.createdAt }
  ];
  notifyUser(order.buyer?.email, "Disputa abierta", `Se abrio una revision para la orden ${order.id}.`, "danger", "/?page=orders");
  notifyUser(order.seller?.email, "Disputa abierta", `Se abrio una revision para la orden ${order.id}.`, "danger", "/?page=orders");
  writeStore();
  res.status(201).json(order);
});

const validMercadoPagoWebhook = (req) => {
  if (!MERCADO_PAGO_WEBHOOK_SECRET) return !IS_PRODUCTION;
  const signature = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  const dataId = String(req.query["data.id"] || req.body?.data?.id || "").toLowerCase();
  const signatureParts = Object.fromEntries(
    signature.split(",").map((part) => part.trim().split("=")).filter(([key, value]) => key && value)
  );
  if (!signatureParts.ts || !signatureParts.v1) return false;
  const timestamp = Number(signatureParts.ts);
  const timestampMs = timestamp > 1e12 ? timestamp : timestamp * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 10 * 60 * 1000) return false;
  const manifest = [
    dataId ? `id:${dataId};` : "",
    requestId ? `request-id:${requestId};` : "",
    `ts:${signatureParts.ts};`
  ].join("");
  const expected = crypto.createHmac("sha256", MERCADO_PAGO_WEBHOOK_SECRET).update(manifest).digest("hex");
  const received = String(signatureParts.v1);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
};

app.post("/api/payments/mercadopago/webhook", async (req, res) => {
  if (!validMercadoPagoWebhook(req)) {
    return res.status(401).json({ error: "Firma de Mercado Pago invalida." });
  }

  const topic = req.query.topic || req.body.type || req.body.topic;
  const paymentId = req.query["data.id"] || req.query.id || req.body?.data?.id || req.body.id;
  const sellerUserId = String(req.query.seller || "");
  let payment = null;

  let paymentAccessToken = "";
  if (sellerUserId) {
    const sellerUser = (store.users || []).find((user) => user.id === sellerUserId);
    if (sellerUser) {
      const sellerAccess = await sellerMercadoPagoAccess({ email: sellerUser.email, name: sellerUser.name });
      paymentAccessToken = sellerAccess.accessToken || "";
    }
  } else {
    paymentAccessToken = MERCADO_PAGO_ACCESS_TOKEN;
  }

  if (paymentId && paymentAccessToken) {
    try {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Bearer ${paymentAccessToken}` }
      });
      if (response.ok) payment = await response.json();
    } catch {
      payment = null;
    }
  }

  const externalReference = payment?.external_reference;
  const order = (store.orders || []).find((item) => item.id === externalReference);
  if (order) {
    const amountMatches = Number(payment?.transaction_amount) === Number(order.amount);
    const currencyMatches = !payment?.currency_id || payment.currency_id === order.currency;
    const collectorMatches = !order.mercadoPago?.sellerAccountId || String(payment?.collector_id || "") === String(order.mercadoPago.sellerAccountId);
    const paymentVerified = Boolean(payment && amountMatches && currencyMatches && collectorMatches);
    order.paymentNotification = {
      topic,
      paymentId: String(paymentId || ""),
      status: paymentVerified ? payment.status : "verification_failed",
      statusDetail: payment?.status_detail || "",
      amountMatches,
      currencyMatches,
      collectorMatches,
      receivedAt: new Date().toISOString()
    };
    order.status = paymentVerified && payment.status === "approved"
      ? "Pago directo confirmado por Mercado Pago"
      : paymentVerified
        ? `Mercado Pago: ${payment.status}`
        : "Pago en revision: los datos no coinciden";
    order.security.auditTrail = [
      ...(order.security.auditTrail || []),
      { event: `Webhook firmado de Mercado Pago: ${order.paymentNotification.status}`, at: order.paymentNotification.receivedAt }
    ];
    writeStore();
  }

  const promotion = (store.promotions || []).find((item) => item.id === externalReference);
  if (promotion) {
    promotion.paymentNotification = {
      topic,
      paymentId: String(paymentId || ""),
      status: payment?.status || req.body.status || "received",
      statusDetail: payment?.status_detail || "",
      receivedAt: new Date().toISOString()
    };
    promotion.status = payment?.status === "approved" ? "Pagado - anuncio activo" : `Mercado Pago: ${promotion.paymentNotification.status}`;

    if (payment?.status === "approved") {
      const promotedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      promotion.promotedUntil = promotedUntil;
      listings = listings.map((product) =>
        product.id === promotion.productId
          ? { ...product, promotedUntil, promotedAt: promotion.paymentNotification.receivedAt, promotionId: promotion.id }
          : product
      );
      store.products = listings;
    }
    writeStore();
  }

  res.json({ received: true });
});

app.post("/api/conversations", (req, res) => {
  const buyer = requestIdentity(req);
  if (buyer.id === "guest") return res.status(401).json({ error: "Inicia sesion para abrir un chat." });
  if (req.body.orderId) {
    const order = (store.orders || []).find((item) => item.id === req.body.orderId);
    if (!order) return res.status(404).json({ error: "Orden no encontrada para crear chat." });
    if (!requireOrderRole(req, res, order, "party")) return;
    const chat = ensureOrderConversation(order);
    store.orders = (store.orders || []).map((item) => item.id === order.id ? order : item);
    writeStore();
    return res.status(201).json(chat);
  }
  const product = listings.find((item) => item.id === req.body.productId);
  if (!product) return res.status(404).json({ error: "Publicacion no encontrada para crear chat." });
  if (sameOrderParty(authenticatedUser(req), product.seller)) return res.status(400).json({ error: "No puedes abrir un chat de compra contigo mismo." });
  const sellerId = String(product.seller?.email || product.seller?.name || "");
  const existing = chats.find((chat) =>
    chat.productId === req.body.productId &&
    chat.buyerId === buyer.id &&
    chat.sellerId === sellerId
  );
  if (existing) return res.json(existing);
  const seller = {
    id: sellerId,
    name: product.seller?.name,
    email: product.seller?.email || "",
    avatar: product.seller?.avatar
  };

  const chat = {
    id: `chat-${Date.now()}`,
    orderId: req.body.orderId || "",
    productId: req.body.productId,
    buyer: buyer.name,
    buyerId: buyer.id,
    seller: seller.name,
    sellerId: seller.id,
    productTitle: product.title,
    avatar: seller.avatar,
    participants: [buyer, seller],
    createdAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    messages: [
      {
        id: `msg-${Date.now()}-system`,
        from: "system",
        senderId: "system",
        senderName: "MarketPro",
        text: "Chat seguro iniciado. Los mensajes se sincronizan en tiempo real entre las partes conectadas.",
        time: new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }),
        createdAt: new Date().toISOString()
      }
    ]
  };
  chats = [chat, ...chats];
  store.conversations = chats;
  writeStore();
  res.status(201).json(chat);
});

app.post("/api/conversations/:id/messages", (req, res) => {
  const sender = requestIdentity(req);
  const chat = chats.find((item) => item.id === req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat no encontrado." });
  if (sender.id === "guest" || !isParticipant(chat, sender)) {
    return res.status(403).json({ error: "Solo los participantes pueden enviar mensajes." });
  }
  const blocked = chat.blocked || (store.blockedPairs || []).some((item) => item.chatId === chat.id);
  if (blocked) return res.status(403).json({ error: "Este chat está bloqueado por seguridad." });

  const text = String(req.body.text || "").trim().slice(0, 2000);
  const rawAttachment = String(req.body.attachment || "");
  const attachment = /^data:image\/(?:jpeg|png|webp);base64,/i.test(rawAttachment) && rawAttachment.length <= 1400000
    ? rawAttachment
    : "";
  if (!text && !attachment) return res.status(400).json({ error: "Escribe un mensaje o añade una foto válida." });
  if (rawAttachment && !attachment) return res.status(413).json({ error: "La foto es demasiado grande o tiene un formato no permitido." });

  const risk = analyzeTextRisk(text);
  const message = {
    id: `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    from: "user",
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    text,
    attachment,
    risk,
    time: new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }),
    createdAt: new Date().toISOString()
  };
  const systemMessage = risk.level === "Alto"
    ? {
        id: `msg-${Date.now()}-risk`,
        from: "system",
        senderId: "system",
        senderName: "MarketPro Shield",
        text: `Alerta antifraude: detectamos ${risk.flags.join(", ")}. No compartas codigos, claves ni pagos por fuera de MarketPro.`,
        risk,
        time: message.time,
        createdAt: new Date().toISOString()
      }
    : null;

  chats = chats.map((item) => item.id === chat.id
    ? {
        ...item,
        lastMessageAt: message.createdAt,
        riskEvents: risk.level !== "Bajo"
          ? [...(item.riskEvents || []), { level: risk.level, flags: risk.flags, at: message.createdAt }]
          : item.riskEvents || [],
        messages: systemMessage ? [...item.messages, message, systemMessage] : [...item.messages, message]
      }
    : item
  );
  store.conversations = chats;
  writeStore();

  const allowedIds = participantIds(chat);
  wss.clients.forEach((client) => {
    const clientId = String(client.identity?.id || "");
    const clientEmail = String(client.identity?.email || "");
    if (client.readyState === 1 && (allowedIds.has(clientId) || allowedIds.has(clientEmail))) {
      client.send(JSON.stringify({ type: "message", chatId: chat.id, message }));
      if (systemMessage) client.send(JSON.stringify({ type: "message", chatId: chat.id, message: systemMessage }));
    }
  });
  res.status(201).json({ message, systemMessage });
});

app.post("/api/conversations/:id/report", (req, res) => {
  const chat = chats.find((item) => item.id === req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat no encontrado" });
  const reporter = requestIdentity(req);
  if (reporter.id === "guest" || !isParticipant(chat, reporter)) return res.status(403).json({ error: "Solo los participantes pueden reportar este chat." });
  const report = {
    id: `report-${Date.now()}`,
    type: "chat",
    chatId: chat.id,
    productTitle: chat.productTitle,
    reason: req.body.reason || "Reporte de chat",
    details: req.body.details || "",
    reporter,
    status: "Pendiente admin",
    risk: analyzeTextRisk(`${req.body.reason || ""} ${req.body.details || ""}`),
    createdAt: new Date().toISOString()
  };
  store.reports = [report, ...(store.reports || [])].slice(0, 400);
  chat.reviewRequired = true;
  store.conversations = chats;
  writeStore();
  res.status(201).json({ ok: true, report });
});

app.post("/api/conversations/:id/block", (req, res) => {
  const chat = chats.find((item) => item.id === req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat no encontrado" });
  const identity = requestIdentity(req);
  if (identity.id === "guest" || !isParticipant(chat, identity)) return res.status(403).json({ error: "Solo los participantes pueden bloquear este chat." });
  const other = (chat.participants || []).find((participant) =>
    String(participant.id) !== String(identity.id) && String(participant.email || "") !== String(identity.email || "")
  );
  const block = {
    id: `block-${Date.now()}`,
    chatId: chat.id,
    by: identity.id,
    byEmail: identity.email,
    target: other?.id || chat.sellerId || "",
    targetEmail: other?.email || "",
    reason: req.body.reason || "Bloqueo preventivo",
    createdAt: new Date().toISOString()
  };
  store.blockedPairs = [block, ...(store.blockedPairs || [])].slice(0, 300);
  chat.blocked = true;
  chat.reviewRequired = true;
  store.conversations = chats;
  writeStore();
  res.status(201).json({ ok: true, block });
});

wss.on("connection", (socket) => {
  socket.identity = null;
  socket.on("message", (raw) => {
    let payload;
    try { payload = JSON.parse(raw.toString()); } catch { return; }
    if (payload.type === "hello") {
      const user = userFromSessionToken(String(payload.token || ""));
      socket.identity = user ? { id: user.id, name: user.name, email: user.email } : null;
      return;
    }
    if (payload.type !== "message") return;
    if (!socket.identity) return;
    const chat = chats.find((item) => item.id === payload.chatId);
    if (!chat || !isParticipant(chat, socket.identity)) return;
    const blocked = (store.blockedPairs || []).some((item) => item.chatId === chat.id);
    if (blocked || chat.blocked) return;
    const text = String(payload.message?.text || "").trim().slice(0, 2000);
    const rawAttachment = String(payload.message?.attachment || "");
    const attachment = /^data:image\/(?:jpeg|png|webp);base64,/i.test(rawAttachment) && rawAttachment.length <= 1400000
      ? rawAttachment
      : "";
    if (!text && !attachment) return;
    const message = {
      id: /^msg-[a-z0-9-]+$/i.test(String(payload.message?.id || "")) ? payload.message.id : `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      from: "user",
      senderId: socket.identity.id,
      senderName: socket.identity.name,
      senderAvatar: `/api/avatar/${encodeURIComponent(socket.identity.name || "Usuario")}.svg`,
      text,
      attachment,
      time: new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }),
      createdAt: new Date().toISOString()
    };
    const risk = analyzeTextRisk(message.text);
    message.risk = risk;
    const systemRiskMessage = risk.level === "Alto"
      ? {
          id: `msg-${Date.now()}-risk`,
          from: "system",
          senderId: "system",
          senderName: "MarketPro Shield",
          text: `Alerta antifraude: detectamos ${risk.flags.join(", ")}. No compartas codigos, claves ni pagos por fuera de MarketPro.`,
          risk,
          time: new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }),
          createdAt: new Date().toISOString()
        }
      : null;

    chats = chats.map((chat) => {
      if (chat.id !== payload.chatId) return chat;
      const exists = chat.messages.some((savedMessage) => savedMessage.id && savedMessage.id === message.id);
      if (exists) return chat;
      const riskEvents = risk.level !== "Bajo"
        ? [...(chat.riskEvents || []), { level: risk.level, flags: risk.flags, at: new Date().toISOString() }]
        : chat.riskEvents || [];
      return {
        ...chat,
        riskEvents,
        lastMessageAt: message.createdAt,
        messages: systemRiskMessage ? [...chat.messages, message, systemRiskMessage] : [...chat.messages, message]
      };
    });
    store.conversations = chats;
    writeStore();

    const allowedIds = participantIds(chat);
    wss.clients.forEach((client) => {
      const clientId = String(client.identity?.id || "");
      const clientEmail = String(client.identity?.email || "");
      if (client.readyState === 1 && (allowedIds.has(clientId) || allowedIds.has(clientEmail))) {
        client.send(JSON.stringify({ type: "message", chatId: chat.id, message }));
        if (systemRiskMessage) client.send(JSON.stringify({ type: "message", chatId: payload.chatId, message: systemRiskMessage }));
      }
    });
  });
});

initializePersistentStore().finally(() => {
  server.listen(PORT, HOST, () => {
    console.log(`MarketPro listo en http://${HOST}:${PORT}`);
  });
});
