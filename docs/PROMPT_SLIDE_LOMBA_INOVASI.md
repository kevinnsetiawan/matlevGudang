# Prompt: Slide Presentasi Lomba Inovasi WARNOTO

Dokumen ini berisi satu prompt siap-pakai untuk meminta Claude membuat deck
presentasi 5 slide (format PPTX) mengikuti template lomba inovasi Danantara
Indonesia.

## Cara pakai

1. Buka Claude (claude.ai) atau Claude Code.
2. Lampirkan 5 gambar panduan slide Danantara supaya gaya visualnya diikuti.
3. Isi blok `DATA SAYA` di kepala prompt kalau sudah punya angka aslinya.
   Kalau dikosongkan, Claude akan memakai placeholder dan menagih datanya di
   akhir jawaban.
4. Salin seluruh isi blok di bawah, lalu kirim.

Catatan: kalau dijalankan di Claude Code, pastikan `python-pptx` terpasang
(`pip install python-pptx`) — modul ini belum ada di mesin ini.

## Prompt

````text
Kamu adalah desainer presentasi korporat. Buatkan saya file PowerPoint (.pptx)
berisi 5 slide untuk lomba inovasi internal PT PLN (Persero), mengikuti
template Danantara Indonesia yang saya lampirkan gambarnya.

====================================================================
DATA SAYA (isi kalau ada; kosongkan kalau belum punya)
--------------------------------------------------------------------
- Waktu proses pencarian/pencatatan material sebelum WARNOTO :
- Waktu proses sesudah WARNOTO                              :
- Jumlah item material yang dikelola                        :
- Nilai persediaan gudang (Rp)                              :
- Jumlah gudang / UPT / ULTG yang dilayani                  :
- Akurasi stok sebelum vs sesudah (%)                       :
- Frekuensi & durasi stock opname sebelum vs sesudah        :
- Jumlah pengguna aktif aplikasi                            :
- Anggota tim inovasi (nama, jabatan, peran)                :
====================================================================

## Tentang inovasinya (ini fakta, jangan diubah atau ditambah-tambahi)

Nama inovasi: WARNOTO — Warehouse Intelligent Control for Transmission
Operation. Aplikasi web digitalisasi gudang PT PLN (Persero), dikembangkan dan
dipakai di UPT Surabaya (Gudang Ketintang), di bawah UIT Jawa Bagian Timur dan
Bali, serta sudah menjangkau lintas UPT/UIT/ULTG.

Masalah yang diselesaikan: pencatatan stok material transmisi dan dokumen TUG
(Tata Usaha Gudang) masih berbasis kertas dan spreadsheet, penerimaan/pemakaian/
pengembalian/mutasi tersebar di banyak berkas, stok kritis dan kapasitas gudang
tidak terlihat real-time, dan jejak siapa mengajukan/menyetujui sulit ditelusuri.

Ruang lingkup fungsional (menu yang benar-benar ada):
- Dashboard bertingkat: Eksekutif (Manager), Operasional (Asman), Gudang (Admin)
- Data Stok, Kapasitas Gudang, Master Data, Peta Gudang
- TUG digital lengkap: TUG-3/4 terima barang baru, TUG-5 permintaan barang
  (Slip Reservasi Material untuk ULTG), TUG-8 kirim ke unit PLN lain,
  TUG-9 pengeluaran/pemakaian, TUG-10 barang kembali/retur,
  TUG-15 laporan mutasi stok — semua bisa dicetak jadi PDF resmi
- Approval berjenjang dengan badge jumlah pending (contoh TUG-3: TL → Manager → Asman)
- Stock Opname dan Stock Count (rekonsiliasi SAP vs fisik)
- ATTB (penghapusan aset material) dan Inspeksi Material
- Alat Berat: monitoring alat angkat/angkut multi-UPT, peminjaman antar-UPT
  dengan approval Asman pemilik, reminder overdue, histori peminjaman
- Forecast Stok, Material Cadang, Rekomendasi Pengadaan
- Rencana Kedatangan barang
- Penilaian Maturity gudang (audit 5S/maturity) dengan bukti foto ke Google Drive
- "Pak War" — asisten AI gudang
- Migrasi data stok SAP/Non-SAP dan histori TUG-15
- Audit Log dan Matrix Izin per-role yang bisa diatur admin

