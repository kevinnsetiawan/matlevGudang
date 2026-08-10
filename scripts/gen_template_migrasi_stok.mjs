// Generator template XLSX untuk migrasi data stock UPT (diisi manual lalu
// diupload di Master Data > Migrasi Data). Kolom mengikuti skema katalog+stock
// WARNOTO. Foto = link Google Drive (WAJIB format direct-view, lihat sheet Petunjuk).
// Jalankan: node scripts/gen_template_migrasi_stok.mjs
import * as XLSX from "xlsx";

const KOLOM = [
  "UPT",               // WAJIB — 1 file = 1 UPT (importer WARNING kalau tercampur)
  "No Katalog",        // kode katalog — WAJIB
  "Nama Material",     // WAJIB
  "Satuan",            // U / BH / SET / M ... — WAJIB
  "Jenis Barang",      // Persediaan | Persediaan Bursa | Pre Memory | Cadang — WAJIB
  "Merk",
  "Type",
  "Kategori",          // cth: HAR-Transformator
  "Qty",               // WAJIB
  "Harga Satuan",      // Rp, angka saja
  "Min Qty",
  "Gudang",            // nama/kode gudang tujuan
  "Blok/Lokasi",       // cth: Rak A-1
  "Foto Nameplate",    // link Drive direct-view
  "Foto Keseluruhan",  // link Drive direct-view
];

const CONTOH = [
  ["UPT Gresik","1060011","TRF ACC;NGR 70kV 200 Ohm","U","Persediaan","","","HAR-Transformator",3,15000000,1,"Gudang Ketintang","Rak A-1","https://drive.google.com/uc?export=view&id=GANTI_FILE_ID","https://drive.google.com/uc?export=view&id=GANTI_FILE_ID"],
  ["UPT Gresik","2010124","CB;K;20kV;1250A;25kA;SPRING;3P;VACUM","U","Pre Memory","ABB","VD4",  "HAR-Switchgear&Jaringan",2,45000000,1,"Gudang Ketintang","Rak B-3","",""],
];

const wsData = XLSX.utils.aoa_to_sheet([KOLOM, ...CONTOH]);
wsData["!cols"] = [
  {wch:14},{wch:12},{wch:36},{wch:8},{wch:16},{wch:12},{wch:12},{wch:22},
  {wch:8},{wch:14},{wch:8},{wch:20},{wch:14},{wch:42},{wch:42},
];

const PETUNJUK = [
  ["PETUNJUK PENGISIAN — TEMPLATE MIGRASI DATA STOK WARNOTO"],
  [""],
  ["1. Isi data di sheet \"Data Stok\". Satu baris = satu material di satu lokasi."],
  ["   Kalau 1 material tersebar di >1 blok/lokasi, buat 1 baris per lokasi (No Katalog boleh berulang)."],
  ["2. Kolom WAJIB: UPT, No Katalog, Nama Material, Satuan, Jenis Barang, Qty."],
  ["   UPT: SATU file = SATU UPT. Semua baris harus UPT yang sama; importer akan WARNING & tolak"],
  ["   kalau ada baris dari UPT lain (jangan campur data antar-UPT dalam 1 file)."],
  ["3. Jenis Barang harus salah satu (huruf persis):"],
  ["      Persediaan | Persediaan Bursa | Pre Memory | Cadang"],
  ["4. Harga Satuan & Min Qty: angka saja, tanpa titik/koma/\"Rp\" (cth: 15000000)."],
  ["5. Gudang & Blok/Lokasi: harus cocok dengan Master Lokasi UPT tujuan."],
  ["   Kalau blok belum ada, buat dulu di Master Data > Lokasi, atau kosongkan (isi manual setelah import)."],
  [""],
  ["6. FOTO — pakai link Google Drive, TAPI WAJIB format DIRECT-VIEW, bukan link share biasa:"],
  ["   ✅ BENAR : https://drive.google.com/uc?export=view&id=FILE_ID"],
  ["   ✅ BENAR : https://lh3.googleusercontent.com/d/FILE_ID"],
  ["   ❌ SALAH : https://drive.google.com/file/d/FILE_ID/view   (tidak tampil di aplikasi)"],
  ["   Ambil FILE_ID dari link share (bagian antara /d/ dan /view), lalu susun jadi format uc?export=view."],
  ["   Pastikan file/folder Drive di-set \"Anyone with the link\" agar foto bisa dimuat."],
  ["   Foto boleh dikosongkan — bisa diisi/foto ulang lewat aplikasi setelahnya."],
  [""],
  ["7. Jangan ubah baris judul (header) & jangan hapus/ganti nama kolom."],
  ["   Hapus 2 baris CONTOH sebelum diisi data asli."],
];
const wsInfo = XLSX.utils.aoa_to_sheet(PETUNJUK);
wsInfo["!cols"] = [{wch:100}];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsInfo, "Petunjuk");
XLSX.utils.book_append_sheet(wb, wsData, "Data Stok");
XLSX.writeFile(wb, "TEMPLATE_MIGRASI_STOK.xlsx");
console.log("OK -> TEMPLATE_MIGRASI_STOK.xlsx (sheet: Petunjuk, Data Stok)");
