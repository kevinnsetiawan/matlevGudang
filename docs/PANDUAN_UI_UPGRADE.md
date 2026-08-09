# Panduan Aman: Upgrade UI/UX Warnoto (Tailwind v4)

> Dibuat 2026-07-14. Dikerjakan manual di **PowerShell**.
> Prinsip utama: **setiap langkah bisa di-rollback.** Kalau ragu, berhenti — jangan lanjut.

Lokasi kerja: `d:\CLAUDE\WARNOTO CODE\warnoto-project`
Jalankan semua perintah dari folder itu (buka PowerShell, lalu `cd "d:\CLAUDE\WARNOTO CODE\warnoto-project"`).

---

## Prinsip keselamatan (baca dulu)

1. **Git adalah jaring pengamanmu.** Selama tiap langkah di-commit, kamu selalu bisa kembali ke kondisi sebelumnya. Tidak ada yang benar-benar hilang.
2. **Satu langkah = satu commit.** Jangan menumpuk banyak perubahan sebelum commit. Kalau ada yang rusak, kamu cuma mundur 1 langkah, bukan semuanya.
3. **Tes setelah tiap langkah** dengan `npm run dev` → buka `http://localhost:3001`. Kalau tampilan/aplikasi rusak, jangan commit — rollback dulu.
4. **Kerja di branch terpisah, bukan `main`.** `main`-mu tetap aman & bisa dipakai kapan pun.
5. **Jangan `git push` sampai kamu yakin.** Semua langkah di bawah bersifat lokal di komputermu.

---

## LANGKAH 0 — Amankan kondisi sekarang (WAJIB, lakukan dulu)

Saat ini kamu di branch `main` dan ada 1 perubahan `App.jsx` yang belum di-commit. Amankan dulu.

```powershell
# 1. Lihat kondisi
git status

# 2. Commit perubahan App.jsx yang belum tersimpan (biar tidak tercampur pekerjaan UI)
git add App.jsx
git commit -m "chore: simpan perubahan App.jsx sebelum upgrade UI"

# 3. Buat branch khusus pekerjaan UI, dan pindah ke sana
git switch -c ui/tailwind-upgrade

# 4. Pastikan sudah di branch baru
git branch --show-current    # harus: ui/tailwind-upgrade
```

✅ **Titik aman #0.** Mulai sekarang, apa pun yang kamu lakukan tidak menyentuh `main`.
Kalau semuanya kacau nanti, kamu tinggal `git switch main` dan branch ini bisa dibuang.

---

## LANGKAH 1 — Cek keamanan API key (read-only, tidak mengubah apa pun)

Ini bukan bagian UI, tapi paling berisiko. Kita cek apakah `VITE_ANTHROPIC_API_KEY` ikut ter-build ke sisi user.

> **Kenapa bahaya:** semua variabel berawalan `VITE_` di Vite **dimasukkan ke bundle JavaScript yang diunduh user**. Kalau API key Anthropic ada di sana, siapa pun yang buka aplikasi bisa mengambilnya dari kode browser dan memakainya atas tagihanmu.

```powershell
# Cari pemakaian key di kode (read-only, tidak mengubah file)
Select-String -Path "App.jsx","src\**\*.js*" -Pattern "VITE_ANTHROPIC_API_KEY" -List
```

- Kalau **muncul** di kode frontend (App.jsx / src) dan aplikasi kamu deploy publik (Vercel) → **key kemungkinan bocor.** Catat ini, tangani terpisah nanti (idealnya panggilan ke Anthropic dipindah ke Supabase Edge Function, bukan dari browser). **Jangan** perbaiki sekarang biar tidak tercampur pekerjaan UI.
- Kalau tidak muncul, atau panggilan sudah lewat Edge Function → aman.

✅ Langkah ini tidak mengubah kode. Tidak perlu commit.

---

## LANGKAH 2 — Pasang Tailwind v4 (aman, tanpa merusak style lama)

