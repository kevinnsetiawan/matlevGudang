# UI_DESIGN_REVIEW_LOG.md

Log temuan review tampilan/UX WARNOTO dari waktu ke waktu (agent `ui-design-reviewer`). Format: tiap review baru ditambah di atas, checklist item ditandai `[x]` kalau sudah diperbaiki (dicek ulang tiap sesi berikutnya, bukan dilaporkan dobel).

---

## Review 2026-07-08 — Fokus mobile: Data Stok, Stock Opname, TUG, Approval

**Metodologi**: analisis statis kode (bukan screenshot — tidak ada browser automation tool/`chromium-cli`/playwright terpasang di environment ini saat review dijalankan). Semua temuan diverifikasi lewat grep + baca langsung ke `App.jsx`, bukan tebakan.

### 🔴 Critical

- [x] **[DIPERBAIKI 2026-07-08]** Semua modal pakai lebar piksel tetap, tidak ada `maxWidth` sama sekali — `sty.card` (App.jsx:5684, definisi dasar) cuma punya `background/borderRadius/border/padding`, TIDAK ADA `maxWidth`. Ditemukan **28 modal** yang override `width` jadi angka tetap 400–700px (App.jsx baris 7637, 7703, 7772, 7818, 7855, 7876, 7955, 7998, 8038, 8065, 8185, 8241, 8267, 8280, 8300, 8319, 8428, 8453, 8593, 8723, 8851, 9935, 11343, 15594, 15918, 16075, 16104, 16429) — termasuk modal "Kartu Gantung QR" baru (11343, width:420) dan modal Edit Katalog/Ganti Password yang sering dipakai. Di HP lebar umum (360-414px), SEMUA modal ini overflow horizontal — ini kemungkinan besar penyebab utama kesan "berantakan" yang dilaporkan.
  - **Fix**: tambah `maxWidth:"100%"` di tiap modal (atau bikin 1 helper baru `sty.modalCard(width)` yang otomatis kasih `maxWidth:"92vw"` bareng `width`, supaya tidak perlu ubah 28 tempat manual satu-satu).
  - **Dikerjakan**: `maxWidth:"100%"` ditambahkan ke seluruh 28 modal (script regex tertarget `...sty.card,width:N` → `...sty.card,width:N,maxWidth:"100%"`, diverifikasi 28/28 kena, `npm run build` sukses). Belum dites manual di browser/HP.

### 🟠 Major

- [x] **[DIPERBAIKI 2026-07-08]** Grid KPI/dashboard 4-5 kolom tetap, tidak collapse di HP — App.jsx:9594, 9781, 9856 (`repeat(4,1fr)`), 10023, 10125 (`repeat(5,1fr)`), 11116 (`repeat(4,1fr)`, widget "Progress Pengisian" opname). Di layar 375px, 4-5 kolom berarti tiap kotak cuma ~60-70px.
  - **Dikerjakan**: diganti `gridTemplateColumns:"repeat(auto-fit,minmax(Npx,1fr))"` di semua 6 lokasi (N disesuaikan per konten: 80-160px) — pendekatan CSS Grid murni, kolom otomatis menyesuaikan lebar layar tanpa perlu prop `isMobile` diteruskan ke tiap komponen (lebih robust dari rencana awal `isMobile?a:b`, karena juga menangani lebar tablet di antara mobile/desktop). `npm run build` sukses.

- [x] **[DIPERBAIKI SEBAGIAN 2026-07-08]** 17 tabel mengandalkan scroll horizontal tanpa alternatif mobile. Tabel item Stock Opname (App.jsx ~11160-an, 11-12 kolom) — kolom **No**, **No Katalog**, **Qty Sistem** sekarang disembunyikan di HP (`{!isMobile && <th/td>...}`), plus lebar maksimal nama barang dikecilkan (200px→120px di HP). Sisa kolom (Nama, Satuan, Qty Fisik, Selisih, Status, Lokasi, Keterangan, Foto) tetap tampil karena itu yang benar-benar dipakai aktif saat opname lapangan. `isMobile` sekarang diteruskan sebagai prop baru ke `StockOpnameTab`.
  - **BELUM dikerjakan** (di luar cakupan sesi ini, butuh effort lebih besar): redesain penuh jadi layout kartu (1 card per item) untuk tabel Stock Opname & Data Stok — masih scroll horizontal untuk kolom yang tersisa, cuma lebih ringkas. 16 tabel lain (termasuk Data Stok) belum disentuh sama sekali.

### 🟡 Minor

- [x] **[DIPERBAIKI SEBAGIAN 2026-07-08]** Tombol ikon-saja tanpa label/tooltip — 8 tombol Edit/Hapus (✏️/🗑️) yang jelas-jelas belum punya `title=` sudah ditambahkan (Edit/Hapus UIT, UPT, ULTG, Gudang, Lokasi, Bersihkan Chat, Hapus Opname, Hapus Rencana Kedatangan). Tombol close "✕" (modal) sengaja TIDAK disentuh — konvensi "X = tutup" sudah cukup universal, dan `title` tetap tidak muncul di HP (tidak ada hover di layar sentuh) jadi dampaknya kecil untuk keluhan mobile spesifik. ~50 kandidat lain dari heuristik grep awal belum diaudit manual satu-satu (banyak kemungkinan false-positive dari pola grep kasar).

- [x] **[DICEK 2026-07-08, TIDAK ADA MASALAH]** Overlay/z-index menu mobile — drawer overlay z-index 1400, modal z-index 1000 (modal lebih rendah). Secara teori kalau keduanya kebuka bersamaan, drawer akan menutupi modal — tapi dicek semua item nav yang memicu perpindahan tab/modal sudah memanggil `setMobileMenuOpen(false)` di `onClick`-nya, jadi drawer selalu tertutup duluan sebelum modal manapun terbuka. Tidak ditemukan skenario nyata yang bentrok.

### Belum sempat dicek sesi ini (lanjut sesi berikutnya)

- Kontras warna teks abu-abu (`C.muted`) di berbagai ukuran font kecil — belum dibandingkan visual.
- Konsistensi padding/gap antar komponen sejenis (card, badge) — belum di-audit sistematis.
- ~50 tombol ikon-saja sisanya dari heuristik grep awal — belum diaudit manual satu-satu.
- Layout kartu (card-based) untuk tabel Stock Opname & Data Stok di HP — perbaikan sekarang cuma mengurangi kolom, belum redesain penuh.
- 16 dari 17 tabel `overflowX:"auto"` lainnya (termasuk Data Stok) belum disentuh.
- **Screenshot visual asli belum pernah diambil** — semua temuan & perbaikan di atas dari baca/edit kode, bukan lihat langsung tampilannya. Kalau nanti browser automation tool tersedia, ulangi review dengan screenshot sungguhan untuk verifikasi.
