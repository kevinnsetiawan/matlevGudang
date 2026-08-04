import test from "node:test";
import assert from "node:assert/strict";
import { getUserUptScope } from "../../src/lib/roles.js";

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
