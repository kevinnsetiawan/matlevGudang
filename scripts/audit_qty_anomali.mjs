// WARNOTO — Audit anomali qty (korup 10x/100x/1000x dari import lama).
//
// Latar belakang: bug lama di parser angka (sebelum `parseIndoNumber` seragam di
// App.jsx) SELALU menghapus semua titik dulu sebelum konversi koma. Jadi nilai
// asli pakai titik sebagai desimal (mis. "103.5 meter") kepotong jadi "1035" —
// distorsi ~10x (atau 100x/1000x kalau 2-3 angka desimal). Fix parser cuma
// memperbaiki import BARU; data lama yang sudah kadung salah masih tersimpan di
// tabel `stocks`. Belum ada tools bawaan untuk nemuin baris yang kena.
//
// Script ini = alat TRIAGE, bukan detector definitif. Tanpa baseline "qty
// seharusnya", nggak ada cara 100% pasti membedakan "1035 meter asli" vs
// "103.5 meter yang ke-inflate 10x". Jadi strateginya:
//   1. Tarik semua stocks + join ke katalog (ambil satuan + nama).
//   2. Saring ke satuan "desimal-sensitif" (meter/kg/lembar/dll — ukuran
//      berat/panjang/luas/volume yang lazim pecahan, BUKAN satuan cacah
//      seperti buah/unit/pcs).
//   3. Tandai (REVIEW) baris yang qty-nya integer >= 10 di satuan
//      desimal-sensitif — kategori paling mungkin kena inflate. Beri
//      "skor dugaan" berdasarkan beberapa sinyal heuristik (round-number,
//      kelipatan 10, magnitude tinggi).
//   4. Output: tabel ke console + file CSV/JSON ke outputs/ untuk dibuka
//      di Excel dan dicek manual satu-satu.
//
// Cara pakai:
//   SUPABASE_SECRET_KEY=<service_role_key> \
//   node scripts/audit_qty_anomali.mjs
//
// SUPABASE_URL boleh di-set via env, kalau tidak akan diambil dari .env
// (VITE_SUPABASE_URL). SUPABASE_SECRET_KEY WAJIB di-set eksplisit lewat env —
// JANGAN pernah taruh service_role key di .env (key itu cuma untuk script
// lokal/GitHub Secrets, lihat docs/CLAUDE_HANDOFF.md section 7).

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// --- env ---
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
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("❌ Butuh SUPABASE_URL & SUPABASE_SECRET_KEY (service_role).");
  console.error("   Jalankan:");
  console.error("     SUPABASE_SECRET_KEY=<service_role_key> node scripts/audit_qty_anomali.mjs");
  console.error("   (SUPABASE_URL otomatis dari .env kalau ada VITE_SUPABASE_URL)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- konstanta deteksi ---
// Satuan ukuran berat/panjang/luas/volume yang lazim punya pecahan desimal.
// Satuan cacah (buah/unit/pcs/batang/set) sengaja TIDAK dimasukkan — kalaupun
// kena bug, magnitudenya biasanya kelihatan jelas di step lain.
const DECIMAL_UNITS = [
  "m","meter","mtr","mm","cm","km",
  "kg","gr","gram","ton",
  "l","liter","ml",
  "m2","m²","m3","m³","ha",
  "lembar","lbr","roll","rol","rols",
  "lusin","box","kaleng",
];

const isDecimalUnit = (sat) => {
  if (!sat) return false;
  const s = String(sat).trim().toLowerCase();
  return DECIMAL_UNITS.includes(s);
};

// Skor dugaan anomali (makin tinggi = makin layak dicek duluan).
function suspectScore(qty, sat) {
  let score = 0;
  const reasons = [];
  if (!Number.isFinite(qty)) return { score: 0, reasons: [] };
  // integer besar di satuan desimal → kandidat utama (pecahan hilang)
  if (Number.isInteger(qty) && qty >= 10) {
    score += 2;
    reasons.push("integer>=10 di satuan desimal (mungkin pecahan hilang)");
  }
  // round-number kelipatan 10/100/1000 — umum pasca-inflate x.0
  if (qty >= 100 && qty % 10 === 0) {
    score += 1;
    reasons.push("kelipatan 10 ber-magnitude tinggi");
  }
  if (qty >= 1000) {
    score += 1;
    reasons.push("magnitude >= 1000");
  }
  return { score, reasons };
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- tarik data ---
async function pull() {
  const [stocksRes, katRes] = await Promise.all([
    supabase.from("stocks").select("id,katalog_id,data"),
    supabase.from("katalog").select("id,data"),
  ]);
  if (stocksRes.error) throw new Error("stocks: " + stocksRes.error.message);
  if (katRes.error) throw new Error("katalog: " + katRes.error.message);

  const katById = new Map();
  for (const k of katRes.data || []) {
    const d = k.data || {};
    katById.set(k.id, { katalog: d.katalog || d.noKatalog || "-", name: d.name || d.nama || "-", satuan: d.satuan || d.unit || "-" });
  }

  const rows = [];
  for (const s of stocksRes.data || []) {
    const d = s.data || {};
    const kat = katById.get(s.katalog_id) || {};
    const qty = safeNum(d.qty);
    if (qty === null) continue; // skip baris tanpa qty angka
    rows.push({
      stockId: s.id,
      katalogId: s.katalog_id || "-",
      noKatalog: kat.katalog || "-",
      name: kat.name || "-",
      satuan: kat.satuan || "-",
      qty,
      price: safeNum(d.price),
      lokasiId: d.lokasiId || d.lokasi_id || "-",
    });
  }
  return rows;
}

// --- flag & urut ---
function triage(rows) {
  const decimalRows = rows.filter(r => isDecimalUnit(r.satuan));
  const flagged = decimalRows.map(r => {
    const { score, reasons } = suspectScore(r.qty, r.satuan);
    return { ...r, score, reasons: reasons.join("; "), review: score > 0 ? "REVIEW" : "ok" };
  });
  flagged.sort((a, b) => b.score - a.score || b.qty - a.qty);
  return { flagged, decimalRows };
}

function toCSV(rows) {
  const cols = ["stockId","katalogId","noKatalog","name","satuan","qty","price","lokasiId","score","review","reasons"];
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map(c => esc(r[c])).join(","));
  return lines.join("\n");
}

// --- main ---
(async () => {
  try {
    console.log("⏳ Tarik stocks + katalog dari Supabase…");
    const rows = await pull();
    console.log(`   total stocks dengan qty angka: ${rows.length}`);
    const { flagged, decimalRows } = triage(rows);
    const reviewCount = flagged.filter(r => r.review === "REVIEW").length;

    console.log(`   satuan desimal-sensitif: ${decimalRows.length}`);
    console.log(`   ditandai REVIEW: ${reviewCount}`);
    console.log("");

    console.log("=== TOP 30 DUGAAN ANOMALI (skor tertinggi) ===");
    console.log("qty\t satuan\t noKatalog\t\t name");
    flagged.slice(0, 30).forEach(r => {
      console.log(`${r.qty}\t ${r.satuan}\t ${r.noKatalog}\t ${r.name.slice(0,40)}${r.reasons?`  [${r.reasons}]`:""}`);
    });
    console.log("");

    // tulis file
    const outDir = path.resolve(process.cwd(), "outputs", "warnoto-qty-audit");
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const csvPath = path.join(outDir, `AUDIT_QTY_ANOMALI_${ts}.csv`);
    const jsonPath = path.join(outDir, `AUDIT_QTY_ANOMALI_${ts}.json`);
    fs.writeFileSync(csvPath, "﻿" + toCSV(flagged), "utf8"); // BOM supaya Excel baca UTF-8
    fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: ts, totalRows: rows.length, decimalRows: decimalRows.length, reviewCount, rows: flagged }, null, 2), "utf8");

    console.log(`✅ CSV  : ${csvPath}`);
    console.log(`✅ JSON : ${jsonPath}`);
    console.log("");
    console.log("Catatan: ini TRIAGE, bukan vonis final. Cek manual tiap baris REVIEW");
    console.log("di Data Stok — bandingkan dengan kertas/fisik lapangan. Setuju salah →");
    console.log("koreksi qty lewat Edit Data Stok di app (BUKAN overwrite massal).");
  } catch (err) {
    console.error("❌ Gagal:", err.message);
    process.exit(1);
  }
})();
