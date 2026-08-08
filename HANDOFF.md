# HANDOFF — WARNOTO

**Vendor aktif terakhir:** Claude (Vendor A) | **Update:** 2026-08-07

## Tujuan / benang merah
WARNOTO = aplikasi gudang PLN (React, Vite 4, Supabase self-host, deploy Vercel). Fokus: penyempurnaan UI bertahap + isolasi multi-UPT review-first, bukan redesign besar.

## Keputusan arsitektur (mengikat)

### Infrastruktur & data
- **Production = Supabase SELF-HOST** di `minipc-gudang` (domain `warnoto.com`), migrasi dari Cloud (`tadxodrzoquugnsyejld`) selesai 2026-07-22. Cloud lama sengaja DIBIARKAN HIDUP sebagai jaring rollback tapi **aplikasi TIDAK membacanya**. Akses DB: `ssh minipc-gudang` + `docker exec supabase-db psql`. **Perubahan skema = proposal dulu, eksekusi hanya setelah konfirmasi user.** JANGAN drop `wa_sync_status` (masih dipakai bot Telegram).
- **Stack docker-compose di minipc-gudang (6, jangan saling-tumpuk edit):** `vps-backup` (pg_dump `-Fc` public tiap jam + `backup-auth-storage.sh` harian 02:00 schema auth/storage/vault + `mirror-to-disk2.sh` ke `/mnt/backup2`); **`vps-dr-stack` = PRODUCTION AKTIF sesungguhnya** (koreksi 2026-07-28 — bukan "standby" seperti catatan lama; traffic production benar-benar lewat sini, jangan dimatikan); `vps-monitor` (healthcheck GoTrue, alert Telegram); `vps-observability` (Prometheus/Grafana/Alertmanager, LAN-only); `vps-staging` (Caddy static); `vps-remote-ssh` (tunnel Cloudflare SSH). SSH host: `minipc-gudang` (LAN 10.91.21.231) / `minipc-gudang-home` (tunnel). Disk root 879GB, `/mnt/backup2` 445GB. Supabase self-host TIDAK punya PITR — dump ini jaring utama.
- **JANGAN test via `curl` langsung ke `/rest/v1/*` di `warnoto.com` dengan ID mirip data asli** (pernah menimpa baris stok produksi, 2026-07-22). Pakai prefix `TEST-` konsisten atau container Postgres scratch terpisah.
- **Domain:** akses produksi = `pln.warnoto.com` (`warnoto.vercel.app` redirect 308). Apex `warnoto.com` = endpoint DB self-host (`VITE_SUPABASE_URL`, Cloudflare Tunnel) — **JANGAN disentuh**.
- **Realtime Data Stok self-host aktif** — publication `supabase_realtime` berisi hanya `public.stocks`.
- Trigger `on_auth_user_created` (auth.users→stub profiles) sudah di-re-create di self-host (fix akun "setengah jadi", 2026-07-30).

### Keamanan / role
- **HIRARKI PERAN RESMI (user 2026-08-02, mengikat, jangan ditafsir ulang):**
  - **UPT (lihat 1 UPT sendiri):** `ADMIN`, `TL`, `ASMAN`, `MANAGER`, `MGR_ULTG`, `ADMIN_ULTG`. Tiap UPT tepat SATU MANAGER. **MANAGER BUKAN Pusat.**
  - **UIT (lihat semua UPT):** `ADMIN_UIT`, `ASMAN_LOG_UIT`, `MGR_LOGISTIK_UIT`.
  - **Pusat (lihat semua UPT+UIT):** `ADMIN_LOG_PUSAT`.
- **GOTCHA role baru:** `can()` (`src/lib/perms.js`) return `false` utk role tak terdaftar di `DEFAULT_PERMS` → app kosong tanpa menu. Titik daftar role yang WAJIB sinkron: `roles.js`, `perms.js` (MATRIX_ROLES+DEFAULT_PERMS), `App.jsx` (UIT_ROLE_QUOTA + deteksi form scoped-UIT + `canSwitchMaturityUpt`), `AkunModals.jsx`, `scripts/bulk_create_users.mjs`, `schema.sql`, + 2 Edge Function (`admin-create-user`, `maturity-drive`) yang perlu **REDEPLOY terpisah**.
- **Helper scope 3-tier:** `getScopeUptIds(user,uptList)` → `null` (Pusat/SUPERADMIN=semua) | array upt id (UIT: semua UPT di `uitId`; UPT: `[uptId]`). Sumber tunggal `dataScope` di App.jsx, `scoped*` di-oper ke tab.
- Alur bisnis **review-first**; jangan auto-approve atau buat aksi turunan tanpa persetujuan.

