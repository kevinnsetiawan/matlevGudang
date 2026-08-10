import test from "node:test";
import assert from "node:assert/strict";
import { getUserUptScope, getScopeUptIds, inScopeUpt } from "../../src/lib/roles.js";

test("user with explicit upt is used as-is", () => {
  assert.equal(getUserUptScope({ upt: "UPT Malang" }, [{ id: "UPT-A", nama: "UPT Surabaya" }, { id: "UPT-B", nama: "UPT Malang" }]), "UPT Malang");
});

// Nilai dari uptList dipangkas prefix "UPT " supaya cocok dengan data existing
// (attb_list.upt / heavy_equipment.upt menyimpan bentuk terpangkas — lihat roles.js).
test("user with uptId resolves to its name via uptList, prefix UPT dipangkas", () => {
  assert.equal(getUserUptScope({ uptId: "UPT-B" }, [{ id: "UPT-A", nama: "UPT Surabaya" }, { id: "UPT-B", nama: "UPT Malang" }]), "Malang");
});

test("user without upt info falls back to the single UPT in uptList (legacy 1-UPT behavior)", () => {
  assert.equal(getUserUptScope({}, [{ id: "UPT-A", nama: "UPT Surabaya" }]), "Surabaya");
});

test("user without upt info + multiple UPTs in list returns empty (anti-leak guard)", () => {
  assert.equal(getUserUptScope({}, [{ id: "UPT-A", nama: "UPT Surabaya" }, { id: "UPT-B", nama: "UPT Malang" }]), "");
});

test("empty or missing uptList returns empty", () => {
  assert.equal(getUserUptScope({}, []), "");
  assert.equal(getUserUptScope({}, undefined), "");
});

// ── getScopeUptIds: 3-tier (UPT / UIT / nasional) ───────────────────────────
const UPTS = [
  { id: "UPT-SBY", nama: "UPT Surabaya", uitId: "UIT-JBM" },
  { id: "UPT-GRE", nama: "UPT Gresik", uitId: "UIT-JBM" },
  { id: "UPT-BDG", nama: "UPT Bandung", uitId: "UIT-JBB" },
];

test("UPT role → hanya UPT sendiri", () => {
  assert.deepEqual(getScopeUptIds({ role: "ADMIN", uptId: "UPT-GRE" }, UPTS), ["UPT-GRE"]);
});

test("UIT role → semua UPT di UIT-nya (lintas UPT, bukan nasional)", () => {
  assert.deepEqual(getScopeUptIds({ role: "MGR_LOGISTIK_UIT", uitId: "UIT-JBM" }, UPTS), ["UPT-SBY", "UPT-GRE"]);
});

test("Pusat & SUPERADMIN → null (nasional, semua lolos)", () => {
  assert.equal(getScopeUptIds({ role: "ADMIN_LOG_PUSAT" }, UPTS), null);
  assert.equal(getScopeUptIds({ role: "SUPERADMIN" }, UPTS), null);
});

test("inScopeUpt: null=nasional selalu true; uptId kosong tidak diblok; array cek keanggotaan", () => {
  assert.equal(inScopeUpt("UPT-BDG", null), true);
  assert.equal(inScopeUpt("", ["UPT-SBY"]), true);
  assert.equal(inScopeUpt("UPT-GRE", ["UPT-SBY", "UPT-GRE"]), true);
  assert.equal(inScopeUpt("UPT-BDG", ["UPT-SBY", "UPT-GRE"]), false);
});
