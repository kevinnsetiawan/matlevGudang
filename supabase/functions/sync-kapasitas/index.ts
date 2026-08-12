// @ts-nocheck -- Supabase Edge Function (Deno), bukan runtime Vite.
// Sinkron data Kapasitas Gudang LANGSUNG dari Google Sheet UIT JBM.
// Kenapa Edge Function (bukan tombol fetch di browser): Google Sheets export CSV
// TIDAK mengirim header CORS, jadi fetch() dari warnoto.com diblokir browser.
// Fetch di sisi server (Deno) bebas CORS. Menulis master pakai service_role
// (bypass RLS) — makanya WAJIB di server, dan hanya boleh dipanggil ADMIN/SUPERADMIN.
//
// Semantik sync (sengaja beda per-tabel):
//   - gudang & sub_gudang : create-if-missing (ON CONFLICT DO NOTHING) — JANGAN timpa
//     denah/koordinat/edit manual user yang sudah ada.
//   - warehouse_capacity  : upsert (DO UPDATE) — metrik luas/komposisi/status memang
//     harus di-refresh dari sheet (ini inti "sinkron").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "https://deno.land/std@0.224.0/csv/parse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Sheet sumber (tab kapasitas UIT JBM). Kalau sheet pindah, ganti di sini saja.
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1GND76s06KHIWtwLrmnmNPBmn46sDRJD9kVre5F5_sq8/export?format=csv&gid=361941646";

const UPT_MAP: Record<string, string> = {
  SURABAYA: "UPT-SBY", MALANG: "UPT-MLG", MADIUN: "UPT-MDN",
  PROBOLINGGO: "UPT-PBG", BALI: "UPT-BLI", GRESIK: "UPT-GRS",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const clean = (s: string) => String(s ?? "").replace(/\r/g, " ").replace(/\s+/g, " ").trim();
const dashId = (s: string) => s.replace(/\s+/g, "-").toUpperCase();
const numId = (s: string) => { // luas: koma = desimal, titik = ribuan
  const v = parseFloat(String(s ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const coord = (s: string) => { // koordinat: titik = desimal
  const v = parseFloat(String(s ?? "").trim());
  return Number.isFinite(v) ? v : null;
};
const pct = (s: string) => { // -> fraksi 0..1
  const raw = String(s ?? "").trim();
  if (!raw) return 0;
  const hadPct = raw.includes("%");
  const v = parseFloat(raw.replace(/%/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(v)) return 0;
  if (hadPct) return v / 100;
  return v > 1 ? v / 100 : v;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "server misconfigured" }, 500);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- Otorisasi: hanya ADMIN / SUPERADMIN ---
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: uData, error: uErr } = await svc.auth.getUser(jwt);
  if (uErr || !uData?.user) return json({ error: "invalid token" }, 401);
  const { data: prof } = await svc.from("profiles").select("role").eq("id", uData.user.id).single();
  if (!prof || !["ADMIN", "SUPERADMIN"].includes(prof.role)) return json({ error: "forbidden" }, 403);

  // --- Ambil sheet (server-side, bebas CORS) ---
  let csv: string;
  try {
    const res = await fetch(SHEET_CSV_URL, { redirect: "follow" });
    if (!res.ok) return json({ error: `gagal ambil sheet (HTTP ${res.status})` }, 502);
    csv = await res.text();
  } catch (e) {
    return json({ error: "gagal ambil sheet: " + String(e?.message || e) }, 502);
  }

  const rows = parse(csv) as string[][];
  const hi = rows.findIndex((r) => (r[0] || "").trim().toUpperCase() === "UPT" && r.some((c) => (c || "").trim().toUpperCase() === "GUDANG"));
  if (hi < 0) return json({ error: "header (UPT/GUDANG/SUB GUDANG) tidak ditemukan di sheet" }, 422);

  const now = Date.now();
  const batch = "SHEETSYNC-" + new Date().toISOString().slice(0, 10);
  const gudangById: Record<string, any> = {};
  const subById: Record<string, any> = {};
  const caps: any[] = [];
  let skipped = 0;

  for (const r of rows.slice(hi + 1)) {
    const uptRaw = (r[0] || "").trim().toUpperCase();
    if (!uptRaw) continue;
    const uptId = UPT_MAP[uptRaw];
    const gudang = clean(r[1]);
    const sub = clean(r[2]);
    if (!uptId || !gudang || !sub) { skipped++; continue; }

    const gudangId = "GDG-CAP-" + uptRaw + "-" + gudang.replace(/ /g, "-");
    const sgId = dashId("SGD-CAP-" + uptRaw + "-" + gudang + "-" + sub);
    const capId = dashId("CAP-" + uptRaw + "-" + gudang + "-" + sub);
    const ll = numId(r[7]), lt = numId(r[8]);
    const sisa = ll > 0 ? ll - lt : numId(r[9]);
    const ptk = ll > 0 ? lt / ll : pct(r[10]);
    const status = ptk >= 0.9 ? "KRITIS" : ptk >= 0.75 ? "WASPADA" : "AMAN";

    if (!gudangById[gudangId]) gudangById[gudangId] = {
      id: gudangId, upt_id: uptId,
      data: { id: gudangId, uptId, nama: gudang, kode: "", lat: (r[5] || "").trim(), lng: (r[6] || "").trim(), alamat: clean(r[4]), sourceCapacityImport: true, createdAt: now },
      created_at: now,
    };
    if (!subById[sgId]) subById[sgId] = {
      id: sgId, gudang_id: gudangId,
      data: { id: sgId, nama: sub, gudangId, createdAt: now, sourceCapacityImport: true },
      created_at: now,
    };
    caps.push({
      id: capId, upt: uptRaw, gudang, sub_gudang: sub, type_gudang: clean(r[3]), alamat: clean(r[4]),
      latitude: coord(r[5]), longitude: coord(r[6]),
      luas_lahan_m2: ll, luas_terpakai_m2: lt, sisa_luas_m2: sisa, persentase_terpakai: ptk,
      persediaan_pct: pct(r[11]), cadang_pct: pct(r[12]), pre_memory_pct: pct(r[13]), attb_pct: pct(r[14]), lainnya_pct: pct(r[15]),
      status_kapasitas: status, contact_person: clean(r[17]), waktu_update: clean(r[18]),
      keterangan: clean(r[19]), link_gudang: clean(r[23] || ""), mapping_status: "UNMATCHED",
      import_batch_id: batch, updated_at: new Date().toISOString(),
    });
  }

  const gudangRows = Object.values(gudangById);
  const subRows = Object.values(subById);
  if (caps.length === 0) return json({ error: "tidak ada baris valid di sheet", skipped }, 422);

  // gudang & sub_gudang: create-if-missing (jaga edit manual). warehouse_capacity: refresh.
  const e1 = (await svc.from("gudang").upsert(gudangRows, { onConflict: "id", ignoreDuplicates: true })).error;
  const e2 = (await svc.from("sub_gudang").upsert(subRows, { onConflict: "id", ignoreDuplicates: true })).error;
  const e3 = (await svc.from("warehouse_capacity").upsert(caps, { onConflict: "id" })).error;
  const err = e1 || e2 || e3;
  if (err) return json({ error: "gagal simpan: " + err.message }, 500);

  return json({
    ok: true,
    gudang: gudangRows.length, sub_gudang: subRows.length, kapasitas: caps.length, skipped,
    batch,
  });
});
