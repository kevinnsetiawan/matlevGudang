// Helper analitik dashboard (top pemakaian/stok, material akan habis, ringkasan txn)
// — dipindah dari App.jsx (refactor Fase 4f).
import { fmtDate } from "./utils.js";
import { expandMonthlySeriesFromMap, computeEffectiveMinQty, meanStdev, normInv } from "./ragShared.mjs";
import { buildMonthlyDemandSeries, tsbMonthlyForecast } from "./tsbForecast.js";

// Asumsi lead time pengadaan & panjang histori minimum sebelum stok minimum dihitung otomatis
// — sama seperti konstanta di ForecastStokPage.jsx (lihat komentar di sana untuk alasan).
export const DEFAULT_LEAD_TIME_DAYS = 30;
export const MIN_HISTORY_MONTHS = 3;

// Risiko kehabisan stok satu katalog — dipindah dari getRisk() di ForecastStokPage.jsx supaya
// bisa dipakai juga oleh Dashboard (computeProcurementList) tanpa duplikasi rumus TSB/ROP.
export function computeKatalogRisk(katalog, stocks, txns) {
  const stockRows = (stocks||[]).filter(stock=>stock.katalogId===katalog.id);
  const totalQty = stockRows.reduce((sum,stock)=>sum+(stock.qty||0),0);
  const manualMinQty = stockRows.reduce((max,stock)=>Math.max(max,stock.minQty||0),0);
  const usageItems = [];
  (txns||[]).filter(txn=>["TUG9","TUG8"].includes(txn.docType)&&txn.status==="APPROVED").forEach(txn=>{
    (txn.stockItems||[]).forEach(item=>{
      const stock = (stocks||[]).find(row=>row.id===item.stockId);
      if (stock?.katalogId===katalog.id) usageItems.push({qty:item.qty||0,ts:txn.approvedAt||txn.createdAt});
    });
  });
  const monthlySeries = buildMonthlyDemandSeries(usageItems);
  const { forecastPerPeriod } = tsbMonthlyForecast(monthlySeries);
  const perDay = forecastPerPeriod/30;
  const estimatedDays = perDay>0 ? Math.round(totalQty/perDay) : Infinity;
  const { minQty, minQtySource } = computeEffectiveMinQty({
    monthlySeries, manualMinQty,
    leadTimeMonths: DEFAULT_LEAD_TIME_DAYS/30,
    minHistoryMonths: MIN_HISTORY_MONTHS,
  });
  const critical = minQty>0 && totalQty<=minQty;
  const base = {days:estimatedDays,perDay,minQty,minQtySource,monthlySeries};
  if (critical || estimatedDays<=30) return {key:"critical",label:"Kritis",...base};
  if (estimatedDays<=90) return {key:"attention",label:"Perhatian",...base};
  if (estimatedDays<=180) return {key:"watch",label:"Waspada",...base};
  return {key:"safe",label:"Aman",...base};
}

