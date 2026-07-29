const app = document.querySelector("#app");

document.addEventListener(
  "error",
  (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.proxyFallback === "true") return;
    if (!/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(image.currentSrc || image.src)) return;
    image.dataset.proxyFallback = "true";
    image.src = `/api/public-image?src=${encodeURIComponent(image.currentSrc || image.src)}`;
  },
  true
);

let deferredInstallPrompt = null;
let pendingChatAttachment = "";
let motionMatchMedia = null;
let motionRefreshFrame = null;
let lastAnimatedViewKey = -1;
let splashDismissed = false;
let searchRenderTimer = null;

const dismissSplash = () => {
  if (splashDismissed) return;
  splashDismissed = true;
  const splash = document.querySelector("#marketSplash");
  if (!splash) return;
  requestAnimationFrame(() => splash.classList.add("is-leaving"));
  window.setTimeout(() => splash.remove(), 260);
};

// Never let a slow API response keep the opening screen over the app.
window.setTimeout(dismissSplash, 780);

const destroyMotion = () => {
  if (motionRefreshFrame) cancelAnimationFrame(motionRefreshFrame);
  motionRefreshFrame = null;
  motionMatchMedia?.revert();
  motionMatchMedia = null;
};

const initMotion = (animateRoute = true) => {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);
  motionMatchMedia = gsap.matchMedia();
  motionMatchMedia.add(
    {
      reduceMotion: "(prefers-reduced-motion: reduce)",
      desktop: "(min-width: 901px)",
      mobile: "(max-width: 900px)"
    },
    (context) => {
      const { reduceMotion, desktop } = context.conditions;
      const surface = document.querySelector(".view-surface") || document.querySelector(".entry-shell");
      if (!surface || reduceMotion) return;

      if (animateRoute) {
        const routeSections = surface.querySelectorAll(
          "main > .hero-panel, main > .command-bar, main > .featured-rail, main > .content-head, main > .panel, main > .detail-grid, main > .compose-grid"
        );
        if (routeSections.length) {
          gsap.from(routeSections, {
            autoAlpha: 0,
            y: desktop ? 28 : 12,
            duration: desktop ? 0.62 : 0.38,
            stagger: desktop ? 0.065 : 0.035,
            ease: "power3.out",
            clearProps: "opacity,visibility,transform"
          });
        }
      }

      const hero = surface.querySelector(".hero-panel");
      const heroFrame = hero?.querySelector(".hero-visual-frame");
      const heroImage = heroFrame?.querySelector("img");
      if (heroFrame && heroImage) {
        gsap.fromTo(
          heroFrame,
          { scale: desktop ? 0.94 : 0.98, clipPath: "inset(6% 8% round 24px)" },
          {
            scale: desktop ? 1.045 : 1,
            clipPath: "inset(0% 0% round 12px)",
            ease: "none",
            scrollTrigger: {
              trigger: hero,
              start: "top 82%",
              end: "bottom 18%",
              scrub: desktop ? 1.1 : false
            }
          }
        );
        gsap.fromTo(
          heroImage,
          { scale: 1.16, yPercent: -3 },
          {
            scale: 1.02,
            yPercent: desktop ? 5 : 0,
            ease: "none",
            scrollTrigger: {
              trigger: hero,
              start: "top bottom",
              end: "bottom top",
              scrub: desktop ? 1.25 : false
            }
          }
        );
      }

      gsap.utils.toArray(".product-card", surface).forEach((card, index) => {
        const imageWrap = card.querySelector(".card-image");
        const image = imageWrap?.querySelector("img");
        if (animateRoute) {
          gsap.from(card, {
            autoAlpha: 0,
            y: desktop ? 34 : 18,
            scale: 0.985,
            duration: desktop ? 0.62 : 0.4,
            delay: Math.min(index % 4, 3) * 0.045,
            ease: "power3.out",
            clearProps: "opacity,visibility,transform",
            scrollTrigger: { trigger: card, start: "top 94%", once: true }
          });
        }
        if (imageWrap && image) {
          gsap.fromTo(
            imageWrap,
            { clipPath: "inset(4% 5% round 10px)" },
            {
              clipPath: "inset(0% 0% round 0px)",
              ease: "none",
              scrollTrigger: {
                trigger: card,
                start: "top 96%",
                end: "bottom 52%",
                scrub: desktop ? 0.8 : false
              }
            }
          );
          gsap.fromTo(
            image,
            { scale: 1.13, yPercent: -2 },
            {
              scale: 1.01,
              yPercent: desktop ? 3 : 0,
              ease: "none",
              scrollTrigger: {
                trigger: card,
                start: "top bottom",
                end: "bottom top",
                scrub: desktop ? 1 : false
              }
            }
          );
        }
      });

      gsap.utils
        .toArray(".command-bar, .luxury-strip, .shield-matrix, .offer-summary, .similar-section", surface)
        .forEach((section) => {
          gsap.from(section, {
            autoAlpha: 0,
            y: desktop ? 36 : 18,
            duration: 0.7,
            ease: "power3.out",
            clearProps: "opacity,visibility,transform",
            scrollTrigger: { trigger: section, start: "top 90%", once: true }
          });
        });

      const galleryImage = surface.querySelector(".gallery-main img");
      if (galleryImage) {
        gsap.fromTo(
          galleryImage,
          { scale: 1.08 },
          {
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: galleryImage,
              start: "top 86%",
              end: "bottom 18%",
              scrub: desktop ? 1 : false
            }
          }
        );
      }

      if (animateRoute && surface.querySelector(".chat-shell")) {
        const chatRows = surface.querySelectorAll(".chat-row");
        const bubbles = surface.querySelectorAll(".bubble");
        if (chatRows.length) {
          gsap.from(chatRows, {
            autoAlpha: 0,
            x: desktop ? -18 : 0,
            y: desktop ? 0 : 10,
            duration: 0.45,
            stagger: 0.055,
            ease: "power2.out",
            clearProps: "opacity,visibility,transform"
          });
        }
        if (bubbles.length) {
          gsap.from(bubbles, {
            autoAlpha: 0,
            x: (index, element) => element.classList.contains("me") ? 18 : -18,
            duration: 0.42,
            stagger: 0.035,
            ease: "power2.out",
            clearProps: "opacity,visibility,transform"
          });
        }
      }

      if (desktop) {
        document.querySelectorAll(
          ".nav-btn, .sell-action, .buy-action, .filter-toggle, .secondary-btn, .send-btn, .text-btn, .ai-agent-launcher"
        ).forEach((button) => {
          button.classList.add("motion-control");
          button.onpointermove = (event) => {
            const bounds = button.getBoundingClientRect();
            const localX = event.clientX - bounds.left;
            const localY = event.clientY - bounds.top;
            button.style.setProperty("--motion-x", `${localX}px`);
            button.style.setProperty("--motion-y", `${localY}px`);
            gsap.to(button, {
              x: (localX - bounds.width / 2) * 0.07,
              y: (localY - bounds.height / 2) * 0.1,
              duration: 0.35,
              ease: "power2.out",
              overwrite: "auto"
            });
          };
          button.onpointerleave = () => {
            gsap.to(button, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.55)", overwrite: "auto" });
          };
          button.onpointerdown = () => gsap.to(button, { scale: 0.975, duration: 0.1, overwrite: "auto" });
          button.onpointerup = () => gsap.to(button, { scale: 1, duration: 0.24, ease: "power2.out", overwrite: "auto" });
        });

        const brand = document.querySelector(".brand");
        const logo = brand?.querySelector(".brand-logo");
        if (brand && logo) {
          brand.onpointerenter = () => gsap.to(logo, { scale: 1.045, rotation: 0.8, duration: 0.45, ease: "power3.out" });
          brand.onpointerleave = () => gsap.to(logo, { scale: 1, rotation: 0, duration: 0.65, ease: "elastic.out(1, 0.6)" });
        }
      }
    }
  );

  motionRefreshFrame = requestAnimationFrame(() => {
    document.querySelectorAll(".view-surface img").forEach((image) => {
      if (!image.complete) image.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
    });
    ScrollTrigger.refresh();
  });
};

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
    text: "El vendedor debe mantener fotos, descripcion y evidencia de empaque. Si algo no coincide, MarketPro prepara el reclamo."
  },
  {
    title: "No envio o falsa entrega",
    text: "Cada orden genera un codigo unico para confirmar la recepcion, cerrar la operacion y habilitar la calificacion."
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
    text: "MarketPro conserva publicacion, chat, evidencia y rastreo para gestionar el reclamo directamente en Mercado Pago."
  }
];

const shieldControls = [
  ["Pago externo", "Bloquea o advierte transferencias, efectivo, cripto y pagos directos fuera de MarketPro."],
  ["Codigo sensible", "Marca pedidos de OTP, clave, PIN o codigo de entrega antes de confirmar la recepcion."],
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
  if (["/privacy", "/terms", "/cookies"].includes(location.pathname)) return "legal";
  if (location.pathname === "/support") return "support";
  if (location.pathname === "/security") return "security";
  const page = new URLSearchParams(location.search).get("page");
  return ["legal", "support", "security", "orders", "profile", "compose", "messages", "notifications", "categories", "cart"].includes(page) ? page : "feed";
};

const state = {
  products: [],
  conversations: [],
  view: initialView(),
  selectedProductId: null,
  selectedOrderId: null,
  selectedChatId: null,
  mobileChatList: true,
  checkoutOrder: null,
  orders: [],
  notifications: [],
  orderTab: "all",
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
  filtersOpen:
    window.innerWidth <= 760
      ? false
      : JSON.parse(localStorage.getItem("marketFiltersOpen") ?? "true"),
  profileTab: "active",
  composeStep: 1,
  user: null,
  authToken: localStorage.getItem("marketAuthToken") || "",
  authenticated: false,
  authMode: "login",
  canInstallPwa: false,
  installBannerDismissed: sessionStorage.getItem("marketInstallBannerDismissed") === "true",
  assistantOpen: false,
  assistantBusy: false,
  assistantLastError: null,
  assistantMessages: [
    { role: "assistant", text: "Hola. Puedo ayudarte con acceso, publicaciones, chat, verificación y pagos." }
  ],
  sessionId: getSessionId(),
  viewKey: 0,
  sellerDashboard: null,
  socket: null,
  csrfToken: "",
  chatTyping: {},
  cart: JSON.parse(localStorage.getItem("marketCart") || "[]")
};

const money = (value) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);

const saveCart = () => localStorage.setItem("marketCart", JSON.stringify(state.cart));
const cartCount = () => state.cart.reduce((sum, row) => sum + row.qty, 0);
const cartTotal = () => state.cart.reduce((sum, row) => {
  const product = state.products.find((item) => item.id === row.id);
  return product ? sum + product.price * row.qty : sum;
}, 0);
const addToCart = (id) => {
  const existing = state.cart.find((row) => row.id === id);
  if (existing) existing.qty += 1;
  else state.cart.push({ id, qty: 1 });
  saveCart();
  showToast("Agregado al carrito", "success");
  render();
};
const setCartQty = (id, qty) => {
  const row = state.cart.find((entry) => entry.id === id);
  if (!row) return;
  row.qty = Math.max(1, qty);
  saveCart();
  render();
};
const removeFromCart = (id) => {
  state.cart = state.cart.filter((row) => row.id !== id);
  saveCart();
  render();
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const showToast = (message, tone = "info") => {
  let stack = document.querySelector("#marketproToasts");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "marketproToasts";
    stack.className = "app-toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.append(stack);
  }
  const toast = document.createElement("div");
  toast.className = `app-toast ${tone}`;
  toast.innerHTML = `<span aria-hidden="true"></span><p>${escapeHtml(String(message || "").trim())}</p><button type="button" aria-label="Cerrar">×</button>`;
  stack.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  const dismiss = () => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 220);
  };
  toast.querySelector("button")?.addEventListener("click", dismiss);
  window.setTimeout(dismiss, 4800);
};

window.alert = (message) => showToast(message, /error|no pudimos|incorrect|bloquead|rechaz/i.test(String(message)) ? "danger" : "info");

const dialogAction = ({ title, message, input = false, initialValue = "", confirmLabel = "Confirmar" }) =>
  new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "app-dialog-backdrop";
    backdrop.innerHTML = `
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle">
        <div class="app-dialog-mark" aria-hidden="true"><i data-lucide="shield-check"></i></div>
        <h2 id="appDialogTitle">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        ${input ? `<label><span>Detalle</span><input id="appDialogInput" value="${escapeHtml(initialValue)}" maxlength="500" /></label>` : ""}
        <div>
          <button type="button" class="dialog-cancel">Cancelar</button>
          <button type="button" class="dialog-confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </section>`;
    document.body.append(backdrop);
    window.lucide?.createIcons();
    const field = backdrop.querySelector("#appDialogInput");
    const close = (value) => {
      backdrop.classList.remove("visible");
      window.setTimeout(() => backdrop.remove(), 180);
      resolve(value);
    };
    backdrop.querySelector(".dialog-cancel").addEventListener("click", () => close(input ? "" : false));
    backdrop.querySelector(".dialog-confirm").addEventListener("click", () => close(input ? field.value.trim() : true));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(input ? "" : false);
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close(input ? "" : false);
      if (event.key === "Enter" && (!input || document.activeElement === field)) close(input ? field.value.trim() : true);
    });
    requestAnimationFrame(() => {
      backdrop.classList.add("visible");
      (field || backdrop.querySelector(".dialog-confirm")).focus();
    });
  });

const confirmAction = (message, title = "Confirmar acción") =>
  dialogAction({ title, message, confirmLabel: "Continuar" });

const promptAction = (message, initialValue = "", title = "Cuéntanos qué ocurrió") =>
  dialogAction({ title, message, input: true, initialValue, confirmLabel: "Enviar" });

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
    const itemDistance = Number(item.distance);
    const distanceMatch = !Number.isFinite(itemDistance) || itemDistance <= Number(state.filters.distance || 50);
    const conditionMatch = state.filters.condition === "Todas" || item.condition === state.filters.condition;
    return textMatch && categoryMatch && minMatch && maxMatch && distanceMatch && conditionMatch;
  }).sort((a, b) => Number(Boolean(b.promoted)) - Number(Boolean(a.promoted)));
};

const currentIdentity = () => {
  const name = state.user?.name || `Visitante ${state.sessionId.slice(-4).toUpperCase()}`;
  return {
    id: state.user?.id || state.user?.email || state.sessionId,
    name,
    email: state.user?.email || "",
    avatar: state.user ? `/api/avatar/${encodeURIComponent(state.user.name)}.svg` : `/api/avatar/${encodeURIComponent(name)}.svg`
  };
};

const hasCompleteAccess = (user = state.user) =>
  Boolean(
    (user?.admin || state.authenticated || state.authToken) &&
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
  if (message.senderId) {
    return [currentIdentity().id, state.user?.email].filter(Boolean).map(String).includes(String(message.senderId));
  }
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

let csrfRequest = null;
const ensureCsrfToken = async (force = false) => {
  if (state.csrfToken && !force) return state.csrfToken;
  if (csrfRequest && !force) return csrfRequest;
  csrfRequest = fetch("/api/security/csrf", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.json())
    .then((data) => {
      state.csrfToken = data.token || "";
      return state.csrfToken;
    })
    .catch(() => "")
    .finally(() => {
      csrfRequest = null;
    });
  return csrfRequest;
};

const api = async (path, options = {}) => {
  const { assistant = true, ...requestOptions } = options;
  const stateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(String(requestOptions.method || "GET").toUpperCase());
  if (stateChanging) await ensureCsrfToken();
  const identity = currentIdentity();
  const headers = {
    "Content-Type": "application/json",
    "X-User-Id": identity.id,
    "X-User-Name": encodeURIComponent(identity.name),
    "X-User-Email": identity.email,
    ...(stateChanging && state.csrfToken ? { "X-CSRF-Token": state.csrfToken } : {}),
    ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
    ...(requestOptions.headers || {})
  };
  try {
    const response = await fetch(path, { credentials: "same-origin", ...requestOptions, headers });
    const body = await response.text();
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = { error: "La respuesta del servidor no pudo interpretarse." };
    }
    const expectedGuestRequest = response.status === 401 && ["/api/user", "/api/orders", "/api/notifications", "/api/conversations"].includes(path);
    if (!response.ok && assistant && !expectedGuestRequest) {
      recordAssistantIssue(data.error || `Error ${response.status}`, { path, status: response.status });
    }
    return data;
  } catch {
    const message = "No pudimos conectar con MarketPro. Revisa tu conexión e intenta nuevamente.";
    if (assistant) recordAssistantIssue(message, { path, status: 0 });
    return { error: message };
  }
};

