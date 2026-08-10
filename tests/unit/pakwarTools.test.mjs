// Tool-use registry chat "Pak War" (App.jsx sendChat) — tiap tool.run() harus balikin
// hasil query DETERMINISTIK yang benar atas data nyata (reuse analytics.js/ragShared.mjs),
// supaya LLM tidak mengarang angka. Lihat HANDOFF Tier 2.
import test from "node:test";
import assert from "node:assert";
import { pakwarTools, pakwarToolSchemas, runPakwarTool } from "../../src/lib/pakwarTools.js";

const katalogList = [
  { id: "K1", name: "Kabel NYY", katalog: "K-001", satuan: "M" },
  { id: "K2", name: "Isolator", katalog: "K-002", satuan: "M" },
  { id: "K3", name: "Trafo", katalog: "K-003", satuan: "U" },
];

const stocks = [
  { id: "S1", katalogId: "K1", name: "Kabel NYY", katalog: "K-001", qty: 500, unit: "M", price: 10000, lokasi: "Gudang A" },
  { id: "S2", katalogId: "K2", name: "Isolator", katalog: "K-002", qty: 900, unit: "M", price: 5000, lokasi: "Gudang B" },
  { id: "S3", katalogId: "K3", name: "Trafo", katalog: "K-003", qty: 2, unit: "U", price: 500000, minQty: 5, lokasi: "Gudang A" },
];

const ctx = { stocks, katalogList, txns: [], uptNama: "UPT Test" };

function tool(name) {
  return pakwarTools.find(t => t.name === name);
}

test("top_stock_by_qty urut benar per satuan", () => {
  const { groups } = tool("top_stock_by_qty").run({ n: 5 }, ctx);
  const grupM = groups.find(g => g.satuan === "M");
  assert.strictEqual(grupM.items[0].katalogId, "K2"); // 900 > 500
});

test("top_stock_by_value urut benar (qty x harga)", () => {
  const { items } = tool("top_stock_by_value").run({ n: 5 }, ctx);
  // Trafo: 2*500000=1.000.000 > Kabel: 500*10000=5.000.000 -> Kabel harus di atas
  assert.strictEqual(items[0].name, "Kabel NYY");
  assert.strictEqual(items[0].nilai, 5000000);
});

test("stok_kritis menandai stok <= minQty", () => {
  const { items } = tool("stok_kritis").run({}, ctx);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].name, "Trafo");
});

test("cari_material menemukan berdasarkan nama", () => {
  const { items } = tool("cari_material").run({ query: "isolator" }, ctx);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].katalog, "K-002");
});

test("total_inventori menjumlah benar", () => {
  const { totalItem, totalNilai, totalPerSatuan } = tool("total_inventori").run({}, ctx);
  assert.strictEqual(totalItem, 3);
  assert.strictEqual(totalNilai, 500*10000 + 900*5000 + 2*500000);
  assert.deepStrictEqual(totalPerSatuan, { M: 1400, U: 2 });
});

test("proyeksi_stok_habis balikin array (belum cukup histori => kosong, bukan error)", () => {
  const { items } = tool("proyeksi_stok_habis").run({ n: 5 }, ctx);
  assert.ok(Array.isArray(items));
});

test("runPakwarTool dispatch by name+arguments JSON", () => {
  const result = JSON.parse(runPakwarTool({ id: "call_1", function: { name: "top_stock_by_qty", arguments: '{"n":3}' } }, ctx));
  assert.ok(Array.isArray(result.groups));
  assert.ok(result.groups.length > 0);
});

test("runPakwarTool balikin error utk tool tak dikenal (bukan throw)", () => {
  const result = JSON.parse(runPakwarTool({ id: "call_x", function: { name: "tidak_ada", arguments: "{}" } }, ctx));
  assert.ok(result.error);
});

test("pakwarToolSchemas format OpenAI function-calling", () => {
  assert.strictEqual(pakwarToolSchemas.length, pakwarTools.length);
  pakwarToolSchemas.forEach(s => {
    assert.strictEqual(s.type, "function");
    assert.ok(s.function.name);
  });
});
