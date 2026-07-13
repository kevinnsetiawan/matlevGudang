// Forecast pemakaian stok (rata-rata harian dari TUG-9 approved). Pure.
// Dipindah dari App.jsx (refactor Fase 3f).

export function computeForecast(stockId, txns, stock) {
  const outTxns = txns.filter(t=>t.stockItems?.some(si=>si.stockId===stockId) && t.docType==="TUG9" && t.status==="APPROVED");
  if (!outTxns.length) return { dailyAvg:0, daysLeft:999, suggestBuy:0, trend:[], confidence:"low" };
  const DAY=86400000, nowT=Date.now();
  const daily = {};
  outTxns.forEach(t=>{
    const item = t.stockItems.find(si=>si.stockId===stockId);
    const d = Math.floor(t.createdAt/DAY);
    daily[d] = (daily[d]||0) + (item?.qty||0);
  });
  const vals = Object.values(daily);
  const dailyAvg = vals.reduce((a,b)=>a+b,0)/vals.length;
  const daysLeft = dailyAvg>0 ? Math.floor(stock.qty/dailyAvg) : 999;
  const suggestBuy = Math.max(0, Math.ceil(dailyAvg*30)-stock.qty);
  const trend = Array.from({length:7},(_,i)=>{ const d=Math.floor((nowT-(6-i)*DAY)/DAY); return daily[d]||0; });
  const confidence = vals.length>=7?"high":vals.length>=3?"medium":"low";
  return { dailyAvg:dailyAvg.toFixed(2), daysLeft, suggestBuy, trend, confidence };
}