const assistantWidget = () => `
  <aside class="ai-agent ${state.assistantOpen ? "open" : ""}" id="aiAgentRoot" aria-live="polite">
    ${state.assistantOpen ? `
      <section class="ai-agent-panel" role="dialog" aria-label="Asistente MarketPro">
        <header>
          <div><span>MP</span><strong>Asistente</strong></div>
          <button type="button" data-assistant-close aria-label="Cerrar asistente">×</button>
        </header>
        <div class="ai-agent-messages">
          ${state.assistantMessages.slice(-6).map((message) => `<p class="${message.role}">${escapeHtml(message.text)}</p>`).join("")}
          ${state.assistantBusy ? `<p class="assistant typing">Analizando…</p>` : ""}
        </div>
        <div class="ai-agent-suggestions">
          <button type="button" data-assistant-prompt="No puedo publicar">No puedo publicar</button>
          <button type="button" data-assistant-prompt="Tengo un problema con el pago">Problema con pago</button>
          <button type="button" data-assistant-prompt="No puedo entrar a mi cuenta">No puedo entrar</button>
        </div>
        <form id="aiAgentForm">
          <input name="question" maxlength="700" autocomplete="off" placeholder="Describe el problema" required />
          <button type="submit" aria-label="Enviar">Enviar</button>
        </form>
        <small>No compartas contraseñas, códigos ni documentos.</small>
      </section>
    ` : ""}
    <button class="ai-agent-launcher" type="button" data-assistant-open aria-label="Abrir asistente">
      <span>MP</span><b>Ayuda</b>${state.assistantLastError ? `<i></i>` : ""}
    </button>
  </aside>
`;

const refreshAssistantWidget = () => {
  const current = document.querySelector("#aiAgentRoot");
  if (!current) return;
  current.outerHTML = assistantWidget();
  bindAssistantEvents();
};

const recordAssistantIssue = (message, details = {}) => {
  const normalized = String(message || "Ocurrió un error inesperado.").slice(0, 400);
  state.assistantLastError = { message: normalized, ...details };
  const previous = state.assistantMessages.at(-1);
  if (previous?.text !== normalized) {
    state.assistantMessages.push({ role: "assistant", text: `Detecté un problema: ${normalized}` });
  }
  state.assistantOpen = true;
  queueMicrotask(refreshAssistantWidget);
};

const askAssistant = async (question) => {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion || state.assistantBusy) return;
  state.assistantMessages.push({ role: "user", text: cleanQuestion });
  state.assistantBusy = true;
  refreshAssistantWidget();
  const result = await api("/api/assistant", {
    method: "POST",
    assistant: false,
    body: JSON.stringify({
      question: cleanQuestion,
      context: {
        view: state.view,
        action: state.assistantLastError?.path || "",
        error: state.assistantLastError?.message || "",
        status: state.assistantLastError?.status || 0
      }
    })
  });
  state.assistantBusy = false;
  state.assistantMessages.push({
    role: "assistant",
    text: result.answer || result.error || "No pude completar el diagnóstico. Abre Soporte para que revisemos el caso."
  });
  refreshAssistantWidget();
};

const bindAssistantEvents = () => {
  document.querySelector("[data-assistant-open]")?.addEventListener("click", () => {
    state.assistantOpen = true;
    state.assistantLastError = null;
    refreshAssistantWidget();
  });
  document.querySelector("[data-assistant-close]")?.addEventListener("click", () => {
    state.assistantOpen = false;
    refreshAssistantWidget();
  });
  document.querySelectorAll("[data-assistant-prompt]").forEach((button) => {
    button.addEventListener("click", () => askAssistant(button.dataset.assistantPrompt));
  });
  document.querySelector("#aiAgentForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    askAssistant(form.get("question"));
  });
};

const migrateLegacySession = async () => {
  if (!state.authToken) return;
  const result = await api("/api/auth/session/migrate", {
    method: "POST",
    assistant: false,
    body: "{}"
  });
  if (result.ok) {
    state.user = result.user || state.user;
    state.authenticated = true;
    state.authToken = "";
    localStorage.removeItem("marketAuthToken");
  }
};

const loadData = async () => {
  await ensureCsrfToken();
  await migrateLegacySession();
  if (state.user && !state.user.admin && !state.authToken && !state.authenticated) {
    state.user = null;
  }
  const [products, conversations, savedUser, orders, notifications] = await Promise.all([
    api("/api/products"),
    api("/api/conversations"),
    api("/api/user"),
    api("/api/orders"),
    api("/api/notifications")
  ]);
  state.products = products.map(normalizeProduct);
  state.conversations = conversations;
  state.orders = Array.isArray(orders) ? orders : [];
  state.notifications = Array.isArray(notifications) ? notifications : [];
  if (savedUser?.email) state.authenticated = true;
  if (savedUser?.email && (!state.user?.email || state.user.email === savedUser.email)) {
    state.user = savedUser;
  }
  if (state.user && !state.user.admin) {
    const dashboard = await api("/api/seller-dashboard");
    state.sellerDashboard = dashboard.error ? null : dashboard;
  }
  state.selectedChatId = conversations[0]?.id || null;
  connectSocket();
  render();
  window.setTimeout(dismissSplash, 560);
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
  if (state.user?.admin) return state.sellerDashboard;
  state.sellerDashboard = await api("/api/seller-dashboard");
  return state.sellerDashboard;
};

const refreshLiveData = async () => {
  const [products, conversations, orders, notifications] = await Promise.all([
    api("/api/products"),
    api("/api/conversations"),
    api("/api/orders"),
    api("/api/notifications")
  ]);
  if (Array.isArray(products)) state.products = products.map(normalizeProduct);
  if (Array.isArray(conversations)) state.conversations = conversations;
  if (Array.isArray(orders)) state.orders = orders;
  if (Array.isArray(notifications)) state.notifications = notifications;
};

const connectSocket = () => {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  if (state.socket?.readyState === WebSocket.OPEN || state.socket?.readyState === WebSocket.CONNECTING) return;
  state.socket = new WebSocket(`${protocol}://${location.host}`);
  state.socket.addEventListener("open", () => {
    state.socket.send(JSON.stringify({ type: "hello", ...(state.authToken ? { token: state.authToken } : {}) }));
  });
  state.socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "typing") {
      state.chatTyping[payload.chatId] = payload.active ? payload.name || "La otra persona" : "";
      const presence = document.querySelector("[data-chat-presence]");
      if (presence && payload.chatId === state.selectedChatId) {
        presence.textContent = payload.active ? `${payload.name || "La otra persona"} está escribiendo…` : "Conversación sincronizada";
      }
      return;
    }
    if (payload.type === "read") {
      state.conversations = state.conversations.map((chat) => chat.id === payload.chatId
        ? {
            ...chat,
            messages: chat.messages.map((message) =>
              isMyMessage(message) ? { ...message, readAt: payload.readAt } : message
            )
          }
        : chat
      );
      if (state.view === "messages") render();
      return;
    }
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
    <nav class="market-nav" aria-label="Navegación principal">
      <button class="${state.view === "feed" || state.view === "detail" ? "active" : ""}" data-view="feed">Inicio</button>
      <button class="${state.view === "categories" ? "active" : ""}" data-view="categories">Categorías</button>
      <button class="${state.view === "compose" ? "active" : ""}" data-view="compose">Vender</button>
      <button class="${state.view === "orders" ? "active" : ""}" data-view="orders">Órdenes</button>
      <button class="${state.view === "messages" ? "active" : ""}" data-view="messages">Chats</button>
    </nav>
    <div class="top-actions">
      ${state.canInstallPwa ? `<button class="nav-btn install-btn" id="installPwa">Instalar app</button>` : ""}
      <button class="nav-btn help-btn" data-view="support"><i data-lucide="shield-check"></i><span>Centro de ayuda</span></button>
      <button class="nav-btn compact-alert ${state.view === "notifications" ? "active" : ""}" data-view="notifications" aria-label="Alertas"><i data-lucide="bell"></i><span>Alertas</span>${state.notifications.filter((item) => !item.read).length ? ` <b>${state.notifications.filter((item) => !item.read).length}</b>` : ""}</button>
      <button class="nav-btn cart-nav ${state.view === "cart" ? "active" : ""}" data-view="cart" aria-label="Carrito"><i data-lucide="shopping-cart"></i>${cartCount() ? `<b>${cartCount()}</b>` : ""}</button>
      <button class="avatar-btn ${state.view === "profile" ? "active" : ""}" data-view="profile" title="Perfil">${state.user ? state.user.name[0] : "E"}</button>
    </div>
  </header>
  <div class="market-search-row">
    <div class="searchbox" role="search">
      <span class="search-icon" aria-hidden="true"><i data-lucide="search"></i></span>
      <input id="globalSearch" value="${escapeHtml(state.query)}" aria-label="Buscar artículos, usuarios o marcas" placeholder="Buscar productos, usuarios o categorías..." />
      <button class="search-scope" type="button">Todas las categorías <i data-lucide="chevron-down"></i></button>
      <button class="search-filter" type="button" data-filter-toggle aria-label="Mostrar u ocultar filtros"><i data-lucide="sliders-horizontal"></i></button>
    </div>
  </div>
  <nav class="mobile-tabs">
    <button class="${state.view === "feed" || state.view === "detail" ? "active" : ""}" data-view="feed" aria-label="Inicio"><i data-lucide="house"></i><small>Inicio</small></button>
    <button class="${state.view === "compose" ? "active" : ""}" data-view="compose" aria-label="Vender"><i data-lucide="tag"></i><small>Vender</small></button>
    <button class="${state.view === "orders" ? "active" : ""}" data-view="orders" aria-label="Órdenes"><i data-lucide="wallet-cards"></i><small>Órdenes</small></button>
    <button class="${state.view === "messages" ? "active" : ""}" data-view="messages" aria-label="Chats"><i data-lucide="messages-square"></i><small>Chats</small></button>
    <button class="${state.view === "profile" ? "active" : ""}" data-view="profile" aria-label="Perfil"><i data-lucide="user-round"></i><small>Perfil</small></button>
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
  ${state.installBannerDismissed ? "" : `<section class="pwa-install-card">
    <span class="install-mark" aria-hidden="true">↓</span>
    <div>
      <strong>Instala MarketPro</strong>
      <span>En Android toca Instalar. En iPhone: Compartir > Agregar a pantalla de inicio.</span>
    </div>
    <div class="install-actions">
      <button class="install-chip" id="installPwa" type="button">${state.canInstallPwa ? "Instalar" : "Cómo instalar"}</button>
      <button class="install-dismiss" type="button" data-install-dismiss aria-label="Cerrar recomendación de instalación">×</button>
    </div>
  </section>`}
`;

const sidebar = () => `
  <aside class="sidebar ${state.filtersOpen ? "open" : ""}">
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

const sellerSidebar = (active = "summary") => `
  <aside class="seller-sidebar" aria-label="Panel del vendedor">
    <nav class="seller-nav">
      <button class="${active === "summary" ? "active" : ""}" data-view="profile"><i data-lucide="house"></i>Inicio</button>
      <button class="${active === "listings" ? "active" : ""}" data-view="compose"><i data-lucide="notebook-tabs"></i>Publicaciones</button>
      <button class="${active === "orders" ? "active" : ""}" data-view="orders"><i data-lucide="package-check"></i>Órdenes</button>
      <button data-view="messages"><i data-lucide="messages-square"></i>Mensajes</button>
      <button data-view="feed"><i data-lucide="heart"></i>Favoritos</button>
      <button data-view="profile"><i data-lucide="settings"></i>Configuración</button>
      <button class="seller-help-link" data-view="support"><i data-lucide="circle-help"></i>Ayuda</button>
    </nav>
  </aside>
`;

const trustBadge = (item) => `
  <span class="trust-badge">Verificado ${trustScore(item)}%</span>
`;

