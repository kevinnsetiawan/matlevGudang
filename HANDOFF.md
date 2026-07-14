# HANDOFF — WARNOTO

**Vendor aktif terakhir:** Codex | **Update:** 2026-07-14 23:45

## Tujuan / benang merah
WARNOTO adalah aplikasi gudang PLN (React, Vite 4, Supabase). Fokus: penyempurnaan UI bertahap dan migrasi Non-SAP UPT Surabaya secara review-first, bukan redesign besar.

## Keputusan arsitektur
- `App.jsx` masih besar; split internal ditunda sampai user menyetujui.
- Supabase `tadxodrzoquugnsyejld`; perubahan skema harus diusulkan dulu. Jangan drop `wa_sync_status`.
- Tailwind v4 via PostCSS, preflight off. Deploy hanya `git push main`.
- Sidebar: desktop 260/76px, auto-compact <=1120px, drawer mobile <=768px. Top bar navy menjadi satu-satunya header halaman (eyebrow + judul dinamis) dan memuat dropdown akun; ikon SVG putih, warna/logo PLN/font lama tetap.
- Alur bisnis review-first; jangan membuat aksi turunan atau auto-approve tanpa persetujuan.

## Status sekarang
- **Selesai:** UI shell responsif; ATTB/Alat Berat/Approval simetris; dashboard terpadu. Kapasitas Gudang dikembalikan ke dekat Data Stok dan jalur datanya diperjelas. Navigasi/form TUG diperbesar dan memakai tab proses terpadu. AI Agent menjadi Pak War dengan welcome screen dan pertanyaan populer siap-klik. Warna, font, dan logo PLN dipertahankan. Build produksi lulus.
- **Sedang dikerjakan:** migrasi Non-SAP UPT Surabaya sudah diaudit: 40 baris (34 kuat, 5 lemah, 1 tanpa kandidat); belum ada sesi opname atau write ke Supabase.
- **Langkah berikutnya:** user review Kapasitas Gudang, tab proses TUG, dan Pak War; koreksi berdasarkan feedback, lalu lanjut migrasi Non-SAP secara manual review-first.
- **Blocker:** browser agent dibatasi untuk localhost; dev lokal aktif di `http://127.0.0.1:3001/index.html`.

## Perintah verifikasi
- `npm run dev` → port 3001
- `npm run build`
- Deploy: `git push main`

## Riwayat shift (maksimal 2)
- 2026-07-14 Codex: dashboard, modul operasional, TUG, Data/Master, Approval, dan AI Agent dipoles; build lulus.
- 2026-07-14 Codex: Kapasitas dipulihkan, TUG diperbesar, AI Agent diubah menjadi Pak War dengan prompt populer; build lulus.