### Fitur canonical
- **TUG canonical hanya TUG-8/TUG-9** (tabel/RPC self-host, review-first Admin→TL→Asman, nomor server dari counter UPT). **TUG-15/Laporan di luar scope canonical.** TUG legacy hanya baseline, tanpa replay stok.
- **Template PDF TUG-3/4/5/10 seragam gaya AppSheet TUG-9** (`docBuilders.js`). JANGAN ambil perubahan `App.jsx` dari PR Kevin (menghapus guard Mode Demo / tombol "Isi Data Contoh" ke form resmi).
- **Maturity canonical self-host:** `maturity_assessments`, `maturity_audits`, `maturity_audit_history` (unik per upt/tahun/semester), `maturity_5s_assessments` (append-only, authenticated hanya SELECT+INSERT). Evidence audit = Google Drive binary + Supabase metadata; root folder `UPT Surabaya Apps` (`13FFto2pzVRLq4LBpRaJsIyGa2Bk5gaYD`), OAuth cred hanya di Edge Runtime MiniPC. Scope dari `maturity_audits.upt_id`; UIT hanya UPT se-`uit_id`; audit FINAL immutable. Mode Demo Maturity sengaja dimatikan.
- **Inspeksi Material Cadang:** self-host canonical + tenant boundary UPT/gudang ditegakkan di UI & DB, UPT/Manager dari profil login, runtime non-E2E menolak endpoint selain `warnoto.com`. Struktur: parent `material_inspection_batches` + `batch_id` pada `material_inspections`, nomor server `000001/BA-INSPEKSI/UPT-SBY/07/2026`, tepat 2 foto/material, satu BA satu gudang. Migration security `20260802_material_inspection_multi_upt_security.sql` **sudah applied**.
- **Perubahan lokasi Data Stok oleh ADMIN:** dalam Gudang sama → langsung simpan; lintas Gudang → butuh approval TL (lokasi lama utuh sampai disetujui). TL lintas Gudang → butuh ASMAN. Dropdown Gudang memfilter Blok/Lokasi tujuan agar `gudangId`/`lokasiId` tak silang.
- **Forecast Stok:** gabung histori legacy TUG-15 (`legacy_history_archive`) ke analisa AI, dicocokkan per katalog via `src/lib/normalizeKatalogCode.js`. Query legacy di try/catch TERPISAH (gagal ≠ gagal analisa). Cap histori -18 bulan. Metrik dihitung kode dulu lalu disisipkan ke prompt Groq; ada fallback lokal saat Groq gagal. Toast throttled saat auto-sync bot gagal.
- **Telegram** pakai Groq key hanya dari `.env` self-host (jangan taruh nilai di repo/HANDOFF). HTTP 400 parse-entity → retry 1x plain text.

### Proses & tooling
- **Commit, push, deploy = tahap TERPISAH.** "kerjakan"/"lanjutkan"/"commit" BUKAN izin push. Push ke `main` (auto-Vercel) HANYA setelah user eksplisit bilang `push`/`deploy`. JANGAN `vercel --prod` (folder `outputs/` berat ikut).
- **Pembaruan `HANDOFF.md` wajib izin user dulu**; jangan otomatis.
- Tailwind v4 via PostCSS, preflight OFF; interaktivitas via CSS global element-selector.
- Sidebar desktop 260/76px, drawer mobile ≤768px.
- **`graphify`** = peta baca codebase (AST-only, lokal). Query dulu sebelum grep; `graphify update .` wajib setelah edit kode.
- **Classifier auto-mode memblokir commit yang menyentuh `.claude/settings.json`** — user jalankan sendiri (via `!` prefix). Bukan bug, pembatasan keamanan.
- **Dashboard tab routing per role:** "Ringkasan & Kinerja" → `ExecOverview` (semua role); "Overview Gudang" → `DashboardManager`/`DashboardAsman`/`DashboardDefault` per role. Ubah 1 komponen → invisible ke role lain; kalau diminta "perbaiki overview gudang" cakup ketiganya.
- **Area ATTB UI** (`AttbTab.jsx`, `AttbDashboardSummary.jsx`, styling terkait) pernah diserahkan ke tim user — koordinasi dulu sebelum menyentuh.
- **App.jsx besar** (~6400 baris); ekstraksi internal PLNWarehouse ke custom hooks = keputusan berisiko, hanya jalan setelah persetujuan user + verifikasi browser.
- Vendor C = OpenCode Go (backup ke-3 setelah Claude→Codex→GLM, manual).