const sellerReliability = (item) => [
  "Identidad validada",
  sellerHasRating(item.seller) ? `${Number(item.seller.rating).toFixed(1)}/5 reputacion real` : "Sin calificaciones todavia",
  "Chat auditado",
  "Pago directo en Mercado Pago"
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
        <li>Pago directo a la cuenta Mercado Pago del vendedor</li>
        <li>Chat monitoreado contra fraude</li>
        <li>Incidencia prepara evidencia para reclamo</li>
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
  const role = orderRole(order);
  const isBuyer = role === "Compra";
  const isSeller = role === "Venta";
  const tracking = order.delivery?.tracking;
  const paymentApproved = order.paymentNotification?.status === "approved";
  const usesSellerPaymentLink = order.mercadoPago?.mode === "seller-payment-link";
  const completed = order.deliveryConfirmation?.status === "Confirmada" || order.delivery?.status === "Completada" || order.paymentRelease?.status === "Liberado";
  const nextAction = hasOpenDispute
    ? "La operacion esta pausada mientras se revisa la disputa."
    : completed
      ? "Compra finalizada y protegida."
      : isSeller && !proof
        ? "Carga la evidencia del articulo antes de enviarlo."
        : isSeller && !tracking
          ? "Registra el envio y su codigo de rastreo."
          : isBuyer && !proof
            ? "El vendedor esta preparando la evidencia del articulo."
            : isBuyer && !tracking
              ? "Te avisaremos cuando el vendedor despache el articulo."
              : isBuyer && !inspection
                ? "Cuando lo recibas, revisalo y confirma con tu codigo unico."
                : "La operacion esta esperando su siguiente validacion.";
  return `
    <section class="delivery-workflow simple-delivery-flow">
      <div class="delivery-status">
        <span>Tu proximo paso</span>
        <strong>${escapeHtml(order.delivery?.status || order.status)}</strong>
        <small>${escapeHtml(nextAction)}</small>
      </div>
      <div class="delivery-steps">
        <span class="done">1. Orden</span>
        <span class="${proof ? "done" : ""}">2. Preparacion</span>
        <span class="${tracking ? "done" : ""}">3. Envio</span>
        <span class="${hasOpenDispute ? "danger" : completed ? "done" : ""}">4. Entrega</span>
      </div>
      ${proof && isSeller ? `
        <div class="proof-summary">
          <strong>Evidencia cargada</strong>
          <span>${escapeHtml(proof.packageNotes)} - ${escapeHtml(proof.serialOrMark)} - ${escapeHtml(proof.accessories)}</span>
        </div>
      ` : ""}
      ${isSeller && usesSellerPaymentLink && !paymentApproved ? `
        <form class="secure-subform" id="sellerPaymentConfirmForm">
          <span class="action-kicker">Paso del vendedor</span>
          <strong>Confirma el pago en Mercado Pago antes de preparar el envío</strong>
          <small>Revisa el cobro en tu cuenta oficial. Esta confirmación queda auditada en la orden.</small>
          <input name="paymentId" required placeholder="Identificador de pago de Mercado Pago" />
          <label class="check-row master-check"><input type="checkbox" name="confirmedInMercadoPago" required /> Confirmo que el pago figura acreditado en mi cuenta oficial de Mercado Pago.</label>
          <button class="buy-action" type="submit">Confirmar pago recibido</button>
        </form>
      ` : ""}
      ${isSeller && !proof ? `
        <form class="secure-subform" id="sellerProofForm">
          <span class="action-kicker">Paso del vendedor</span>
          <strong>Demuestra que envias el articulo correcto</strong>
          <small>Estos datos quedan unidos a la orden y protegen a ambas partes.</small>
          <input name="packageNotes" required placeholder="Estado del empaque y articulo" />
          <input name="serialOrMark" required placeholder="Serie, IMEI, marca unica o detalle identificable" />
          <input name="accessories" required placeholder="Accesorios incluidos" />
          <input name="photos" type="file" accept="image/*" multiple />
          <button class="buy-action" type="submit">Guardar evidencia</button>
        </form>
      ` : ""}
      ${isSeller && proof && !tracking ? `
        <form class="secure-subform" id="markTransitForm">
          <span class="action-kicker">Paso del vendedor</span>
          <strong>Registrar envio</strong>
          <select name="carrier" required>
            <option value="">Empresa o metodo</option>
            <option>DAC</option>
            <option>UES</option>
            <option>Correo Uruguayo</option>
            <option>Mirtrans</option>
            <option>DePunta</option>
            <option>Agencia local</option>
            <option>Entrega personal verificada</option>
          </select>
          <input name="trackingCode" placeholder="Codigo de rastreo obligatorio para envios" />
          <input name="note" placeholder="Nota de traslado" />
          <button class="buy-action" type="submit">Confirmar despacho</button>
        </form>
      ` : ""}
      ${isBuyer && proof && tracking && !inspection && !hasOpenDispute ? `
        <form class="secure-subform buyer-confirm-card" id="deliveryConfirmForm">
          <span class="action-kicker">Paso del comprador</span>
          <strong>Revisa y confirma en un solo paso</strong>
          <small>No confirmes si el paquete esta abierto o el articulo no coincide.</small>
          <input name="code" required inputmode="numeric" autocomplete="one-time-code" placeholder="Codigo unico de entrega" />
          <label class="check-row master-check"><input type="checkbox" name="purchaseVerified" required /> Revise identidad, paquete, articulo, accesorios y estado; todo coincide con la publicacion.</label>
          <input name="conditionNote" placeholder="Observacion opcional" />
          <button class="buy-action" type="submit">Confirmar y finalizar compra</button>
        </form>
      ` : ""}
      ${completed ? `
        <div class="proof-summary release-ok">
          <strong>Compra completada</strong>
          <span>Entrega validada y operacion cerrada el ${escapeHtml(order.deliveryConfirmation?.confirmedAt || order.delivery?.confirmedAt || order.paymentRelease?.releasedAt || "")}</span>
        </div>
      ` : ""}
      ${isBuyer && completed && !order.sellerRating ? `
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
      ${!completed ? `
        <details class="dispute-drawer">
          <summary>Algo no esta bien</summary>
          <form class="secure-subform dispute-form" id="disputeForm">
            <strong>Pausar operacion y pedir revision</strong>
            <select name="reason" required>
              <option value="">Selecciona el problema</option>
              <option>Producto distinto al publicado</option>
              <option>Faltan accesorios</option>
              <option>Producto danado o manipulado</option>
              <option>No entregado / falsa entrega</option>
              <option>Presion para entregar codigo</option>
            </select>
            <input name="description" required placeholder="Describe brevemente que paso" />
            <input name="evidence" type="file" accept="image/*" multiple />
            <button class="danger-btn" type="submit">Pausar y solicitar revision</button>
          </form>
        </details>
      ` : ""}
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
      <img src="${item.images[0]}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
      ${trustBadge(item)}
      <span class="card-heart" aria-hidden="true">♡</span>
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
        <span>Pago directo MP</span>
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
  const visuals = state.products.slice(0, 4);
  return `
    <aside class="hero-visual hero-product-visual" aria-hidden="true">
      <div class="hero-product-orbit"></div>
      <div class="hero-product-stage">
        ${visuals.map((item, index) => `<img class="hero-product hero-product-${index + 1}" src="${item.images[0]}" alt="" />`).join("")}
      </div>
    </aside>
  `;
};

const trustFeatures = () => `
  <section class="trust-feature-row" aria-label="Beneficios de MarketPro">
    <article><i data-lucide="shield-check"></i><div><strong>Personas verificadas</strong><span>Perfiles revisados</span></div></article>
    <article><i data-lucide="lock-keyhole"></i><div><strong>Pagos seguros</strong><span>Protección en cada compra</span></div></article>
    <article><i data-lucide="headphones"></i><div><strong>Soporte 24/7</strong><span>Estamos para ayudarte</span></div></article>
    <article><i data-lucide="badge-check"></i><div><strong>Protección al comprador</strong><span>Compra con tranquilidad</span></div></article>
  </section>
`;

const categoryShowcase = () => `
  <section class="category-showcase" aria-label="Categorías principales">
    ${categories.filter((category) => category !== "Todo").slice(0, 5).map((category) => {
      const count = state.products.filter((item) => item.category === category).length;
      const icon = ({ Vehiculos: "car-front", Inmuebles: "building-2", Electronica: "smartphone", Ropa: "shopping-bag", Hogar: "armchair", Deportes: "dumbbell", Juguetes: "gamepad-2", Entretenimiento: "clapperboard" })[category] || "tag";
      return `<button data-category="${escapeHtml(category)}"><span><i data-lucide="${icon}"></i></span><strong>${escapeHtml(category)}</strong><small>${count} ${count === 1 ? "publicación" : "publicaciones"}</small></button>`;
    }).join("")}
  </section>
`;

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

const orderRole = (order) => {
  const email = String(state.user?.email || "").toLowerCase();
  const name = String(state.user?.name || "");
  if (email && String(order.buyer?.email || "").toLowerCase() === email) return "Compra";
  if (email && String(order.seller?.email || "").toLowerCase() === email) return "Venta";
  if (name && order.buyer?.name === name) return "Compra";
  if (name && order.seller?.name === name) return "Venta";
  return "Operacion";
};

