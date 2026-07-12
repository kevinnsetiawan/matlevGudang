// WARNOTO — Migrasi foto material dari AppSheet (DB_Warnoto.xlsx) ke WARNOTO.
//
// TAHAP 1 (file ini, mode DEFAULT = DRY-RUN): HANYA membaca & melaporkan cakupan.
// TIDAK menulis apa pun ke Supabase, Storage, maupun ke folder AppSheet. Tujuannya
// supaya kita tahu dulu — sebelum benar-benar memigrasi — berapa foto material
// UPT Surabaya yang benar-benar bisa dicocokkan ke Master Katalog WARNOTO.
//
// Sumber data (semua sudah ada di disk, tidak perlu Google Drive):
//   - DB_Warnoto.xlsx  → sheet "listMaterial" (kolom Katalog, Foto Material,
//     Foto Material Tambahan, Milik UPT). Ini "peta" foto → material.
//   - _extracted/data/**/List Material_Images/  → file foto aslinya (per MTRL-id).
//
// Filter: hanya baris `Milik UPT === "UPT Surabaya"` (data xlsx bercampur UPT lain
// — Gresik/Malang/dst — yang TIDAK boleh ikut termigrasi ke WARNOTO Surabaya).
//
// Kunci pencocokan ke WARNOTO: nomor `Katalog` (identik dengan Master Katalog).
//
// Cara pakai (dry-run, read-only — cukup anon key dari .env):
//   node scripts/migrate_material_photos.mjs
// atau eksplisit pakai service key (juga read-only di tahap ini):
//   SUPABASE_SECRET_KEY=<service_role> node scripts/migrate_material_photos.mjs
//
// Opsi lewat env:
//   APPSHEET_DIR = folder AppSheet (default: D:/CLAUDE/WARNOTO data/Appsheet)
//   UPT_FILTER   = nilai kolom "Milik UPT" (default: "UPT Surabaya")

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { cohereEmbedImage } from "./lib/cohere.mjs";

// xlsx adalah paket CommonJS — di file .mjs diakses lewat createRequire supaya
// XLSX.readFile tersedia (import * as tidak mengekspos API-nya dengan benar).
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// ── env ──────────────────────────────────────────────────────────────────────
function loadDotEnv() {
  const p = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const dotenv = loadDotEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || dotenv.VITE_SUPABASE_URL;
// Dry-run cuma BACA tabel katalog → anon/publishable key sudah cukup. Kalau ada
// service key eksplisit, dipakai juga (tetap read-only di tahap ini).
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || dotenv.VITE_SUPABASE_PUBLISHABLE_KEY;

// Mode COMMIT = benar-benar upload foto + buat embedding + isi field foto di stok.
// Butuh service_role key (tulis embedding/stocks kena RLS) + Cohere key.
const COMMIT = process.argv.includes("--commit");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) || 0 : 0;   // 0 = semua
const COHERE_API_KEY = process.env.COHERE_API_KEY || dotenv.VITE_COHERE_API_KEY;
if (COMMIT) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error("❌ Mode --commit butuh SUPABASE_SECRET_KEY (service_role) — anon key tidak bisa tulis embedding/stocks.");
    console.error("   Jalankan: SUPABASE_SECRET_KEY=<service_role> node scripts/migrate_material_photos.mjs --commit");
    process.exit(1);
  }
  if (!COHERE_API_KEY) { console.error("❌ Mode --commit butuh COHERE_API_KEY (atau VITE_COHERE_API_KEY di .env)."); process.exit(1); }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Butuh SUPABASE_URL & key. Set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY di .env,");
  console.error("   atau jalankan: SUPABASE_SECRET_KEY=<key> node scripts/migrate_material_photos.mjs");
  process.exit(1);
}

