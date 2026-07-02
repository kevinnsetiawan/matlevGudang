// WARNOTO — Sinkron Knowledge Base bot WA/Telegram, jalan tiap malam via GitHub Actions
// (jaminan cadangan tanpa perlu browser Admin terbuka sama sekali).
//
// Cakupan (dibatasi oleh data apa yang benar-benar ada di Supabase, tanpa browser):
//   - stocks_snapshot (qty/harga/lokasi/kode katalog SAP) -> chunk RAG "katalog" (nama, qty,
//     harga Rupiah, status SAP/Non-SAP, lokasi fisik gudang+blok). PENTING: tabel `katalog`
//     terpisah di Supabase TIDAK PERNAH disinkron App.jsx (orphan/basi) -- stocks_snapshot
//     dipakai sebagai satu-satunya sumber, sengaja TIDAK join ke tabel `katalog`.
//   - ai_faq_curated (jawaban resmi hasil kurasi Admin) -> chunk RAG "faq"
//   - tug15_history 6 bulan terakhir -> chunk RAG ringkas "mutasi" (bukan detail TUG penuh
//     seperti nama pekerjaan/lokasi -- itu cuma ada di state browser, lihat catatan di README)
//   - warnoto_state: top-20 by value + stok kritis dari stocks_snapshot (TIDAK termasuk TUG
//     pending approval / rencana kedatangan -- data itu cuma ada di state browser, auto-sync
//     client-side 90 detik yang meng-cover itu selama ada Admin yang aktif pakai web)
//
// Jadi nightly ini adalah "jaminan cadangan untuk data inventori", bukan pengganti penuh
// auto-sync client-side -- keduanya saling melengkapi (lihat App.jsx saveToCloud).
//
// Env vars (GitHub Secrets, sama seperti ml/train_forecast.py):
//   SUPABASE_URL, SUPABASE_SECRET_KEY (service_role), COHERE_API_KEY

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const COHERE_API_KEY = process.env.COHERE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !COHERE_API_KEY) {
  console.error("Env var SUPABASE_URL / SUPABASE_SECRET_KEY / COHERE_API_KEY belum di-set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

function fmtNum(n) {
  return Math.round(n || 0).toLocaleString("id-ID");
}

async function cohereEmbed(texts, inputType) {
  const resp = await fetch("https://api.cohere.com/v1/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${COHERE_API_KEY}` },
    body: JSON.stringify({ model: "embed-multilingual-v3.0", texts, input_type: inputType }),
  });
  if (!resp.ok) throw new Error(`Cohere embed gagal (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  return data.embeddings;
}

// Replika persis getSAPLabel() di App.jsx -- deterministik dari kode katalog SAP,
// aman diduplikasi di sini (bukan di-import, karena App.jsx bukan modul Node biasa).
function getSAPLabel(kodeKatalog) {
  if (!kodeKatalog || kodeKatalog.trim() === "") return "Non-SAP";
  const k = kodeKatalog.trim();
  if (/^\d{10}$/.test(k)) return "SAP — Cadang";
  if (/^\d{7,8}$/.test(k)) return "SAP — Persediaan";
  return "Non-SAP";
}

async function main() {
  console.log("=== WARNOTO nightly_sync mulai ===", new Date().toISOString());

  const [{ data: stocks, error: eStock }, { data: faqRows, error: eFaq }, { data: mutasi, error: eMut }] = await Promise.all([
    supabase.from("stocks_snapshot").select("*"),
    supabase.from("ai_faq_curated").select("*").eq("is_active", true),
    supabase.from("tug15_history").select("*").gte("tanggal", new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)).limit(500),
  ]);
  if (eStock) throw eStock;
  if (eFaq) throw eFaq;
  if (eMut) throw eMut;

  // Group per katalog_id (bisa ada beberapa baris stocks_snapshot untuk katalog yang sama,
  // 1 per lokasi/blok) -- stocks_snapshot sendiri sudah cukup lengkap (nama/satuan/jenis/
  // kode katalog SAP/lokasi), tidak perlu join ke tabel `katalog` yang basi.
  const grouped = {};
  (stocks || []).forEach((s) => {
    const key = s.katalog_id || s.id;
    if (!grouped[key]) grouped[key] = { nama: s.nama, satuan: s.satuan, jenisBarang: s.jenis_barang, kodeKatalog: s.kode_katalog, harga: s.harga || 0, minQty: s.min_qty || 0, qty: 0, locations: [] };
    grouped[key].qty += s.qty || 0;
    if (s.qty > 0) grouped[key].locations.push({ gudang: s.gudang_nama || "Gudang tidak diketahui", blok: s.lokasi_kode || "-", qty: s.qty });
  });

  const katalogChunks = Object.entries(grouped).map(([katalogId, d]) => {
    const sap = getSAPLabel(d.kodeKatalog);
    const angka = ` Qty saat ini: ${fmtNum(d.qty)} ${d.satuan || "-"}. Harga satuan: Rp ${fmtNum(d.harga)}. Nilai total: Rp ${fmtNum(d.qty * d.harga)}.`;
    const lokasiText = d.locations.length === 0 ? " Lokasi: belum diisi." : ` Lokasi fisik: ${d.locations.map((l) => `${fmtNum(l.qty)} ${d.satuan || ""} di ${l.gudang} blok ${l.blok}`).join("; ")}.`;
    return {
      id: `katalog_${katalogId}`,
      source_type: "katalog",
      source_id: katalogId,
      content: `Material: ${d.nama}. Nomor Katalog: ${d.kodeKatalog || "-"}. Jenis Barang: ${d.jenisBarang || "-"}. Satuan: ${d.satuan || "-"}. Status: ${sap}.${angka}${lokasiText}`,
    };
  });

  const faqChunks = (faqRows || []).map((f) => ({
    id: `faq_${f.id}`,
    source_type: "faq",
    source_id: String(f.id),
    content: `Pertanyaan: ${f.pertanyaan}\nJawaban resmi (kurasi Admin): ${f.jawaban}`,
  }));

  // Ringkas per katalog (bukan per transaksi individual -- tug15_history tidak bawa nama
  // pekerjaan/lokasi lengkap seperti "txns" di browser) supaya tetap ada sinyal pemakaian.
  const mutasiByKatalog = {};
  (mutasi || []).forEach((m) => {
    if (!mutasiByKatalog[m.katalog_id]) mutasiByKatalog[m.katalog_id] = { masuk: 0, keluar: 0, count: 0 };
    if (m.jenis_transaksi === "MASUK") mutasiByKatalog[m.katalog_id].masuk += Number(m.qty) || 0;
    else mutasiByKatalog[m.katalog_id].keluar += Number(m.qty) || 0;
    mutasiByKatalog[m.katalog_id].count += 1;
  });
  const mutasiChunks = Object.entries(mutasiByKatalog).map(([katalogId, d]) => {
    const nama = grouped[katalogId]?.nama || katalogId;
    return {
      id: `mutasi_${katalogId}`,
      source_type: "mutasi",
      source_id: katalogId,
      content: `Ringkasan mutasi 6 bulan terakhir untuk ${nama}: Masuk ${fmtNum(d.masuk)}, Keluar ${fmtNum(d.keluar)}, dari ${d.count} transaksi.`,
    };
  });

  const allChunks = [...katalogChunks, ...faqChunks, ...mutasiChunks];
  console.log(`Total chunk: ${allChunks.length} (${katalogChunks.length} katalog, ${faqChunks.length} faq, ${mutasiChunks.length} mutasi)`);

  const BATCH = 90;
  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const vectors = await cohereEmbed(batch.map((c) => c.content), "search_document");
    const rows = batch.map((c, idx) => ({ ...c, embedding: vectors[idx], updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("rag_chunks").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    console.log(`  embed batch ${i}-${i + batch.length} OK`);
  }

  // Hapus chunk katalog/faq/mutasi lama yang sumbernya sudah tidak ada -- TIDAK menyentuh
  // source_type='txn' (itu domain client-side sync, punya siklus hidup sendiri).
  const currentIds = new Set(allChunks.map((c) => c.id));
  const { data: existing } = await supabase.from("rag_chunks").select("id").in("source_type", ["katalog", "faq", "mutasi"]);
  const toDelete = (existing || []).filter((r) => !currentIds.has(r.id)).map((r) => r.id);
  if (toDelete.length) {
    await supabase.from("rag_chunks").delete().in("id", toDelete);
    console.log(`  hapus ${toDelete.length} chunk basi`);
  }

  // warnoto_state: top-20 by value + stok kritis dari stocks_snapshot (server-side, tanpa TUG
  // pending/rencana kedatangan -- lihat catatan cakupan di atas file).
  const enriched = (stocks || []).map((s) => ({ ...s, nilai: (s.qty || 0) * (s.harga || 0) }));
  const top20 = [...enriched].sort((a, b) => b.nilai - a.nilai).slice(0, 20);
  const kritis = enriched.filter((s) => s.min_qty > 0 && s.qty <= s.min_qty);
  const state_data = {
    generatedAt: new Date().toISOString(),
    generatedBy: "nightly_sync.mjs (cron)",
    totalItem: enriched.length,
    totalNilaiRp: Math.round(enriched.reduce((a, s) => a + s.nilai, 0)),
    top20ByValue: top20.map((s) => ({ nama: s.nama, katalog: s.kode_katalog, qty: s.qty, satuan: s.satuan, hargaSatuan: s.harga, nilaiRp: Math.round(s.nilai), status: getSAPLabel(s.kode_katalog), gudang: s.gudang_nama, blok: s.lokasi_kode })),
    materialKritis: kritis.map((s) => ({ nama: s.nama, katalog: s.kode_katalog, qty: s.qty, satuan: s.satuan, minQty: s.min_qty, gudang: s.gudang_nama, blok: s.lokasi_kode })),
  };
  await supabase.from("warnoto_state").insert({ state_data, version: "v1-nightly" });

  await supabase.from("wa_sync_status").upsert(
    { sync_type: "rag_knowledge_base", last_synced_at: new Date().toISOString(), synced_by: "nightly_sync.mjs", record_count: allChunks.length, status: "OK" },
    { onConflict: "sync_type" }
  );

  console.log("=== WARNOTO nightly_sync selesai ===");
}

main().catch(async (err) => {
  console.error("nightly_sync GAGAL:", err);
  try {
    await supabase.from("wa_sync_status").upsert(
      { sync_type: "rag_knowledge_base", last_synced_at: new Date().toISOString(), synced_by: "nightly_sync.mjs", status: "ERROR", error_message: String(err.message || err) },
      { onConflict: "sync_type" }
    );
  } catch {}
  process.exit(1);
});
