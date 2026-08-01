if (process.env.MIGRATION_TARGET !== "staging") {
  throw new Error("La aprobacion manual solo permite MIGRATION_TARGET=staging.");
}

const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const storeId = process.env.SUPABASE_STORE_ID || "staging";
if (!baseUrl || !serviceKey) throw new Error("Faltan credenciales privadas de Supabase para staging.");

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json"
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}

(async () => {
  const rows = await (await request(`${baseUrl}/rest/v1/marketpro_store?id=eq.${encodeURIComponent(storeId)}&select=store_data`)).json();
  const store = rows?.[0]?.store_data;
  if (!store) throw new Error("No existe memoria de staging.");

  const latest = [...(store.verificationRequests || [])]
    .filter((entry) => entry.status === "Pendiente")
    .sort((left, right) => new Date(right.submittedAt) - new Date(left.submittedAt))[0];
  if (!latest) throw new Error("No hay solicitudes pendientes para aprobar.");
  if (Date.now() - new Date(latest.submittedAt).getTime() > 30 * 60 * 1000) {
    throw new Error("La solicitud pendiente mas reciente no es lo suficientemente nueva para aprobarla automaticamente.");
  }

  const user = (store.users || []).find((entry) => entry.id === latest.userId);
  if (!user) throw new Error("La solicitud no tiene una cuenta asociada.");
  const now = new Date().toISOString();
  await request(`${baseUrl}/rest/v1/marketpro_store_backups`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ store_id: storeId, revision: Number(store.memory?.revision || 0), store_data: store })
  });

  store.users = (store.users || []).map((entry) => entry.id === user.id ? {
    ...entry,
    verified: true,
    emailVerified: true,
    verificationStatus: "Verificado por admin",
    updatedAt: now
  } : entry);
  store.verificationRequests = (store.verificationRequests || []).map((entry) => entry.userId === user.id ? {
    ...entry,
    status: "Aprobado",
    reviewedAt: now,
    reviewedBy: "staging-admin"
  } : entry);
  store.notifications = [{
    id: `notice-${crypto.randomUUID()}`,
    email: user.email,
    title: "Cuenta aprobada",
    message: "Tu identidad fue aprobada. Ya puedes publicar y vender.",
    type: "success",
    link: "/?page=profile",
    read: false,
    createdAt: now
  }, ...(store.notifications || [])].slice(0, 1000);
  store.adminAudit = [{
    id: `audit-${crypto.randomUUID()}`,
    action: "user-verification-approved",
    details: { source: "staging-manual-review" },
    ip: "",
    createdAt: now
  }, ...(store.adminAudit || [])].slice(0, 500);
  store.memory = {
    ...(store.memory || {}),
    updatedAt: now,
    revision: Number(store.memory?.revision || 0) + 1
  };

  await request(`${baseUrl}/rest/v1/marketpro_store?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: storeId, store_data: store, updated_at: now })
  });
  console.log("Cuenta de staging aprobada y respaldo creado.");
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