// Daftar usulan pengadaan (item Kritis/Waspada + qty usulan) — dipindah dari procurementList
// (useMemo) di ForecastStokPage.jsx supaya ringkasannya juga bisa tampil di Dashboard. Rumus
// TIDAK diubah, cuma dipindah: 3 cabang qty (Material Cadang gapQty > ROP+ROQ histori > restock
// minimum) persis sama seperti sebelumnya.
export function computeProcurementList({ katalogList, stocks, txns, materialCadangHealthData }) {
  const analysisRuns = materialCadangHealthData?.analysisRuns||[];
  const healthResults = materialCadangHealthData?.healthResults||[];
  const latestRun = analysisRuns.slice(-1)[0] || null;
  const materialCadangGapMap = new Map();
  if (latestRun) {
    healthResults
      .filter(row=>row.runId===latestRun.id && row.treatment==="Material Cadang" && row.katalogId)
      .forEach(row=>materialCadangGapMap.set(row.katalogId, row));
  }

  const sortDays = days => days===Infinity ? Number.MAX_SAFE_INTEGER : days;
  const RISK_PRIORITY = {critical:0,attention:1,watch:2,safe:3};

  const list = (katalogList||[])
    .filter(katalog=>(stocks||[]).some(stock=>stock.katalogId===katalog.id))
    .map(kat=>{
      const stockRows = (stocks||[]).filter(stock=>stock.katalogId===kat.id);
      const totalQty = stockRows.reduce((sum,stock)=>sum+(stock.qty||0),0);
      const risk = computeKatalogRisk(kat, stocks, txns);
      return {kat,stockRows,totalQty,risk};
    })
    .filter(entry=>entry.risk.key==="critical"||entry.risk.key==="watch")
    .map(entry=>{
      const price = entry.stockRows.find(stock=>stock.price>0)?.price || 0;
      const mcResult = materialCadangGapMap.get(entry.kat.id);
      const series = entry.risk.monthlySeries||[];
      let qty = Math.max(0, entry.risk.minQty-entry.totalQty), method = "minimum_stock", methodLabel = "Restock ke stok minimum (belum ada histori pemakaian)";
      if (mcResult) {
        qty = Math.max(0, mcResult.gapQty||0);
        method = "material_cadang";
        methodLabel = "Poisson service-level · Material Cadang";
      } else if (series.length) {
        const { mean: avgMonthlyUsage, stdev: stdevMonthlyUsage } = meanStdev(series);
        const serviceLevel = entry.risk.key==="critical" ? 0.98 : 0.95;
        const leadTimeMonths = DEFAULT_LEAD_TIME_DAYS/30;
        const safetyStock = normInv(serviceLevel)*stdevMonthlyUsage*Math.sqrt(leadTimeMonths);
        const reorderPoint = avgMonthlyUsage*leadTimeMonths + safetyStock;
        const orderQty = Math.max(avgMonthlyUsage, entry.risk.minQty);
        qty = Math.ceil(Math.max(0, reorderPoint-entry.totalQty) + orderQty);
        method = "rop_roq";
        methodLabel = `ROP+ROQ · ± ${leadTimeMonths} bln lead time (asumsi) · service level ${Math.round(serviceLevel*100)}%`;
      }
      return {...entry, price, qty, method, methodLabel, value:qty*price};
    })
    .sort((a,b)=>RISK_PRIORITY[a.risk.key]-RISK_PRIORITY[b.risk.key] || sortDays(a.risk.days)-sortDays(b.risk.days));

  const totalQty = list.reduce((sum,entry)=>sum+entry.qty,0);
  const totalValue = list.reduce((sum,entry)=>sum+entry.value,0);
  const criticalCount = list.filter(entry=>entry.risk.key==="critical").length;
  return { list, totalQty, totalValue, criticalCount };
}

// Deret pemakaian bulanan (KELUAR TUG9/TUG8 approved) per katalogId, bulan kosong terisi 0.
// Dipakai pemanggil getKritisAgg() (App.jsx, DashboardAsman, DashboardManager) supaya stok
// minimum ikut dihitung otomatis dari histori — lihat computeEffectiveMinQty di ragShared.mjs.
export function buildMonthlySeriesByKatalog(txns, stocks) {
  const map = {};
  (txns||[]).forEach(t => {
    if (!["TUG9","TUG8"].includes(t.docType) || t.status!=="APPROVED") return;
    const d = new Date(t.approvedAt||t.createdAt||0);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    (t.stockItems||[]).forEach(si => {
      const stockRow = (stocks||[]).find(s=>s.id===si.stockId);
      if (!stockRow?.katalogId) return;
      if (!map[stockRow.katalogId]) map[stockRow.katalogId] = {};
      map[stockRow.katalogId][key] = (map[stockRow.katalogId][key]||0) + (si.qty||0);
    });
  });
  const result = {};
  Object.entries(map).forEach(([kid, historyMap]) => { result[kid] = expandMonthlySeriesFromMap(historyMap); });
  return result;
}

export function getTopPemakaian(txns, stocks, katalogList, mode, n) {
  // Collect all outgoing items from approved TUG-9 and TUG-8
  const outItems = [];
  (txns||[]).forEach(t => {
    if (!["TUG9","TUG8"].includes(t.docType)) return;
    if (t.status !== "APPROVED") return;
    (t.stockItems||[]).forEach(si => {
      const stockRow = (stocks||[]).find(s=>s.id===si.stockId);
      if (!stockRow) return;
      const kat = (katalogList||[]).find(k=>k.id===stockRow.katalogId);
      if (!kat) return;
      outItems.push({ katalogId: kat.id, nama: kat.name, katalog: kat.katalog||"-", sapStatus: kat.sapStatus, satuan: kat.satuan||"-", qty: si.qty||0 });
    });
  });
  // Group by katalogId
  const grouped = {};
  outItems.forEach(item => {
    if (!grouped[item.katalogId]) grouped[item.katalogId] = { ...item, frekuensi: 0, totalQty: 0 };
    grouped[item.katalogId].frekuensi += 1;
    grouped[item.katalogId].totalQty += item.qty;
  });
  const arr = Object.values(grouped);
  arr.sort((a,b) => mode==="frekuensi" ? b.frekuensi-a.frekuensi : b.totalQty-a.totalQty);
  return arr.slice(0, n);
}

