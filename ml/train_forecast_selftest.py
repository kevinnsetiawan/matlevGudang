"""Self-test normalize_katalog_code (tanpa Supabase/Prophet). Run: python ml/train_forecast_selftest.py"""
from lib.normalize_katalog_code import normalize_katalog_code

assert normalize_katalog_code("1001060031") == "1060031", "10 digit berawalan 100 harus dibuang 3 digit pertama"
assert normalize_katalog_code("1060031") == "1060031", "kode pendek yang sudah sesuai tidak boleh berubah"
assert normalize_katalog_code("MTRL-0267") == "0267", "karakter non-digit harus dibuang, sisakan digitnya"
assert normalize_katalog_code("0093") == "0093", "kode pendek numerik tidak boleh terpotong jadi kosong"

print("OK: semua self-test normalize_katalog_code lulus.")
