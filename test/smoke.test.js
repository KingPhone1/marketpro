const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const port = 39741;
const origin = `http://127.0.0.1:${port}`;
const dataDir = path.join(__dirname, ".tmp-data");
let child;
let anaCookie = "";
let adminCookie = "";
let belenCookie = "";
let listingId = "";
let conversationId = "";

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

before(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
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
      MERCADO_PAGO_CLIENT_ID: "",
      MERCADO_PAGO_CLIENT_SECRET: "",
      MERCADO_PAGO_WEBHOOK_SECRET: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer();
});

after(() => {
  child?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("health and launch readiness report the real state", async () => {
  const health = await request("/healthz", { originHeader: "" });
  assert.equal(health.response.status, 200);
  assert.equal(health.data.ok, true);

  const readiness = await request("/readyz", { originHeader: "" });
  assert.equal(readiness.response.status, 503);
  assert.equal(readiness.data.ready, false);
  assert.ok(readiness.data.blockers.includes("Memoria Supabase"));
});

test("registration uses a private cookie and verifies email before admin review", async () => {
  const registered = await request("/api/user", {
    method: "POST",
    body: accountPayload("ana.launch@gmail.com", "Ana Launch")
  });
  assert.equal(registered.response.status, 201);
  assert.match(registered.response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(registered.response.headers.get("set-cookie"), /SameSite=Strict/i);
  assert.equal("sessionToken" in registered.data, false);
  assert.equal(registered.data.emailVerified, false);
  assert.match(registered.data.demoCode, /^\d{6}$/);

  const verified = await request("/api/auth/email/verify", {
    method: "POST",
    cookie: registered.cookie,
    body: { code: registered.data.demoCode }
  });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.data.user.emailVerified, true);

  const blockedListing = await request("/api/products", {
    method: "POST",
    cookie: registered.cookie,
    body: {
      title: "Producto seguro de prueba",
      price: 120,
      category: "Hogar",
      condition: "Usado",
      description: "Producto real con descripcion suficientemente detallada para validar el protocolo de publicacion y seguridad.",
      location: "Montevideo",
      images: [testImage, testImage],
      safetyAccepted: true
    }
  });
  assert.equal(blockedListing.response.status, 403);
});

test("admin approval enables publishing without exposing bearer tokens", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "ana.launch@gmail.com", password: "LaunchSecure2026A" }
  });
  assert.equal(login.response.status, 200);
  anaCookie = login.cookie;
  assert.equal("sessionToken" in login.data, false);

  const adminLogin = await request("/api/admin/login", {
    method: "POST",
    body: { password: "AdminMarketPro2026", code: "" }
  });
  assert.equal(adminLogin.response.status, 200);
  adminCookie = adminLogin.cookie;
  assert.equal("token" in adminLogin.data, false);

  const overview = await request("/api/admin/overview", { cookie: adminLogin.cookie });
  const user = overview.data.users.find((item) => item.email === "ana.launch@gmail.com");
  assert.ok(user);

  const approved = await request(`/api/admin/users/${user.id}/verify`, {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { status: "approved" }
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.data.verified, true);

  const listing = await request("/api/products", {
    method: "POST",
    cookie: login.cookie,
    body: {
      title: "Mesa de comedor de roble",
      price: 320,
      category: "Hogar",
      condition: "Usado",
      paymentLink: "https://mpago.la/mesa-roble-test",
      description: "Mesa de roble en excelente estado, con medidas completas, detalles visibles, cuatro sillas y entrega coordinada.",
      location: "Pocitos, Montevideo",
      images: [testImage, testImage],
      safetyAccepted: true
    }
  });
  assert.equal(listing.response.status, 201);
  assert.equal(listing.data.seller.email, "ana.launch@gmail.com");
  listingId = listing.data.id;
});

test("a new login does not invalidate another user's session", async () => {
  const second = await request("/api/user", {
    method: "POST",
    body: accountPayload("belen.launch@gmail.com", "Belen Launch")
  });
  assert.equal(second.response.status, 201);
  belenCookie = second.cookie;

  const verified = await request("/api/auth/email/verify", {
    method: "POST",
    cookie: belenCookie,
    body: { code: second.data.demoCode }
  });
  assert.equal(verified.response.status, 200);

  const overview = await request("/api/admin/overview", { cookie: adminCookie });
  const belen = overview.data.users.find((item) => item.email === "belen.launch@gmail.com");
  const approved = await request(`/api/admin/users/${belen.id}/verify`, {
    method: "POST",
    cookie: adminCookie,
    body: { status: "approved" }
  });
  assert.equal(approved.response.status, 200);

  const firstUser = await request("/api/user", {
    cookie: (await request("/api/auth/login", {
      method: "POST",
      body: { email: "ana.launch@gmail.com", password: "LaunchSecure2026A" }
    })).cookie,
    originHeader: ""
  });
  assert.equal(firstUser.data.email, "ana.launch@gmail.com");
});

