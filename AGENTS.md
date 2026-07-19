# WARNOTO — panduan untuk Codex (Vendor B)

Ikuti kontrak dua-vendor di `~/.codex/AGENTS.md`: **baca `HANDOFF.md` dulu** dan lanjutkan dari "Langkah berikutnya".

## Aturan routing agent
- Jika ragu memilih `worker` atau `senior`, wajib prioritaskan `worker` lebih dulu. `senior` hanya dipakai setelah scope/risiko terbukti kompleks atau `worker` mengeskalasi karena pekerjaannya melampaui levelnya; jangan default ke `senior` hanya karena agen utama bingung menentukan level.

## Aturan HANDOFF ringkas (override khusus project ini)
- Jangan pernah mengedit atau memperbarui `HANDOFF.md` secara otomatis. Agen utama wajib meminta dan memperoleh persetujuan pengguna terlebih dahulu, termasuk setelah tahap signifikan dan di akhir sesi. Aturan persetujuan ini mengoverride semua aturan pembaruan `HANDOFF.md` otomatis yang bertentangan.
- `HANDOFF.md` hanya berisi benang merah: tujuan, keputusan yang masih mengikat, status singkat, langkah berikutnya, blocker, dan perintah verifikasi.
- Perbarui hanya bila status/keputusan/blocker/langkah berikutnya berubah secara material; jangan mencatat setiap sub-langkah.
- Riwayat hanya ditambah saat pergantian vendor/shift. Simpan maksimal **2 entri shift terakhir**; sebelum menambah entri ketiga, hapus entri tertua.
- Satu entri riwayat maksimal satu baris ringkas. Aturan ini menggantikan ketentuan log append-only/detail pada kontrak global untuk project WARNOTO.

## Fakta project yang mengikat
- Aplikasi gudang PLN (React + Vite 4 + Supabase). Entry: `App.jsx` (masih besar) + komponen hasil split di `src/`.
- Dev lokal: `npm run dev` — port **3001**.
- Deploy: **git push ke main** (auto-deploy Vercel). JANGAN pakai `vercel --prod` (folder `outputs/` berat ikut terupload).
- Supabase project: `tadxodrzoquugnsyejld`. Perubahan skema diusulkan dulu, jangan langsung eksekusi tanpa konfirmasi user.
- Tabel `wa_sync_status` MASIH DIPAKAI bot Telegram — jangan di-drop meski fitur WA sudah dihapus.
- Tailwind v4 via `@tailwindcss/postcss`, preflight OFF; interaktivitas via CSS global element-selector, bukan className.
- Gaya kerja: alur review-first / persetujuan manual; jangan auto-membuat aksi turunan tanpa persetujuan user.
