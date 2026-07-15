# HANDOFF — WARNOTO

**Vendor aktif terakhir:** Codex | **Update:** 2026-07-15 12:03

## Tujuan / benang merah
WARNOTO adalah aplikasi gudang PLN (React, Vite 4, Supabase). Fokus: penyempurnaan UI bertahap dan migrasi Non-SAP UPT Surabaya secara review-first, bukan redesign besar.

## Keputusan arsitektur
- `App.jsx` masih besar; split internal ditunda sampai user menyetujui.
- Supabase `tadxodrzoquugnsyejld`; perubahan skema harus diusulkan dulu. Jangan drop `wa_sync_status`.
- Tailwind v4 via PostCSS, preflight off. Deploy hanya `git push main`.
- Sidebar: desktop 260/76px, drawer mobile <=768px; toggle di footer sidebar (lebar = « pojok kanan bawah, compact = »» tengah).
- Alur bisnis review-first; jangan membuat aksi turunan atau auto-approve tanpa persetujuan.
- Pak War: Groq (`llama-3.3-70b-versatile`), key selalu di-`.trim()` (pernah 401 gara-gara spasi bawaan `vercel env pull`); fallback data lokal saat AI eksternal gagal. Gaya jawaban humanis-korporat, jawab yang ditanya saja, list = `- **Nama** [kode] — stok X unit · Lokasi: Y`, dirender kartu `.ai-richlist`.
- Tipografi: floor 12px di semua CSS + inline style (kecuali ScanPublicView 10.5px, halaman print). JANGAN menambah teks <12px.
- Banner KPI seragam via kelas bersama `.kpi-banner` di `src/index.css` (proporsi compact seperti `.dashboard-maturity`: min-height 104px, radius 14px, angka 22px/800, gradient navy). Dipakai: Approval, Kapasitas Gudang, Forecast Stok, TUG; OperationsHero (Alat Berat + ATTB) diselaraskan proporsinya di `src/styles/operations.css`.
- Foto satpam & foto alat berat: data URL terkompres (satpam max 400px/±120KB via `compressImage` dari `src/lib/supabaseSync.js`) disimpan inline di jsonb master — TANPA perubahan skema.

## Status sekarang
- **Selesai & dipublikasikan ke `main`:** commit terdahulu `efb9fca` (Pak War humanis + fix 401 Groq), `6a09f83` (floor font 12px + toggle sidebar footer), serta satu commit fungsional shift Codex ini yang mencakup:
  1. Foto satpam (modal add/edit + avatar 44px di daftar Master Data → Satpam; helper `handleSatpamFoto` di App.jsx ~2456).
  2. Alat Berat: mode switch "Daftar Alat"|"Peminjaman & Histori" (+badge pending), dualisme filter dihapus (chip kondisi → dropdown di baris kategori).
  3. Banner KPI navy di 6 permukaan sudah memakai tipografi compact (angka 22px/800, label 12px lebih ringan, separator halus) + floor 12px `operations.css`.
  4. Kapasitas Gudang: blok asli `Warehouse capacity / Data Kapasitas Gudang / Laporan...` menjadi header banner navy; tujuh KPI ditumpuk pada baris di bawahnya. Banner berada sebelum switch dan tetap tampil di Ringkasan/Data/Peta, responsif desktop/tablet/mobile.
  5. Forecast Stok: banner dipindah sebelum switch dan tetap tampil di Forecast/Material Cadang; font seluruh subtree diselaraskan ke Data Stok (`Inter`, system-ui), termasuk kontrol dan tabel.
  6. TUG: command bar putih menjadi banner navy sebelum switch proses/status; KPI memakai total/status dokumen jenis aktif, sedangkan TUG-15 context-only. Switch berupa kartu klik yang eksplisit (`Sedang dibuka`/`Klik untuk buka`); CTA berada di action bar setelah switch dengan guard role tetap.
  `npm run build` LULUS atas seluruh perubahan.
- **Sedang dikerjakan / terputus:** verifikasi end-to-end foto satpam ke Supabase — kode sync sudah diverifikasi benar, tabel `satpam` berisi 2 baris (SP001 Robby, SP002 Yudi) belum ada foto karena user belum sempat upload dari UI.
- **Langkah berikutnya (urut, bisa langsung dieksekusi):**
  1. Minta user reload `http://localhost:3001` dan uji visual: tipografi compact semua banner termasuk TUG; banner Kapasitas/Forecast/TUG tetap tampil saat berpindah switch; font Forecast selaras Data Stok; filter alat berat; upload 1 foto satpam.
  2. Setelah user upload foto, verifikasi DB: `select id, data->>'name', (data?'foto'), length(data->>'foto') from satpam;` — harus `punya_foto=true` di baris yang diedit.
  3. Lanjut migrasi Non-SAP UPT Surabaya review-first: 40 baris hasil audit (34 kuat, 5 lemah, 1 tanpa kandidat), dieksekusi via UI Opname Non-SAP → Upload Usulan Pencocokan — BUKAN write langsung ke Supabase.
- **Blocker:** tidak ada. Dev server aktif port 3001 (Vite listen IPv6 — pakai `http://localhost:3001`, bukan 127.0.0.1). Catatan: nilai `VITE_GROQ_API_KEY` di dashboard Vercel kemungkinan masih berspasi (kode sudah kebal via trim; bersihkan kapan-kapan, opsional).

## Perintah verifikasi
- `npm run dev` → port 3001 (akses via `localhost`)
- `npm run build`
- Deploy: `git push main`

## Riwayat shift (maksimal 2)
- 2026-07-15 11:08 Claude: Pak War online pulih (fix spasi key Groq) + format humanis; floor font 12px; toggle sidebar footer; foto satpam; mode switch & simplifikasi filter Alat Berat; banner KPI navy `.kpi-banner` 5 halaman (3 item terakhir belum commit) — serah-terima ke Codex.
- 2026-07-15 12:03 Codex: foto satpam, mode Alat Berat, banner compact 6 halaman, serta UX Kapasitas/Forecast/TUG diselesaikan, build lulus, dan dipublikasikan ke `main`.
