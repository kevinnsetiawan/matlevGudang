import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../supabase/migrations/20260806_multi_upt_rls_gelombang4b.sql", import.meta.url), "utf8");
const verifier = await readFile(new URL("../../supabase/verify_gelombang4b.sql", import.meta.url), "utf8");

test("4b migration idempoten dan tidak diam-diam melanjutkan orphan", () => {
  assert.match(migration, /begin;[\s\S]*commit;/i);
  assert.match(migration, /membutuhkan public\.can_access_upt\(text\)/);
  assert.match(migration, /add column if not exists upt_id/i);
  assert.match(migration, /data->>'dibuatOleh'/);
  assert.match(migration, /data->>'uploadedBy'/);
  assert.match(migration, /alter column upt_id set not null/i);
  assert.match(migration, /unresolved\/orphan/);
  assert.match(migration, /foreign key \(upt_id\) references public\.upt\(id\)/i);
});

test("4b policy memakai can_access_upt dan menutup policy authenticated lama", () => {
  assert.match(migration, /drop policy if exists "Authenticated read stock_opname"/);
  assert.match(migration, /create policy "Scoped read stock_opname"[\s\S]*can_access_upt\(upt_id\)/);
  assert.match(migration, /create policy "Scoped write stock_opname"[\s\S]*with check \(public\.can_access_upt\(upt_id\)\)/);
  assert.match(migration, /create policy "Scoped read stock_count"[\s\S]*can_access_upt\(upt_id\)/);
  assert.match(migration, /create policy "Scoped read profiles"[\s\S]*can_read_profile/);
});

test("verifier read-only memeriksa orphan, policy anon, index, dan FK", () => {
  ["null_upt", "orphan_upt", "pg_policies", "idx_stock_opname_upt_id", "idx_stock_count_upt_id", "stock_opname_upt_id_fkey", "stock_count_upt_id_fkey"].forEach(token => assert.match(verifier, new RegExp(token)));
  assert.match(verifier, /'anon' = any\(roles\)/);
  assert.doesNotMatch(verifier, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i);
});
