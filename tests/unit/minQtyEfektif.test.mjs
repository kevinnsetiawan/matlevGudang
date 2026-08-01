// Stok minimum efektif (reorder point dari histori, fallback manual) — satu rumus dipakai
// Forecast Stok, Dashboard, dan bot Telegram. Test ini menjaga: (1) ambang 3 bulan histori,
// (2) getKritisAgg tetap backward compatible tanpa argumen kedua, (3) hasil browser
// (buildMonthlySeriesByKatalog) identik dengan hasil bot (expandMonthlySeriesFromMap dari
// tug15_history) untuk deret yang sama.
import test from "node:test";
import assert from "node:assert";
import { computeEffectiveMinQty, expandMonthlySeriesFromMap, getKritisAgg } from "../../src/lib/ragShared.mjs";
import { buildMonthlySeriesByKatalog } from "../../src/lib/analytics.js";

const stocks = [
  { id: "S1", katalogId: "K1", qty: 20, minQty: 5, jenisBarang: "Persediaan", name: "Kabel" },
  { id: "S1b", katalogId: "K1", qty: 5, minQty: 3, jenisBarang: "Persediaan", name: "Kabel" },
  { id: "S2", katalogId: "K2", qty: 2, minQty: 5, jenisBarang: "Persediaan", name: "Isolator" },
];
const bulanLalu = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.getTime(); };
const txns = [
  { id: "T1", docType: "TUG9", status: "APPROVED", approvedAt: bulanLalu(4), stockItems: [{ stockId: "S1", qty: 30 }] },
  { id: "T2", docType: "TUG9", status: "APPROVED", approvedAt: bulanLalu(2), stockItems: [{ stockId: "S1", qty: 10 }] },
  { id: "T3", docType: "TUG8", status: "APPROVED", approvedAt: bulanLalu(0), stockItems: [{ stockId: "S1", qty: 20 }] },
  { id: "T4", docType: "TUG9", status: "APPROVED", approvedAt: bulanLalu(0), stockItems: [{ stockId: "S2", qty: 1 }] },
  { id: "T5", docType: "TUG3", status: "APPROVED", approvedAt: bulanLalu(1), stockItems: [{ stockId: "S1", qty: 999 }] },
  { id: "T6", docType: "TUG9", status: "PENDING", approvedAt: bulanLalu(1), stockItems: [{ stockId: "S1", qty: 999 }] },
];

test("computeEffectiveMinQty pakai manual di bawah 3 bulan histori, computed di atasnya", () => {
  assert.deepStrictEqual(computeEffectiveMinQty({ monthlySeries: [], manualMinQty: 7 }), { minQty: 7, minQtySource: "manual" });
  assert.deepStrictEqual(computeEffectiveMinQty({ monthlySeries: [4, 0], manualMinQty: 7 }), { minQty: 7, minQtySource: "manual" });
  assert.deepStrictEqual(computeEffectiveMinQty({ monthlySeries: [10, 0, 4], manualMinQty: 7 }), { minQty: 12, minQtySource: "computed" });
});

test("buildMonthlySeriesByKatalog cuma hitung TUG9/TUG8 approved dan isi bulan kosong dengan 0", () => {
  const series = buildMonthlySeriesByKatalog(txns, stocks);
  assert.deepStrictEqual(series.K1, [30, 0, 10, 0, 20]);
  assert.strictEqual(series.K2.length, 1);
});

test("getKritisAgg tanpa argumen kedua tetap berperilaku lama (minQty manual)", () => {
  const kritis = getKritisAgg(stocks);
  assert.deepStrictEqual(kritis.map((m) => m.katalogId), ["K2"]);
  assert.strictEqual(kritis[0].minQtySource, "manual");
});

test("getKritisAgg dengan histori menaikkan minQty jadi computed", () => {
  const kritis = getKritisAgg(stocks, buildMonthlySeriesByKatalog(txns, stocks));
  const k1 = kritis.find((m) => m.katalogId === "K1");
  assert.strictEqual(k1.minQtySource, "computed");
  assert.strictEqual(k1.minQty, 32); // > max minQty manual (5) → material ini jadi kritis
  assert.strictEqual(kritis.find((m) => m.katalogId === "K2").minQtySource, "manual");
});

test("deret bot (tug15_history KELUAR) menghasilkan minQty sama dengan deret browser", () => {
  const mutasi = [
    { katalog_id: "K1", jenis_transaksi: "KELUAR", qty: 30, tanggal: "2026-04-03" },
    { katalog_id: "K1", jenis_transaksi: "KELUAR", qty: 10, tanggal: "2026-06-11" },
    { katalog_id: "K1", jenis_transaksi: "KELUAR", qty: 20, tanggal: "2026-08-01" },
    { katalog_id: "K1", jenis_transaksi: "MASUK", qty: 500, tanggal: "2026-07-01" },
  ];
  const perBulan = {};
  mutasi.forEach((m) => {
    if (m.jenis_transaksi !== "KELUAR") return;
    const b = m.tanggal.slice(0, 7);
    if (!perBulan[m.katalog_id]) perBulan[m.katalog_id] = {};
    perBulan[m.katalog_id][b] = (perBulan[m.katalog_id][b] || 0) + m.qty;
  });
  const seriesBot = expandMonthlySeriesFromMap(perBulan.K1, new Date(2026, 7, 15).getTime());
  assert.deepStrictEqual(seriesBot, [30, 0, 10, 0, 20]);
  assert.strictEqual(computeEffectiveMinQty({ monthlySeries: seriesBot, manualMinQty: 5 }).minQty, 32);
});