const visibleOrders = () => {
  const identity = currentIdentity();
  const email = String(identity.email || "").toLowerCase();
  const name = String(identity.name || "");
  return (state.orders || [])
    .filter((order) => {
      const involved =
        !state.user?.email ||
        String(order.buyer?.email || "").toLowerCase() === email ||
        String(order.seller?.email || "").toLowerCase() === email ||
        order.buyer?.name === name ||
        order.seller?.name === name;
      if (!involved) return false;
      if (state.orderTab === "buying") return orderRole(order) === "Compra";
      if (state.orderTab === "selling") return orderRole(order) === "Venta";
      if (state.orderTab === "disputes") return order.disputes?.some((item) => item.status !== "Cerrada");
      return true;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

const orderCompleted = (order) => Boolean(
  order.deliveryConfirmation?.status === "Confirmada" ||
  order.delivery?.status === "Completada" ||
  order.paymentRelease?.status === "Liberado"
);

const orderPhase = (order) => {
  if (order.disputes?.some((item) => item.status !== "Cerrada")) return ["Disputa", "danger"];
  if (orderCompleted(order)) return ["Completada", "done"];
  if (order.delivery?.buyerInspection) return ["Recepcion validada", "active"];
  if (order.delivery?.tracking) return ["En entrega", "active"];
  if (order.delivery?.sellerProof) return ["Evidencia cargada", "active"];
  if (/aprobado/i.test(order.status || "")) return ["Pago aprobado", "active"];
  return ["Pago pendiente", "pending"];
};

const orderCard = (order) => {
  const [phase, phaseClass] = orderPhase(order);
  const product = state.products.find((item) => item.id === order.productId);
  const image = order.snapshot?.images?.[0] || product?.images?.[0] || "/mp-logo.svg";
  return `
    <article class="order-card ${phaseClass}">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(order.productTitle)}" />
      <div>
        <div class="order-topline">
          <span>${escapeHtml(orderRole(order))}</span>
          <b>${escapeHtml(phase)}</b>
        </div>
        <strong>${escapeHtml(order.productTitle)}</strong>
        <small>${escapeHtml(order.id)} - ${money(order.amount)} - ${escapeHtml(order.delivery?.method || "Entrega")} - ${escapeHtml(order.paymentMethod || "mercadopago")}</small>
        <div class="order-progress">
          <i class="done"></i>
          <i class="${order.delivery?.sellerProof ? "done" : ""}"></i>
          <i class="${order.delivery?.tracking ? "done" : ""}"></i>
          <i class="${order.delivery?.buyerInspection ? "done" : ""}"></i>
          <i class="${orderCompleted(order) ? "done" : ""}"></i>
        </div>
      </div>
      <button class="secondary-btn" data-open-order="${order.id}">Ver flujo</button>
    </article>
  `;
};

const ordersSummary = () => {
  const orders = visibleOrders();
  const openDisputes = orders.filter((order) => order.disputes?.some((item) => item.status !== "Cerrada")).length;
  const completed = orders.filter(orderCompleted).length;
  return `
    <section class="seller-metrics order-metrics">
      <div class="metric-card"><i data-lucide="shopping-cart"></i><span>Operaciones</span><strong>${orders.length}</strong><small>En progreso actualmente</small></div>
      <div class="metric-card"><i data-lucide="circle-check"></i><span>Completadas</span><strong>${completed}</strong><small>Órdenes finalizadas</small></div>
      <div class="metric-card"><i data-lucide="shield-alert"></i><span>Disputas</span><strong>${openDisputes}</strong><small>En revisión actualmente</small></div>
      <div class="metric-card"><i data-lucide="shield-check"></i><span>Protección</span><strong>Activa</strong><small>Tu cuenta está protegida</small></div>
    </section>
  `;
};

const ordersPanel = () => {
  const orders = visibleOrders();
  return `
    <section class="panel orders-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Centro de ordenes</p>
          <h1>Compras, ventas y entregas en un solo panel.</h1>
          <p class="muted">Cada orden conserva precio, vendedor, comprador, evidencia, chat y codigo unico para reducir estafas.</p>
        </div>
      </div>
      ${ordersSummary()}
      <div class="order-tabs">
        ${[
          ["all", "Todas"],
          ["buying", "Compras"],
          ["selling", "Ventas"],
          ["disputes", "Disputas"]
        ].map(([id, label]) => `<button class="${state.orderTab === id ? "active" : ""}" data-order-tab="${id}">${label}</button>`).join("")}
      </div>
      <div class="orders-list">
        ${orders.length ? orders.map(orderCard).join("") : `<div class="empty premium-empty"><span><i data-lucide="package-open"></i></span><strong>Todavía no hay órdenes para esta vista.</strong><small>Cuando recibas órdenes, aparecerán aquí.</small></div>`}
      </div>
    </section>
  `;
};

const sellerPromotionPanel = () => {
  const mine = state.products.filter((item) =>
    (item.seller?.email === state.user?.email || item.seller?.name === state.user?.name) && item.status !== "sold"
  );
  return `
    <section class="panel promotion-panel orders-promotion-panel">
      <div class="promotion-visual-copy">
        <div class="promotion-art" aria-hidden="true"><i data-lucide="crown"></i><span><i data-lucide="image"></i><b>DESTACADO</b></span></div>
        <div>
          <p class="eyebrow">Anuncio principal</p>
          <h2>Destaca un producto por <em>US$ 1</em></h2>
          <p class="muted">Tu publicación aparece primero en la página principal como anuncio destacado.</p>
          <div class="promotion-benefits">
            <span><i data-lucide="star"></i><b>Más visibilidad</b><small>Aumentá las visitas.</small></span>
            <span><i data-lucide="trending-up"></i><b>Más oportunidades</b><small>Llegá a más compradores.</small></span>
            <span><i data-lucide="shield-check"></i><b>Pago seguro</b><small>Procesado por Mercado Pago.</small></span>
          </div>
        </div>
      </div>
      ${mine.length ? `<form id="promotionForm" class="promotion-form">
        <label>Elegí una publicación</label>
        <select name="productId" required>
          <option value="">Elige una publicación</option>
          ${mine.map((item) => `<option value="${item.id}">${item.promoted ? "Destacado - " : ""}${escapeHtml(item.title)}</option>`).join("")}
        </select>
        <button class="sell-action" type="submit"><i data-lucide="shield-check"></i>Pagar US$ 1 y destacar</button>
        <small>El pago se realiza por Mercado Pago vinculado a MarketPro.</small>
      </form>` : `<div class="empty">Publica un producto activo para poder destacarlo.</div>`}
    </section>
  `;
};

const ordersView = () => `
  ${sellerSidebar("orders")}
  <main>
    <div class="toolbar-row">
      <button type="button" class="filter-toggle" data-filter-toggle>${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}</button>
    </div>
    ${ordersPanel()}
    ${sellerPromotionPanel()}
  </main>
`;

const currentOrder = () =>
  state.orders.find((order) => order.id === state.selectedOrderId) ||
  state.orders.find((order) => order.id === state.checkoutOrder?.id) ||
  state.checkoutOrder ||
  null;

const orderTimeline = (order) => {
  const items = [
    ...(order.delivery?.timeline || []),
    ...(order.security?.auditTrail || []).map((item) => ({ ...item, security: true }))
  ]
    .filter((item) => item.event)
    .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  return `
    <section class="order-detail-card order-timeline-card">
      <p class="eyebrow">Auditoria</p>
      <h2>Linea de tiempo</h2>
      <div class="order-timeline">
        ${items.length ? items.map((item) => `
          <div>
            <span>${escapeHtml(item.security ? "Shield" : "Orden")}</span>
            <strong>${escapeHtml(item.event)}</strong>
            <small>${escapeHtml(item.at || "")}</small>
          </div>
        `).join("") : `<div class="empty">Todavía no hay eventos.</div>`}
      </div>
    </section>
  `;
};

const orderChatCard = (order) => {
  const chat = state.conversations.find((item) => item.orderId === order.id || item.id === order.chatId);
  return `
    <section class="order-detail-card">
      <p class="eyebrow">Chat vinculado</p>
      <h2>Conversación de esta orden</h2>
      <p class="muted">Todo acuerdo, evidencia o alerta queda unido a la orden para reclamos y revision admin.</p>
      ${chat ? `
        <div class="linked-chat">
          <img src="${escapeHtml(chat.avatar || order.seller?.avatar || "/mp-logo.svg")}" alt="${escapeHtml(chat.seller || "Vendedor")}" />
          <div>
            <strong>${escapeHtml(chat.productTitle || order.productTitle)}</strong>
            <span>${escapeHtml((chat.messages || []).at(-1)?.text || "Chat seguro activo")}</span>
          </div>
          <button class="secondary-btn" data-chat="${escapeHtml(chat.id)}">Abrir chat</button>
        </div>
      ` : `
        <button class="secondary-btn" data-order-chat="${escapeHtml(order.id)}">Crear chat de orden</button>
      `}
    </section>
  `;
};

const orderDetailView = () => {
  const order = currentOrder();
  if (!order) return ordersView();
  const product = state.products.find((item) => item.id === order.productId);
  const [phase, phaseClass] = orderPhase(order);
  const image = order.snapshot?.images?.[0] || product?.images?.[0] || "/mp-logo.svg";
  state.checkoutOrder = order;
  return `
    ${sellerSidebar("orders")}
    <main>
      <div class="toolbar-row">
        <button type="button" class="filter-toggle" data-filter-toggle>${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}</button>
      </div>
      <button class="text-btn" data-view="orders">Volver a ordenes</button>
      <section class="panel order-detail-hero ${phaseClass}">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(order.productTitle)}" />
        <div>
          <p class="eyebrow">Orden protegida</p>
          <h1>${escapeHtml(order.productTitle)}</h1>
          <div class="order-topline"><span>${escapeHtml(orderRole(order))}</span><b>${escapeHtml(phase)}</b></div>
          <p class="muted">Orden ${escapeHtml(order.id)} - ${money(order.amount)} - ${escapeHtml(order.paymentMethod || "Mercado Pago")}</p>
        </div>
      </section>
      <section class="order-detail-grid">
        <section class="order-detail-card">
          <p class="eyebrow">Partes</p>
          <h2>Comprador y vendedor</h2>
          <div class="party-grid">
            <div><span>Comprador</span><strong>${escapeHtml(order.buyer?.name || "Comprador")}</strong><small>${escapeHtml(order.buyer?.email || order.buyer?.phone || "")}</small></div>
            <div><span>Vendedor</span><strong>${escapeHtml(order.seller?.name || "Vendedor")}</strong><small>${escapeHtml(order.seller?.email || "")}</small></div>
          </div>
        </section>
        <section class="order-detail-card">
          <p class="eyebrow">Pago</p>
          <h2>${escapeHtml(order.mercadoPago?.status || order.status)}</h2>
          <p class="muted">${escapeHtml(order.mercadoPago?.note || "Pago directo al vendedor mediante Mercado Pago. MarketPro no recibe ni retiene dinero.")}</p>
          ${order.mercadoPago?.checkoutUrl ? `<a class="buy-action checkout-link" href="${escapeHtml(order.mercadoPago.checkoutUrl)}" target="_blank" rel="noopener">Abrir Mercado Pago</a>` : ""}
        </section>
        <section class="order-detail-card">
          <p class="eyebrow">Entrega</p>
          <h2>${escapeHtml(order.delivery?.status || "Pendiente")}</h2>
          <p class="muted">${escapeHtml(order.delivery?.address || "")} - ${escapeHtml(order.delivery?.city || "")}</p>
          ${order.delivery?.tracking ? `<div class="tracking-chip"><strong>${escapeHtml(order.delivery.tracking.carrier || "Envio")}</strong><span>${escapeHtml(order.delivery.tracking.trackingCode || "Sin codigo")}</span></div>` : `<div class="tracking-chip pending"><strong>Tracking pendiente</strong><span>Si usa DAC/UES/Correo, el codigo es obligatorio.</span></div>`}
        </section>
      </section>
      ${orderChatCard(order)}
      ${deliveryWorkflow(order)}
      ${orderTimeline(order)}
    </main>
  `;
};

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
      <h2>El codigo confirma la recepcion y cierra la operacion dentro de MarketPro.</h2>
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
      <p class="eyebrow">Privacidad, términos y cookies</p>
      <h1>Reglas claras para operar con confianza.</h1>
      <p class="muted">Versión vigente: julio de 2026. MarketPro conecta a las partes y registra la operación; el pago se procesa directamente en Mercado Pago.</p>
      <div class="legal-grid">
        <article><strong>Cuenta e identidad</strong><span>Usamos correo, teléfono, cédula, rostro y frente del documento para acceso, recuperación y revisión privada. Las credenciales se protegen y los documentos no forman parte del perfil público.</span></article>
        <article><strong>Responsabilidad del usuario</strong><span>Cada persona debe publicar información verdadera, conservar el chat dentro de MarketPro, revisar el artículo y no compartir contraseñas, códigos ni datos bancarios.</span></article>
        <article><strong>Publicaciones y contenido</strong><span>Podemos pausar contenido duplicado, engañoso, denunciado, prohibido o incompatible con las reglas. El vendedor responde por autenticidad, condición, precio y entrega.</span></article>
        <article><strong>Compras y ventas</strong><span>La orden congela título, precio, fotos, partes y evidencia. MarketPro facilita trazabilidad, pero comprador y vendedor siguen siendo responsables del acuerdo y de la legalidad del artículo.</span></article>
        <article><strong>Pagos externos</strong><span>Mercado Pago procesa el cobro directamente para el vendedor. MarketPro no almacena tarjetas, no recibe, retiene ni libera dinero y no puede prometer reembolsos ajenos a Mercado Pago.</span></article>
        <article><strong>Disputas y reclamos</strong><span>MarketPro conserva publicación, chat, rastreo y evidencia para revisión y para que las partes puedan presentar un reclamo documentado ante Mercado Pago o el proveedor correspondiente.</span></article>
        <article><strong>Retención y eliminación</strong><span>La cuenta puede eliminarse desde Mi cuenta. Conservamos temporalmente registros indispensables de seguridad, fraude, disputas u obligaciones legales y pausamos operaciones incompletas.</span></article>
        <article><strong>Cookies y sesiones</strong><span>Usamos cookies estrictamente necesarias para iniciar sesión, prevenir solicitudes falsas, mantener seguridad y habilitar la instalación PWA. No usamos cookies publicitarias de terceros.</span></article>
        <article><strong>Disponibilidad</strong><span>Buscamos continuidad y recuperación ante fallos, pero una plataforma conectada a proveedores externos puede tener interrupciones. Los estados críticos se validan en el servidor.</span></article>
        <article><strong>Moderación y suspensión</strong><span>El administrador puede revisar evidencia, resolver reportes, suspender cuentas y pausar publicaciones cuando exista riesgo, incumplimiento o información insuficiente.</span></article>
        <article><strong>Protección del menor</strong><span>El servicio está pensado para personas con capacidad legal para contratar. No se deben registrar documentos de terceros ni usar MarketPro para artículos prohibidos.</span></article>
        <article><strong>Soporte y contacto</strong><span>Los reclamos deben incluir el número de orden o publicación y enviarse desde Soporte. Nunca pediremos contraseña, código de entrega ni datos completos de tarjeta.</span></article>
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
            <img src="${item.images[0]}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
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
  <main class="entry-shell entry-v2">
    <section class="entry-v2-inner">
      <header class="entry-v2-brand">
        <img src="/mp-logo.svg" alt="MP" />
        <strong>MARKETPRO</strong>
        <small>CUENTA PRIVADA</small>
      </header>

      <section class="entry-v2-welcome">
        <h1>${state.authMode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta segura"}</h1>
        <p>${state.authMode === "login" ? "Inicia sesión para acceder a tu cuenta" : "Completa tu identidad para solicitar la verificación"}</p>
      </section>

      <section class="entry-v2-card">
        <div class="auth-switch">
          <button class="${state.authMode === "login" ? "active" : ""}" type="button" data-auth-mode="login">Ingresar</button>
          <button class="${state.authMode === "register" ? "active" : ""}" type="button" data-auth-mode="register">Crear cuenta</button>
        </div>

        ${state.authMode === "login" ? `
          <form id="loginForm" class="entry-v2-form" novalidate>
            <div class="field">
              <label>Gmail</label>
              <input name="email" required type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="tu@email.com" />
            </div>
            <div class="field">
              <label>Contraseña</label>
              <input name="password" required type="password" autocomplete="current-password" placeholder="Tu contraseña" />
            </div>
            <div class="entry-v2-options">
              <label><input type="checkbox" name="remember" /> Recordarme</label>
              <button type="button" data-recovery-toggle>¿Olvidaste tu contraseña?</button>
            </div>
            <button class="buy-action" type="submit">Ingresar a MarketPro</button>
          </form>
          <section class="entry-recovery" hidden>
            <form id="resetRequestForm" class="mini-auth-form" novalidate>
              <input name="email" required type="email" placeholder="Gmail para recuperar" />
              <button class="secondary-btn" type="submit">Enviar código</button>
            </form>
            <form id="resetConfirmForm" class="mini-auth-form" novalidate>
              <input name="email" required type="email" placeholder="Gmail" />
              <input name="code" required placeholder="Código recibido" />
              <input name="password" required type="password" minlength="10" placeholder="Nueva contraseña segura" />
              <button class="secondary-btn" type="submit">Cambiar contraseña</button>
            </form>
          </section>
          <div class="entry-v2-divider"><span>o</span></div>
          <button class="entry-create-account" type="button" data-auth-mode="register">Crear una cuenta verificada</button>
        ` : `
          <form id="entryForm" class="entry-v2-form entry-register-form" novalidate>
            <div class="field"><label>Nombre completo</label><input name="name" required autocomplete="name" placeholder="Debe coincidir con tu documento" /></div>
            <div class="two-col">
              <div class="field"><label>Gmail</label><input name="email" required type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="tu@gmail.com" /></div>
              <div class="field"><label>Contraseña</label><input name="password" required type="password" minlength="10" autocomplete="new-password" placeholder="10 caracteres, mayúscula, minúscula y número" /></div>
            </div>
            <div class="two-col">
              <div class="field"><label>Cédula / documento</label><input name="cedula" required placeholder="Documento de identidad" /></div>
              <div class="field"><label>Teléfono</label><input name="phone" required type="tel" autocomplete="tel" placeholder="Teléfono verificable" /></div>
            </div>
            <div class="field">
              <label>Ubicación exacta</label>
              <div class="location-field">
                <input id="exactLocationInput" name="exactLocation" required autocomplete="street-address" placeholder="Calle, número y ciudad" />
                <button class="secondary-btn" type="button" id="useDeviceLocation"><i data-lucide="map-pin"></i>GPS</button>
              </div>
            </div>
            <div class="identity-upload-grid">
              <label class="upload-card"><i data-lucide="scan-face"></i><span>Foto de rostro</span><small>Selfie clara y de frente</small><input name="profilePhoto" required type="file" accept="image/*" capture="user" /></label>
              <label class="upload-card"><i data-lucide="id-card"></i><span>Frente de la cédula</span><small>Documento completo y legible</small><input name="documentPhoto" required type="file" accept="image/*" /></label>
            </div>
            <button class="buy-action" type="submit">Crear cuenta y enviar verificación</button>
            <small class="private-note">Los documentos solo son visibles para el administrador.</small>
          </form>
        `}
      </section>

      <section class="entry-v2-trust">
        <article><i data-lucide="shield-check"></i><strong>Cuenta segura</strong><span>Verificación de identidad</span></article>
        <article><i data-lucide="badge-dollar-sign"></i><strong>Pagos protegidos</strong><span>Con Mercado Pago</span></article>
        <article><i data-lucide="truck"></i><strong>Entrega segura</strong><span>Con seguimiento</span></article>
        <article><i data-lucide="messages-square"></i><strong>Soporte 24/7</strong><span>Siempre disponible</span></article>
      </section>

      ${canShowAdminEntry() ? `<section class="admin-entry">
        <div><span>Acceso privado del creador</span><small>Panel administrativo protegido.</small></div>
        <form id="adminEntryForm">
          <input name="password" required type="password" autocomplete="current-password" placeholder="Contraseña admin" />
          <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Código de seguridad" />
          <button type="submit">Entrar</button>
        </form>
        <a href="/admin.html">Abrir panel privado</a>
      </section>` : ""}

      <nav class="entry-legal-links">
        <button type="button" data-view="security">Términos y condiciones</button>
        <button type="button" data-view="legal">Política de privacidad</button>
        <button type="button" data-view="support">Soporte</button>
      </nav>
    </section>
  </main>
`;

const feedView = () => {
  const products = filteredProducts();
  const filtering = Boolean(
    state.query.trim() ||
    state.filters.category !== "Todo" ||
    state.filters.minPrice ||
    state.filters.maxPrice ||
    state.filters.condition !== "Todas" ||
    state.filters.distance !== "50"
  );
  return `
    ${sidebar()}
    <main>
      <section class="hero-panel ${products.length ? "" : "hero-empty"}">
        <div>
          <p class="eyebrow">MarketPro verificado</p>
          <h1>Compra y vende<br />con confianza.</h1>
          <p>Personas verificadas, pagos seguros y protección en cada operación.</p>
          <div class="hero-cta-stack">
            <button class="buy-action hero-action" data-scroll-products>Explorar productos <i data-lucide="arrow-right"></i></button>
            <button class="secondary-btn hero-secondary" data-view="security"><i data-lucide="circle-play"></i>Cómo funciona</button>
          </div>
        </div>
        ${heroVisual()}
      </section>
      ${trustFeatures()}
      <div class="content-head">
        <div>
          <h2>Destacados para ti</h2>
          <div class="muted">${products.length} publicaciones verificadas</div>
        </div>
        <button type="button" class="filter-toggle" data-filter-toggle>${state.filtersOpen ? "Ocultar filtros" : "Filtros"}</button>
      </div>
      ${
        products.length
          ? `<section class="grid">${products.map(productCard).join("")}</section>`
          : filtering
            ? `<div class="empty real-listings-empty"><strong>No encontramos coincidencias.</strong><span>Prueba con otra palabra o ajusta los filtros.</span><button class="secondary-btn" data-clear-filters>Limpiar búsqueda</button></div>`
            : `<div class="empty real-listings-empty"><strong>Aún no hay publicaciones reales.</strong><span>Se mostrarán aquí cuando un usuario verificado publique su artículo.</span><button class="sell-action" data-view="compose">Publicar el primero</button></div>`
      }
    </main>
  `;
};

const categoriesView = () => `
  <main class="categories-page">
    <section class="categories-heading">
      <p class="eyebrow">Explora MarketPro</p>
      <h1>Todas las categorías</h1>
      <p>Encuentra artículos reales publicados por personas verificadas.</p>
    </section>
    <section class="category-grid-premium">
      ${categories.filter((category) => category !== "Todo").map((category) => {
        const count = state.products.filter((item) => item.category === category).length;
        const icon = ({ Vehiculos: "car-front", Inmuebles: "building-2", Electronica: "monitor-smartphone", Ropa: "shirt", Hogar: "armchair", Deportes: "dumbbell", Juguetes: "gamepad-2", Entretenimiento: "clapperboard" })[category] || "grid-2x2";
        return `<button data-category="${escapeHtml(category)}" class="category-premium-card"><i data-lucide="${icon}"></i><strong>${escapeHtml(category)}</strong><span>${count} ${count === 1 ? "producto" : "productos"}</span></button>`;
      }).join("")}
    </section>
    <section class="category-cta"><div><p class="eyebrow">Encuentra algo especial</p><h2>¿Qué estás buscando?</h2><p>Explora publicaciones con identidad y actividad verificadas.</p><button class="buy-action" data-view="feed">Explorar productos <i data-lucide="arrow-right"></i></button></div><img src="/assets/marketpro-shield.png" alt="" /></section>
  </main>
`;

const cartView = () => {
  const rows = state.cart
    .map((row) => ({ row, product: state.products.find((item) => item.id === row.id) }))
    .filter((entry) => entry.product);
  const subtotal = cartTotal();
  return `
    <main class="cart-page">
      <section class="page-title"><p class="eyebrow">Compra protegida</p><h1>Carrito de compras</h1><p class="muted">${rows.length ? `Tienes ${cartCount()} producto${cartCount() === 1 ? "" : "s"} en tu carrito` : "Tu carrito está vacío"}</p></section>
      ${rows.length ? `
        <div class="cart-layout-v2">
          <section class="cart-items-v2">${rows.map(({ row, product }) => `
            <article class="cart-row-v2">
              <div class="cart-thumb-v2"><img src="${product.images[0]}" alt="${escapeHtml(product.title)}" /></div>
              <div class="cart-item-info-v2"><h4>${escapeHtml(product.title)}</h4><div class="seller-tag-v2"><i data-lucide="badge-check"></i>${product.seller?.verified ? "Vendedor verificado" : "Vendedor nuevo"}</div><div class="price">${money(product.price)}</div></div>
              <div class="qty-control-v2"><button type="button" data-cart-dec="${product.id}" aria-label="Reducir cantidad">−</button><span>${row.qty}</span><button type="button" data-cart-inc="${product.id}" aria-label="Aumentar cantidad">+</button></div>
              <button type="button" class="remove-link-v2" data-cart-remove="${product.id}"><i data-lucide="trash-2"></i>Eliminar</button>
            </article>`).join("")}</section>
          <aside class="summary-card-v2"><h3>Resumen del pedido</h3><div class="summary-line-v2"><span>Subtotal</span><b>${money(subtotal)}</b></div><div class="summary-line-v2"><span>Envío</span><span class="free">A coordinar</span></div><div class="summary-line-v2"><span>Protección al comprador</span><b>${money(0)}</b></div><div class="summary-total-v2"><span>Total</span><span>${money(subtotal)}</span></div><button class="buy-action" type="button" data-cart-checkout>Continuar con la compra</button><button class="secondary-btn" type="button" data-view="feed">Seguir comprando</button><div class="summary-note-v2"><i data-lucide="shield-check"></i>Cada compra se confirma directamente con el vendedor.</div></aside>
        </div>` : `<div class="empty real-listings-empty"><strong>Tu carrito está vacío.</strong><span>Agrega artículos desde una publicación para verlos aquí.</span><button class="buy-action" data-view="feed">Explorar productos</button></div>`}
      <section class="confidence-banner-v2"><span><i data-lucide="shield-check"></i></span><div><h4>Compra con confianza</h4><p>Pagos directos, historial de chat y seguimiento para cada operación.</p></div></section>
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
              <span>Compra protegida iniciada</span>
              <strong>${escapeHtml(state.checkoutOrder.status)}</strong>
              <small>La orden, el chat, el pago y la entrega ya estan vinculados.</small>
              <button class="buy-action" type="button" data-open-order="${escapeHtml(state.checkoutOrder.id)}">Ver mi compra</button>
            </section>
          ` : item.seller?.mercadoPagoConnected ? `
            <form class="checkout-box simple-checkout" id="checkoutForm">
              <input type="hidden" name="paymentMethod" value="mercadopago" />
              <div class="checkout-heading">
                <div>
                  <span>Compra protegida</span>
                  <strong>${money(item.price)}</strong>
                </div>
                <small>Pagas directamente en la cuenta de Mercado Pago del vendedor. MarketPro no recibe el dinero.</small>
              </div>
              <div class="checkout-mini-steps" aria-label="Proceso de compra">
                <span class="active">1. Entrega</span>
                <span>2. Pago</span>
                <span>3. Recepcion</span>
              </div>
              <div class="two-col">
                <div class="field"><label>Direccion</label><input name="address" required autocomplete="street-address" value="${escapeHtml(state.user?.exactLocation || "")}" placeholder="Calle, numero y apartamento" /></div>
                <div class="field"><label>Ciudad o zona</label><input name="city" required autocomplete="address-level2" placeholder="Ciudad o barrio" /></div>
              </div>
              <div class="two-col">
                <div class="field"><label>Telefono</label><input name="phone" required type="tel" autocomplete="tel" value="${escapeHtml(state.user?.phone || "")}" placeholder="Telefono de contacto" /></div>
                <div class="field"><label>Entrega</label><select name="method" required><option>Envio coordinado</option><option>Retiro en punto seguro</option><option>Entrega personal verificada</option></select></div>
              </div>
              <details class="delivery-note-drawer">
                <summary>Agregar instrucciones de entrega</summary>
                <div class="field"><label>Nota opcional</label><input name="note" placeholder="Horario o referencia" /></div>
              </details>
              <label class="check-row purchase-consent"><input type="checkbox" name="purchaseConsent" required /> Compra dentro de MarketPro y revisa el articulo antes de compartir el codigo.</label>
              <button class="buy-action checkout-primary" type="submit">Comprar de forma segura</button>
              <div class="checkout-assurance">
                <span>Identidad verificada</span>
                <span>Publicacion congelada</span>
                <span>Codigo unico</span>
              </div>
            </form>
          ` : `
            <section class="checkout-box simple-checkout mp-unavailable">
              <div class="checkout-heading">
                <div><span>Compra temporalmente no disponible</span><strong>${money(item.price)}</strong></div>
                <small>Este vendedor debe conectar su cuenta de Mercado Pago antes de recibir compras.</small>
              </div>
              <div class="checkout-assurance"><span>Sin cobros intermediados</span><span>Cuenta del vendedor requerida</span><span>Checkout oficial MP</span></div>
            </section>
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

const detailStudioView = () => {
  const item = selectedProduct();
  if (!item) return feedView();
  const currentImage = item.images[state.galleryIndex] || item.images[0];
  const similar = state.products.filter((product) => product.id !== item.id && product.category === item.category).slice(0, 4);
  const canBuy = Boolean(item.seller?.mercadoPagoConnected);
  return `
    <main class="product-studio-page">
      <nav class="product-breadcrumbs"><button type="button" data-view="feed">Inicio</button><i data-lucide="chevron-right"></i><span>${escapeHtml(item.category)}</span><i data-lucide="chevron-right"></i><strong>${escapeHtml(item.title)}</strong></nav>
      <section class="product-studio-shell">
        <section class="product-gallery-v2">
          <div class="product-thumbs">${item.images.map((src, index) => `<button class="${index === state.galleryIndex ? "active" : ""}" data-thumb="${index}"><img src="${src}" alt="Vista ${index + 1}" /></button>`).join("")}</div>
          <div class="product-main-image"><img src="${currentImage}" alt="${escapeHtml(item.title)}" /><button type="button" aria-label="Agregar a favoritos"><i data-lucide="heart"></i></button></div>
          <div class="product-trust-strip">
            <span><i data-lucide="shield-check"></i><b>Compra protegida</b><small>Operación registrada</small></span>
            <span><i data-lucide="lock-keyhole"></i><b>Pago seguro</b><small>Por Mercado Pago</small></span>
            <span><i data-lucide="headphones"></i><b>Soporte</b><small>Ayuda disponible</small></span>
          </div>
        </section>
        <aside class="product-commerce-card">
          <header class="commerce-seller">
            <img src="${item.seller.avatar}" alt="${escapeHtml(item.seller.name)}" />
            <div><strong>${escapeHtml(item.seller.name)}</strong><span>Vendedor verificado · ${sellerHasRating(item.seller) ? `${item.seller.ratingCount} ventas` : "perfil nuevo"}</span></div>
            <small><i></i>En línea</small>
          </header>
          <h1>${escapeHtml(item.title)}</h1>
          <p class="commerce-brand">${escapeHtml(item.category)}</p>
          <div class="commerce-price">${money(item.price)}</div>
          <div class="commerce-meta"><span>Estado: <b>${escapeHtml(item.condition)}</b></span><span>Categoría: <b>${escapeHtml(item.category)}</b></span></div>
          <p class="commerce-description">${escapeHtml(item.description)}</p>
          <section class="commerce-benefits">
            <span><i data-lucide="badge-check"></i><b>Vendedor verificado</b><small>Identidad validada</small></span>
            <span><i data-lucide="lock"></i><b>Compra registrada</b><small>Seguimiento en MarketPro</small></span>
            <span><i data-lucide="star"></i><b>${sellerHasRating(item.seller) ? `${item.seller.rating.toFixed(1)} de reputación` : "Sin calificaciones"}</b><small>Historial transparente</small></span>
            <span><i data-lucide="truck"></i><b>Entrega coordinada</b><small>Rastreo en la orden</small></span>
          </section>
          <section class="buyer-protection"><i data-lucide="shield-check"></i><div><strong>Protección al comprador</strong><span>Revisa el artículo y conserva chat, comprobante y seguimiento dentro de MarketPro.</span></div></section>
          <div class="payment-brands"><span>Paga de forma segura con</span><strong>VISA</strong><strong>Mastercard</strong><strong>Mercado Pago</strong></div>
          ${state.checkoutOrder?.productId === item.id ? `<button class="buy-action" type="button" data-open-order="${escapeHtml(state.checkoutOrder.id)}">Ver mi compra</button>` : `
            <button class="buy-action commerce-buy" type="button" data-open-checkout ${canBuy ? "" : "disabled"}>${canBuy ? "Comprar ahora" : "Compra no disponible"}</button>
            <form class="commerce-checkout" id="checkoutForm" hidden>
              <input type="hidden" name="paymentMethod" value="mercadopago" />
              <header><strong>Datos de entrega</strong><button type="button" data-close-checkout aria-label="Cerrar"><i data-lucide="x"></i></button></header>
              <div class="field"><label>Dirección</label><input name="address" required autocomplete="street-address" value="${escapeHtml(state.user?.exactLocation || "")}" placeholder="Calle, número y apartamento" /></div>
              <div class="two-col"><div class="field"><label>Ciudad</label><input name="city" required autocomplete="address-level2" placeholder="Ciudad o barrio" /></div><div class="field"><label>Teléfono</label><input name="phone" required type="tel" value="${escapeHtml(state.user?.phone || "")}" placeholder="Teléfono" /></div></div>
              <div class="field"><label>Entrega</label><select name="method"><option>Envío coordinado</option><option>Retiro en punto seguro</option><option>Entrega personal verificada</option></select></div>
              <input type="hidden" name="note" value="" />
              <label class="check-row"><input type="checkbox" name="purchaseConsent" required /><span>Revisaré el artículo antes de compartir el código de recepción.</span></label>
              <button class="buy-action" type="submit">Continuar en Mercado Pago</button>
            </form>
          `}
          ${!canBuy ? `<small class="commerce-disabled-note">El vendedor debe conectar Mercado Pago para recibir compras.</small>` : ""}
          <button class="secondary-btn commerce-add-cart" type="button" data-add-cart="${escapeHtml(item.id)}"><i data-lucide="shopping-cart"></i>Agregar al carrito</button>
          <button class="secondary-btn" id="messageSeller">Contactar al vendedor</button>
          <button class="commerce-report" id="reportListing"><i data-lucide="message-square-warning"></i>Reportar publicación</button>
        </aside>
      </section>
      <section class="seller-summary-v2"><span><b>${sellerHasRating(item.seller) ? `${Math.round(item.seller.rating * 20)}%` : "Nuevo"}</b><small>Reputación</small></span><span><b>${escapeHtml(item.postedAt)}</b><small>Publicación</small></span><span><b>${escapeHtml(item.location)}</b><small>Ubicación</small></span></section>
      <section class="similar-section product-similar"><header><h2>Publicaciones similares</h2><button data-view="feed">Ver todas<i data-lucide="arrow-right"></i></button></header><div class="grid">${similar.map(productCard).join("") || '<div class="empty">Sin publicaciones similares.</div>'}</div></section>
    </main>
  `;
};

const composeView = () => {
  if (isRejectedUser()) {
    return `
      ${sellerSidebar("listings")}
      <main>
        <div class="toolbar-row">
          <button type="button" class="filter-toggle" data-filter-toggle>
            ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        <section class="panel verification-gate rejected-gate">
          <p class="eyebrow">Atencion</p>
          <h1>Tu cuenta ha sido rechazada.</h1>
          <p class="muted">No cumples con los requisitos de seguridad de MarketPro. Por este motivo no puedes publicar ni vender artículos dentro de la app.</p>
          <button class="secondary-btn" data-view="profile">Ver estado de cuenta</button>
        </section>
      </main>
    `;
  }

  if (!isVerifiedSeller()) {
    return `
      ${sellerSidebar("listings")}
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
  ${sellerSidebar("listings")}
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
        <p class="muted form-intro">Completá la información de tu publicación paso a paso para llegar a más compradores.</p>
        <div class="form-section">
          <h2>Fotos</h2>
          <div class="field">
            <label>Sube hasta 6 imagenes</label>
            <input id="photoInput" name="photos" type="file" accept="image/*" multiple />
          </div>
          <div class="photo-grid" id="photoGrid">
            <div class="photo-slot"><b>1</b><i data-lucide="image-plus"></i><strong>Agregar fotos</strong><small>Sube hasta 6 imágenes de tu producto</small></div>
            <div class="photo-slot"><b>2</b><i data-lucide="list-checks"></i><strong>Detalle</strong><small>Completá la información de tu publicación</small></div>
            <div class="photo-slot"><b>3</b><i data-lucide="shield-check"></i><strong>Estado</strong><small>Revisá y publicá tu anuncio</small></div>
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
          <h2><i data-lucide="shield-check"></i><span>Protocolo de seguridad</span></h2>
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
        <h2 class="panel-title">Vista previa <i data-lucide="eye"></i></h2>
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

const composeStudioView = () => {
  if (!isVerifiedSeller()) return composeView();
  const steps = [
    ["Información", "Detalles principales", "file-text"],
    ["Fotos", "Hasta 6 imágenes", "images"],
    ["Detalles", "Descripción y estado", "list-checks"],
    ["Ubicación y envío", "Dónde y cómo entregas", "map-pin"],
    ["Precio y seguridad", "Revisión final", "shield-check"]
  ];
  return `
    ${sellerSidebar("listings")}
    <main class="listing-studio-page">
      <form id="listingForm" novalidate>
        <header class="listing-studio-header">
          <div><p class="eyebrow">Seller Center</p><h1>Nueva publicación</h1><span>Completá los datos para publicar tu artículo.</span></div>
          <div><button class="secondary-btn" type="button" data-save-draft>Guardar borrador</button><button class="sell-action" type="submit"><i data-lucide="rocket"></i>Publicar</button></div>
        </header>
        <section class="listing-studio-shell">
          <aside class="listing-stepper">
            ${steps.map((step, index) => `
              <button type="button" data-compose-step="${index + 1}" class="${state.composeStep === index + 1 ? "active" : ""}">
                <span>${index + 1}</span><i data-lucide="${step[2]}"></i><div><strong>${step[0]}</strong><small>${step[1]}</small></div>
              </button>
            `).join("")}
          </aside>
          <section class="listing-stage">
            <div class="listing-step-panel" data-step-panel="1" ${state.composeStep === 1 ? "" : "hidden"}>
              <header><span>01</span><div><h2>Información principal</h2><p>Identificá el artículo de forma clara.</p></div></header>
              <div class="field"><label for="listingTitle">Título del artículo</label><input id="listingTitle" name="title" required maxlength="72" autocomplete="off" placeholder="Ej: Mesa de comedor moderna" /></div>
              <div class="two-col">
                <div class="field"><label for="listingCategory">Categoría</label><select id="listingCategory" name="category">${categories.filter((c) => c !== "Todo").map((c) => `<option>${c}</option>`).join("")}</select></div>
                <div class="field"><label for="listingCondition">Condición</label><select id="listingCondition" name="condition"><option>Usado</option><option>Nuevo</option></select></div>
              </div>
            </div>
            <div class="listing-step-panel" data-step-panel="2" ${state.composeStep === 2 ? "" : "hidden"}>
              <header><span>02</span><div><h2>Fotografías reales</h2><p>Subí entre 2 y 6 fotos nítidas.</p></div></header>
              <label class="listing-upload" for="photoInput"><i data-lucide="cloud-upload"></i><strong>Elegir fotografías</strong><span>JPG o PNG · máximo 10 MB por imagen</span></label>
              <input id="photoInput" name="photos" type="file" accept="image/*" multiple />
              <div class="photo-grid" id="photoGrid">${[1,2,3,4,5,6].map((number) => `<div class="photo-slot"><b>${number}</b><i data-lucide="image"></i><small>${number === 1 ? "Foto principal" : "Otra vista"}</small></div>`).join("")}</div>
            </div>
            <div class="listing-step-panel" data-step-panel="3" ${state.composeStep === 3 ? "" : "hidden"}>
              <header><span>03</span><div><h2>Descripción y estado</h2><p>Contá exactamente qué recibe el comprador.</p></div></header>
              <div class="field"><label for="listingDescription">Descripción</label><textarea id="listingDescription" name="description" required minlength="80" maxlength="1000" placeholder="Describe el estado real, uso, medidas, fallas, accesorios y todo lo que incluye."></textarea><small>Una descripción precisa reduce preguntas y disputas.</small></div>
            </div>
            <div class="listing-step-panel" data-step-panel="4" ${state.composeStep === 4 ? "" : "hidden"}>
              <header><span>04</span><div><h2>Ubicación y entrega</h2><p>Indicá dónde está el producto.</p></div></header>
              <div class="field"><label for="listingLocation">Barrio o ciudad</label><input id="listingLocation" name="location" required autocomplete="address-level2" placeholder="Ej: Pocitos, Montevideo" /></div>
              <div class="delivery-options"><span><i data-lucide="map-pin-check"></i><strong>Punto seguro</strong><small>Para entregas personales.</small></span><span><i data-lucide="truck"></i><strong>Envío con rastreo</strong><small>Vinculado a la orden.</small></span></div>
            </div>
            <div class="listing-step-panel" data-step-panel="5" ${state.composeStep === 5 ? "" : "hidden"}>
              <header><span>05</span><div><h2>Precio y protocolo</h2><p>Revisá el valor y la seguridad.</p></div></header>
              <div class="field price-field"><label for="listingPrice">Precio en USD</label><div><span>US$</span><input id="listingPrice" name="price" required type="number" inputmode="decimal" min="1" placeholder="0" /></div></div>
              <div class="field"><label for="listingPaymentLink">Enlace de Mercado Pago para este artículo</label><input id="listingPaymentLink" name="paymentLink" type="url" inputmode="url" placeholder="https://mpago.la/..." ${state.user?.mercadoPago?.connected ? "" : "required"} /><small>Crea un enlace con el importe exacto de esta publicación. Quedará congelado con la orden.</small></div>
              <section class="protocol-box"><h3><i data-lucide="shield-check"></i>Protocolo de seguridad</h3>${safetyRules.map((rule, index) => `<label class="check-row"><input type="checkbox" name="safety-${index}" required /><span>${rule}</span></label>`).join("")}</section>
            </div>
            <footer class="listing-step-actions">
              <button class="secondary-btn" type="button" data-compose-prev ${state.composeStep === 1 ? "disabled" : ""}><i data-lucide="arrow-left"></i>Anterior</button>
              <span>Paso ${state.composeStep} de 5</span>
              <button class="sell-action" type="button" data-compose-next ${state.composeStep === 5 ? "hidden" : ""}>Continuar<i data-lucide="arrow-right"></i></button>
              <button class="sell-action" type="submit" data-compose-submit ${state.composeStep === 5 ? "" : "hidden"}><i data-lucide="rocket"></i>Publicar</button>
            </footer>
          </section>
          <aside class="listing-live-preview">
            <header><i data-lucide="eye"></i><strong>Vista previa</strong></header>
            <div class="preview-image-wrap" id="previewImage"><i data-lucide="image"></i><span>Tu foto principal</span></div>
            <div class="preview-copy"><strong id="previewPrice">US$ 0</strong><h3 id="previewTitle">Título del artículo</h3><span id="previewLocation">Ubicación</span><div><span class="pill" id="previewCategory">Categoría</span><span class="pill" id="previewCondition">Condición</span></div></div>
            <div class="preview-note"><i data-lucide="info"></i>La vista previa se actualiza mientras completás los datos.</div>
          </aside>
        </section>
      </form>
    </main>
  `;
};

const messagesView = () => {
  const active = state.conversations.find((chat) => chat.id === state.selectedChatId) || state.conversations[0];
  if (active && state.selectedChatId !== active.id) state.selectedChatId = active.id;
  const contactFor = (chat) => {
    const fallbackName = chat.buyerId === state.user?.id ? chat.seller : chat.buyer;
    const contact = chat.otherParticipant || {};
    const name = contact.name || fallbackName || "Usuario";
    return {
      name,
      avatar: contact.avatar || chat.avatar || `/api/avatar/${encodeURIComponent(name)}.svg`,
    };
  };
  return `
    <main class="messages-page ${state.mobileChatList ? "show-chat-list" : "show-active-chat"}">
      <section class="panel chat-shell">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-head">
          <span>Mensajes</span>
          <small>${state.conversations.length} conversaciones</small>
        </div>
        <div class="chat-list">
          ${state.conversations
            .map((chat) => {
              const contact = contactFor(chat);
              return `
              <button class="chat-row ${chat.id === state.selectedChatId ? "active" : ""}" data-chat="${chat.id}">
                <img src="${escapeHtml(contact.avatar)}" alt="${escapeHtml(contact.name)}" />
                <div class="chat-row-copy">
                  <strong>${escapeHtml(contact.name)}</strong>
                  <div class="muted">${escapeHtml(chat.productTitle)}</div>
                  <small>${escapeHtml(chat.messages?.at(-1)?.text || "Conversación protegida")}</small>
                </div>
                <time>${escapeHtml(chat.messages?.at(-1)?.time || "")}</time>
                ${chat.unreadCount ? `<b class="chat-unread" aria-label="${chat.unreadCount} mensajes sin leer">${chat.unreadCount}</b>` : ""}
              </button>`;
            })
            .join("")}
        </div>
      </aside>
      ${
        active
          ? (() => {
              const contact = contactFor(active);
              return `<section class="chat-main">
              <div class="chat-header">
                <button class="chat-back" type="button" data-chat-list aria-label="Volver a conversaciones"><i data-lucide="arrow-left"></i></button>
                <img src="${escapeHtml(contact.avatar)}" alt="${escapeHtml(contact.name)}" />
                <div>
                  <strong>${escapeHtml(contact.name)}</strong>
                  <div class="muted">${escapeHtml(active.productTitle)}</div>
                  <small class="chat-presence"><i></i><span data-chat-presence>${escapeHtml(state.chatTyping[active.id] ? `${state.chatTyping[active.id]} está escribiendo…` : "Conversación sincronizada")}</span></small>
                </div>
              </div>
              <div class="chat-warning">
                <i data-lucide="shield-check"></i>
                <span><strong>Conversación protegida</strong>No compartas claves, códigos ni coordines pagos externos.</span>
              </div>
              <div class="messages">
                ${active.messages
                  .map(
                    (msg) => `
                    <div class="bubble ${isMyMessage(msg) ? "me" : ""} ${msg.from === "system" ? "system" : ""}">
                      ${msg.senderName && msg.from !== "system" ? `<span>${escapeHtml(msg.senderName)}</span>` : ""}
                      ${msg.attachment ? `<button type="button" class="chat-photo" data-chat-photo><img src="${escapeHtml(msg.attachment)}" alt="Foto compartida en el chat" /></button>` : ""}
                      ${msg.text ? `<p>${escapeHtml(msg.text)}</p>` : ""}
                      ${msg.risk?.level && msg.risk.level !== "Bajo" ? `<small class="risk-note">Alerta ${escapeHtml(msg.risk.level)}: ${escapeHtml(msg.risk.flags.join(", "))}</small>` : ""}
                      ${msg.time ? `<time>${escapeHtml(msg.time)}${isMyMessage(msg) ? ` · ${msg.readAt ? "Leído" : "Enviado"}` : ""}</time>` : ""}
                    </div>`
                  )
            .join("")}
              </div>
              <details class="chat-tools">
                <summary aria-label="Más opciones de conversación"><i data-lucide="ellipsis-vertical"></i></summary>
                <div>
                  <button class="secondary-btn" id="reportChat">Reportar conversación</button>
                  <button class="danger-btn" id="blockChat">${active.blocked ? "Chat bloqueado" : "Bloquear chat"}</button>
                </div>
              </details>
              ${pendingChatAttachment ? `<div class="chat-attachment-preview"><img src="${pendingChatAttachment}" alt="Foto lista para enviar" /><span>Foto lista</span><button type="button" id="removeChatPhoto" aria-label="Quitar foto">×</button></div>` : ""}
              <form class="message-form" id="messageForm">
                <label class="attach-btn ${pendingChatAttachment ? "ready" : ""}" title="Añadir foto">
                  <input id="chatPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" ${active.blocked ? "disabled" : ""} />
                  <i data-lucide="paperclip"></i>
                </label>
                <input name="message" autocomplete="off" enterkeyhint="send" placeholder="${active.blocked ? "Chat bloqueado por seguridad" : "Escribe un mensaje"}" ${active.blocked ? "disabled" : ""} />
                <button class="send-btn" title="Enviar" aria-label="Enviar mensaje" ${active.blocked ? "disabled" : ""}><i data-lucide="send"></i></button>
              </form>
            </section>`;
            })()
          : `<div class="empty">Todavía no tienes chats reales. Abre una publicación y contacta al vendedor para iniciar una conversación conectada.</div>`
      }
      </section>
    </main>
  `;
};

const profileView = () => {
  if (!state.user) {
    return `
      ${sellerSidebar("summary")}
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
              <input name="password" required type="password" minlength="10" autocomplete="current-password" placeholder="10 caracteres, mayúscula, minúscula y número" />
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
      ${sellerSidebar("summary")}
      <main>
        <div class="toolbar-row">
          <button type="button" class="filter-toggle" data-filter-toggle>
            ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        <section class="panel verification-gate rejected-gate">
          <p class="eyebrow">Atencion</p>
          <h1>Tu cuenta ha sido rechazada.</h1>
          <p class="muted">No cumples con los requisitos de seguridad de MarketPro. La publicación y venta de artículos queda bloqueada.</p>
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
      ${sellerSidebar("summary")}
      <main>
        <div class="toolbar-row">
          <button type="button" class="filter-toggle" data-filter-toggle>
            ${state.filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        <section class="panel verification-gate">
          <p class="eyebrow">${state.user.emailVerified ? "Verificación pendiente" : "Confirma tu correo"}</p>
          <h1>${state.user.emailVerified ? "Tu cuenta está esperando revisión del administrador." : "Verifica que este correo te pertenece."}</h1>
          <p class="muted">${state.user.emailVerified
            ? "Tus documentos están guardados de forma privada. Cuando el administrador corrobore identidad, teléfono y ubicación, podrás publicar."
            : `Enviamos un código de seis números a ${escapeHtml(state.user.email)}. MarketPro nunca te pedirá ese código por chat.`}</p>
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
          ${state.user.emailVerified ? "" : `
            <form id="emailVerificationForm" class="email-verification-form">
              <label for="emailVerificationCode">Código de verificación</label>
              <div>
                <input id="emailVerificationCode" name="code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" />
                <button class="sell-action" type="submit">Verificar correo</button>
              </div>
              <button class="tertiary-btn" id="resendEmailCode" type="button">Enviar un código nuevo</button>
            </form>
          `}
          <button class="secondary-btn logout-btn" id="logoutUser">Cerrar sesion</button>
          <button class="danger-btn account-delete-btn" id="deleteAccount">Eliminar cuenta</button>
        </section>
      </main>
    `;
  }

  const dashboard = state.sellerDashboard;
  const stats = dashboard?.stats || { active: 0, sold: 0, balance: 0, pendingBalance: 0, grossSales: 0, securityScore: 98 };
  const mine = state.products.filter((item) => item.seller?.email === state.user.email || item.seller?.name === state.user.name);
  const paymentLinksReady = mine.some((item) => Boolean(item.mercadoPagoPaymentLink)) || Boolean(state.user.mercadoPago?.connected);
  const visible = mine.filter((item) => (state.profileTab === "sold" ? item.status === "sold" : item.status !== "sold"));
  return `
    ${sellerSidebar("summary")}
    <main class="seller-dashboard-v2">
      <header class="dashboard-welcome">
        <div>
          <h1>Hola, ${escapeHtml(state.user.name.split(" ")[0])} <i data-lucide="sparkles"></i></h1>
          <p>Bienvenido a tu panel de control</p>
        </div>
        <button class="dashboard-account" type="button" data-account-menu><span>${escapeHtml(state.user.name[0])}</span><i data-lucide="chevron-down"></i></button>
      </header>

      <section class="dashboard-metrics">
        <article class="dashboard-metric mp-status">
          <span>Mercado Pago</span>
          <strong>${paymentLinksReady ? "Cobros activos" : "Pendiente de activar"}</strong>
          <small>Recibe pagos directamente en tu cuenta.</small>
          <button type="button" data-scroll-payment-link>${paymentLinksReady ? "Ver cobros" : "Activar"}</button>
        </article>
        <article class="dashboard-metric">
          <span>Ventas registradas</span>
          <strong>${money(stats.grossSales || 0)}</strong>
          <small>Total acumulado</small>
          <button type="button" data-view="orders">Ver ventas <i data-lucide="arrow-right"></i></button>
        </article>
        <article class="dashboard-metric">
          <span>Publicaciones activas</span>
          <strong>${stats.active}</strong>
          <small>Publicaciones visibles</small>
          <button type="button" data-dashboard-listings>Ver publicaciones <i data-lucide="arrow-right"></i></button>
        </article>
        <article class="dashboard-metric">
          <span>Vendidos</span>
          <strong>${stats.sold}</strong>
          <small>Total de artículos</small>
          <button type="button" data-view="orders">Ver órdenes <i data-lucide="arrow-right"></i></button>
        </article>
      </section>

      <section class="dashboard-mp-connect ${paymentLinksReady ? "connected" : ""}" id="mercadoPagoSetup">
        <i data-lucide="badge-check"></i>
        <div>
          <strong>${state.user.mercadoPago?.connected ? "Mercado Pago conectado" : state.user.mercadoPago?.paymentLinkConfigured ? "Cobros por enlace activados" : "Activa cobros con Mercado Pago"}</strong>
          <span>El comprador paga directamente en tu cuenta. Al publicar, agrega un enlace de Mercado Pago con el importe exacto del artículo.</span>
        </div>
          ${state.user.mercadoPago?.connected
          ? `<button class="secondary-btn" type="button" id="disconnectMercadoPago">Desconectar</button>`
          : `<div class="mercadopago-link-form"><label>Enlace por publicación</label><small>Crea un enlace oficial de Mercado Pago con el importe exacto de cada artículo. Lo agregarás al publicar y quedará congelado en la orden.</small><button class="buy-action" type="button" data-view="compose">Nueva publicación</button></div>`}
      </section>

      <section class="dashboard-activity">
        <header><h2>Actividad reciente</h2><button type="button" data-view="orders">Ver todo</button></header>
        ${state.orders.length || mine.length ? `
          <div class="activity-list">
            ${state.orders.slice(0, 2).map((order) => `<button data-open-order="${escapeHtml(order.id)}"><i data-lucide="package-check"></i><span><strong>${escapeHtml(order.productTitle)}</strong><small>${escapeHtml(order.status)}</small></span><time>${money(order.amount)}</time></button>`).join("")}
            ${mine.slice(0, 2).map((item) => `<button data-product="${item.id}"><i data-lucide="notebook-tabs"></i><span><strong>${escapeHtml(item.title)}</strong><small>${item.status === "sold" ? "Vendido" : "Publicación activa"}</small></span><time>${money(item.price)}</time></button>`).join("")}
          </div>
        ` : `<div class="dashboard-empty"><i data-lucide="inbox"></i><strong>Aún no tienes actividad reciente</strong><span>Tus ventas, mensajes y órdenes aparecerán aquí.</span></div>`}
      </section>

      <section class="dashboard-listings" data-dashboard-listings-section>
        <header>
          <div><h2>Tus publicaciones</h2><span>${mine.length} artículos</span></div>
          <div>
            <button class="profile-tab ${state.profileTab === "active" ? "active" : ""}" data-profile-tab="active">Activos</button>
            <button class="profile-tab ${state.profileTab === "sold" ? "active" : ""}" data-profile-tab="sold">Vendidos</button>
            <button class="sell-action" data-view="compose"><i data-lucide="plus"></i>Nueva publicación</button>
          </div>
        </header>
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
            : `<div class="empty">No hay publicaciones en esta sección.</div>`
        }
        </section>
      </section>
      <footer class="dashboard-account-actions">
        <button class="secondary-btn logout-btn" id="logoutUser">Cerrar sesión</button>
        <button class="secondary-btn" id="logoutAllSessions">Cerrar todas las sesiones</button>
        <button class="danger-btn" id="deleteAccount">Eliminar cuenta</button>
      </footer>
    </main>
  `;
};

const notificationsView = () => `
  <main class="content full-content">
    <section class="panel notifications-panel">
      <div class="section-heading">
        <div><p class="eyebrow">Actividad</p><h1>Alertas</h1></div>
        <span class="muted">${state.notifications.filter((item) => !item.read).length} sin leer</span>
      </div>
      <div class="notification-list">
        ${state.notifications.length ? state.notifications.map((item) => `
          <button class="notification-item ${item.read ? "read" : "unread"}" data-notification="${item.id}" data-notification-link="${escapeHtml(item.link || "")}">
            <span class="notification-dot"></span>
            <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message)}</small><time>${escapeHtml(new Date(item.createdAt).toLocaleString("es-UY"))}</time></span>
          </button>
        `).join("") : `<div class="empty">No tienes alertas nuevas.</div>`}
      </div>
    </section>
  </main>
`;

const view = () =>
  ({
    feed: feedView,
    categories: categoriesView,
    cart: cartView,
    detail: detailStudioView,
    compose: composeStudioView,
    messages: messagesView,
    profile: profileView,
    orders: ordersView,
    notifications: notificationsView,
    orderDetail: orderDetailView,
    security: securityView,
    support: supportView,
    legal: legalView
  })[state.view]();

const render = () => {
  destroyMotion();
  const animateRoute = state.viewKey !== lastAnimatedViewKey;
  lastAnimatedViewKey = state.viewKey;
  const publicView = ["security", "support", "legal"].includes(state.view);
  if (!hasCompleteAccess() && !publicView) {
    app.innerHTML = `<div class="app-shell">${entryGate()}${assistantWidget()}</div>`;
    window.lucide?.createIcons({ attrs: { "stroke-width": 1.7 } });
    bindEvents();
    initMotion(animateRoute);
    return;
  }
  app.innerHTML = `
    <div class="app-shell view-${state.view}">
      ${topbar()}
      ${["feed", "detail"].includes(state.view) ? pwaInstallCard() : ""}
      <div class="main-layout view-surface ${state.filtersOpen ? "" : "filters-collapsed"} ${state.view === "messages" ? "focus-layout" : ""}" data-view-key="${state.viewKey}">${view()}</div>
      ${appFooter()}
      ${assistantWidget()}
    </div>
  `;
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.7 } });
  bindEvents();
  initMotion(animateRoute);
};

const bindEvents = () => {
  bindAssistantEvents();
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.view === "messages") state.mobileChatList = true;
      navigate(button.dataset.view);
    });
  });

  document.querySelectorAll("[data-notification]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.notification;
      await api(`/api/notifications/${id}/read`, { method: "POST", body: "{}" });
      state.notifications = state.notifications.map((item) => item.id === id ? { ...item, read: true } : item);
      const page = new URL(button.dataset.notificationLink || location.href, location.origin).searchParams.get("page");
      if (page) navigate(page); else render();
    });
  });

  document.querySelectorAll("[data-filter-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filtersOpen = !state.filtersOpen;
      localStorage.setItem("marketFiltersOpen", JSON.stringify(state.filtersOpen));
      render();
    });
  });

  document.querySelector("[data-scroll-products]")?.addEventListener("click", () => {
    document.querySelector(".content-head")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelector("[data-install-dismiss]")?.addEventListener("click", () => {
    state.installBannerDismissed = true;
    sessionStorage.setItem("marketInstallBannerDismissed", "true");
    render();
  });

  const globalSearch = document.querySelector("#globalSearch");
  const applySearch = () => {
    if (!globalSearch) return;
    state.query = globalSearch.value;
    if (state.query.trim()) state.filters.category = "Todo";
    if (state.view !== "feed") {
      state.view = "feed";
      state.viewKey += 1;
    }
    render();
    requestAnimationFrame(() => {
      const nextSearch = document.querySelector("#globalSearch");
      if (!nextSearch) return;
      nextSearch.focus({ preventScroll: true });
      nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
    });
  };
  globalSearch?.addEventListener("input", () => {
    state.query = globalSearch.value;
    window.clearTimeout(searchRenderTimer);
    searchRenderTimer = window.setTimeout(applySearch, 220);
  });
  globalSearch?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    window.clearTimeout(searchRenderTimer);
    applySearch();
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

  document.querySelectorAll("#clearFilters, [data-clear-filters]").forEach((button) => button.addEventListener("click", () => {
    state.query = "";
    state.filters = { category: "Todo", minPrice: "", maxPrice: "", distance: "50", condition: "Todas" };
    render();
  }));

  document.querySelectorAll("[data-product]").forEach((button) => {
    button.addEventListener("click", () => navigate("detail", { selectedProductId: button.dataset.product, galleryIndex: 0 }));
  });

  document.querySelectorAll("[data-thumb]").forEach((button) => {
    button.addEventListener("click", () => {
      state.galleryIndex = Number(button.dataset.thumb);
      render();
    });
  });

  document.querySelectorAll("[data-add-cart]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.addCart));
  });
  document.querySelectorAll("[data-cart-inc]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = state.cart.find((item) => item.id === button.dataset.cartInc);
      if (row) setCartQty(row.id, row.qty + 1);
    });
  });
  document.querySelectorAll("[data-cart-dec]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = state.cart.find((item) => item.id === button.dataset.cartDec);
      if (row) setCartQty(row.id, row.qty - 1);
    });
  });
  document.querySelectorAll("[data-cart-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFromCart(button.dataset.cartRemove));
  });
  document.querySelector("[data-cart-checkout]")?.addEventListener("click", () => {
    const first = state.cart[0];
    if (!first) return;
    showToast("Completa cada artículo por separado para conservar la protección de la compra.");
    navigate("detail", { selectedProductId: first.id, galleryIndex: 0 });
  });

  document.querySelector("#messageSeller")?.addEventListener("click", startConversation);
  document.querySelector("[data-open-checkout]")?.addEventListener("click", () => {
    const checkout = document.querySelector(".commerce-checkout");
    if (!checkout) return;
    checkout.hidden = false;
    checkout.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.querySelector("[data-close-checkout]")?.addEventListener("click", () => {
    const checkout = document.querySelector(".commerce-checkout");
    if (checkout) checkout.hidden = true;
  });
  document.querySelector("#checkoutForm")?.addEventListener("submit", secureCheckout);
  document.querySelector("#deliveryConfirmForm")?.addEventListener("submit", confirmDelivery);
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
  document.querySelector("[data-recovery-toggle]")?.addEventListener("click", () => {
    const recovery = document.querySelector(".entry-recovery");
    if (recovery) recovery.hidden = !recovery.hidden;
  });
  document.querySelector("[data-dashboard-listings]")?.addEventListener("click", () => {
    document.querySelector("[data-dashboard-listings-section]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("[data-account-menu]")?.addEventListener("click", () => {
    document.querySelector(".dashboard-account-actions")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.querySelector("#adminEntryForm")?.addEventListener("submit", authenticateAdminEntry);
  document.querySelector("#logoutUser")?.addEventListener("click", logoutUser);
  document.querySelector("#logoutAllSessions")?.addEventListener("click", logoutAllSessions);
  document.querySelector("#emailVerificationForm")?.addEventListener("submit", verifyEmailCode);
  document.querySelector("#resendEmailCode")?.addEventListener("click", resendEmailCode);
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
  const showComposeStep = (nextStep) => {
    state.composeStep = Math.max(1, Math.min(5, Number(nextStep) || 1));
    document.querySelectorAll("[data-step-panel]").forEach((panel) => {
      panel.hidden = Number(panel.dataset.stepPanel) !== state.composeStep;
    });
    document.querySelectorAll("[data-compose-step]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.composeStep) === state.composeStep);
    });
    const previous = document.querySelector("[data-compose-prev]");
    const next = document.querySelector("[data-compose-next]");
    const submit = document.querySelector("[data-compose-submit]");
    if (previous) previous.disabled = state.composeStep === 1;
    if (next) next.hidden = state.composeStep === 5;
    if (submit) submit.hidden = state.composeStep !== 5;
    const counter = document.querySelector(".listing-step-actions > span");
    if (counter) counter.textContent = `Paso ${state.composeStep} de 5`;
    document.querySelector(".listing-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  document.querySelectorAll("[data-compose-step]").forEach((button) => button.addEventListener("click", () => showComposeStep(button.dataset.composeStep)));
  document.querySelector("[data-compose-prev]")?.addEventListener("click", () => showComposeStep(state.composeStep - 1));
  document.querySelector("[data-compose-next]")?.addEventListener("click", () => showComposeStep(state.composeStep + 1));
  document.querySelector("[data-save-draft]")?.addEventListener("click", () => {
    const form = document.querySelector("#listingForm");
    if (!form) return;
    const draft = Object.fromEntries([...new FormData(form)].filter(([, value]) => typeof value === "string"));
    localStorage.setItem("marketListingDraft", JSON.stringify(draft));
    showToast("Borrador guardado en este dispositivo.");
  });
  document.querySelector("#promotionForm")?.addEventListener("submit", promoteFromForm);
  document.querySelector("#connectMercadoPago")?.addEventListener("click", connectMercadoPago);
  document.querySelector("#disconnectMercadoPago")?.addEventListener("click", disconnectMercadoPago);
  document.querySelector("#mercadoPagoLinkForm")?.addEventListener("submit", saveMercadoPagoPaymentLink);
  document.querySelector("#removeMercadoPagoLink")?.addEventListener("click", removeMercadoPagoPaymentLink);
  document.querySelector("[data-scroll-payment-link]")?.addEventListener("click", () => {
    document.querySelector("#mercadoPagoSetup")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.querySelector("#sellerPaymentConfirmForm")?.addEventListener("submit", confirmSellerPaymentLink);
  document.querySelector("#photoInput")?.addEventListener("change", previewPhotos);
  document.querySelector("#authForm")?.addEventListener("submit", authenticate);

  document.querySelectorAll("[data-chat]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.mobileChatList = false;
      await api(`/api/conversations/${button.dataset.chat}/read`, { method: "POST", body: "{}" });
      state.conversations = state.conversations.map((chat) => chat.id === button.dataset.chat ? { ...chat, unreadCount: 0 } : chat);
      navigate("messages", { selectedChatId: button.dataset.chat });
    });
  });
  document.querySelector("[data-chat-list]")?.addEventListener("click", () => {
    state.mobileChatList = true;
    render();
  });

  document.querySelector("#messageForm")?.addEventListener("submit", sendMessage);
  const chatMessageInput = document.querySelector("#messageForm input[name='message']");
  let typingTimer = null;
  chatMessageInput?.addEventListener("input", () => {
    if (state.socket?.readyState !== WebSocket.OPEN || !state.selectedChatId) return;
    state.socket.send(JSON.stringify({ type: "typing", chatId: state.selectedChatId, active: true }));
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => {
      state.socket?.send(JSON.stringify({ type: "typing", chatId: state.selectedChatId, active: false }));
    }, 1200);
  });
  document.querySelector("#chatPhotoInput")?.addEventListener("change", prepareChatPhoto);
  document.querySelector("#removeChatPhoto")?.addEventListener("click", () => {
    pendingChatAttachment = "";
    render();
  });
  document.querySelectorAll("[data-chat-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = button.querySelector("img")?.src;
      if (source) window.open(source, "_blank", "noopener,noreferrer");
    });
  });
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

  document.querySelectorAll("[data-order-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.orderTab = button.dataset.orderTab;
      render();
    });
  });

  document.querySelectorAll("[data-open-order]").forEach((button) => {
    button.addEventListener("click", () => {
      const order = state.orders.find((item) => item.id === button.dataset.openOrder);
      if (!order) return;
      state.checkoutOrder = order;
      navigate("orderDetail", { selectedOrderId: order.id });
    });
  });

  document.querySelectorAll("[data-order-chat]").forEach((button) => {
    button.addEventListener("click", () => startOrderConversation(button.dataset.orderChat));
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

const previewPhotos = async (event) => {
  const files = [...event.target.files]
    .filter((file) => file.type?.startsWith("image/"))
    .slice(0, 6);
  const grid = document.querySelector("#photoGrid");
  const preview = document.querySelector("#previewImage");
  if (!grid || !preview) return;

  if (!files.length) {
    grid.innerHTML = `
      <div class="photo-slot"><b>1</b><i data-lucide="image-plus"></i><strong>Agregar fotos</strong><small>Sube hasta 6 imágenes de tu producto</small></div>
      <div class="photo-slot"><b>2</b><i data-lucide="list-checks"></i><strong>Detalle</strong><small>Completá la información de tu publicación</small></div>
      <div class="photo-slot"><b>3</b><i data-lucide="shield-check"></i><strong>Estado</strong><small>Revisá y publicá tu anuncio</small></div>
    `;
    preview.innerHTML = "";
    window.lucide?.createIcons({ attrs: { "stroke-width": 1.7 } });
    return;
  }

  grid.innerHTML = `<div class="photo-loading"><i data-lucide="loader-circle"></i><span>Preparando imágenes…</span></div>`;
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.7 } });
  const images = (await Promise.all(files.map((file) => compressImage(file, 1100, 0.72)))).filter(Boolean);
  grid.innerHTML = "";
  images.forEach((source, index) => {
    grid.insertAdjacentHTML(
      "beforeend",
      `<div class="photo-slot image-slot"><b>${index + 1}</b><img class="preview-image" src="${source}" alt="Foto ${index + 1}" /></div>`
    );
  });
  if (images[0]) preview.innerHTML = `<img class="preview-image" src="${images[0]}" alt="Vista previa del artículo" />`;
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
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe incluir mayúscula, minúscula y número.";
  }
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
    return "Para artículos de valor agrega un identificador verificable: factura, serie, IMEI, chasis, matrícula, modelo o medidas.";
  }
  const textRisk = analyzeMessageRisk(`${requiredValue(data, "title")} ${requiredValue(data, "description")} ${requiredValue(data, "location")}`);
  if (textRisk.level === "Alto") return `La publicacion contiene senales de riesgo: ${textRisk.flags.join(", ")}. Ajusta el texto para mantener la operacion dentro de MarketPro.`;
  return "";
};

const useDeviceLocation = () => {
  const input = document.querySelector("#exactLocationInput");
  if (!input) return;
  if (!navigator.geolocation) {
    showToast("Este dispositivo no permite tomar ubicación automática. Escribe tu dirección exacta.", "danger");
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
      showToast("No se pudo obtener la ubicación. Escribe calle, número y ciudad.", "danger");
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
    showToast(validationError, "danger");
    return;
  }
  const images = await collectPhotos(form.photos);
  if ((form.photos?.files || []).length < 2) {
    showToast("Sube al menos 2 fotos reales del artículo para reducir disputas.", "danger");
    return;
  }
  const created = await api("/api/products", {
    method: "POST",
    body: JSON.stringify({
      title: requiredValue(data, "title"),
      price: Number(data.get("price")),
      paymentLink: data.get("paymentLink"),
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
        verificationStatus: state.user.verificationStatus,
        mercadoPagoConnected: Boolean(state.user.mercadoPago?.connected)
      },
      verified: true,
      safeMeetup: true,
      safetyAccepted: true
    })
  });
  if (created.error) {
    showToast(created.error, "danger");
    navigate("profile");
    return;
  }
  const product = normalizeProduct(created);
  state.products = state.products.some((item) => item.id === product.id)
    ? state.products.map((item) => item.id === product.id ? product : item)
    : [product, ...state.products];
  if (created.duplicatePrevented) {
    showToast("La publicación ya existía. Evitamos crear una copia duplicada.");
  }
  await refreshSellerDashboard();
  navigate("detail", { selectedProductId: product.id, galleryIndex: 0 });
};

const syncOrder = (order) => {
  if (!order || order.error) return order;
  state.checkoutOrder = order;
  state.selectedOrderId = order.id;
  const exists = state.orders.some((item) => item.id === order.id);
  state.orders = exists ? state.orders.map((item) => (item.id === order.id ? order : item)) : [order, ...state.orders];
  return order;
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
  state.mobileChatList = false;
  navigate("messages", { selectedChatId: chat.id });
};

const startOrderConversation = async (orderId) => {
  const order = state.orders.find((item) => item.id === orderId) || state.checkoutOrder;
  if (!order) return;
  const chat = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      orderId: order.id,
      productId: order.productId,
      productTitle: `Orden ${order.id} - ${order.productTitle}`,
      sellerName: order.seller?.name,
      sellerEmail: order.seller?.email || "",
      sellerAvatar: order.seller?.avatar || "/mp-logo.svg",
      buyer: order.buyer || currentIdentity()
    })
  });
  if (chat.error) {
    showToast(chat.error, "danger");
    return;
  }
  const exists = state.conversations.some((conversation) => conversation.id === chat.id);
  state.conversations = exists ? state.conversations.map((item) => (item.id === chat.id ? chat : item)) : [chat, ...state.conversations];
  state.orders = state.orders.map((item) => (item.id === order.id ? { ...item, chatId: chat.id } : item));
  state.mobileChatList = false;
  navigate("messages", { selectedChatId: chat.id });
};

const reportListing = async () => {
  const item = selectedProduct();
  const reason = await promptAction(
    "Describe brevemente por qué esta publicación necesita revisión.",
    "Posible estafa o información incorrecta",
    "Reportar publicación"
  );
  if (!reason) return;
  const result = await api(`/api/products/${item.id}/report`, {
    method: "POST",
    body: JSON.stringify({ reason, details: reason })
  });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  state.products = state.products.map((product) => (product.id === item.id ? normalizeProduct(result.product) : product));
  showToast("Gracias. Revisaremos esta publicación.", "success");
  render();
};

const activeChat = () => state.conversations.find((chat) => chat.id === state.selectedChatId) || state.conversations[0];

const reportActiveChat = async () => {
  const chat = activeChat();
  if (!chat) return;
  const reason = await promptAction(
    "Describe el mensaje o comportamiento que debemos revisar.",
    "Mensaje sospechoso o intento de pago fuera de MarketPro",
    "Reportar conversación"
  );
  if (!reason) return;
  const result = await api(`/api/conversations/${chat.id}/report`, {
    method: "POST",
    body: JSON.stringify({ reason, details: reason })
  });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  showToast("Chat reportado. El administrador podrá revisar la evidencia.", "success");
};

const blockActiveChat = async () => {
  const chat = activeChat();
  if (!chat || chat.blocked) return;
  if (!await confirmAction(
    "No se podrán enviar más mensajes y la conversación quedará marcada para revisión.",
    "Bloquear conversación"
  )) return;
  const result = await api(`/api/conversations/${chat.id}/block`, {
    method: "POST",
    body: JSON.stringify({ reason: "Bloqueo solicitado por usuario" })
  });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  state.conversations = state.conversations.map((item) => (item.id === chat.id ? { ...item, blocked: true } : item));
  showToast("Chat bloqueado y enviado a revisión.", "success");
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
    showToast(result.error, "danger");
    return;
  }
  showToast(`Soporte recibido. Ticket ${result.id}`, "success");
  event.currentTarget.reset();
};

const connectMercadoPago = async () => {
  const result = await api("/api/payments/mercadopago/oauth/start", { method: "POST", body: "{}" });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  window.location.assign(result.url);
};

const disconnectMercadoPago = async () => {
  if (!await confirmAction(
    "Las nuevas compras quedarán deshabilitadas hasta que vuelvas a conectar tu cuenta.",
    "Desconectar Mercado Pago"
  )) return;
  const result = await api("/api/payments/mercadopago/oauth/connection", { method: "DELETE" });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  state.user = { ...state.user, mercadoPago: result.mercadoPago };
  render();
};

const saveMercadoPagoPaymentLink = async (event) => {
  event.preventDefault();
  const paymentLink = new FormData(event.currentTarget).get("paymentLink");
  const result = await api("/api/payments/mercadopago/payment-link", {
    method: "PUT",
    body: JSON.stringify({ paymentLink })
  });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  state.user = { ...state.user, mercadoPago: result.mercadoPago };
  state.products = (await api("/api/products")).map(normalizeProduct);
  showToast("Cobros por enlace de Mercado Pago activados.", "success");
  render();
};

const removeMercadoPagoPaymentLink = async () => {
  if (!await confirmAction("Tus publicaciones ya no podrán recibir nuevas compras hasta que agregues otro enlace.", "Quitar enlace de Mercado Pago")) return;
  const result = await api("/api/payments/mercadopago/payment-link", { method: "DELETE", body: "{}" });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  state.user = { ...state.user, mercadoPago: result.mercadoPago };
  state.products = (await api("/api/products")).map(normalizeProduct);
  render();
};

const confirmSellerPaymentLink = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const order = await api(`/api/orders/${state.checkoutOrder.id}/confirm-payment-link`, {
    method: "POST",
    body: JSON.stringify({
      paymentId: data.get("paymentId"),
      confirmedInMercadoPago: data.get("confirmedInMercadoPago") === "on"
    })
  });
  if (order.error) {
    showToast(order.error, "danger");
    return;
  }
  syncOrder(order);
  showToast("Pago registrado. Ahora carga la evidencia antes de despachar.", "success");
  render();
};

const secureCheckout = async (event) => {
  event.preventDefault();
  const item = selectedProduct();
  const buyer = currentIdentity();
  const data = new FormData(event.currentTarget);
  const purchaseConsent = data.get("purchaseConsent") === "on";
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
      acceptedRules: purchaseConsent,
      declaredInspection: purchaseConsent
    })
  });
  if (order.error) {
    showToast(`${order.error}${order.details ? " Revisa las credenciales o la cuenta de Mercado Pago." : ""}`, "danger");
    return;
  }
  syncOrder(order);
  if (order.mercadoPago?.checkoutUrl) {
    window.open(order.mercadoPago.checkoutUrl, "_blank", "noopener");
    showToast("Abrimos Mercado Pago para completar el pago. Vuelve a esta orden después.", "success");
  }
  navigate("orderDetail", { selectedOrderId: order.id });
};

const confirmDelivery = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const purchaseVerified = data.get("purchaseVerified") === "on";
  const code = data.get("code");
  const order = await api(`/api/orders/${state.checkoutOrder.id}/confirm-delivery`, {
    method: "POST",
    body: JSON.stringify({
      code,
      conditionNote: data.get("conditionNote"),
      checklist: {
        identityMatched: purchaseVerified,
        packageIntact: purchaseVerified,
        itemMatches: purchaseVerified,
        accessoriesMatch: purchaseVerified,
        conditionAccepted: purchaseVerified
      }
    })
  });
  if (order.error) {
    showToast(order.error, "danger");
    return;
  }
  syncOrder(order);
  showToast("Entrega confirmada. La operación quedó completada en MarketPro.", "success");
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
    showToast(order.error, "danger");
    return;
  }
  syncOrder(order);
  state.products = (await api("/api/products")).map(normalizeProduct);
  await refreshSellerDashboard();
  showToast("Gracias por calificar al vendedor.", "success");
  render();
};

const promoteProduct = async (productId) => {
  const result = await api("/api/promotions", {
    method: "POST",
    body: JSON.stringify({ productId, buyer: currentIdentity() })
  });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  if (result.checkoutUrl) {
    window.open(result.checkoutUrl, "_blank", "noopener");
    showToast("Abrimos Mercado Pago. Al confirmarse el pago, el producto quedará destacado.", "success");
  } else {
    showToast("Solicitud de anuncio creada.", "success");
  }
};

const promoteFromForm = async (event) => {
  event.preventDefault();
  const productId = new FormData(event.currentTarget).get("productId");
  if (!productId) {
    showToast("Elige una publicación para destacar.", "danger");
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
    showToast(order.error, "danger");
    return;
  }
  syncOrder(order);
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
    showToast(order.error, "danger");
    return;
  }
  syncOrder(order);
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
    showToast(order.error, "danger");
    return;
  }
  syncOrder(order);
  render();
};

const prepareChatPhoto = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    recordAssistantIssue("Selecciona una imagen JPG, PNG o WebP.", { path: "messages", status: 400 });
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    recordAssistantIssue("La foto supera 12 MB. Elige una imagen más liviana.", { path: "messages", status: 413 });
    return;
  }
  let compressed = await compressImage(file, 960, 0.68);
  if (compressed.length > 1350000) compressed = await compressImage(file, 720, 0.58);
  if (!compressed || compressed.length > 1400000) {
    recordAssistantIssue("No pudimos preparar esa foto. Prueba con otra imagen.", { path: "messages", status: 413 });
    return;
  }
  pendingChatAttachment = compressed;
  render();
  requestAnimationFrame(() => {
    const messages = document.querySelector(".messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
};

const sendMessage = async (event) => {
  event.preventDefault();
  const chat = activeChat();
  if (chat?.blocked) {
    showToast("Este chat está bloqueado por seguridad.", "danger");
    return;
  }
  const input = event.currentTarget.message;
  const text = input.value.trim();
  if (!text && !pendingChatAttachment) return;
  const risk = analyzeMessageRisk(text);
  if (risk.level === "Alto") {
    const proceed = await confirmAction(
      `MP Shield detectó posible ${risk.flags.join(", ")}. No compartas códigos, pagos externos ni datos bancarios.`,
      "Mensaje de riesgo"
    );
    if (!proceed) return;
  }
  const result = await api(`/api/conversations/${state.selectedChatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text, attachment: pendingChatAttachment })
  });
  if (result.error) return;
  const additions = [result.message, result.systemMessage].filter(Boolean);
  state.conversations = state.conversations.map((chat) =>
    chat.id === state.selectedChatId
      ? {
          ...chat,
          messages: [
            ...chat.messages,
            ...additions.filter((message) => !chat.messages.some((saved) => saved.id === message.id))
          ]
        }
      : chat
  );
  input.value = "";
  pendingChatAttachment = "";
  render();
  requestAnimationFrame(() => {
    const messages = document.querySelector(".messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
};

const authenticate = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const validationError = validateAccountForm(data);
  if (validationError) {
    showToast(validationError, "danger");
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
    showToast(result.fields?.length ? `${result.error}: ${result.fields.join(", ")}` : result.error, "danger");
    return;
  }
  state.user = result;
  state.authenticated = true;
  state.authToken = "";
  localStorage.removeItem("marketAuthToken");
  localStorage.removeItem("marketUser");
  await refreshLiveData();
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
    showToast(result.error, "danger");
    return;
  }
  state.user = result;
  state.authenticated = true;
  state.authToken = "";
  localStorage.removeItem("marketAuthToken");
  localStorage.removeItem("marketUser");
  await refreshLiveData();
  await refreshSellerDashboard();
  render();
  scrollToTop();
};

const verifyEmailCode = async (event) => {
  event.preventDefault();
  const code = requiredValue(new FormData(event.currentTarget), "code");
  const result = await api("/api/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ code })
  });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  state.user = result.user;
  showToast("Correo verificado. Tu identidad pasó a revisión.", "success");
  render();
};

const resendEmailCode = async () => {
  const result = await api("/api/auth/email/resend", { method: "POST", body: "{}" });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  showToast(result.demoCode ? `${result.message} Código: ${result.demoCode}` : result.message, "success");
};

const requestPasswordReset = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const result = await api("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email: requiredValue(data, "email").toLowerCase() })
  });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  showToast(result.demoCode ? `${result.message} Código: ${result.demoCode}` : result.message, "success");
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
  showToast(result.error || result.message || "Listo.", result.error ? "danger" : "success");
};

