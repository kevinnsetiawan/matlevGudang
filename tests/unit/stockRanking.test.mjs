// Ranking stok by-qty (BUKAN by-nilai) dipakai bot "Pak War" untuk pertanyaan
// "stok paling banyak/terbanyak" — beda satuan tak bisa dibanding, jadi hasilnya
// harus dikelompokkan per satuan. Lihat HANDOFF Tier 1 (App.jsx systemPrompt).
import test from "node:test";
import assert from "node:assert";
import { getTopStockByQty, getTotalPerSatuan } from "../../src/lib/analytics.js";

const katalogList = [
  { id: "K1", name: "Kabel NYY", katalog: "K-001", satuan: "M" },
  { id: "K2", name: "Isolator", katalog: "K-002", satuan: "M" },
  { id: "K3", name: "Trafo", katalog: "K-003", satuan: "U" },
  { id: "K4", name: "MCB", katalog: "K-004", satuan: "SET" },
];

const stocks = [
  { katalogId: "K1", qty: 500 },
  { katalogId: "K2", qty: 900 }, // paling banyak di satuan M
  { katalogId: "K3", qty: 3 },
  { katalogId: "K3", qty: 4 }, // total K3 = 7, satu-satunya di satuan U
  { katalogId: "K4", qty: 50 },
];

test("top-by-qty urut benar dalam satu satuan", () => {
  const result = getTopStockByQty(stocks, katalogList, 10);
  const grupM = result.find(g => g.satuan === "M");
  assert.strictEqual(grupM.items[0].katalogId, "K2"); // 900 > 500
  assert.strictEqual(grupM.items[1].katalogId, "K1");
});

test("TIDAK mencampur qty antar satuan berbeda", () => {
  const result = getTopStockByQty(stocks, katalogList, 10);
  const satuanSet = new Set(result.map(g => g.satuan));
  assert.strictEqual(satuanSet.size, result.length); // tiap grup unik per satuan
  result.forEach(g => {
    g.items.forEach(item => {
      const kat = katalogList.find(k => k.id === item.katalogId);
      assert.strictEqual(kat.satuan, g.satuan); // item hanya muncul di grup satuannya sendiri
    });
  });
});

test("getTotalPerSatuan menjumlah benar", () => {
  const totals = getTotalPerSatuan([
    { satuan: "M", qty: 10 },
    { satuan: "M", qty: 5 },
    { satuan: "U", qty: 2 },
  ]);
  assert.deepStrictEqual(totals, { M: 15, U: 2 });
});
