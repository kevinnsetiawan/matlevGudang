import argparse
import json
import math
import re
import shutil
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import pandas as pd


ASSET_KEYWORDS = ("foto", "image", "gambar", "pdf", "print", "link")
MASTER_SHEETS = {
    "userWarnoto",
    "mainMenu",
    "menuTUG",
    "menuMaterial",
    "hakAksesWarnoto",
    "jenisMaterial",
    "listMaterial",
    "namaSatpam",
    "jabatanUPT",
    "alatAngkut",
    "kapasitasGudang",
    "materialATTB",
    "lokasiUPTGudang",
    "timMutu",
}


def cell(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if pd.isna(value):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def clean(value):
    return re.sub(r"\s+", " ", cell(value)).strip()


def is_asset_col(col):
    c = str(col).lower()
    return any(k in c for k in ASSET_KEYWORDS)


def classify_ref(value):
    v = clean(value)
    if not v:
        return "EMPTY"
    if re.match(r"^https?://", v, re.I):
        if "drive.google.com" in v.lower():
            return "GOOGLE_DRIVE_URL"
        return "WEB_URL"
    if v.startswith("/appsheet/"):
        return "APPSHEET_ABSOLUTE_PATH"
    if re.search(r"\.(jpg|jpeg|png|webp|pdf)$", v, re.I):
        return "RELATIVE_FILE_PATH"
    if re.search(r"^[A-Za-z0-9_-]{6,}$", v) and "pdf" in v.lower():
        return "POSSIBLE_PDF_ID"
    return "TEXT_OR_ID"


def infer_context(row, sheet):
    columns = {str(k): v for k, v in row.items()}
    possible_ids = [
        "idMaterial", "TUG10_ID", "TUG34_ID", "TUG9_ID", "TUG8_ID", "TUG5_ID",
        "id_10", "id_34", "id_9", "id_8", "id_5", "idMutasi", "idMATTB",
        "idLokasi", "idTimMutu", "idKapasitas", "id_inspeksi", "id_item",
    ]
    possible_upt = ["UPT", "Milik UPT", "UPT Asal", "Nama UPT", "GUDANG"]
    possible_material = ["Nama Material", "Nama Material Teks", "Material Description"]
    possible_catalog = ["Katalog", "Kode Katalog", "Nomor Katalog Material"]
    return {
        "record_id": next((clean(columns.get(c)) for c in possible_ids if clean(columns.get(c))), ""),
        "upt": next((clean(columns.get(c)) for c in possible_upt if clean(columns.get(c))), ""),
        "nama_material": next((clean(columns.get(c)) for c in possible_material if clean(columns.get(c))), ""),
        "katalog": next((clean(columns.get(c)) for c in possible_catalog if clean(columns.get(c))), ""),
        "doc_or_sheet": sheet,
    }


def build_file_index(search_roots):
    index = defaultdict(list)
    for root in search_roots:
        if not root.exists():
            continue
        for file in root.rglob("*"):
            if file.is_file():
                index[file.name.lower()].append(file)
    return index


def find_local_file(ref, source_dir, search_roots, file_index):
    v = clean(ref).replace("/", "\\")
    if not v or re.match(r"^https?://", v, re.I):
        return ""
    if v.startswith("\\appsheet\\"):
        marker = "\\Files\\"
        if marker in v:
            v = "Files\\" + v.split(marker, 1)[1]
        else:
            return ""
    candidates = [source_dir / v]
    basename = Path(v).name
    for root in search_roots:
        candidates.append(root / v)
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    if basename:
        matches = file_index.get(basename.lower(), [])
        if matches:
            return str(matches[0])
    return ""


def safe_name(text, max_len=90):
    text = re.sub(r"[^A-Za-z0-9._ -]+", "_", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len] or "file"


def copy_found_asset(src, backup_root, sheet, row_num, col):
    src_path = Path(src)
    dest_dir = backup_root / "assets_found" / safe_name(sheet)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"row{row_num}_{safe_name(col, 35)}_{safe_name(src_path.name, 60)}"
    if not dest.exists():
        shutil.copy2(src_path, dest)
    return str(dest)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", required=True)
    parser.add_argument("--search-root", action="append", default=[])
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    workbook = Path(args.workbook)
    source_dir = workbook.parent
    search_roots = [Path(p) for p in args.search_root] or [source_dir]
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    file_index = build_file_index([source_dir, *search_roots])

    xl = pd.ExcelFile(workbook)
    assets = []
    master_exports = {}
    sheet_summary = []
    found_count = 0

    master_dir = out_dir / "master_data_json"
    master_dir.mkdir(parents=True, exist_ok=True)

    for sheet in xl.sheet_names:
        df = pd.read_excel(workbook, sheet_name=sheet, dtype=object)
        df = df.rename(columns=lambda c: str(c).strip())
        asset_cols = [c for c in df.columns if is_asset_col(c)]
        sheet_summary.append({
            "sheet": sheet,
            "rows": len(df),
            "columns": len(df.columns),
            "asset_columns": ", ".join(asset_cols),
            "is_master_data": "YA" if sheet in MASTER_SHEETS else "TIDAK",
        })
        if sheet in MASTER_SHEETS:
            rows = []
            for _, row in df.iterrows():
                rows.append({str(k): (None if cell(v) == "" else cell(v)) for k, v in row.items()})
            target = master_dir / f"{safe_name(sheet)}.json"
            target.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
            master_exports[sheet] = str(target)

        for idx, row in df.iterrows():
            ctx = infer_context(row, sheet)
            for col in asset_cols:
                value = clean(row.get(col))
                if not value:
                    continue
                ref_type = classify_ref(value)
                local = find_local_file(value, source_dir, search_roots, file_index)
                backup_path = ""
                status = "FOUND_LOCAL" if local else "NEED_SOURCE_FILE"
                if not local and ref_type in {"GOOGLE_DRIVE_URL", "WEB_URL"}:
                    status = "NEED_DOWNLOAD_OR_DRIVE_EXPORT"
                if not local and ref_type == "APPSHEET_ABSOLUTE_PATH":
                    status = "NEED_APPSHEET_DATA_FOLDER"
                if local:
                    backup_path = copy_found_asset(local, out_dir, sheet, int(idx) + 2, col)
                    found_count += 1
                assets.append({
                    "sheet": sheet,
                    "source_row_excel": int(idx) + 2,
                    "column": col,
                    **ctx,
                    "asset_ref": value,
                    "ref_type": ref_type,
                    "local_source_found": local,
                    "backup_path": backup_path,
                    "backup_status": status,
                })

    source_dir_out = out_dir / "source_files"
    source_dir_out.mkdir(parents=True, exist_ok=True)
    source_files = []
    for file in [workbook, *source_dir.glob("*.xlsx"), *source_dir.glob("backup/*.json"), *source_dir.glob("backup/*.xlsx")]:
        if file.exists() and file.is_file():
            dest = source_dir_out / safe_name(file.name)
            if not dest.exists():
                shutil.copy2(file, dest)
            source_files.append({"source_file": str(file), "backup_copy": str(dest), "bytes": file.stat().st_size})

    status_counts = Counter(a["backup_status"] for a in assets)
    ref_counts = Counter(a["ref_type"] for a in assets)
    sheet_asset_counts = Counter(a["sheet"] for a in assets)
    summary = [
        {"metric": "Workbook sumber", "value": str(workbook), "note": ""},
        {"metric": "Generated at", "value": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "note": ""},
        {"metric": "Total asset references", "value": len(assets), "note": "Semua kolom foto/image/pdf/print/link yang terisi"},
        {"metric": "Local asset files found and copied", "value": found_count, "note": "File fisik ditemukan di folder lokal/search root"},
        {"metric": "Master data sheets exported", "value": len(master_exports), "note": "JSON per sheet master"},
        {"metric": "Source files copied", "value": len(source_files), "note": "Workbook, PEMAT/CAD, backup JSON/XLSX"},
    ]
    for key, val in status_counts.most_common():
        summary.append({"metric": f"Backup status {key}", "value": val, "note": ""})
    for key, val in ref_counts.most_common():
        summary.append({"metric": f"Reference type {key}", "value": val, "note": ""})
    for key, val in sheet_asset_counts.most_common():
        summary.append({"metric": f"Asset refs sheet {key}", "value": val, "note": ""})

    payload = {
        "summary": summary,
        "sheet_summary": sheet_summary,
        "asset_manifest": assets,
        "source_files": source_files,
        "master_exports": [{"sheet": k, "json_path": v} for k, v in master_exports.items()],
    }
    (out_dir / "asset_backup_manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: len(v) for k, v in payload.items() if isinstance(v, list)}, indent=2))


if __name__ == "__main__":
    main()
