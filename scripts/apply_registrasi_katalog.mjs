// Registrasi katalog Material Cadang -> tabel `katalog` self-host.
// Pola sama nightly_sync.mjs: createClient(SUPABASE_URL, SUPABASE_SECRET_KEY) [service_role].
// DRY-RUN default (tak menulis). Tulis hanya dengan flag --apply.
// Jalankan: node --env-file=.env scripts/apply_registrasi_katalog.mjs [--apply]
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import fs from "node:fs";

const FILE = process.env.REG_FILE ||
  "D:\\CLAUDE\\WARNOTO data\\Data Material HAR\\REGISTRASI_Katalog_MaterialCadang_2026-08-09.xlsx";
const APPLY = process.argv.includes("--apply");
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) { console.error("Env SUPABASE_URL / SUPABASE_SECRET_KEY belum di-set."); process.exit(1); }

// baca registrasi
const wb = XLSX.read(fs.readFileSync(FILE));
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
const payload = rows.filter(r => r.id && r.katalog).map(r => ({
  id: String(r.id).trim(),
  data: {
    name: String(r.name || "").trim(),
    katalog: String(r.katalog).trim(),
    satuan: String(r.satuan || "").trim(),
    jenisBarang: String(r.jenisBarang || "").trim(),
    merk: String(r.merk || "").trim(),
    keterangan: String(r.keterangan || "").trim(),
    type: "",
    createdAt: Number(r.createdAt) || Date.now(),
  },
}));

console.log("TARGET  :", URL.replace(/(https?:\/\/)([^.]+)/, "$1***"));  // masked host prefix
console.log("FILE    :", FILE);
console.log("KATALOG :", payload.length, "baris siap upsert (onConflict=id, ignoreDuplicates=true)");
console.log("SAMPLE  :", JSON.stringify(payload[0]));
console.log("SATUAN kosong:", payload.filter(p => !p.data.satuan).length);

if (!APPLY) { console.log("\n[DRY-RUN] tidak menulis. Tambah --apply untuk eksekusi."); process.exit(0); }

const supabase = createClient(URL, KEY);
// cek jumlah katalog sebelum
const before = await supabase.from("katalog").select("id", { count: "exact", head: true });
console.log("katalog SEBELUM:", before.count);
// upsert per chunk, ignoreDuplicates -> tidak menimpa katalog existing
let done = 0;
for (let i = 0; i < payload.length; i += 200) {
  const chunk = payload.slice(i, i + 200);
  const { error } = await supabase.from("katalog").upsert(chunk, { onConflict: "id", ignoreDuplicates: true });
  if (error) { console.error("ERROR chunk", i, error.message); process.exit(1); }
  done += chunk.length;
  console.log(`  upsert ${done}/${payload.length}`);
}
const after = await supabase.from("katalog").select("id", { count: "exact", head: true });
console.log("katalog SESUDAH:", after.count, "(+", after.count - before.count, "baru)");
console.log("SELESAI.");
