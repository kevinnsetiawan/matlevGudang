// Tool-use registry untuk chat "Pak War" (App.jsx sendChat). LLM memilih TOOL lewat
// function-calling Groq, kode di sini menjalankan query DETERMINISTIK atas data nyata
// (reuse fungsi pure analytics.js/ragShared.mjs yang sudah ada+teruji Tier 1), lalu
// balikin JSON kecil apa adanya — LLM tinggal merangkai kalimat, bukan menghitung/
// meranking sendiri dari dump teks snapshot (itu yang bikin halusinasi angka).
//
// ctx = { stocks: scopedEnrichedStocks, katalogList, txns: scopedTxns, uptNama }
import { getKritisAgg } from "./ragShared.mjs";
import { getMaterialAkanHabis, buildMonthlySeriesByKatalog, getTopStockByQty, getTotalPerSatuan } from "./analytics.js";

export const pakwarTools = [
  {
    name: "top_stock_by_qty",
    description: "Ranking material dengan stok (qty) terbanyak, dikelompokkan per satuan (beda satuan tidak bisa dibandingkan langsung). Pakai untuk pertanyaan 'stok paling banyak/terbanyak'.",
    parameters: {
      type: "object",
      properties: { n: { type: "integer", description: "Jumlah item per satuan, default 10" } },
    },
    run(args, ctx) {
      return { groups: getTopStockByQty(ctx.stocks, ctx.katalogList, args?.n || 10) };
    },
  },
  {
    name: "top_stock_by_value",
    description: "Ranking material dengan nilai (qty x harga) terbesar. Pakai untuk pertanyaan 'termahal/nilai terbesar'.",
    parameters: {
      type: "object",
      properties: { n: { type: "integer", description: "Jumlah item, default 10" } },
    },
    run(args, ctx) {
      const n = args?.n || 10;
      const items = [...(ctx.stocks || [])]
        .sort((a, b) => (b.qty * b.price || 0) - (a.qty * a.price || 0))
        .slice(0, n)
        .map(s => ({ name: s.name, katalog: s.katalog, qty: s.qty, unit: s.unit, price: s.price, nilai: Math.round((s.qty || 0) * (s.price || 0)), lokasi: s.lokasi || "-" }));
      return { items };
    },
  },
  {
    name: "stok_kritis",
    description: "Daftar material yang stoknya sudah di bawah atau sama dengan batas minimum (kritis). Pakai untuk pertanyaan soal material kritis/hampir habis/di bawah minimum.",
    parameters: { type: "object", properties: {} },
    run(_args, ctx) {
      const monthly = buildMonthlySeriesByKatalog(ctx.txns, ctx.stocks);
      const list = getKritisAgg(ctx.stocks, monthly).map(s => ({ name: s.name, katalog: s.katalog, qty: s.qty, unit: s.unit, minQty: s.minQty, lokasi: s.lokasi || "-" }));
      return { count: list.length, items: list };
    },
  },
  {
    name: "proyeksi_stok_habis",
    description: "Proyeksi material yang akan habis berdasarkan rata-rata pemakaian bulanan, diurutkan dari paling mendesak. Pakai untuk pertanyaan soal forecast/proyeksi/kapan habis.",
    parameters: {
      type: "object",
      properties: { n: { type: "integer", description: "Jumlah item, default 10" } },
    },
    run(args, ctx) {
      const list = getMaterialAkanHabis(ctx.stocks, ctx.katalogList, ctx.txns, args?.n || 10);
      return { items: list.map(f => ({ nama: f.nama, katalog: f.katalog, totalQty: f.totalQty, satuan: f.satuan, avgPerBulan: f.avgPerBulan, estimasiHari: f.estimasiHari, isKritis: f.isKritis })) };
    },
  },
  {
    name: "cari_material",
    description: "Cari material spesifik berdasarkan nama atau kode katalog. Pakai saat user menyebut nama/kode material tertentu.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Kata kunci nama atau kode katalog material" } },
      required: ["query"],
    },
    run(args, ctx) {
      const q = String(args?.query || "").toLowerCase().trim();
      if (!q) return { items: [] };
      const items = (ctx.stocks || [])
        .filter(s => `${s.name || ""} ${s.katalog || ""}`.toLowerCase().includes(q))
        .map(s => ({ name: s.name, katalog: s.katalog, qty: s.qty, unit: s.unit, lokasi: s.lokasi || "-" }));
      return { items };
    },
  },
  {
    name: "total_inventori",
    description: "Ringkasan total inventori: jumlah item, total nilai Rp, dan total qty per satuan. Pakai untuk pertanyaan umum soal kondisi gudang secara keseluruhan.",
    parameters: { type: "object", properties: {} },
    run(_args, ctx) {
      const totalItem = (ctx.stocks || []).length;
      const totalNilai = Math.round((ctx.stocks || []).reduce((a, s) => a + (s.qty || 0) * (s.price || 0), 0));
      return { totalItem, totalNilai, totalPerSatuan: getTotalPerSatuan(ctx.stocks) };
    },
  },
];

// Skema OpenAI-compatible utk dikirim ke Groq (`tools` di body request).
export const pakwarToolSchemas = pakwarTools.map(t => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

// Jalankan satu tool_call dari respons Groq. `call.function.arguments` adalah string JSON.
// Balikin string JSON (buat dikirim balik sebagai pesan role:"tool"). Kalau tool tidak
// dikenal / argumen invalid / run() error, balikin { error } — jangan throw (biar loop
// tool-calling di sendChat tetap jalan, LLM yang urus pesan error ke user).
export function runPakwarTool(call, ctx) {
  const name = call?.function?.name;
  const tool = pakwarTools.find(t => t.name === name);
  if (!tool) return JSON.stringify({ error: `Tool tidak dikenal: ${name}` });
  try {
    const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    return JSON.stringify(tool.run(args, ctx));
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
