// Chunk RAG "forecast" (proyeksi bulan-ke-habis) — jaga rumus qty/mean & status tidak berubah
// diam-diam, karena dipakai bot Telegram lewat nightly_sync.mjs.
import test from "node:test";
import assert from "node:assert";
import { buildForecastRagContent } from "../../src/lib/ragShared.mjs";

test("buildForecastRagContent hitung bulan-ke-habis dari rata-rata & tandai status", () => {
  const out = buildForecastRagContent({ nama: "Kabel NYY", satuan: "meter", qty: 100, monthlySeries: [10, 30, 20], effectiveMinQty: 5 });
  assert.match(out, /rata-rata pemakaian 20\/bulan/);
  assert.match(out, /perkiraan habis dalam ~5 bulan/); // 100/20 = 5
  assert.match(out, /Status: aman/);
});

test("buildForecastRagContent status PERLU PENGADAAN SEGERA kalau qty <= reorder point", () => {
  const out = buildForecastRagContent({ nama: "Isolator", satuan: "pcs", qty: 3, monthlySeries: [2, 4], effectiveMinQty: 5 });
  assert.match(out, /Status: PERLU PENGADAAN SEGERA/);
});

test("buildForecastRagContent tanpa histori (mean 0) bilang belum tersedia", () => {
  const out = buildForecastRagContent({ nama: "Trafo", satuan: "unit", qty: 2, monthlySeries: [], effectiveMinQty: 1 });
  assert.match(out, /belum ada histori pemakaian, proyeksi belum tersedia/);
});
