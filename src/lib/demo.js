// Mode demo per-tab (sessionStorage): semua penyimpanan keluar dibekukan,
// data hanya hidup di memori tab ini. Tab/device lain tetap live.
export function isDemoMode() {
  try { return sessionStorage.getItem("warnoto_demo") === "1"; } catch { return false; }
}
export function enterDemoMode() {
  try { sessionStorage.setItem("warnoto_demo", "1"); } catch {}
  window.location.reload();
}
export function exitDemoMode() {
  try { sessionStorage.removeItem("warnoto_demo"); } catch {}
  window.location.reload();
}
