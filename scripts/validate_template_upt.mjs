// Cek TEMPLATE_MIGRASI_STOK.xlsx (atau file lain) sebelum migrasi:
//   - kolom UPT wajib ada & terisi tiap baris
//   - SATU file = SATU UPT: WARNING + daftar baris kalau ada UPT lain tercampur
// Pola cek sama yang harus dipakai importer di menu Migrasi Data.
// Jalankan: node scripts/validate_template_upt.mjs [path.xlsx]
import * as XLSX from "xlsx";
import fs from "fs";

const FILE = process.argv[2] || "TEMPLATE_MIGRASI_STOK.xlsx";
const S = v => String(v ?? "").trim();
if (!fs.existsSync(FILE)) { console.error(`File tak ada: ${FILE}`); process.exit(1); }

const wb = XLSX.read(fs.readFileSync(FILE));
const ws = wb.Sheets["Data Stok"] || wb.Sheets[wb.SheetNames.find(n => n !== "Petunjuk")];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
const H = rows[0] || [];
const uptCol = H.indexOf("UPT");
if (uptCol < 0) { console.error("❌ Kolom \"UPT\" tidak ditemukan. Pakai template terbaru."); process.exit(2); }

const data = rows.slice(1).filter(r => r.some(c => S(c) !== ""));
const norm = u => S(u).toLowerCase().replace(/\s+/g, " ");
const kosong = [], byUpt = new Map();
data.forEach((r, i) => {
  const u = S(r[uptCol]); const excelRow = i + 2; // +header +1-based
  if (!u) { kosong.push(excelRow); return; }
  if (!byUpt.has(norm(u))) byUpt.set(norm(u), { label: u, rows: [] });
  byUpt.get(norm(u)).rows.push(excelRow);
});

const upts = [...byUpt.values()].sort((a, b) => b.rows.length - a.rows.length);
console.log(`File: ${FILE} | baris data: ${data.length}`);
if (kosong.length) console.log(`⚠️  UPT KOSONG di ${kosong.length} baris: ${kosong.join(", ")}`);

if (upts.length <= 1 && !kosong.length) {
  console.log(`✅ Bersih. Semua ${data.length} baris = "${upts[0]?.label || "-"}". Aman dimigrasi.`);
  process.exit(0);
}
if (upts.length > 1) {
  const [main, ...lain] = upts;
  console.log(`\n⚠️  WARNING: file TERCAMPUR ${upts.length} UPT — tidak boleh dimigrasi jadi satu.`);
  console.log(`   Mayoritas: "${main.label}" (${main.rows.length} baris)`);
  lain.forEach(u => console.log(`   ❌ UPT lain: "${u.label}" (${u.rows.length} baris) -> baris Excel: ${u.rows.join(", ")}`));
}
process.exit(3);