## Status sekarang

- **Filter per-UPT UI multi-UPT — DILENGKAPI & DI-PUSH (`e3ff9d1`, 2026-08-08).** Viewer UIT/Pusat kini punya dropdown filter per-UPT (pola `stockUptFilter` Data Stok, muncul hanya viewer multi-UPT) di TUG (`tugUptFilter`→`filteredTxns`+sub-tab TUG3/5/15), Alat Berat & ATTB (perluas `effectiveUptFilter` via `roleTier`), BA Inspeksi (`baUptFilter`). Banner Maturity: kotak Level sudah per-UPT (benar); switcher UPT dipaksa ke baris sendiri (`width:100%`) supaya Level tak geser. Maturity `maturity_assessments` memang NASIONAL (tak ada `upt_id`) — audit/5S/evidence-Drive semua per-UPT (dikonfirmasi). Opsi filter dari SCOPE viewer (`getScopeUptIds`), bukan data yang ada (UPT tanpa data tetap bisa dipilih).

- **Kapasitas → Peta Utilisasi — DI-COMMIT & DI-PUSH (`23ed584`, 2026-08-08).** Filter UPT peta (`petaUptFilter` by `gudang.uptId`, opsi dari `getScopeUptIds`, oper `uptList` ke KapasitasGudangTab). Fix stale: PetaGudangTab useEffect kosongkan `selectedGudangId` saat `gudangList` kosong (UPT tanpa gudang tak nyangkut sub-gudang UPT lain). Redesign toolbar: satukan selector jadi 1 panel berlabel drill-down (1.UPT → 2.Gudang → 3.Denah) + checkbox, hapus `capacity-filterbar` orphan. **Verifikasi browser OK (2026-08-08).**

- **Cari Foto (Data Stok) filter UPT — DIPERBAIKI & DI-PUSH (`f270f38`, 2026-08-08).** `runPhotoSearch` kini batasi hasil ke katalog yang punya stok dalam scope efektif / `stockUptFilter`. Dulu dua mode (nameplate & bentuk) abaikan scope. **Verifikasi browser OK (2026-08-08).**

