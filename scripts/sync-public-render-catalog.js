const assertStaging = () => {
  if (process.env.MIGRATION_TARGET !== "staging") {
    throw new Error("La sincronizacion publica solo permite MIGRATION_TARGET=staging.");
  }
};

const sourceBaseUrl = String(process.env.SOURCE_APP_URL || "https://marketpro-3d1k.onrender.com").replace(/\/$/, "");
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const storeId = process.env.SUPABASE_STORE_ID || "staging";

assertStaging();
if (!supabaseUrl || !serviceKey) throw new Error("Faltan credenciales privadas de Supabase para staging.");

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json"
};

const isSafePublicListing = (listing = {}) =>
  typeof listing.id === "string" && listing.id.length > 2 &&
  typeof listing.title === "string" && listing.title.trim().length > 1 &&
  Number.isFinite(Number(listing.price)) && Number(listing.price) >= 0 &&
  Array.isArray(listing.images) && listing.images.length > 0;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function readStore() {
  const rows = await fetchJson(
    `${supabaseUrl}/rest/v1/marketpro_store?id=eq.${encodeURIComponent(storeId)}&select=store_data`,
    { headers }
  );
  if (!rows?.[0]?.store_data) throw new Error("No existe memoria de staging en Supabase.");
  return rows[0].store_data;
}

async function saveStore(store) {
  const response = await fetch(`${supabaseUrl}/rest/v1/marketpro_store`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: storeId,
      store_data: store,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error(`No se pudo guardar el catalogo: ${response.status}`);
}

(async () => {
  const [store, remoteProducts] = await Promise.all([
    readStore(),
    fetchJson(`${sourceBaseUrl}/api/products`)
  ]);
  const publicProducts = remoteProducts.filter(isSafePublicListing);
  const productsById = new Map((store.products || []).map((product) => [product.id, product]));
  publicProducts.forEach((product) => productsById.set(product.id, { ...productsById.get(product.id), ...product }));

  store.products = [...productsById.values()];
  store.memory = {
    ...(store.memory || {}),
    publicCatalogSync: {
      source: sourceBaseUrl,
      listings: publicProducts.length,
      completedAt: new Date().toISOString()
    }
  };
  await saveStore(store);
  console.log(`Catalogo publico sincronizado: ${publicProducts.length} publicaciones.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