Unsur yang membedakan dari pengelolaan gudang biasa (pakai ini sebagai inti
"apa yang inovatif"):
1. Scoping 3-tier tunggal — UPT melihat unitnya sendiri, UIT melihat agregat
   gabungan UPT di bawahnya, Pusat melihat nasional. Satu sumber kebenaran
   cakupan data untuk seluruh layar, sehingga tidak ada kebocoran data
   antar-UPT dan tidak perlu aplikasi terpisah per jenjang.
2. Dua mesin forecast digabung menjadi satu usulan beli: (a) statistik ROP/ROQ
   ditambah prediksi machine learning (Prophet) untuk material yang rutin
   bertransaksi, dan (b) Material Cadang berbasis Poisson service-level per
   kelas ABC ditambah Health Index untuk spare kritis yang jarang bergerak.
   Gap dari kedua mesin menyatu jadi satu daftar rekomendasi pengadaan.
3. Review-first: setiap aksi tulis (misalnya apply minimum qty) melewati
   pengajuan lalu approval Asman. Tidak ada aksi turunan otomatis — sistem
   mengusulkan, manusia memutuskan.
4. Angka deterministik dulu, AI belakangan: seluruh perhitungan resmi (gap,
   ROP, Health Index) dihitung lokal dan dapat diaudit. AI hanya lapisan
   insight/narasi, tidak pernah menulis angka resmi.
5. Bot Telegram ber-RAG untuk tanya-jawab stok tanpa membuka aplikasi, dengan
   whitelist pengguna dan log percakapan.
6. Scan QR/barcode multi-device lewat halaman publik tanpa login — banyak
   petugas bisa scan bersamaan tanpa bentrok.
7. Dokumen TUG resmi tercetak otomatis jadi PDF dari data transaksi, jadi
   digitalisasi tidak memutus format administrasi yang berlaku.

Teknologi dan tata kelola:
- React 18 + Vite + Tailwind di sisi depan; Supabase (PostgreSQL + Auth +
  Storage + Edge Functions) di sisi belakang.
- Supabase di-self-host di sebuah mini PC milik unit (domain warnoto.com),
  bukan berlangganan cloud — biaya lisensi rendah, data tetap di lingkungan PLN.
  Backup pg_dump tiap jam, backup auth/storage harian, dan mirror ke disk kedua.
- Keamanan: Supabase Auth (tanpa password hardcoded), Row Level Security di 33
  tabel, hanya 3 tabel yang boleh dibaca publik demi fitur scan QR.
- 13 level hak akses dalam 3 tier: UPT (ADMIN, TL, ASMAN, MANAGER, ADMIN_ULTG,
  MGR_ULTG), UIT (ADMIN_UIT, ASMAN_LOG_UIT, MGR_LOGISTIK_UIT), Pusat
  (ADMIN_LOG_PUSAT), ditambah PENGADAAN, VIEWER, SUPERADMIN.
- AI: embedding Cohere untuk pencarian semantik dan pencarian material lewat
  foto, LLM Groq untuk jawaban bot dan AI Insight, dengan fallback perhitungan
  lokal deterministik bila layanan AI tidak tersedia.
- OCR (Tesseract) untuk membaca denah gudang; import/export Excel; integrasi
  referensi katalog SAP (MARA).
- Dikembangkan mandiri oleh staf gudang, bukan pengadaan vendor.

Angka nyata dari sistem yang boleh dipakai (ini terverifikasi, bukan karangan;
tandai sebagai "per Agustus 2026"):
- 49 tabel database, 62 komponen antarmuka.
- Master katalog material tumbuh dari 427 menjadi 752 item setelah registrasi
  325 katalog peralatan (CT, CB, PT, DS, LA, Trafo) dari data gangguan HAR.
- Dari 993 material pada data gangguan HAR, hanya 3 yang cocok dengan katalog
  gudang sebelum program registrasi katalog dijalankan — bukti nyata bahwa
  penamaan material sebelumnya tidak terstandardisasi.
- Nilai persediaan yang terpantau di dashboard: Rp 7,55 miliar.
- Akurasi Stock Count SAP vs fisik pada sesi terakhir: 95%.
- 6 UPT terdaftar di bawah 1 UIT (Jawa Bagian Timur dan Bali).

## Aturan angka — PALING PENTING

- Jangan pernah mengarang angka. Kalau sebuah angka tidak saya berikan di blok
  DATA SAYA, tulis sebagai placeholder yang mencolok di dalam slide, contoh:
  [BASELINE: __ jam/transaksi], [TARGET: __ %], [ESTIMASI: Rp __ juta/tahun].
