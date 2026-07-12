const adminApp = document.querySelector("#adminApp");

const state = {
  token: sessionStorage.getItem("mpAdminToken") || "",
  overview: null,
  innovations: [],
  innovationStatus: { activeCount: 0, total: 0 },
  mercadoPago: null,
  mercadoPagoTest: null,
  error: ""
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

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      Authorization: state.token ? `Bearer ${state.token}` : "",
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error admin");
  return data;
};

const loadOverview = async () => {
  if (!state.token) return render();
  try {
    const [overview, innovations] = await Promise.all([
      api("/api/admin/overview"),
      api("/api/admin/innovations")
    ]);
    state.overview = overview;
    state.innovations = innovations.items || [];
    state.mercadoPago = await api("/api/admin/mercadopago/status");
    state.innovationStatus = {
      activeCount: innovations.activeCount || state.innovations.length,
      total: innovations.total || state.innovations.length
    };
    state.error = "";
  } catch (error) {
    state.error = error.message;
    state.token = "";
    sessionStorage.removeItem("mpAdminToken");
  }
  render();
};

const loginView = () => `
  <section class="admin-login panel">
    <img class="brand-logo admin-logo" src="/mp-logo.svg" alt="MP" />
    <p class="eyebrow">Admin privado</p>
    <h1>Corroborar identidad de vendedores</h1>
    <p class="muted">Ingresa con tu contrasena para revisar cedula, telefono, ubicacion exacta y aprobar vendedores.</p>
    ${state.error ? `<div class="admin-error">${escapeHtml(state.error)}</div>` : ""}
    <form id="adminLoginForm">
      <div class="field">
        <label>contrasena admin</label>
        <input name="password" type="password" required placeholder="contrasena" />
      </div>
      <button class="sell-action" type="submit">Entrar al admin</button>
    </form>
  </section>
`;

const isRejected = (user) => Boolean(user.verificationStatus?.toLowerCase().includes("rechaz"));
const statusClass = (user) => (user.verified ? "approved" : isRejected(user) ? "rejected" : "pending");

const privateRoadmapView = () => {
  const groups = [...new Set(state.innovations.map((item) => item.group))];
  return `
    <section class="panel private-vault">
      <div class="admin-section-head">
        <div>
          <p class="eyebrow">Solo creador</p>
          <h1>Sistema privado de funciones activas</h1>
          <p class="muted">Estas funciones quedan activadas en la capa privada/admin. No aparecen en MarketPro publico como lista visible.</p>
        </div>
        <strong class="vault-count">${state.innovationStatus.activeCount}/${state.innovationStatus.total} activas</strong>
      </div>
      <div class="private-roadmap">
        ${groups
          .map((group) => `
            <article class="roadmap-group">
              <h2>${escapeHtml(group)}</h2>
              <div class="roadmap-list">
                ${state.innovations
                  .filter((item) => item.group === group)
                  .map((item) => `
                    <div class="roadmap-item active-feature">
                      <small>${escapeHtml(item.status)} - ${escapeHtml(item.visibility)}</small>
                      <strong>${escapeHtml(item.title)}</strong>
                      <span>${escapeHtml(item.text)}</span>
                    </div>
                  `)
                  .join("")}
              </div>
            </article>
          `)
          .join("")}
      </div>
    </section>
  `;
};