- **Refactor App.jsx ke custom hooks — target ≤4500 baris (dari 6415). Tranche-1+2 DI-COMMIT (BELUM push, BELUM verifikasi browser tranche-2).** Tranche-1: domain Maturity → `src/hooks/useMaturity.jsx`. Tranche-2: domain OCR/denah+koordinat blok → `src/hooks/useDenahOcr.js`. App.jsx 6415→**5984** (−431). SISA ke ≤4500: **−1484** (~3-4 tranche lagi; domain antri: TUG/approval [terbesar], Capacity, Alat Berat, ATTB). **BLOCKER: akun Vendor A kena MONTHLY SPEND LIMIT** (raise di claude.ai/settings/usage) — tranche lanjut mungkin harus lewat Codex (Vendor B) atau setelah limit dinaikkan. Sebelum PUSH: user WAJIB verifikasi browser tranche-2 (Peta Utilisasi, upload denah Gudang/Sub Gudang, assign/reset koordinat blok). Domain OCR/denah+koordinat blok diekstrak ke `src/hooks/useDenahOcr.js` (state: `ocrSuggestions`, `ocrSuggestGudangId`, `ocrSuggestSubGudangId`, `denahLoading`, `denahSubLoading`; handler: `runOcrOnDenah`, `runOcrOnDenahSub`, `suggestKodeFromOcr`, `assignLokasiKoordinat(Sub)`, `resetLokasiKoordinat(Sub)`, `dismissOcrSuggestions`) — relokasi murni, nol logic berubah. Koreksi thd rencana awal: lib OCR asli adalah `tesseract.js` (`recognize as ocrRecognize`), BUKAN `ocrSpaceOCR`/`rag.js`. Destructure `useDenahOcr()` ditaruh di App.jsx tepat setelah `stateRef.current = {...}` (baris ~1076) — WAJIB setelah `stateRef` didefinisikan (dep) dan sebelum pemakaian render-body pertama (JSX `MasterDataTab`/`OcrSuggestGudangModal`/`GudangAddModal`). `npm run build` LULUS (~16s). App.jsx sekarang 5984 baris. Tranche-1 (Maturity→`useMaturity.jsx`) sebelumnya LULUS verifikasi browser user setelah 1 bug TDZ diperbaiki (destructure kurang tinggi, ketimpa pemakaian `stateRef.current`/dep-array di atasnya) — **aturan mutlak berlaku sejak itu:** sebelum taruh destructure hook baru, grep semua identifier domain di App.jsx, pastikan destructure ADA DI ATAS pemakaian render-body pertama (stateRef assignment, dep-array useEffect/useMemo, JSX); pemakaian di dalam closure/handler aman di mana saja. **SISA:** user verifikasi browser (Peta Utilisasi, upload denah Gudang/Sub Gudang, assign/reset koordinat blok via klik) sebelum lanjut tranche-3 atau commit.

- **Multi-UPT 3-tier SELESAI & diverifikasi user di browser, DI-PUSH ke `main` (2026-08-07).** Scoping UI + label tier (nasional→"PLN Pusat", UIT→kode "UIT JBM", UPT→nama UPT) + dokumen per-UPT (`docBuilders.js`: kop/PIC/ttd/tempat pakai NAMA UPT, nomor pakai KODE UPT). Data display discope (stok via `gudang.uptId`, TUG `scopedTxns`). Fix 403 seed gudang/lokasi (`aad4704`, seed DEFAULT hanya viewer nasional). RAG per-UPT: migration `20260807_rag_chunks_per_upt.sql` **DI-APPLY** (kolom `rag_chunks.upt_id`; RPC `match_rag_chunks(query_embedding, match_count, p_upts text[] default null)`, null=nasional). Tombol Sync KB kini utk ADMIN_LOG_PUSAT & role UIT. Filter UPT di Data Stok utk viewer multi-UPT (`c49c937`). Master `upt` lengkap 6 UPT (SBY/MLG/MDN/PBG/BLI/GRS, semua UIT-JBM). **SISA:** begitu UPT baru (Gresik dll) diisi gudang→lokasi→stok oleh adminnya, jalankan Sync KB dari akun nasional/UIT utk generate chunk RAG-nya. Bot Telegram masih 2-arg=nasional (fase 2: butuh `upt_id` di `tg_allowed_users`).

- **Gelombang 4c DI-APPLY ke production & TERVERIFIKASI (2026-08-08).** verify_gelombang4c.sql LULUS: GRANT tulis anon=0, SELECT publik tepat 3 (katalog/stock_current/tug15_history utk scan QR), tulis anon GAGAL (`permission denied warnoto_state`), storage INSERT/UPDATE publik=0, baca anon warnoto_state/forecast/scan_log=0. Code `8f455e1` (2026-08-06).** Menutup jalur tulis/baca `anon`. Akar masalah DI KODE: 3 fungsi sync (`syncTUG15ToSupabase`, `syncStockQtyToSupabase`, `syncFotoMaterialToSupabase` di `src/lib/supabaseSync.js`) mengirim anon key sbg `Authorization`, bukan token sesi — diperbaiki helper `authHeaders()` (apikey=anon, Authorization=session token, tanpa sesi melempar Error). Isi migration `20260806_tutup_tulis_anon_gelombang4c.sql`: cabut GRANT tulis anon seluruh public + `alter default privileges`; tulis `katalog`/`warnoto_state`→authenticated; hapus policy tulis publik `wa_sync_status`/`tg_agent_logs` (penulisnya Edge Function service_role, aman); baca `warnoto_state`/`forecast_predictions`/`stock_scan_log`→authenticated; storage buckets `material-photos`/`stock-photos`/`tug-photos` INSERT+UPDATE→authenticated. **SENGAJA tetap terbuka anon (jangan "dirapikan"):** baca `katalog`/`tug15_history`/`stock_current` + SELECT 3 bucket foto (dipakai scan QR publik `ScanPublicView.jsx`). **Temuan terbesar:** `warnoto_state.state_data` (blob seluruh state app) bisa dibaca tanpa login sebelum 4c.

