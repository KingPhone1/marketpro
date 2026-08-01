const fs = require("fs");
const path = require("path");

if (process.env.MIGRATION_TARGET !== "staging") throw new Error("La verificacion de destino solo permite MIGRATION_TARGET=staging.");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan credenciales privadas de Supabase para staging.");

const root = path.join(__dirname, "..");
const exportsRoot = path.join(root, "tmp", "migration-exports");
const target = fs.readdirSync(exportsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  .map((entry) => ({ path: path.join(exportsRoot, entry.name), modifiedAt: fs.statSync(path.join(exportsRoot, entry.name)).mtimeMs }))
  .sort((a, b) => b.modifiedAt - a.modifiedAt).at(0)?.path;
if (!target) throw new Error("Ejecuta migration:export antes de verificar el destino.");

const manifest = JSON.parse(fs.readFileSync(path.join(target, "manifest.json"), "utf8"));
const mapping = { privateIdentities: "user_private_identities", listingImages: "listing_images", participants: "conversation_participants", audits: "audit_events" };
const headers = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  Prefer: "count=exact",
};
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");

async function count(table) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?select=id&limit=1`, { headers });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  const contentRange = response.headers.get("content-range");
  const total = contentRange?.split("/").at(-1);
  if (!total || total === "*") throw new Error(`Supabase no devolvio el conteo de ${table}.`);
  return Number(total);
}

async function latestMigration() {
  const response = await fetch(`${baseUrl}/rest/v1/migration_runs?select=source_hash,source_counts,target,completed_at&target=eq.staging&order=completed_at.desc&limit=1`, { headers });
  if (!response.ok) throw new Error(`migration_runs: ${response.status} ${await response.text()}`);
  return (await response.json())[0];
}

(async () => {
  const migration = await latestMigration();
  if (!migration || migration.source_hash !== manifest.sourceHash) throw new Error("No existe una migracion de staging que coincida con el export actual.");
  for (const [key, expected] of Object.entries(manifest.counts)) {
    const actual = await count(mapping[key] || key);
    if (actual !== expected) throw new Error(`Conteo invalido para ${key}: esperado ${expected}, recibido ${actual}.`);
  }
  console.log("Destino de staging verificado: hash y conteos coinciden.");
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
