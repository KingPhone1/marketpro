const app = document.querySelector("#app");

let deferredInstallPrompt = null;

const getSessionId = () => {
  const existing = localStorage.getItem("marketSessionId");
  if (existing) return existing;
  const created = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  localStorage.setItem("marketSessionId", created);
  return created;
};

const categories = [
  "Todo",
  "Vehiculos",
  "Inmuebles",
  "Electronica",
  "Ropa",
  "Hogar",
  "Deportes",
  "Juguetes",
  "Entretenimiento"
];

const safetyRules = [
  "Habla siempre dentro del chat de la app.",
  "Revisa perfil, fotos, precio y descripcion antes de coordinar.",
  "Encuentro en lugar publico o punto seguro.",
  "No compartas codigos, claves, documentos ni datos bancarios.",
  "Paga solo por Mercado Pago vinculado a MarketPro.",
  "No entregues el codigo de recepcion antes de revisar el articulo.",
  "Sube evidencia clara si vendes productos de valor."
];

const fraudScenarios = [
  {
    title: "Producto distinto al publicado",
    text: "El vendedor debe mantener fotos, descripcion y evidencia de empaque. Si el comprador reporta diferencia, el pago queda retenido."
  },
  {
    title: "No envio o falsa entrega",
    text: "Cada orden genera un codigo unico. Sin codigo confirmado por el comprador, el dinero no se libera."
  },
  {
    title: "Identidad falsa",
    text: "Para vender se exige registro, documento, selfie/foto y ubicacion. El admin revisa antes de aprobar publicaciones."
  },
  {
    title: "Pago por fuera de la app",
    text: "La app avisa que cualquier pago externo pierde proteccion. El chat y la orden quedan como evidencia."
  },
  {
    title: "Cambio de precio o condiciones",
    text: "La compra congela precio, publicacion, vendedor, comprador y condiciones al crear la orden."
  },
  {
    title: "Disputa por estado del articulo",
    text: "El comprador tiene ventana de disputa; el pago queda retenido hasta decision del admin."
  }
];

const shieldControls = [
  ["Pago externo", "Bloquea o advierte transferencias, efectivo, cripto y pagos directos fuera de MarketPro."],
  ["Codigo sensible", "Marca pedidos de OTP, clave, PIN o codigo de entrega antes de liberar informacion."],
  ["Entrega dudosa", "Detecta terceros sin documento, cadetes improvisados o entrega sin revision."],
  ["Producto cambiado", "Congela fotos, precio, descripcion y vendedor al crear la orden."],
  ["Presion indebida", "Alerta mensajes con urgencia artificial o intento de cerrar sin revisar."],
  ["Disputa fuerte", "Ordena evidencia, chat y recepcion para decision admin."]
];

const reviewReadiness = [
  ["Privacidad clara", "Explica que datos se guardan, para que se usan y como pedir eliminacion."],
  ["Cuenta eliminable", "El usuario puede cerrar su cuenta desde Mi cuenta sin depender del admin."],
  ["Moderacion activa", "Publicaciones y chats se pueden reportar; el admin recibe evidencia."],
  ["Bloqueo preventivo", "Si una conversacion se vuelve riesgosa, el usuario puede bloquearla."],
  ["Pago transparente", "MarketPro deriva el cobro a Mercado Pago y no almacena tarjetas."],
  ["Soporte visible", "Hay un canal simple para problemas de cuenta, compra, venta o seguridad."]
];

const fraudPatterns = [
  { label: "pago externo", pattern: /(transferencia|dep[oó]sito|fuera de la app|por fuera|zelle|paypal|cuenta bancaria|efectivo|cash|cripto|usdt|binance|giro)/i },
  { label: "codigo sensible", pattern: /(otp|pin|clave|contrase[nñ]a|token|codigo de entrega|codigo privado|verificaci[oó]n)/i },
  { label: "contacto fuera", pattern: /(whatsapp|telegram|instagram|wa\.me|t\.me|ll[aá]mame|mi n[uú]mero)/i },
  { label: "entrega no verificable", pattern: /(mando un uber|mando taxi|retira un amigo|sin revisar|dejalo en porteria|cadete)/i },
  { label: "presion", pattern: /(urgente|ya mismo|apurate|solo hoy|ultimo aviso|si no ahora)/i }
];

const initialView = () => {
  if (location.pathname === "/privacy") return "legal";
  if (location.pathname === "/support") return "support";
  if (location.pathname === "/security") return "security";
  const page = new URLSearchParams(location.search).get("page");
  return ["legal", "support", "security"].includes(page) ? page : "feed";
};

const state = {
  products: [],
  conversations: [],
  view: initialView(),
  selectedProductId: null,
  selectedChatId: null,
  checkoutOrder: null,
  paymentMethod: "mercadopago",
  galleryIndex: 0,
  query: "",
  filters: {
    category: "Todo",
    minPrice: "",
    maxPrice: "",
    distance: "50",
    condition: "Todas"
  },
  filtersOpen: JSON.parse(localStorage.getItem("marketFiltersOpen") ?? "true"),
  profileTab: "active",
  user: JSON.parse(localStorage.getItem("marketUser")) || null,
  authToken: localStorage.getItem("marketAuthToken") || "",
  authMode: "login",
  canInstallPwa: false,
  sessionId: getSessionId(),
  viewKey: 0,
  sellerDashboard: null,
  socket: null
};

const money = (value) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const selectedProduct = () => state.products.find((item) => item.id === state.selectedProductId);

const analyzeMessageRisk = (text = "") => {
  const flags = fraudPatterns.filter((item) => item.pattern.test(text)).map((item) => item.label);
  return {
    level: flags.length >= 2 || flags.includes("codigo sensible") || flags.includes("pago externo") ? "Alto" : flags.length ? "Medio" : "Bajo",
    flags
  };
};

const listingRiskFor = (item = {}) => {
  if (item.security?.listingRisk) return item.security.listingRisk;
  const flags = [];
  if ((item.images || []).length < 2) flags.push("Pocas fotos");
  if (String(item.description || "").length < 90) flags.push("Descripcion corta");
  if (Number(item.price || 0) > 1000 && !/serie|imei|factura|recibo|chasis|matricula|modelo|medida/i.test(`${item.title} ${item.description}`)) {
    flags.push("Falta identificador");
  }
  const score = Math.min(92, 18 + flags.length * 16 + (Number(item.price || 0) > 1000 ? 12 : 0));
  return {
    score,
    level: score >= 58 ? "Alto" : score >= 34 ? "Medio" : "Bajo",
    flags
  };
};

const trustScore = (item) => {
  let score = 55;
  if (item.images?.length > 1) score += 10;
  if (item.description?.length > 70) score += 10;
  if (sellerHasRating(item.seller) && item.seller.rating >= 4.8) score += 15;
  if (item.condition) score += 5;
  if (item.location) score += 5;
  const risk = listingRiskFor(item);
  if (risk.level === "Alto") score -= 16;
  if (risk.level === "Medio") score -= 7;
  return Math.min(score, 98);
};

const filteredProducts = () => {
  const query = state.query.trim().toLowerCase();
  return state.products.filter((item) => {
    const text = [item.title, item.location, item.category, item.description].join(" ").toLowerCase();
    const textMatch = !query || text.includes(query);
    const categoryMatch = state.filters.category === "Todo" || item.category === state.filters.category;
    const minMatch = !state.filters.minPrice || item.price >= Number(state.filters.minPrice);
    const maxMatch = !state.filters.maxPrice || item.price <= Number(state.filters.maxPrice);
    const distanceMatch = item.distance <= Number(state.filters.distance || 50);
    const conditionMatch = state.filters.condition === "Todas" || item.condition === state.filters.condition;
    return textMatch && categoryMatch && minMatch && maxMatch && distanceMatch && conditionMatch;
  }).sort((a, b) => Number(Boolean(b.promoted)) - Number(Boolean(a.promoted)));
};

const currentIdentity = () => {
  const name = state.user?.name || `Visitante ${state.sessionId.slice(-4).toUpperCase()}`;
  return {
    id: state.user?.email || state.sessionId,
    name,
    email: state.user?.email || "",
    avatar: state.user ? `/api/avatar/${encodeURIComponent(state.user.name)}.svg` : `/api/avatar/${encodeURIComponent(name)}.svg`
  };
};

const hasCompleteAccess = (user = state.user) =>
  Boolean(
    (user?.admin || state.authToken) &&
      user?.authComplete &&
      user?.hasPassword &&
      user?.email &&
      user?.phone &&
      user?.cedula &&
      user?.exactLocation &&
      user?.profilePhoto &&
      user?.documentPhoto
  );

const canShowAdminEntry = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("admin") === "1" || window.location.hash === "#admin" || Boolean(sessionStorage.getItem("mpAdminToken"));
};

const scrollToTop = () => {
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" }));
};

const isMyMessage = (message) => {
  if (message.senderId) return message.senderId === currentIdentity().id;
  return message.from === "me";
};

const navigate = (view, payload = {}) => {
  const changed = state.view !== view;
  state.view = view;
  Object.assign(state, payload);
  if (changed) state.viewKey += 1;
  render();
  scrollToTop();
};

const api = async (path, options = {}) => {
  const identity = currentIdentity();
  const headers = {
    "Content-Type": "application/json",
    "X-User-Id": identity.id,
    "X-User-Name": encodeURIComponent(identity.name),
    "X-User-Email": identity.email,
    ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(path, {
    ...options,
    headers
  });
  return response.json();
};

const loadData = async () => {
  if (state.user && !state.user.admin && !state.authToken) {
    state.user = null;
    localStorage.removeItem("marketUser");
  }
  const [products, conversations, savedUser] = await Promise.all([
    api("/api/products"),
    api("/api/conversations"),
    api("/api/user")
  ]);
  state.products = products.map(normalizeProduct);
  state.conversations = conversations;
  if (
    hasCompleteAccess(savedUser) &&
    (!hasCompleteAccess(state.user) || !state.user?.email || state.user.email === savedUser.email)
  ) {
    state.user = savedUser;
    localStorage.setItem("marketUser", JSON.stringify(savedUser));
  }
  if (state.user) {
    const dashboard = await api("/api/seller-dashboard");
    state.sellerDashboard = dashboard.error ? null : dashboard;
  }
  state.selectedChatId = conversations[0]?.id || null;
  connectSocket();
  render();
};

const normalizeProduct = (item) => ({
  ...item,
  category: item.category === "Ropa y accesorios" ? "Ropa" : item.category === "Hogar y jardin" ? "Hogar" : item.category,
  verified: item.verified ?? true,
  safeMeetup: item.safeMeetup ?? true,
  reportCount: item.reportCount ?? 0,
  promoted: Boolean(item.promotedUntil && new Date(item.promotedUntil).getTime() > Date.now())
});

const isRejectedUser = (user = state.user) => Boolean(user?.verificationStatus?.toLowerCase().includes("rechaz"));

const isVerifiedSeller = () => Boolean(state.user?.verified && !isRejectedUser());

const refreshSellerDashboard = async () => {
  state.sellerDashboard = await api("/api/seller-dashboard");
};

const connectSocket = () => {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  if (state.socket?.readyState === WebSocket.OPEN || state.socket?.readyState === WebSocket.CONNECTING) return;
  state.socket = new WebSocket(`${protocol}://${location.host}`);
  state.socket.addEventListener("open", () => {
    state.socket.send(JSON.stringify({ type: "hello", identity: currentIdentity() }));
  });
  state.socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type !== "message") return;
    state.conversations = state.conversations.map((chat) => {
      if (chat.id !== payload.chatId) return chat;
      const exists = chat.messages.some((msg) =>
        payload.message.id ? msg.id === payload.message.id : msg.text === payload.message.text && msg.time === payload.message.time
      );
      return exists ? chat : { ...chat, messages: [...chat.messages, payload.message] };
    });
    render();
  });
  state.socket.addEventListener("close", () => {
    state.socket = null;
    setTimeout(connectSocket, 1600);
  });
};

