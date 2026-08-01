const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const backupsRoot = path.join(root, "tmp", "audit-backups");
const target = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : fs.readdirSync(backupsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        path: path.join(backupsRoot, entry.name),
        modifiedAt: fs.statSync(path.join(backupsRoot, entry.name)).mtimeMs
      }))
      .sort((first, second) => second.modifiedAt - first.modifiedAt)
      .at(0)?.path;

if (!target || !fs.existsSync(target)) {
  throw new Error("No se encontro un respaldo para verificar.");
}

const inventoryFile = path.join(target, "inventory.json");
const backupFile = path.join(target, "store.json");
const inventory = JSON.parse(fs.readFileSync(inventoryFile, "utf8").replace(/^\uFEFF/, ""));
const contents = fs.readFileSync(backupFile);
const digest = crypto.createHash("sha256").update(contents).digest("hex");

if (digest !== String(inventory.sha256 || "").toLowerCase()) {
  throw new Error("La huella del respaldo no coincide con el inventario.");
}

const store = JSON.parse(contents.toString("utf8"));
for (const [key, expected] of Object.entries(inventory.counts || {})) {
  const actual = (store[key] || []).length;
  if (actual !== expected) throw new Error(`Conteo invalido para ${key}: ${actual} no coincide con ${expected}.`);
}

console.log(`Respaldo valido: ${path.relative(root, target)}`);
