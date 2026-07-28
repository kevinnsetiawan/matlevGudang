// Komponen TUG15Tab — dipindah dari App.jsx (refactor Fase 5g).
import { useState } from "react";
import { JENIS_BARANG, UPT } from "../constants.js";
import { fmtNum } from "../lib/ragShared.mjs";
import { getSAPBadgeStyle } from "../lib/sap.js";
import { buildMutasiRows, buildTUG15HTML, syncTUG15ToSupabase, syncStockQtyToSupabase, syncFotoMaterialToSupabase } from "../lib/supabaseSync.js";
import * as XLSX from "xlsx";

export function TUG15Tab({ txns, katalogList, stocks, sty, C, filter, setFilter, lokasiList }) {
  const rows = buildMutasiRows(txns, katalogList, stocks, filter, lokasiList);
  const [syncState, setSyncState] = useState({ loading:false, msg:"" });

  async function handleSyncSupabase() {
    if (rows.length === 0) {
      setSyncState({ loading: false, msg: "Tidak ada data mutasi untuk disinkronkan. Silakan sesuaikan filter terlebih dahulu." });
      return;
    }
    setSyncState({ loading:true, msg:"" });
    try {
      const histRes = await syncTUG15ToSupabase(rows, katalogList);
      const stockRes = await syncStockQtyToSupabase(stocks, katalogList);
      const fotoRes = await syncFotoMaterialToSupabase(stocks, katalogList);
      const parts = [];
      parts.push(histRes.historyCount>0 ? `${histRes.historyCount} baris histori baru` : "tidak ada histori baru");
      parts.push(`qty ${stockRes.stockCount} katalog`);
      if (fotoRes.uploadCount>0) parts.push(`${fotoRes.uploadCount} foto baru diupload`);
      setSyncState({ loading:false, msg: `✓ Tersinkron: ${parts.join(", ")}.` });
    } catch (err) {
      setSyncState({ loading:false, msg: `✗ Gagal sync: ${err.message}` });
    }
  }

  function downloadTUG15() {
    if (rows.length === 0) {
      alert("Tidak ada data mutasi untuk filter ini. Silakan reset/sesuaikan filter tanggal atau jenis transaksi terlebih dahulu.");
      return;
    }
    const html = buildTUG15HTML(rows, filter, katalogList);
    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TUG15_Mutasi_${filter.dateFrom||"all"}_${filter.dateTo||"all"}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  }

  function downloadTUG15Excel() {
    if (rows.length === 0) {
      alert("Tidak ada data mutasi untuk filter ini. Silakan reset/sesuaikan filter tanggal atau jenis transaksi terlebih dahulu.");
      return;
    }
    try {
      const headers = ["No","No Katalog","Deskripsi Material","Status SAP","Jenis Barang","Merk","Type","Satuan","Valuasi","Saldo Awal","Stok Masuk","Stok Keluar","Saldo Akhir","UPT","TUG/BA & Tgl","Keterangan","Tanggal Mutasi"];
      const dataRows = rows.map(r=>[
        r.no, r.katalog, r.deskripsi, r.sapStatus||"", r.jenisBarang||"",
        r.merk||"-", r.type||"-", r.satuan, r.valuasi||0,
        r.saldoAwal, r.masuk, r.keluar, r.saldoAkhir,
        r.upt, r.tugBaDoc, r.keterangan, r.tanggalMutasi
      ]);
      const totalRow = ["TOTAL","","","","","","","","","",
        rows.reduce((a,r)=>a+r.masuk,0),
        rows.reduce((a,r)=>a+r.keluar,0),
        "","","","",""
      ];
      const wsData = [headers, ...dataRows, totalRow];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [5,12,30,10,12,8,8,7,14,10,10,10,10,12,18,20,12].map(w=>({wch:w}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "TUG-15 Mutasi Stok");
      const infoData = [
        ["LAPORAN MUTASI STOK MATERIAL - TUG 15"],
        ["PT PLN (PERSERO) UPT SURABAYA"],
        [""],
        ["Periode", `${filter.dateFrom||"Semua"} s/d ${filter.dateTo||"Semua"}`],
        ["Kategori SAP", filter.sapStatus==="ALL"?"SAP + Non-SAP":filter.sapStatus],
        ["Jenis Barang", filter.jenisBarang==="ALL"?"Semua":filter.jenisBarang],
        ["Total Baris", rows.length],
        ["Total Masuk", rows.reduce((a,r)=>a+r.masuk,0)],
        ["Total Keluar", rows.reduce((a,r)=>a+r.keluar,0)],
        ["Digenerate", new Date().toLocaleString("id-ID")],
      ];
      const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
      wsInfo["!cols"] = [{wch:20},{wch:40}];
      XLSX.utils.book_append_sheet(wb, wsInfo, "Info Laporan");
      XLSX.writeFile(wb, `TUG15_Mutasi_${filter.dateFrom||"all"}_${filter.dateTo||"all"}.xlsx`);
    } catch(err) {
      alert("Export Excel gagal: " + err.message + ". Gunakan format HTML/PDF sebagai alternatif.");
    }
  }

  const docTypeLabels = {TUG9:"TUG-9",TUG8:"TUG-8",TUG10:"TUG-10",TUG3:"TUG-3"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Filter Panel */}
      <div style={{background:"#ffffff",border:"1px solid #cbd5e1",borderRadius:12,padding:18,boxShadow:"0 1px 3px rgba(15,23,42,0.04)"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#0b2559",marginBottom:14,borderBottom:"1px solid #f1f5f9",paddingBottom:8,letterSpacing:"0.2px",textTransform:"uppercase"}}>
          Filter Laporan Mutasi Stok (TUG-15)
        </div>

        <div className="tug15-date-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <label style={sty.label}>Dari Tanggal</label>
            <input type="date" style={sty.input} value={filter.dateFrom} onChange={e=>setFilter(f=>({...f,dateFrom:e.target.value}))}/>
          </div>
          <div>
            <label style={sty.label}>Sampai Tanggal</label>
            <input type="date" style={sty.input} value={filter.dateTo} onChange={e=>setFilter(f=>({...f,dateTo:e.target.value}))}/>
          </div>
        </div>

        <div className="tug15-filter-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
          <div>
            <label style={sty.label}>Kategori SAP</label>
            <select style={sty.select} value={filter.sapStatus||"ALL"} onChange={e=>setFilter(f=>({...f,sapStatus:e.target.value}))}>
              <option value="ALL">Semua (SAP + Non-SAP)</option>
              <option value="SAP">Material SAP</option>
              <option value="Non-SAP">Material Non-SAP</option>
            </select>
          </div>
          <div>
            <label style={sty.label}>Jenis Barang</label>
            <select style={sty.select} value={filter.jenisBarang||"ALL"} onChange={e=>setFilter(f=>({...f,jenisBarang:e.target.value}))}>
              <option value="ALL">Semua Jenis Barang</option>
              {JENIS_BARANG.map(jb=><option key={jb} value={jb}>{jb}</option>)}
            </select>
          </div>
          <div>
            <label style={sty.label}>Filter Barang Spesifik</label>
            <select style={sty.select} value={filter.katalogId} onChange={e=>setFilter(f=>({...f,katalogId:e.target.value}))}>
              <option value="ALL">Semua Barang</option>
              {katalogList.map(k=><option key={k.id} value={k.id}>{k.name} [{k.katalog||"-"}]</option>)}
            </select>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label style={sty.label}>Filter Jenis Transaksi</label>
          <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
            {["TUG9","TUG8","TUG10","TUG3"].map(dt=>{
              const active = filter.docTypes.includes(dt);
              return (
                <button key={dt} type="button" style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${active?"#0098da":"#cbd5e1"}`,background:active?"#0098da":"#ffffff",color:active?"#ffffff":"#475569",fontSize:12,cursor:"pointer",fontWeight:active?700:500,transition:"all 0.15s ease"}}
                  onClick={()=>setFilter(f=>({...f,docTypes:active?f.docTypes.filter(x=>x!==dt):[...f.docTypes,dt]}))}>
                  {docTypeLabels[dt]}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",paddingTop:12,borderTop:"1px solid #f1f5f9"}}>
          <button className="btn-pln-ghost" onClick={()=>setFilter({dateFrom:"",dateTo:"",katalogId:"ALL",jenisBarang:"ALL",sapStatus:"ALL",docTypes:["TUG9","TUG8","TUG10","TUG3"]})}>Reset Filter</button>
          <span style={{fontSize:12,color:"#64748b",fontWeight:600}}>{rows.length} baris ditemukan</span>
          <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className="btn-pln-outline-blue" onClick={handleSyncSupabase} disabled={syncState.loading}>
              {syncState.loading?"Sinkron...":"Sync ke Supabase"}
            </button>
            <button className="btn-pln-ghost" style={{color:"#15803d",borderColor:"#86efac",background:"#f0fdf4"}} onClick={downloadTUG15Excel}>Export Excel (.xlsx)</button>
            <button className="btn-pln-primary" onClick={downloadTUG15}>Download HTML / PDF</button>
          </div>
        </div>
        {syncState.msg && <div style={{marginTop:10,fontSize:12,color:syncState.msg.startsWith("✗")?"#dc2626":"#0284c7",fontWeight:600}}>{syncState.msg}</div>}
      </div>

      {/* Preview Tabel */}
      {rows.length===0 ? (
        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:12,textAlign:"center",color:"#64748b",padding:40}}>
          <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>Tidak ada data mutasi untuk filter ini</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:4}}>Coba ubah rentang tanggal atau jenis transaksi.</div>
        </div>
      ) : (
        <div style={{background:"#ffffff",border:"1px solid #cbd5e1",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 3px rgba(15,23,42,0.04)"}}>
          <div style={{padding:"12px 18px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",fontSize:12,color:"#475569",fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Pratinjau {rows.length} Baris Mutasi Stok</span>
            <span style={{fontSize:11,color:"#94a3b8"}}>Scroll horizontal untuk melihat seluruh kolom</span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1050}}>
              <thead>
                <tr style={{background:"#0b2559",color:"#ffffff"}}>
                  {["No","No Katalog","Deskripsi Material","Status SAP","Jenis","Satuan","Saldo Awal","Masuk","Keluar","Saldo Akhir","Dokumen TUG/BA","Keterangan","Tgl Mutasi"].map(h=>(
                    <th key={h} style={{padding:"9px 10px",textAlign:["No","Saldo Awal","Masuk","Keluar","Saldo Akhir"].includes(h)?"center":"left",whiteSpace:"nowrap",fontSize:11,fontWeight:700,letterSpacing:"0.3px"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>{
                  const sapBs = getSAPBadgeStyle(r.katalog);
                  return (
                    <tr key={i} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#ffffff":"#f9fafb"}}>
                      <td style={{padding:"7px 10px",textAlign:"center",color:"#64748b"}}>{r.no}</td>
                      <td style={{padding:"7px 10px",fontFamily:"monospace",fontSize:12,color:"#0284c7",fontWeight:600}}>{r.katalog}</td>
                      <td style={{padding:"7px 10px",fontWeight:600,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.deskripsi}</td>
                      <td style={{padding:"7px 10px"}}><span style={{padding:"2px 7px",borderRadius:20,fontSize:11,fontWeight:700,background:sapBs.bg,color:sapBs.fg}}>{r.sapStatus}</span></td>
                      <td style={{padding:"7px 10px",fontSize:12}}>{r.jenisBarang||"-"}</td>
                      <td style={{padding:"7px 10px",textAlign:"center"}}>{r.satuan}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",color:"#64748b"}}>{fmtNum(r.saldoAwal)}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",color:"#166534",fontWeight:r.masuk>0?700:400}}>{r.masuk>0?fmtNum(r.masuk):"-"}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",color:"#b91c1c",fontWeight:r.keluar>0?700:400}}>{r.keluar>0?fmtNum(r.keluar):"-"}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:"#0f172a"}}>{fmtNum(r.saldoAkhir)}</td>
                      <td style={{padding:"7px 10px",fontSize:12,color:"#0284c7",whiteSpace:"nowrap",fontWeight:600}}>{r.tugBaDoc}</td>
                      <td style={{padding:"7px 10px",fontSize:12,color:"#64748b",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.keterangan}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",fontSize:12,whiteSpace:"nowrap",color:"#475569"}}>{r.tanggalMutasi}</td>
                    </tr>
                  );
                })}
                <tr style={{background:"#f1f5f9",fontWeight:700,borderTop:"2px solid #cbd5e1"}}>
                  <td colSpan={7} style={{padding:"9px 10px",textAlign:"right",color:"#0f172a"}}>TOTAL MUTASI</td>
                  <td style={{padding:"9px 10px",textAlign:"center",color:"#166534",fontSize:13}}>{fmtNum(rows.reduce((a,r)=>a+r.masuk,0))}</td>
                  <td style={{padding:"9px 10px",textAlign:"center",color:"#b91c1c",fontSize:13}}>{fmtNum(rows.reduce((a,r)=>a+r.keluar,0))}</td>
                  <td colSpan={4}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