const topbar = () => `
  <header class="topbar">
    <button class="brand" data-view="feed" title="Inicio">
      <img class="brand-logo" src="/mp-logo.svg" alt="MP" />
      <span>MarketPro</span>
    </button>
    <div class="searchbox">
      <span>Todo</span>
      <input id="globalSearch" value="${escapeHtml(state.query)}" placeholder="Busca articulos, barrios o categorias" />
    </div>
    <div class="top-actions">
      ${state.canInstallPwa ? `<button class="nav-btn install-btn" id="installPwa">Instalar app</button>` : ""}
      <button class="nav-btn ${state.view === "profile" ? "active" : ""}" data-view="profile">Mi cuenta</button>
      <button class="nav-btn ${state.view === "messages" ? "active" : ""}" data-view="messages">Mensajes</button>
      <button class="nav-btn ${state.view === "security" ? "active" : ""}" data-view="security">Seguridad</button>
      <button class="nav-btn sell-btn ${state.view === "compose" ? "active" : ""}" data-view="compose">Vender</button>
      <button class="cart-btn ${state.view === "profile" ? "active" : ""}" data-view="profile">0</button>
      <button class="avatar-btn ${state.view === "profile" ? "active" : ""}" data-view="profile" title="Perfil">${state.user ? state.user.name[0] : "E"}</button>
    </div>
  </header>
  <div class="category-strip">
    ${categories.map((category) => `<button data-category="${category}">${escapeHtml(category)}</button>`).join("")}
  </div>
  <nav class="mobile-tabs">
    <button class="${state.view === "feed" || state.view === "detail" ? "active" : ""}" data-view="feed" aria-label="Inicio"><span>⌂</span><small>Inicio</small></button>
    <button class="${state.view === "compose" ? "active" : ""}" data-view="compose" aria-label="Vender"><span>＋</span><small>Vender</small></button>
    <button class="${state.view === "messages" ? "active" : ""}" data-view="messages" aria-label="Chats"><span>✉</span><small>Chats</small></button>
    <button class="${state.view === "profile" ? "active" : ""}" data-view="profile" aria-label="Perfil"><span>◉</span><small>Perfil</small></button>
  </nav>
`;

const appFooter = () => `
  <footer class="app-footer">
    <div>
      <strong>MarketPro</strong>
      <span>Compraventa verificada con Mercado Pago, chat seguro y entrega por codigo unico.</span>
    </div>
    <nav>
      <button data-view="security">Seguridad</button>
      <button data-view="support">Soporte</button>
      <button data-view="legal">Privacidad</button>
    </nav>
  </footer>
`;

const pwaInstallCard = () => `
  <section class="pwa-install-card">
    <div>
      <strong>Instala MarketPro</strong>
      <span>En Android toca Instalar. En iPhone: Compartir > Agregar a pantalla de inicio.</span>
    </div>
    <button class="install-chip" id="installPwa" type="button">${state.canInstallPwa ? "Instalar" : "Como instalar"}</button>
  </section>
`;

const sidebar = () => `
  <aside class="sidebar ${state.filtersOpen ? "open" : ""}">
    <div class="side-block">
      <h2>Departamentos</h2>
      <div class="category-list">
        ${categories
          .map(
            (category) => `
            <button class="category-btn ${state.filters.category === category ? "active" : ""}" data-category="${category}">
              <span>${escapeHtml(category)}</span>
            </button>`
          )
          .join("")}
      </div>
    </div>
    <div class="side-block">
      <h2>Filtros</h2>
      <div class="filters">
        <div class="field">
          <label>Precio minimo</label>
          <input id="minPrice" type="number" min="0" value="${escapeHtml(state.filters.minPrice)}" placeholder="0" />
        </div>
        <div class="field">
          <label>Precio maximo</label>
          <input id="maxPrice" type="number" min="0" value="${escapeHtml(state.filters.maxPrice)}" placeholder="Sin limite" />
        </div>
        <div class="field">
          <label>Distancia: ${state.filters.distance} km</label>
          <input id="distance" type="range" min="1" max="50" value="${state.filters.distance}" />
        </div>
        <div class="field">
          <label>Condicion</label>
          <select id="condition">
            ${["Todas", "Nuevo", "Usado"]
              .map((condition) => `<option ${state.filters.condition === condition ? "selected" : ""}>${condition}</option>`)
              .join("")}
          </select>
        </div>
        <button class="secondary-btn" id="clearFilters">Limpiar</button>
      </div>
    </div>
    <div class="safety-card compact">
      <strong>Compra protegida</strong>
      <span>Chat interno, punto publico y pago solo al verificar el articulo.</span>
    </div>
  </aside>
`;

const trustBadge = (item) => `
  <span class="trust-badge">Verificado ${trustScore(item)}%</span>
`;

const sellerReliability = (item) => [
  "Identidad validada",
  sellerHasRating(item.seller) ? `${Number(item.seller.rating).toFixed(1)}/5 reputacion real` : "Sin calificaciones todavia",
  "Chat auditado",
  "Pago protegido"
];

const securityLedger = (item) => {
  const score = trustScore(item);
  const risk = listingRiskFor(item);
  return `
    <section class="security-ledger">
      <div>
        <span>MP Shield</span>
        <strong>${score}%</strong>
        <small>Indice de proteccion</small>
      </div>
      <ul>
        <li>Publicacion congelada al comprar</li>
        <li>Pago procesado por Mercado Pago vinculado</li>
        <li>Chat monitoreado contra fraude</li>
        <li>Disputa bloquea retiro del vendedor</li>
        <li>Riesgo de publicacion: ${escapeHtml(risk.level)}${risk.flags?.length ? ` (${escapeHtml(risk.flags.slice(0, 2).join(", "))})` : ""}</li>
      </ul>
    </section>
  `;
};

const shieldMatrix = () => `
  <section class="shield-matrix">
    <div>
      <p class="eyebrow">MP Shield Pro</p>
      <h2>Antiestafa activo antes del pago, durante el chat y al confirmar entrega.</h2>
    </div>
    <div class="shield-grid">
      ${shieldControls.map(([title, text]) => `<article><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></article>`).join("")}
    </div>
  </section>
`;

const deliveryWorkflow = (order) => {
  if (!order) return "";
  const proof = order.delivery?.sellerProof;
  const inspection = order.delivery?.buyerInspection;
  const hasOpenDispute = order.disputes?.some((dispute) => dispute.status !== "Cerrada");
  return `
    <section class="delivery-workflow">
      <div class="delivery-status">
        <span>Entrega protegida</span>
        <strong>${escapeHtml(order.paymentRelease?.status || order.delivery.status)}</strong>
        <small>${hasOpenDispute ? "Disputa abierta: cierre bloqueado" : "Pago retenido hasta codigo unico de entrega"}</small>
      </div>
      <div class="delivery-steps">
        <span class="${proof ? "done" : ""}">1. Evidencia vendedor</span>
        <span class="${order.delivery.tracking ? "done" : ""}">2. Despacho</span>
        <span class="${inspection ? "done" : ""}">3. Recepcion</span>
        <span class="${hasOpenDispute ? "danger" : inspection ? "done" : ""}">4. Cierre</span>
      </div>
      ${proof ? `
        <div class="proof-summary">
          <strong>Evidencia cargada</strong>
          <span>${escapeHtml(proof.packageNotes)} - ${escapeHtml(proof.serialOrMark)} - ${escapeHtml(proof.accessories)}</span>
        </div>
      ` : `
        <form class="secure-subform" id="sellerProofForm">
          <strong>Evidencia antes de entregar</strong>
          <input name="packageNotes" required placeholder="Estado del empaque y articulo" />
          <input name="serialOrMark" required placeholder="Serie, IMEI, marca unica o detalle identificable" />
          <input name="accessories" required placeholder="Accesorios incluidos" />
          <input name="photos" type="file" accept="image/*" multiple />
          <button class="secondary-btn" type="submit">Cargar evidencia</button>
        </form>
      `}
      ${proof && !order.delivery.tracking ? `
        <form class="secure-subform" id="markTransitForm">
          <strong>Marcar entrega en camino</strong>
          <input name="carrier" placeholder="Repartidor, empresa o entrega personal" />
          <input name="trackingCode" placeholder="Codigo de seguimiento opcional" />
          <input name="note" placeholder="Nota de traslado" />
          <button class="secondary-btn" type="submit">Marcar en camino</button>
        </form>
      ` : ""}
      <form class="secure-subform" id="deliveryConfirmForm">
        <strong>Confirmar recepcion segura</strong>
        <input name="code" required placeholder="Codigo recibido al entregar" />
        <label class="check-row"><input type="checkbox" name="identityMatched" required /> La persona o envio coincide con la orden.</label>
        <label class="check-row"><input type="checkbox" name="packageIntact" required /> El empaque no muestra manipulacion sospechosa.</label>
        <label class="check-row"><input type="checkbox" name="itemMatches" required /> El articulo coincide con fotos y descripcion.</label>
        <label class="check-row"><input type="checkbox" name="accessoriesMatch" required /> Accesorios y piezas coinciden.</label>
        <label class="check-row"><input type="checkbox" name="conditionAccepted" required /> Estado aceptado luego de revisar.</label>
        <input name="conditionNote" placeholder="Observacion final de recepcion" />
        <button class="buy-action" type="submit">Confirmar entrega</button>
      </form>
      ${inspection && order.paymentRelease?.status !== "Liberado" ? `
        <form class="secure-subform release-form" id="releasePaymentForm">
          <strong>Liberar pago al vendedor</strong>
          <small>El comprador entrega este codigo solo despues de revisar producto, accesorios y estado. Cada orden tiene un codigo diferente.</small>
          <input name="code" required placeholder="Codigo unico de esta orden" />
          <button class="buy-action" type="submit">Liberar pago</button>
        </form>
      ` : ""}
      ${order.paymentRelease?.status === "Liberado" ? `
        <div class="proof-summary release-ok">
          <strong>Pago liberado</strong>
          <span>Codigo unico validado el ${escapeHtml(order.paymentRelease.releasedAt || "")}</span>
        </div>
      ` : ""}
      ${inspection && !order.sellerRating ? `
        <form class="secure-subform rating-form" id="sellerRatingForm">
          <strong>Calificar vendedor</strong>
          <select name="rating" required>
            <option value="">Selecciona una calificacion</option>
            <option value="5">5 - Excelente</option>
            <option value="4">4 - Muy bien</option>
            <option value="3">3 - Correcto</option>
            <option value="2">2 - Regular</option>
            <option value="1">1 - Malo</option>
          </select>
          <input name="comment" placeholder="Comentario opcional" />
          <button class="secondary-btn" type="submit">Enviar calificacion</button>
        </form>
      ` : ""}
      ${order.sellerRating ? `
        <div class="proof-summary">
          <strong>Vendedor calificado</strong>
          <span>${ratingStars(order.sellerRating.rating)} - ${Number(order.sellerRating.rating).toFixed(1)}/5</span>
        </div>
      ` : ""}
      <form class="secure-subform dispute-form" id="disputeForm">
        <strong>Abrir disputa</strong>
        <select name="reason" required>
          <option value="">Motivo</option>
          <option>Producto distinto al publicado</option>
          <option>Faltan accesorios</option>
          <option>Producto danado o manipulado</option>
          <option>No entregado / falsa entrega</option>
          <option>Presion para entregar codigo</option>
        </select>
        <input name="description" required placeholder="Describe que paso" />
        <input name="evidence" type="file" accept="image/*" multiple />
        <button class="danger-btn" type="submit">Bloquear y revisar</button>
      </form>
    </section>
  `;
};

