// Upload foto material Gresik (file lokal hasil ekstrak AppSheet) ke Storage
// WARNOTO bucket public `material-photos`, lalu tulis public URL ke
// TEMPLATE_MIGRASI_STOK.xlsx (Foto Nameplate/Keseluruhan) agar SIAP render pas migrasi.
//
// Mapping: DB_Warnoto.xlsx listMaterial (Milik UPT=Gresik) -> "Foto Material"/"..Tambahan"
//   (basename relpath) -> file lokal di _extracted/data (reuse pola index basename dari
//   migration-tools/upload_legacy_history_attachments.mjs).
//
// DRY-RUN (default, aman, TIDAK upload & TIDAK tulis template):
//   node scripts/upload_gresik_foto.mjs
// COMMIT (upload ke PROD self-host + tulis template):
//   node scripts/upload_gresik_foto.mjs --commit
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const DB = "D:/CLAUDE/WARNOTO data/tester/DB_Warnoto.xlsx";
const ROOT = "D:/CLAUDE/WARNOTO data/Appsheet/_extracted/data";
const TPL = "TEMPLATE_MIGRASI_STOK.xlsx";
const BUCKET = "material-photos";
const COMMIT = process.argv.includes("--commit");
const S = v => String(v ?? "").trim();

function loadEnv() {
  const out = {};
  if (fs.existsSync(".env")) for (const l of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
// index basename(lowercase) -> fullPath, hanya folder lampiran (mis. "..._Images")
function buildIndex(root) {
  const idx = new Map();
  const isAtt = n => /(_images|_files_?)$/i.test(n) || /^(files|images)$/i.test(n);
  const walk = (dir, inAtt) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, inAtt || isAtt(e.name));
      else if (inAtt) { const k = e.name.toLowerCase(); if (!idx.has(k)) idx.set(k, full); }
    }
  };
  walk(root, false);
  return idx;
}

const db = XLSX.read(fs.readFileSync(DB));
const lm = XLSX.utils.sheet_to_json(db.Sheets["listMaterial"], { defval: "" });
const idx = buildIndex(ROOT);
const baseOf = rel => path.basename(S(rel).replace(/\\/g, "/")).toLowerCase();

const codes = ["2055044","2055058","2070973","3061075","3061226","3061594","3070081",
  "3070091","3090176","3090235","4180023","31200240","1003110101","1007010707"];

// kode -> [file lokal ke-1, ke-2] (yang ketemu)
const plan = new Map();
for (const c of codes) {
  const r = lm.find(x => S(x["Katalog"]) === c && /gresik/i.test(S(x["Milik UPT"])));
  if (!r) { plan.set(c, []); continue; }
  const files = [r["Foto Material"], r["Foto Material Tambahan"]]
    .map(v => S(v) ? idx.get(baseOf(v)) : null)
    .filter(Boolean);
  plan.set(c, files);
}

let nFile = 0;
for (const c of codes) {
  const f = plan.get(c);
  console.log(`${c} | foto lokal: ${f.length}${f.length ? " -> " + f.map(x => path.basename(x)).join(" ; ") : " (tak ada)"}`);
  nFile += f.length;
}
console.log(`\nTotal file foto siap-upload: ${nFile} (dari ${[...plan.values()].filter(a => a.length).length} material)`);

if (!COMMIT) { console.log("\nDRY RUN. Tidak upload, tidak tulis template. Jalankan --commit untuk eksekusi."); process.exit(0); }

const env = loadEnv();
const URL = env.NEW_SUPABASE_URL, KEY = env.NEW_SUPABASE_SECRET_KEY;
if (!URL || !KEY) { console.error("NEW_SUPABASE_URL / NEW_SUPABASE_SECRET_KEY belum ada di .env"); process.exit(1); }
const sb = createClient(URL, KEY);

async function up(localPath, key) {
  const { error } = await sb.storage.from(BUCKET).upload(key, fs.readFileSync(localPath), { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`upload ${key}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

const urlByCode = new Map();
for (const c of codes) {
  const files = plan.get(c); if (!files.length) continue;
  const urls = [];
  for (let i = 0; i < files.length; i++) urls.push(await up(files[i], `stock/gresik/${c}-${i + 1}.jpg`));
  urlByCode.set(c, urls);
  console.log(`uploaded ${c}: ${urls.length}`);
}

const wb = XLSX.read(fs.readFileSync(TPL));
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Data Stok"], { header: 1, defval: "" });
const H = rows[0], ci = n => H.indexOf(n);
for (let i = 1; i < rows.length; i++) {
  const u = urlByCode.get(S(rows[i][ci("No Katalog")])); if (!u) continue;
  rows[i][ci("Foto Nameplate")] = u[0] || "";
  rows[i][ci("Foto Keseluruhan")] = u[1] || "";
}
const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = wb.Sheets["Data Stok"]["!cols"];
wb.Sheets["Data Stok"] = ws;
XLSX.writeFile(wb, TPL);
console.log(`\nSelesai. Template diperbarui dengan URL material-photos.`);