const authenticateAdminEntry = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const password = data.get("password");
  const result = await api("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password, code: data.get("code") || "" })
  });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  sessionStorage.setItem("mpAdminToken", "cookie");
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
  state.sellerDashboard = { user: state.user, stats: { active: 0, sold: 0, grossSales: 0, balance: 0, pendingBalance: 0, securityScore: 100 }, listings: [] };
  render();
  scrollToTop();
};

const logoutUser = async () => {
  const endpoint = state.user?.admin ? "/api/admin/logout" : "/api/auth/logout";
  await api(endpoint, { method: "POST", assistant: false, body: "{}" });
  state.socket?.close();
  state.user = null;
  state.authToken = "";
  state.authenticated = false;
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

const logoutAllSessions = async () => {
  const confirmed = await confirmAction(
    "Se cerrará MarketPro en este y en todos los demás dispositivos donde tu cuenta esté abierta.",
    "Cerrar todas las sesiones"
  );
  if (!confirmed) return;
  const result = await api("/api/auth/logout-all", { method: "POST", assistant: false, body: "{}" });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  showToast(result.message, "success");
  await logoutUser();
};

const deleteAccount = async () => {
  if (!state.authenticated && !state.authToken) {
    showToast("Para eliminar la cuenta tienes que iniciar sesión.", "danger");
    return;
  }
  const confirmed = await confirmAction(
    "Tus publicaciones quedarán pausadas, la sesión se cerrará y la cuenta dejará de estar disponible.",
    "Eliminar cuenta"
  );
  if (!confirmed) return;
  const result = await api("/api/user", { method: "DELETE" });
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  state.authToken = "";
  state.authenticated = false;
  state.user = null;
  state.sellerDashboard = null;
  state.view = "profile";
  localStorage.removeItem("marketUser");
  localStorage.removeItem("marketAuthToken");
  showToast("Cuenta eliminada. Tus publicaciones quedaron pausadas por seguridad.", "success");
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
    showToast("Android: usa Instalar app. En iPhone: Compartir y luego Agregar a pantalla de inicio.");
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js?v=102", { updateViaCache: "none" });
      await registration.update();
    } catch {
      showToast("La instalación sin conexión no está disponible en este momento.", "danger");
    }
  });
}

const reportClientError = (payload) => {
  ensureCsrfToken().then(() => fetch("/api/client-errors", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(state.csrfToken ? { "X-CSRF-Token": state.csrfToken } : {})
    },
    body: JSON.stringify(payload)
  })).catch(() => {});
};

window.addEventListener("error", (event) => {
  if (!event.error && !event.message) return;
  recordAssistantIssue("Esta pantalla encontró un error inesperado. El asistente puede ayudarte a continuar.", {
    path: state.view,
    status: 0
  });
  reportClientError({
    message: event.message || event.error?.message || "Error de interfaz",
    source: event.filename || state.view,
    line: event.lineno,
    column: event.colno
  });
});

window.addEventListener("unhandledrejection", (event) => {
  recordAssistantIssue("Una acción no pudo completarse. Revisa la conexión o consulta al asistente.", {
    path: state.view,
    status: 0
  });
  reportClientError({
    message: event.reason?.message || String(event.reason || "Promesa rechazada"),
    source: state.view
  });
});

loadData();