const sellerHasRating = (seller = {}) => Number(seller.ratingCount || seller.reviews || 0) > 0;

const sellerRatingLabel = (seller = {}) =>
  sellerHasRating(seller)
    ? `${Number(seller.rating || 0).toFixed(1)} (${Number(seller.ratingCount || seller.reviews || 0)} ventas calificadas)`
    : "Sin calificaciones";

const ratingStars = (rating = 0) => {
  const rounded = Math.round(rating);
  return "*****".slice(0, rounded) + "-----".slice(0, 5 - rounded);
};

const productCard = (item) => `
  <button class="product-card" data-product="${item.id}">
    <div class="card-image">
      <img src="${item.images[0]}" alt="${escapeHtml(item.title)}" />
      ${trustBadge(item)}
    </div>
    <div class="card-body">
      <div class="card-kicker">${escapeHtml(item.category)} / ${escapeHtml(item.condition)}</div>
      <div class="card-title">${escapeHtml(item.title)}</div>
      <div class="rating-line ${sellerHasRating(item.seller) ? "" : "no-rating"}">
        ${sellerHasRating(item.seller) ? `<span>${ratingStars(item.seller.rating)}</span>` : "<span>Nuevo vendedor</span>"}
        <small>${escapeHtml(sellerRatingLabel(item.seller))}</small>
      </div>
      <div class="price">${money(item.price)}</div>
      ${item.promoted ? `<div class="ad-badge">Anuncio destacado</div>` : ""}
      <div class="security-strip">
        <span>Pago protegido</span>
      </div>
      <div class="card-meta">${escapeHtml(item.location)}</div>
      <div class="card-foot">
        <span>${escapeHtml(item.seller?.verified ? "Verificado" : "Nuevo")}</span>
        <strong>Ver</strong>
      </div>
    </div>
  </button>
`;

const featured = () => state.products.slice(0, 3);
const heroFeature = () => state.products[2] || state.products[0];

const heroVisual = () => {
  const item = heroFeature();
  if (!item) return "";
  return `
    <aside class="hero-visual" data-product="${item.id}">
      <div class="hero-visual-frame">
        <img src="${item.images[0]}" alt="${escapeHtml(item.title)}" />
      </div>
      <div class="hero-visual-card">
        <span>Featured asset</span>
        <strong>${escapeHtml(item.title)}</strong>
        <b>${money(item.price)}</b>
      </div>
    </aside>
  `;
};

const commandBar = () => `
  <section class="command-bar">
    <div>
      <span>Identidad</span>
      <strong>Vendedores revisados antes de publicar</strong>
    </div>
    <div>
      <span>Pago</span>
      <strong>Pago con Mercado Pago y orden protegida</strong>
    </div>
    <div>
      <span>Operacion</span>
      <strong>Orden, chat y entrega en un solo flujo</strong>
    </div>
  </section>
`;

const securityProtocol = () => `
  <section class="security-protocol">
    <div>
      <p class="eyebrow">Compra protegida</p>
      <h2>Identidad, pago y entrega bajo control.</h2>
      <p>MarketPro conserva la evidencia clave de cada operacion y evita pagos fuera de la app.</p>
    </div>
    <div class="fraud-grid">
      ${fraudScenarios.map((scenario) => `<article><strong>${escapeHtml(scenario.title)}</strong><span>${escapeHtml(scenario.text)}</span></article>`).join("")}
    </div>
  </section>
`;

const offerSummary = () => `
  <section class="offer-summary">
    <p class="eyebrow">MarketPro</p>
    <h2>Compra simple. Venta verificada.</h2>
    <p>Publicaciones claras, chat conectado, pago por Mercado Pago y entrega con codigo unico.</p>
  </section>
`;

const securityView = () => `
  <main>
    <section class="panel trust-center">
      <p class="eyebrow">Centro de confianza</p>
      <h1>MarketPro protege identidad, pago, chat y entrega.</h1>
      <p class="muted">Esta pantalla muestra lo que el usuario necesita saber. Los controles internos sensibles quedan solo para administracion.</p>
      <div class="trust-center-grid">
        ${reviewReadiness.map(([title, text]) => `<article><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></article>`).join("")}
      </div>
    </section>
    ${securityProtocol()}
    <section class="panel secure-flow-panel">
      <p class="eyebrow">Entrega con codigo unico</p>
      <h2>El vendedor no recibe liberacion si el comprador no entrega el codigo correcto.</h2>
      <div class="secure-flow">
        <span>1. Orden y pago por Mercado Pago</span>
        <span>2. Publicacion congelada</span>
        <span>3. Evidencia del vendedor</span>
        <span>4. Revision del comprador</span>
        <span>5. Codigo unico y cierre</span>
      </div>
    </section>
  </main>
`;

const supportView = () => `
  <main>
    <section class="panel support-panel">
      <p class="eyebrow">Soporte MarketPro</p>
      <h1>Reporta problemas de cuenta, compra, venta o seguridad.</h1>
      <p class="muted">El mensaje queda guardado para el admin con tu identidad de sesion y prioridad de riesgo.</p>
      <form id="supportForm" class="support-form">
        <div class="two-col">
          <div class="field">
            <label>Tipo de ayuda</label>
            <select name="topic" required>
              <option>Problema de compra</option>
              <option>Problema de venta</option>
              <option>Cuenta o verificacion</option>
              <option>Pago Mercado Pago</option>
              <option>Estafa o seguridad</option>
            </select>
          </div>
          <div class="field"><label>Contacto</label><input name="contact" value="${escapeHtml(state.user?.email || "")}" placeholder="Email o telefono" /></div>
        </div>
        <div class="field"><label>Mensaje</label><textarea name="message" required placeholder="Cuenta que paso con detalles, numero de orden o publicacion"></textarea></div>
        <button class="buy-action" type="submit">Enviar soporte</button>
      </form>
    </section>
  </main>
`;

const legalView = () => `
  <main>
    <section class="panel legal-panel">
      <p class="eyebrow">Privacidad y condiciones</p>
      <h1>Datos usados para seguridad, no para decorar perfiles.</h1>
      <div class="legal-grid">
        <article><strong>Datos de cuenta</strong><span>Gmail, contrasena protegida, telefono, cedula, foto de rostro y foto frontal del documento para revision admin.</span></article>
        <article><strong>Operaciones</strong><span>Publicaciones, chats, ordenes, evidencias, reportes, pagos derivados a Mercado Pago y estados de entrega.</span></article>
        <article><strong>Pagos</strong><span>MarketPro no almacena tarjetas. El pago se realiza en Mercado Pago vinculado a la app.</span></article>
        <article><strong>Eliminacion</strong><span>Desde Mi cuenta puedes solicitar/eliminar tu cuenta. Tus publicaciones quedan pausadas para evitar operaciones incompletas.</span></article>
        <article><strong>Moderacion</strong><span>Reportes de publicaciones, chats y disputas quedan disponibles para el admin.</span></article>
        <article><strong>Seguridad</strong><span>No compartas codigos antes de revisar el articulo. El codigo unico cambia por cada orden.</span></article>
      </div>
    </section>
  </main>
`;

