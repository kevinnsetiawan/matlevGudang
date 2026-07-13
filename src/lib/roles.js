// Role & user-scope primitives — dipindah dari App.jsx (refactor Fase 3d).
import { UPT } from "../constants.js";

export const ROLES = { ADMIN: "Admin Gudang", TL: "TL Logistik", ASMAN: "Asman Konstruksi", MANAGER: "Manager", ADMIN_UIT: "Admin UIT", MGR_LOGISTIK_UIT: "Manager Logistik UIT", PENGADAAN: "Tim Pengadaan", VIEWER: "Viewer", ADMIN_ULTG: "Admin ULTG", MGR_ULTG: "Manager ULTG", SUPERADMIN: "Super Admin" };

export const CAN_CREATE = ["ADMIN", "TL"];

// SUPERADMIN bypass semua gate role-specific (akses & approval lintas UPT/UIT/ULTG) —
// dipakai lewat hasRole() di seluruh App.jsx, bukan dicek manual satu-satu.
export function hasRole(currentUser, ...allowedRoles) {
  return currentUser?.role === "SUPERADMIN" || allowedRoles.includes(currentUser?.role);
}

export function getUserUptScope(user) {
  // currentUser.upt/uptName/uptKode/uptId nyaris selalu kosong untuk akun biasa (belum di-assign
  // per-user) — fallback ke const UPT global (deployment ini = 1 UPT), pola sama seperti `myUpt`
  // di HeavyEquipmentTabV2 dan AI Agent, supaya scoping tidak diam-diam lolos jadi "boleh semua".
  const appUptShort = (typeof UPT !== "undefined" ? UPT : "").replace(/^UPT\s+/i, "").trim();
  return user?.upt || user?.uptName || user?.uptKode || user?.uptId || appUptShort || "";
}
