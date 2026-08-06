import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deriveStockUptId, stockScopeExtraCols, mapStockScopeRow, resetStockScopeSchemaProbe, stockScopeColumnsAvailable } from "../../src/lib/stockScope.js";

const appSource = await readFile(new URL("../../App.jsx", import.meta.url), "utf8");

test("derive UPT dari profil pembuat/upload, fallback hanya untuk user aktif", () => {
  const profiles = [{ id: "u-1", upt_id: "UPT-SBY" }, { id: "u-2", uptId: "UPT-MLG" }];
  assert.equal(deriveStockUptId({ dibuatOleh: "u-1" }, { profiles }), "UPT-SBY");
  assert.equal(deriveStockUptId({ uploadedBy: "u-2" }, { profiles }), "UPT-MLG");
  assert.equal(deriveStockUptId({ dibuatOleh: "u-x" }, { profiles, currentUser: { id: "u-1", uptId: "UPT-SBY" } }), null);
  assert.equal(deriveStockUptId({ dibuatOleh: "u-1" }, { profiles, currentUser: { id: "u-1", uptId: "UPT-SBY" } }), "UPT-SBY");
});

test("payload legacy tidak mengirim upt_id sebelum schema live", () => {
  assert.deepEqual(stockScopeExtraCols({ dibuatOleh: "u-1" }, { profiles: [{ id: "u-1", uptId: "UPT-SBY" }] }, false), {});
  assert.deepEqual(stockScopeExtraCols({ dibuatOleh: "u-1" }, { profiles: [{ id: "u-1", uptId: "UPT-SBY" }] }, true), { upt_id: "UPT-SBY" });
});

test("typed upt_id mengalahkan JSONB lama saat load", () => {
  assert.equal(mapStockScopeRow({ id: "op-1", upt_id: "UPT-MLG", data: { dibuatOleh: "u-1", uptId: "UPT-SBY" } }).uptId, "UPT-MLG");
  assert.equal(mapStockScopeRow({ id: "op-1", data: { dibuatOleh: "u-1" } }).uptId, undefined);
});

test("schema probe hanya mengaktifkan typed payload jika kedua kolom ada", async () => {
  resetStockScopeSchemaProbe();
  const calls = [];
  const client = { from(table) { calls.push(table); return { select() { return { limit: async () => ({ error: table === "stock_count" ? new Error("missing") : null }) }; } }; } };
  assert.equal(await stockScopeColumnsAvailable(client), false);
  assert.deepEqual(calls, ["stock_opname", "stock_count"]);
});

test("profil login tetap self-read berdasarkan auth.uid", () => {
  assert.match(appSource, /from\("profiles"\)\.select\("\*"\)\.eq\("id", session\.user\.id\)/);
});