const featuredRail = () => `
  <section class="featured-rail">
    <div>
      <p class="eyebrow">Seleccion curada</p>
      <h2>Destacados de la semana</h2>
    </div>
    <div class="featured-items">
      ${featured()
        .map(
          (item) => `
          <button class="featured-item" data-product="${item.id}">
            <img src="${item.images[0]}" alt="${escapeHtml(item.title)}" />
            <span>${escapeHtml(item.category)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <b>${money(item.price)}</b>
          </button>`
        )
        .join("")}
    </div>
  </section>
`;

const entryGate = () => `
  <main class="entry-shell">
    <div class="entry-brand-top">
      <img class="brand-logo" src="/mp-logo.svg" alt="MP" />
      <span>MarketPro</span>
    </div>
    <section class="entry-copy">
      <p class="eyebrow">Acceso seguro</p>
      <h1>Cuenta segura.<br />Verificacion real.</h1>
      <p>Identidad revisada, pagos vinculados y entrega protegida.</p>
      <div class="entry-trust">
        <span>Gmail + contrasena</span>
        <span>Cedula revisable</span>
        <span>Rostro visible</span>
        <span>GPS o direccion</span>
      </div>
      <div class="entry-ops">
        <article><strong>Cuenta</strong><span>Acceso privado</span></article>
        <article><strong>ID</strong><span>Revision manual</span></article>
        <article><strong>Pago</strong><span>Mercado Pago</span></article>
      </div>
    </section>
    <section class="panel auth-card entry-card secure-entry-card">
      <div class="entry-card-head">
        <div>
          <p class="eyebrow">Cuenta privada</p>
          <h2>Completa tu acceso</h2>
        </div>
        <div class="verification-seal">
          <span>MP</span>
          <small>ID</small>
        </div>
      </div>
      <div class="auth-switch">
        <button class="${state.authMode === "login" ? "active" : ""}" type="button" data-auth-mode="login">Entrar</button>
        <button class="${state.authMode === "register" ? "active" : ""}" type="button" data-auth-mode="register">Crear</button>
      </div>
      ${state.authMode === "login" ? `<section class="login-panel">
        <div class="block-title"><span>Entrar</span><small>Si ya tienes cuenta, usa tu Gmail y contrasena</small></div>
        <form id="loginForm" novalidate>
          <div class="field"><label>Gmail</label><input name="email" required type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="tu@gmail.com" /></div>
          <div class="field"><label>Contrasena</label><input name="password" required type="password" autocomplete="current-password" placeholder="Tu contrasena" /></div>
          <button class="buy-action" type="submit">Entrar a MarketPro</button>
        </form>
        <button class="register-link-btn" type="button" data-auth-mode="register">No tengo cuenta, quiero registrarme</button>
        <form id="resetRequestForm" class="mini-auth-form" novalidate>
          <input name="email" required type="email" placeholder="Gmail para recuperar" />
          <button class="secondary-btn" type="submit">Recuperar</button>
        </form>
        <form id="resetConfirmForm" class="mini-auth-form" novalidate>
          <input name="email" required type="email" placeholder="Gmail" />
          <input name="code" required placeholder="Codigo" />
          <input name="password" required type="password" minlength="8" placeholder="Nueva contrasena" />
          <button class="secondary-btn" type="submit">Cambiar</button>
        </form>
      </section>` : `

      <form id="entryForm" novalidate>
        <div class="register-intro">
          <strong>Crear cuenta nueva</strong>
          <span>Completa los datos una sola vez. El admin revisa tu identidad antes de permitirte vender.</span>
        </div>
        <div class="auth-steps">
          <div><span>1</span><strong>Cuenta</strong><small>Gmail y contrasena</small></div>
          <div><span>2</span><strong>Revision</strong><small>Datos para aprobar</small></div>
        </div>

        <div class="onboarding-block">
          <div class="block-title"><span>Cuenta</span><small>Tu acceso principal</small></div>
          <div class="field"><label>Gmail</label><input name="email" required type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="tu@gmail.com" /></div>
          <div class="field"><label>Contrasena</label><input name="password" required type="password" minlength="8" autocomplete="current-password" placeholder="Minimo 8 caracteres" /></div>
        </div>

        <div class="onboarding-block">
          <div class="block-title"><span>Identidad</span><small>Debe coincidir con la cedula</small></div>
          <div class="field"><label>Nombre completo</label><input name="name" required autocomplete="name" placeholder="Tu nombre real" /></div>
          <div class="two-col">
            <div class="field"><label>Cedula / documento</label><input name="cedula" required placeholder="Documento de identidad" /></div>
            <div class="field"><label>Telefono</label><input name="phone" required type="tel" autocomplete="tel" placeholder="Telefono verificable" /></div>
          </div>
        </div>

        <div class="onboarding-block">
          <div class="block-title"><span>Ubicacion</span><small>Obligatoria para seguridad</small></div>
          <div class="field">
            <label>Ubicacion exacta</label>
            <div class="location-field">
              <input id="exactLocationInput" name="exactLocation" required autocomplete="street-address" placeholder="Calle, numero, ciudad o coordenadas" />
              <button class="secondary-btn" type="button" id="useDeviceLocation">Usar GPS</button>
            </div>
          </div>
        </div>

        <div class="onboarding-block">
          <div class="block-title"><span>Fotos</span><small>Solo para revision privada</small></div>
          <div class="identity-upload-grid">
            <label class="upload-card">
              <span>Foto de rostro</span>
              <small>Selfie clara, de frente y sin lentes oscuros.</small>
              <input name="profilePhoto" required type="file" accept="image/*" capture="user" />
            </label>
            <label class="upload-card">
              <span>Foto frontal de cedula</span>
              <small>Parte frontal completa, enfocada y legible.</small>
              <input name="documentPhoto" required type="file" accept="image/*" />
            </label>
          </div>
        </div>
        <button class="sell-action" type="submit">Entrar y enviar verificacion</button>
        <small class="private-note">Estos datos solo aparecen en el panel privado del creador/admin.</small>
      </form>`}
      ${canShowAdminEntry() ? `<section class="admin-entry">
        <div>
          <span>Acceso del creador</span>
          <small>No requiere verificacion de comprador/vendedor.</small>
        </div>
        <form id="adminEntryForm">
          <input name="password" required type="password" placeholder="Contrasena admin" />
          <button type="submit">Entrar como admin</button>
        </form>
        <a href="/admin.html">Abrir panel privado</a>
      </section>` : ""}
      <nav class="entry-legal-links">
        <button type="button" data-view="security">Seguridad</button>
        <button type="button" data-view="support">Soporte</button>
        <button type="button" data-view="legal">Privacidad</button>
      </nav>
    </section>
    ${pwaInstallCard()}
  </main>
`;

const feedView = () => {
  const products = filteredProducts();
  return `
    ${sidebar()}
    <main>
      <div class="toolbar-row">
        <button type="button" class="filter-toggle" data-filter-toggle>
          ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
        </button>
      </div>
      <section class="hero-panel">
        <div>
          <p class="eyebrow">MarketPro verificado</p>
          <h1>Compra y vende con verificacion real.</h1>
          <p>Vendedores revisados, pago vinculado y entrega protegida por codigo unico.</p>
          <div class="hero-metrics">
            <span><strong>${products.length}</strong> publicaciones</span>
            <span><strong>Pago</strong> protegido</span>
            <span><strong>ID</strong> verificada</span>
          </div>
        </div>
        ${heroVisual()}
        <div class="hero-cta-stack">
          <button class="sell-action hero-action" data-view="compose">Vender</button>
          <button class="buy-action hero-action" data-view="profile">Verificarme</button>
        </div>
      </section>
      ${commandBar()}
      ${featuredRail()}
      <div class="content-head">
        <div>
          <h2>Catalogo verificado</h2>
          <div class="muted">${products.length} resultados</div>
        </div>
      </div>
      ${
        products.length
          ? `<section class="grid">${products.map(productCard).join("")}</section>`
          : `<div class="empty">No encontramos articulos con esos filtros.</div>`
      }
      <section class="luxury-strip closing-strip">
        <article><span>01</span><strong>Validacion de vendedor</strong><p>Las publicaciones se habilitan con perfil revisado.</p></article>
        <article><span>02</span><strong>Checkout interno</strong><p>Direccion, metodo y comprobante quedan en la orden.</p></article>
        <article><span>03</span><strong>Entrega confirmada</strong><p>El pago se libera cuando la recepcion queda validada.</p></article>
      </section>
      <div class="closing-shield">
        ${shieldMatrix()}
      </div>
      ${offerSummary()}
    </main>
  `;
};

const detailView = () => {
  const item = selectedProduct();
  if (!item) return feedView();
  const currentImage = item.images[state.galleryIndex] || item.images[0];
  const similar = state.products.filter((product) => product.id !== item.id && product.category === item.category).slice(0, 4);
  return `
    ${sidebar()}
    <main>
      <div class="toolbar-row">
        <button type="button" class="filter-toggle" data-filter-toggle>
          ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
        </button>
      </div>
      <button class="text-btn" data-view="feed">Volver al feed</button>
      <section class="detail-grid">
        <div class="panel gallery-panel">
          <div class="gallery-main"><img src="${currentImage}" alt="${escapeHtml(item.title)}" /></div>
          <div class="thumbs">
            ${item.images
              .map(
                (src, index) => `
                <button class="thumb ${index === state.galleryIndex ? "active" : ""}" data-thumb="${index}">
                  <img src="${src}" alt="Foto ${index + 1}" />
                </button>`
              )
              .join("")}
          </div>
        </div>
        <aside class="panel detail-panel">
          <div class="detail-topline">
            ${trustBadge(item)}
            <span class="pill">${item.safeMeetup ? "Entrega segura" : "Coordinar con cuidado"}</span>
          </div>
          <h1 class="detail-title">${escapeHtml(item.title)}</h1>
          <div class="price">${money(item.price)}</div>
          <p class="muted">${escapeHtml(item.location)} - ${escapeHtml(item.postedAt)}</p>
          <p>${escapeHtml(item.description)}</p>
          <div class="seller">
            <img src="${item.seller.avatar}" alt="${escapeHtml(item.seller.name)}" />
            <div>
              <strong>${escapeHtml(item.seller.name)}</strong>
              <div class="muted">Perfil verificado - ${escapeHtml(sellerRatingLabel(item.seller))}</div>
            </div>
          </div>
          <section class="identity-panel">
            <div>
              <span>Vendedor</span>
              <strong>${escapeHtml(item.seller.name)}</strong>
              <small>Identidad, reputacion y actividad revisadas.</small>
            </div>
            <div>
              <span>Comprador</span>
              <strong>${escapeHtml(currentIdentity().name)}</strong>
              <small>Estos datos se muestran al iniciar compra segura.</small>
            </div>
          </section>
          <section class="seller-proof">
            ${sellerReliability(item).map((proof) => `<span>${escapeHtml(proof)}</span>`).join("")}
          </section>
          <section class="risk-panel ${listingRiskFor(item).level.toLowerCase()}">
            <span>Analisis antiestafa</span>
            <strong>Riesgo ${escapeHtml(listingRiskFor(item).level)} · Score ${escapeHtml(listingRiskFor(item).score)}</strong>
            <small>${listingRiskFor(item).flags?.length ? escapeHtml(listingRiskFor(item).flags.join(" / ")) : "Sin senales criticas detectadas. Mantente dentro de MarketPro."}</small>
          </section>
          ${securityLedger(item)}
          <div class="safety-card">
            <strong>Proteccion MarketPro</strong>
            ${safetyRules.slice(0, 3).map((rule) => `<span>${rule}</span>`).join("")}
          </div>
          ${state.checkoutOrder?.productId === item.id ? `
            <section class="checkout-receipt">
              <span>Compra iniciada</span>
              <strong>${escapeHtml(state.checkoutOrder.status)}</strong>
              <small>Orden ${escapeHtml(state.checkoutOrder.id)} - Codigo unico de entrega/liberacion: ${escapeHtml(state.checkoutOrder.delivery.code)}. No se comparte antes de revisar. Huella: ${escapeHtml(state.checkoutOrder.security.stamp.productFingerprint)}. Riesgo: ${escapeHtml(state.checkoutOrder.security.stamp.riskLevel)}.</small>
              <a class="buy-action checkout-link" href="${escapeHtml(state.checkoutOrder.mercadoPago.checkoutUrl)}" target="_blank" rel="noopener">Abrir Mercado Pago</a>
              ${deliveryWorkflow(state.checkoutOrder)}
            </section>
          ` : `
            <form class="checkout-box" id="checkoutForm">
              <strong>Comprar con Mercado Pago</strong>
              <input type="hidden" name="paymentMethod" value="mercadopago" />
              <div class="payment-provider">
                <span>Medio de pago vinculado</span>
                <strong>Mercado Pago</strong>
                <small>La app crea la orden protegida y deriva el cobro a Mercado Pago. MarketPro no guarda ni procesa tarjetas.</small>
              </div>
              <div class="two-col">
                <div class="field"><label>Direccion de entrega</label><input name="address" required placeholder="Calle, numero, apartamento" /></div>
                <div class="field"><label>Ciudad / zona</label><input name="city" required placeholder="Ciudad o barrio" /></div>
              </div>
              <div class="two-col">
                <div class="field"><label>Telefono de contacto</label><input name="phone" required value="${escapeHtml(state.user?.phone || "")}" placeholder="Telefono" /></div>
                <div class="field"><label>Metodo de entrega</label><select name="method" required><option>Retiro en punto seguro</option><option>Envio coordinado</option><option>Entrega personal verificada</option></select></div>
              </div>
              <div class="field"><label>Nota para entrega</label><input name="note" placeholder="Horario, referencia o instrucciones" /></div>
              <label class="check-row"><input type="checkbox" name="acceptedRules" required /> Acepto comprar solo dentro de MarketPro y no compartir codigos fuera del chat.</label>
              <label class="check-row"><input type="checkbox" name="declaredInspection" required /> Confirmo que voy a revisar articulo, accesorios y estado antes de liberar el pago.</label>
              <small>MarketPro congela publicacion, precio, vendedor, comprador y condiciones. El pago se procesa en Mercado Pago vinculado a la app.</small>
              <button class="buy-action" type="submit">Continuar con Mercado Pago</button>
            </form>
          `}
          <div class="detail-actions">
            <button class="buy-action" id="messageSeller">Contactar vendedor</button>
            <button class="secondary-btn" id="reportListing">Reportar</button>
          </div>
        </aside>
      </section>
      <section class="similar-section">
        <h2 class="panel-title">Similares</h2>
        <div class="grid">${similar.map(productCard).join("") || '<div class="empty">Sin similares por ahora.</div>'}</div>
      </section>
    </main>
  `;
};

const composeView = () => {
  if (isRejectedUser()) {
    return `
      ${sidebar()}
      <main>
        <div class="toolbar-row">
          <button type="button" class="filter-toggle" data-filter-toggle>
            ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        <section class="panel verification-gate rejected-gate">
          <p class="eyebrow">Atencion</p>
          <h1>Tu cuenta ha sido rechazada.</h1>
          <p class="muted">No cumples con los requisitos de seguridad de MarketPro. Por este motivo no puedes publicar ni vender articulos dentro de la app.</p>
          <button class="secondary-btn" data-view="profile">Ver estado de cuenta</button>
        </section>
      </main>
    `;
  }

  if (!isVerifiedSeller()) {
    return `
      ${sidebar()}
      <main>
        <div class="toolbar-row">
          <button type="button" class="filter-toggle" data-filter-toggle>
            ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        <section class="panel verification-gate">
          <p class="eyebrow">Verificacion requerida</p>
          <h1>Antes de vender tienes que registrarte y verificar tu identidad.</h1>
          <p class="muted">Para proteger a compradores y vendedores, pedimos cedula, telefono y ubicacion exacta. Esos datos quedan en la memoria privada del creador/admin.</p>
          <button class="sell-action" data-view="profile">Verificarme ahora</button>
        </section>
      </main>
    `;
  }

  return `
  ${sidebar()}
  <main>
    <div class="toolbar-row">
      <button type="button" class="filter-toggle" data-filter-toggle>
        ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
      </button>
    </div>
    <section class="compose-grid">
      <form class="panel form-panel" id="listingForm" novalidate>
        <p class="eyebrow">Seller Center</p>
        <h1>Publica como vendedor profesional.</h1>
        <div class="form-section">
          <h2>Fotos</h2>
          <div class="field">
            <label>Sube hasta 6 imagenes</label>
            <input id="photoInput" name="photos" type="file" accept="image/*" multiple />
          </div>
          <div class="photo-grid" id="photoGrid">
            <div class="photo-slot">Agregar fotos</div>
            <div class="photo-slot">Detalle</div>
            <div class="photo-slot">Estado</div>
          </div>
        </div>
        <div class="form-section">
          <h2>Datos del articulo</h2>
          <div class="two-col">
            <div class="field">
              <label>Titulo</label>
              <input name="title" required maxlength="72" autocomplete="off" placeholder="Ej: Mesa de comedor" />
            </div>
            <div class="field">
              <label>Precio USD</label>
              <input name="price" required type="number" inputmode="decimal" min="1" placeholder="120" />
            </div>
          </div>
          <div class="two-col">
            <div class="field">
              <label>Categoria</label>
              <select name="category">${categories.filter((c) => c !== "Todo").map((c) => `<option>${c}</option>`).join("")}</select>
            </div>
            <div class="field">
              <label>Condicion</label>
              <select name="condition"><option>Usado</option><option>Nuevo</option></select>
            </div>
          </div>
          <div class="field">
            <label>Descripcion</label>
            <textarea name="description" required minlength="30" placeholder="Describe estado real, uso, medidas, fallas y que incluye."></textarea>
          </div>
          <div class="field">
            <label>Ubicacion</label>
            <input name="location" required autocomplete="address-level2" placeholder="Barrio, ciudad" />
          </div>
        </div>
        <div class="form-section protocol-box">
          <h2>Protocolo de seguridad</h2>
          ${safetyRules.map((rule, index) => `
            <label class="check-row">
              <input type="checkbox" name="safety-${index}" required />
              <span>${rule}</span>
            </label>
          `).join("")}
        </div>
        <button class="sell-action" type="submit">Publicar producto</button>
      </form>
      <aside class="panel preview-panel">
        <h2 class="panel-title">Vista previa</h2>
        <div class="preview-card">
          <div class="preview-image-wrap" id="previewImage"></div>
          <div class="card-body">
            <div class="price" id="previewPrice">USD 0</div>
            <div class="card-title" id="previewTitle">Titulo del articulo</div>
            <div class="card-meta" id="previewLocation">Ubicacion</div>
            <div class="pill-row">
              <span class="pill" id="previewCategory">Categoria</span>
              <span class="pill" id="previewCondition">Condicion</span>
            </div>
          </div>
        </div>
        <div class="safety-card">
          <strong>Publicacion verificada</strong>
          <span>El producto aparecera con proteccion si aceptas el protocolo.</span>
        </div>
      </aside>
    </section>
  </main>
`;
};

const messagesView = () => {
  const active = state.conversations.find((chat) => chat.id === state.selectedChatId) || state.conversations[0];
  if (active && state.selectedChatId !== active.id) state.selectedChatId = active.id;
  return `
    ${sidebar()}
    <main>
      <div class="toolbar-row">
        <button type="button" class="filter-toggle" data-filter-toggle>
          ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
        </button>
      </div>
      <section class="panel chat-shell">
      <aside class="chat-sidebar">
        <h2 class="panel-title">Chats seguros</h2>
        <div class="chat-list">
          ${state.conversations
            .map(
              (chat) => `
              <button class="chat-row ${chat.id === state.selectedChatId ? "active" : ""}" data-chat="${chat.id}">
                <img src="${chat.avatar}" alt="${escapeHtml(chat.seller)}" />
                <div>
                  <strong>${escapeHtml(chat.seller)}</strong>
                  <div class="muted">${escapeHtml(chat.productTitle)}</div>
                </div>
              </button>`
            )
            .join("")}
        </div>
      </aside>
      ${
        active
          ? `<section class="chat-main">
              <div class="chat-header">
                <img src="${active.avatar}" alt="${escapeHtml(active.seller)}" />
                <div>
                  <strong>${escapeHtml(active.seller)}</strong>
                  <div class="muted">${escapeHtml(active.productTitle)}</div>
                </div>
              </div>
              <div class="chat-warning">
                No compartas codigos, claves ni datos bancarios. Coordina entrega en un punto publico.
              </div>
              <div class="messages">
                ${active.messages
                  .map(
                    (msg) => `
                    <div class="bubble ${isMyMessage(msg) ? "me" : ""} ${msg.from === "system" ? "system" : ""}">
                      ${msg.senderName && msg.from !== "system" ? `<span>${escapeHtml(msg.senderName)}</span>` : ""}
                      ${escapeHtml(msg.text)}
                      ${msg.risk?.level && msg.risk.level !== "Bajo" ? `<small class="risk-note">Alerta ${escapeHtml(msg.risk.level)}: ${escapeHtml(msg.risk.flags.join(", "))}</small>` : ""}
                    </div>`
                  )
            .join("")}
              </div>
              <div class="chat-tools">
                <button class="secondary-btn" id="reportChat">Reportar chat</button>
                <button class="danger-btn" id="blockChat">${active.blocked ? "Chat bloqueado" : "Bloquear chat"}</button>
              </div>
              <form class="message-form" id="messageForm">
                <input name="message" autocomplete="off" placeholder="${active.blocked ? "Chat bloqueado por seguridad" : "Escribe dentro del chat seguro"}" ${active.blocked ? "disabled" : ""} />
                <button class="send-btn" title="Enviar" ${active.blocked ? "disabled" : ""}>Enviar</button>
              </form>
            </section>`
          : `<div class="empty">Todavia no tienes chats reales. Abre una publicacion y contacta al vendedor para iniciar una conversacion conectada.</div>`
      }
      </section>
    </main>
  `;
};

const profileView = () => {
  if (!state.user) {
    return `
      ${sidebar()}
      <main>
        <div class="toolbar-row">
          <button type="button" class="filter-toggle" data-filter-toggle>
            ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        <section class="panel auth-card">
          <p class="eyebrow">Registro y verificacion</p>
          <h1>Crea tu cuenta segura de vendedor.</h1>
          <p class="muted">Estos datos son parte del protocolo de seguridad. Quedan guardados en la memoria privada del sistema y solo se muestran en el panel privado del creador/admin.</p>
          <form id="authForm" novalidate>
            <div class="two-col">
              <div class="field">
                <label>Nombre completo</label>
                <input name="name" required autocomplete="name" placeholder="Tu nombre" />
              </div>
              <div class="field">
                <label>Gmail</label>
                <input name="email" required type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="tu@gmail.com" />
              </div>
            </div>
            <div class="field">
              <label>Contrasena</label>
              <input name="password" required type="password" minlength="8" autocomplete="current-password" placeholder="Minimo 8 caracteres" />
            </div>
            <div class="two-col">
              <div class="field">
                <label>Cedula</label>
                <input name="cedula" required placeholder="Ej: 1.234.567-8" />
              </div>
              <div class="field">
                <label>Telefono</label>
                <input name="phone" required type="tel" autocomplete="tel" placeholder="Ej: 099 123 456" />
              </div>
            </div>
            <div class="field">
              <label>Ubicacion exacta</label>
              <input name="exactLocation" required autocomplete="street-address" placeholder="Calle, numero, ciudad" />
            </div>
            <div class="two-col">
              <div class="field">
                <label>Foto de rostro</label>
                <input name="profilePhoto" required type="file" accept="image/*" capture="user" />
              </div>
              <div class="field">
                <label>Foto frontal de cedula</label>
                <input name="documentPhoto" required type="file" accept="image/*" />
              </div>
            </div>
            <button class="sell-action" type="submit">Registrarme y verificarme</button>
          </form>
        </section>
      </main>
    `;
  }

  if (isRejectedUser()) {
    return `
      ${sidebar()}
      <main>
        <div class="toolbar-row">
          <button type="button" class="filter-toggle" data-filter-toggle>
            ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        <section class="panel verification-gate rejected-gate">
          <p class="eyebrow">Atencion</p>
          <h1>Tu cuenta ha sido rechazada.</h1>
          <p class="muted">No cumples con los requisitos de seguridad de MarketPro. La publicacion y venta de articulos queda bloqueada.</p>
          <div class="seller-metrics">
            <div class="metric-card">
              <span>Estado</span>
              <strong>${escapeHtml(state.user.verificationStatus || "Rechazada")}</strong>
            </div>
            <div class="metric-card">
              <span>Email</span>
              <strong>${escapeHtml(state.user.email)}</strong>
            </div>
          </div>
          <button class="secondary-btn logout-btn" id="logoutUser">Cerrar sesion</button>
          <button class="danger-btn account-delete-btn" id="deleteAccount">Eliminar cuenta</button>
        </section>
      </main>
    `;
  }

  if (!isVerifiedSeller()) {
    return `
      ${sidebar()}
      <main>
        <div class="toolbar-row">
          <button type="button" class="filter-toggle" data-filter-toggle>
            ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        <section class="panel verification-gate">
          <p class="eyebrow">Verificacion pendiente</p>
          <h1>Tu cuenta esta esperando revision del administrador.</h1>
          <p class="muted">Tus datos fueron guardados en la memoria privada. Cuando el admin corrobore cedula, telefono y ubicacion exacta, vas a poder publicar productos.</p>
          <div class="seller-metrics">
            <div class="metric-card">
              <span>Estado</span>
              <strong>${escapeHtml(state.user.verificationStatus || "Pendiente")}</strong>
            </div>
            <div class="metric-card">
              <span>Email</span>
              <strong>${escapeHtml(state.user.email)}</strong>
            </div>
          </div>
          <button class="secondary-btn logout-btn" id="logoutUser">Cerrar sesion</button>
          <button class="danger-btn account-delete-btn" id="deleteAccount">Eliminar cuenta</button>
        </section>
      </main>
    `;
  }

  const dashboard = state.sellerDashboard;
  const stats = dashboard?.stats || { active: 0, sold: 0, balance: 0, pendingBalance: 0, grossSales: 0, securityScore: 98 };
  const mine = state.products.filter((item) => item.seller?.email === state.user.email || item.seller?.name === state.user.name);
  const visible = mine.filter((item) => (state.profileTab === "sold" ? item.status === "sold" : item.status !== "sold"));
  return `
    ${sidebar()}
    <main>
      <div class="toolbar-row">
        <button type="button" class="filter-toggle" data-filter-toggle>
          ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
        </button>
      </div>
      <section class="panel profile-panel">
        <div class="profile-head">
          <div class="avatar-btn large">${state.user.name[0]}</div>
          <div>
            <h1>${escapeHtml(state.user.name)}</h1>
            <div class="muted">${escapeHtml(state.user.email)} - ${escapeHtml(state.user.verificationStatus)} - Protocolo activo</div>
          </div>
          <button class="secondary-btn logout-btn" id="logoutUser">Cerrar sesion</button>
        </div>
        <section class="seller-metrics">
          <div class="metric-card">
            <span>Saldo disponible</span>
            <strong>${money(stats.balance)}</strong>
          </div>
          <div class="metric-card">
            <span>Saldo pendiente</span>
            <strong>${money(stats.pendingBalance)}</strong>
          </div>
          <div class="metric-card">
            <span>Publicaciones activas</span>
            <strong>${stats.active}</strong>
          </div>
          <div class="metric-card">
            <span>Vendidos</span>
            <strong>${stats.sold}</strong>
          </div>
        </section>
        <div class="profile-list">
          <button class="profile-tab ${state.profileTab === "active" ? "active" : ""}" data-profile-tab="active">Activos</button>
          <button class="profile-tab ${state.profileTab === "sold" ? "active" : ""}" data-profile-tab="sold">Vendidos</button>
        </div>
      </section>
      <section class="panel promotion-panel">
        <div>
          <p class="eyebrow">Anuncio principal</p>
          <h2>Destaca un producto por US$ 1</h2>
          <p class="muted">Tu publicacion aparece primero en la pagina principal como anuncio destacado. El pago se realiza por Mercado Pago vinculado a MarketPro.</p>
        </div>
        ${
          mine.filter((item) => item.status !== "sold").length
            ? `<form id="promotionForm" class="promotion-form">
                <select name="productId" required>
                  <option value="">Elige una publicacion</option>
                  ${mine
                    .filter((item) => item.status !== "sold")
                    .map((item) => `<option value="${item.id}">${item.promoted ? "Destacado - " : ""}${escapeHtml(item.title)}</option>`)
                    .join("")}
                </select>
                <button class="sell-action" type="submit">Pagar US$ 1 y destacar</button>
              </form>`
            : `<div class="empty">Publica un producto activo para poder destacarlo.</div>`
        }
      </section>
      <section class="panel account-control-panel">
        <div>
          <p class="eyebrow">Cuenta</p>
          <h2>Control de privacidad</h2>
          <p class="muted">Puedes cerrar sesion o eliminar la cuenta. Si eliminas la cuenta, tus publicaciones quedan pausadas para evitar ventas incompletas.</p>
        </div>
        <div class="account-actions">
          <button class="secondary-btn logout-btn" id="logoutUser">Cerrar sesion</button>
          <button class="danger-btn" id="deleteAccount">Eliminar cuenta</button>
        </div>
      </section>
      <section class="grid profile-grid">
        ${
          visible.length
            ? visible
                .map(
                  (item) => `
                  <article class="product-card">
                    <button data-product="${item.id}" class="unstyled-card-button">
                      <div class="card-image"><img src="${item.images[0]}" alt="${escapeHtml(item.title)}" />${trustBadge(item)}</div>
                      <div class="card-body">
                        <div class="price">${money(item.price)}</div>
                        <div class="card-title">${escapeHtml(item.title)}</div>
                        <div class="card-meta">${item.status === "sold" ? "Vendido" : "Activo"}</div>
                      </div>
                    </button>
                    <div class="card-body actions-row">
                      <button class="sell-action" data-promote="${item.id}">${item.promoted ? "Destacado" : "Anunciar US$ 1"}</button>
                      <button class="secondary-btn" data-toggle-sold="${item.id}">${item.status === "sold" ? "Reactivar" : "Vendido"}</button>
                      <button class="danger-btn" data-delete="${item.id}">Eliminar</button>
                    </div>
                  </article>`
                )
                .join("")
            : `<div class="empty">No hay publicaciones en esta seccion.</div>`
        }
      </section>
    </main>
  `;
};

const view = () =>
  ({
    feed: feedView,
    detail: detailView,
    compose: composeView,
    messages: messagesView,
    profile: profileView,
    security: securityView,
    support: supportView,
    legal: legalView
  })[state.view]();

const render = () => {
  const publicView = ["security", "support", "legal"].includes(state.view);
  if (!hasCompleteAccess() && !publicView) {
    app.innerHTML = `<div class="app-shell">${entryGate()}</div>`;
    bindEvents();
    return;
  }
  app.innerHTML = `
    <div class="app-shell">
      ${topbar()}
      ${pwaInstallCard()}
      <div class="main-layout view-surface ${state.filtersOpen ? "" : "filters-collapsed"}" data-view-key="${state.viewKey}">${view()}</div>
      ${appFooter()}
    </div>
  `;
  bindEvents();
};

const bindEvents = () => {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });

  document.querySelectorAll("[data-filter-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filtersOpen = !state.filtersOpen;
      localStorage.setItem("marketFiltersOpen", JSON.stringify(state.filtersOpen));
      render();
    });
  });

  document.querySelector("#globalSearch")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    if (state.view !== "feed") state.view = "feed";
    render();
  });

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters.category = button.dataset.category;
      state.view = "feed";
      render();
    });
  });

  ["minPrice", "maxPrice", "distance", "condition"].forEach((id) => {
    document.querySelector(`#${id}`)?.addEventListener("input", (event) => {
      state.filters[id] = event.target.value;
      render();
    });
  });

  document.querySelector("#clearFilters")?.addEventListener("click", () => {
    state.filters = { category: "Todo", minPrice: "", maxPrice: "", distance: "50", condition: "Todas" };
    render();
  });

  document.querySelectorAll("[data-product]").forEach((button) => {
    button.addEventListener("click", () => navigate("detail", { selectedProductId: button.dataset.product, galleryIndex: 0 }));
  });

  document.querySelectorAll("[data-thumb]").forEach((button) => {
    button.addEventListener("click", () => {
      state.galleryIndex = Number(button.dataset.thumb);
      render();
    });
  });

  document.querySelector("#messageSeller")?.addEventListener("click", startConversation);
  document.querySelector("#checkoutForm")?.addEventListener("submit", secureCheckout);
  document.querySelector("#deliveryConfirmForm")?.addEventListener("submit", confirmDelivery);
  document.querySelector("#releasePaymentForm")?.addEventListener("submit", releasePayment);
  document.querySelector("#sellerRatingForm")?.addEventListener("submit", rateSeller);
  document.querySelector("#sellerProofForm")?.addEventListener("submit", submitSellerProof);
  document.querySelector("#markTransitForm")?.addEventListener("submit", markOrderInTransit);
  document.querySelector("#disputeForm")?.addEventListener("submit", openDispute);
  document.querySelector("#entryForm")?.addEventListener("submit", authenticate);
  document.querySelector("#installPwa")?.addEventListener("click", installPwa);
  document.querySelector("#loginForm")?.addEventListener("submit", loginUser);
  document.querySelector("#resetRequestForm")?.addEventListener("submit", requestPasswordReset);
  document.querySelector("#resetConfirmForm")?.addEventListener("submit", confirmPasswordReset);
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      render();
    });
  });
  document.querySelector("#adminEntryForm")?.addEventListener("submit", authenticateAdminEntry);
  document.querySelector("#logoutUser")?.addEventListener("click", logoutUser);
  document.querySelector("#useDeviceLocation")?.addEventListener("click", useDeviceLocation);
  document.querySelector("#reportListing")?.addEventListener("click", reportListing);
  document.querySelectorAll("input[name='paymentMethod']").forEach((input) => {
    input.addEventListener("change", () => {
      state.paymentMethod = input.value;
      render();
    });
  });
  document.querySelector("#listingForm")?.addEventListener("input", updatePreview);
  document.querySelector("#listingForm")?.addEventListener("submit", publishListing);
  document.querySelector("#promotionForm")?.addEventListener("submit", promoteFromForm);
  document.querySelector("#photoInput")?.addEventListener("change", previewPhotos);
  document.querySelector("#authForm")?.addEventListener("submit", authenticate);

  document.querySelectorAll("[data-chat]").forEach((button) => {
    button.addEventListener("click", () => navigate("messages", { selectedChatId: button.dataset.chat }));
  });

  document.querySelector("#messageForm")?.addEventListener("submit", sendMessage);
  document.querySelector("#reportChat")?.addEventListener("click", reportActiveChat);
  document.querySelector("#blockChat")?.addEventListener("click", blockActiveChat);
  document.querySelector("#supportForm")?.addEventListener("submit", submitSupport);
  document.querySelector("#deleteAccount")?.addEventListener("click", deleteAccount);

  document.querySelectorAll("[data-profile-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.profileTab = button.dataset.profileTab;
      render();
    });
  });

  document.querySelectorAll("[data-promote]").forEach((button) => {
    button.addEventListener("click", () => promoteProduct(button.dataset.promote));
  });

  document.querySelectorAll("[data-toggle-sold]").forEach((button) => {
    button.addEventListener("click", () => toggleSold(button.dataset.toggleSold));
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteListing(button.dataset.delete));
  });
};

