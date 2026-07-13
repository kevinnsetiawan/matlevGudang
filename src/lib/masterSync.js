// Sinkron master-table Supabase (load/sync/seed) + helper Sub Gudang & peta lokasi
// + decode Plus Code alamat. Dipindah dari App.jsx (refactor Fase 3f).
import { supabase } from "../supabaseClient.js";
import { decode as olcDecode, isFull as olcIsFull, recoverNearest as olcRecoverNearest } from "./openLocationCode.js";

// Satpam, Tim Mutu, UIT, UPT, Gudang, Lokasi dulu hanya tersimpan di
// localStorage/CLOUD (per-browser, tidak sinkron antar device/user). Sekarang
// disimpan sebagai baris asli di Supabase: 1 baris = {id, data jsonb, ...kolom
// relasi}. Kolom `data` menyimpan object JS apa adanya (field-nya beragam dan
// berkembang seiring waktu, mis. lokasi punya mapX/mapY/pendingData/jenisArea
// yang tidak semua dipakai di semua baris) — kolom id/relasi/status dipisah
// supaya tetap bisa di-query/relasikan di Supabase Studio, tapi tidak perlu
// mendaftar ulang setiap field yang mungkin ada.
// Blok (Lokasi) bisa diplot koordinatnya lewat 2 denah berbeda: denah Gudang keseluruhan
// (mapX/mapY, terhadap gdg.denahImageData) ATAU denah Sub Gudang (subMapX/subMapY, terhadap
// sg.denahImageData, kalau blok itu di-assign ke sebuah Sub Gudang). Dulu "Lihat di Peta
// Gudang" di Data Stok cuma cek mapX/gdg.denahImageData, jadi blok yang koordinatnya sudah
// diplot lewat denah Sub Gudang tetap dianggap "belum diplot" — bug ditemukan 2026-07-09.
// Singkatan 3 huruf dari nama Sub Gudang, dipakai sebagai tag di depan kode blok supaya
// blok yang namanya sama antar Sub Gudang tetap terbedakan (mis. "Terbuka" vs "Tertutup"
// -> TRB vs TRT). Sengaja pakai huruf pertama + konsonan berikutnya, bukan 3 huruf pertama,
// supaya nama berawalan sama ("Ter...") tidak tabrakan jadi singkatan yang sama.
export function subGudangAbbr(nama) {
  const clean = (nama||"").toUpperCase().replace(/[^A-Z ]/g,"").replace(/\bSUB\b|\bGUDANG\b/g," ").replace(/\s+/g," ").trim();
  const letters = clean.replace(/ /g,"");
  if (!letters) return "";
  const consonants = letters[0] + letters.slice(1).replace(/[AEIOU]/g,"");
  return (consonants.length>=3 ? consonants : letters).slice(0,3);
}

// Peta id Sub Gudang -> kode 3 huruf yang DIJAMIN unik dalam satu Gudang. Kalau dua Sub
// Gudang menghasilkan singkatan sama (mis. dua nama beda tapi konsonannya kebetulan sama),
// yang berikutnya diberi akhiran angka (TRB, TR2, TR3, ...) supaya setiap Sub Gudang punya
// kode masing-masing. Kode manual (sg.kode) kalau diisi dihormati & tetap dijaga uniknya.
export function subGudangKodeMap(subs) {
  const used = new Set();
  const map = {};
  subs.forEach(sg => {
    if (sg.kode?.trim()) { const k = sg.kode.trim().toUpperCase().slice(0,3); map[sg.id] = k; used.add(k); }
  });
  subs.forEach(sg => {
    if (map[sg.id]) return;
    const base = subGudangAbbr(sg.nama) || "SGD";
    let kode = base, n = 1;
    while (used.has(kode)) { n++; kode = (base.slice(0,2) + n).slice(0,3); }
    used.add(kode); map[sg.id] = kode;
  });
  return map;
}

export function getLokasiPetaInfo(lok, gdg, subGudangList) {
  if (!lok) return null;
  if (lok.subGudangId && lok.subMapX != null) {
    const sg = subGudangList.find(s => s.id === lok.subGudangId);
    if (sg?.denahImageData) return { denahImageData: sg.denahImageData, x: lok.subMapX, y: lok.subMapY, subGudang: sg };
  }
  if (gdg?.denahImageData && lok.mapX != null) {
    return { denahImageData: gdg.denahImageData, x: lok.mapX, y: lok.mapY, subGudang: null };
  }
  return null;
}

export const SURABAYA_REF_LAT = -7.2575, SURABAYA_REF_LNG = 112.7521; // titik tengah Surabaya, dipakai sbg referensi decode Plus Code pendek (offline, tanpa API)

