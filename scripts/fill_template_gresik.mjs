// Isi TEMPLATE_MIGRASI_STOK.xlsx dengan data referensi UPT Gresik (laporan SAP
// PLN Stock/Cadang Materials). Pertahankan sheet Petunjuk, ganti sheet Data Stok.
// Jalankan: node scripts/fill_template_gresik.mjs
import * as XLSX from "xlsx";
import fs from "fs";

const SRC = "D:/CLAUDE/WARNOTO data/tester/upt gresik/UPT GRESIK MATERIAL.xlsx";
const TPL = "TEMPLATE_MIGRASI_STOK.xlsx";

// kolom laporan Gresik (header di baris index 6)
const C = { MATLTYPE:7, SLOC_DESC:6, MATERIAL:9, DESC:10, UNIT:12, VALTYPE:13, UU:14, VALDESC:20 };
const s = v => String(v ?? "").trim();

function jenisBarang(matlType, valType) {
  if (s(matlType).toUpperCase() === "ZCAD") return "Cadang";
  const vt = s(valType).toUpperCase();          // ZST1
  if (vt === "BURSA") return "Persediaan Bursa";
  if (vt === "PRE-MEMORY") return "Pre Memory";
  return "Persediaan";
}

const src = XLSX.read(fs.readFileSync(SRC));
const rows = XLSX.utils.sheet_to_json(src.Sheets[src.SheetNames[0]], { header: 1, defval: "" });
// baris data = punya kode Material numerik di kolom MATERIAL
const dataRows = rows.filter(r => /^\d+$/.test(s(r[C.MATERIAL])));

const KOLOM = ["UPT","No Katalog","Nama Material","Satuan","Jenis Barang","Merk","Type","Kategori",
  "Qty","Harga Satuan","Min Qty","Gudang","Blok/Lokasi","Foto Nameplate","Foto Keseluruhan"];

const out = dataRows.map(r => [
  "UPT Gresik",                             // scoping — file ini khusus UPT Gresik
  s(r[C.MATERIAL]),
  s(r[C.DESC]),
  s(r[C.UNIT]),
  jenisBarang(r[C.MATLTYPE], r[C.VALTYPE]),
  "", "",                                   // Merk, Type — tidak ada di laporan Gresik
  s(r[C.VALDESC]),                          // Kategori (kosong utk ZCAD)
  Number(r[C.UU]) || 0,
  "",                                       // Harga — tidak ada di laporan
  "",                                       // Min Qty
  s(r[C.SLOC_DESC]) || "Gd UPT Gresik",     // Gudang
  "", "", "",                               // Blok, Foto Nameplate, Foto Keseluruhan
]);

const wb = XLSX.read(fs.readFileSync(TPL));   // pertahankan sheet Petunjuk
const wsData = XLSX.utils.aoa_to_sheet([KOLOM, ...out]);
wsData["!cols"] = [{wch:14},{wch:12},{wch:40},{wch:8},{wch:16},{wch:10},{wch:10},{wch:24},
  {wch:8},{wch:14},{wch:8},{wch:16},{wch:14},{wch:42},{wch:42}];
wb.Sheets["Data Stok"] = wsData;              // replace in place (urutan sheet tetap)
XLSX.writeFile(wb, TPL);
console.log(`OK -> ${TPL}: ${out.length} baris material Gresik terisi`);
