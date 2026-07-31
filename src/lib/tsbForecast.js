// TSB (Teunter-Syntetos-Babai) — estimasi demand bulanan untuk material dengan pola
// pemakaian intermiten/lumpy (kadang berbulan-bulan 0, lalu keluar banyak sekaligus).
// Rata-rata flat (total qty / jumlah bulan observasi) dulu dipakai di getRisk()/forecastDrillDown
// dan bias oleh panjang jendela observasi + tidak meluruh saat demand berhenti. TSB memisahkan
// probabilitas "bulan ini ada pemakaian" dari "berapa besar kalau terjadi", dan probabilitasnya
// ikut meluruh ke 0 kalau material sudah lama tidak dipakai (beda dari Croston's klasik yang
// forecast-nya tetap flat selamanya walau demand sudah berhenti total — cocok untuk kasus
// material yang mungkin sudah obsolete). Referensi: Teunter, Syntetos & Babai (2011).
const ALPHA = 0.1; // smoothing probabilitas kejadian demand per bulan
const BETA = 0.1;  // smoothing besaran demand saat terjadi

// monthlySeries WAJIB berisi bulan-bulan kosong (qty 0) juga, bukan cuma bulan yang ada
// transaksinya — kalau bulan 0 dilewatkan, probabilitas kejadian jadi overestimate.
export function tsbMonthlyForecast(monthlySeries) {
  let a = 0, z = 0;
  for (const d of monthlySeries) {
    if (d > 0) { a += ALPHA * (1 - a); z += BETA * (d - z); }
    else { a += ALPHA * (0 - a); }
  }
  return { demandProbability: a, avgDemandSize: z, forecastPerPeriod: a * z };
}

// Ubah map {"YYYY-MM": qty} (yang cuma menyimpan bulan berisi transaksi) menjadi array
// berurutan dari bulan tertua sampai `now`, dengan bulan kosong diisi 0.
export function expandMonthlySeriesFromMap(historyMap, now = Date.now()) {
  const keys = Object.keys(historyMap);
  if (keys.length === 0) return [];
  const toIndex = (key) => { const [y, m] = key.split("-").map(Number); return y * 12 + (m - 1); };
  const nowDate = new Date(now);
  const endIdx = nowDate.getFullYear() * 12 + nowDate.getMonth();
  const startIdx = Math.min(...keys.map(toIndex));
  const series = [];
  for (let idx = startIdx; idx <= endIdx; idx++) {
    const y = Math.floor(idx / 12), m = (idx % 12) + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    series.push(historyMap[key] || 0);
  }
  return series;
}

// Sama seperti expandMonthlySeriesFromMap tapi input-nya list {qty, ts} (dipakai getRisk()
// yang bekerja dari daftar transaksi mentah, bukan map yang sudah dikelompokkan).
export function buildMonthlyDemandSeries(usageItems, now = Date.now()) {
  if (!usageItems.length) return [];
  const historyMap = {};
  usageItems.forEach(({ qty, ts }) => {
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    historyMap[key] = (historyMap[key] || 0) + (qty || 0);
  });
  return expandMonthlySeriesFromMap(historyMap, now);
}
