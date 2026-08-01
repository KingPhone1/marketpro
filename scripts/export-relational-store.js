const fs = require("fs");
const path = require("path");
const { exportStore } = require("./lib/relational-export");

const root = path.join(__dirname, "..");
const source = path.join(root, "data", "store.json");
const output = path.join(root, "tmp", "migration-exports", new Date().toISOString().replace(/[:.]/g, "-"));
const exported = exportStore(JSON.parse(fs.readFileSync(source, "utf8")));
fs.mkdirSync(output, { recursive: true });
for (const [name, rows] of Object.entries(exported.tables)) fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ source: "data/store.json", createdAt: new Date().toISOString(), sourceHash: exported.sourceHash, counts: exported.counts }, null, 2));
console.log(`Export relacional creado: ${path.relative(root, output)}`);
console.log(JSON.stringify(exported.counts));
