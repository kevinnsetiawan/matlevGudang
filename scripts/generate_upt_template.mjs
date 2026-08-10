// WARNOTO — Generator template Excel per-UPT untuk onboarding data awal.
//
// Setiap UPT baru butuh satu file Excel siap-isi, sudah berisi kode UPT-nya
// sendiri di tiap sheet (biar tidak tercampur dengan UPT lain saat validasi
// import). Sheet LOKASI harus persis cocok dengan template import yang sudah
// dipakai aplikasi (ImportLokasiModal.jsx) supaya importer tidak menolaknya.
//
// Pakai:
//   node scripts/generate_upt_template.mjs --upt-id UPT-MLG --upt-nama "UPT Malang"
//
// Output: outputs/templates/TEMPLATE_<upt-id>_<YYYYMMDD>.xlsx (tidak di-commit,
// outputs/ sudah di-gitignore).
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--upt-id") args.uptId = argv[++i];
    else if (argv[i] === "--upt-nama") args.uptNama = argv[++i];
  }
  return args;
}

const { uptId, uptNama } = parseArgs(process.argv.slice(2));
if (!uptId || !uptNama) {
  console.error("Usage: node scripts/generate_upt_template.mjs --upt-id UPT-MLG --upt-nama \"UPT Malang\"");
  process.exit(1);
}

const PREFILL_ROWS = 50;

// Kode gudang contoh: GD-<3 huruf UPT>-01. Ambil 3 huruf pertama dari upt-id
// (setelah "UPT-" kalau ada), fallback ke 3 huruf pertama upt-id apa adanya.
const uptCodeShort = (uptId.replace(/^UPT-/i, "").slice(0, 3) || uptId.slice(0, 3)).toUpperCase();
const contohKodeGudang = `GD-${uptCodeShort}-01`;

// Definisi tiap sheet tabel: header + baris contoh (opsional) + jumlah baris
// prefill kolom UPT. Loop tunggal di bawah yang membangun semuanya.
const SHEETS = [
  {
    name: "GUDANG",
    headers: ["UPT", "Kode Gudang", "Nama Gudang", "ULTG", "Alamat", "Jenis Gudang"],
    contoh: [uptId, contohKodeGudang, "Gudang Contoh (HAPUS baris ini)", "ULTG Contoh", "Alamat contoh", "Gudang Induk"],
    prefillRows: PREFILL_ROWS,
    widths: [10, 16, 26, 16, 30, 16],
  },
  {
    name: "SUB_GUDANG",
    headers: ["UPT", "Kode Gudang", "Kode Sub Gudang", "Nama Sub Gudang"],
    prefillRows: PREFILL_ROWS,
    widths: [10, 16, 18, 26],
  },
  {
    name: "LOKASI",
    headers: ["UPT", "Gudang", "Sub Gudang", "Kode Blok", "Keterangan"],
    prefillRows: PREFILL_ROWS,
    widths: [10, 22, 18, 14, 30],
  },
  {
    name: "MATERIAL",
    headers: ["UPT", "Kode Material SAP", "Nama Material", "Satuan", "Jenis Barang"],
    prefillRows: PREFILL_ROWS,
    widths: [10, 20, 30, 12, 16],
  },
  {
    name: "SALDO_AWAL",
    headers: ["UPT", "Kode Gudang", "Kode Blok", "Kode Material SAP", "Qty", "Satuan", "Kondisi", "Tanggal Cutoff", "Keterangan"],
    prefillRows: PREFILL_ROWS,
    widths: [10, 16, 14, 20, 10, 12, 12, 16, 30],
  },
  {
    name: "ALAT_BERAT",
    headers: ["UPT", "Nama Alat", "Jenis", "Merk/Tipe", "Nomor Seri", "Tahun", "Kondisi", "Lokasi Simpan", "Keterangan"],
    prefillRows: PREFILL_ROWS,
    widths: [10, 20, 14, 18, 16, 10, 12, 18, 30],
  },
];

const PETUNJUK_LINES = [
  `TEMPLATE ISIAN DATA AWAL — ${uptNama} (${uptId})`,
  "",
  "ATURAN WAJIB:",
  `1. File ini HANYA untuk ${uptNama} (${uptId}). Jangan isi data milik UPT lain.`,
  "2. Kolom UPT di tiap sheet sudah terisi otomatis — JANGAN diubah.",
  "3. Isi sheet secara BERURUTAN: GUDANG -> SUB_GUDANG -> LOKASI -> MATERIAL -> SALDO_AWAL.",
  "   Sheet berikutnya merujuk kode/nama yang diisi di sheet sebelumnya.",
  "4. Jangan menambah, menghapus, atau mengganti nama kolom di sheet mana pun.",
  "5. Jangan menambah sheet baru.",
  "6. Kolom Qty diisi angka murni (contoh: 1500), TANPA titik ribuan dan TANPA satuan.",
  "",
  "BARIS CONTOH:",
  `Sheet GUDANG punya 1 baris contoh (Kode Gudang "${contohKodeGudang}") — HAPUS baris itu sebelum mengirim file.`,
  "",
  "KONVENSI KODE GUDANG:",
  "GD-<3 huruf UPT>-<urut 2 digit>, contoh: " + contohKodeGudang,
  "",
  "SHEET MATERIAL:",
  "Ini BUKAN katalog baru — ini daftar material yang dipakai UPT ini, untuk",
  "dicocokkan ke katalog nasional yang sudah ada. Kunci pencocokan = Kode Material SAP.",
  "",
  "SHEET SALDO_AWAL:",
  "Satu Tanggal Cutoff berlaku untuk seluruh sheet ini. Format tanggal: YYYY-MM-DD.",
  "",
  "KONTAK PIC (diisi manual oleh UPT):",
  "Diisi UPT: Nama PIC = ",
  "Diisi UPT: No. HP/WA = ",
  "Diisi UPT: Email = ",
];

const wb = XLSX.utils.book_new();

const wsPetunjuk = XLSX.utils.aoa_to_sheet(PETUNJUK_LINES.map(line => [line]));
wsPetunjuk["!cols"] = [{ wch: 90 }];
XLSX.utils.book_append_sheet(wb, wsPetunjuk, "PETUNJUK");

for (const sheet of SHEETS) {
  const rows = [sheet.headers];
  if (sheet.contoh) rows.push(sheet.contoh);
  const emptyRowCount = Math.max(0, sheet.prefillRows - rows.length + 1);
  for (let i = 0; i < emptyRowCount; i++) {
    rows.push([uptId, ...Array(sheet.headers.length - 1).fill("")]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = sheet.widths.map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, sheet.name);
}

const outDir = path.join(process.cwd(), "outputs", "templates");
fs.mkdirSync(outDir, { recursive: true });
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outPath = path.join(outDir, `TEMPLATE_${uptId}_${dateStr}.xlsx`);
XLSX.writeFile(wb, outPath);
console.log(`Template dibuat: ${outPath}`);
