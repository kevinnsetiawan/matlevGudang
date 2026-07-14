# WARNOTO — CLAUDE.md project

**Benang merah lintas-vendor ada di `HANDOFF.md` — WAJIB baca di awal sesi, perbarui setelah tiap tahap signifikan.**

## Tujuan project
Aplikasi manajemen gudang PLN (React + Vite 4 + Supabase, deploy Vercel).

## Fakta mengikat (jangan dilanggar)
- Dev lokal: `npm run dev` — port **3001**. Build: `npm run build`.
- Deploy: **git push ke main** (auto Vercel). JANGAN `vercel --prod` (folder `outputs/` berat ikut terupload).
- Supabase project `tadxodrzoquugnsyejld`. Perubahan skema = proposal dulu, eksekusi hanya setelah konfirmasi user.
- Tabel `wa_sync_status` MASIH dipakai bot Telegram — jangan di-drop meski fitur WA sudah dihapus.
- Tailwind v4 via `@tailwindcss/postcss` (bukan plugin Vite), preflight OFF; interaktivitas via CSS global element-selector, bukan className.
- `App.jsx` masih besar (~7.800 baris); split internal `PLNWarehouse` DITUNDA menunggu keputusan user.
- Alur produk review-first / persetujuan manual; jangan auto-membuat aksi turunan.

## Status pekerjaan
Lihat bagian "Status sekarang" di `HANDOFF.md` (satu-satunya sumber status, supaya tidak ada dua versi).
