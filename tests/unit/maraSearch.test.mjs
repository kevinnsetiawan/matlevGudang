import test from "node:test";
import assert from "node:assert/strict";
import { maraQueryGroups } from "../../src/lib/sap.js";

test("per-kata: satu grup per kata, AND antar kata (dict-agnostic)", () => {
  const groups = maraQueryGroups("kabel tembaga");
  assert.equal(groups.length, 2);
  assert.ok(groups[0].includes("kabel"));
  assert.ok(groups[1].includes("tembaga"));
});

test("normalisasi: spasi berlebih + kapital tidak menambah/mengurangi grup", () => {
  const groups = maraQueryGroups("KABEL   Tembaga");
  assert.equal(groups.length, 2);
  assert.ok(groups[0].includes("kabel"));
  assert.ok(groups[1].includes("tembaga"));
});

test("tiap grup non-kosong dan memuat kata aslinya", () => {
  const groups = maraQueryGroups("pemutus tegangan");
  groups.forEach((alts, i) => {
    assert.ok(Array.isArray(alts) && alts.length > 0);
  });
  const words = "pemutus tegangan".split(" ");
  groups.forEach((alts, i) => assert.ok(alts.includes(words[i])));
});
