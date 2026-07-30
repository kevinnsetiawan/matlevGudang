"""
WARNOTO — Job training forecast pemakaian material (jalan tiap malam via GitHub Actions).

Alur:
  1. Ambil semua histori mutasi stok (tug15_history) dari Supabase.
  2. Per katalog_id, susun time-series qty KELUAR harian.
  3. Latih model Prophet (kalau histori cukup, minimal MIN_DATA_POINTS baris).
  4. Prediksi qty pemakaian 30 hari ke depan, tulis/timpa ke tabel forecast_predictions.
  5. Ambil qty stok terkini dari stock_current, hitung estimasi_hari_sampai_habis
     = qty_saat_ini / rata2_qty_prediksi_harian (hanya diisi di baris prediksi pertama).
"""
import os
import sys
from datetime import datetime, timedelta

import pandas as pd
from prophet import Prophet
from supabase import create_client

from lib.normalize_katalog_code import normalize_katalog_code

MIN_DATA_POINTS = 5   # diturunkan sementara dari 10: histori transaksi live masih sedikit,
                       # dinaikkan lagi setelah data tug15_history terkumpul lebih banyak
FORECAST_DAYS = 30
MODEL_VERSION = "prophet-v1"


def get_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]  # service_role / secret key — HANYA dari GitHub Secrets
    return create_client(url, key)


def fetch_history(sb):
    res = sb.table("tug15_history").select("katalog_id, tanggal, jenis_transaksi, qty").eq("jenis_transaksi", "KELUAR").execute()
    return pd.DataFrame(res.data)


def fetch_stock_current(sb):
    res = sb.table("stock_current").select("katalog_id, qty").execute()
    return {row["katalog_id"]: row["qty"] for row in res.data}


def fetch_legacy_history(sb):
    """Histori KELUAR arsip AppSheet lama (UPT Surabaya), dipetakan ke katalog_id sekarang
    lewat normalize_katalog_code. Baris yang kodenya tidak match katalog manapun di-skip."""
    legacy_res = (
        sb.table("legacy_history_archive")
        .select("no_katalog, tanggal, qty")
        .eq("jenis_transaksi", "KELUAR")
        .ilike("source_upt", "%Surabaya%")
        .execute()
    )
    legacy_df = pd.DataFrame(legacy_res.data)

    katalog_res = sb.table("katalog").select("id, data").execute()
    code_to_id = {
        normalize_katalog_code(row["data"].get("katalog")): row["id"]
        for row in katalog_res.data
        if row.get("data", {}).get("katalog")
    }

    rows = []
    total = len(legacy_df)
    for _, row in legacy_df.iterrows():
        kid = code_to_id.get(normalize_katalog_code(row["no_katalog"]))
        if kid is None:
            continue
        rows.append({"katalog_id": kid, "tanggal": row["tanggal"], "qty": row["qty"]})

    matched = len(rows)
    print(f"Legacy history: {matched} baris cocok katalog (dari {total} baris KELUAR UPT Surabaya), {total - matched} diabaikan (kode tidak match).")
    return pd.DataFrame(rows, columns=["katalog_id", "tanggal", "qty"])


def train_one_katalog(df_katalog):
    """df_katalog: kolom ['tanggal','qty'] -> kembalikan dataframe Prophet [ds,yhat] 30 hari ke depan."""
    daily = df_katalog.groupby("tanggal")["qty"].sum().reset_index()
    daily.columns = ["ds", "y"]
    daily["ds"] = pd.to_datetime(daily["ds"])

    full_range = pd.date_range(daily["ds"].min(), daily["ds"].max(), freq="D")
    daily = daily.set_index("ds").reindex(full_range, fill_value=0).rename_axis("ds").reset_index()

    model = Prophet(daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=True)
    model.fit(daily)

    future = model.make_future_dataframe(periods=FORECAST_DAYS)
    forecast = model.predict(future)
    return forecast[forecast["ds"] > daily["ds"].max()][["ds", "yhat"]]


def main():
    sb = get_client()
    history = fetch_history(sb)
    legacy = fetch_legacy_history(sb)
    history = pd.concat([history, legacy], ignore_index=True)
    if history.empty:
        print("Tidak ada data tug15_history sama sekali. Berhenti.")
        return

    stock_qty = fetch_stock_current(sb)

    katalog_ids = history["katalog_id"].dropna().unique()
    print(f"Ditemukan {len(katalog_ids)} katalog dengan histori KELUAR.")

    rows_to_upsert = []
    for kid in katalog_ids:
        df_k = history[history["katalog_id"] == kid]
        if len(df_k) < MIN_DATA_POINTS:
            continue
        try:
            forecast = train_one_katalog(df_k)
        except Exception as e:
            print(f"  ⚠️ Gagal latih {kid}: {e}")
            continue

        avg_qty_harian = forecast["yhat"].clip(lower=0).mean()
        qty_saat_ini = stock_qty.get(kid)
        estimasi_hari = round(qty_saat_ini / avg_qty_harian) if qty_saat_ini is not None and avg_qty_harian > 0 else None

        for _, row in forecast.iterrows():
            rows_to_upsert.append({
                "katalog_id": kid,
                "tanggal_prediksi": row["ds"].strftime("%Y-%m-%d"),
                "qty_prediksi": max(0, round(float(row["yhat"]), 2)),
                "estimasi_hari_sampai_habis": estimasi_hari,
                "model_version": MODEL_VERSION,
                "updated_at": datetime.utcnow().isoformat(),
            })
        print(f"  ✓ {kid}: {len(df_k)} baris histori → {FORECAST_DAYS} hari prediksi (estimasi habis: {estimasi_hari})")

    if not rows_to_upsert:
        print("Tidak ada katalog dengan histori cukup (>= %d baris). Tidak ada yang disimpan." % MIN_DATA_POINTS)
        return

    sb.table("forecast_predictions").upsert(rows_to_upsert, on_conflict="katalog_id,tanggal_prediksi").execute()
    print(f"Selesai. {len(rows_to_upsert)} baris prediksi tersimpan ke forecast_predictions.")


if __name__ == "__main__":
    main()