export function getTopStokTerbanyak(stocks, katalogList, n) {
  // Aggregate qty per katalog (a katalog can be in multiple locations)
  const grouped = {};
  (stocks||[]).forEach(s => {
    const kat = (katalogList||[]).find(k=>k.id===s.katalogId);
    if (!kat) return;
    if (!grouped[kat.id]) grouped[kat.id] = { katalogId:kat.id, nama:kat.name, katalog:kat.katalog||"-", sapStatus:kat.sapStatus, satuan:kat.satuan||"-", jenisBarang:s.jenisBarang||"-", totalQty:0, totalNilai:0 };
    grouped[kat.id].totalQty += s.qty||0;
    grouped[kat.id].totalNilai += (s.qty||0)*(s.price||0);
  });
  const arr = Object.values(grouped).filter(x=>x.totalQty>0);
  arr.sort((a,b)=>b.totalQty-a.totalQty);
  return arr.slice(0, n);
}

// Top stok terbanyak, DIKELOMPOKKAN PER SATUAN (beda satuan tak bisa dibanding qty
// mentah — reuse agregasi qty per katalog dari getTopStokTerbanyak, cuma dipecah per
// satuan lalu urut per grup). Dipakai chat "Pak War" (App.jsx) supaya "stok paling
// banyak" tidak comot dari ranking by-nilai (lihat HANDOFF Tier 1).
export function getTopStockByQty(stocks, katalogList, n = 20) {
  const bySatuan = {};
  getTopStokTerbanyak(stocks, katalogList, Infinity).forEach(item => {
    const satuan = item.satuan || "-";
    if (!bySatuan[satuan]) bySatuan[satuan] = [];
    bySatuan[satuan].push(item);
  });
  return Object.entries(bySatuan)
    .map(([satuan, items]) => ({ satuan, items: items.slice(0, n) }))
    .sort((a, b) => b.items.reduce((s, i) => s + i.totalQty, 0) - a.items.reduce((s, i) => s + i.totalQty, 0));
}

// Total qty per satuan lintas semua stok — dipakai bareng getTopStockByQty.
export function getTotalPerSatuan(stocks) {
  const totals = {};
  (stocks || []).forEach(s => {
    const satuan = s.satuan || s.unit || "-";
    totals[satuan] = (totals[satuan] || 0) + (s.qty || 0);
  });
  return totals;
}

