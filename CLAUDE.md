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
- `App.jsx` masih besar (~7.800 baris); split internal `PLNWarehouse` DITUNDA menunggu keputusan user.
- Alur produk review-first / persetujuan manual; jangan auto-membuat aksi turunan.

## Status pekerjaan
Lihat bagian "Status sekarang" di `HANDOFF.md` (satu-satunya sumber status, supaya tidak ada dua versi).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
