const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const port = 39751;
const origin = `http://127.0.0.1:${port}`;
const mercadoPagoPort = 39752;
const mercadoPagoOrigin = `http://127.0.0.1:${mercadoPagoPort}`;
const dataDir = path.join(__dirname, ".tmp-data-checkout");
let child;
let mercadoPagoMock;
const mockedPayments = new Map();
let capturedPreferences = [];

const mockMercadoPago = () => http.createServer(async (req, res) => {
  const body = await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
  });
  res.setHeader("Content-Type", "application/json");
  if (req.method === "POST" && req.url === "/oauth/token") {
    return res.end(JSON.stringify({ access_token: "seller-access-token", refresh_token: "seller-refresh-token", user_id: "mp-seller-carla", public_key: "TEST-PUBLIC", expires_in: 3600 }));
  }
  if (req.method === "POST" && req.url === "/checkout/preferences") {
    capturedPreferences.push(body);
    return res.end(JSON.stringify({ id: `pref-${capturedPreferences.length}`, init_point: `${mercadoPagoOrigin}/checkout/${capturedPreferences.length}`, status: "active" }));
  }
  if (req.method === "GET" && req.url.startsWith("/v1/payments/")) {
    const payment = mockedPayments.get(decodeURIComponent(req.url.split("/").pop()));
    if (!payment) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ message: "payment not found" }));
    }
    return res.end(JSON.stringify(payment));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: "not found" }));
});

const signedWebhookHeaders = (paymentId, requestId) => {
  const crypto = require("node:crypto");
  const ts = Math.floor(Date.now() / 1000);
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const signature = crypto.createHmac("sha256", "test-webhook-secret").update(manifest).digest("hex");
  return { "X-Request-Id": requestId, "X-Signature": `ts=${ts},v1=${signature}` };
};

