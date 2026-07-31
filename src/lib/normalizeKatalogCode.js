// Normalisasi kode katalog gaya lama (AppSheet) -> kode katalog WARNOTO sekarang.
// Port JS dari ml/lib/normalize_katalog_code.py — logic HARUS identik, jangan menyimpang.
export function normalizeKatalogCode(raw) {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 10 && digits.startsWith("100")) return digits.slice(3);
  return digits;
}
