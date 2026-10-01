// Verifica que todos los textos t("...") tengan traducción en lib/i18n.en.ts.
// Uso: node scripts/check-i18n.js        (lista: node scripts/check-i18n.js list)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (f === "node_modules" || f.startsWith(".") || f === "supabase" || f === "scripts") continue;
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f) && !f.startsWith("i18n")) files.push(p);
  }
})(root);
const keys = new Set();
const re = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
for (const f of files) {
  const c = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(c))) keys.add(m[1]);
}
const src = fs.readFileSync(path.join(root, "lib/i18n.en.ts"), "utf8");
const existing = eval("(" + src.slice(src.indexOf("= {") + 2, src.lastIndexOf("}") + 1) + ")");
const missing = [...keys].filter((k) => !(k in existing)).sort();
const unused = Object.keys(existing).filter((k) => !keys.has(k));
console.log(JSON.stringify({ total: keys.size, missing: missing.length, unused: unused.length }));
if (process.argv[2] === "list") console.log([...missing.map((k) => "MISSING " + k), ...unused.map((k) => "UNUSED  " + k)].join("\n"));
process.exit(missing.length ? 1 : 0);