const mercadoPagoView = () => {
  const mp = state.mercadoPago;
  if (!mp) return "";
  return `
    <section class="panel mp-admin-panel">
      <div class="admin-section-head">
        <div>
          <p class="eyebrow">Pagos</p>
          <h1>Mercado Pago vinculado</h1>
          <p class="muted">Diagnostico privado de credenciales, dominio y webhook. No muestra secretos.</p>
        </div>
        <strong class="vault-count ${mp.ready ? "mp-ready" : "mp-pending"}">${mp.ready ? "Listo" : "Pendiente"}</strong>
      </div>
      <div class="mp-checks">
        ${mp.checks.map((check) => `
          <article class="${check.ok ? "ok" : "missing"}">
            <span>${check.ok ? "OK" : "Falta"}</span>
            <strong>${escapeHtml(check.label)}</strong>
            <small>${escapeHtml(check.hint)}</small>
          </article>
        `).join("")}
      </div>
      <div class="mp-config-lines">
        <span><b>URL publica</b>${escapeHtml(mp.appBaseUrl)}</span>
        <span><b>Webhook</b>${escapeHtml(mp.webhookUrl)}</span>
        <span><b>Moneda</b>${escapeHtml(mp.currency)}</span>
      </div>
      <div class="admin-actions mp-actions">
        <button class="buy-action" id="testMercadoPago">Probar preferencia real</button>
        ${state.mercadoPagoTest ? `
          <a class="secondary-btn" href="${escapeHtml(state.mercadoPagoTest.checkoutUrl || "#")}" target="_blank" rel="noopener">Abrir checkout de prueba</a>
        ` : ""}
      </div>
      ${state.mercadoPagoTest ? `
        <div class="mp-test-result ${state.mercadoPagoTest.ok ? "ok" : "missing"}">
          <strong>${state.mercadoPagoTest.ok ? "Preferencia creada" : "No se pudo crear preferencia"}</strong>
          <span>${escapeHtml(state.mercadoPagoTest.preferenceId || state.mercadoPagoTest.error || "")}</span>
        </div>
      ` : ""}
    </section>
  `;
};

const dashboardView = () => {
  const overview = state.overview || { users: [], products: [], conversations: [], memory: {} };
  const reviewableUsers = overview.users.filter((user) => !isRejected(user));
  const pendingUsers = reviewableUsers.filter((user) => !user.verified);
  const approvedUsers = reviewableUsers.filter((user) => user.verified);
  const orders = overview.orders || [];
  const disputes = orders.flatMap((order) => (order.disputes || []).map((dispute) => ({ ...dispute, order })));
  const pending = pendingUsers.length;
  const verified = approvedUsers.length;
  return `
    <header class="admin-header">
      <div class="admin-brand">
        <img class="brand-logo" src="/mp-logo.svg" alt="MP" />
        <div>
          <strong>MarketPro Admin</strong>
          <span>Memoria actualizada: ${escapeHtml(overview.memory?.updatedAt || "Sin datos")}</span>
        </div>
      </div>
      <button class="secondary-btn" id="logoutAdmin">Salir</button>
    </header>

    <section class="seller-metrics admin-metrics">
      <div class="metric-card"><span>Vendedores</span><strong>${reviewableUsers.length}</strong></div>
      <div class="metric-card"><span>Pendientes</span><strong>${pending}</strong></div>
      <div class="metric-card"><span>Verificados</span><strong>${verified}</strong></div>
      <div class="metric-card"><span>Publicaciones</span><strong>${overview.products.length}</strong></div>
      <div class="metric-card"><span>Ordenes</span><strong>${orders.length}</strong></div>
      <div class="metric-card"><span>Disputas</span><strong>${disputes.filter((item) => item.status !== "Cerrada").length}</strong></div>
    </section>

    ${mercadoPagoView()}

    ${privateRoadmapView()}

    <section class="panel">
      <div class="admin-section-head">
        <div>
          <p class="eyebrow">Entrega protegida</p>
          <h1>Ordenes, evidencia y disputas</h1>
        </div>
      </div>
      <div class="admin-orders">
        ${orders.length ? orders.map((order) => `
          <article class="admin-order">
            <div>
              <strong>${escapeHtml(order.productTitle)}</strong>
              <span>${escapeHtml(order.id)} - ${escapeHtml(order.status)}</span>
            </div>
            <div><small>Entrega</small><b>${escapeHtml(order.delivery?.status || "")}</b></div>
            <div><small>Huella</small><b>${escapeHtml(order.security?.stamp?.productFingerprint || "")}</b></div>
            <div><small>Evidencia vendedor</small><b>${order.delivery?.sellerProof ? "Cargada" : "Pendiente"}</b></div>
            <div><small>Disputas</small><b>${order.disputes?.length || 0}</b></div>
          </article>
        `).join("") : `<div class="empty">Todavia no hay ordenes.</div>`}
      </div>
    </section>

    <section class="panel">
      <div class="admin-section-head">
        <div>
          <p class="eyebrow">Verificaciones pendientes</p>
          <h1>Datos privados para revisar</h1>
        </div>
        <a class="secondary-btn admin-link" href="/">Volver a MarketPro</a>
      </div>
      <div class="admin-table">
        ${pendingUsers.length ? pendingUsers
          .map(
            (user) => `
            <article class="admin-user ${statusClass(user)}">
              <div>
                <strong>${escapeHtml(user.name)}</strong>
                <span>${escapeHtml(user.email)}</span>
              </div>
              <div><small>Cedula</small><b>${escapeHtml(user.cedula)}</b></div>
              <div><small>Telefono</small><b>${escapeHtml(user.phone)}</b></div>
              <div><small>Ubicacion exacta</small><b>${escapeHtml(user.exactLocation)}</b></div>
              <div class="admin-id-photos">
                <small>Rostro / Cedula</small>
                <span>
                  ${user.profilePhoto ? `<img src="${user.profilePhoto}" alt="Rostro de ${escapeHtml(user.name)}" />` : ""}
                  ${user.documentPhoto ? `<img src="${user.documentPhoto}" alt="Documento de ${escapeHtml(user.name)}" />` : ""}
                </span>
              </div>
              <div><small>Estado</small><b>${escapeHtml(user.verificationStatus)}</b></div>
              <div><small>Publicaciones</small><b>${user.listings}</b></div>
              <div class="admin-actions">
                <button class="buy-action" data-approve="${user.id}">Aprobar</button>
                <button class="danger-btn" data-reject="${user.id}">Rechazar</button>
              </div>
            </article>`
          )
          .join("") : `<div class="empty">No hay vendedores pendientes para revisar.</div>`}
      </div>
    </section>

    <section class="panel">
      <div class="admin-section-head">
        <div>
          <p class="eyebrow">Aprobados</p>
          <h1>Vendedores habilitados</h1>
        </div>
      </div>
      <div class="admin-table approved-admin-table">
        ${approvedUsers.length ? approvedUsers
          .map(
            (user) => `
            <article class="admin-user approved compact-admin-user">
              <div>
                <strong>${escapeHtml(user.name)}</strong>
                <span>${escapeHtml(user.email)}</span>
              </div>
              <div><small>Estado</small><b>${escapeHtml(user.verificationStatus)}</b></div>
              <div><small>Telefono</small><b>${escapeHtml(user.phone)}</b></div>
              <div><small>Publicaciones</small><b>${user.listings}</b></div>
              <div class="admin-actions">
                <button class="danger-btn" data-reject="${user.id}">Rechazar</button>
              </div>
            </article>`
          )
          .join("") : `<div class="empty">Todavia no hay vendedores aprobados.</div>`}
      </div>
    </section>
  `;
};