const updatePreview = (event) => {
  const form = event.currentTarget;
  const data = new FormData(form);
  document.querySelector("#previewTitle").textContent = data.get("title") || "Titulo del articulo";
  document.querySelector("#previewPrice").textContent = money(Number(data.get("price") || 0));
  document.querySelector("#previewLocation").textContent = data.get("location") || "Ubicacion";
  document.querySelector("#previewCategory").textContent = data.get("category") || "Categoria";
  document.querySelector("#previewCondition").textContent = data.get("condition") || "Condicion";
};

const previewPhotos = (event) => {
  const files = [...event.target.files].slice(0, 6);
  const grid = document.querySelector("#photoGrid");
  const preview = document.querySelector("#previewImage");
  grid.innerHTML = "";
  files.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = () => {
      grid.insertAdjacentHTML(
        "beforeend",
        `<div class="photo-slot image-slot"><img class="preview-image" src="${reader.result}" alt="Foto ${index + 1}" /></div>`
      );
      if (index === 0) preview.innerHTML = `<img class="preview-image" src="${reader.result}" alt="Vista previa" />`;
    };
    reader.readAsDataURL(file);
  });
};

const compressImage = (file, maxSize = 1280, quality = 0.72) =>
  new Promise((resolve) => {
    if (!file || !file.size) {
      resolve("");
      return;
    }
    if (!file.type?.startsWith("image/")) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });

