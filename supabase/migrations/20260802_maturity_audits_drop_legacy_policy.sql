-- PERBAIKAN — buang policy permisif lama di `maturity_audits`.
--
-- Kesalahan di 20260802_maturity_approval_chain.sql: daftar `drop policy` di sana
-- memakai nama policy milik GELOMBANG B ("Maturity audits read scoped" dst),
-- padahal GELOMBANG B belum pernah di-apply sehingga nama itu tidak pernah ada.
-- Nama policy yang SUNGGUHAN ada sejak awal adalah "Authenticated read/write
-- maturity_audits" — dan keduanya lolos tidak terhapus.
--
-- Dampaknya nyata: policy RLS bersifat OR, jadi selama "Authenticated write
-- maturity_audits" (FOR ALL, syaratnya cuma auth.role()='authenticated') masih
-- terpasang, siapa pun yang login tetap bisa INSERT/UPDATE/DELETE audit dan
-- policy berjenjang yang baru sama sekali tidak membatasi apa pun.
--
-- Idempoten. Aman dijalankan berulang.

drop policy if exists "Authenticated read maturity_audits" on public.maturity_audits;
drop policy if exists "Authenticated write maturity_audits" on public.maturity_audits;

-- Sesudah ini `maturity_audits` hanya punya:
--   Maturity audits read chain      (SELECT, UPT sendiri / peninjau UIT / Pusat)
--   Maturity audits insert upt      (INSERT, ADMIN/TL UPT sendiri)
--   Maturity audits update by stage (UPDATE, pelaku ditentukan status baris)
-- TIDAK ada policy DELETE — angka audit tidak dihapus lewat aplikasi. Tabelnya
-- 0 baris saat ini, jadi tidak ada fitur hapus yang benar-benar terdampak.