const APPSHEET_DIR = process.env.APPSHEET_DIR || "D:/CLAUDE/WARNOTO data/Appsheet";
// UPT yang dimigrasi. Inilah SATU parameter yang diganti saat onboarding UPT lain:
//   node scripts/migrate_material_photos.mjs --upt "UPT Gresik"
// Sisa alur (baca listMaterial → filter → cocokkan katalog → manifest/preview)
// identik untuk semua UPT. Slug dipakai untuk namespacing Storage & primary key
// supaya data antar-UPT TIDAK saling menimpa (Opsi B — additive per UPT).
const uptArgIdx  = process.argv.indexOf("--upt");
const UPT_FILTER = (uptArgIdx >= 0 && process.argv[uptArgIdx + 1]) ? process.argv[uptArgIdx + 1]
                 : (process.env.UPT_FILTER || "UPT Surabaya");
const UPT_SLUG   = UPT_FILTER.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const XLSX_PATH     = path.join(APPSHEET_DIR, "DB_Warnoto.xlsx");
const EXTRACTED_DIR = path.join(APPSHEET_DIR, "_extracted", "data");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Cohere image embedding (Fase 1) ──────────────────────────────────────────
// Embed gambar via helper bersama (scripts/lib/cohere.mjs), dibungkus retry untuk 429
// (limit per-menit, umumnya key trial): tunggu window reset lalu ulang — bikin migrasi
// tuntas sekali jalan tanpa foto yang terlewat.
async function embedImageWithRetry(dataUri, attempt = 0) {
  try {
    return await cohereEmbedImage(dataUri, COHERE_API_KEY);
  } catch (e) {
    if (e.status !== 429) throw e;
    if (attempt >= 15) throw new Error("Cohere 429 berulang — limit trial sangat ketat, pertimbangkan production key.");
    const waitMs = 65000;
    console.log(`    ⏳ rate limit Cohere, tunggu ${waitMs / 1000}s lalu ulang (percobaan ${attempt + 1}) ...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return embedImageWithRetry(dataUri, attempt + 1);
  }
}

// ── util ─────────────────────────────────────────────────────────────────────
// Normalisasi nomor katalog untuk pencocokan: buang spasi & jadikan string.
// (Excel kadang membaca katalog sebagai number; WARNOTO menyimpannya sebagai string.)
function normKat(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// Index semua file foto di _extracted berdasarkan basename (nama file saja).
// Path di xlsx berupa "List Material_Images/MTRL-xxx.FOTO MATERIAL.032124.jpg";
// file fisiknya bisa ada di salah satu subfolder instance (SURABAYA/WARNOTOV2/dst),
// tapi basename-nya unik (mengandung MTRL-id), jadi cukup dicari per basename.
function buildFileIndex(dir) {
  const idx = new Map();     // basename(lower) -> path lengkap
  const dupes = new Set();
  let count = 0;
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(jpe?g|png|webp)$/i.test(e.name)) {
        const key = e.name.toLowerCase();
        if (idx.has(key)) dupes.add(key); else idx.set(key, full);
        count++;
      }
    }
  }
  walk(dir);
  return { idx, dupes, count };
}

// Ambil basename dari path gaya AppSheet (pakai "/" maupun "\").
function baseName(p) {
  if (!p) return "";
  return String(p).split(/[\\/]/).pop().trim();
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function writeCsv(file, header, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(","));
  fs.writeFileSync(file, lines.join("\n"), "utf8");
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("WARNOTO — Migrasi Foto Material (DRY-RUN, read-only)\n");
  console.log("AppSheet dir :", APPSHEET_DIR);
  console.log("Filter UPT   :", UPT_FILTER, `(slug: ${UPT_SLUG})`);
  console.log("Supabase key :", process.env.SUPABASE_SECRET_KEY ? "service_role (env)" : "publishable/anon (.env)");
  console.log("");

  // 1. Baca xlsx
  if (!fs.existsSync(XLSX_PATH)) { console.error("❌ Tidak ketemu:", XLSX_PATH); process.exit(1); }
  const wb = XLSX.readFile(XLSX_PATH);
  if (!wb.Sheets["listMaterial"]) { console.error("❌ Sheet 'listMaterial' tidak ada di xlsx."); process.exit(1); }
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets["listMaterial"], { defval: null });

  // 2. Filter Surabaya
  const sby = allRows.filter((r) => normKat(r["Milik UPT"]).toLowerCase() === UPT_FILTER.toLowerCase());

  // 3. Kumpulkan referensi foto per material Surabaya
  //    Tiap material bisa punya 2 foto: "Foto Material" (utama) & "Foto Material Tambahan".
  const photoRefs = [];  // {katalog, idMaterial, nama, source, refPath, baseName}
  for (const r of sby) {
    const katalog = normKat(r["Katalog"]);
    const idMaterial = normKat(r["idMaterial"]);
    const nama = normKat(r["Nama Material"]);
    for (const [source, col] of [["utama", "Foto Material"], ["tambahan", "Foto Material Tambahan"]]) {
      const refPath = r[col];
      if (refPath) photoRefs.push({ katalog, idMaterial, nama, source, refPath, baseName: baseName(refPath) });
    }
  }

  // 4. Index file foto di disk & cek keberadaan tiap referensi
  const { idx: fileIdx, dupes, count: fileCount } = buildFileIndex(EXTRACTED_DIR);
  for (const p of photoRefs) {
    const hit = fileIdx.get(p.baseName.toLowerCase());
    p.fileExists = !!hit;
    p.filePath = hit || "";
  }

  // 5. Tarik Master Katalog WARNOTO (read-only)
  const { data: katData, error: katErr } = await supabase.from("katalog").select("id,data");
  if (katErr) { console.error("❌ Gagal baca tabel katalog:", katErr.message); process.exit(1); }
  const warnotoKatSet = new Set();
  for (const k of katData || []) {
    const d = k.data || {};
    const kat = normKat(d.katalog || d.noKatalog);
    if (kat) warnotoKatSet.add(kat);
  }

  // 6. Cocokkan & klasifikasikan
  for (const p of photoRefs) p.katalogMatch = p.katalog && warnotoKatSet.has(p.katalog);

  const migratable   = photoRefs.filter((p) => p.katalogMatch && p.fileExists);
  const matchNoFile  = photoRefs.filter((p) => p.katalogMatch && !p.fileExists);
  const noKatMatch   = photoRefs.filter((p) => !p.katalogMatch);

  // Katalog Surabaya (unik) yang punya foto tapi tidak ada di WARNOTO
  const unmatchedKatalogs = new Map();
  for (const p of noKatMatch) {
    if (!unmatchedKatalogs.has(p.katalog)) unmatchedKatalogs.set(p.katalog, { katalog: p.katalog, nama: p.nama, idMaterial: p.idMaterial });
  }

  // Katalog WARNOTO yang TIDAK dapat foto Surabaya sama sekali
  const sbyKatWithPhoto = new Set(migratable.map((p) => p.katalog));
  const warnotoNoPhoto = [...warnotoKatSet].filter((k) => !sbyKatWithPhoto.has(k));

  // Material Surabaya (unik) yang siap termigrasi (punya ≥1 foto cocok+ada file)
  const migratableMaterials = new Set(migratable.map((p) => p.katalog));

  // 7. Laporan console
  const sbyWithAnyPhoto = new Set(photoRefs.map((p) => p.katalog)).size;
  console.log("── RINGKASAN ─────────────────────────────────────────────");
  console.log(`Total baris listMaterial (semua UPT) : ${allRows.length}`);
  console.log(`Material ${UPT_FILTER}                : ${sby.length}`);
  console.log(`Katalog Surabaya (unik) punya foto    : ${sbyWithAnyPhoto}`);
  console.log(`Referensi foto (utama+tambahan)       : ${photoRefs.length}`);
  console.log(`File foto terindeks di _extracted      : ${fileCount}${dupes.size ? ` (⚠️ ${dupes.size} basename duplikat antar-instance)` : ""}`);
  console.log("");
  console.log("── HASIL PENCOCOKAN (per FOTO) ───────────────────────────");
  console.log(`✅ Siap migrasi (katalog cocok + file ada) : ${migratable.length}`);
  console.log(`⚠️  Katalog cocok TAPI file foto hilang     : ${matchNoFile.length}`);
  console.log(`❌ Katalog TIDAK ada di WARNOTO             : ${noKatMatch.length}`);
  console.log("");
  console.log("── HASIL PENCOCOKAN (per MATERIAL/KATALOG) ───────────────");
  console.log(`✅ Katalog Surabaya siap dapat foto        : ${migratableMaterials.size}`);
  console.log(`❌ Katalog Surabaya foto ada tp tak cocok  : ${unmatchedKatalogs.size}`);
  console.log(`ℹ️  Katalog WARNOTO tanpa foto Surabaya     : ${warnotoNoPhoto.length} (dari ${warnotoKatSet.size} total katalog WARNOTO)`);
  console.log("");

  // 8. Tulis CSV detail untuk review manual
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.resolve(process.cwd(), "outputs", `photo_migration_dryrun_${stamp}`);
  ensureDir(outDir);

  writeCsv(path.join(outDir, "siap_migrasi.csv"),
    ["katalog", "idMaterial", "nama", "source", "baseName", "filePath"],
    migratable);
  writeCsv(path.join(outDir, "file_hilang.csv"),
    ["katalog", "idMaterial", "nama", "source", "refPath", "baseName"],
    matchNoFile);
  writeCsv(path.join(outDir, "katalog_tidak_cocok.csv"),
    ["katalog", "idMaterial", "nama"],
    [...unmatchedKatalogs.values()]);
  writeCsv(path.join(outDir, "warnoto_tanpa_foto.csv"),
    ["katalog"],
    warnotoNoPhoto.map((k) => ({ katalog: k })));

  console.log("📄 Detail CSV ditulis ke:", outDir);
  console.log("   - siap_migrasi.csv        (foto yang akan dimigrasi nanti)");
  console.log("   - file_hilang.csv         (katalog cocok tapi file foto tak ketemu di disk)");
  console.log("   - katalog_tidak_cocok.csv (foto Surabaya yang katalognya tak ada di WARNOTO)");
  console.log("   - warnoto_tanpa_foto.csv  (katalog WARNOTO yang belum dapat foto)");

  // 8b. (opsional) Manifest upload — preview PERSIS record yang akan dibuat saat
  //     migrasi commit nanti: path di Storage, URL publik, dan bentuk baris tabel
  //     stock_photo_embeddings. Tidak menulis ke Supabase — cuma menghitung format.
  if (process.argv.includes("--manifest")) {
    const publicBase = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/stock-photos`;
    const manifest = migratable.map((p) => {
      const ext = (p.baseName.match(/\.[a-z0-9]+$/i) || [".jpg"])[0].toLowerCase();
      // Namespaced per UPT (Opsi B) → data antar-UPT tidak saling menimpa.
      const storagePath = `${UPT_SLUG}/${p.katalog}/${p.source}${ext}`;  // cth: upt-surabaya/1001030020/utama.jpg
      let sizeKb = null;
      try { sizeKb = Math.round(fs.statSync(p.filePath).size / 1024); } catch { /* ignore */ }
      return {
        id: `spe_${UPT_SLUG}_${p.katalog}_${p.source}`,  // primary key tabel stock_photo_embeddings
        upt: UPT_FILTER,
        katalog: p.katalog,
        source: p.source,                      // utama | tambahan
        storage_path: storagePath,             // lokasi di bucket stock-photos
        public_url: `${publicBase}/${storagePath}`,
        local_file: p.filePath,                // sumber foto lokal yang diupload
        size_kb: sizeKb,
      };
    });
    const manDir = path.resolve(process.cwd(), "outputs");
    ensureDir(manDir);
    const manBase = `photo_upload_manifest_${UPT_SLUG}`;
    writeCsv(path.join(manDir, `${manBase}.csv`),
      ["id", "upt", "katalog", "source", "storage_path", "public_url", "size_kb", "local_file"],
      manifest);
    fs.writeFileSync(path.join(manDir, `${manBase}.json`), JSON.stringify(manifest, null, 2), "utf8");
    const totalKb = manifest.reduce((a, m) => a + (m.size_kb || 0), 0);
    console.log(`\n📦 Manifest upload: ${manifest.length} record → outputs/${manBase}.csv (+ .json)`);
    console.log(`   Total ukuran foto: ~${(totalKb / 1024).toFixed(1)} MB  |  bucket: stock-photos  |  path: ${UPT_SLUG}/<katalog>/<source>`);
  }

  // 9. (opsional) Salin file foto "siap migrasi" ke satu folder preview supaya
  //    mudah dilihat sekaligus, tanpa tercampur foto UPT lain. Murni copy file
  //    lokal — tidak menyentuh Supabase/DB. Nama file diprefix katalog + source
  //    supaya tersortir per material.
  if (process.argv.includes("--copy-preview")) {
    const previewDir = path.resolve(process.cwd(), "outputs", `preview_foto_siap_migrasi_${UPT_SLUG}`);
    ensureDir(previewDir);
    let copied = 0, failed = 0;
    for (const p of migratable) {
      const safe = `${p.katalog}__${p.source}__${p.baseName}`.replace(/[\\/:*?"<>|]/g, "_");
      try { fs.copyFileSync(p.filePath, path.join(previewDir, safe)); copied++; }
      catch (e) { failed++; console.error("  gagal copy:", p.filePath, e.message); }
    }
    console.log(`\n🖼️  Preview: ${copied} foto disalin ke ${previewDir}${failed ? ` (${failed} gagal)` : ""}`);
  }

  // 10. MODE COMMIT — upload foto ke Storage + buat embedding + isi field foto stok.
  if (COMMIT) {
    const list = LIMIT > 0 ? migratable.slice(0, LIMIT) : migratable;
    console.log(`\n── MODE COMMIT (menulis ke Supabase) ─────────────────────`);
    console.log(`Upload + embed ${list.length} foto${LIMIT ? ` (dibatasi --limit ${LIMIT})` : ""} ...`);

    // Peta katalog_id <-> nomor katalog (untuk update baris stocks).
    const idToKatNum = new Map();
    for (const k of katData || []) { const kn = normKat(k.data?.katalog || k.data?.noKatalog); if (kn) idToKatNum.set(k.id, kn); }
    const katNumToId = new Map([...idToKatNum].map(([id, kn]) => [kn, id]));

    // Resume: lewati foto yang embedding-nya SUDAH ada (kecuali --force), supaya
    // re-run cuma memproses sisanya — hemat kuota Cohere & lanjut dari titik putus.
    const FORCE = process.argv.includes("--force");
    const { data: existingEmb } = await supabase.from("stock_photo_embeddings").select("id").eq("upt", UPT_FILTER);
    const doneIds = new Set((existingEmb || []).map((r) => r.id));

    const embRows = [];
    let done = 0, failed = 0, skipped = 0;
    for (const p of list) {
      const embId = `spe_${UPT_SLUG}_${p.katalog}_${p.source}`;
      if (!FORCE && doneIds.has(embId)) { skipped++; continue; }
      try {
        const ext = (p.baseName.match(/\.[a-z0-9]+$/i) || [".jpg"])[0].toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        const storagePath = `${UPT_SLUG}/${p.katalog}/${p.source}${ext}`;
        const buf = fs.readFileSync(p.filePath);

        // a. upload ke Storage (x-upsert → idempoten, aman diulang)
        const upUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/stock-photos/${encodeURI(storagePath)}`;
        const upRes = await fetch(upUrl, {
          method: "POST",
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": mime, "x-upsert": "true" },
          body: buf,
        });
        if (!upRes.ok) throw new Error(`upload gagal ${upRes.status}: ${await upRes.text()}`);
        const publicUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/stock-photos/${encodeURI(storagePath)}`;

        // b. embedding gambar (Cohere)
        const vec = await embedImageWithRetry(`data:${mime};base64,${buf.toString("base64")}`);

        embRows.push({
          id: embId,
          upt: UPT_FILTER, katalog: p.katalog, source: p.source,
          photo_url: publicUrl, embedding: vec, updated_at: new Date().toISOString(),
        });
        // upsert per foto (bukan sekali di akhir) supaya progres tidak hilang kalau
        // proses terputus di tengah — resume tinggal lanjut dari yang belum ada.
        const { error: upErr } = await supabase.from("stock_photo_embeddings").upsert([embRows[embRows.length - 1]], { onConflict: "id" });
        if (upErr) throw new Error("upsert embedding: " + upErr.message);
        if (++done % 25 === 0) console.log(`  ... ${done}/${list.length}`);
        await new Promise((r) => setTimeout(r, 200));   // jeda rate-limit Cohere
      } catch (e) { failed++; console.error(`  ✗ ${p.katalog}/${p.source}:`, e.message); }
    }
    console.log(`✅ Embedding baru: ${done}  |  dilewati (sudah ada): ${skipped}  |  gagal: ${failed}`);

    // d. isi field foto di baris stocks — utama→fotoKeseluruhan, tambahan→fotoNameplate.
    //    fill-if-empty: TIDAK menimpa foto yang mungkin sudah diisi manual.
    //    Sumber URL diambil ULANG dari DB (semua embedding UPT ini, bukan cuma run
    //    ini) → stocks selalu ikut lengkap walau embed-nya lintas beberapa run.
    const { data: allEmb } = await supabase.from("stock_photo_embeddings").select("katalog,source,photo_url").eq("upt", UPT_FILTER);
    const perKatUrls = {};
    for (const e of allEmb || []) (perKatUrls[e.katalog] = perKatUrls[e.katalog] || {})[e.source] = e.photo_url;
    const katIds = [...new Set(Object.keys(perKatUrls).map((kn) => katNumToId.get(kn)).filter(Boolean))];
    if (katIds.length) {
      let updated = 0;
      for (let i = 0; i < katIds.length; i += 100) {
        const idsChunk = katIds.slice(i, i + 100);
        const { data: stockRows, error: sErr } = await supabase.from("stocks").select("id,katalog_id,data").in("katalog_id", idsChunk);
        if (sErr) { console.error("  ✗ baca stocks:", sErr.message); continue; }
        const updates = [];
        for (const s of stockRows || []) {
          const urls = perKatUrls[idToKatNum.get(s.katalog_id)];
          if (!urls) continue;
          const nd = { ...(s.data || {}) };
          let changed = false;
          if (urls.utama && !nd.fotoKeseluruhan) { nd.fotoKeseluruhan = urls.utama; changed = true; }
          if (urls.tambahan && !nd.fotoNameplate) { nd.fotoNameplate = urls.tambahan; changed = true; }
          if (changed) updates.push({ id: s.id, katalog_id: s.katalog_id, data: nd });
        }
        for (let j = 0; j < updates.length; j += 100) {
          const { error } = await supabase.from("stocks").upsert(updates.slice(j, j + 100), { onConflict: "id" });
          if (error) console.error("  ✗ update stocks:", error.message); else updated += Math.min(100, updates.length - j);
        }
      }
      console.log(`✅ Baris stok diisi foto (fotoKeseluruhan/fotoNameplate): ${updated}`);
    }
    console.log("\n✔ COMMIT selesai.");
    return;
  }

  console.log("\n✔ DRY-RUN selesai. TIDAK ada data yang diubah.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