test("chat connects both verified users and preserves the correct contact", async () => {
  const conversation = await request("/api/conversations", {
    method: "POST",
    cookie: belenCookie,
    body: { productId: listingId }
  });
  assert.equal(conversation.response.status, 201);
  conversationId = conversation.data.id;

  const sent = await request(`/api/conversations/${conversation.data.id}/messages`, {
    method: "POST",
    cookie: belenCookie,
    body: { text: "Hola, ¿sigue disponible la mesa?" }
  });
  assert.equal(sent.response.status, 201);

  const sellerChats = await request("/api/conversations", {
    cookie: anaCookie,
    originHeader: ""
  });
  const sellerChat = sellerChats.data.find((item) => item.id === conversation.data.id);
  assert.equal(sellerChat.otherParticipant.name, "Belen Launch");
  assert.equal(sellerChat.messages.at(-1).text, "Hola, ¿sigue disponible la mesa?");

  const attachment = await request(`/api/conversations/${conversation.data.id}/messages`, {
    method: "POST",
    cookie: belenCookie,
    body: { text: "Adjunto una referencia.", attachment: testImage }
  });
  assert.equal(attachment.response.status, 201);
  assert.match(attachment.data.message.attachment, /^(?:\/api\/private-media\/|data:image\/jpeg;base64,)/);

  if (attachment.data.message.attachment.startsWith("/api/private-media/")) {
    const protectedMedia = await fetch(`${origin}${attachment.data.message.attachment}`, {
      headers: { Cookie: anaCookie }
    });
    assert.equal(protectedMedia.status, 200);
    assert.match(protectedMedia.headers.get("content-type"), /^image\/jpeg/);

    const anonymousMedia = await fetch(`${origin}${attachment.data.message.attachment}`);
    assert.equal(anonymousMedia.status, 401);
  }
});

test("chat records read receipts for the other participant", async () => {
  const read = await request(`/api/conversations/${conversationId}/read`, {
    method: "POST",
    cookie: anaCookie,
    body: {}
  });
  assert.equal(read.response.status, 200);

  const buyerChats = await request("/api/conversations", {
    cookie: belenCookie,
    originHeader: ""
  });
  const buyerChat = buyerChats.data.find((item) => item.id === conversationId);
  const buyerMessage = buyerChat.messages.find((message) => message.text.includes("sigue disponible"));
  assert.ok(buyerMessage.readAt);
});

test("verified sellers can use an official Mercado Pago payment link without platform credentials", async () => {
  const invalid = await request("/api/payments/mercadopago/payment-link", {
    method: "PUT",
    cookie: anaCookie,
    body: { paymentLink: "https://example.com/not-mercadopago" }
  });
  assert.equal(invalid.response.status, 400);

  const linked = await request("/api/payments/mercadopago/payment-link", {
    method: "PUT",
    cookie: anaCookie,
    body: { paymentLink: "https://mpago.la/marketpro-test" }
  });
  assert.equal(linked.response.status, 200);
  assert.equal(linked.data.mercadoPago.paymentLinkConfigured, true);

  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: belenCookie,
    body: {
      productId: listingId,
      paymentMethod: "mercadopago",
      delivery: { address: "Rambla 123", city: "Montevideo", phone: "099123456", method: "Envío coordinado", note: "" },
      acceptedRules: true,
      declaredInspection: true
    }
  });
  assert.equal(checkout.response.status, 201);
  assert.equal(checkout.data.mercadoPago.mode, "seller-payment-link");
  assert.equal(checkout.data.mercadoPago.checkoutUrl, "https://mpago.la/mesa-roble-test");

  const confirmation = await request(`/api/orders/${checkout.data.id}/confirm-payment-link`, {
    method: "POST",
    cookie: anaCookie,
    body: { paymentId: "MP-TEST-1234", confirmedInMercadoPago: true }
  });
  assert.equal(confirmation.response.status, 200);
  assert.equal(confirmation.data.paymentNotification.status, "approved");
});

test("the delivery code is visible to the buyer and hidden from the seller", async () => {
  const simulation = await request("/api/admin/simulate/antifraud-purchase", {
    method: "POST",
    cookie: adminCookie,
    body: {
      buyer: {
        name: "Belen Launch",
        email: "belen.launch@gmail.com",
        phone: "099555555"
      }
    }
  });
  assert.equal(simulation.response.status, 201);
  const orderId = simulation.data.order.id;

  const buyerOrders = await request("/api/orders", { cookie: belenCookie, originHeader: "" });
  const buyerOrder = buyerOrders.data.find((order) => order.id === orderId);
  assert.match(buyerOrder.delivery.code, /^[A-F0-9]{8}$/);

  const sellerOrders = await request("/api/orders", { cookie: anaCookie, originHeader: "" });
  const sellerOrder = sellerOrders.data.find((order) => order.id === orderId);
  assert.equal(sellerOrder.delivery.code, undefined);
});

test("cross-origin state changes are rejected", async () => {
  const response = await request("/api/auth/login", {
    method: "POST",
    originHeader: "https://attacker.example",
    body: { email: "ana.launch@gmail.com", password: "LaunchSecure2026A" }
  });
  assert.equal(response.response.status, 403);
});

test("state changes without a CSRF token are rejected", async () => {
  const response = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: {
      Cookie: anaCookie,
      Origin: origin,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(response.status, 403);
});

test("fake image payloads are rejected even when the MIME label says JPEG", async () => {
  const fakeImage = `data:image/jpeg;base64,${Buffer.alloc(2048, 1).toString("base64")}`;
  const response = await request("/api/user", {
    method: "POST",
    body: {
      ...accountPayload("fake.image@gmail.com", "Fake Image"),
      profilePhoto: fakeImage,
      documentPhoto: fakeImage
    }
  });
  assert.equal(response.response.status, 400);
});

test("global logout invalidates every active session for the account", async () => {
  const secondLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "ana.launch@gmail.com", password: "LaunchSecure2026A" }
  });
  assert.equal(secondLogin.response.status, 200);

  const logoutAll = await request("/api/auth/logout-all", {
    method: "POST",
    cookie: anaCookie,
    body: {}
  });
  assert.equal(logoutAll.response.status, 200);

  const firstSession = await request("/api/user", { cookie: anaCookie, originHeader: "" });
  const secondSession = await request("/api/user", { cookie: secondLogin.cookie, originHeader: "" });
  assert.equal(firstSession.data, null);
  assert.equal(secondSession.data, null);
});
