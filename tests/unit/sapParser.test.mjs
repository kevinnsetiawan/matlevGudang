import test from "node:test";
import assert from "node:assert/strict";
import XLSXDefault from "xlsx";
import { parseSAPRowsFromXLSX, parseSAPNumber, parseAppNumber } from "../../src/lib/utils.js";

const XLSX = XLSXDefault.default || XLSXDefault;

test("parseSAPRowsFromXLSX menemukan header SAP setelah baris judul dan alias laporan", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Laporan Persediaan Barang"],
    ["Periode: 8"],
    [],
    ["", "Material       ", "Material Description", "Unit", "Val. Type ", "  UU Stock"],
    ["", "1060011", "TRF ACC", "U", "NORMAL", "1"],
    ["", "1060018", "TRF ACC 2", "BH", "PRE-MEMORY", "2"],
  ]);
  const wb = XLSX.write({ SheetNames: ["LAPORAN"], Sheets: { LAPORAN: ws } }, { type: "buffer", bookType: "xlsx" });
  const rows = parseSAPRowsFromXLSX(wb);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => [r.katalog, r.qty, r.satuan]), [["1060011", 1, "U"], ["1060018", 2, "BH"]]);
});

test("nilai numerik Excel tidak berubah menjadi ribuan saat dipetakan", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Material", "Material Description", "Unit", "UU Stock"],
    ["1003110093", "CABLE", "M", 103.5],
  ]);
  const wb = XLSX.write({ SheetNames: ["SAP"], Sheets: { SAP: ws } }, { type: "buffer", bookType: "xlsx" });
  assert.equal(parseSAPRowsFromXLSX(wb)[0].qty, 103.5);
});

test("angka SAP dan angka aplikasi tidak tertukar", () => {
  assert.equal(parseSAPNumber("2,627 M"), 2.627);
  assert.equal(parseSAPNumber("2.797 M"), 2797);
  assert.equal(parseSAPNumber(1.96), 1.96);
  assert.equal(parseAppNumber("2.797"), 2.797);
  assert.equal(parseAppNumber("2,797"), 2797);
});