const request = async (route, { cookie = "", method = "GET", body, originHeader = origin } = {}) => {
  const stateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  let csrfToken = "";
  let csrfCookie = "";
  if (stateChanging && route !== "/api/payments/mercadopago/webhook") {
    const csrfResponse = await fetch(`${origin}/api/security/csrf`, {
      headers: cookie ? { Cookie: cookie } : {}
    });
    csrfToken = (await csrfResponse.json()).token;
    csrfCookie = csrfResponse.headers.get("set-cookie")?.split(";")[0] || "";
  }
  const response = await fetch(`${origin}${route}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...((cookie || csrfCookie) ? { Cookie: [cookie, csrfCookie].filter(Boolean).join("; ") } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(originHeader ? { Origin: originHeader } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  return {
    response,
    data: text ? JSON.parse(text) : null,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || ""
  };
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("MarketPro no inicio para las pruebas.");
};

const testImageBytes = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(2042, 1),
  Buffer.from([0xff, 0xd9])
]);
const testImage = `data:image/jpeg;base64,${testImageBytes.toString("base64")}`;
const accountPayload = (email, name) => ({
  name,
  email,
  password: "LaunchSecure2026A",
  phone: "099123456",
  cedula: "12345678",
  exactLocation: "Avenida Principal 1234, Montevideo",
  profilePhoto: testImage,
  documentPhoto: testImage
});

const registerVerifiedApprovedUser = async (email, name, adminCookie) => {
  const registered = await request("/api/user", { method: "POST", body: accountPayload(email, name) });
  await request("/api/auth/email/verify", { method: "POST", cookie: registered.cookie, body: { code: registered.data.demoCode } });
  const overview = await request("/api/admin/overview", { cookie: adminCookie });
  const user = overview.data.users.find((item) => item.email === email);
  await request(`/api/admin/users/${user.id}/verify`, { method: "POST", cookie: adminCookie, body: { status: "approved" } });
  const login = await request("/api/auth/login", { method: "POST", body: { email, password: "LaunchSecure2026A" } });
  return { cookie: login.cookie, id: user.id };
};

const deliveryPayload = {
  address: "Rambla 456",
  city: "Montevideo",
  phone: "099123456",
  method: "Envío coordinado",
  note: ""
};

let adminCookie = "";
let carlaCookie = ""; // seller, will connect Mercado Pago OAuth
let elenaCookie = ""; // seller, connects OAuth, publishes relying only on it, then disconnects
let brunoCookie = ""; // buyer

before(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  mercadoPagoMock = mockMercadoPago();
  await new Promise((resolve) => mercadoPagoMock.listen(mercadoPagoPort, "127.0.0.1", resolve));
  child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      APP_BASE_URL: origin,
      ADMIN_PASSWORD: "AdminMarketPro2026",
      TOKEN_ENCRYPTION_KEY: "test-key-with-at-least-thirty-two-characters",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      RESEND_API_KEY: "",
      MERCADO_PAGO_ACCESS_TOKEN: "",
      MERCADO_PAGO_CLIENT_ID: "test-client-id",
      MERCADO_PAGO_CLIENT_SECRET: "test-client-secret",
      MERCADO_PAGO_WEBHOOK_SECRET: "test-webhook-secret",
      MERCADO_PAGO_API_BASE: mercadoPagoOrigin
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer();

  const adminLogin = await request("/api/admin/login", { method: "POST", body: { password: "AdminMarketPro2026", code: "" } });
  adminCookie = adminLogin.cookie;

  carlaCookie = (await registerVerifiedApprovedUser("carla.checkout@gmail.com", "Carla Checkout", adminCookie)).cookie;
  elenaCookie = (await registerVerifiedApprovedUser("elena.checkout@gmail.com", "Elena Checkout", adminCookie)).cookie;
  brunoCookie = (await registerVerifiedApprovedUser("bruno.checkout@gmail.com", "Bruno Checkout", adminCookie)).cookie;

  const connectOAuth = async (cookie) => {
    const oauthStart = await request("/api/payments/mercadopago/oauth/start", { method: "POST", cookie, body: {} });
    const oauthState = new URL(oauthStart.data.url).searchParams.get("state");
    await fetch(`${origin}/api/payments/mercadopago/oauth/callback?state=${encodeURIComponent(oauthState)}&code=test-code`, { redirect: "manual" });
  };
  await connectOAuth(carlaCookie);
  await connectOAuth(elenaCookie);
});

after(() => {
  child?.kill();
  mercadoPagoMock?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const publishListing = async (cookie, title, price = 5000) => request("/api/products", {
  method: "POST",
  cookie,
  body: {
    title,
    price,
    category: "Tecnologia",
    condition: "Nuevo",
    description: "Articulo de prueba con descripcion detallada, accesorios incluidos y entrega coordinada dentro de Uruguay.",
    location: "Montevideo",
    images: [testImage, testImage],
    safetyAccepted: true
  }
});

test("comprar sin sesion iniciada se rechaza", async () => {
  const listing = await publishListing(carlaCookie, "Auriculares sin sesion");
  const checkout = await request("/api/checkout", {
    method: "POST",
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 401);
});

test("comprar tu propia publicacion se rechaza", async () => {
  const listing = await publishListing(carlaCookie, "Teclado propio");
  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: carlaCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 400);
  assert.match(checkout.data.error, /propia publicacion/i);
});

test("publicar una venta sin Mercado Pago conectado (ni OAuth ni enlace) esta bloqueado desde el alta de la publicacion", async () => {
  // Diseño defensivo del producto: un vendedor no puede publicar sin tener
  // un metodo de cobro configurado, asi que este escenario no se puede
  // alcanzar via el flujo normal de "vender" — se confirma aca en vez de
  // en el checkout, que es donde realmente se aplica la regla.
  const noPaymentMethod = await request("/api/products", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      title: "Publicacion sin metodo de cobro",
      price: 5000,
      category: "Tecnologia",
      condition: "Nuevo",
      description: "Articulo de prueba con descripcion detallada, accesorios incluidos y entrega coordinada dentro de Uruguay.",
      location: "Montevideo",
      images: [testImage, testImage],
      safetyAccepted: true
    }
  });
  assert.equal(noPaymentMethod.response.status, 400);
  assert.match(noPaymentMethod.data.error, /enlace oficial de Mercado Pago/i);
});

test("si el vendedor desconecta Mercado Pago despues de publicar, comprar falla con error claro y no crea una orden fantasma", async () => {
  const listing = await publishListing(elenaCookie, "Camara que se queda sin cobro configurado");

  const disconnect = await request("/api/payments/mercadopago/oauth/connection", { method: "DELETE", cookie: elenaCookie });
  assert.equal(disconnect.response.status, 200);
  assert.equal(disconnect.data.mercadoPago.connected, false);

  const before = await request("/api/orders", { cookie: brunoCookie, originHeader: "" });
  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 503);
  assert.match(checkout.data.error, /todavia no conecto/i);
  const after = await request("/api/orders", { cookie: brunoCookie, originHeader: "" });
  assert.equal(after.data.length, before.data.length);
});

test("faltan datos de entrega se rechaza antes de contactar a Mercado Pago", async () => {
  const listing = await publishListing(carlaCookie, "Mouse sin datos de entrega");
  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: { address: "", city: "Montevideo", phone: "", method: "Envío" },
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 400);
  assert.ok(checkout.data.fields.includes("address"));
  assert.ok(checkout.data.fields.includes("phone"));
});

test("no aceptar el protocolo de compra protegida se rechaza", async () => {
  const listing = await publishListing(carlaCookie, "Monitor sin aceptar reglas");
  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: false,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 400);
});

test("reintentar el checkout del mismo producto en menos de 30 minutos reutiliza la orden en vez de duplicarla", async () => {
  const listing = await publishListing(carlaCookie, "Parlante con reintento");
  const first = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(first.response.status, 201);

  const second = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(second.response.status, 200);
  assert.equal(second.data.reused, true);
  assert.equal(second.data.id, first.data.id);
  assert.equal(second.data.mercadoPago.checkoutUrl, first.data.mercadoPago.checkoutUrl);
});

test("un producto marcado como vendido ya no se puede comprar", async () => {
  const listing = await publishListing(carlaCookie, "Silla gamer vendida");
  const markSold = await request(`/api/products/${listing.data.id}`, {
    method: "PUT",
    cookie: carlaCookie,
    body: { status: "sold" }
  });
  assert.equal(markSold.response.status, 200);

  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 409);
});

test("una orden que nunca recibe webhook queda pendiente, sin falso positivo de pago", async () => {
  const listing = await publishListing(carlaCookie, "Bicicleta nunca pagada");
  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 201);
  assert.match(checkout.data.status, /pendiente de pago/i);
  assert.equal(checkout.data.paymentNotification, undefined);

  const orders = await request("/api/orders", { cookie: brunoCookie, originHeader: "" });
  const stillPending = orders.data.find((order) => order.id === checkout.data.id);
  assert.match(stillPending.status, /pendiente de pago/i);

  const confirmDelivery = await request(`/api/orders/${checkout.data.id}/confirm-delivery`, {
    method: "POST",
    cookie: brunoCookie,
    body: { code: "AAAAAAAA" }
  });
  assert.equal(confirmDelivery.response.status, 409);
  assert.match(confirmDelivery.data.error, /evidencia del vendedor|todavia no confirmo el pago/i);
});

test("un webhook con el monto adulterado no confirma el pago ni reserva el producto (intento de fraude)", async () => {
  const listing = await publishListing(carlaCookie, "Notebook con monto adulterado", 900000);
  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 201);

  const overview = await request("/api/admin/overview", { cookie: adminCookie });
  const carlaId = overview.data.users.find((user) => user.email === "carla.checkout@gmail.com").id;

  mockedPayments.set("payment-tampered", {
    id: "payment-tampered",
    external_reference: checkout.data.id,
    transaction_amount: 1, // el atacante intenta confirmar el pago de un monto mucho menor
    currency_id: "UYU",
    collector_id: "mp-seller-carla",
    status: "approved",
    status_detail: "accredited"
  });
  const webhook = await fetch(`${origin}/api/payments/mercadopago/webhook?seller=${encodeURIComponent(carlaId)}&topic=payment&data.id=payment-tampered`, {
    method: "POST",
    headers: signedWebhookHeaders("payment-tampered", "tampered-request")
  });
  assert.equal(webhook.status, 200);

  const orders = await request("/api/orders", { cookie: brunoCookie, originHeader: "" });
  const order = orders.data.find((item) => item.id === checkout.data.id);
  assert.equal(order.paymentNotification.status, "verification_failed");
  assert.equal(order.paymentNotification.amountMatches, false);
  assert.match(order.status, /revision/i);

  const products = await request("/api/products");
  const product = products.data.find((item) => item.id === listing.data.id);
  assert.ok(product, "el producto no deberia quedar reservado por un webhook con monto adulterado");
});

test("un pago rechazado libera el producto que habia quedado reservado por un intento anterior", async () => {
  const listing = await publishListing(carlaCookie, "Consola con pago rechazado", 300000);
  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: brunoCookie,
    body: {
      productId: listing.data.id,
      paymentMethod: "mercadopago",
      delivery: deliveryPayload,
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 201);

  const overview = await request("/api/admin/overview", { cookie: adminCookie });
  const carlaId = overview.data.users.find((user) => user.email === "carla.checkout@gmail.com").id;

  mockedPayments.set("payment-approved-then-reversed", {
    id: "payment-approved-then-reversed",
    external_reference: checkout.data.id,
    transaction_amount: 300000,
    currency_id: "UYU",
    collector_id: "mp-seller-carla",
    status: "approved",
    status_detail: "accredited"
  });
  await fetch(`${origin}/api/payments/mercadopago/webhook?seller=${encodeURIComponent(carlaId)}&topic=payment&data.id=payment-approved-then-reversed`, {
    method: "POST",
    headers: signedWebhookHeaders("payment-approved-then-reversed", "approved-then-reversed-request")
  });

  const reservedProducts = await request("/api/products");
  assert.equal(reservedProducts.data.find((item) => item.id === listing.data.id), undefined); // ya no aparece como activo/publico

  mockedPayments.set("payment-rejected-after", {
    id: "payment-rejected-after",
    external_reference: checkout.data.id,
    transaction_amount: 300000,
    currency_id: "UYU",
    collector_id: "mp-seller-carla",
    status: "rejected",
    status_detail: "cc_rejected_other_reason"
  });
  await fetch(`${origin}/api/payments/mercadopago/webhook?seller=${encodeURIComponent(carlaId)}&topic=payment&data.id=payment-rejected-after`, {
    method: "POST",
    headers: signedWebhookHeaders("payment-rejected-after", "rejected-after-request")
  });

  const freedProducts = await request("/api/products");
  const freed = freedProducts.data.find((item) => item.id === listing.data.id);
  assert.ok(freed, "el producto deberia volver a estar publicado como activo tras el rechazo");
});