- **Gelombang 4a DI-APPLY ke production & TERVERIFIKASI (2026-08-08).** `20260805_multi_upt_rls_gelombang4a.sql` (`d6f657e`). verify_gelombang4a.sql LULUS: sisa policy lama=0, scan QR hidup, VIEWER UPT-SBY 3/4/38/2, **ADMIN_LOG_PUSAT & ASMAN_LOG_UIT tug_transactions=3** (dulu 0 — bug buta total sembuh). Menutup `stock_current`/`tug15_history` tulis anon→authenticated (baca publik dipertahankan utk scan QR); fix BUG NYATA `tug_transactions` (UIT & ADMIN_LOG_PUSAT dulu buta total, 0 dari 3 txn) via `can_access_upt()`; jangkar UPT `tug_items`/`tug_approvals`/`stock_movements`. `tug_review_tokens` SENGAJA tak disentuh (policy `actor_id=auth.uid()` sudah lebih ketat).

- **Audit GRANT `anon` (2026-08-06, read-only):** role `anon` pegang GRANT tulis pada **33 tabel** public (yang menahan hanya RLS). Yang benar-benar bisa ditulis TANPA LOGIN hari ini: `katalog`, `stock_current`, `tug15_history`, `wa_sync_status`, `warnoto_state`, `tg_agent_logs`. 4a menutup `stock_current`+`tug15_history`, 4c menutup sisanya. Pengetatan GRANT (paling serius `katalog`) = gelombang terpisah, cek dulu apakah bot menulis via anon atau service_role sebelum ketatkan.

- **Gelombang 4b (BELUM mulai) — PERUBAHAN SKEMA, wajib proposal user dulu:** `profiles` (paling sensitif — jangan matikan login, jamin `id=auth.uid()` tetap baca profil sendiri, akun UIT/Pusat `upt_id` NULL tetap terbaca) + `stock_opname`/`stock_count` (butuh kolom `upt_id` baru + backfill dari jsonb `data->>'dibuatOleh'`/`uploadedBy`).

## Langkah berikutnya (urut, mengikat)

**Lanjutan multi-UPT UI — SELESAI & verifikasi browser OK (`23ed584`, `f270f38`, 2026-08-08):**
1. ✅ Peta Utilisasi filter UPT — committed + verified.
2. ✅ Cari Foto Data Stok filter UPT — fixed di `runPhotoSearch` (`allowedKatalog`) + verified.

**Rantai apply 4c→4a — SELESAI & TERVERIFIKASI di production (2026-08-08).** 4c lalu 4a di-apply via `ssh minipc-gudang-home` (`--single-transaction -v ON_ERROR_STOP=1`), kedua verify script LULUS, sisa policy lama=0. **SISA: verifikasi browser production akun nyata** — simpan Data Stok & TUG-15 harus tetap tersimpan (jangan muncul "Sesi login berakhir"); cek UIT/ADMIN_LOG_PUSAT kini bisa lihat 3 TUG (dulu buta).

**Next: Gelombang 4b — PERUBAHAN SKEMA, butuh proposal user dulu** (`profiles`, `stock_opname`/`stock_count` + kolom `upt_id` + backfill; detail di Status atas).

**Belum diputuskan (jangan putuskan sendiri):** (1) scan QR publik masih NASIONAL — siapa pun yang scan bisa baca material seluruh UPT; butuh skema token per-QR, bukan sekadar policy. (2) Pengetatan GRANT anon `katalog`/`wa_sync_status`/`warnoto_state`/`tg_agent_logs` barengan cek kredensial bot.

