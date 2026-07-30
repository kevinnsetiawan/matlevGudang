// Self-test murni logic (tanpa Cohere/Supabase sungguhan) untuk splitChunksForEmbed dipakai nightly_sync.mjs.
// Jalankan: node scripts/nightly_sync.selftest.mjs
import assert from "node:assert";
import { splitChunksForEmbed } from "../src/lib/ragShared.mjs";

const allChunks = [
  { id: "katalog_1", content: "sama persis" },      // unchanged -> skip
  { id: "katalog_2", content: "konten baru berubah" }, // beda -> embed
  { id: "faq_3", content: "chunk baru" },            // belum ada di DB -> embed
];
const existingContentById = new Map([
  ["katalog_1", "sama persis"],
  ["katalog_2", "konten lama"],
  // faq_3 sengaja tidak ada
]);

const toEmbed = splitChunksForEmbed(allChunks, existingContentById);

assert.strictEqual(toEmbed.length, 2, "harus cuma 2 chunk yang perlu diembed");
assert.deepStrictEqual(toEmbed.map((c) => c.id).sort(), ["faq_3", "katalog_2"], "yang identik (katalog_1) harus di-skip");

console.log("OK: splitChunksForEmbed lulus self-test");
