// Role & user-scope primitives — dipindah dari App.jsx (refactor Fase 3d).
import { UPT } from "../constants.js";

// Hirarki resmi (keputusan user 2026-08-02):
//   UPT   (lihat 1 UPT sendiri) : ADMIN, TL, ASMAN, MANAGER, MGR_ULTG, ADMIN_ULTG
//   UIT   (lihat semua UPT)     : ADMIN_UIT, ASMAN_LOG_UIT, MGR_LOGISTIK_UIT
//   Pusat (lihat semua UPT+UIT) : ADMIN_LOG_PUSAT
// MANAGER terikat SATU UPT dan BUKAN Pusat.
export const ROLES = { ADMIN: "Admin Gudang", TL: "TL Logistik", ASMAN: "Asman Konstruksi", MANAGER: "Manager", ADMIN_UIT: "Admin UIT", ASMAN_LOG_UIT: "Asman Logistik UIT", MGR_LOGISTIK_UIT: "Manager Logistik UIT", ADMIN_LOG_PUSAT: "Admin Logistik Pusat", PENGADAAN: "Tim Pengadaan", VIEWER: "Viewer", ADMIN_ULTG: "Admin ULTG", MGR_ULTG: "Manager ULTG", SUPERADMIN: "Super Admin" };

export const CAN_CREATE = ["ADMIN", "TL"];

// Jenjang akun untuk tampilan (Kelola Akun) — turunan langsung dari hirarki di atas.
export function roleTier(role) {
  if (role === "ADMIN_LOG_PUSAT") return "PUSAT";
  if (role === "ADMIN_UIT" || role === "ASMAN_LOG_UIT" || role === "MGR_LOGISTIK_UIT") return "UIT";
  if (role === "SUPERADMIN") return "GLOBAL";
  return "UPT";
}

// SUPERADMIN bypass semua gate role-specific (akses & approval lintas UPT/UIT/ULTG) —
// dipakai lewat hasRole() di seluruh App.jsx, bukan dicek manual satu-satu.
export function hasRole(currentUser, ...allowedRoles) {
  return currentUser?.role === "SUPERADMIN" || allowedRoles.includes(currentUser?.role);
}

// Batasan akses per gudang (RBAC tingkat 2). Sumbernya profiles.gudang_ids (jsonb):
// null / undefined / array kosong = boleh SEMUA gudang (perilaku default semua akun
// existing, tidak berubah). Array of string = hanya gudang ber-id itu yang boleh.
export function allowedGudangIds(user) {
  const g = user?.gudangIds;
  if (!Array.isArray(g) || g.length === 0) return null; // null = tak dibatasi (semua boleh)
  return g;
}

export function canAccessGudang(user, gudangId) {
  const allowed = allowedGudangIds(user);
  if (!allowed) return true;            // tidak dibatasi
  if (!gudangId) return true;           // entitas tanpa gudang (belum di-assign) tidak diblok
  return allowed.includes(gudangId);
}

export function getUserUptScope(user) {
  // currentUser.upt/uptName/uptKode/uptId nyaris selalu kosong untuk akun biasa (belum di-assign
  // per-user) — fallback ke const UPT global (deployment ini = 1 UPT), pola sama seperti `myUpt`
  // di HeavyEquipmentTabV2 dan AI Agent, supaya scoping tidak diam-diam lolos jadi "boleh semua".
  const appUptShort = (typeof UPT !== "undefined" ? UPT : "").replace(/^UPT\s+/i, "").trim();
  return user?.upt || user?.uptName || user?.uptKode || user?.uptId || appUptShort || "";
}
