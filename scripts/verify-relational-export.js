const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { exportStore } = require("./lib/relational-export");

const root = path.join(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "data", "store.json"), "utf8"));
const expected = exportStore(source);
const exportsRoot = path.join(root, "tmp", "migration-exports");
const target = fs.readdirSync(exportsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  .map((entry) => ({ path: path.join(exportsRoot, entry.name), modifiedAt: fs.statSync(path.join(exportsRoot, entry.name)).mtimeMs }))
  .sort((a, b) => b.modifiedAt - a.modifiedAt).at(0)?.path;
if (!target) throw new Error("No se encontro un export relacional.");
const manifest = JSON.parse(fs.readFileSync(path.join(target, "manifest.json"), "utf8"));
if (manifest.sourceHash !== expected.sourceHash) throw new Error("El export no coincide con el origen actual.");
for (const [table, total] of Object.entries(expected.counts)) {
  const rows = JSON.parse(fs.readFileSync(path.join(target, `${table}.json`), "utf8"));
  if (rows.length !== total) throw new Error(`Conteo invalido para ${table}.`);
}
console.log(`Export relacional valido: ${path.relative(root, target)}`);