**Verifikasi user (browser, belum lunas):**
- Uji jenjang Maturity end-to-end akun sungguhan: TL buat audit → "Kirim Hasil ke UIT" (status `REVIEW_UIT`) → UIT review → Pusat/final. Cek negatif: MANAGER UPT tak boleh pindah UPT / simpan di jenjang atas.
- Buat 2 akun baru lewat Kelola Akun: `ASMAN_LOG_UIT` (pilih unit UIT) + `ADMIN_LOG_PUSAT` (nasional).
- Form 5S pasca-GELOMBANG B (`upt_id` NOT NULL): simpan pengisian nyata, refresh, cek muncul di History.
- Evidence Drive dengan akun Pusat/UIT (jalur nasional `maturity-drive` belum diuji end-to-end).
- Upload foto pasca-fix `ff7fd49` (Data Stok, Inspeksi Material).
- UI mobile Dashboard/Alat Berat/Data Stok pasca-deploy.

**Lain:**
- Blokir `warnoto.com` di kantor = **DNS sinkhole FortiGuard** (bukan SSL inspection) — permintaan ke IT harus whitelist domain di web filter. Cadangan proxy same-origin lewat Vercel rewrite DISIMPAN, jangan dieksekusi kecuali IT menolak.
- Klarifikasi status `vps-dr-stack`: production dianggap tetap di sini atau pindah ke stack terpisah sesuai rencana DR awal?
- Migrasi Non-SAP UPT Surabaya review-first: 40 baris audit (34 kuat, 5 lemah, 1 tanpa kandidat) via UI Opname Non-SAP.
- i18n ditunda (tunggu arahan user).

**Blocker:** Production browser MEMERLUKAN whitelist IT `warnoto.com` di firewall Fortinet/Kaspersky kantor PLN.

## Perintah verifikasi
- `npm run dev` → port 3001 (akses via `localhost`)
- `npm run build`
- `node --test tests/unit/tugCanonical.contract.test.mjs tests/unit/telegramWebhook.contract.test.mjs`
- `node scripts/rehearse_tug_canonical_postgres.mjs`
- `npx playwright test tests/e2e/desktop.spec.js --project=desktop-smoke --grep "canonical derived TUG-8 draft"`
- `node --test tests/unit/heavyEquipmentPhoto.test.mjs tests/unit/stockLocationApproval.test.mjs`
- `npx playwright test tests/e2e/heavy-equipment.spec.js --project=desktop-smoke --workers=1`
- `npx playwright test tests/e2e/tug15-legacy.spec.js --project=desktop-smoke --project=tug15-mobile --workers=1`
- `node --test tests/unit/maturityDrive.security.contract.test.mjs`
- Deploy setelah persetujuan eksplisit user: `git push origin main`

## Riwayat shift (maksimal 2)
- 2026-08-07 Claude: Multi-UPT 3-tier SELESAI & diverifikasi user di browser — scoping UI + label tier (PLN Pusat/UIT JBM/nama UPT) + dokumen per-UPT (`c0d2817`,`5c05dc9`), fix 403 seed gudang/lokasi (`aad4704`), RAG Pak War per-UPT applied + tombol Sync KB akun nasional/UIT (`3642fa0`,`a0b7989`,`47eb5f7`). Filter UPT di Data Stok (`c49c937`). Spec Kit dijadikan tool global (`d6a8b34`).
- 2026-08-08 Claude: Filter per-UPT UI dilengkapi utk viewer UIT/Pusat di TUG/Alat Berat/ATTB/Inspeksi + banner Maturity distabilkan (`e3ff9d1`, pushed). Vendor C opencode dilengkapi (caveman/ponytail/RTK/Spec Kit global + graphify di instructions). Kapasitas→Peta Utilisasi: filter UPT + redesign toolbar berlabel + fix stale sub-gudang — BELUM commit (3 file, tunggu verifikasi browser). Bug baru: Cari Foto Data Stok tak terfilter UPT (pending, detail+fix di Langkah berikutnya). User lanjut di Vendor C.