const collectPhotos = async (input) => {
  const files = [...(input?.files || [])].slice(0, 6);
  if (!files.length) return [`/api/demo-photo/new-${Date.now()}.svg`];
  return Promise.all(files.map((file) => compressImage(file, 1280, 0.72)));
};

const fileToDataUrl = (file) => compressImage(file, 1100, 0.74);

const requiredValue = (data, key) => String(data.get(key) || "").trim();

const validateAccountForm = (data) => {
  const email = requiredValue(data, "email").toLowerCase();
  const password = String(data.get("password") || "");
  const required = ["name", "email", "cedula", "phone", "exactLocation"].filter((key) => !requiredValue(data, key));
  if (required.length) return `Faltan datos obligatorios: ${required.join(", ")}`;
  if (!email.endsWith("@gmail.com")) return "Usa un Gmail valido para crear la cuenta segura.";
  if (password.length < 8) return "La contrasena debe tener al menos 8 caracteres.";
  if (!data.get("profilePhoto")?.size) return "Sube una foto clara de tu rostro.";
  if (!data.get("documentPhoto")?.size) return "Sube la foto frontal de tu cedula.";
  return "";
};

const validateListingForm = (data) => {
  const required = ["title", "price", "category", "condition", "description", "location"].filter((key) => !requiredValue(data, key));
  if (required.length) return `Faltan datos del articulo: ${required.join(", ")}`;
  if (Number(data.get("price")) <= 0) return "El precio tiene que ser mayor a cero.";
  if (requiredValue(data, "description").length < 80) return "La descripcion tiene que tener al menos 80 caracteres: estado real, detalles, fallas, accesorios y forma de entrega.";
  if (Number(data.get("price")) > 1000 && !/serie|imei|factura|recibo|chasis|matricula|modelo|medida/i.test(`${requiredValue(data, "title")} ${requiredValue(data, "description")}`)) {
    return "Para articulos de valor agrega un identificador verificable: factura, serie, IMEI, chasis, matricula, modelo o medidas.";
  }
  const textRisk = analyzeMessageRisk(`${requiredValue(data, "title")} ${requiredValue(data, "description")} ${requiredValue(data, "location")}`);
  if (textRisk.level === "Alto") return `La publicacion contiene senales de riesgo: ${textRisk.flags.join(", ")}. Ajusta el texto para mantener la operacion dentro de MarketPro.`;
  return "";
};

