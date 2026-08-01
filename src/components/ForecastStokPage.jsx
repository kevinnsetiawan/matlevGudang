import { useEffect, useMemo, useState } from "react";
import { WAREHOUSE } from "../constants.js";
import { fmtDate } from "../lib/utils.js";
import { fmtNum } from "../lib/ragShared.mjs";
import { supabase } from "../supabaseClient.js";
import { Sparkline } from "./Sparkline.jsx";
import { MaterialCadangTab } from "./MaterialCadangTab.jsx";
import { buildMonthlyDemandSeries, tsbMonthlyForecast } from "../lib/tsbForecast.js";

const RISK_FILTERS = [
  {key:"critical",label:"Kritis"},
  {key:"attention",label:"Perhatian"},
  {key:"watch",label:"Waspada"},
  {key:"safe",label:"Aman"},
];
const RISK_PRIORITY = {critical:0,attention:1,watch:2,safe:3};
const RISK_COLORS = {critical:"#b91c1c",attention:"#b45309",watch:"#c2410c",safe:"#15803d"};
// Asumsi lead time pengadaan untuk material non-Material-Cadang. WARNOTO belum punya data
// lead time riil per supplier, jadi dipakai konstanta 1 bulan (referensi desain ABC 2022 memakai
// proxy kelas Availability yang datanya tidak tersedia di sini).
const DEFAULT_LEAD_TIME_DAYS = 30;
// Minimal panjang deret bulanan sebelum stok minimum boleh dihitung otomatis dari histori.
// Di bawah ini deret terlalu pendek untuk menghasilkan stdev yang bermakna, jadi dipakai
// angka manual "Min Qty Alert" dari Data Stok sebagai fallback.
const MIN_HISTORY_MONTHS = 3;
const sortDays = days => days===Infinity ? Number.MAX_SAFE_INTEGER : days;

function meanStdev(series) {
  const mean = series.reduce((sum,value)=>sum+value,0)/series.length;
  const stdev = Math.sqrt(series.reduce((sum,value)=>sum+(value-mean)**2,0)/series.length);
  return { mean, stdev };
}

