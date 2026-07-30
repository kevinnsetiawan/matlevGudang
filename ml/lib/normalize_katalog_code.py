"""Normalisasi kode katalog gaya lama (AppSheet) -> kode katalog WARNOTO sekarang.

Dipisah dari train_forecast.py supaya bisa diimpor+ditest tanpa menarik
dependency berat (prophet, supabase) yang butuh env var/koneksi network.
"""
import re


def normalize_katalog_code(raw):
    """Ambil digit saja; kalau 10 digit & diawali '100', buang 3 digit pertama."""
    digits = re.sub(r"[^0-9]", "", str(raw))
    if len(digits) == 10 and digits.startswith("100"):
        return digits[3:]
    return digits
