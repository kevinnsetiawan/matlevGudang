import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const inputJson = process.argv[2];
const outputXlsx = process.argv[3];
const previewDir = process.argv[4];

if (!inputJson || !outputXlsx || !previewDir) {
  throw new Error("Usage: node build_asset_backup_workbook.mjs asset_backup_manifest.json output.xlsx preview-dir");
}

const raw = JSON.parse(await fs.readFile(inputJson, "utf8"));

function colName(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function rowsToMatrix(rows, preferred = []) {
  const keys = [...preferred, ...Object.keys(rows[0] || {}).filter(k => !preferred.includes(k))];
  return { keys, matrix: [keys, ...rows.map(row => keys.map(k => row[k] ?? null))] };
}

function addTableSheet(workbook, name, rows, preferred, headerFill = "#0F766E") {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const { keys, matrix } = rowsToMatrix(rows.length ? rows : [{}], preferred);
  const rowCount = Math.max(matrix.length, 2);
  const colCount = keys.length;
  const last = `${colName(colCount - 1)}${rowCount}`;
  sheet.getRangeByIndexes(0, 0, matrix.length, colCount).values = matrix;
  sheet.getRange(`A1:${colName(colCount - 1)}1`).format = {
    fill: headerFill,
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
  sheet.getRange(`A1:${last}`).format = {
    font: { name: "Aptos", size: 10, color: "#111827" },
    wrapText: false,
  };
  sheet.getRange(`A1:${last}`).format.borders = {
    insideHorizontal: { style: "thin", color: "#E5E7EB" },
    top: { style: "thin", color: "#CBD5E1" },
    bottom: { style: "thin", color: "#CBD5E1" },
  };
  try {
    sheet.tables.add(`A1:${last}`, true, `${name.replace(/[^A-Za-z0-9]/g, "")}Tbl`);
  } catch {}
  sheet.freezePanes.freezeRows(1);
  sheet.getRange(`A1:${last}`).format.autofitColumns();
  sheet.getRange(`A1:${last}`).format.autofitRows();
  keys.forEach((key, idx) => {
    const col = colName(idx);
    if (/asset|path|source|backup|ref|link|note|column|nama|material/i.test(key)) {
      sheet.getRange(`${col}1:${col}${rowCount}`).format.columnWidth = 42;
      sheet.getRange(`${col}1:${col}${rowCount}`).format.wrapText = true;
    }
    if (/row|count|bytes|value/i.test(key)) {
      sheet.getRange(`${col}2:${col}${rowCount}`).format.numberFormat = "#,##0";
    }
  });
  return sheet;
}

const wb = Workbook.create();

const readme = wb.worksheets.add("README");
readme.showGridLines = false;
readme.getRange("A1:C1").merge();
readme.getRange("A1").values = [["WARNOTO - Master Data & Asset Backup Manifest"]];
readme.getRange("A1").format = { fill: "#0F172A", font: { bold: true, color: "#FFFFFF", size: 16 } };
readme.getRange("A3:C11").values = [
  ["Tujuan", "Daftar backup semua master data dan referensi foto/dokumen AppSheet sebelum migrasi WARNOTO", ""],
  ["Penting", "File gambar AppSheet belum lengkap di folder lokal jika status NEED_APPSHEET_DATA_FOLDER atau NEED_DOWNLOAD_OR_DRIVE_EXPORT.", ""],
  ["Yang sudah dibuat", "JSON master data per sheet, copy source workbook/backup, manifest semua foto/PDF/link.", ""],
  ["Langkah berikut", "Ambil/export folder AppSheet data dari Google Drive lalu cocokkan ulang manifest sampai status FOUND_LOCAL.", ""],
  ["Jangan cutover", "Sebelum foto material, nameplate, foto TUG, tim mutu, satpam, tanda tangan, dan dokumen pendukung aman.", ""],
  ["Sheet Ringkasan", "Jumlah referensi aset dan status backup.", ""],
  ["Sheet asset_manifest", "Daftar semua referensi aset per sheet/baris/kolom.", ""],
  ["Sheet sheet_summary", "Daftar semua sheet dan kolom aset.", ""],
  ["Sheet source_files", "File sumber yang sudah disalin ke folder backup.", ""],
];
readme.getRange("A3:A11").format = { fill: "#E0F2FE", font: { bold: true } };
readme.getRange("B3:B11").format = { wrapText: true };
readme.getRange("A:C").format.autofitColumns();
readme.getRange("B:B").format.columnWidth = 95;

addTableSheet(wb, "Ringkasan", raw.summary, ["metric", "value", "note"], "#1D4ED8");
addTableSheet(wb, "sheet_summary", raw.sheet_summary, ["sheet", "rows", "columns", "asset_columns", "is_master_data"], "#334155");
addTableSheet(wb, "asset_manifest", raw.asset_manifest, [
  "sheet", "source_row_excel", "column", "record_id", "upt", "nama_material", "katalog",
  "asset_ref", "ref_type", "local_source_found", "backup_path", "backup_status",
], "#BE123C");
addTableSheet(wb, "source_files", raw.source_files, ["source_file", "backup_copy", "bytes"], "#047857");
addTableSheet(wb, "master_exports", raw.master_exports, ["sheet", "json_path"], "#7C3AED");

await fs.mkdir(path.dirname(outputXlsx), { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of Object.entries({
  README: "A1:C11",
  Ringkasan: "A1:C35",
  sheet_summary: "A1:E30",
  asset_manifest: "A1:L35",
  source_files: "A1:C20",
  master_exports: "A1:B20",
})) {
  const blob = await wb.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await blob.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outputXlsx);
console.log(JSON.stringify({ outputXlsx, previewDir }, null, 2));
