// Komponen ExecOverview — dipindah dari App.jsx (refactor Fase 4d).
import { useState } from "react";
import { fmtNum } from "../lib/ragShared.mjs";
import { fmtRp } from "../lib/utils.js";
import { WAREHOUSE } from "../constants.js";

// Ringkasan eksekutif Dashboard (tab "Ringkasan") — status + 4 KPI + panel "Butuh Perhatian".
// Prinsip manage-by-exception: sorot yang bermasalah/menunggu keputusan; detail via tab lain.
export function ExecOverview({ totalVal, kritisMaterials=[], forecastSoon=[], approvalCount, stockCountPendingCount, attbActionCount, akurasi, maturity, setTab, setOpnameSubTab, C, sty, isMobile }) {
  const [openIdx, setOpenIdx] = useState(null);
  const kritisCount = (kritisMaterials||[]).length;
  const attention = [
    approvalCount>0 && { icon:"✅", text:`${approvalCount} dokumen menunggu approval Anda`, go:()=>setTab("approval") },
    stockCountPendingCount>0 && { icon:"📊", text:`${stockCountPendingCount} temuan Stock Count menunggu keputusan`, go:()=>{ setTab("opname"); setOpnameSubTab && setOpnameSubTab("stockCount"); } },
    kritisCount>0 && { icon:"🔴", text:`${kritisCount} material stok kritis sekarang (≤ minimum)`,
      items:(kritisMaterials||[]).slice(0,8).map(m=>`${m.name} — total ${fmtNum(m.qty)} ${m.unit||""} (min ${fmtNum(m.minQty)})`),
      more:Math.max(0,kritisCount-8), goLabel:"Buka Data Stok", go:()=>setTab("stock") },
    forecastSoon.length>0 && { icon:"📈", text:`${forecastSoon.length} material diprediksi habis ≤ 30 hari (forecast)`,
      items:forecastSoon.slice(0,8).map(r=>`${r.nama} — ~${r.estimasiHari} hari lagi (sisa ${fmtNum(r.totalQty)} ${r.satuan||""})`),
      more:Math.max(0,forecastSoon.length-8), goLabel:"Buka Forecast Stok", go:()=>setTab("forecastStok") },
    attbActionCount>0 && { icon:"🗂️", text:`${attbActionCount} aset ATTB butuh tindak lanjut`, go:()=>setTab("attb") },
  ].filter(Boolean);
  const statusLabel = attention.length===0 ? "SEHAT" : "PERLU PERHATIAN";
  const kpis = [
    { icon:"💰", label:"Nilai Inventory", val:fmtRp(totalVal), color:C.green },
    { icon:"🔴", label:"Material Kritis", val:kritisCount, color:kritisCount>0?C.red:C.green },
    { icon:"🎯", label:"Akurasi SAP vs Fisik", val:akurasi!=null?akurasi+"%":"—", color:akurasi==null?C.muted:akurasi>=90?C.green:akurasi>=70?C.yellow:C.red },
    { icon:"🏆", label:"Maturity Gudang", val:maturity?("Lv "+maturity.level):"—", color:C.accent },
  ];
  return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.sidebar},${C.accent})`,borderRadius:14,padding:isMobile?"16px 18px":"18px 24px",color:"white",marginBottom:16,boxShadow:"0 4px 16px rgba(11,37,89,0.25)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontSize:12,opacity:0.85,marginBottom:2}}>Status Gudang · {WAREHOUSE}</div>
            <div style={{fontSize:isMobile?20:24,fontWeight:800,letterSpacing:.3}}>{statusLabel}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,opacity:0.85,marginBottom:2}}>Butuh perhatian Anda</div>
            <div style={{fontSize:isMobile?20:24,fontWeight:800}}>{attention.length} hal</div>
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:12,marginBottom:16}}>
        {kpis.map(k=>(
          <div key={k.label} style={{...sty.card,padding:16}}>
            <div style={{fontSize:22,marginBottom:6}}>{k.icon}</div>
            <div style={{fontSize:isMobile?18:20,fontWeight:800,color:k.color,lineHeight:1.1}}>{k.val}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{...sty.card}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>📌 Butuh Perhatian Anda</div>
        {attention.length===0 ? (
          <div style={{fontSize:13,color:C.green,fontWeight:600,padding:"8px 0"}}>✅ Semua aman — tidak ada yang menunggu keputusan Anda saat ini.</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {attention.map((a,i)=>{
              const hasDetail = !!a.items && a.items.length>0;
              const isOpen = openIdx===i;
              return (
              <div key={i} style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",background:C.bg}}>
                <button onClick={()=> hasDetail ? setOpenIdx(isOpen?null:i) : a.go()} style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",background:"transparent",border:"none",padding:isMobile?"12px 14px":"11px 14px",minHeight:isMobile?44:undefined,cursor:"pointer"}}>
                  <span style={{fontSize:18,flexShrink:0}}>{a.icon}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:600,color:C.text}}>{a.text}</span>
                  <span style={{fontSize:13,color:C.accent,fontWeight:700,flexShrink:0}}>{hasDetail?(isOpen?"▲":"▼"):"→"}</span>
                </button>
                {hasDetail && isOpen && (
                  <div style={{padding:"0 14px 12px 44px"}}>
                    {a.items.map((t,j)=>(
                      <div key={j} style={{fontSize:12,color:C.text,padding:"5px 0",borderTop:`1px solid ${C.border}`}}>• {t}</div>
                    ))}
                    {a.more>0 && <div style={{fontSize:11,color:C.muted,padding:"6px 0 2px"}}>+{a.more} material lainnya…</div>}
                    <button onClick={a.go} style={{...sty.btn("primary","sm"),marginTop:10}}>{a.goLabel} →</button>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
