import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edge = readFileSync(new URL("../../supabase/functions/maturity-drive/index.ts", import.meta.url), "utf8");
const delta = readFileSync(new URL("../../supabase/migrations/20260802_maturity_drive_security_delta.sql", import.meta.url), "utf8");

test("maturity Drive derives scope canonically and assigns only recorded unassigned files", () => {
  assert.match(edge, /resolveAuditContext\(body, ctx/);
  assert.match(edge, /findUptById\(existing\.upt_id\)/);
  assert.ok(edge.includes("profile.uit_id !== upt.uitId"));
  assert.ok(edge.includes("const unassignedId = text(body.unassignedId)"));
  assert.ok(!edge.includes("const driveFileId = text(body.driveFileId)"));
  assert.ok(edge.includes('.eq("id", unassignedId).eq("audit_id", auditId).eq("upt_id", context.upt.id)'));
  assert.ok(edge.includes('eq("drive_file_id", unassigned.drive_file_id)'));
  assert.match(edge, /assignment_state: "ASSIGNING"/);
  assert.match(edge, /assignment_state: "NEEDS_REPAIR"/);
  assert.match(edge, /includeRoot: ctx\.profile\.role === "SUPERADMIN"/);
  assert.match(edge, /row\.source_folder_id === DRIVE_ROOT_ID && !includeRoot/);
  assert.match(edge, /function assertMutableAudit/);
  assert.match(edge, /audit\?\.status === "FINAL"/);
  assert.match(edge, /reconcileAssignments/);
});

test("maturity Drive security delta makes audit stub and ownership canonical", () => {
  assert.match(delta, /add column if not exists upt_id/);
  assert.match(delta, /add column if not exists created_by/);
  assert.match(delta, /idx_maturity_audits_upt_id_period_key/);
  assert.match(delta, /create_maturity_drive_stub/);
  assert.match(delta, /security definer/);
  assert.match(delta, /maturity_audit_drive_unassigned/);
  assert.match(delta, /ASSIGNING', 'ACTIVE', 'NEEDS_REPAIR/);
});
