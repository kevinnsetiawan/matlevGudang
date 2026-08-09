// Fungsi agregasi MURNI (tanpa I/O) untuk tool-use bot Telegram Tier 2 — dites langsung oleh
// Node (tests/unit/telegramTools.test.mjs) tanpa Deno/DB. Plain JS (bukan .ts) supaya file yang
// sama bisa diimpor apa adanya oleh index.ts (Deno) MAUPUN Node test, tanpa transpile.
//
// Input `stocks`: array stock row sudah DI-FLATTEN + DI-SCOPE per UPT (pola sama dengan
// scripts/nightly_sync.mjs — id, katalogId, qty, price, name, unit, minQty, katalog, lokasi),
// disiapkan index.ts dari query tabel katalog/stocks/lokasi/gudang + resolusi uptId lewat
// lokasi->gudang (uptIdFromLokasi).
//
// Rumus avgPerBulan/proyeksi MENIRU getMaterialAkanHabis (src/lib/analytics.js): rata-rata
// pemakaian = total qty KELUAR / (hari sejak transaksi tertua / 30) — BUKAN dibagi jumlah bulan
// unik yang ada datanya — supaya konsisten dengan Tier 1 web & Forecast Stok.

function groupByKatalog(stocks) {
  const g = {};
  (stocks || []).forEach((s) => {
    if (!s.katalogId) return;
    if (!g[s.katalogId]) g[s.katalogId] = { katalogId: s.katalogId, name: s.name || "", katalog: s.katalog || "", unit: s.unit || "", qty: 0, minQty: 0 };
    g[s.katalogId].qty += s.qty || 0;
    g[s.katalogId].minQty = Math.max(g[s.katalogId].minQty, s.minQty || 0);
  });
  return Object.values(g);
}

// Ranking qty terbanyak, dikelompokkan per satuan (beda satuan tak bisa dibanding qty mentah).
export function topStockByQty(stocks, n = 10) {
  const bySatuan = {};
  groupByKatalog(stocks).filter((g) => g.qty > 0).forEach((g) => {
    const unit = g.unit || "-";
    (bySatuan[unit] ||= []).push(g);
  });
  return Object.entries(bySatuan)
    .map(([unit, items]) => ({ unit, items: items.sort((a, b) => b.qty - a.qty).slice(0, n) }))
    .sort((a, b) => b.items.reduce((s, i) => s + i.qty, 0) - a.items.reduce((s, i) => s + i.qty, 0));
}

// Material qty agregat (semua lokasi) <= minimum.
export function stokKritis(stocks) {
  return groupByKatalog(stocks).filter((g) => g.minQty > 0 && g.qty <= g.minQty);
}

// Pencarian per-lokasi (bukan agregat) — user biasanya mau tahu qty+lokasi spesifik.
export function cariMaterial(stocks, query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  return (stocks || [])
    .filter((s) => `${s.name || ""} ${s.katalog || ""}`.toLowerCase().includes(q))
    .map((s) => ({ name: s.name, katalog: s.katalog, qty: s.qty, unit: s.unit, lokasi: s.lokasi || "-" }));
}

export function totalInventori(stocks) {
  const totalItem = groupByKatalog(stocks).length;
  const totalNilai = Math.round((stocks || []).reduce((a, s) => a + (s.qty || 0) * (s.price || 0), 0));
  const totalPerSatuan = {};
  (stocks || []).forEach((s) => { const u = s.unit || "-"; totalPerSatuan[u] = (totalPerSatuan[u] || 0) + (s.qty || 0); });
  return { totalItem, totalNilai, totalPerSatuan };
}

// keluarRows: baris tug15_history KELUAR (sudah discope UPT), tiap baris {katalog_id, qty, tanggal}.
export function proyeksiStokHabis(stocks, keluarRows, n = 10, now = Date.now()) {
  const usage = {};
  (keluarRows || []).forEach((r) => {
    if (!r.katalog_id || !r.tanggal) return;
    if (!usage[r.katalog_id]) usage[r.katalog_id] = { totalQty: 0, oldest: now };
    usage[r.katalog_id].totalQty += Number(r.qty) || 0;
    const ts = new Date(r.tanggal).getTime();
    if (ts < usage[r.katalog_id].oldest) usage[r.katalog_id].oldest = ts;
  });

  return groupByKatalog(stocks)
    .map((g) => {
      const u = usage[g.katalogId];
      if (!u || u.totalQty <= 0) return null;
      const bulan = Math.max(1, (now - u.oldest) / (30 * 24 * 60 * 60 * 1000));
      const avgPerBulan = u.totalQty / bulan;
      const estimasiHari = avgPerBulan > 0 ? Math.round(g.qty / (avgPerBulan / 30)) : null;
      return { nama: g.name, katalog: g.katalog, totalQty: g.qty, satuan: g.unit, avgPerBulan: Math.round(avgPerBulan), estimasiHari, isKritis: g.minQty > 0 && g.qty <= g.minQty };
    })
    .filter(Boolean)
    .sort((a, b) => a.estimasiHari - b.estimasiHari)
    .slice(0, n);
}