// Inverse normal CDF (algoritma Acklam), akurasi ~1e-9, dipakai utk Z-score safety stock.
function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= phigh) {
    q = p - 0.5; r = q*q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1-p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

export function ForecastStokPage({ katalogList, setKatalogList, stocks, txns, forecastDetail, setForecastDetail,
  forecastDetailResult, setForecastDetailResult, forecastDetailLoading, forecastDrillDown,
  setTab, sendChat,
  materialCadangData, setMaterialCadangData, maraReference, setMaraReference,
  materialCadangHealthData, setMaterialCadangHealthData,
  materialCadangAiInsights, setMaterialCadangAiInsights,
  catalogMasterRef, setCatalogMasterRef, saveToCloud, showToast, currentUser,
  C, sty }) {
  const [forecastView, setForecastView] = useState("forecast");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("priority");
  const [mlForecasts, setMlForecasts] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // State pagination terpisah untuk tab Rekomendasi Pengadaan supaya pindah tab tidak
  // saling mereset posisi halaman tab satunya.
  const [procPage, setProcPage] = useState(1);
  const [procPageSize, setProcPageSize] = useState(20);

  useEffect(() => { setPage(1); }, [statusFilter, search, sortMode, pageSize]);
  useEffect(() => { setProcPage(1); }, [procPageSize]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("forecast_predictions")
        .select("katalog_id,tanggal_prediksi,qty_prediksi,estimasi_hari_sampai_habis,model_version,updated_at")
        .order("tanggal_prediksi", { ascending:true });
      if (cancelled || error || !data) return;
      const grouped = {};
      data.forEach(row => {
        if (!grouped[row.katalog_id]) grouped[row.katalog_id] = {qtySum:0,qtyCount:0,estimasiHari:row.estimasi_hari_sampai_habis,modelVersion:row.model_version,updatedAt:row.updated_at,series:[]};
        const group = grouped[row.katalog_id];
        group.qtySum += row.qty_prediksi||0;
        group.qtyCount += 1;
        group.series.push(row.qty_prediksi||0);
        if (row.estimasi_hari_sampai_habis != null) group.estimasiHari = row.estimasi_hari_sampai_habis;
      });
      const result = {};
      Object.entries(grouped).forEach(([id,group]) => {
        result[id] = {
          estimasiHari:group.estimasiHari,
          avgQtyPrediksiHarian:group.qtyCount ? group.qtySum/group.qtyCount : 0,
          modelVersion:group.modelVersion,
          updatedAt:group.updatedAt,
          series:group.series,
        };
      });
      setMlForecasts(result);
    })();
    return () => { cancelled = true; };
  }, []);

  function getRisk(katalog) {
    const stockRows = stocks.filter(stock=>stock.katalogId===katalog.id);
    const totalQty = stockRows.reduce((sum,stock)=>sum+(stock.qty||0),0);
    const manualMinQty = stockRows.reduce((max,stock)=>Math.max(max,stock.minQty||0),0);
    const usageItems = [];
    txns.filter(txn=>["TUG9","TUG8"].includes(txn.docType)&&txn.status==="APPROVED").forEach(txn=>{
      (txn.stockItems||[]).forEach(item=>{
        const stock = stocks.find(row=>row.id===item.stockId);
        if (stock?.katalogId===katalog.id) usageItems.push({qty:item.qty||0,ts:txn.approvedAt||txn.createdAt});
      });
    });
    // TSB (bukan rata-rata flat) -- material gudang PLN pola pemakaiannya intermiten/lumpy
    // (berbulan-bulan 0 lalu keluar banyak sekaligus), rata-rata flat gampang bias oleh
    // panjang jendela observasi. Lihat src/lib/tsbForecast.js untuk penjelasan lengkap.
    const monthlySeries = buildMonthlyDemandSeries(usageItems);
    const { forecastPerPeriod } = tsbMonthlyForecast(monthlySeries);
    const perDay = forecastPerPeriod/30;
    const estimatedDays = perDay>0 ? Math.round(totalQty/perDay) : Infinity;
    // Stok minimum: kalau histori pemakaian sudah cukup panjang, hitung sendiri sebagai reorder
    // point (lead time demand + safety stock) dan abaikan angka manual. Service level flat 95%
    // -- TIDAK boleh pakai risk.key sebagai input karena minQty inilah yang menentukan risk.key.
    const hasEnoughHistory = monthlySeries.length >= MIN_HISTORY_MONTHS;
    let minQty = manualMinQty;
    if (hasEnoughHistory) {
      const { mean, stdev } = meanStdev(monthlySeries);
      const leadTimeMonths = DEFAULT_LEAD_TIME_DAYS/30;
      minQty = Math.ceil(mean*leadTimeMonths + normInv(0.95)*stdev*Math.sqrt(leadTimeMonths));
    }
    const minQtySource = hasEnoughHistory ? "computed" : "manual";
    const critical = minQty>0 && totalQty<=minQty;
    // perDay, minQty & monthlySeries dipakai tab Rekomendasi Pengadaan untuk menghitung usulan qty beli.
    const base = {days:estimatedDays,perDay,minQty,minQtySource,monthlySeries};
    if (critical || estimatedDays<=30) return {key:"critical",label:"Kritis",...base};
    if (estimatedDays<=90) return {key:"attention",label:"Perhatian",...base};
    if (estimatedDays<=180) return {key:"watch",label:"Waspada",...base};
    return {key:"safe",label:"Aman",...base};
  }

  const enriched = useMemo(() => katalogList
    .filter(katalog=>stocks.some(stock=>stock.katalogId===katalog.id))
    .map(kat=>{
      const stockRows = stocks.filter(stock=>stock.katalogId===kat.id);
      const totalQty = stockRows.reduce((sum,stock)=>sum+(stock.qty||0),0);
      const risk = getRisk(kat);
      const ml = mlForecasts[kat.id];
      const divergent = ml?.estimasiHari!=null && risk.days!==Infinity && Math.abs(ml.estimasiHari-risk.days)/Math.max(risk.days,1)>0.4;
      return {kat,stockRows,totalQty,risk,ml,divergent};
    }), [katalogList,stocks,txns,mlForecasts]);

  const counts = RISK_FILTERS.reduce((result,item)=>({...result,[item.key]:enriched.filter(entry=>entry.risk.key===item.key).length}),{});
  const mlReadyCount = enriched.filter(entry=>entry.ml).length;
  const visibleList = enriched
    .filter(entry=>statusFilter==="ALL" || entry.risk.key===statusFilter)
    .filter(entry=>{
      const keyword = search.trim().toLowerCase();
      return !keyword || `${entry.kat.name} ${entry.kat.katalog}`.toLowerCase().includes(keyword);
    })
    .sort((a,b)=>{
      if (sortMode==="name") return a.kat.name.localeCompare(b.kat.name,"id");
      if (sortMode==="stock") return a.totalQty-b.totalQty;
      if (sortMode==="days") return (a.risk.days===Infinity?Number.MAX_SAFE_INTEGER:a.risk.days)-(b.risk.days===Infinity?Number.MAX_SAFE_INTEGER:b.risk.days);
      return RISK_PRIORITY[a.risk.key]-RISK_PRIORITY[b.risk.key] || (a.risk.days-b.risk.days);
    });
  const totalPages = Math.max(1, Math.ceil(visibleList.length/pageSize));
  const pageClamped = Math.min(page, totalPages);
  const pagedList = visibleList.slice((pageClamped-1)*pageSize, pageClamped*pageSize);

  // Hasil analisis Material Cadang terakhir (read-only) — dipakai sebagai sumber qty paling
  // prioritas karena perhitungannya (Poisson service-level per kelas ABC) jauh lebih rigorous
  // daripada ROP/ROQ generik untuk item spare/rare-failure. Pola ambil data = MaterialCadangTab.
  const materialCadangGapMap = useMemo(() => {
    const analysisRuns = materialCadangHealthData?.analysisRuns||[];
    const healthResults = materialCadangHealthData?.healthResults||[];
    const latestRun = analysisRuns.slice(-1)[0] || null;
    const map = new Map();
    if (!latestRun) return map;
    healthResults
      .filter(row=>row.runId===latestRun.id && row.treatment==="Material Cadang" && row.katalogId)
      .forEach(row=>map.set(row.katalogId, row));
    return map;
  }, [materialCadangHealthData]);

  const procurementList = useMemo(() => enriched
    .filter(entry=>entry.risk.key==="critical"||entry.risk.key==="watch")
    .map(entry=>{
      const price = entry.stockRows.find(stock=>stock.price>0)?.price || 0;
      const mcResult = materialCadangGapMap.get(entry.kat.id);
      const series = entry.risk.monthlySeries||[];
      // Cabang C (default) — item ini hanya bisa berstatus Kritis/Waspada tanpa histori pemakaian
      // lewat jalur minQty>0 && totalQty<=minQty (lihat getRisk), jadi minQty selalu tersedia di
      // sini: restock ke minimum adalah angka nyata, bukan tebakan, walau tanpa buffer statistik.
      let qty = Math.max(0, entry.risk.minQty-entry.totalQty), method = "minimum_stock", methodLabel = "Restock ke stok minimum (belum ada histori pemakaian)";
      if (mcResult) {
        // Cabang A — sudah dianalisis di Material Cadang, pakai gapQty apa adanya.
        qty = Math.max(0, mcResult.gapQty||0);
        method = "material_cadang";
        methodLabel = "Poisson service-level · Material Cadang";
      } else if (series.length) {
        // Cabang B — konsumsi reguler: ROP (lead time demand + safety stock) lalu ditambah
        // satu lot order (ROQ) yang INDEPENDEN dari ROP, supaya tidak jadi repeat-order mini.
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
    .sort((a,b)=>RISK_PRIORITY[a.risk.key]-RISK_PRIORITY[b.risk.key] || sortDays(a.risk.days)-sortDays(b.risk.days)), [enriched,materialCadangGapMap]);
  const procurementTotalQty = procurementList.reduce((sum,entry)=>sum+entry.qty,0);
  const procurementTotalValue = procurementList.reduce((sum,entry)=>sum+entry.value,0);
  const procTotalPages = Math.max(1, Math.ceil(procurementList.length/procPageSize));
  const procPageClamped = Math.min(procPage, procTotalPages);
  const pagedProcurementList = procurementList.slice((procPageClamped-1)*procPageSize, procPageClamped*procPageSize);

  function copyProcurementList() {
    const text = procurementList
      .map(entry=>`${entry.kat.name} [${entry.kat.katalog}] — ${entry.qty>0?`${fmtNum(entry.qty)} ${entry.kat.satuan}`:"sudah di stok minimum"}`)
      .join("\n");
    navigator.clipboard.writeText(text)
      .then(()=>showToast?.(`Daftar ${procurementList.length} material disalin ke clipboard.`))
      .catch(()=>showToast?.("Gagal menyalin ke clipboard.","error"));
  }

  function formatDays(days) {
    if (days===Infinity) return "Belum ada data";
    if (days>365) return "> 1 tahun";
    return `± ${fmtNum(days)} hari`;
  }
  function openDetail(entry) {
    setForecastDetail({kat:entry.kat,stockRows:entry.stockRows});
    setForecastDetailResult(null);
    forecastDrillDown(entry.kat,entry.stockRows);
  }
  function continueInChat(prompt) {
    setTab("ai");
    setTimeout(()=>sendChat(prompt),100);
  }

  if (forecastDetail) {
    const kat = forecastDetail.kat;
    const stockRows = forecastDetail.stockRows||stocks.filter(stock=>stock.katalogId===kat.id);
    const totalQty = stockRows.reduce((sum,stock)=>sum+(stock.qty||0),0);
    const risk = getRisk(kat);
    const ml = mlForecasts[kat.id];
    return (
      <div className="workspace-page forecast-page forecast-detail-page">
        <button className="forecast-back" onClick={()=>{setForecastDetail(null);setForecastDetailResult(null);}}>← Kembali ke daftar material</button>
        <section className="forecast-detail-head">
          <div className="forecast-detail-head__copy">
            <span>{kat.katalog} · {kat.satuan}</span>
            <strong>{kat.name}</strong>
            <small>Stok saat ini <b>{fmtNum(totalQty)} {kat.satuan}</b></small>
          </div>
          <div className="forecast-detail-head__actions">
            <span className={`forecast-risk is-${risk.key}`}>{risk.label}</span>
            <button onClick={()=>continueInChat(`Berikan saran pengadaan untuk material: ${kat.name}`)}>Tanya Pak War</button>
          </div>
        </section>

        <div className="forecast-analysis-grid">
          <section className="forecast-analysis-panel is-ai">
            <div className="forecast-analysis-panel__head">
              <div><span>Analisis keputusan</span><strong>Heuristik dan rekomendasi AI</strong></div>
              <span className="forecast-analysis-panel__metric">{formatDays(risk.days)}</span>
            </div>
            <div className="forecast-analysis-panel__body">
              {forecastDetailLoading && <div className="forecast-analysis-loading"><span></span><strong>Pak War sedang menganalisis data material</strong><small>Biasanya membutuhkan 5–10 detik.</small></div>}
              {forecastDetailResult && !forecastDetailLoading && <div className="forecast-analysis-result" style={{color:C.text}}>{forecastDetailResult}</div>}
              {!forecastDetailResult && !forecastDetailLoading && <div className="forecast-analysis-empty">Belum ada hasil analisis untuk material ini.</div>}
            </div>
          </section>

          <section className="forecast-analysis-panel is-ml">
            <div className="forecast-analysis-panel__head">
              <div><span>Model statistik</span><strong>Prediksi ML Prophet</strong></div>
              <span className="forecast-analysis-panel__metric">{ml?.estimasiHari!=null?formatDays(ml.estimasiHari):"Data belum cukup"}</span>
            </div>
            <div className="forecast-analysis-panel__body">
              {ml ? <>
                <div className="forecast-ml-metrics">
                  <div><span>Prediksi harian</span><strong>{fmtNum(Math.round(ml.avgQtyPrediksiHarian))} {kat.satuan}</strong></div>
                  <div><span>Versi model</span><strong>{ml.modelVersion||"-"}</strong></div>
                </div>
                <div className="forecast-sparkline"><span>Tren prediksi 30 hari</span><Sparkline data={ml.series} color="#7c3aed" w={300} h={58}/></div>
                <small className="forecast-model-update">Pembaruan terakhir {fmtDate(new Date(ml.updatedAt).getTime())}</small>
              </> : <div className="forecast-analysis-empty">Minimal 5 transaksi keluar diperlukan sebelum prediksi ML tersedia.</div>}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page forecast-page">
      <section className="forecast-overview kpi-banner">
        <div className="forecast-overview__copy"><span>Proyeksi persediaan · {WAREHOUSE}</span><strong>Fokus pada material yang paling cepat membutuhkan tindakan</strong><small>Heuristik tersedia untuk seluruh material; prediksi ML muncul saat histori transaksi mencukupi.</small></div>
        <div className="forecast-overview__metrics">
          <button disabled={forecastView!=="forecast"} className={forecastView==="forecast"&&statusFilter==="critical"?"is-active":""} onClick={()=>setStatusFilter(statusFilter==="critical"?"ALL":"critical")}><span>Kritis</span><strong>{counts.critical}</strong></button>
          <button disabled={forecastView!=="forecast"} className={forecastView==="forecast"&&statusFilter==="attention"?"is-active":""} onClick={()=>setStatusFilter(statusFilter==="attention"?"ALL":"attention")}><span>Perhatian</span><strong>{counts.attention}</strong></button>
          <div><span>ML tersedia</span><strong>{mlReadyCount}</strong></div>
          <div><span>Total material</span><strong>{enriched.length}</strong></div>
        </div>
      </section>

      <div className="forecast-view-switch" role="tablist" aria-label="Tampilan forecast">
        <button className={forecastView==="forecast"?"is-active":""} onClick={()=>setForecastView("forecast")} role="tab" aria-selected={forecastView==="forecast"}>Forecast Stok</button>
        <button className={forecastView==="procurement"?"is-active":""} onClick={()=>setForecastView("procurement")} role="tab" aria-selected={forecastView==="procurement"}>Rekomendasi Pengadaan</button>
        <button className={forecastView==="material_cadang"?"is-active":""} onClick={()=>setForecastView("material_cadang")} role="tab" aria-selected={forecastView==="material_cadang"}>Material Cadang</button>
      </div>

      {forecastView==="procurement" ? (
        <>
          <div className="forecast-procurement-head">
            <div className="forecast-overview__metrics">
              <div><span>Butuh tindakan</span><strong>{procurementList.length}</strong></div>
              <div><span>Total usulan qty</span><strong>{fmtNum(procurementTotalQty)}</strong></div>
              <div><span>Estimasi nilai</span><strong>{procurementTotalValue>0?`Rp ${procurementTotalValue.toLocaleString("id-ID")}`:"-"}</strong></div>
            </div>
            <button disabled={procurementList.length===0} onClick={copyProcurementList}>Salin daftar</button>
          </div>

          <details className="forecast-methodology"><summary>Bagaimana usulan qty dihitung?</summary><p>Material yang sudah dianalisis di tab Material Cadang memakai angka gap dari perhitungan Poisson service-level per kelas ABC. Sisanya memakai ROP+ROQ: titik pesan ulang (pemakaian rata-rata selama lead time {DEFAULT_LEAD_TIME_DAYS} hari + safety stock Z×σ×√lead time, service level 98% untuk Kritis dan 95% untuk Waspada), ditambah satu lot pesan sebesar pemakaian rata-rata satu bulan atau stok minimum — mana yang lebih besar — agar tidak terjadi pembelian mini berulang. Material tanpa histori pemakaian (belum pernah keluar dari gudang) diusulkan sebesar selisih ke stok minimum saja, tanpa buffer statistik — gunakan tombol "Lihat detail" untuk verifikasi manual atau analisis lewat tab Material Cadang kalau nilainya signifikan. Stok minimum sendiri dihitung otomatis dari histori pemakaian (reorder point, service level 95%) bila datanya sudah ≥{MIN_HISTORY_MONTHS} bulan, dan baru memakai angka manual "Min Qty Alert" dari Data Stok kalau histori belum cukup. Hanya material berstatus Kritis dan Waspada yang ditampilkan.</p></details>

          <div className="forecast-table-card mobile-card-table forecast-card-table">
            <table className="forecast-table">
              <thead><tr><th>Material</th><th>Status</th><th>Stok saat ini</th><th>Estimasi habis</th><th>Usulan qty beli</th><th>Estimasi nilai</th><th>Aksi</th></tr></thead>
              <tbody>
                {pagedProcurementList.map(entry=><tr key={entry.kat.id} className="mobile-card-table__row" style={{"--risk-accent":RISK_COLORS[entry.risk.key]}}>
                  <td className="mobile-card-table__title"><strong>{entry.kat.name}</strong><span>{entry.kat.katalog} · {entry.kat.satuan}</span></td>
                  <td data-label="Status"><span className={`forecast-risk is-${entry.risk.key}`}>{entry.risk.label}</span></td>
                  <td data-label="Stok"><strong>{fmtNum(entry.totalQty)}</strong><span>min {fmtNum(entry.risk.minQty)} {entry.kat.satuan}{entry.risk.minQtySource==="computed"?" · dihitung dari histori":""}</span></td>
                  <td data-label="Estimasi habis"><strong>{formatDays(entry.risk.days)}</strong><span>berdasarkan transaksi</span></td>
                  <td data-label="Usulan qty">{entry.qty>0
                    ? <><strong>{fmtNum(entry.qty)}</strong><span>{entry.kat.satuan}</span><span>{entry.methodLabel}</span></>
                    : <><strong>Sudah di stok minimum</strong><span>{entry.method==="material_cadang"?"stok sudah memenuhi rekomendasi Material Cadang":"tidak perlu beli sekarang — belum ada histori pemakaian untuk hitung buffer"}</span></>}</td>
                  <td data-label="Estimasi nilai"><strong>{entry.qty>0&&entry.price>0?`Rp ${entry.value.toLocaleString("id-ID")}`:"-"}</strong><span>{entry.price>0?`@ Rp ${entry.price.toLocaleString("id-ID")}`:"harga belum ada"}</span></td>
                  <td data-label="Aksi"><div className="forecast-row-actions"><button onClick={()=>openDetail(entry)}>Lihat detail</button><button onClick={()=>continueInChat(`Buatkan rekomendasi pengadaan untuk material: ${entry.kat.name} [${entry.kat.katalog}] — stok saat ini ${fmtNum(entry.totalQty)} ${entry.kat.satuan}, usulan beli ${entry.qty>0?`${fmtNum(entry.qty)} ${entry.kat.satuan}`:"belum bisa dihitung otomatis"}`)}>Pak War</button></div></td>
                </tr>)}
              </tbody>
            </table>
            {procurementList.length > 0 && (
              <div className="forecast-pagination">
                <div className="forecast-pagination__size">
                  Tampilkan
                  <select value={procPageSize} onChange={e=>setProcPageSize(Number(e.target.value))}>
                    {[20,50,100].map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                  item per halaman — {procurementList.length} total
                </div>
                <div className="forecast-pagination__nav">
                  <button disabled={procPageClamped<=1} onClick={()=>setProcPage(p=>Math.max(1,p-1))}>← Sebelumnya</button>
                  <span>Halaman {procPageClamped} / {procTotalPages}</span>
                  <button disabled={procPageClamped>=procTotalPages} onClick={()=>setProcPage(p=>Math.min(procTotalPages,p+1))}>Berikutnya →</button>
                </div>
              </div>
            )}
            {procurementList.length===0 && <div className="forecast-empty"><strong>Tidak ada material kritis/waspada saat ini</strong><span>Kondisi stok aman, belum ada usulan pengadaan.</span></div>}
          </div>
        </>
      ) : forecastView==="material_cadang" ? (
        <MaterialCadangTab
          materialCadangData={materialCadangData} setMaterialCadangData={setMaterialCadangData}
          materialCadangHealthData={materialCadangHealthData} setMaterialCadangHealthData={setMaterialCadangHealthData}
          materialCadangAiInsights={materialCadangAiInsights} setMaterialCadangAiInsights={setMaterialCadangAiInsights}
          maraReference={maraReference} setMaraReference={setMaraReference}
          catalogMasterRef={catalogMasterRef} setCatalogMasterRef={setCatalogMasterRef}
          katalogList={katalogList} setKatalogList={setKatalogList}
          stocks={stocks} txns={txns} currentUser={currentUser} sty={sty} C={C}
          saveToCloud={saveToCloud} showToast={showToast}
        />
      ) : (
        <>
          <div className="forecast-controls">
            <div className="forecast-search"><span aria-hidden="true">⌕</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Cari nama atau nomor katalog..."/></div>
            <div className="forecast-status-filter">
              <button className={statusFilter==="ALL"?"is-active":""} onClick={()=>setStatusFilter("ALL")}>Semua <b>{enriched.length}</b></button>
              {RISK_FILTERS.map(item=><button key={item.key} className={statusFilter===item.key?"is-active":""} onClick={()=>setStatusFilter(statusFilter===item.key?"ALL":item.key)}>{item.label} <b>{counts[item.key]}</b></button>)}
            </div>
            <label className="forecast-sort"><span>Urutkan</span><select value={sortMode} onChange={event=>setSortMode(event.target.value)}><option value="priority">Prioritas tindakan</option><option value="days">Estimasi tercepat</option><option value="stock">Stok terendah</option><option value="name">Nama material</option></select></label>
          </div>

          <details className="forecast-methodology"><summary>Bagaimana angka forecast dihitung?</summary><p>Heuristik membandingkan pemakaian historis TUG-9/TUG-8 dengan stok saat ini. ML Prophet memakai histori TUG-15 dan memerlukan minimal 10 transaksi keluar per material.</p></details>

          <div className="forecast-table-card mobile-card-table forecast-card-table">
            <table className="forecast-table">
              <thead><tr><th>Material</th><th>Status</th><th>Stok saat ini</th><th>Estimasi heuristik</th><th>Prediksi ML</th><th>Validasi</th><th>Aksi</th></tr></thead>
              <tbody>
                {pagedList.map(entry=><tr key={entry.kat.id} className="mobile-card-table__row" onClick={()=>openDetail(entry)} style={{"--risk-accent":RISK_COLORS[entry.risk.key]}}>
                  <td className="mobile-card-table__title"><strong>{entry.kat.name}</strong><span>{entry.kat.katalog} · {entry.kat.satuan}</span></td>
                  <td data-label="Status"><span className={`forecast-risk is-${entry.risk.key}`}>{entry.risk.label}</span></td>
                  <td data-label="Stok"><strong>{fmtNum(entry.totalQty)}</strong><span>{entry.kat.satuan}</span></td>
                  <td data-label="Estimasi"><strong>{formatDays(entry.risk.days)}</strong><span>berdasarkan transaksi</span></td>
                  <td data-label="Prediksi ML"><strong>{entry.ml?.estimasiHari!=null?formatDays(entry.ml.estimasiHari):"Belum tersedia"}</strong><span>{entry.ml?.modelVersion||"histori belum cukup"}</span></td>
                  <td data-label="Validasi">{entry.divergent?<span className="forecast-validation is-warning">Perlu ditinjau</span>:<span className="forecast-validation">Selaras</span>}</td>
                  <td data-label="Aksi"><div className="forecast-row-actions"><button onClick={event=>{event.stopPropagation();openDetail(entry);}}>Analisis</button><button onClick={event=>{event.stopPropagation();continueInChat(`Analisis dan forecast stok untuk material: ${entry.kat.name} [${entry.kat.katalog}]`);}}>Pak War</button></div></td>
                </tr>)}
              </tbody>
            </table>
            {visibleList.length > 0 && (
              <div className="forecast-pagination">
                <div className="forecast-pagination__size">
                  Tampilkan
                  <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
                    {[20,50,100].map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                  item per halaman — {visibleList.length} total
                </div>
                <div className="forecast-pagination__nav">
                  <button disabled={pageClamped<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Sebelumnya</button>
                  <span>Halaman {pageClamped} / {totalPages}</span>
                  <button disabled={pageClamped>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Berikutnya →</button>
                </div>
              </div>
            )}
            {enriched.length===0 && <div className="forecast-empty"><strong>Belum ada data stok untuk dianalisis</strong><span>Material akan muncul setelah data stok tersedia.</span></div>}
            {enriched.length>0 && visibleList.length===0 && <div className="forecast-empty"><strong>Tidak ada material yang sesuai</strong><span>Ubah filter atau kata pencarian untuk melihat data lain.</span></div>}
          </div>
        </>
      )}
    </div>
  );
}
