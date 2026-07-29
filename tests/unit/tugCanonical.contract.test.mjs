import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260729_tug_canonical_approval.sql");
const client = read("src/lib/tugCanonical.js");
const overview = read("src/components/TugFinalReviewModal.jsx");
const app = read("App.jsx");
const docs = read("src/lib/docBuilders.js");
const tugForm = read("src/components/TugFormModals.jsx");
const approvalTab = read("src/components/ApprovalTab.jsx");
const tug5Tab = read("src/components/TUG5Tab.jsx");

test("canonical TUG migration has one atomic final decision path", () => {
  assert.match(migration, /create table if not exists public\.stock_movements/i);
  assert.match(migration, /unique \(transaction_id, tug_item_id, direction\)/i);
  assert.match(migration, /order by coalesce\(stock_id,''\), line_no/i);
  assert.match(migration, /v_stock_row public\.stocks/i);
  assert.match(migration, /from public\.stocks st where exists \(/i);
  assert.match(migration, /from public\.tug_items ti where ti\.transaction_id=t\.id and ti\.stock_id=st\.id/i);
  assert.match(migration, /\) order by st\.id for update/i);
  assert.doesNotMatch(migration, /select distinct stock_id[^;]*for update/is);
  assert.doesNotMatch(migration, /from public\.tug_items i where i\.transaction_id=t\.id/i);
  assert.doesNotMatch(migration, /i record; s public\.stocks/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /TUG_INSUFFICIENT_STOCK/i);
  assert.match(migration, /jsonb_set\(coalesce\(data,'\{\}'::jsonb\),'\{qty\}'/i);
  assert.match(migration, /status='FINAL_APPROVED'/i);
});

test("state matrix keeps stock movements final-only", () => {
  assert.match(migration, /when p_doc_type in \('TUG8','TUG9'\) then 'OUT'/i);
  assert.match(migration, /when p_doc_type in \('TUG3','TUG10'\) then 'IN'/i);
  assert.match(migration, /else 'NONE'/i);
  assert.match(migration, /TUG3'.*PENDING_TL.*PENDING_MANAGER/s);
  assert.match(migration, /TUG3'.*PENDING_MANAGER.*PENDING_ASMAN/s);
  assert.match(migration, /p_doc_type in \('TUG8','TUG9'\).*p_actor_role='TL'.*PENDING_ASMAN/s);
  assert.match(migration, /p_doc_type in \('TUG8','TUG9'\).*p_stage = 'PENDING_TL'.*PENDING_ASMAN/s);
  assert.match(migration, /explicit_submit_approval/i);
});

test("document counter is global by UPT with an explicit unit-code config", () => {
  assert.match(migration, /upt_id text primary key/i);
  assert.match(migration, /document_unit_code text not null/i);
  assert.match(migration, /values \('UPT-SBY','SBYA',225\)/i);
  assert.match(migration, /tug_global_document_counters/i);
  assert.match(migration, /last_value=greatest\(public\.tug_global_document_counters\.last_value,excluded\.last_value\)/i);
  assert.match(migration, /update public\.tug_global_document_counters set last_value=last_value\+1/i);
  assert.match(migration, /TUG_DOCUMENT_UNIT_CONFIG_REQUIRED/i);
  assert.match(migration, /function public\.tug_doc_number\(p_seq bigint, p_doc_type text, p_upt_id text/i);
  assert.match(migration, /its value is now the explicit document unit code/i);
  assert.doesNotMatch(migration, /on conflict\(doc_type,upt_id,period_year\)/i);
});

test("outgoing TUG stock is scoped to its UPT at create and final decision", () => {
  assert.match(migration, /function public\.tug_assert_outgoing_stock_scope/i);
  assert.match(migration, /join public\.lokasi loc on loc\.id=st\.lokasi_id/i);
  assert.match(migration, /join public\.gudang gd on gd\.id=loc\.gudang_id/i);
  assert.match(migration, /gd\.upt_id=p_upt_id/i);
  assert.match(migration, /TUG_LOCATION_REQUIRED/i);
  assert.match(migration, /TUG_STOCK_UPT_MISMATCH/i);
  assert.match(migration, /tug_assert_outgoing_stock_scope\(v_id,v_upt_id\)/i);
  assert.match(migration, /tug_assert_outgoing_stock_scope\(t\.id,t\.upt_id\)/i);
});

test("canonical cutover fails closed unless legacy mode is explicitly requested", () => {
  assert.match(app, /VITE_TUG_CANONICAL_REQUIRED !== "false"/);
  assert.match(app, /CANONICAL_TUG_REQUIRED && \["TUG8", "TUG9"\]\.includes\(txn\.docType\)/);
  assert.match(app, /legacy pending TUG-8\/9 cannot decrement stock/i);
});

test("server document number uses an unpadded Roman month", () => {
  assert.match(migration, /to_char\(p_at at time zone 'Asia\/Jakarta', 'FMRM\/YYYY'\)/);
  assert.doesNotMatch(migration, /to_char\(p_at at time zone 'Asia\/Jakarta', 'RM\/YYYY'\)/);
});

test("review token binds server snapshot, document hash, preview attestations, and version", () => {
  assert.match(migration, /transaction_version integer not null/i);
  assert.match(migration, /document_hash text not null/i);
  assert.match(migration, /attestations jsonb/i);
  assert.match(migration, /TUG_ATTESTATIONS_REQUIRED/i);
  assert.match(migration, /rt\.transaction_version<>t\.version/i);
  assert.match(migration, /rt\.document_hash<>t\.document_hash/i);
  assert.match(migration, /'document',t\.document,'identitySnapshot',t\.identity_snapshot/i);
  assert.match(migration, /'docNumber',t\.doc_number,'docType',t\.doc_type,'uptId',t\.upt_id,'createdBy',t\.created_by/i);
  assert.match(migration, /'approvalProgress'/i);
  assert.match(migration, /drop index if exists public\.tug_approvals_review_token_idx/i);
  assert.match(migration, /on public\.tug_approvals\(review_token\) where review_token is not null and event_type = 'REVIEWED'/i);
  assert.doesNotMatch(migration, /on public\.tug_approvals\(review_token\) where review_token is not null;\s*create index/is);
  assert.match(overview, /stockSnapshot/);
  assert.match(overview, /outgoing && current !== null \? current - qty/i);
  assert.match(overview, /i\.current === null \? "-" : fmtNum\(i\.current\)/);
  assert.match(overview, /const reviewPayloadComplete = Boolean/);
  assert.match(overview, /const serverDocNumber = reviewPayloadComplete \? review\.docNumber : docNo\(txn\)/);
  assert.match(overview, /const serverDocType = reviewPayloadComplete \? review\.docType : txn\.docType/);
  assert.match(overview, /Payload review server tidak lengkap\. Approval final diblokir/);
  assert.match(overview, /review\.approvalProgress/);
  assert.match(overview, /JSON\.stringify\(preview,null,2\)/);
  assert.doesNotMatch(overview, /â|Â/);
  assert.match(overview, /Buka preview dokumen final/);
  assert.match(overview, /reviewToken/);
});

test("canonical client maps queue approver from server stage and does not choose a default UPT", () => {
  assert.match(client, /PENDING_TL:"TL"/);
  assert.match(client, /PENDING_ASMAN:"ASMAN"/);
  assert.match(client, /UPT transaksi tidak tersedia/);
  assert.doesNotMatch(client, /\|\| "UPT-SBY"/);
  assert.match(client, /tug_approvals\(\*\)/);
  assert.match(client, /approvalEvents: row\.tug_approvals/);
  assert.match(client, /approvedByTL: tlApproval\?\.actor_id/);
  assert.match(client, /approvedBy: asmanApproval\?\.actor_id/);
});

test("TL intermediate approval remains pending and canonical Asman is explicit", () => {
  assert.match(app, /const isFinal = result\.data\.status === "FINAL_APPROVED"/);
  assert.match(app, /requiredApprover:isFinal \? null : "ASMAN"/);
  assert.match(app, /Menunggu Asman; stok belum berubah/);
  assert.match(overview, /Setujui TL - Lanjutkan ke Asman/);
  assert.match(overview, /Tahap TL: keputusan ini meneruskan transaksi ke Asman/);
  assert.match(overview, /Tahap Asman final: stok akan berubah/);
  assert.match(docs, /Canonical documents show Asman only after that account explicitly approves/);
  assert.match(docs, /txn\.status === "APPROVED"/);
});

test("derived TUG-8/9 drafts reserve no official number and replace themselves canonically", () => {
  const adopt = app.slice(app.indexOf("async function adoptTUG5ULTG"), app.indexOf("function openDraftTug9"));
  const tug8Draft = app.slice(app.indexOf("async function approveTUG7_MgrLogistik"), app.indexOf("async function rejectTUG7_MgrLogistik"));
  assert.match(adopt, /id: `DRAFT-TUG9-/);
  assert.match(adopt, /draftLabel:"DRAFT — nomor resmi saat diajukan"/);
  assert.doesNotMatch(adopt, /docSeq:|generateDocNumbers\(|setDocSeq\(/);
  assert.match(tug8Draft, /id: `DRAFT-TUG8-/);
  assert.match(tug8Draft, /draftLabel:"DRAFT — nomor resmi saat diajukan"/);
  assert.doesNotMatch(tug8Draft, /docSeq:|generateDocNumbers\(|setDocSeq\(/);
  assert.match(app, /async function commitNewTxn\(docType, formData, \{ replaceDraftId = null \} = \{\}\)/);
  assert.match(app, /canonicalActionKeysRef\.current \|\|= newCanonicalActionKeys\(\)/);
  assert.match(app, /Foto TUG-8\/TUG-9 belum aman di Storage/);
  assert.match(app, /submittedItems\.some\(si => !si\.stockId \|\| !\(Number\(si\.qty\) > 0\)\)/);
  assert.match(app, /const canonicalUptId = currentUserUptId \|\| currentUser\?\.uptId \|\| ""/);
  assert.match(adopt, /uptId: currentUserUptId \|\| currentUser\?\.uptId \|\| ""/);
  assert.match(app, /uptId:txn\.uptId \|\| currentUserUptId \|\| currentUser\?\.uptId \|\| ""/);
  assert.match(app, /adoptedTug9Id === replaceDraftId/);
  assert.match(app, /tug8DraftId === replaceDraftId/);
  assert.match(app, /openDraftTug9\(txn\)/);
  assert.doesNotMatch(app.slice(app.indexOf("async function konfirmasiDraftTUG8"), app.indexOf("// Bangun ulang knowledge base")), /status:"PENDING"/);
  assert.match(tugForm, /DRAFT — nomor resmi saat diajukan/);
  assert.match(tugForm, /Lengkapi & Ajukan \$\{txnForm\.docType/);
  assert.match(approvalTab, /Lengkapi & Ajukan TUG-8/);
  assert.match(tug5Tab, /Lengkapi & Ajukan TUG-8/);
  assert.match(tug5Tab, /Lengkapi & Ajukan TUG-9/);
});

test("legacy import is baseline-only and does not replay stock", () => {
  assert.match(migration, /tug_import_legacy_baseline/i);
  assert.match(migration, /'BASELINE_ACCOUNTED'/i);
  const baseline = migration.slice(migration.indexOf("function public.tug_import_legacy_baseline"));
  assert.doesNotMatch(baseline, /insert into public\.stock_movements/i);
});

test("TUG-15 report files remain outside canonical scope", () => {
  const forbidden = ["src/components/TUG15Tab.jsx", "src/lib/tug15Report.js", "src/lib/tug15Pdf.js"];
  for (const file of forbidden) assert.ok(fs.existsSync(path.join(root, file)), `${file} must remain present`);
  const diff = spawnSync("git", ["diff", "--quiet", "--", ...forbidden], { cwd: root });
  assert.equal(diff.status, 0, "canonical work must not modify TUG > Laporan files");
});
