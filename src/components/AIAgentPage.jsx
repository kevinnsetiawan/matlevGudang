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
  const isWelcome = chatHistory.length<=1;
  const suggested = [
    {title:"Prioritas stok hari ini",question:"Analisa kondisi stok sekarang dan material yang perlu perhatian"},
    {title:"Dokumen yang tertunda",question:"Ada berapa TUG yang masih pending approval?"},
    {title:"Material hampir habis",question:"Material apa yang stoknya hampir habis?"},
    {title:"Proyeksi tiga bulan",question:"Forecast kebutuhan material 3 bulan ke depan"},
  ];

  function handleKeyDown(event) {
    if (event.key==="Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!chatLoading && chatInput.trim()) sendChat();
    }
  }

  return (
    <div className="ai-agent-page">
      <section className={`ai-conversation${isWelcome?" is-welcome":""}`} aria-label="Percakapan dengan Pak War">
        <header className="ai-conversation__header">
          <div className="ai-conversation__identity">
            <div className="ai-conversation__avatar" aria-hidden="true">PW</div>
            <div><span>Asisten operasional WARNOTO</span><strong>Pak War</strong><small>Terhubung dengan data {WAREHOUSE}</small></div>
          </div>
          {hasRole(currentUser,"ADMIN") && <div className="ai-conversation__admin">
            <button disabled={ragSyncing} onClick={async()=>{await syncStocksSnapshot();await syncRagChunks();await syncWarnotoState();}}>{ragSyncing?"Menyinkron...":"Sinkron data"}</button>
            <button className={showFaqPanel?"is-active":""} onClick={()=>setShowFaqPanel(value=>!value)}>FAQ</button>
            <button className={showTgPanel?"is-active":""} onClick={()=>setShowTgPanel(value=>!value)}>Telegram</button>
            {ragLastSync && <span>Sync {fmtDate(ragLastSync)}</span>}
          </div>}
        </header>

        {(showFaqPanel||showTgPanel) && <div className="ai-conversation__config">
          {showFaqPanel && hasRole(currentUser,"ADMIN") && <AIFaqPanel sty={sty} C={C} onSaved={async()=>{await syncRagChunks(true);}}/>}
          {showTgPanel && hasRole(currentUser,"ADMIN") && <TelegramWhitelistPanel sty={sty} C={C} currentUser={currentUser}/>}
        </div>}

        {isWelcome ? (
          <div className="ai-start">
            <div className="ai-start__intro">
              <span>Mulai percakapan</span>
              <h2>Apa yang perlu diperiksa hari ini?</h2>
              <p>Pak War membantu merangkum stok, transaksi, approval, dan forecast. Pilih pertanyaan cepat atau tulis pertanyaan sendiri.</p>
              <div className="ai-start__status"><i></i><span>Siap membaca data gudang terbaru</span></div>
            </div>
            <div className="ai-quick-prompts">
              <span>Pertanyaan cepat</span>
              <div>
                {suggested.map((item,index)=><button key={index} onClick={()=>sendChat(item.question)}>
                  <span>{item.title}</span><small>{item.question}</small><b aria-hidden="true">→</b>
                </button>)}
              </div>
            </div>
          </div>
        ) : (
          <div className="ai-chat-history">
            {chatHistory.map((message,index)=><div key={index} className={`ai-message is-${message.role}`}>
              <div className="ai-message__avatar" aria-hidden="true">{message.role==="user"?"U":"PW"}</div>
              <div className="ai-message__content"><span>{message.role==="user"?"Anda":"Pak War"}</span><p>{message.text}</p></div>
            </div>)}
            {chatLoading && <div className="ai-message is-ai is-loading"><div className="ai-message__avatar" aria-hidden="true">PW</div><div className="ai-message__content"><span>Pak War</span><p>Sedang membaca dan menganalisis data gudang...</p></div></div>}
            <div ref={chatEndRef}/>
          </div>
        )}

        <div className="ai-composer">
          {!isWelcome && <button className="ai-composer__reset" title="Mulai percakapan baru" onClick={()=>setChatHistory([{role:"ai",text:`Halo, saya Pak War. Apa yang ingin Anda ketahui tentang data gudang ${WAREHOUSE}?`}])}>Percakapan baru</button>}
          <textarea rows={1} placeholder="Tulis pertanyaan untuk Pak War..." value={chatInput} onChange={event=>setChatInput(event.target.value)} onKeyDown={handleKeyDown}/>
          <button className="ai-composer__send" onClick={()=>sendChat()} disabled={chatLoading||!chatInput.trim()}>Kirim</button>
        </div>
        <div className="ai-composer__hint">Enter untuk kirim · Shift + Enter untuk baris baru</div>
      </section>
    </div>
  );
}
