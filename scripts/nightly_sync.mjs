// WARNOTO — Sinkron Knowledge Base bot WA/Telegram, jalan tiap malam via GitHub Actions
// (jaminan cadangan tanpa perlu browser Admin terbuka sama sekali).
//
// Cakupan (dibatasi oleh data apa yang benar-benar ada di Supabase, tanpa browser):
//   - Master Katalog + stocks_snapshot (qty/harga) -> chunk RAG "katalog" (dengan angka Rupiah)
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

async function main() {
  console.log("=== WARNOTO nightly_sync mulai ===", new Date().toISOString());

  const [{ data: katalogList, error: eKat }, { data: stocks, error: eStock }, { data: faqRows, error: eFaq }, { data: mutasi, error: eMut }] = await Promise.all([
    supabase.from("katalog").select("*"),
    supabase.from("stocks_snapshot").select("*"),
    supabase.from("ai_faq_curated").select("*").eq("is_active", true),
    supabase.from("tug15_history").select("*").gte("tanggal", new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)).limit(500),
  ]);
  if (eKat) throw eKat;
  if (eStock) throw eStock;
  if (eFaq) throw eFaq;
  if (eMut) throw eMut;

  const stockByKatalog = {};
  (stocks || []).forEach((s) => {
    if (!s.katalog_id) return;
    if (!stockByKatalog[s.katalog_id]) stockByKatalog[s.katalog_id] = { qty: 0, harga: s.harga || 0 };
    stockByKatalog[s.katalog_id].qty += s.qty || 0;
  });

  const katalogChunks = (katalogList || []).map((k) => {
    const si = stockByKatalog[k.id];
    const angka = si
      ? ` Qty saat ini: ${fmtNum(si.qty)} ${k.satuan || "-"}. Harga satuan: Rp ${fmtNum(si.harga)}. Nilai total: Rp ${fmtNum(si.qty * si.harga)}.`
      : " Belum ada data stok untuk material ini.";
    return {
      id: `katalog_${k.id}`,
      source_type: "katalog",
      source_id: k.id,
      content: `Material: ${k.nama}. Nomor Katalog: ${k.id}. Kategori: ${k.kategori || "-"}. Jenis Barang: ${k.jenis_barang || "-"}. Satuan: ${k.satuan || "-"}.${angka}`,
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
    const kat = (katalogList || []).find((k) => k.id === katalogId);
    return {
      id: `mutasi_${katalogId}`,
      source_type: "mutasi",
      source_id: katalogId,
      content: `Ringkasan mutasi 6 bulan terakhir untuk ${kat?.nama || katalogId}: Masuk ${fmtNum(d.masuk)}, Keluar ${fmtNum(d.keluar)}, dari ${d.count} transaksi.`,
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
    top20ByValue: top20.map((s) => ({ nama: s.nama, katalog: s.katalog_id, qty: s.qty, satuan: s.satuan, hargaSatuan: s.harga, nilaiRp: Math.round(s.nilai) })),
    materialKritis: kritis.map((s) => ({ nama: s.nama, katalog: s.katalog_id, qty: s.qty, satuan: s.satuan, minQty: s.min_qty })),
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
