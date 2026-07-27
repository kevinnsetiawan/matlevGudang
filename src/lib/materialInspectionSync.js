import { supabase } from "../supabaseClient.js";
import { compressImage } from "./supabaseSync.js";

export const MATERIAL_INSPECTION_BUCKET = "material-inspection-photos";
export const MATERIAL_INSPECTION_MAX_PHOTOS = 2;
export const MATERIAL_INSPECTION_MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl || "");
  if (!match) throw new Error("Hasil kompresi foto tidak valid.");
  const bytes = atob(match[2]);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type: match[1] || "image/jpeg" });
}

export function validateInspectionPhoto(file) {
  if (!file) return "Foto inspeksi tidak ditemukan.";
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return "Foto harus berformat JPG, PNG, atau WebP.";
  if (file.size > MATERIAL_INSPECTION_MAX_FILE_BYTES) return "Ukuran setiap foto maksimal 5 MB.";
  return null;
}

export function mapMaterialInspectionRow(row) {
  if (!isRecord(row) || typeof row.id !== "string" || !isRecord(row.data)) return null;
  const photoPaths = Array.isArray(row.data.photoPaths)
    ? row.data.photoPaths.filter(path => typeof path === "string" && !path.startsWith("data:"))
    : [];
  return {
    ...row.data,
    id: row.id,
    stockId: row.stock_id || null,
    katalogId: row.katalog_id || null,
    lokasiId: row.lokasi_id || null,
    inspectorId: row.inspector_id || null,
    createdAt: row.created_at,
    photoPaths,
  };
}

export async function loadMaterialInspections() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("material_inspections")
    .select("id, stock_id, katalog_id, lokasi_id, inspector_id, data, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("loadMaterialInspections:", error.message, error);
    return null;
  }
  return (data || []).map(mapMaterialInspectionRow).filter(Boolean);
}

export async function createMaterialInspection({ inspection, photoFiles = [] }) {
  if (!supabase) throw new Error("Koneksi Supabase belum tersedia.");
  if (!inspection?.inspectorId) throw new Error("Identitas pemeriksa tidak tersedia.");
  if (photoFiles.length > MATERIAL_INSPECTION_MAX_PHOTOS) throw new Error("Maksimal dua foto inspeksi.");
  for (const file of photoFiles) {
    const validationError = validateInspectionPhoto(file);
    if (validationError) throw new Error(validationError);
  }

  const inspectionId = crypto.randomUUID();
  const uploadedPaths = [];
  try {
    for (const [index, file] of photoFiles.entries()) {
      const compressed = await compressImage(file, { maxBytes: 800_000, maxDim: 1600 });
      const path = `${inspection.inspectorId}/${inspectionId}/foto-${index + 1}.jpg`;
      const { error } = await supabase.storage
        .from(MATERIAL_INSPECTION_BUCKET)
        .upload(path, dataUrlToBlob(compressed), { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      uploadedPaths.push(path);
    }

    const persistedData = {
      ...inspection,
      photoPaths: uploadedPaths,
    };
    delete persistedData.id;
    delete persistedData.stockId;
    delete persistedData.katalogId;
    delete persistedData.lokasiId;
    delete persistedData.inspectorId;
    delete persistedData.createdAt;
    delete persistedData.photos;

    const { data, error } = await supabase
      .from("material_inspections")
      .insert({
        id: inspectionId,
        stock_id: inspection.stockId || null,
        katalog_id: inspection.katalogId || null,
        lokasi_id: inspection.lokasiId || null,
        inspector_id: inspection.inspectorId,
        data: persistedData,
      })
      .select("id, stock_id, katalog_id, lokasi_id, inspector_id, data, created_at")
      .single();
    if (error) throw error;
    return mapMaterialInspectionRow(data);
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from(MATERIAL_INSPECTION_BUCKET).remove(uploadedPaths);
    throw error;
  }
}

export async function loadInspectionPhotoUrls(paths) {
  if (!supabase || !Array.isArray(paths) || paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(MATERIAL_INSPECTION_BUCKET).createSignedUrls(paths, 3600);
  if (error) {
    console.error("loadInspectionPhotoUrls:", error.message, error);
    return {};
  }
  return Object.fromEntries((data || []).filter(item => item?.path && item?.signedUrl).map(item => [item.path, item.signedUrl]));
}
