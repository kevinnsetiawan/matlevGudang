# WARNOTO — panduan untuk Codex (Vendor B)

Ikuti kontrak dua-vendor di `~/.codex/AGENTS.md`: **baca `HANDOFF.md` dulu**, lanjutkan dari "Langkah berikutnya", perbarui HANDOFF.md setelah tiap tahap.

## Fakta project yang mengikat
- Aplikasi gudang PLN (React + Vite 4 + Supabase). Entry: `App.jsx` (masih besar) + komponen hasil split di `src/`.
- Dev lokal: `npm run dev` — port **3001**.
- Deploy: **git push ke main** (auto-deploy Vercel). JANGAN pakai `vercel --prod` (folder `outputs/` berat ikut terupload).
- Supabase project: `tadxodrzoquugnsyejld`. Perubahan skema diusulkan dulu, jangan langsung eksekusi tanpa konfirmasi user.
- Tabel `wa_sync_status` MASIH DIPAKAI bot Telegram — jangan di-drop meski fitur WA sudah dihapus.
- Tailwind v4 via `@tailwindcss/postcss`, preflight OFF; interaktivitas via CSS global element-selector, bukan className.
- Gaya kerja: alur review-first / persetujuan manual; jangan auto-membuat aksi turunan tanpa persetujuan user.
