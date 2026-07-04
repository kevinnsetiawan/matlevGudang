import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const inputJson = process.argv[2];
const outputXlsx = process.argv[3];
const previewDir = process.argv[4];
const filterUpt = process.argv[5] || "";

if (!inputJson || !outputXlsx || !previewDir) {
  throw new Error("Usage: node build_clean_history_workbook.mjs cleaned_history.json output.xlsx preview-dir");
}

const raw = JSON.parse(await fs.readFile(inputJson, "utf8"));

function matchesUpt(row) {
  if (!filterUpt) return true;
  const target = filterUpt.trim().toUpperCase();
  const rowUpt = String(row.source_upt || row.upt || "").trim().toUpperCase();
  return rowUpt === target;
}

function filteredPayload(payload) {
  if (!filterUpt) return payload;
  const tug15 = payload.tug15_history_import.filter(matchesUpt);
  const all = payload.transaksi_all_clean.filter(matchesUpt);
  const mapping = payload.mapping_material_review.filter(matchesUpt);
  const anomalies = payload.anomali_data.filter(matchesUpt);
  const master = payload.master_material_clean.filter(matchesUpt);
  const counts = {
    allRows: all.length,
    importRows: tug15.length,
    reviewRows: mapping.length,
    anomalyRows: anomalies.length,
    masterRows: master.length,
  };
  const statusCounts = mapping.reduce((acc, r) => {
    acc[r.status_review || "(kosong)"] = (acc[r.status_review || "(kosong)"] || 0) + 1;
    return acc;
  }, {});
  const docCounts = all.reduce((acc, r) => {
    acc[r.doc_type || "(kosong)"] = (acc[r.doc_type || "(kosong)"] || 0) + 1;
    return acc;
  }, {});
  const issueCounts = anomalies.reduce((acc, r) => {
    String(r.issue_flags || "").split("; ").filter(Boolean).forEach(flag => {
      acc[flag] = (acc[flag] || 0) + 1;
    });
    return acc;
  }, {});
  const summary = [
    { metric: "Filter UPT", value: filterUpt, note: "Pilot migrasi satu UPT" },
    { metric: "Master material rows", value: counts.masterRows, note: "listMaterial milik UPT terpilih" },
    { metric: "Detail TUG rows total", value: counts.allRows, note: "Semua detail TUG UPT terpilih" },
    { metric: "Rows siap import tug15_history", value: counts.importRows, note: "MASUK/KELUAR dengan tanggal, qty, katalog valid" },
    { metric: "Rows mapping material review", value: counts.reviewRows, note: "Kandidat material/katalog UPT terpilih" },
    { metric: "Anomaly rows", value: counts.anomalyRows, note: "Baris dengan warning/error" },
    ...Object.entries(docCounts).sort().map(([k, v]) => ({ metric: `Rows ${k}`, value: v, note: "" })),
    ...Object.entries(statusCounts).sort().map(([k, v]) => ({ metric: `Review ${k}`, value: v, note: "" })),
    ...Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ metric: `Issue ${k}`, value: v, note: "" })),
  ];
  return {
    ...payload,
    meta: {
      ...payload.meta,
      purpose: `${payload.meta.purpose} - filter ${filterUpt}`,
    },
    summary,
    tug15_history_import: tug15,
    transaksi_all_clean: all,
    mapping_material_review: mapping,
    anomali_data: anomalies,
    master_material_clean: master,
  };
}

const sourceRaw = raw;
const filteredRaw = filteredPayload(sourceRaw);

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

function toExcelValue(key, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && /tanggal|date/i.test(key)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return value;
}

function rowsToMatrix(rows, preferred = []) {
  const keys = [...preferred, ...Object.keys(rows[0] || {}).filter(k => !preferred.includes(k))];
  const matrix = [keys];
  for (const row of rows) matrix.push(keys.map(k => toExcelValue(k, row[k])));
  return { keys, matrix };
}

