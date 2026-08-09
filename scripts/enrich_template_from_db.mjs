// Lengkapi TEMPLATE_MIGRASI_STOK.xlsx dari DB_Warnoto.xlsx (match No Katalog,
// hanya baris Milik/UPT = Gresik):
//   - Foto  : dari mutasiBarang."Link Foto Material/Barang" (link Google Drive asli).
//             Dikonversi ke direct-view lh3.googleusercontent.com/d/<id> agar SIAP render
//             di <img> saat migrasi. Foto relatif listMaterial (bukan URL) TIDAK dipakai.
//   - Blok  : dari mutasiBarang."Lokasi Material Berada".
//   - Harga & Merk: TIDAK ada di DB_Warnoto -> dibiarkan kosong.
// Idempoten: kolom Foto ditulis ulang dari nol tiap run. File Drive wajib di-set
// "Anyone with the link" agar foto termuat.
// Jalankan: node scripts/enrich_template_from_db.mjs
import * as XLSX from "xlsx";
import fs from "fs";

const DB = "D:/CLAUDE/WARNOTO data/tester/DB_Warnoto.xlsx";
const TPL = "TEMPLATE_MIGRASI_STOK.xlsx";
const S = v => String(v ?? "").trim();
const isG = u => /gresik/i.test(S(u));
const fileId = u => { const m = S(u).match(/\/d\/([^/?]+)/) || S(u).match(/[?&]id=([^&]+)/); return m ? m[1] : ""; };
const driveDirect = id => `https://lh3.googleusercontent.com/d/${id}`;

const db = XLSX.read(fs.readFileSync(DB));
const mut = XLSX.utils.sheet_to_json(db.Sheets["mutasiBarang"], { defval: "" });

// kode -> {fotos:[direct-view urls unik], blok}
const info = new Map();
mut.filter(r => isG(r["UPT Asal"])).forEach(r => {
  const k = S(r["Kode Katalog"]); if (!k) return;
  if (!info.has(k)) info.set(k, { fotos: [], blok: "" });
  const d = info.get(k);
  const id = fileId(r["Link Foto Material/Barang"]);
  if (id) { const url = driveDirect(id); if (!d.fotos.includes(url)) d.fotos.push(url); }
  const b = S(r["Lokasi Material Berada"]); if (b && !d.blok) d.blok = b;
});

const wb = XLSX.read(fs.readFileSync(TPL));
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Data Stok"], { header: 1, defval: "" });
const H = rows[0]; const ci = n => H.indexOf(n);
let nBlok = 0, nFoto = 0;
for (let i = 1; i < rows.length; i++) {
  const kat = S(rows[i][ci("No Katalog")]);
  const d = info.get(kat);
  // reset foto tiap run (buang path relatif broken dari run sebelumnya)
  rows[i][ci("Foto Nameplate")] = "";
  rows[i][ci("Foto Keseluruhan")] = "";
  if (!d) continue;
  if (d.blok) { rows[i][ci("Blok/Lokasi")] = d.blok; nBlok++; }
  if (d.fotos[0]) { rows[i][ci("Foto Nameplate")] = d.fotos[0]; nFoto++; }
  if (d.fotos[1]) rows[i][ci("Foto Keseluruhan")] = d.fotos[1];
}

const wsData = XLSX.utils.aoa_to_sheet(rows);
wsData["!cols"] = wb.Sheets["Data Stok"]["!cols"];
wb.Sheets["Data Stok"] = wsData;
XLSX.writeFile(wb, TPL);
console.log(`OK -> ${TPL}: blok terisi ${nBlok}, foto siap-render ${nFoto}`);