Versi terbaru adalah **Tailwind v4** (setup-nya beda dari tutorial v3 lama — ikuti ini).

### 2a. Install
```powershell
npm install tailwindcss @tailwindcss/vite
```

### 2b. Daftarkan plugin di `vite.config.js`
Buka `vite.config.js`, ubah jadi seperti ini (tambah 1 import + 1 plugin):

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'   // <-- baris baru

export default defineConfig({
  plugins: [react(), tailwindcss()],           // <-- tambah tailwindcss()
  server: {
    port: 3001,
    open: true
  }
})
```

### 2c. Buat file CSS — DENGAN PENGAMAN PENTING

Buat file baru `src\index.css`. **Jangan pakai `@import "tailwindcss";` yang polos** — itu mengaktifkan *Preflight* (reset global) yang bisa **mengubah tampilan aplikasimu yang sekarang** (semua style bawaan browser di-reset, margin/heading/list bisa berubah).

Karena kodemu masih pakai inline-style, kita **matikan reset global** dulu supaya tidak ada yang berubah. Isi `src\index.css` dengan:

```css
/* Urutan layer: preflight (base) sengaja TIDAK di-import supaya style lama aman */
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```

> Efeknya: kamu dapat semua utility Tailwind (`hover:`, `transition`, `rounded`, dll) **tanpa** reset global yang berisiko mengubah tampilan yang sudah ada. Ini pilihan paling aman untuk aplikasi yang sudah jadi.

### 2d. Sambungkan CSS ke aplikasi
Buka `src\main.jsx`, tambahkan 1 baris import di paling atas:

```js
import './index.css'   // <-- baris baru, taruh di baris pertama
import React from 'react'
```

### 2e. Tes bahwa tidak ada yang rusak + Tailwind aktif
```powershell
npm run dev
```
Buka `http://localhost:3001`. Cek:
- ✅ Tampilan **sama seperti sebelumnya** (tidak ada yang berubah/rusak) → berarti pengaman preflight bekerja.
- ✅ Untuk memastikan Tailwind hidup: sementara tambahkan `className="p-4 bg-red-500"` di satu elemen, lihat apakah jadi merah. Kalau ya, hapus lagi.

Hentikan server dengan `Ctrl+C`.

### 2f. Commit
```powershell
git add -A
git commit -m "build: setup Tailwind v4 (preflight dimatikan, style lama aman)"
```
✅ **Titik aman #1.**

---

## LANGKAH 3 — Porting palet warna PLN ke Tailwind

Supaya kamu bisa pakai `bg-accent`, `text-pln-navy` dst yang konsisten dengan `src/theme.js`.

Buka `src\index.css`, tambahkan blok `@theme` di bawah import yang tadi:

```css
@theme {
  --color-bg:       #f4f6fb;
  --color-surface:  #ffffff;
  --color-pln-navy: #0b2559;   /* sidebar */
  --color-accent:   #1d4ed8;   /* biru utama */
  --color-yellow:   #f59e0b;
  --color-green:    #16a34a;
  --color-red:      #dc2626;
  --color-text:     #0f172a;
  --color-muted:    #64748b;
  --color-border:   #e6eaf1;
}
```
(Angka ini disalin persis dari `src/theme.js` — objek `C`.)

Tes lagi (`npm run dev`), pastikan tidak error, lalu:
```powershell
git add -A
git commit -m "style: daftarkan palet PLN sebagai token Tailwind"
```
✅ **Titik aman #2.**

---

## LANGKAH 4 — Perbaiki komponen inti, SATU per SATU

Ini inti pekerjaannya. Urutan (paling berdampak dulu). **Commit setelah tiap komponen** — jangan borongan.

Urutan disarankan:
1. **Tombol** (`sty.btn` di `src/theme.js`) — dipakai di mana-mana
2. **Kartu** (`sty.card`)
3. **Input / Select** (`sty.input`, `sty.select`)
4. **Baris tabel** (hover)
5. **Modal**

