"""
WARNOTO — Job training forecast pemakaian material (jalan tiap malam via GitHub Actions).

Alur:
  1. Ambil semua histori mutasi stok (tug15_history) dari Supabase.
  2. Per katalog_id, susun time-series qty KELUAR harian.
  3. Latih model Prophet (kalau histori cukup, minimal MIN_DATA_POINTS baris).
  4. Prediksi qty pemakaian 30 hari ke depan, tulis/timpa ke tabel forecast_predictions.

Catatan: estimasi_hari_sampai_habis BELUM dihitung di sini karena skema saat ini
belum menyimpan qty stok terkini di Supabase (baru histori mutasi). Begitu ada
tabel/snapshot qty terkini, tinggal tambahkan: hari_habis = qty_saat_ini / rata2_qty_prediksi_harian.
"""
import os
import sys
from datetime import datetime, timedelta

import pandas as pd
from prophet import Prophet
from supabase import create_client

MIN_DATA_POINTS = 10   # minimal baris histori per katalog sebelum dianggap cukup buat training
FORECAST_DAYS = 30
MODEL_VERSION = "prophet-v1"


def get_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]  # service_role / secret key — HANYA dari GitHub Secrets
    return create_client(url, key)


def fetch_history(sb):
    res = sb.table("tug15_history").select("katalog_id, tanggal, jenis_transaksi, qty").eq("jenis_transaksi", "KELUAR").execute()
    return pd.DataFrame(res.data)


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
    if history.empty:
        print("Tidak ada data tug15_history sama sekali. Berhenti.")
        return

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
        for _, row in forecast.iterrows():
            rows_to_upsert.append({
                "katalog_id": kid,
                "tanggal_prediksi": row["ds"].strftime("%Y-%m-%d"),
                "qty_prediksi": max(0, round(float(row["yhat"]), 2)),
                "estimasi_hari_sampai_habis": None,  # lihat catatan di docstring atas
                "model_version": MODEL_VERSION,
                "updated_at": datetime.utcnow().isoformat(),
            })
        print(f"  ✓ {kid}: {len(df_k)} baris histori → {FORECAST_DAYS} hari prediksi")

    if not rows_to_upsert:
        print("Tidak ada katalog dengan histori cukup (>= %d baris). Tidak ada yang disimpan." % MIN_DATA_POINTS)
        return

    sb.table("forecast_predictions").upsert(rows_to_upsert, on_conflict="katalog_id,tanggal_prediksi").execute()
    print(f"Selesai. {len(rows_to_upsert)} baris prediksi tersimpan ke forecast_predictions.")


if __name__ == "__main__":
    main()
