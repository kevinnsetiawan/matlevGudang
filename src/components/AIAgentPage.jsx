import { useState } from "react";
import { WAREHOUSE } from "../constants.js";
import { fmtDate } from "../lib/utils.js";
import { hasRole } from "../lib/roles.js";
import { AIFaqPanel } from "./AIFaqPanel.jsx";
import { TelegramWhitelistPanel } from "./TelegramWhitelistPanel.jsx";

export function AIAgentPage({
  chatHistory, setChatHistory, chatInput, setChatInput,
  chatLoading, chatEndRef, sendChat, syncRagChunks, syncWarnotoState,
  syncStocksSnapshot, ragSyncing, ragLastSync, currentUser, C, sty,
}) {
  const [showFaqPanel, setShowFaqPanel] = useState(false);
  const [showTgPanel, setShowTgPanel] = useState(false);

  const suggested = [
    {category:"Kondisi stok",title:"Prioritas hari ini",question:"Analisa kondisi stok sekarang dan material yang perlu perhatian"},
    {category:"Pemakaian",title:"Material paling aktif",question:"Material apa yang paling sering dipakai 3 bulan terakhir?"},
    {category:"Approval",title:"Dokumen tertunda",question:"Ada berapa TUG yang masih pending approval?"},
    {category:"Stok kritis",title:"Material hampir habis",question:"Material apa yang stoknya hampir habis?"},
    {category:"Forecast",title:"Proyeksi kebutuhan",question:"Forecast kebutuhan material 3 bulan ke depan"},
    {category:"Penerimaan",title:"Kedatangan terakhir",question:"Kapan terakhir kita terima material dari rencana kedatangan?"},
  ];

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!chatLoading && chatInput.trim()) sendChat();
    }
  };

  return (
    <div className="ai-agent-page">
      <div className="ai-agent-toolbar">
        <div className="ai-agent-toolbar__copy">
          <span>Asisten operasional gudang</span>
          <strong>Pak War</strong>
          <small>Teman kerja digital untuk membaca data real-time {WAREHOUSE}, merangkum kondisi, dan membantu menentukan prioritas.</small>
        </div>
        {hasRole(currentUser, "ADMIN") && (
          <div className="ai-agent-admin">
            <div className="ai-agent-admin__actions">
              <button disabled={ragSyncing} onClick={async()=>{await syncStocksSnapshot();await syncRagChunks();await syncWarnotoState();}}>
                {ragSyncing ? "Menyinkron..." : "Sinkronkan knowledge base"}
              </button>
              <button className={showFaqPanel?"is-active":""} onClick={()=>setShowFaqPanel(v=>!v)}>Kelola FAQ</button>
              <button className={showTgPanel?"is-active":""} onClick={()=>setShowTgPanel(v=>!v)}>User Telegram</button>
            </div>
            {ragLastSync && <small>Sinkron terakhir {fmtDate(ragLastSync)}</small>}
          </div>
        )}
      </div>

      {showFaqPanel && hasRole(currentUser, "ADMIN") && <AIFaqPanel sty={sty} C={C} onSaved={async()=>{await syncRagChunks(true);}}/>}
      {showTgPanel && hasRole(currentUser, "ADMIN") && <TelegramWhitelistPanel sty={sty} C={C} currentUser={currentUser}/>}

      <section className="ai-chat-shell" aria-label="Percakapan dengan Pak War">
        {chatHistory.length<=1 && (
          <div className="ai-welcome">
            <div className="ai-welcome__intro">
              <div className="ai-welcome__avatar" aria-hidden="true">PW</div>
              <div>
                <span>PAK WAR · ASISTEN WARNOTO</span>
                <h2>Apa yang ingin Anda ketahui dari gudang hari ini?</h2>
                <p>Pilih pertanyaan yang sering digunakan atau tulis kebutuhan Anda pada kolom percakapan.</p>
              </div>
            </div>
            <div className="ai-suggestions">
              <div className="ai-suggestions__heading">
                <strong>Pertanyaan yang sering ditanyakan</strong>
                <span>Klik satu kartu untuk langsung menanyakan kalimat yang sama kepada Pak War</span>
              </div>
              <div className="ai-suggestions__grid">
                {suggested.map((item,index)=>(
                  <button key={index} onClick={()=>sendChat(item.question)}>
                    <span className="ai-prompt-card__category">{item.category}</span>
                    <strong>{item.title}</strong>
                    <small>{item.question}</small>
                    <b aria-hidden="true">Tanyakan →</b>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="ai-chat-history">
          {chatHistory.map((message,index)=>(
            <div key={index} className={`ai-message is-${message.role}`}>
              <div className="ai-message__avatar" aria-hidden="true">{message.role==="user"?"U":"PW"}</div>
              <div className="ai-message__content">
                <span>{message.role==="user"?"Anda":"Pak War"}</span>
                <p>{message.text}</p>
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="ai-message is-ai is-loading">
              <div className="ai-message__avatar" aria-hidden="true">PW</div>
              <div className="ai-message__content"><span>Pak War</span><p>Sedang membaca dan menganalisis data gudang...</p></div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>

        <div className="ai-chat-composer">
          <button className="ai-chat-composer__clear" title="Bersihkan riwayat chat" aria-label="Bersihkan riwayat chat" onClick={()=>setChatHistory([{role:"ai",text:`Halo, saya Pak War. Apa yang ingin Anda ketahui tentang data gudang ${WAREHOUSE}?`}])}>Hapus chat</button>
          <textarea
            rows={1}
            placeholder="Tanya Pak War tentang stok, transaksi, approval, atau operasional gudang..."
            value={chatInput}
            onChange={event=>setChatInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="ai-chat-composer__send" onClick={()=>sendChat()} disabled={chatLoading||!chatInput.trim()}>Kirim</button>
        </div>
        <div className="ai-chat-hint">Enter untuk kirim · Shift + Enter untuk baris baru</div>
      </section>
    </div>
  );
}