const useDeviceLocation = () => {
  const input = document.querySelector("#exactLocationInput");
  if (!input) return;
  if (!navigator.geolocation) {
    alert("Este dispositivo no permite tomar ubicacion automatica. Escribe tu direccion exacta.");
    return;
  }
  input.value = "Tomando ubicacion...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      input.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (precision ${Math.round(accuracy)} m)`;
    },
    () => {
      input.value = "";
      alert("No se pudo obtener la ubicacion. Escribe calle, numero y ciudad.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
};

const publishListing = async (event) => {
  event.preventDefault();
  if (!isVerifiedSeller()) {
    navigate("profile");
    return;
  }
  const form = event.currentTarget;
  const data = new FormData(form);
  const validationError = validateListingForm(data);
  if (validationError) {
    alert(validationError);
    return;
  }
  const images = await collectPhotos(form.photos);
  if ((form.photos?.files || []).length < 2) {
    alert("Sube al menos 2 fotos reales del articulo para reducir disputas y mejorar la proteccion antiestafa.");
    return;
  }
  const created = await api("/api/products", {
    method: "POST",
    body: JSON.stringify({
      title: requiredValue(data, "title"),
      price: Number(data.get("price")),
      category: requiredValue(data, "category"),
      condition: requiredValue(data, "condition"),
      description: requiredValue(data, "description"),
      location: requiredValue(data, "location"),
      distance: 1,
      images,
      seller: {
        name: state.user.name,
        email: state.user.email,
        avatar: `/api/avatar/${encodeURIComponent(state.user.name)}.svg`,
        rating: 0,
        ratingCount: 0,
        verified: state.user.verified,
        verificationStatus: state.user.verificationStatus
      },
      verified: true,
      safeMeetup: true,
      safetyAccepted: true
    })
  });
  if (created.error) {
    alert(created.error);
    navigate("profile");
    return;
  }
  const product = normalizeProduct(created);
  state.products = [product, ...state.products];
  await refreshSellerDashboard();
  navigate("detail", { selectedProductId: product.id, galleryIndex: 0 });
};

const startConversation = async () => {
  const item = selectedProduct();
  const buyer = currentIdentity();
  const chat = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      productId: item.id,
      productTitle: item.title,
      sellerName: item.seller.name,
      sellerEmail: item.seller.email || "",
      sellerAvatar: item.seller.avatar,
      buyer
    })
  });
  const exists = state.conversations.some((conversation) => conversation.id === chat.id);
  state.conversations = exists ? state.conversations : [chat, ...state.conversations];
  navigate("messages", { selectedChatId: chat.id });
};

const reportListing = async () => {
  const item = selectedProduct();
  const reason = prompt("Motivo del reporte", "Posible estafa o informacion incorrecta");
  if (!reason) return;
  const result = await api(`/api/products/${item.id}/report`, {
    method: "POST",
    body: JSON.stringify({ reason, details: reason })
  });
  if (result.error) {
    alert(result.error);
    return;
  }
  state.products = state.products.map((product) => (product.id === item.id ? normalizeProduct(result.product) : product));
  alert("Gracias. Revisaremos esta publicacion.");
  render();
};

const activeChat = () => state.conversations.find((chat) => chat.id === state.selectedChatId) || state.conversations[0];

const reportActiveChat = async () => {
  const chat = activeChat();
  if (!chat) return;
  const reason = prompt("Motivo del reporte", "Mensaje sospechoso o intento de pago fuera de MarketPro");
  if (!reason) return;
  const result = await api(`/api/conversations/${chat.id}/report`, {
    method: "POST",
    body: JSON.stringify({ reason, details: reason })
  });
  if (result.error) {
    alert(result.error);
    return;
  }
  alert("Chat reportado. El admin podra revisar la evidencia.");
};

const blockActiveChat = async () => {
  const chat = activeChat();
  if (!chat || chat.blocked) return;
  if (!confirm("¿Bloquear este chat por seguridad? No se podran enviar mas mensajes en esta conversacion.")) return;
  const result = await api(`/api/conversations/${chat.id}/block`, {
    method: "POST",
    body: JSON.stringify({ reason: "Bloqueo solicitado por usuario" })
  });
  if (result.error) {
    alert(result.error);
    return;
  }
  state.conversations = state.conversations.map((item) => (item.id === chat.id ? { ...item, blocked: true } : item));
  alert("Chat bloqueado y enviado a revision.");
  render();
};

const submitSupport = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const result = await api("/api/support", {
    method: "POST",
    body: JSON.stringify({
      topic: requiredValue(data, "topic"),
      contact: requiredValue(data, "contact"),
      message: requiredValue(data, "message")
    })
  });
  if (result.error) {
    alert(result.error);
    return;
  }
  alert(`Soporte recibido. Ticket ${result.id}`);
  event.currentTarget.reset();
};

