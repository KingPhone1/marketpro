const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = path.join(root, "data", "store.json");

if (!fs.existsSync(source)) {
  throw new Error("No se encontro data/store.json para crear el respaldo.");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(root, "tmp", "audit-backups", stamp);
fs.mkdirSync(destination, { recursive: true });

const contents = fs.readFileSync(source);
const store = JSON.parse(contents.toString("utf8"));
const backupFile = path.join(destination, "store.json");
const digest = crypto.createHash("sha256").update(contents).digest("hex");

fs.writeFileSync(backupFile, contents);
fs.writeFileSync(path.join(destination, "inventory.json"), JSON.stringify({
  createdAt: new Date().toISOString(),
  source: "data/store.json",
  sha256: digest,
  counts: {
    users: (store.users || []).length,
    products: (store.products || []).length,
    conversations: (store.conversations || []).length,
    orders: (store.orders || []).length,
    favorites: (store.favorites || []).length,
    notifications: (store.notifications || []).length,
    reports: (store.reports || []).length,
    adminAudit: (store.adminAudit || []).length
  }
}, null, 2));

console.log(`Respaldo creado: ${path.relative(root, destination)}`);
console.log(`SHA-256: ${digest}`);