function addTableSheet(workbook, name, rows, options = {}) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const preferred = options.preferred || [];
  const { keys, matrix } = rowsToMatrix(rows.length ? rows : [{}], preferred);
  const rowCount = Math.max(matrix.length, 2);
  const colCount = keys.length;
  const last = `${colName(colCount - 1)}${rowCount}`;
  sheet.getRangeByIndexes(0, 0, matrix.length, colCount).values = matrix;
  const used = sheet.getRange(`A1:${last}`);
  used.format = {
    font: { name: "Aptos", size: 10, color: "#111827" },
    wrapText: false,
  };
  sheet.getRange(`A1:${colName(colCount - 1)}1`).format = {
    fill: options.headerFill || "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
  sheet.getRange(`A1:${last}`).format.borders = {
    insideHorizontal: { style: "thin", color: "#E5E7EB" },
    top: { style: "thin", color: "#CBD5E1" },
    bottom: { style: "thin", color: "#CBD5E1" },
  };
  try {
    sheet.tables.add(`A1:${last}`, true, `${name.replace(/[^A-Za-z0-9]/g, "")}Tbl`);
  } catch {
    // Table creation is a convenience; the data range remains valid without it.
  }
  sheet.freezePanes.freezeRows(1);
  used.format.autofitColumns();
  used.format.autofitRows();

  keys.forEach((key, idx) => {
    const col = colName(idx);
    const range = sheet.getRange(`${col}2:${col}${rowCount}`);
    if (/tanggal|date/i.test(key)) range.format.numberFormat = "yyyy-mm-dd";
    if (/qty|jumlah|value|confidence|row_excel/i.test(key)) range.format.numberFormat = "#,##0.00";
  });

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const col = colName(i);
    if (/catatan|warning|issue|nama|link|dokumen|no_bon|sync_key/i.test(key)) {
      sheet.getRange(`${col}1:${col}${rowCount}`).format.columnWidth = Math.min(options.wideWidth || 42, 58);
      sheet.getRange(`${col}1:${col}${rowCount}`).format.wrapText = true;
    }
  }
  return sheet;
}

const workbook = Workbook.create();

const readme = workbook.worksheets.add("README");
readme.showGridLines = false;
readme.getRange("A1:H1").merge();
readme.getRange("A1").values = [[filterUpt ? `WARNOTO - Cleansing History ${filterUpt}` : "WARNOTO - Cleansing History Transaksi AppSheet"]];
readme.getRange("A1").format = {
  fill: "#0F172A",
  font: { bold: true, color: "#FFFFFF", size: 16 },
};
readme.getRange("A3:B11").values = [
  ["Sumber file", filteredRaw.meta.source_file],
  ["Dibuat", filteredRaw.meta.generated_at],
  ["Tujuan", filteredRaw.meta.purpose],
  ["Sheet siap import", "tug15_history_import"],
  ["Sheet review katalog/material", "mapping_material_review"],
  ["Sheet detail semua transaksi", "transaksi_all_clean"],
  ["Sheet anomali", "anomali_data"],
  ["Sheet master hasil normalisasi", "master_material_clean"],
  ["Catatan", "Histori migrasi adalah referensi. Jangan mengubah stok aktif sebelum review cutover Admin + TL."],
];
readme.getRange("A3:A11").format = { fill: "#E0F2FE", font: { bold: true, color: "#0F172A" } };
readme.getRange("B3:B11").format = { wrapText: true };
readme.getRange("A13:H13").merge();
readme.getRange("A13").values = [["Aturan praktis"]];
readme.getRange("A13").format = { fill: "#F59E0B", font: { bold: true, color: "#111827" } };
readme.getRange("A14:B20").values = [
  ["1", "Import `tug15_history_import` hanya setelah Anda setuju baris warning yang masih ada."],
  ["2", "`HOLD_NON_SAP` jangan masuk Master Katalog aktif; isi keputusan Admin/TL lebih dulu."],
  ["3", "Katalog `KAT-<no_katalog>` adalah usulan teknis mengikuti pola WARNOTO, bukan bukti sudah ada di Master Katalog live."],
  ["4", "Kolom `lokasi_id` sengaja kosong karena mapping lokasi AppSheet ke master lokasi WARNOTO perlu keputusan manual."],
  ["5", "TUG5 dipertahankan sebagai data permintaan, bukan mutasi MASUK/KELUAR untuk `tug15_history`."],
  ["6", "Data multi-UPT tetap dipertahankan di kolom `source_upt`/`upt` agar tidak tercampur saat import bertahap."],
  ["7", "Gunakan `sync_key` untuk mencegah import ganda saat masuk Supabase."],
];
readme.getRange("A14:A20").format = { font: { bold: true }, fill: "#FEF3C7" };
readme.getRange("B14:H20").merge(true);
readme.getRange("B14:B20").format = { wrapText: true };
readme.getRange("A1:H20").format.borders = { preset: "outside", style: "thin", color: "#CBD5E1" };
readme.getRange("A:H").format.autofitColumns();
readme.getRange("B:B").format.columnWidth = 82;

