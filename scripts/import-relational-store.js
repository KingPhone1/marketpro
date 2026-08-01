const fs = require("fs");
const path = require("path");

if (process.env.MIGRATION_TARGET !== "staging") throw new Error("La importacion solo permite MIGRATION_TARGET=staging.");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan credenciales privadas de Supabase para staging.");

const root = path.join(__dirname, "..");
const exportsRoot = path.join(root, "tmp", "migration-exports");
const target = fs.readdirSync(exportsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  .map((entry) => ({ path: path.join(exportsRoot, entry.name), modifiedAt: fs.statSync(path.join(exportsRoot, entry.name)).mtimeMs }))
  .sort((a, b) => b.modifiedAt - a.modifiedAt).at(0)?.path;
if (!target) throw new Error("Ejecuta migration:export antes de importar.");

const mapping = { privateIdentities: "user_private_identities", listingImages: "listing_images", participants: "conversation_participants", audits: "audit_events" };
const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
const manifest = JSON.parse(fs.readFileSync(path.join(target, "manifest.json"), "utf8"));

async function write(table, rows) {
  for (let index = 0; index < rows.length; index += 100) {
    const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(rows.slice(index, index + 100)) });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  }
}

(async () => {
  for (const key of Object.keys(manifest.counts)) {
    const rows = JSON.parse(fs.readFileSync(path.join(target, `${key}.json`), "utf8"));
    await write(mapping[key] || key, rows);
  }
  await write("migration_runs", [{ source_hash: manifest.sourceHash, source_counts: manifest.counts, target: "staging", completed_at: new Date().toISOString() }]);
  console.log("Importacion de staging completada.");
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
