// Komponen ForecastStokPage — dipindah dari App.jsx (refactor Fase 5h).
import { useState, useEffect } from "react";
import { WAREHOUSE } from "../constants.js";
import { fmtDate } from "../lib/utils.js";
import { fmtNum } from "../lib/ragShared.mjs";
import { supabase } from "../supabaseClient.js";
import { Sparkline } from "./Sparkline.jsx";
import { MaterialCadangTab } from "./MaterialCadangTab.jsx";

export function ForecastStokPage({ katalogList, setKatalogList, stocks, txns, forecastDetail, setForecastDetail,
  forecastDetailResult, setForecastDetailResult, forecastDetailLoading, forecastDrillDown,
  setTab, sendChat,
  materialCadangData, setMaterialCadangData, maraReference, setMaraReference,
  materialCadangHealthData, setMaterialCadangHealthData,
  materialCadangAiInsights, setMaterialCadangAiInsights,
  catalogMasterRef, setCatalogMasterRef, saveToCloud, showToast, currentUser,
  C, sty }) {
  const [forecastView, setForecastView] = useState("forecast"); // "forecast" | "material_cadang"

  // Prediksi ML (Prophet, dihitung tiap malam via GitHub Actions job
  // ml/train_forecast.py) — diambil dari forecast_predictions, terpisah dari
  // heuristik lokal getRiskBadge() di bawah. Cuma terisi untuk katalog yang
  // sudah punya >=10 baris histori KELUAR (lihat MIN_DATA_POINTS di skrip);
  // katalog lain akan tampil "Belum cukup data historis" sampai cukup.
  const [mlForecasts, setMlForecasts] = useState({}); // katalogId -> {estimasiHari, avgQtyPrediksiHarian, modelVersion, updatedAt, series:[qty,...]}
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("forecast_predictions").select("katalog_id,tanggal_prediksi,qty_prediksi,estimasi_hari_sampai_habis,model_version,updated_at").order("tanggal_prediksi", { ascending: true });
      if (cancelled || error || !data) return;
      const grouped = {};
      data.forEach(row => {
        if (!grouped[row.katalog_id]) grouped[row.katalog_id] = { qtySum:0, qtyCount:0, estimasiHari:row.estimasi_hari_sampai_habis, modelVersion:row.model_version, updatedAt:row.updated_at, series:[] };
        const g = grouped[row.katalog_id];
        g.qtySum += row.qty_prediksi||0; g.qtyCount += 1;
        g.series.push(row.qty_prediksi||0);
        if (row.estimasi_hari_sampai_habis != null) g.estimasiHari = row.estimasi_hari_sampai_habis;
      });
      const result = {};
      Object.entries(grouped).forEach(([kid,g]) => { result[kid] = { estimasiHari:g.estimasiHari, avgQtyPrediksiHarian:g.qtyCount>0?g.qtySum/g.qtyCount:0, modelVersion:g.modelVersion, updatedAt:g.updatedAt, series:g.series }; });
      setMlForecasts(result);
    })();
    return () => { cancelled = true; };
  }, []);

  // Heuristik lokal: rata-rata pemakaian historis TUG-9/8 vs stok saat ini
  function getRiskBadge(katalog) {
    const stockRows = stocks.filter(s=>s.katalogId===katalog.id);
    const totalQty = stockRows.reduce((a,s)=>a+(s.qty||0),0);
    const minQty = stockRows.reduce((a,s)=>Math.max(a,s.minQty||0),0);

    const usageItems = [];
    txns.filter(t=>["TUG9","TUG8"].includes(t.docType)&&t.status==="APPROVED").forEach(t=>{
      (t.stockItems||[]).forEach(si=>{
        const s = stocks.find(x=>x.id===si.stockId);
        if(s?.katalogId===katalog.id) usageItems.push({qty:si.qty||0,ts:t.approvedAt||t.createdAt});
      });
    });
    const totalUsage = usageItems.reduce((a,i)=>a+i.qty,0);
    const oldest = usageItems.length?Math.min(...usageItems.map(i=>i.ts)):Date.now();
    const bulan = Math.max(1,(Date.now()-oldest)/(30*24*60*60*1000));
    const avgPerBulan = totalUsage/bulan;
    const estimasiHari = avgPerBulan>0?Math.round(totalQty/(avgPerBulan/30)):Infinity;

    const isKritis = minQty>0&&totalQty<=minQty;
    if(isKritis||estimasiHari<=30) return {label:"🔴 KRITIS",color:"#dc2626",bg:"#fee2e2",hari:estimasiHari};
    if(estimasiHari<=90) return {label:"🟡 PERHATIAN",color:"#d97706",bg:"#fef3c7",hari:estimasiHari};
    if(estimasiHari<=180) return {label:"🟠 WASPADA",color:"#ea580c",bg:"#fff7ed",hari:estimasiHari};
    return {label:"🟢 AMAN",color:"#16a34a",bg:"#f0fdf4",hari:estimasiHari};
  }

  function lanjutkanDiChat(prompt) {
    setTab("ai");
    setTimeout(()=>sendChat(prompt), 100);
  }

  const [statusFilter, setStatusFilter] = useState("ALL"); // "ALL" | label risk (cth "🔴 KRITIS")

  const katalogWithStock = katalogList.filter(k=>stocks.some(s=>s.katalogId===k.id));

  // Hitung risk sekali per katalog (dipakai untuk render kartu + filter + counter)
  const enriched = katalogWithStock.map(kat => {
    const stockRows = stocks.filter(s=>s.katalogId===kat.id);
    return { kat, stockRows, risk: getRiskBadge(kat), ml: mlForecasts[kat.id] };
  });
  const STATUS_FILTERS = ["🔴 KRITIS","🟡 PERHATIAN","🟠 WASPADA","🟢 AMAN"];
  const statusCounts = STATUS_FILTERS.reduce((acc,label) => { acc[label] = enriched.filter(e=>e.risk.label===label).length; return acc; }, {});
  const visibleList = statusFilter==="ALL" ? enriched : enriched.filter(e=>e.risk.label===statusFilter);

  // ── DETAIL DRILL-DOWN ──
  if (forecastDetail) {
    const kat = forecastDetail.kat;
    const ml = mlForecasts[kat.id];
    return (
      <div>
        <button style={{...sty.btn("ghost","sm"),marginBottom:14}} onClick={()=>{setForecastDetail(null);setForecastDetailResult(null);}}>← Kembali ke Semua Material</button>
        <div style={{...sty.card,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:18,fontWeight:900}}>{kat.name}</div>
              <div style={{fontSize:11,color:C.muted,fontFamily:"monospace"}}>{kat.katalog} • {kat.satuan}</div>
            </div>
            <button style={sty.btn("ghost","sm")} onClick={()=>lanjutkanDiChat(`Berikan saran pengadaan untuk material: ${kat.name}`)}>💬 Lanjutkan di Chat AI</button>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(340px,1fr))",gap:16}}>
          {/* KIRI: Heuristik + AI Groq */}
          <div style={{...sty.card,borderTop:"4px solid #2563eb"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#2563eb",marginBottom:10}}>📊 Analisis Cepat (Heuristik + AI)</div>
            {forecastDetailLoading && (
              <div style={{textAlign:"center",padding:30}}>
                <div style={{fontSize:28,marginBottom:10}}>⏳</div>
                <div style={{fontSize:13,fontWeight:700,color:C.accent}}>AI sedang menganalisis...</div>
                <div style={{fontSize:11,color:C.muted,marginTop:4}}>Biasanya 5-10 detik</div>
              </div>
            )}
            {forecastDetailResult && !forecastDetailLoading && (
              <div style={{fontSize:12.5,lineHeight:1.8,whiteSpace:"pre-wrap",color:C.text}}>{forecastDetailResult}</div>
            )}
          </div>

          {/* KANAN: ML Prophet */}
          <div style={{...sty.card,borderTop:"4px solid #7c3aed"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#7c3aed",marginBottom:10}}>🧠 Prediksi ML (Prophet)</div>
            {ml ? (
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div style={{background:"#f5f3ff",borderRadius:6,padding:"8px 10px"}}>
                    <div style={{fontSize:9,color:C.muted,fontWeight:700}}>ESTIMASI HABIS</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#7c3aed"}}>{ml.estimasiHari!=null ? `~${fmtNum(ml.estimasiHari)} hari` : "Tdk ada data"}</div>
                  </div>
                  <div style={{background:"#f5f3ff",borderRadius:6,padding:"8px 10px"}}>
                    <div style={{fontSize:9,color:C.muted,fontWeight:700}}>RATA² PREDIKSI/HARI</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#7c3aed"}}>{fmtNum(Math.round(ml.avgQtyPrediksiHarian))} {kat.satuan}</div>
                  </div>
                </div>
                <div style={{fontSize:9,color:C.muted,fontWeight:700,marginBottom:4}}>TREN PREDIKSI 30 HARI KE DEPAN</div>
                <div style={{background:"#f5f3ff",borderRadius:8,padding:"10px 10px 4px"}}>
                  <Sparkline data={ml.series} color="#7c3aed" w={280} h={50}/>
                </div>
                <div style={{fontSize:10,color:C.muted,marginTop:8}}>
                  Model: {ml.modelVersion||"-"} • Update terakhir: {fmtDate(new Date(ml.updatedAt).getTime())}
                </div>
              </>
            ) : (
              <div style={{fontSize:12,color:C.muted}}>Belum cukup histori transaksi KELUAR (minimal 10 baris) untuk material ini — prediksi ML akan otomatis muncul begitu data historisnya cukup, tanpa perlu konfigurasi tambahan.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── LIST SEMUA MATERIAL ──
  return (
    <div>
      {/* Toggle: Forecast Stok vs Material Cadang */}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${forecastView==="forecast"?C.accent:C.border}`,background:forecastView==="forecast"?C.accent:"white",color:forecastView==="forecast"?"white":C.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}
          onClick={()=>setForecastView("forecast")}>📈 Forecast Stok</button>
        <button style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${forecastView==="material_cadang"?C.accent:C.border}`,background:forecastView==="material_cadang"?C.accent:"white",color:forecastView==="material_cadang"?"white":C.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}
          onClick={()=>setForecastView("material_cadang")}>🔩 Material Cadang</button>
      </div>

      {forecastView==="material_cadang" && (
        <MaterialCadangTab
          materialCadangData={materialCadangData}
          setMaterialCadangData={setMaterialCadangData}
          materialCadangHealthData={materialCadangHealthData}
          setMaterialCadangHealthData={setMaterialCadangHealthData}
          materialCadangAiInsights={materialCadangAiInsights}
          setMaterialCadangAiInsights={setMaterialCadangAiInsights}
          maraReference={maraReference}
          setMaraReference={setMaraReference}
          catalogMasterRef={catalogMasterRef}
          setCatalogMasterRef={setCatalogMasterRef}
          katalogList={katalogList}
          setKatalogList={setKatalogList}
          stocks={stocks}
          txns={txns}
          currentUser={currentUser}
          sty={sty} C={C}
          saveToCloud={saveToCloud}
          showToast={showToast}
        />
      )}

      {forecastView==="forecast" && <div>
      <div style={{marginBottom:16}}>
        <h1 style={sty.pageTitle}>📈 Forecast Stok</h1>
        <p style={{color:C.muted,fontSize:13}}>Perbandingan 2 metode: heuristik pemakaian historis vs ML Prophet • {WAREHOUSE}</p>
      </div>
      <div style={{background:"#eff6ff",border:`1px solid #bfdbfe`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#1d4ed8"}}>
        ℹ️ <b>📊 Heuristik</b> = rata-rata pemakaian historis TUG-9/8 vs stok saat ini (selalu tersedia). <b>🧠 ML Prophet</b> = model statistik dari histori TUG-15, lebih presisi tapi butuh minimal 10 transaksi keluar per material. Klik kartu untuk analisis AI mendalam + tren prediksi.
      </div>

      {/* Filter status — klik buat menyaring list di bawah */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
        <button onClick={()=>setStatusFilter("ALL")}
          style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${statusFilter==="ALL"?C.accent:C.border}`,background:statusFilter==="ALL"?C.accent:"white",color:statusFilter==="ALL"?"white":C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          Semua ({enriched.length})
        </button>
        {STATUS_FILTERS.map(label=>(
          <button key={label} onClick={()=>setStatusFilter(statusFilter===label?"ALL":label)}
            style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${statusFilter===label?C.accent:C.border}`,background:statusFilter===label?C.accent:"white",color:statusFilter===label?"white":C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {label} ({statusCounts[label]})
          </button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:14}}>
        {visibleList.map(({kat,stockRows,risk,ml})=>{
          const totalQty = stockRows.reduce((a,s)=>a+(s.qty||0),0);
          // Tandai kalau heuristik & ML berbeda jauh (>40% relatif) — sinyal buat ditelusuri lebih lanjut
          const divergent = ml?.estimasiHari!=null && risk.hari!==Infinity && Math.abs(ml.estimasiHari-risk.hari) / Math.max(risk.hari,1) > 0.4;
          return (
            <div key={kat.id} style={{...sty.card,borderLeft:`4px solid ${risk.color}`,cursor:"pointer"}}
              onClick={()=>{setForecastDetail({kat,stockRows});setForecastDetailResult(null);forecastDrillDown(kat,stockRows);}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{kat.name}</div>
                  <div style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>{kat.katalog}</div>
                </div>
                <span style={{padding:"3px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:risk.bg,color:risk.color,marginLeft:8,flexShrink:0}}>{risk.label}</span>
              </div>
              <div style={{background:"#f9fafb",borderRadius:6,padding:"6px 8px",marginBottom:8}}>
                <div style={{fontSize:9,color:C.muted,fontWeight:700}}>STOK SAAT INI</div>
                <div style={{fontSize:14,fontWeight:800,color:C.text}}>{fmtNum(totalQty)} <span style={{fontSize:10,fontWeight:400}}>{kat.satuan}</span></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                <div style={{background:"#eff6ff",borderRadius:6,padding:"6px 8px"}}>
                  <div style={{fontSize:8.5,color:"#1d4ed8",fontWeight:700}}>📊 HEURISTIK</div>
                  <div style={{fontSize:12.5,fontWeight:800,color:"#1d4ed8"}}>{risk.hari===Infinity?"Tdk ada data":risk.hari>365?">1 thn":`~${risk.hari} hr`}</div>
                </div>
                <div style={{background:"#f5f3ff",borderRadius:6,padding:"6px 8px"}}>
                  <div style={{fontSize:8.5,color:"#7c3aed",fontWeight:700}}>🧠 ML PROPHET</div>
                  <div style={{fontSize:12.5,fontWeight:800,color:"#7c3aed"}}>{ml?.estimasiHari!=null?`~${fmtNum(ml.estimasiHari)} hr`:"Data kurang"}</div>
                </div>
              </div>
              {divergent && <div style={{fontSize:10,color:"#b45309",background:"#fef3c7",borderRadius:6,padding:"4px 8px",marginBottom:8}}>⚠️ Heuristik & ML beda jauh — perlu ditelusuri</div>}
              <div style={{display:"flex",gap:6}}>
                <button style={{...sty.btn("primary","sm"),flex:2}} onClick={e=>{e.stopPropagation();setForecastDetail({kat,stockRows});setForecastDetailResult(null);forecastDrillDown(kat,stockRows);}}>
                  🔮 Analisis AI Detail
                </button>
                <button style={{...sty.btn("ghost","sm"),flex:1}} onClick={e=>{e.stopPropagation();lanjutkanDiChat(`Analisis dan forecast stok untuk material: ${kat.name} [${kat.katalog}]`);}}>
                  💬 Tanya AI
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {katalogWithStock.length===0 && (
        <div style={{...sty.card,textAlign:"center",padding:50,color:C.muted}}>
          <div style={{fontSize:40,marginBottom:12}}>📈</div>
          <div style={{fontSize:14,fontWeight:700}}>Belum ada data stok untuk dianalisis</div>
        </div>
      )}
      {katalogWithStock.length>0 && visibleList.length===0 && (
        <div style={{...sty.card,textAlign:"center",padding:50,color:C.muted}}>
          <div style={{fontSize:40,marginBottom:12}}>🔍</div>
          <div style={{fontSize:14,fontWeight:700}}>Tidak ada material dengan status "{statusFilter}"</div>
        </div>
      )}
      </div>} {/* end forecastView==="forecast" */}
    </div>
  );
}
