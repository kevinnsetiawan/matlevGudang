// Tool-use bot Telegram (Tier 2, supabase/functions/telegram-webhook) — tiap fungsi agregasi
// MURNI harus balikin angka yang benar atas data nyata, supaya LLM tidak mengarang. Lihat
// pola sama di tests/unit/pakwarTools.test.mjs (Tier 2 web).
import test from "node:test";
import assert from "node:assert/strict";
import { topStockByQty, stokKritis, cariMaterial, totalInventori, proyeksiStokHabis } from "../../supabase/functions/telegram-webhook/telegramToolsPure.mjs";

const stocks = [
  { katalogId: "K1", name: "Kabel NYY", katalog: "K-001", qty: 500, unit: "M", price: 10000, minQty: 0, lokasi: "Gudang A" },
  { katalogId: "K2", name: "Isolator", katalog: "K-002", qty: 900, unit: "M", price: 5000, minQty: 0, lokasi: "Gudang B" },
  { katalogId: "K3", name: "Trafo 100kVA", katalog: "K-003", qty: 2, unit: "U", price: 500000, minQty: 5, lokasi: "Gudang A" },
  // Trafo juga ada di lokasi lain — total agregat K3 jadi 2+1=3, tetap <= minQty 5.
  { katalogId: "K3", name: "Trafo 100kVA", katalog: "K-003", qty: 1, unit: "U", price: 500000, minQty: 5, lokasi: "Gudang C" },
];

test("topStockByQty urut benar & tak campur satuan", () => {
  const groups = topStockByQty(stocks, 5);
  const grupM = groups.find((g) => g.unit === "M");
  assert.equal(grupM.items[0].katalogId, "K2"); // 900 > 500
  const grupU = groups.find((g) => g.unit === "U");
  assert.equal(grupU.items[0].qty, 3); // agregat K3 lintas 2 lokasi
});

test("stokKritis flag qty agregat <= minQty", () => {
  const items = stokKritis(stocks);
  assert.equal(items.length, 1);
  assert.equal(items[0].katalogId, "K3");
  assert.equal(items[0].qty, 3);
});

test("cariMaterial match by nama/katalog, per-lokasi", () => {
  const items = cariMaterial(stocks, "trafo");
  assert.equal(items.length, 2); // 2 baris lokasi utk K3
  assert.equal(items[0].lokasi, "Gudang A");
});

test("totalInventori jumlah item agregat + nilai + per satuan", () => {
  const { totalItem, totalNilai, totalPerSatuan } = totalInventori(stocks);
  assert.equal(totalItem, 3); // 3 katalog unik (K1,K2,K3)
  assert.equal(totalNilai, 500 * 10000 + 900 * 5000 + 2 * 500000 + 1 * 500000);
  assert.deepEqual(totalPerSatuan, { M: 1400, U: 3 });
});

test("proyeksiStokHabis hitung rata-rata/bulan & estimasi hari benar", () => {
  const now = new Date("2026-08-10").getTime();
  const keluarRows = [
    { katalog_id: "K1", qty: 100, tanggal: "2026-05-10" }, // 3 bulan lalu -> ~90 hari
    { katalog_id: "K1", qty: 50, tanggal: "2026-07-10" },
  ];
  const items = proyeksiStokHabis(stocks, keluarRows, 10, now);
  assert.equal(items.length, 1); // hanya K1 punya histori keluar
  const k1 = items[0];
  assert.equal(k1.katalog, "K-001");
  // total 150 qty / (~92 hari/30) bulan ~= 48.9/bulan
  assert.ok(k1.avgPerBulan > 40 && k1.avgPerBulan < 55, `avgPerBulan out of range: ${k1.avgPerBulan}`);
  // estimasi hari = qty(500) / (avgPerBulan/30)
  assert.ok(k1.estimasiHari > 280 && k1.estimasiHari < 340, `estimasiHari out of range: ${k1.estimasiHari}`);
});

test("proyeksiStokHabis balikin array kosong kalau tak ada histori keluar", () => {
  const items = proyeksiStokHabis(stocks, [], 10);
  assert.deepEqual(items, []);
});
