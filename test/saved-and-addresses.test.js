const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const port = 39771;
const origin = `http://127.0.0.1:${port}`;
const dataDir = path.join(__dirname, ".tmp-data-saved");
let child;

const request = async (route, { cookie = "", method = "GET", body, originHeader = origin } = {}) => {
  const stateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  let csrfToken = "";
  let csrfCookie = "";
  if (stateChanging) {
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

let adminCookie = "";
let sellerCookie = "";
let buyerACookie = "";
let buyerBCookie = "";
let listingId = "";

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

  const adminLogin = await request("/api/admin/login", { method: "POST", body: { password: "AdminMarketPro2026", code: "" } });
  adminCookie = adminLogin.cookie;

  const registerVerifiedApproved = async (email, name) => {
    const registered = await request("/api/user", { method: "POST", body: accountPayload(email, name) });
    await request("/api/auth/email/verify", { method: "POST", cookie: registered.cookie, body: { code: registered.data.demoCode } });
    const overview = await request("/api/admin/overview", { cookie: adminCookie });
    const user = overview.data.users.find((item) => item.email === email);
    await request(`/api/admin/users/${user.id}/verify`, { method: "POST", cookie: adminCookie, body: { status: "approved" } });
    const login = await request("/api/auth/login", { method: "POST", body: { email, password: "LaunchSecure2026A" } });
    return login.cookie;
  };

  sellerCookie = await registerVerifiedApproved("seller.saved@gmail.com", "Seller Saved");
  buyerACookie = await registerVerifiedApproved("buyera.saved@gmail.com", "Buyer A Saved");
  buyerBCookie = await registerVerifiedApproved("buyerb.saved@gmail.com", "Buyer B Saved");

  const linked = await request("/api/payments/mercadopago/payment-link", {
    method: "PUT",
    cookie: sellerCookie,
    body: { paymentLink: "https://mpago.la/marketpro-saved-test" }
  });
  assert.equal(linked.response.status, 200);

  const listing = await request("/api/products", {
    method: "POST",
    cookie: sellerCookie,
    body: {
      title: "Bicicleta para guardar",
      price: 15000,
      category: "Deportes",
      condition: "Usado",
      paymentLink: "https://mpago.la/marketpro-saved-test",
      description: "Articulo de prueba con descripcion detallada, accesorios incluidos y entrega coordinada dentro de Uruguay.",
      location: "Montevideo",
      images: [testImage, testImage],
      safetyAccepted: true
    }
  });
  assert.equal(listing.response.status, 201);
  listingId = listing.data.id;
});

after(() => {
  child?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("un invitado sin sesion ve una lista de guardados vacia y no puede guardar", async () => {
  const list = await request("/api/saved-products", { originHeader: "" });
  assert.deepEqual(list.data, []);

  const attempt = await request(`/api/saved-products/${listingId}`, { method: "POST" });
  assert.equal(attempt.response.status, 401);
});

test("guardar una publicacion inexistente devuelve 404", async () => {
  const attempt = await request("/api/saved-products/no-existe-este-id", { method: "POST", cookie: buyerACookie });
  assert.equal(attempt.response.status, 404);
});

test("guardar, listar, guardar de nuevo sin duplicar, y quitar de guardados", async () => {
  const saved = await request(`/api/saved-products/${listingId}`, { method: "POST", cookie: buyerACookie });
  assert.equal(saved.response.status, 201);
  assert.deepEqual(saved.data.savedProductIds, [listingId]);

  const list = await request("/api/saved-products", { cookie: buyerACookie, originHeader: "" });
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].id, listingId);
  assert.equal(list.data[0].title, "Bicicleta para guardar");

  const savedAgain = await request(`/api/saved-products/${listingId}`, { method: "POST", cookie: buyerACookie });
  assert.equal(savedAgain.response.status, 201);
  assert.deepEqual(savedAgain.data.savedProductIds, [listingId]);

  const removed = await request(`/api/saved-products/${listingId}`, { method: "DELETE", cookie: buyerACookie });
  assert.equal(removed.response.status, 200);
  assert.deepEqual(removed.data.savedProductIds, []);

  const emptyList = await request("/api/saved-products", { cookie: buyerACookie, originHeader: "" });
  assert.deepEqual(emptyList.data, []);
});

test("los guardados de un usuario no se filtran a otro usuario", async () => {
  await request(`/api/saved-products/${listingId}`, { method: "POST", cookie: buyerACookie });

  const buyerBList = await request("/api/saved-products", { cookie: buyerBCookie, originHeader: "" });
  assert.deepEqual(buyerBList.data, []);

  const buyerAList = await request("/api/saved-products", { cookie: buyerACookie, originHeader: "" });
  assert.equal(buyerAList.data.length, 1);
});

test("crear una direccion sin campos obligatorios se rechaza", async () => {
  const attempt = await request("/api/addresses", {
    method: "POST",
    cookie: buyerACookie,
    body: { label: "Casa", address: "", city: "Montevideo", phone: "099123456" }
  });
  assert.equal(attempt.response.status, 400);
  assert.ok(attempt.data.fields.includes("address"));
});

test("crear, editar y borrar una direccion guardada", async () => {
  const created = await request("/api/addresses", {
    method: "POST",
    cookie: buyerACookie,
    body: { label: "Casa", address: "Rambla 123", city: "Montevideo", phone: "099123456", note: "Portón negro" }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.savedAddresses.length, 1);
  const addressId = created.data.savedAddresses[0].id;

  const list = await request("/api/addresses", { cookie: buyerACookie, originHeader: "" });
  assert.equal(list.data[0].address, "Rambla 123");

  const edited = await request(`/api/addresses/${addressId}`, {
    method: "PUT",
    cookie: buyerACookie,
    body: { label: "Casa", address: "Rambla 456", city: "Montevideo", phone: "099123456", note: "" }
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.data.savedAddresses[0].address, "Rambla 456");

  const deleted = await request(`/api/addresses/${addressId}`, { method: "DELETE", cookie: buyerACookie });
  assert.equal(deleted.response.status, 200);
  assert.deepEqual(deleted.data.savedAddresses, []);
});

test("las direcciones de un usuario no se filtran a otro usuario", async () => {
  await request("/api/addresses", {
    method: "POST",
    cookie: buyerACookie,
    body: { label: "Trabajo", address: "18 de Julio 1000", city: "Montevideo", phone: "099123456" }
  });

  const buyerBAddresses = await request("/api/addresses", { cookie: buyerBCookie, originHeader: "" });
  assert.deepEqual(buyerBAddresses.data, []);
});
