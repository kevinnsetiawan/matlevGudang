import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [syncSource, componentSource, permsSource, schemaSource, appSource] = await Promise.all([
  readFile(new URL("../src/lib/materialInspectionSync.js", import.meta.url), "utf8"),
  readFile(new URL("../src/components/InspeksiMaterialCadangTab.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/perms.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  readFile(new URL("../App.jsx", import.meta.url), "utf8"),
]);

test("inspection persistence is dedicated and never routes through saveToCloud/full sync", () => {
  assert.doesNotMatch(componentSource, /saveToCloud/);
  assert.doesNotMatch(syncSource, /syncMasterTable|upsert\(/);
  assert.match(appSource, /loadMaterialInspections\(\)/);
  assert.match(appSource, /tab==="inspeksiMaterial"/);
});

test("inspection photo contract validates uploads and persists only private paths", () => {
  assert.match(syncSource, /MATERIAL_INSPECTION_MAX_PHOTOS = 2/);
  assert.match(syncSource, /image\/jpeg.*image\/png.*image\/webp/);
  assert.match(syncSource, /MATERIAL_INSPECTION_MAX_FILE_BYTES/);
  assert.match(syncSource, /compressImage\(file/);
  assert.match(syncSource, /MATERIAL_INSPECTION_BUCKET/);
  assert.match(syncSource, /delete persistedData\.photos/);
  assert.match(syncSource, /!path\.startsWith\("data:"\)/);
  assert.match(syncSource, /createSignedUrls\(paths, 3600\)/);
});

test("RBAC keeps VIEWER read-only and only ADMIN/TL receive the create action", () => {
  assert.match(permsSource, /"aksi\.buatInspeksiMaterial": true/);
  assert.match(componentSource, /\["ADMIN", "TL"\]\.includes\(currentUser\?\.role\)/);
  assert.doesNotMatch(componentSource, /hasRole\(currentUser/);
  const viewer = permsSource.match(/VIEWER: menus\(([^\n]+)\)/)?.[1] || "";
  assert.match(viewer, /"inspeksiMaterial"/);
  assert.doesNotMatch(viewer, /"maturity"/);
});

test("one inspection retains its own final BA and has no bulk-print workflow", () => {
  assert.match(componentSource, /finalBa:/);
  assert.match(componentSource, /printBa\(inspection\)/);
  assert.match(componentSource, /pelaksanaPemeliharaan/);
  assert.doesNotMatch(componentSource, /openBaModal\(materialInspections\)/);
});

test("schema maps canonical inspection metadata, private bucket, and append-only RLS", () => {
  assert.match(schemaSource, /create table if not exists material_inspections/);
  assert.match(schemaSource, /id uuid primary key/);
  assert.match(schemaSource, /stock_id text references stocks\(id\) on delete set null/);
  assert.match(schemaSource, /katalog_id text references katalog\(id\) on delete set null/);
  assert.match(schemaSource, /lokasi_id text references lokasi\(id\) on delete set null/);
  assert.match(schemaSource, /inspector_id uuid references profiles\(id\) on delete set null/);
  assert.match(schemaSource, /data jsonb not null/);
  assert.match(schemaSource, /material-inspection-photos'.*, false/);
  assert.match(schemaSource, /profiles\.role in \('ADMIN', 'TL'\)/);
  assert.doesNotMatch(schemaSource, /create policy "Admin TL update material_inspections"/);
});
