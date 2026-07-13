// Komponen AIAgentPage — dipindah dari App.jsx (refactor Fase 5b).
import { useState } from "react";
import { WAREHOUSE } from "../constants.js";
import { fmtDate } from "../lib/utils.js";
import { hasRole } from "../lib/roles.js";
import { AIFaqPanel } from "./AIFaqPanel.jsx";
import { TelegramWhitelistPanel } from "./TelegramWhitelistPanel.jsx";

export function AIAgentPage({ enrichedStocks, katalogList, stocks, txns,
  rencanaKedatanganList, chatHistory, setChatHistory, chatInput, setChatInput,
  chatLoading, chatEndRef, sendChat, syncRagChunks, syncWarnotoState, syncStocksSnapshot, ragSyncing, ragLastSync, currentUser, C, sty }) {

  const [showFaqPanel, setShowFaqPanel] = useState(false);
  const [showTgPanel, setShowTgPanel] = useState(false);

  const SUGGESTED = [
    "Analisa kondisi stok sekarang dan material yang perlu perhatian",
    "Material apa yang paling sering dipakai 3 bulan terakhir?",
    "Ada berapa TUG yang masih pending approval?",
    "Material apa yang stoknya hampir habis?",
    "Forecast kebutuhan material 3 bulan ke depan",
    "Kapan terakhir kita terima material dari rencana kedatangan?",
  ];

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:900}}>🤖 AI Agent</h1>
          <p style={{color:C.muted,fontSize:13}}>Powered by Claude AI • Data real-time {WAREHOUSE} • Untuk prediksi stok/forecast, lihat menu "📈 Forecast Stok"</p>
        </div>
        {hasRole(currentUser, "ADMIN") && (
          <div style={{textAlign:"right"}}>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button style={{...sty.btn("ghost","sm"),opacity:ragSyncing?0.6:1}} disabled={ragSyncing} onClick={async()=>{await syncStocksSnapshot(); await syncRagChunks(); await syncWarnotoState();}}>
                {ragSyncing?"Menyinkron...":"🔄 Sync Knowledge Base (RAG + Bot Telegram)"}
              </button>
              <button style={sty.btn(showFaqPanel?"primary":"ghost","sm")} onClick={()=>setShowFaqPanel(v=>!v)}>
                🧠 Kelola FAQ Bot
              </button>
              <button style={sty.btn(showTgPanel?"primary":"ghost","sm")} onClick={()=>setShowTgPanel(v=>!v)}>
                📱 Kelola User Telegram
              </button>
            </div>
            {ragLastSync && <div style={{fontSize:10,color:C.muted,marginTop:4}}>Terakhir sync: {fmtDate(ragLastSync)}</div>}
          </div>
        )}
      </div>

      {showFaqPanel && hasRole(currentUser, "ADMIN") && <AIFaqPanel sty={sty} C={C} onSaved={async()=>{await syncRagChunks(true);}}/>}
      {showTgPanel && hasRole(currentUser, "ADMIN") && <TelegramWhitelistPanel sty={sty} C={C} currentUser={currentUser}/>}

      {/* ── CHAT AI ── */}
      <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 180px)"}}>
          {/* Suggested questions */}
          {chatHistory.length<=1 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:8}}>💡 PERTANYAAN YANG SERING DITANYAKAN</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {SUGGESTED.map((q,i)=>(
                  <button key={i} style={{padding:"6px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:"white",color:C.text,fontSize:11,cursor:"pointer",transition:"all 0.15s"}}
                    onClick={()=>sendChat(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}
          {/* Chat history */}
          <div style={{flex:1,overflowY:"auto",background:"white",borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:10}}>
            {chatHistory.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:14}}>
                {m.role==="ai" && (
                  <div style={{width:34,height:34,borderRadius:"50%",background:C.sidebar,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginRight:8,flexShrink:0}}>⚡</div>
                )}
                <div style={{maxWidth:"78%",padding:"10px 14px",
                  borderRadius:m.role==="user"?"12px 12px 2px 12px":"12px 12px 12px 2px",
                  background:m.role==="user"?C.accent:"#f8fafc",
                  color:m.role==="user"?"white":C.text,
                  fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap",
                  border:m.role==="ai"?`1px solid ${C.border}`:"none"}}>
                  {m.text}
                </div>
                {m.role==="user" && (
                  <div style={{width:34,height:34,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,marginLeft:8,flexShrink:0,color:"white",fontWeight:700}}>U</div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:C.sidebar,display:"flex",alignItems:"center",justifyContent:"center"}}>⚡</div>
                <div style={{background:"#f8fafc",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",fontSize:12,color:C.muted}}>
                  Menganalisa data gudang... ⏳
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>
          {/* Input */}
          <div style={{display:"flex",gap:8}}>
            <button title="Bersihkan riwayat chat" style={{...sty.btn("ghost","sm"),flexShrink:0}} onClick={()=>setChatHistory([{role:"ai",text:`Halo! Ada yang bisa saya bantu tentang data gudang ${WAREHOUSE}?`}])}>🗑️</button>
            <input style={{...sty.input,flex:1}}
              placeholder="Tanya AI tentang stok, forecast, atau analisa gudang... (Enter untuk kirim)"
              value={chatInput}
              onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()}/>
            <button style={sty.btn("primary")} onClick={()=>sendChat()} disabled={chatLoading}>
              {chatLoading?"...":"Kirim 🚀"}
            </button>
          </div>
        </div>
    </div>
  );
}