const render = () => {
  adminApp.innerHTML = state.token && state.overview ? dashboardView() : loginView();
  bindEvents();
};

const bindEvents = () => {
  document.querySelector("#adminLoginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    try {
      const result = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      state.token = result.token;
      sessionStorage.setItem("mpAdminToken", state.token);
      await loadOverview();
    } catch (error) {
      state.error = error.message;
      render();
    }
  });

  document.querySelector("#logoutAdmin")?.addEventListener("click", () => {
    state.token = "";
    state.overview = null;
    sessionStorage.removeItem("mpAdminToken");
    render();
  });

  document.querySelector("#testMercadoPago")?.addEventListener("click", testMercadoPago);

  document.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => reviewUser(button.dataset.approve, "approved"));
  });

  document.querySelectorAll("[data-reject]").forEach((button) => {
    button.addEventListener("click", () => reviewUser(button.dataset.reject, "rejected"));
  });
};

const testMercadoPago = async () => {
  try {
    state.mercadoPagoTest = await api("/api/admin/mercadopago/test-preference", { method: "POST" });
  } catch (error) {
    state.mercadoPagoTest = { ok: false, error: error.message };
  }
  render();
};

const reviewUser = async (id, status) => {
  await api(`/api/admin/users/${id}/verify`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
  await loadOverview();
};

loadOverview();