const secureCheckout = async (event) => {
  event.preventDefault();
  const item = selectedProduct();
  const buyer = currentIdentity();
  const data = new FormData(event.currentTarget);
  const order = await api("/api/checkout", {
    method: "POST",
    body: JSON.stringify({
      productId: item.id,
      paymentMethod: data.get("paymentMethod") || state.paymentMethod,
      buyer,
      delivery: {
        address: data.get("address"),
        city: data.get("city"),
        phone: data.get("phone"),
        method: data.get("method"),
        note: data.get("note")
      },
      acceptedRules: data.get("acceptedRules") === "on",
      declaredInspection: data.get("declaredInspection") === "on"
    })
  });
  if (order.error) {
    alert(`${order.error}${order.details ? "\nRevisa credenciales o cuenta de Mercado Pago." : ""}`);
    return;
  }
  state.checkoutOrder = order;
  render();
};

const confirmDelivery = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const order = await api(`/api/orders/${state.checkoutOrder.id}/confirm-delivery`, {
    method: "POST",
    body: JSON.stringify({
      code: data.get("code"),
      conditionNote: data.get("conditionNote"),
      checklist: {
        identityMatched: data.get("identityMatched") === "on",
        packageIntact: data.get("packageIntact") === "on",
        itemMatches: data.get("itemMatches") === "on",
        accessoriesMatch: data.get("accessoriesMatch") === "on",
        conditionAccepted: data.get("conditionAccepted") === "on"
      }
    })
  });
  if (order.error) {
    alert(order.error);
    return;
  }
  state.checkoutOrder = order;
  render();
};

const releasePayment = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const order = await api(`/api/orders/${state.checkoutOrder.id}/release-payment`, {
    method: "POST",
    body: JSON.stringify({
      code: data.get("code"),
      releasedBy: currentIdentity()
    })
  });
  if (order.error) {
    alert(order.error);
    return;
  }
  state.checkoutOrder = order;
  alert("Pago liberado con codigo unico validado.");
  render();
};

const rateSeller = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const order = await api(`/api/orders/${state.checkoutOrder.id}/rate-seller`, {
    method: "POST",
    body: JSON.stringify({
      rating: Number(data.get("rating")),
      comment: data.get("comment")
    })
  });
  if (order.error) {
    alert(order.error);
    return;
  }
  state.checkoutOrder = order;
  state.products = (await api("/api/products")).map(normalizeProduct);
  await refreshSellerDashboard();
  alert("Gracias por calificar al vendedor.");
  render();
};

const promoteProduct = async (productId) => {
  const result = await api("/api/promotions", {
    method: "POST",
    body: JSON.stringify({ productId, buyer: currentIdentity() })
  });
  if (result.error) {
    alert(result.error);
    return;
  }
  if (result.checkoutUrl) {
    window.open(result.checkoutUrl, "_blank", "noopener");
    alert("Abrimos Mercado Pago. Cuando se confirme el pago, tu producto quedara destacado en la portada.");
  } else {
    alert("Solicitud de anuncio creada.");
  }
};

const promoteFromForm = async (event) => {
  event.preventDefault();
  const productId = new FormData(event.currentTarget).get("productId");
  if (!productId) {
    alert("Elige una publicacion para destacar.");
    return;
  }
  await promoteProduct(productId);
};

const filesToDataUrls = async (fileList, limit = 6) => {
  const files = [...(fileList || [])].slice(0, limit);
  return Promise.all(files.map(fileToDataUrl));
};

const submitSellerProof = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const order = await api(`/api/orders/${state.checkoutOrder.id}/seller-proof`, {
    method: "POST",
    body: JSON.stringify({
      packageNotes: data.get("packageNotes"),
      serialOrMark: data.get("serialOrMark"),
      accessories: data.get("accessories"),
      photos: await filesToDataUrls(form.photos?.files)
    })
  });
  if (order.error) {
    alert(order.error);
    return;
  }
  state.checkoutOrder = order;
  render();
};

const markOrderInTransit = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const order = await api(`/api/orders/${state.checkoutOrder.id}/mark-in-transit`, {
    method: "POST",
    body: JSON.stringify({
      carrier: data.get("carrier"),
      trackingCode: data.get("trackingCode"),
      note: data.get("note")
    })
  });
  if (order.error) {
    alert(order.error);
    return;
  }
  state.checkoutOrder = order;
  render();
};

const openDispute = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const order = await api(`/api/orders/${state.checkoutOrder.id}/dispute`, {
    method: "POST",
    body: JSON.stringify({
      reason: data.get("reason"),
      description: data.get("description"),
      evidence: await filesToDataUrls(form.evidence?.files),
      createdBy: currentIdentity()
    })
  });
  if (order.error) {
    alert(order.error);
    return;
  }
  state.checkoutOrder = order;
  render();
};

const sendMessage = (event) => {
  event.preventDefault();
  const chat = activeChat();
  if (chat?.blocked) {
    alert("Este chat esta bloqueado por seguridad.");
    return;
  }
  const input = event.currentTarget.message;
  const text = input.value.trim();
  if (!text) return;
  const risk = analyzeMessageRisk(text);
  if (risk.level === "Alto") {
    const proceed = confirm(`MP Shield detecto posible ${risk.flags.join(", ")}. No compartas codigos, pagos externos ni datos bancarios. ¿Enviar igualmente como evidencia auditada?`);
    if (!proceed) return;
  }
  const identity = currentIdentity();
  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    from: "user",
    senderId: identity.id,
    senderName: identity.name,
    senderAvatar: identity.avatar,
    text,
    risk,
    time: new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }),
    createdAt: new Date().toISOString()
  };
  state.socket?.send(JSON.stringify({ type: "message", chatId: state.selectedChatId, message }));
  state.conversations = state.conversations.map((chat) =>
    chat.id === state.selectedChatId ? { ...chat, messages: [...chat.messages, message] } : chat
  );
  input.value = "";
  render();
};

const authenticate = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const validationError = validateAccountForm(data);
  if (validationError) {
    alert(validationError);
    return;
  }
  const profilePhoto = await fileToDataUrl(data.get("profilePhoto"));
  const documentPhoto = await fileToDataUrl(data.get("documentPhoto"));
  const result = await api("/api/user", {
    method: "POST",
    body: JSON.stringify({
      name: requiredValue(data, "name"),
      email: requiredValue(data, "email").toLowerCase(),
      password: data.get("password"),
      cedula: requiredValue(data, "cedula"),
      phone: requiredValue(data, "phone"),
      exactLocation: requiredValue(data, "exactLocation"),
      profilePhoto,
      documentPhoto
    })
  });
  if (result.error) {
    alert(result.fields?.length ? `${result.error}: ${result.fields.join(", ")}` : result.error);
    return;
  }
  if (result.sessionToken) {
    state.authToken = result.sessionToken;
    localStorage.setItem("marketAuthToken", result.sessionToken);
  }
  state.user = result;
  localStorage.setItem("marketUser", JSON.stringify(state.user));
  await refreshSellerDashboard();
  render();
  scrollToTop();
};

const loginUser = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const result = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: requiredValue(data, "email").toLowerCase(),
      password: data.get("password")
    })
  });
  if (result.error) {
    alert(result.error);
    return;
  }
  state.authToken = result.sessionToken || "";
  state.user = result;
  localStorage.setItem("marketAuthToken", state.authToken);
  localStorage.setItem("marketUser", JSON.stringify(state.user));
  await refreshSellerDashboard();
  render();
  scrollToTop();
};

const requestPasswordReset = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const result = await api("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email: requiredValue(data, "email").toLowerCase() })
  });
  if (result.error) {
    alert(result.error);
    return;
  }
  alert(result.demoCode ? `${result.message} Codigo: ${result.demoCode}` : result.message);
};

const confirmPasswordReset = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const result = await api("/api/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({
      email: requiredValue(data, "email").toLowerCase(),
      code: requiredValue(data, "code"),
      password: data.get("password")
    })
  });
  alert(result.error || result.message || "Listo.");
};

const authenticateAdminEntry = async (event) => {
  event.preventDefault();
  const password = new FormData(event.currentTarget).get("password");
  const result = await api("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  if (result.error) {
    alert(result.error);
    return;
  }
  sessionStorage.setItem("mpAdminToken", result.token);
  state.user = {
    id: "marketpro-admin",
    name: "Admin MarketPro",
    email: "admin@marketpro.local",
    phone: "Admin",
    cedula: "Admin",
    exactLocation: "Panel privado",
    profilePhoto: "admin-access",
    documentPhoto: "admin-access",
    authComplete: true,
    hasPassword: true,
    verified: true,
    verificationStatus: "Admin verificado",
    admin: true
  };
  localStorage.setItem("marketUser", JSON.stringify(state.user));
  state.sellerDashboard = { user: state.user, stats: { active: 0, sold: 0, grossSales: 0, balance: 0, pendingBalance: 0, securityScore: 100 }, listings: [] };
  render();
  scrollToTop();
};

const logoutUser = () => {
  if (state.authToken) {
    api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => {});
  }
  state.user = null;
  state.authToken = "";
  state.sellerDashboard = null;
  state.view = "profile";
  state.selectedChatId = null;
  state.checkoutOrder = null;
  localStorage.removeItem("marketUser");
  localStorage.removeItem("marketAuthToken");
  sessionStorage.removeItem("mpAdminToken");
  connectSocket();
  render();
  scrollToTop();
};

const deleteAccount = async () => {
  if (!state.authToken) {
    alert("Para eliminar la cuenta tienes que iniciar sesion.");
    return;
  }
  const confirmed = confirm("¿Eliminar tu cuenta de MarketPro? Tus publicaciones quedaran pausadas y la sesion se cerrara.");
  if (!confirmed) return;
  const result = await api("/api/user", { method: "DELETE" });
  if (result.error) {
    alert(result.error);
    return;
  }
  state.authToken = "";
  state.user = null;
  state.sellerDashboard = null;
  state.view = "profile";
  localStorage.removeItem("marketUser");
  localStorage.removeItem("marketAuthToken");
  alert("Cuenta eliminada. Tus publicaciones quedaron pausadas por seguridad.");
  render();
  scrollToTop();
};

const toggleSold = async (id) => {
  const item = state.products.find((product) => product.id === id);
  const status = item.status === "sold" ? "active" : "sold";
  const updated = await api(`/api/products/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status })
  });
  state.products = state.products.map((product) => (product.id === id ? normalizeProduct(updated) : product));
  await refreshSellerDashboard();
  render();
};

const deleteListing = async (id) => {
  await api(`/api/products/${id}`, { method: "DELETE" });
  state.products = state.products.filter((product) => product.id !== id);
  await refreshSellerDashboard();
  render();
};

const installPwa = async () => {
  if (!deferredInstallPrompt) {
    alert("Android/Chrome: abre el menu de tres puntos y toca Instalar app o Agregar a pantalla principal.\n\niPhone/Safari: toca Compartir y luego Agregar a pantalla de inicio.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  state.canInstallPwa = false;
  render();
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  state.canInstallPwa = true;
  render();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  state.canInstallPwa = false;
  render();
});

loadData();