- Setelah file selesai, tampilkan checklist "Data yang harus diisi Widi" berisi
  seluruh placeholder yang kamu pakai beserta letak slide-nya.
- Kalau kamu menuliskan asumsi perhitungan, tulis asumsinya secara terbuka di
  speaker notes, jangan disembunyikan di dalam angka.
- Angka berikut TIDAK ADA datanya dan tidak boleh kamu tebak dalam bentuk apa
  pun: jumlah pengguna aktif, jumlah transaksi TUG per bulan, jumlah ULTG,
  jumlah gudang yang sudah dipakai produksi, penghematan waktu, penghematan
  biaya, dan segala perbandingan dengan aplikasi lain. Semua itu wajib jadi
  placeholder.
- Angka yang boleh dipakai apa adanya hanya yang tercantum di daftar "Angka
  nyata dari sistem" di atas dan yang saya isi di blok DATA SAYA.

## Isi tiap slide

Slide 1 — Problem/Opportunity Statement
Jawab "Why change?". Susun dengan alur: Masalah/Peluang → Dampak → Risiko jika
tidak diatasi. Sebutkan kondisi existing (baseline) pengelolaan gudang manual
berbasis kertas/spreadsheet, data masalahnya secara kuantitatif (pakai
placeholder), dan dampaknya ke biaya, kinerja, K3L, dan keandalan pasokan
material transmisi. Hindari narasi umum seperti "untuk meningkatkan kinerja".

Slide 2 — Proposed Solution
Jelaskan mekanisme solusi dan apa yang berubah dari proses existing: sistem
baru, SOP baru, alat apa yang terlibat. Sertakan diagram sederhana
Sebelum → Sesudah sebagai bentuk (shape) PowerPoint, bukan gambar eksternal.
Tekankan dua hal: apa yang berbeda dari kondisi existing, dan apa unsur
inovatifnya (ambil dari 6 poin pembeda di atas). Tidak perlu detail engineering.

Slide 3 — Potensi Dampak
Tampilkan dampak finansial (estimasi), operasional, K3L, dan ke pelanggan
internal. Sajikan perbandingan sebelum–sesudah dalam tabel 4 kolom:
Indikator | Baseline | Target | Estimasi Dampak.
Isi indikatornya dengan hal yang memang diukur aplikasi ini, misalnya waktu
pencarian material, akurasi stok, durasi stock opname, nilai stok mati/slow
moving, ketepatan usulan pengadaan. Nilainya pakai placeholder.

Slide 4 — Potensi Replikasi dan/atau Komersialisasi
Dua kolom.
Kiri (wajib) POTENSI REPLIKASI: apakah bisa diterapkan di unit lain, apa syarat
penerapannya, estimasi dampak jika direplikasi nasional, apakah butuh
modifikasi besar. Manfaatkan fakta bahwa scoping 3-tier UPT/UIT/Pusat sudah
built-in sehingga replikasi ke UPT lain tidak butuh perubahan arsitektur, dan
self-host membuat biaya per unit rendah.
Kanan (jika relevan) POTENSI KOMERSIALISASI: kemungkinan menjadi produk/jasa,
skema sederhana (internal deployment, lisensi, kemitraan). Cukup potensi yang
logis dan realistis, bukan business plan.

Slide 5 — Tim Inovasi
Tabel dengan kolom: Nama | Jabatan | Peran dalam Inovasi | Kompetensi Relevan.
Kalau saya tidak mengisi anggota tim, buat tabel kosong 4 baris agar saya isi
sendiri.

## Aturan desain

- Rasio 16:9, identitas PT PLN: biru korporat sebagai warna utama, aksen
  turquoise seperti template Danantara di lampiran, latar putih/gradasi terang.
- Judul slide besar dan tebal, ada garis aksen horizontal di bawah judul
  seperti template.
- Maksimal sekitar 6 bullet per slide, satu bullet satu baris, tanpa paragraf
  panjang. Ukuran font badan slide minimal 18pt agar terbaca dari jauh.
- Konsisten: satu master layout, jangan tiap slide beda gaya.
- Sisakan ruang kosong yang cukup; jangan penuhi slide sampai mepet tepi.

## Format keluaran

1. Buat file .pptx memakai python-pptx, beri nama
   WARNOTO_Inovasi_Danantara.pptx, lalu berikan link unduhnya.
2. Tambahkan speaker notes di tiap slide: naskah bicara singkat 3–5 kalimat
   plus asumsi perhitungan kalau ada.
3. Terakhir, tampilkan checklist "Data yang harus diisi Widi".
````