Untuk tiap komponen, polanya sama:

```powershell
# a. Kerjakan 1 komponen (ubah style → tambah hover/focus/transition via className Tailwind)
# b. Tes
npm run dev            # cek di http://localhost:3001, lalu Ctrl+C
# c. Kalau BAGUS → commit
git add -A
git commit -m "style: tombol punya hover/focus/transition (Tailwind)"
# d. Kalau JELEK/RUSAK → buang perubahan, balik ke kondisi terakhir yang aman:
git restore .
```

> Karena style sekarang inline (`style={{...}}`), memperbaikinya berarti memindah bagian interaktif ke `className`. Kerjakan sedikit demi sedikit, tes, commit. Jangan ubah 5 komponen sekaligus lalu baru tes — kalau rusak kamu susah tahu yang mana.

---

## Cara ROLLBACK (hafalkan ini — ini yang bikin aman)

| Situasi | Perintah |
|---|---|
| Baru saja mengedit, belum commit, dan hasilnya jelek | `git restore .` (buang semua perubahan sejak commit terakhir) |
| Buang perubahan 1 file saja | `git restore nama-file` |
| Sudah commit tapi mau mundur 1 commit (kode ikut mundur) | `git reset --hard HEAD~1` |
| Lihat semua titik aman (commit) | `git log --oneline` |
| Balik ke commit tertentu | `git reset --hard <kode-commit>` |
| **Batalkan SEMUA pekerjaan UI, kembali ke main** | `git switch main` (branch `ui/tailwind-upgrade` ditinggal, bisa dihapus) |
| Hapus branch UI kalau tidak jadi | `git branch -D ui/tailwind-upgrade` |

> ⚠️ `git reset --hard` membuang perubahan secara permanen sampai commit itu. Aman selama kamu sudah commit hal yang mau disimpan. Kalau ragu, pakai `git stash` dulu (menyimpan sementara tanpa commit): `git stash` untuk menyimpan, `git stash pop` untuk mengembalikan.

---

## Setelah semua selesai & kamu puas

```powershell
# Gabungkan hasil ke main
git switch main
git merge ui/tailwind-upgrade

# (Opsional) baru push ke GitHub kalau memang mau
git push origin main
```

Kalau belum yakin, **biarkan saja di branch `ui/tailwind-upgrade`** — tidak wajib merge, tidak wajib push. `main` tetap utuh.

---

## Kalau kamu memakai Claude Code di PowerShell untuk membantu

- Jalankan dengan mode yang **masih menanyakan perintah berbahaya**, jangan bypass total:
  ```powershell
  claude --permission-mode acceptEdits
  ```
  Ini auto-terima edit file (cepat) tapi command shell (spt `git reset`, hapus file) tetap minta konfirmasi. Lebih aman daripada `--dangerously-skip-permissions`.
- Minta Claude kerja **per komponen + commit tiap langkah**, sama seperti panduan ini.
- Kamu tetap pegang kendali git: kalau hasil Claude jelek, `git restore .` sebelum commit.

---

## Checklist ringkas

- [ ] Langkah 0: commit App.jsx, buat branch `ui/tailwind-upgrade`
- [ ] Langkah 1: cek API key (read-only, catat kalau bocor)
- [ ] Langkah 2: install Tailwind v4 + preflight dimatikan + tes tampilan tidak berubah → commit
- [ ] Langkah 3: porting palet PLN → commit
- [ ] Langkah 4: tombol → tes → commit
- [ ] Langkah 4: kartu → tes → commit
- [ ] Langkah 4: input/select → tes → commit
- [ ] Langkah 4: baris tabel → tes → commit
- [ ] Langkah 4: modal → tes → commit
- [ ] Selesai: merge ke main (opsional), push (opsional)
```