export function getMaterialAkanHabis(stocks, katalogList, txns, n) {
  // Aggregate qty per katalog
  const grouped = {};
  (stocks||[]).forEach(s => {
    const kat = (katalogList||[]).find(k=>k.id===s.katalogId);
    if (!kat) return;
    if (!grouped[kat.id]) grouped[kat.id] = { katalogId:kat.id, nama:kat.name, katalog:kat.katalog||"-", satuan:kat.satuan||"-", jenisBarang:s.jenisBarang||"-", totalQty:0, minQty:s.minQty||0, totalNilai:0 };
    grouped[kat.id].totalQty += s.qty||0;
    grouped[kat.id].minQty = Math.max(grouped[kat.id].minQty, s.minQty||0);
  });

  // Calculate avg monthly usage from all history
  const usageMap = {};
  (txns||[]).forEach(t => {
    if (!["TUG9","TUG8"].includes(t.docType) || t.status!=="APPROVED") return;
    const ts = t.approvedAt||t.createdAt||0;
    (t.stockItems||[]).forEach(si => {
      const stockRow = (stocks||[]).find(s=>s.id===si.stockId);
      if (!stockRow) return;
      const kid = stockRow.katalogId;
      if (!usageMap[kid]) usageMap[kid] = { totalQty:0, oldest:Date.now() };
      usageMap[kid].totalQty += si.qty||0;
      if (ts < usageMap[kid].oldest) usageMap[kid].oldest = ts;
    });
  });

  // Deret bulanan (untuk stok minimum otomatis) sengaja lewat helper bersama, bukan disusun
  // ulang dari usageMap di atas — usageMap cuma simpan total+timestamp tertua (input avgPerBulan),
  // bukan breakdown per bulan. Satu pass ekstra atas txns lebih murah daripada dua rumus deret.
  const monthlySeriesByKatalog = buildMonthlySeriesByKatalog(txns, stocks);

  const results = Object.values(grouped).map(g => {
    const usage = usageMap[g.katalogId];
    let avgPerBulan = 0;
    let estimasiHari = Infinity;
    if (usage && usage.totalQty > 0) {
      const bulan = Math.max(1, (Date.now()-usage.oldest)/(30*24*60*60*1000));
      avgPerBulan = usage.totalQty / bulan;
      estimasiHari = avgPerBulan > 0 ? Math.round(g.totalQty / (avgPerBulan/30)) : Infinity;
    }
    const { minQty: effectiveMinQty, minQtySource } = computeEffectiveMinQty({
      monthlySeries: monthlySeriesByKatalog[g.katalogId] || [],
      manualMinQty: g.minQty,
    });
    const isKritis = effectiveMinQty > 0 && g.totalQty <= effectiveMinQty;
    const isPerhatian = estimasiHari <= 30;
    const isWaspada = estimasiHari > 30 && estimasiHari <= 60;
    if (!isKritis && !isPerhatian && !isWaspada) return null;
    let badge = isKritis?"🔴 Kritis":isPerhatian?"🟡 Perhatian":"🟠 Waspada";
    return { ...g, avgPerBulan, estimasiHari, isKritis, badge, minQty: effectiveMinQty, minQtySource };
  }).filter(Boolean);

  results.sort((a,b) => {
    if (a.isKritis && !b.isKritis) return -1;
    if (!a.isKritis && b.isKritis) return 1;
    return a.estimasiHari - b.estimasiHari;
  });
  return results.slice(0, n);
}

// Ringkasan 1 transaksi untuk widget "Transaksi Terbaru" di Dashboard: No TUG,
// pekerjaan, tanggal, lokasi terkait, dan pihak (penerima/supplier) — beda
// makna per docType (TUG9/8 keluar ke pihak luar, TUG10 retur internal,
// TUG3 penerimaan dari supplier).
export function summarizeTxnDashboard(t, stocks, lokasiList) {
  const docKey = t.docType==="TUG9"?"tug9":t.docType==="TUG8"?"tug8":t.docType==="TUG10"?"tug10":t.docType==="TUG5"?"tug5":t.docType==="TUG7"?"tug7":"tug3";
  const noTugLabel = `${t.docType.replace("TUG","TUG-")} / ${t.docNumbers?.[docKey]||t.id}`;
  const pekerjaan = t.namaPekerjaan || t.keteranganUmum || (t.docType==="TUG7"?`Pemakaian Unit Lain → ${t.unitPenerima||"UPT"}`:"-");
  const tanggal = fmtDate(t.createdAt);
  let lokasiLabel = "-", pihakLabel = "-";
  if (t.docType==="TUG9" || t.docType==="TUG8") {
    const stockRow = (stocks||[]).find(s=>s.id===t.stockItems?.[0]?.stockId);
    lokasiLabel = stockRow?.lokasi || "-";
    pihakLabel = t.penerimaNama ? `${t.penerimaNama}${t.penerimaUnit?` (${t.penerimaUnit})`:""}` : "-";
  } else if (t.docType==="TUG10") {
    lokasiLabel = (lokasiList||[]).find(l=>l.id===t.lokasiTujuanId)?.kode || "-";
    pihakLabel = "Retur material (internal)";
  } else if (t.docType==="TUG3") {
    lokasiLabel = (lokasiList||[]).find(l=>l.id===t.stockItems?.[0]?.lokasiTujuanId)?.kode || "-";
    pihakLabel = t.dariSupplier || "-";
  } else if (t.docType==="TUG7") {
    pihakLabel = t.unitPenerima || "-";
  } else if (t.docType==="TUG5") {
    pihakLabel = "Permintaan internal UPT/UIT";
  }
  return { noTugLabel, pekerjaan, tanggal, lokasiLabel, pihakLabel };
}
