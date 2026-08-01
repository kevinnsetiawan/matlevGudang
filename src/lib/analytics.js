// Helper analitik dashboard (top pemakaian/stok, material akan habis, ringkasan txn)
// — dipindah dari App.jsx (refactor Fase 4f).
import { fmtDate } from "./utils.js";
import { expandMonthlySeriesFromMap, computeEffectiveMinQty } from "./ragShared.mjs";

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
      outItems.push({ katalogId: kat.id, nama: kat.name, katalog: kat.katalog||"-", satuan: kat.satuan||"-", qty: si.qty||0 });
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
    if (!grouped[kat.id]) grouped[kat.id] = { katalogId:kat.id, nama:kat.name, katalog:kat.katalog||"-", satuan:kat.satuan||"-", jenisBarang:s.jenisBarang||"-", totalQty:0, totalNilai:0 };
    grouped[kat.id].totalQty += s.qty||0;
    grouped[kat.id].totalNilai += (s.qty||0)*(s.price||0);
  });
  const arr = Object.values(grouped).filter(x=>x.totalQty>0);
  arr.sort((a,b)=>b.totalQty-a.totalQty);
  return arr.slice(0, n);
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
