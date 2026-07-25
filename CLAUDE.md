# WARNOTO — CLAUDE.md project

**Benang merah lintas-vendor ada di `HANDOFF.md` — WAJIB baca di awal sesi dan lanjutkan dari "Langkah berikutnya".**

`HANDOFF.md` harus ringkas dan diperbarui hanya saat status material berubah. Riwayat hanya untuk pergantian vendor/shift, maksimal 2 entri terakhir; saat menambah entri ketiga, hapus yang tertua. Jangan membuat log per sub-langkah.

## Tujuan project
Aplikasi manajemen gudang PLN (React + Vite 4 + Supabase, deploy Vercel).

## Fakta mengikat (jangan dilanggar)
- Dev lokal: `npm run dev` — port **3001**. Build: `npm run build`.
- Deploy: **git push ke main** (auto Vercel). JANGAN `vercel --prod` (folder `outputs/` berat ikut terupload).
- Supabase project `tadxodrzoquugnsyejld`. Perubahan skema = proposal dulu, eksekusi hanya setelah konfirmasi user.
- Tabel `wa_sync_status` MASIH dipakai bot Telegram — jangan di-drop meski fitur WA sudah dihapus.
- Tailwind v4 via `@tailwindcss/postcss` (bukan plugin Vite), preflight OFF; interaktivitas via CSS global element-selector, bukan className.
- `App.jsx` sudah di-refactor (2026-07-25, ~9.320→~5.539 baris) — semua JSX per-tab/modal yang aman dipisah sudah diekstrak ke `src/components/*.jsx` (murni relokasi, prop-drilling dari `PLNWarehouse()`, tidak ada logic yang berubah). Sisa ~5.000 baris di `PLNWarehouse()` adalah state (`useState`) + handler function — user MEMUTUSKAN CUKUP di titik ini, TIDAK melanjutkan ke ekstraksi logic/handler (custom hooks) karena risikonya lebih tinggi tanpa verifikasi visual browser. Kalau nanti mau lanjut ke situ, itu keputusan terpisah, bukan otomatis lanjutan dari sesi ini.
- Alur produk review-first / persetujuan manual; jangan auto-membuat aksi turunan.

## Status pekerjaan
Lihat bagian "Status sekarang" di `HANDOFF.md` (satu-satunya sumber status, supaya tidak ada dua versi).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- **Awal sesi/project**: sebelum mulai kerja, baca dulu graphify (mis. `graphify query "<ringkasan project>"` atau GRAPH_REPORT.md) supaya orientasi konsisten dan terstruktur, apapun model/vendor yang sedang dipakai (Fable/Opus/Sonnet/Codex).
- Nanya soal codebase → `graphify query "<pertanyaan>"` — lebih hemat daripada grep manual, hasilnya subgraph relevan saja.
- Nanya relasi antar dua bagian kode → `graphify path "<A>" "<B>"`. Untuk konsep spesifik → `graphify explain "<concept>"`.
- Jika graphify-out/wiki/index.md ada, pakai itu untuk navigasi luas alih-alih baca source mentah.
- Baca graphify-out/GRAPH_REPORT.md hanya untuk review arsitektur luas atau saat query/path/explain belum cukup.
- **Setelah edit kode** → jalankan `graphify update .` supaya graph tetap sinkron (AST-only, tidak kena biaya API).