// Cari & decode Google Maps Plus Code (cth "MPJG+4JX, Ketintang, Gayungan, Surabaya, East Java 60231")
// dari teks alamat bebas → {lat,lng}. Plus Code pendek di-recover memakai titik tengah Surabaya
// sebagai referensi (akurat selama lokasinya memang di area Surabaya). Tidak butuh internet/API key.
export function extractLatLngFromAddress(text) {
  if (!text) return null;
  const m = (text.match(/[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}/i) || [])[0];
  if (!m) return null;
  try {
    const code = m.toUpperCase();
    const full = olcIsFull(code) ? code : olcRecoverNearest(code, SURABAYA_REF_LAT, SURABAYA_REF_LNG);
    const area = olcDecode(full);
    return { lat: Math.round(area.latitudeCenter*1e6)/1e6, lng: Math.round(area.longitudeCenter*1e6)/1e6 };
  } catch (e) {
    return null;
  }
}

export async function loadMasterTable(table) {
  if (!supabase) return null;
  const { data, error } = await supabase.from(table).select("*");
  if (error) { console.error(`loadMasterTable(${table})`, error); return null; }
  return data.map(row => ({ ...row.data, id: row.id }));
}

// extraCols(item) => kolom tambahan per baris (FK/status) di luar id & data, opsional
export async function syncMasterTable(table, list, extraCols) {
  if (!supabase) return false;
  const rows = list.map(item => ({
    id: item.id,
    data: item,
    created_at: item.createdAt ?? Date.now(),
    ...(extraCols ? extraCols(item) : {}),
  }));
  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
    if (error) { console.error(`syncMasterTable upsert(${table})`, error); return false; }
  }
  // PENGAMANAN KRITIS (2026-07-07): kalau `list` yang dikirim KOSONG, JANGAN lanjut ke
  // reconciliation-delete di bawah. Ditemukan lewat bug nyata: state React (mis. opnameList)
  // sempat kosong karena race/stale closure saat submit, ke-pass sebagai [] ke sini — hasilnya
  // SEMUA baris tabel (termasuk sesi Stock Opname 217 item yang sudah lengkap) ikut terhapus,
  // padahal user tidak pernah minta hapus apa pun. Data yang state-nya benar-benar kosong akan
  // gagal keluar dari cabang ini, tapi itu jauh lebih aman daripada menghapus data produksi
  // karena state belum sempat ter-load. Hapus satu sesi tetap aman (deleteOpname dkk.
  // menghasilkan list yang masih berisi N-1 item, bukan kosong, kecuali baris terakhir — kasus
  // itu sengaja dibiarkan tidak terhapus dari Supabase, harus dihapus manual kalau memang perlu).
  if (list.length === 0) return true;
  const { data: existing, error: selErr } = await supabase.from(table).select("id");
  if (selErr) { console.error(`syncMasterTable select(${table})`, selErr); return false; }
  const currentIds = new Set(list.map(i => i.id));
  const toDelete = (existing || []).filter(r => !currentIds.has(r.id)).map(r => r.id);
  if (toDelete.length) {
    const { error: delErr } = await supabase.from(table).delete().in("id", toDelete);
    if (delErr) { console.error(`syncMasterTable delete(${table})`, delErr); return false; }
  }
  return true;
}

// Seed Supabase sekali dari DEFAULT_* kalau tabelnya masih kosong (instalasi pertama kali)
export async function seedMasterTableIfEmpty(table, defaults, extraCols) {
  if (!supabase || !defaults?.length) return defaults || [];
  const existing = await loadMasterTable(table);
  if (existing === null) return defaults; // Supabase tidak terkonfigurasi/error — fallback lokal
  if (existing.length > 0) return existing;
  await syncMasterTable(table, defaults, extraCols);
  return defaults;
}

// Upsert APPEND-ONLY (tidak pernah delete baris lain) — dipakai untuk domain
// audit-log seperti Health Index Material Cadang (imports/runs/health_results/
// ai_insights/apply_audit) yang tumbuh terus, bukan "daftar aktif" seperti
// katalog/stocks. localStorage/CLOUD tetap sumber utama UI (dibaca saat load),
// Supabase di sini murni backup/audit-trail — jadi tidak perlu delete-sync
// simetris seperti syncMasterTable, cukup upsert baris baru saja.
export async function syncMaterialCadangRows(table, rows, mapFn) {
  if (!supabase || !rows?.length) return false;
  const mapped = rows.map(mapFn);
  const { error } = await supabase.from(table).upsert(mapped, { onConflict: "id" });
  if (error) { console.error(`syncMaterialCadangRows upsert(${table})`, error); return false; }
  return true;
}