addTableSheet(workbook, "Ringkasan", filteredRaw.summary, {
  preferred: ["metric", "value", "note"],
  headerFill: "#1D4ED8",
});

addTableSheet(workbook, "tug15_history_import", filteredRaw.tug15_history_import, {
  preferred: [
    "katalog_id", "tanggal", "jenis_transaksi", "qty", "lokasi_id", "lokasi_kode",
    "doc_type", "no_bon", "catatan", "sync_key", "source_upt", "source_sheet",
    "source_row_excel", "no_katalog", "nama_material", "satuan", "match_method",
    "confidence", "warning",
  ],
  headerFill: "#047857",
});

addTableSheet(workbook, "transaksi_all_clean", filteredRaw.transaksi_all_clean, {
  preferred: [
    "source_sheet", "source_row_excel", "doc_type", "movement", "jenis_transaksi",
    "doc_id", "item_id", "tanggal", "upt", "unit_lawan", "lokasi_kode",
    "katalog_id", "no_katalog", "nama_material", "satuan", "qty",
    "jenis_barang_source", "match_method", "confidence", "sap_status",
    "catatan", "link_foto", "import_ready", "issue_flags", "sync_key",
  ],
  headerFill: "#7C3AED",
});

addTableSheet(workbook, "mapping_material_review", filteredRaw.mapping_material_review, {
  preferred: [
    "upt", "no_katalog", "katalog_id_usulan", "nama_material_usulan",
    "satuan_usulan", "sap_status", "total_baris_transaksi", "total_qty_masuk",
    "total_qty_keluar", "dokumen_terkait", "match_methods", "status_review",
    "warning", "keputusan_admin", "keputusan_tl", "catatan_review",
  ],
  headerFill: "#B45309",
});

addTableSheet(workbook, "anomali_data", filteredRaw.anomali_data, {
  preferred: [
    "source_sheet", "source_row_excel", "doc_type", "doc_id", "item_id", "tanggal",
    "upt", "no_katalog", "nama_material", "satuan", "qty", "match_method",
    "confidence", "issue_flags",
  ],
  headerFill: "#BE123C",
});

addTableSheet(workbook, "master_material_clean", filteredRaw.master_material_clean, {
  preferred: [
    "id_material", "upt", "katalog_raw", "no_katalog", "nama_material",
    "nama_material_norm", "satuan", "valuasi", "status", "jumlah_sap",
    "jumlah_awal", "material_masuk", "material_keluar", "jumlah_stok",
  ],
  headerFill: "#334155",
});

await fs.mkdir(path.dirname(outputXlsx), { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const previewRanges = {
  README: "A1:H20",
  Ringkasan: "A1:C28",
  tug15_history_import: "A1:S35",
  mapping_material_review: "A1:P35",
  anomali_data: "A1:N35",
  transaksi_all_clean: "A1:Y35",
  master_material_clean: "A1:N35",
};

for (const [sheetName, range] of Object.entries(previewRanges)) {
  const blob = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await blob.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputXlsx);
console.log(JSON.stringify({ outputXlsx, previewDir }, null, 2));
