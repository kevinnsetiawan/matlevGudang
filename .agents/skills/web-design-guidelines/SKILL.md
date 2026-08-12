---
name: web-design-guidelines
description: Enforce WARNOTO corporate web design guidelines, color tokens, hero banners, button classes, typography, and UI standards.
---

# WARNOTO Web Design Guidelines

Read `docs/DESIGN_GUIDELINES.md` and `docs/PANDUAN_UI_UPGRADE.md` for authoritative static design rules before modifying UI components.

## 1. Warna & Token Tema (PLN Corporate)
- **Primary Navy (`#0b2559`):** Sidebar, Banner KPI, dan elemen struktural utama.
- **Accent Blue (`#1d4ed8`):** Button utama, status aktif, dan elemen interaktif.
- **Dynamic Theme Tokens (`C.xxx`):** Wajib gunakan objek `C` (dari `src/theme.js`) untuk warna background/text agar mendukung Light & Dark Mode.

## 2. Hero Banner Korporat
- **Komponen Standard:** Gunakan `OperationsHero` (`src/components/OperationsHero.jsx`) untuk header halaman.
- **Class `.kpi-banner`:** 
  - Gradient: `linear-gradient(120deg, #0b2559 0%, #123d83 58%, #1d4ed8 100%)`
  - Border Radius: `14px`, Min-Height: `104px`.
  - *Catatan:* Tambahkan padding manual jika menggunakan custom div tanpa `.kpi-banner__item`.

## 3. Standar Tombol Aksi (`.approval-btn--*`)
Gunakan class terdaftar di `src/index.css` alih-alih inline style manual:
- `.approval-btn--primary` (Aksi utama / lanjut)
- `.approval-btn--cancel` (Batal / kembali)
- `.approval-btn--approve` / `.approval-btn--reject` (Aksi approval)
- `.approval-btn--danger` (Hapus / tindakan berisiko)

## 4. Tipografi & Ikon
- **Batas Font:** Minimal `12px` di seluruh antarmuka aplikasi.
- **Ikon Vektor:** Gunakan ikon dari `@phosphor-icons/react` untuk navigasi, header, dan aksi. Hindari emoji mentah.

## 5. Tata Letak Responsif & Mobile
- **Touch Target:** Minimal `44px` di mobile.
- **Grid Auto-fit:** Gunakan `gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))"`.
- **Max-width Konten:** Gunakan `max-width: 1200px` untuk tumpukan 1-kolom agar tidak meregang di monitor desktop.
