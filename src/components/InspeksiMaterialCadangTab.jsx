import { useEffect, useMemo, useRef, useState } from "react";
import { can } from "../lib/perms.js";
import { OperationsHero } from "./OperationsHero.jsx";
import {
  ClipboardText,
  Plus,
  MagnifyingGlass,
  CaretDown,
  Camera,
  CheckCircle,
  Trash,
  Printer,
  Package,
  Stack,
} from "@phosphor-icons/react";
import {
  createMaterialInspectionBatch,
  loadInspectionPhotoUrls,
  MATERIAL_INSPECTION_MAX_PHOTOS,
  MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH,
} from "../lib/materialInspectionSync.js";

const KONDISI = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "PERLU_KALIBRASI"];
const KELAYAKAN = ["READY", "MAINTENANCE", "RETEST", "ATTB_RECOMMENDED"];
const CHECKLIST_KEYS = [
  ["kebersihan", "Kebersihan"],
  ["bebasKarat", "Bebas karat"],
  ["bebasBocor", "Bebas bocor"],
  ["kemasanBaik", "Kemasan baik"],
];
const UPT_SBY = "UPT-SBY";
const MANAGER_UPT_SBY = "Yaya Supriman";
const todayJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// Label korporat 12px (override sty.label yang 11px — floor tipografi project).
const labelStyle = C => ({
  fontSize: 12,
  color: C.muted,
  display: "block",
  marginBottom: 4,
  fontWeight: 700,
  letterSpacing: ".2px",
});

function emptyItem(stock, katalog, lokasi) {
  return {
    stockId: stock.id,
    katalogId: stock.katalogId || null,
    lokasiId: stock.lokasiId || null,
    noKatalog: katalog?.katalog || katalog?.noKatalog || "",
    namaBarang: katalog?.name || stock.name || "",
    lokasiNama: lokasi?.kode || lokasi?.nama || "",
    qtyStok: stock.qty || 1,
    satuan: katalog?.satuan || stock.satuan || "BH",
    jenisMtu: katalog?.jenisMtu || "",
    kondisi: "BAIK",
    statusKelayakan: "READY",
    keteranganVisual: "",
    catatan: "",
    checklist: { kebersihan: true, bebasKarat: true, bebasBocor: true, kemasanBaik: true },
    photos: [],
  };
}

// ponytail: object URL leak bounded per session; revoke on URL list change.
function usePhotoPreviews(photos) {
  const urls = useMemo(
    () => photos.map(file => (file instanceof File ? URL.createObjectURL(file) : "")),
    [photos],
  );
  useEffect(() => {
    return () => { urls.forEach(url => { if (url) URL.revokeObjectURL(url); }); };
  }, [urls]);
  return urls;
}

function itemComplete(item) {
  return item.photos.length === MATERIAL_INSPECTION_MAX_PHOTOS;
}
>>>>>>> upstream/main

export function InspeksiMaterialCadangTab({
  stocks = [],
  katalogList = [],
  lokasiList = [],
<<<<<<< HEAD
  materialInspections = [],
  setMaterialInspections,
  currentUser,
  C = {},
  sty = {},
  isMobile,
  showToast,
  saveToCloud
}) {
  const [subTab, setSubTab] = useState("formInspeksi"); // Default langsung ke Form Inspeksi!
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [stockDropdownOpen, setStockDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Selected Stock Item
  const [selectedStockId, setSelectedStockId] = useState("");
  const [noKatalog, setNoKatalog] = useState("");
  const [namaBarang, setNamaBarang] = useState("");
  const [lokasiNama, setLokasiNama] = useState("GUDANG KETINTANG");
  const [qtyStok, setQtyStok] = useState(1);
  const [satuan, setSatuan] = useState("BH");

  // Form Details
  const [jenisMtu, setJenisMtu] = useState("CT");
  const [noSloc, setNoSloc] = useState("2000");
  const [jenisPeruntukan, setJenisPeruntukan] = useState("SPARE");
  const [estimasiPenyimpanan, setEstimasiPenyimpanan] = useState("2 Tahun");
  const [kondisi, setKondisi] = useState("BAIK");
  const [statusKelayakan, setStatusKelayakan] = useState("READY");
  const [keteranganVisual, setKeteranganVisual] = useState("");
  const [catatan, setCatatan] = useState("");
  const [paramKebersihan, setParamKebersihan] = useState(true);
  const [paramBebasKarat, setParamBebasKarat] = useState(true);
  const [paramBebasBocor, setParamBebasBocor] = useState(true);
  const [paramKemasanBaik, setParamKemasanBaik] = useState(true);
  const [foto1, setFoto1] = useState(null);
  const [foto2, setFoto2] = useState(null);
  const [saving, setSaving] = useState(false);

  // Modal Cetak Berita Acara (BA)
  const [printModal, setPrintModal] = useState(false);
  const [baData, setBaData] = useState(null);
  
  // Field Form Header Berita Acara
  const [baNoDokumen, setBaNoDokumen] = useState(`4/BA-INSPEKSI/UPT-SBYA/April/${new Date().getFullYear()}`);
  const [baTanggal, setBaTanggal] = useState(new Date().toISOString().split("T")[0]);
  const [baNamaGudang, setBaNamaGudang] = useState("GUDANG KETINTANG");
  const [baNoSloc, setBaNoSloc] = useState("2000");
  const [baNamaUpt, setBaNamaUpt] = useState("UPT Surabaya");
  const [baPelaksanaLogistik, setBaPelaksanaLogistik] = useState(currentUser?.name || "WIDI FERDIAN");
  const [baPelaksanaPemeliharaan, setBaPelaksanaPemeliharaan] = useState("M. HASSAN");
  const [baManagerUpt, setBaManagerUpt] = useState("YAYA SUPRIMAN");

  // Tanda Tangan Digital BA
  const [baPelaksanaLogistikSig, setBaPelaksanaLogistikSig] = useState(currentUser?.signatureUrl || null);
  const [baPelaksanaPemeliharaanSig, setBaPelaksanaPemeliharaanSig] = useState(null);
  const [baManagerUptSig, setBaManagerUptSig] = useState(null);
  const [activeSigField, setActiveSigField] = useState(null); // 'logistik' | 'pemeliharaan' | 'manager'

  // Click outside to close stock search dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setStockDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Map stocks dengan metadata katalog & lokasi
  const enrichedStocks = useMemo(() => {
    return (stocks || []).map(s => {
      const kat = (katalogList || []).find(k => k.id === s.katalogId) || {};
      const normKat = normalizeKatalog(kat);
      const lok = (lokasiList || []).find(l => l.id === s.lokasiId) || {};
      const name = normKat.name || s.namaMaterial || s.materialDescription || s.name || "Material Stok";
      const noKatVal = normKat.noKat || s.noKatalog || s.noKat || "-";
      const uomVal = normKat.satuan || s.satuan || "BH";
      const lokVal = lok.nama || s.lokasiNama || s.lokasiId || "GUDANG KETINTANG";

      return {
        ...s,
        katalogName: name,
        noKat: noKatVal,
        satuan: uomVal,
        lokasiNama: lokVal,
        searchLabel: `${noKatVal} - ${name} (${lokVal})`
      };
    });
  }, [stocks, katalogList, lokasiList]);

  // Filtered stock list for autocomplete dropdown
  const filteredStockOptions = useMemo(() => {
    const q = stockSearchQuery.toLowerCase().trim();
    if (!q) return enrichedStocks.slice(0, 30);
    return enrichedStocks.filter(item => 
      matchesMaterialSearch([item.searchLabel, item.katalogName, item.noKat, item.lokasiNama], q)
    );
  }, [enrichedStocks, stockSearchQuery]);

  // Handle Pilih Barang dari Autocomplete Dropdown
  function selectStockItem(item) {
    setSelectedStockId(item.id);
    setNoKatalog(item.noKat);
    setNamaBarang(item.katalogName);
    setLokasiNama(item.lokasiNama);
    setQtyStok(item.qty || 1);
    setSatuan(item.satuan || "BH");

    // Auto detect jenis MTU
    const nameUpper = item.katalogName.toUpperCase();
    if (nameUpper.includes("CT") || nameUpper.includes("CURRENT TRANSFORMER")) setJenisMtu("CT");
    else if (nameUpper.includes("CB") || nameUpper.includes("CIRCUIT BREAKER")) setJenisMtu("CB 150kV");
    else if (nameUpper.includes("DS") || nameUpper.includes("DISCONNECTING")) setJenisMtu("DS 150kV");
    else if (nameUpper.includes("LA") || nameUpper.includes("ARRESTER")) setJenisMtu("LA 150kV");
    else if (nameUpper.includes("TRANSFORMATOR") || nameUpper.includes("TRAFO")) setJenisMtu("Transformator");

    setStockSearchQuery("");
    setStockDropdownOpen(false);
  }

  // Handle Upload Foto Tunggal (Foto 1 & Foto 2)
  function handleSinglePhotoAdd(e, setFotoFn) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFotoFn({ name: file.name, url: reader.result, size: file.size });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Simpan Hasil Inspeksi
  async function handleSaveInspeksi() {
    if (!namaBarang.trim()) {
      showToast && showToast("Pilih atau isi nama barang material terlebih dahulu.", "error");
      return;
    }
    setSaving(true);
    try {
      const entry = {
        id: "INSP-" + Date.now() + "-" + uid().slice(-4),
        stockId: selectedStockId || null,
        katalogId: selectedStockId || null,
        noKatalog: noKatalog.trim() || "-",
        namaBarang: namaBarang.trim(),
        lokasiNama: lokasiNama.trim() || "GUDANG KETINTANG",
        qtyStok: Number(qtyStok) || 1,
        satuan: satuan.trim() || "BH",
        jenisMtu,
        noSloc,
        jenisPeruntukan,
        estimasiPenyimpanan,
        kondisi,
        statusKelayakan,
        keteranganVisual: keteranganVisual.trim() || (kondisi === "BAIK" ? "BAIK" : "PERLU PERHATIAN"),
        catatan: catatan.trim(),
        checklist: {
          kebersihan: paramKebersihan,
          bebasKarat: paramBebasKarat,
          bebasBocor: paramBebasBocor,
          kemasanBaik: paramKemasanBaik
        },
        fotos: [foto1, foto2].filter(Boolean),
        inspectorId: currentUser?.id,
        inspectorName: currentUser?.name || currentUser?.username || "Auditor Logistik",
        createdAt: Date.now()
      };

      const updatedList = [entry, ...(materialInspections || [])];
      setMaterialInspections(updatedList);
      saveToCloud && await saveToCloud({ materialInspections: updatedList });
      showToast && showToast(`✅ Inspeksi untuk ${namaBarang} berhasil disimpan.`);
      
      // Buka modal cetak Berita Acara (BA)
      openBaModal([entry]);
    } catch (err) {
      console.error("Error simpan inspeksi:", err);
      showToast && showToast("Gagal menyimpan inspeksi.", "error");
=======
  gudangList = [],
  materialInspections = [],
  materialInspectionBatches = [],
  onInspectionCreated,
  onInspectionBatchCreated,
  currentUser,
  rolePerms,
  C,
  sty,
  showToast,
  isMobile,
}) {
  const [view, setView] = useState("form");
  const [items, setItems] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [expandedItemIndex, setExpandedItemIndex] = useState(null);
  const [pelaksanaLogistik, setPelaksanaLogistik] = useState(currentUser?.name || "");
  const [pelaksaraPemeliharaan, setPelaksaraPemeliharaan] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSavedBa, setLastSavedBa] = useState(null);
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [batchPhotoUrls, setBatchPhotoUrls] = useState({});
  const [printBatch, setPrintBatch] = useState(null);
  const pickerSearchRef = useRef(null);
  const writer = ["ADMIN", "TL"].includes(currentUser?.role) && can(currentUser, "aksi.buatInspeksiMaterial", rolePerms);

  const today = todayJakarta();

  // Stok Cadang canonical: hanya yang katalognya jenisBarang==="Cadang".
  const cadangStockOptions = useMemo(() => {
    const cadangKatalogIds = new Set(
      katalogList.filter(k => k?.jenisBarang === "Cadang").map(k => k.id),
    );
    return stocks
      .filter(s => cadangKatalogIds.has(s.katalogId))
      .map(stock => {
        const katalog = katalogList.find(k => k.id === stock.katalogId);
        const lokasi = lokasiList.find(l => l.id === stock.lokasiId);
        return { stock, katalog, lokasi };
      });
  }, [stocks, katalogList, lokasiList]);

  // Gudang terkunci dari material pertama; material berikutnya harus dari gudang yang sama.
  const lockedGudangId = useMemo(() => {
    if (!items.length) return null;
    const first = items[0];
    const lokasi = lokasiList.find(l => l.id === first.lokasiId);
    return lokasi?.gudangId || null;
  }, [items, lokasiList]);

  const lockedGudang = useMemo(
    () => gudangList.find(g => g.id === lockedGudangId) || null,
    [gudangList, lockedGudangId],
  );

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const alreadySelected = new Set(items.map(it => it.stockId));
    return cadangStockOptions
      .filter(opt => !alreadySelected.has(opt.stock.id))
      .filter(opt => !lockedGudangId || opt.lokasi?.gudangId === lockedGudangId)
      .filter(opt => {
        if (!q) return true;
        const label = `${opt.katalog?.katalog || ""} ${opt.katalog?.name || ""} ${opt.stock.name || ""}`.toLowerCase();
        return label.includes(q);
      })
      .slice(0, 50);
  }, [cadangStockOptions, items, lockedGudangId, pickerQuery]);

  const completeCount = items.filter(itemComplete).length;
  const formInvalid = !items.length || items.some(it => !itemComplete(it)) || !pelaksanaLogistik.trim() || !pelaksaraPemeliharaan.trim();

  useEffect(() => {
    if (pickerOpen && pickerSearchRef.current) pickerSearchRef.current.focus();
  }, [pickerOpen]);

  useEffect(() => {
    if (expandedBatchId) {
      const batch = materialInspectionBatches.find(b => b.id === expandedBatchId);
      const paths = batch?.items?.flatMap(it => it.photoPaths || []) || [];
      if (!paths.length) { setBatchPhotoUrls({}); return; }
      let active = true;
      loadInspectionPhotoUrls(paths).then(urls => { if (active) setBatchPhotoUrls(urls); });
      return () => { active = false; };
    }
    setBatchPhotoUrls({});
  }, [expandedBatchId, materialInspectionBatches]);

  function addItem(stockId) {
    const opt = cadangStockOptions.find(o => o.stock.id === stockId);
    if (!opt) return;
    const nextIndex = items.length;
    setItems(prev => {
      if (prev.length >= MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH) return prev;
      if (prev.some(it => it.stockId === stockId)) return prev;
      return [...prev, emptyItem(opt.stock, opt.katalog, opt.lokasi)];
    });
    setExpandedItemIndex(nextIndex);
    setPickerOpen(false);
    setPickerQuery("");
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index));
    setExpandedItemIndex(cur => {
      if (cur === null) return null;
      if (cur === index) return null;
      if (cur > index) return cur - 1;
      return cur;
    });
  }

  function toggleItem(index) {
    setExpandedItemIndex(id => (id === index ? null : index));
  }

  function updateItem(index, patch) {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function updateItemChecklist(index, key, value) {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, checklist: { ...it.checklist, [key]: value } } : it)));
  }

  function addPhotos(index, files) {
    const incoming = Array.from(files || []);
    setItems(prev => prev.map((it, i) => {
      if (i !== index) return it;
      const combined = [...it.photos, ...incoming];
      if (combined.length > MATERIAL_INSPECTION_MAX_PHOTOS) {
        showToast("Maksimal dua foto per material.", "error");
        return it;
      }
      return { ...it, photos: combined };
    }));
  }

  function removePhoto(index, photoIndex) {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, photos: it.photos.filter((_, p) => p !== photoIndex) } : it)));
  }

  function resetForm() {
    setItems([]);
    setExpandedItemIndex(null);
    setPelaksaraPemeliharaan("");
    setPickerOpen(false);
    setPickerQuery("");
  }

  async function saveBatch() {
    if (!writer) return;
    if (!items.length) { showToast("Minimal satu material harus diperiksa.", "error"); return; }
    if (!pelaksanaLogistik.trim()) { showToast("Pelaksana Logistik wajib diisi.", "error"); return; }
    if (!pelaksaraPemeliharaan.trim()) { showToast("Pelaksara Pemeliharaan wajib diisi.", "error"); return; }
    for (const [i, it] of items.entries()) {
      if (it.photos.length !== MATERIAL_INSPECTION_MAX_PHOTOS) {
        showToast(`Material baris ${i + 1} wajib punya tepat ${MATERIAL_INSPECTION_MAX_PHOTOS} foto.`, "error");
        return;
      }
    }
    setSaving(true);
    try {
      const header = {
        inspectorId: currentUser.id,
        inspectorName: currentUser.name || currentUser.username || "Pemeriksa",
        uptId: UPT_SBY,
        gudangId: lockedGudangId,
        tanggal: today,
        pelaksanaLogistik: pelaksanaLogistik.trim(),
        pelaksaraPemeliharaan: pelaksaraPemeliharaan.trim(),
        managerUpt: MANAGER_UPT_SBY,
        namaUpt: currentUser?.upt || "UPT Surabaya",
        namaGudang: lockedGudang?.nama || "",
      };
      const payloadItems = items.map(it => ({
        stockId: it.stockId,
        katalogId: it.katalogId,
        lokasiId: it.lokasiId,
        noKatalog: it.noKatalog,
        namaBarang: it.namaBarang,
        lokasiNama: it.lokasiNama,
        qtyStok: Number(it.qtyStok) || 1,
        satuan: it.satuan,
        jenisMtu: it.jenisMtu,
        kondisi: it.kondisi,
        statusKelayakan: it.statusKelayakan,
        keteranganVisual: it.keteranganVisual,
        catatan: it.catatan,
        checklist: it.checklist,
      }));
      const created = await createMaterialInspectionBatch({
        header,
        items: payloadItems,
        photoFilesPerItem: items.map(it => it.photos),
      });
      onInspectionBatchCreated(created);
      setLastSavedBa(created);
      resetForm();
      setView("history");
      showToast(`BA Inspeksi ${created.nomorBa} tersimpan.`);
    } catch (error) {
      console.error("Simpan BA inspeksi gagal:", error);
      showToast(error.message || "Gagal menyimpan BA inspeksi.", "error");
>>>>>>> upstream/main
    } finally {
      setSaving(false);
    }
  }

<<<<<<< HEAD
  // Menyiapkan Modal Berita Acara untuk daftar inspeksi yang dipilih
  function openBaModal(items) {
    if (!items || !items.length) {
      showToast && showToast("Pilih minimal 1 item hasil inspeksi untuk cetak BA.", "error");
      return;
    }
    const first = items[0];
    setBaNamaGudang(first.lokasiNama || "GUDANG KETINTANG");
    setBaNoSloc(first.noSloc || "2000");
    setBaData({
      items,
      allFotos: items.flatMap(i => i.fotos || [])
    });
    setPrintModal(true);
  }

  // Trigger Print Browser
  function handleTriggerPrint() {
    window.print();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* CSS Cetak khusus Berita Acara (@media print) */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .ba-print-container, .ba-print-container * {
            visibility: visible;
          }
          .ba-print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
            background: white !important;
            color: black !important;
            font-family: 'Times New Roman', Times, serif;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
        }
      ` }} />

      {/* Sub-tab Navigation Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border || "#e2e8f0"}`, paddingBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ ...sty.btn(subTab === "formInspeksi" ? "primary" : "ghost", "sm") }}
            onClick={() => setSubTab("formInspeksi")}
          >
            📝 Formulir Inspeksi Material
          </button>

          <button
            style={{ ...sty.btn(subTab === "riwayat" ? "primary" : "ghost", "sm") }}
            onClick={() => setSubTab("riwayat")}
          >
            📋 Riwayat Hasil Inspeksi ({materialInspections.length})
          </button>
        </div>

        {materialInspections.length > 0 && (
          <button
            style={{ ...sty.btn("primary", "sm"), background: "#10b981", borderColor: "#059669" }}
            onClick={() => openBaModal(materialInspections)}
          >
            📄 Cetak Berita Acara (BA) Resmi
          </button>
        )}
      </div>

      {/* SUB-TAB 1: FORMULIR INSPEKSI MATERIAL (LANGSUNG TERSEDIA) */}
      {subTab === "formInspeksi" && (
        <div style={{ background: C.surface || "#ffffff", border: `1px solid ${C.border || "#e2e8f0"}`, borderRadius: 14, padding: 22, boxShadow: "0 4px 16px rgba(0,0,0,0.04)", maxWidth: 850, margin: "0 auto", width: "100%" }}>
          
          <div style={{ marginBottom: 18, borderBottom: `1px solid ${C.border || "#e2e8f0"}`, paddingBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.accent || "#2563eb", textTransform: "uppercase", letterSpacing: "0.5px" }}>FORMULIR BERITA ACARA INSPEKSI MTU</span>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: C.text || "#0f172a", margin: "2px 0" }}>Input Data & Pemeriksaan Visual Material</h3>
            <p style={{ fontSize: 11, color: C.muted || "#64748b", margin: 0 }}>Pilih barang dari Data Stok atau ketik rincian material untuk membuat dokumen Berita Acara resmi.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            
            {/* BAGIAN 1: CARI & PILIH BARANG DARI DATA STOK */}
            <div ref={dropdownRef} style={{ position: "relative", background: C.bg || "#f8fafc", padding: 16, borderRadius: 12, border: `1.5px solid ${C.border || "#cbd5e1"}` }}>
              <label style={{ ...sty.label, marginBottom: 6, display: "block", color: C.text || "#0f172a", fontWeight: 800 }}>
                🔍 Cari & Pilih Material dari Data Stok Gudang
              </label>
              
              <input
                style={{ ...sty.input, fontSize: 13, background: C.surface || "#ffffff", color: C.text || "#0f172a" }}
                placeholder="Ketik no katalog, nama barang (misal: CT, CB, LA), lokasi gudang..."
                value={stockSearchQuery || (namaBarang ? `${noKatalog} - ${namaBarang}` : "")}
                onFocus={() => setStockDropdownOpen(true)}
                onChange={e => {
                  setStockSearchQuery(e.target.value);
                  setStockDropdownOpen(true);
                }}
              />

              {/* Dropdown Results Autocomplete */}
              {stockDropdownOpen && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  background: C.surface || "#ffffff",
                  border: `1px solid ${C.border || "#cbd5e1"}`,
                  borderRadius: 10,
                  marginTop: 4,
                  maxHeight: 240,
                  overflowY: "auto",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)"
                }}>
                  {filteredStockOptions.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, color: C.muted || "#64748b", textAlign: "center" }}>
                      Tidak ada barang stok yang cocok. Anda tetap dapat mengisi formulir secara manual di bawah.
                    </div>
                  ) : (
                    filteredStockOptions.map(stk => (
                      <div
                        key={stk.id}
                        onClick={() => selectStockItem(stk)}
                        style={{
                          padding: "10px 14px",
                          borderBottom: `1px solid ${C.border || "#f1f5f9"}`,
                          cursor: "pointer",
                          transition: "background 0.15s",
                          background: stk.id === selectedStockId ? (C.bg || "#eff6ff") : "transparent"
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.text || "#0f172a" }}>
                          <span style={{ color: C.accent || "#2563eb", marginRight: 8 }}>[{stk.noKat}]</span>
                          {stk.katalogName}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted || "#64748b", marginTop: 2, display: "flex", gap: 12 }}>
                          <span>📍 {stk.lokasiNama}</span>
                          <span>📦 Qty Stok: <strong>{stk.qty || 0} {stk.satuan}</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Summary Pill Barang yang Terpilih */}
              {namaBarang && (
                <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: C.surface || "#ffffff", border: `1px solid ${C.border || "#e2e8f0"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 11, color: C.text || "#0f172a" }}>
                    <span style={{ fontWeight: 800, color: C.accent || "#2563eb" }}>✓ Terpilih:</span> [{noKatalog}] <strong>{namaBarang}</strong> · Lokasi: {lokasiNama} ({qtyStok} {satuan})
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStockId("");
                      setNoKatalog("");
                      setNamaBarang("");
                      setStockSearchQuery("");
                    }}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                  >
                    ✕ Reset Pilihan
                  </button>
                </div>
              )}
            </div>

            {/* BAGIAN 2: RINCIAN MATERIAL & BA */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 12 }}>
              <div>
                <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>Nomor Katalog Material</label>
                <input
                  style={{ ...sty.input, fontSize: 12 }}
                  value={noKatalog}
                  onChange={e => setNoKatalog(e.target.value)}
                  placeholder="Contoh: 1002050628"
                />
              </div>

              <div>
                <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>Material Description (Nama Material) *</label>
                <input
                  style={{ ...sty.input, fontSize: 12 }}
                  value={namaBarang}
                  onChange={e => setNamaBarang(e.target.value)}
                  placeholder="Contoh: CT;150kV;K;150-300/1A;5P20;36kV;N"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 12 }}>
              <div>
                <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>Jenis MTU *</label>
                <select
                  style={{ ...sty.input, width: "100%", fontSize: 12, fontWeight: 700, background: C.surface, color: C.text }}
                  value={jenisMtu}
                  onChange={e => setJenisMtu(e.target.value)}
                >
                  {JENIS_MTU_OPTIONS.map(m => (
                    <option key={m} value={m} style={{ background: C.surface, color: C.text }}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>Base Unit (UOM)</label>
                <input
                  style={{ ...sty.input, fontSize: 12 }}
                  value={satuan}
                  onChange={e => setSatuan(e.target.value)}
                  placeholder="BH / U / SET / MTR"
                />
              </div>

              <div>
                <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>Quantity *</label>
                <input
                  type="number"
                  style={{ ...sty.input, fontSize: 12 }}
                  value={qtyStok}
                  onChange={e => setQtyStok(e.target.value)}
                  placeholder="1"
                />
              </div>

              <div>
                <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>No SLoc</label>
                <input
                  style={{ ...sty.input, fontSize: 12 }}
                  value={noSloc}
                  onChange={e => setNoSloc(e.target.value)}
                  placeholder="2000"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 12 }}>
              <div>
                <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>Jenis Peruntukan</label>
                <select
                  style={{ ...sty.input, width: "100%", fontSize: 12, fontWeight: 700, background: C.surface, color: C.text }}
                  value={jenisPeruntukan}
                  onChange={e => setJenisPeruntukan(e.target.value)}
                >
                  <option value="SPARE" style={{ background: C.surface, color: C.text }}>SPARE (Cadang)</option>
                  <option value="PERSEDIAAN" style={{ background: C.surface, color: C.text }}>PERSEDIAAN</option>
                  <option value="ATTB" style={{ background: C.surface, color: C.text }}>ATTB (Afkir)</option>
                </select>
              </div>

              <div>
                <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>Estimasi Waktu Penyimpanan di Gudang</label>
                <input
                  style={{ ...sty.input, fontSize: 12 }}
                  value={estimasiPenyimpanan}
                  onChange={e => setEstimasiPenyimpanan(e.target.value)}
                  placeholder="Contoh: 2 Tahun, 7 Bulan, 3 TAHUN..."
                />
              </div>
            </div>

            {/* BAGIAN 3: KONDISI VISUAL & KETERANGAN */}
            <div>
              <label style={{ ...sty.label, marginBottom: 6, display: "block" }}>Kondisi Visual Barang *</label>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 10 }}>
                {KONDISI_OPTIONS.map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setKondisi(opt.value)}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `2px solid ${kondisi === opt.value ? opt.color : C.border || "#cbd5e1"}`,
                      background: kondisi === opt.value ? opt.bg : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s"
                    }}
                  >
                    <input type="radio" checked={kondisi === opt.value} onChange={() => setKondisi(opt.value)} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: kondisi === opt.value ? opt.color : C.text || "#0f172a" }}>{opt.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={{ ...sty.label, marginBottom: 4, display: "block" }}>Keterangan Visual (Info Tambahan) *</label>
              <input
                style={{ ...sty.input, fontSize: 12 }}
                value={keteranganVisual}
                onChange={e => setKeteranganVisual(e.target.value)}
                placeholder="Contoh: PELINDUNG KERAMIK CT SOBEK / PELINDUNG TERPAL MULAI COPOT / BAIK"
              />
            </div>

            <div>
              <label style={{ ...sty.label, marginBottom: 6, display: "block" }}>Status Kelayakan Pakai *</label>
              <select
                style={{ ...sty.input, width: "100%", fontSize: 12, fontWeight: 700, background: C.surface, color: C.text }}
                value={statusKelayakan}
                onChange={e => setStatusKelayakan(e.target.value)}
              >
                {STATUS_KELAYAKAN.map(s => (
                  <option key={s.value} value={s.value} style={{ background: C.surface, color: C.text }}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Checklist Parameter Inspeksi */}
            <div style={{ background: C.bg || "#f8fafc", padding: 14, borderRadius: 10, border: `1px solid ${C.border || "#e2e8f0"}` }}>
              <label style={{ ...sty.label, marginBottom: 10, display: "block", color: C.text || "#0f172a" }}>Checklist Parameter Inspeksi</label>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={paramKebersihan} onChange={e => setParamKebersihan(e.target.checked)} />
                  <span>Kebersihan Area & Barang</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={paramBebasKarat} onChange={e => setParamBebasKarat(e.target.checked)} />
                  <span>Bebas Karat / Korosi</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={paramBebasBocor} onChange={e => setParamBebasBocor(e.target.checked)} />
                  <span>Bebas Kebocoran / Kelembaban</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={paramKemasanBaik} onChange={e => setParamKemasanBaik(e.target.checked)} />
                  <span>Kemasan / Packaging Utuh</span>
                </label>
              </div>
            </div>

            {/* Upload 2 Foto Evidence */}
            <div>
              <label style={{ ...sty.label, marginBottom: 8, display: "block", color: C.text || "#0f172a", fontWeight: 800 }}>
                Upload 2 Foto Hasil Inspeksi (Untuk Lampiran Dokumen BA) *
              </label>
              
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                {/* SLOT FOTO 1 */}
                <div style={{
                  border: `2px dashed ${foto1 ? "#10b981" : (C.border || "#cbd5e1")}`,
                  borderRadius: 12,
                  padding: 12,
                  background: foto1 ? "rgba(16, 185, 129, 0.05)" : (C.bg || "#f8fafc"),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 150
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.text || "#0f172a", marginBottom: 8 }}>
                    📷 Foto 1: Kondisi Visual / Fisik Material
                  </div>

                  {foto1 ? (
                    <div style={{ position: "relative", width: "100%", height: 130, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border || "#cbd5e1"}` }}>
                      <img src={foto1.url} alt="Foto 1" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        type="button"
                        onClick={() => setFoto1(null)}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          background: "rgba(239, 68, 68, 0.9)",
                          color: "white",
                          border: "none",
                          borderRadius: "50%",
                          width: 22,
                          height: 22,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >✕</button>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "white", padding: "2px 6px", fontSize: 9, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {foto1.name}
                      </div>
                    </div>
                  ) : (
                    <label style={{ cursor: "pointer", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0" }}>
                      <span style={{ fontSize: 26, marginBottom: 4 }}>📷</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.accent || "#2563eb" }}>+ Upload Foto 1</span>
                      <span style={{ fontSize: 10, color: C.muted || "#64748b", marginTop: 2 }}>Pilih file gambar (JPG/PNG)</span>
                      <input type="file" accept="image/*" hidden onChange={(e) => handleSinglePhotoAdd(e, setFoto1)} />
                    </label>
                  )}
                </div>

                {/* SLOT FOTO 2 */}
                <div style={{
                  border: `2px dashed ${foto2 ? "#10b981" : (C.border || "#cbd5e1")}`,
                  borderRadius: 12,
                  padding: 12,
                  background: foto2 ? "rgba(16, 185, 129, 0.05)" : (C.bg || "#f8fafc"),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 150
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.text || "#0f172a", marginBottom: 8 }}>
                    📷 Foto 2: Nameplate / Tagging / Packaging
                  </div>

                  {foto2 ? (
                    <div style={{ position: "relative", width: "100%", height: 130, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border || "#cbd5e1"}` }}>
                      <img src={foto2.url} alt="Foto 2" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        type="button"
                        onClick={() => setFoto2(null)}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          background: "rgba(239, 68, 68, 0.9)",
                          color: "white",
                          border: "none",
                          borderRadius: "50%",
                          width: 22,
                          height: 22,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >✕</button>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "white", padding: "2px 6px", fontSize: 9, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {foto2.name}
                      </div>
                    </div>
                  ) : (
                    <label style={{ cursor: "pointer", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0" }}>
                      <span style={{ fontSize: 26, marginBottom: 4 }}>📷</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.accent || "#2563eb" }}>+ Upload Foto 2</span>
                      <span style={{ fontSize: 10, color: C.muted || "#64748b", marginTop: 2 }}>Pilih file gambar (JPG/PNG)</span>
                      <input type="file" accept="image/*" hidden onChange={(e) => handleSinglePhotoAdd(e, setFoto2)} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Catatan Auditor */}
            <div>
              <label style={{ ...sty.label, marginBottom: 6, display: "block" }}>Catatan Tambahan Auditor</label>
              <textarea
                style={{ ...sty.input, minHeight: 70, fontSize: 12 }}
                placeholder="Catatan internal tambahan..."
                value={catatan}
                onChange={e => setCatatan(e.target.value)}
              />
            </div>

            {/* Submit Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button style={{ ...sty.btn("primary") }} disabled={saving} onClick={handleSaveInspeksi}>
                {saving ? "Memproses..." : "💾 Simpan & Buat Berita Acara (BA)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: RIWAYAT HASIL INSPEKSI */}
      {subTab === "riwayat" && (
        <div style={{ background: C.surface || "#ffffff", border: `1px solid ${C.border || "#e2e8f0"}`, borderRadius: 14, padding: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text || "#0f172a", margin: 0 }}>Riwayat Hasil Inspeksi Material Cadang</h3>
            {materialInspections.length > 0 && (
              <button
                style={{ ...sty.btn("primary", "sm"), background: "#10b981", borderColor: "#059669" }}
                onClick={() => openBaModal(materialInspections)}
              >
                📄 Cetak Berita Acara Seluruh Hasil ({materialInspections.length} Item)
              </button>
            )}
          </div>
          
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.bg || "#f8fafc", color: C.text || "#0f172a", borderBottom: `2px solid ${C.border || "#e2e8f0"}`, textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Tanggal</th>
                  <th style={{ padding: "10px 12px" }}>Jenis MTU</th>
                  <th style={{ padding: "10px 12px" }}>No Katalog</th>
                  <th style={{ padding: "10px 12px" }}>Material Description</th>
                  <th style={{ padding: "10px 12px" }}>Qty</th>
                  <th style={{ padding: "10px 12px" }}>Estimasi Penyimpanan</th>
                  <th style={{ padding: "10px 12px" }}>Kondisi Visual</th>
                  <th style={{ padding: "10px 12px" }}>Keterangan</th>
                  <th style={{ padding: "10px 12px" }}>Foto</th>
                  <th style={{ padding: "10px 12px" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(materialInspections || []).map(insp => {
                  const kondMeta = KONDISI_OPTIONS.find(k => k.value === insp.kondisi);

                  return (
                    <tr key={insp.id} style={{ borderBottom: `1px solid ${C.border || "#f1f5f9"}` }}>
                      <td style={{ padding: "10px 12px" }}>{fmtDate(insp.createdAt)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: C.accent || "#2563eb" }}>{insp.jenisMtu || "CT"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{insp.noKatalog}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: C.text || "#0f172a" }}>{insp.namaBarang}</td>
                      <td style={{ padding: "10px 12px" }}>{insp.qtyStok} {insp.satuan}</td>
                      <td style={{ padding: "10px 12px" }}>{insp.estimasiPenyimpanan || "-"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {kondMeta ? (
                          <span style={{ fontSize: 10, fontWeight: 800, color: kondMeta.color, background: kondMeta.bg, padding: "2px 8px", borderRadius: 6 }}>
                            {kondMeta.label}
                          </span>
                        ) : insp.kondisi}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11 }}>{insp.keteranganVisual || "BAIK"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {(insp.fotos || []).length > 0 ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.accent || "#2563eb" }}>📷 {insp.fotos.length} foto</span>
                        ) : "-"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button
                          style={{ ...sty.btn("ghost", "sm"), padding: "4px 8px", fontSize: 11 }}
                          onClick={() => openBaModal([insp])}
                        >
                          🖨️ BA Item Ini
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {(!materialInspections || materialInspections.length === 0) && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: "center", padding: 30, color: C.muted || "#64748b" }}>
                      Belum ada riwayat inspeksi material cadang.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL & PREVIEW CETAK BERITA ACARA (BA) */}
      {printModal && baData && (
        <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15, 23, 42, 0.75)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: C.surface || "#ffffff", color: C.text || "#0f172a", width: "100%", maxWidth: 900, maxHeight: "90vh", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)" }}>
            
            {/* Modal Control Header */}
            <div style={{ padding: "14px 20px", background: "#0f172a", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>📄</span>
                <div>
                  <strong style={{ fontSize: 14, display: "block" }}>Preview Berita Acara Visual Inspeksi MTU</strong>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>Formulir Berita Acara Inspeksi Fisik Material Persediaan, Cadang, dan ATTB</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  style={{ ...sty.btn("primary", "sm"), background: "#10b981", borderColor: "#059669", fontWeight: 800, padding: "6px 16px" }}
                  onClick={handleTriggerPrint}
                >
                  🖨️ Cetak / Download PDF
                </button>
                <button
                  style={{ ...sty.btn("ghost", "sm"), color: "#94a3b8" }}
                  onClick={() => setPrintModal(false)}
                >
                  ✕ Tutup
                </button>
              </div>
            </div>

            {/* Modal Body: Form Edit Header BA & Live Document Preview */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20, background: C.bg || "#f8fafc" }}>
              
              {/* Form Input Header BA */}
              <div style={{ background: C.surface || "#ffffff", borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${C.border || "#e2e8f0"}` }}>
                <h4 style={{ fontSize: 12, fontWeight: 800, color: C.accent || "#1e3a8a", margin: "0 0 12px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  ⚙️ Pengaturan Header & Penandatangan Berita Acara
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted || "#64748b", display: "block", marginBottom: 2 }}>No. Dokumen BA</label>
                    <input style={{ ...sty.input, fontSize: 11, padding: "4px 8px" }} value={baNoDokumen} onChange={e => setBaNoDokumen(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted || "#64748b", display: "block", marginBottom: 2 }}>Nama Gudang</label>
                    <input style={{ ...sty.input, fontSize: 11, padding: "4px 8px" }} value={baNamaGudang} onChange={e => setBaNamaGudang(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted || "#64748b", display: "block", marginBottom: 2 }}>No SLoc</label>
                    <input style={{ ...sty.input, fontSize: 11, padding: "4px 8px" }} value={baNoSloc} onChange={e => setBaNoSloc(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted || "#64748b", display: "block", marginBottom: 2 }}>Nama UPT</label>
                    <input style={{ ...sty.input, fontSize: 11, padding: "4px 8px" }} value={baNamaUpt} onChange={e => setBaNamaUpt(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted || "#64748b", display: "block", marginBottom: 2 }}>Pelaksana (Logistik)</label>
                    <input style={{ ...sty.input, fontSize: 11, padding: "4px 8px", marginBottom: 6 }} value={baPelaksanaLogistik} onChange={e => setBaPelaksanaLogistik(e.target.value)} />
                    <SignaturePreviewButton
                      label="TTD Pelaksana Logistik"
                      signatureUrl={baPelaksanaLogistikSig}
                      onOpenModal={() => setActiveSigField("logistik")}
                      onRemove={() => setBaPelaksanaLogistikSig(null)}
                      C={C} sty={sty}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted || "#64748b", display: "block", marginBottom: 2 }}>Pelaksana (Pemeliharaan)</label>
                    <input style={{ ...sty.input, fontSize: 11, padding: "4px 8px", marginBottom: 6 }} value={baPelaksanaPemeliharaan} onChange={e => setBaPelaksanaPemeliharaan(e.target.value)} />
                    <SignaturePreviewButton
                      label="TTD Pelaksana Pemeliharaan"
                      signatureUrl={baPelaksanaPemeliharaanSig}
                      onOpenModal={() => setActiveSigField("pemeliharaan")}
                      onRemove={() => setBaPelaksanaPemeliharaanSig(null)}
                      C={C} sty={sty}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.muted || "#64748b", display: "block", marginBottom: 2 }}>Manager UPT</label>
                    <input style={{ ...sty.input, fontSize: 11, padding: "4px 8px", marginBottom: 6 }} value={baManagerUpt} onChange={e => setBaManagerUpt(e.target.value)} />
                    <SignaturePreviewButton
                      label="TTD Manager UPT"
                      signatureUrl={baManagerUptSig}
                      onOpenModal={() => setActiveSigField("manager")}
                      onRemove={() => setBaManagerUptSig(null)}
                      C={C} sty={sty}
                    />
                  </div>
                </div>
              </div>

              {/* DOKUMEN CETAK BERITA ACARA (Sesuai Format Gambar Sample User) */}
              <div className="ba-print-container" style={{ background: "white", padding: 30, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", color: "#000000", fontFamily: "'Times New Roman', Times, serif" }}>
                
                {/* HALAMAN 1: BERITA ACARA VISUAL INSPEKSI MTU DI GUDANG */}
                <div>
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <h2 style={{ fontSize: 16, fontWeight: "bold", textDecoration: "underline", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      BERITA ACARA VISUAL INSPEKSI MTU DI GUDANG
                    </h2>
                    <div style={{ fontSize: 12, fontStyle: "italic", marginTop: 2 }}>
                      {baNoDokumen}
                    </div>
                  </div>

                  <table style={{ fontSize: 12, border: "none", marginBottom: 16, width: "100%", maxWidth: 450, borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td style={{ width: 120, padding: "2px 0" }}>Tanggal</td>
                        <td style={{ width: 15 }}>:</td>
                        <td style={{ fontWeight: "bold" }}>{baTanggal}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: "2px 0" }}>Nama Gudang</td>
                        <td>:</td>
                        <td style={{ fontWeight: "bold" }}>{baNamaGudang}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: "2px 0" }}>No SLoc</td>
                        <td>:</td>
                        <td style={{ fontWeight: "bold" }}>{baNoSloc}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: "2px 0" }}>Nama UPT</td>
                        <td>:</td>
                        <td style={{ fontWeight: "bold" }}>{baNamaUpt}</td>
                      </tr>
                    </tbody>
                  </table>

                  <p style={{ fontSize: 11, lineHeight: 1.5, textAlign: "justify", marginBottom: 14 }}>
                    Bahwa sesuai tanggal dan lokasi gudang tersebut diatas, telah dilaksanakan Pemeriksaan Kondisi Visual terhadap MTU yang berada di Gudang oleh Bidang Logistik dan Pemeliharaan, Sebagai Berikut:
                  </p>

                  {/* TABEL HASIL INSPEKSI MTU */}
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", border: "1.5px solid #000000", marginBottom: 20 }}>
                    <thead>
                      <tr style={{ textAlign: "center", background: "#f1f5f9" }}>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "10%" }}>Jenis MTU</th>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "12%" }}>Nomor Katalog Material</th>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "22%" }}>Material Description</th>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "8%" }}>Base Unit Of Measure</th>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "7%" }}>Quantity</th>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "10%" }}>Jenis Peruntukan</th>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "13%" }}>Estimasi Bulan & Tahun Awal Penyimpanan di Gudang</th>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "8%" }}>Kondisi Visual</th>
                        <th style={{ border: "1px solid #000000", padding: 6, width: "10%" }}>Keterangan (jika terdapat info tambahan)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baData.items.map((item, idx) => (
                        <tr key={idx} style={{ textAlign: "center" }}>
                          <td style={{ border: "1px solid #000000", padding: 6, fontWeight: "bold" }}>{item.jenisMtu || "CT"}</td>
                          <td style={{ border: "1px solid #000000", padding: 6 }}>{item.noKatalog}</td>
                          <td style={{ border: "1px solid #000000", padding: 6, textAlign: "left" }}>{item.namaBarang}</td>
                          <td style={{ border: "1px solid #000000", padding: 6 }}>{item.satuan || "BH"}</td>
                          <td style={{ border: "1px solid #000000", padding: 6, fontWeight: "bold" }}>{item.qtyStok}</td>
                          <td style={{ border: "1px solid #000000", padding: 6 }}>{item.jenisPeruntukan || "SPARE"}</td>
                          <td style={{ border: "1px solid #000000", padding: 6 }}>{item.estimasiPenyimpanan || "2 Tahun"}</td>
                          <td style={{ border: "1px solid #000000", padding: 6, fontWeight: "bold" }}>{item.kondisi}</td>
                          <td style={{ border: "1px solid #000000", padding: 6, textAlign: "left", fontSize: 10 }}>{item.keteranganVisual || "BAIK"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p style={{ fontSize: 11, marginBottom: 30 }}>
                    Demikian Berita Acara ini kami buat, agar dapat dipergunakan sebagaimana mestinya
                  </p>

                  {/* PENANDATANGAN 3 PIHAK */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, textAlign: "center", fontSize: 11, marginBottom: 40 }}>
                    <div>
                      <div style={{ fontWeight: "bold" }}>Pelaksana</div>
                      <div style={{ fontSize: 10, color: "#334155" }}>(Bidang Logistik)</div>
                      <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {baPelaksanaLogistikSig ? (
                          <img src={baPelaksanaLogistikSig} alt="TTD Logistik" style={{ maxHeight: 58, maxWidth: 140, objectFit: "contain" }} />
                        ) : (
                          <div style={{ height: 50 }} />
                        )}
                      </div>
                      <div style={{ fontWeight: "bold", textDecoration: "underline" }}>{baPelaksanaLogistik}</div>
                    </div>

                    <div>
                      <div style={{ fontWeight: "bold" }}>Pelaksana</div>
                      <div style={{ fontSize: 10, color: "#334155" }}>(Bidang Pemeliharaan)</div>
                      <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {baPelaksanaPemeliharaanSig ? (
                          <img src={baPelaksanaPemeliharaanSig} alt="TTD Pemeliharaan" style={{ maxHeight: 58, maxWidth: 140, objectFit: "contain" }} />
                        ) : (
                          <div style={{ height: 50 }} />
                        )}
                      </div>
                      <div style={{ fontWeight: "bold", textDecoration: "underline" }}>{baPelaksanaPemeliharaan}</div>
                    </div>
                  </div>

                  <div style={{ textAlign: "center", fontSize: 11 }}>
                    <div style={{ fontWeight: "bold" }}>Mengetahui</div>
                    <div style={{ fontWeight: "bold" }}>MANAGER UPT</div>
                    <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {baManagerUptSig ? (
                        <img src={baManagerUptSig} alt="TTD Manager" style={{ maxHeight: 58, maxWidth: 140, objectFit: "contain" }} />
                      ) : (
                        <div style={{ height: 50 }} />
                      )}
                    </div>
                    <div style={{ fontWeight: "bold", textDecoration: "underline" }}>{baManagerUpt}</div>
                  </div>
                </div>

                {/* HALAMAN 2: LAMPIRAN DOKUMENTASI FOTO (Grid 3 Kolom) */}
                {baData.allFotos && baData.allFotos.length > 0 && (
                  <div className="page-break" style={{ marginTop: 40, paddingTop: 20 }}>
                    {/* Header Dokumen Lampiran */}
                    <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", border: "1.5px solid #000000", marginBottom: 14 }}>
                      <tbody>
                        <tr>
                          <td rowSpan={2} style={{ border: "1px solid #000000", padding: 6, fontWeight: "bold", textAlign: "center", fontSize: 11, width: "60%" }}>
                            FORMULIR BERITA ACARA INSPEKSI FISIK MATERIAL PERSEDIAAN, CADANG, DAN ATTB
                          </td>
                          <td style={{ border: "1px solid #000000", padding: 4, width: "15%", fontWeight: "bold" }}>No. Dokumen</td>
                          <td style={{ border: "1px solid #000000", padding: 4, width: "25%" }}>{baNoDokumen}</td>
                        </tr>
                        <tr>
                          <td style={{ border: "1px solid #000000", padding: 4, fontWeight: "bold" }}>Tanggal</td>
                          <td style={{ border: "1px solid #000000", padding: 4 }}>{baTanggal}</td>
                        </tr>
                      </tbody>
                    </table>

                    <h3 style={{ fontSize: 13, fontWeight: "bold", textAlign: "center", margin: "14px 0", textTransform: "uppercase" }}>
                      LAMPIRAN DOKUMENTASI
                    </h3>

                    {/* Grid Foto 3 Kolom */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, border: "1.5px solid #000000", padding: 10 }}>
                      {baData.allFotos.map((foto, idx) => (
                        <div key={idx} style={{ border: "1px solid #cbd5e1", borderRadius: 4, overflow: "hidden", background: "#f8fafc", padding: 4 }}>
                          <img src={foto.url} alt={`Dokumentasi ${idx + 1}`} style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                          <div style={{ fontSize: 9, textAlign: "center", marginTop: 4, color: "#334155", fontWeight: "bold" }}>
                            Foto #{idx + 1} ({foto.name})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PAD TANDA TANGAN DIGITAL */}
      <SignaturePadModal
        isOpen={Boolean(activeSigField)}
        onClose={() => setActiveSigField(null)}
        onSave={(dataUrl) => {
          if (activeSigField === "logistik") setBaPelaksanaLogistikSig(dataUrl);
          else if (activeSigField === "pemeliharaan") setBaPelaksanaPemeliharaanSig(dataUrl);
          else if (activeSigField === "manager") setBaManagerUptSig(dataUrl);
        }}
        title={`Tanda Tangan Digital — ${
          activeSigField === "logistik"
            ? "Pelaksana Logistik"
            : activeSigField === "pemeliharaan"
            ? "Pelaksana Pemeliharaan"
            : "Manager UPT"
        }`}
        subtitle="Coret tanda tangan Anda di bawah ini untuk disisipkan ke Berita Acara cetak"
        initialSignature={
          activeSigField === "logistik"
            ? baPelaksanaLogistikSig
            : activeSigField === "pemeliharaan"
            ? baPelaksanaPemeliharaanSig
            : baManagerUptSig
        }
        C={C} sty={sty} isMobile={isMobile}
      />
    </div>
  );
}
=======
  async function printBa(batch) {
    const paths = batch?.items?.flatMap(it => it.photoPaths || []) || [];
    const urls = paths.length ? await loadInspectionPhotoUrls(paths) : {};
    setBatchPhotoUrls(urls);
    setPrintBatch(batch);
    setTimeout(() => window.print(), 50);
  }

  const tabs = [
    { id: "form", label: "Buat Inspeksi" },
    { id: "history", label: "History BA" },
  ];

  const progressPct = items.length
    ? Math.round((items.length / MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH) * 100)
    : 0;

  return (
    <div className="operations-page inspection-page" style={{ display: "grid", gap: 16 }}>
      <style>{`@media screen { .inspection-ba { display:none; } } @media print { body * { visibility:hidden; } .inspection-ba, .inspection-ba * { visibility:visible; } .inspection-ba { position:absolute; inset:0; padding:20px; color:#111; background:#fff; font-family:Georgia,serif; } .no-print { display:none !important; } }`}</style>

      <div className="no-print">
        <OperationsHero
          eyebrow="Material Assurance"
          title="Inspeksi Material Cadang"
          description="Satu Berita Acara memuat 1–10 material Cadang dari satu gudang. Identitas material terkunci, dan riwayat bersifat append-only."
          scope={currentUser?.upt || "UPT Surabaya"}
          metrics={[
            { label: "BA Tersimpan", value: materialInspectionBatches.length },
            { label: "Material di Form", value: items.length },
            { label: "Lengkap", value: `${completeCount}/${items.length}` },
            { label: writer ? "Akses Tulis" : "Akses Baca", value: writer ? "ADMIN/TL" : "VIEWER" },
          ]}
        />
      </div>

      {/* Sub-tab switch — segmented control navy aktif */}
      <div className="no-print" style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 6,
        background: C.bg,
        borderRadius: 12,
        padding: 5,
        border: `1.5px solid ${C.border}`,
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            ...(isMobile ? {} : { flex: 1 }),
            padding: "10px 16px",
            minHeight: isMobile ? 44 : undefined,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 800,
            background: view === t.id ? "linear-gradient(180deg,#2f6bf0,#1d4ed8)" : "transparent",
            color: view === t.id ? "#ffffff" : C.text,
            boxShadow: view === t.id ? "0 3px 10px rgba(29,78,216,0.35)" : "none",
            whiteSpace: isMobile ? "normal" : "nowrap",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}>
            <ClipboardText size={16} weight={view === t.id ? "fill" : "regular"} />
            {t.label}
          </button>
        ))}
      </div>

      {view === "form" && writer && (
        <div className="no-print" style={{ ...sty.card, display: "grid", gap: 18 }}>
          {/* Langkah 1 — Identitas BA */}
          <StepHeader n={1} title="Identitas Berita Acara" C={C} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <ChipReadonly label="Tanggal" value={today} C={C} />
            <ChipReadonly label="UPT" value={UPT_SBY} C={C} />
            <ChipReadonly label="Gudang" value={lockedGudang?.nama || "Terkunci otomatis"} muted={!lockedGudang} C={C} />
            <ChipReadonly label="Nomor BA" value={lastSavedBa?.nomorBa || "Otomatis saat simpan"} muted={!lastSavedBa} C={C} />
            <ChipReadonly label="Manager UPT" value={MANAGER_UPT_SBY} C={C} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <label style={labelStyle(C)}>Pelaksana Logistik *
              <input style={{ ...sty.input, marginTop: 4 }} value={pelaksanaLogistik} onChange={e => setPelaksanaLogistik(e.target.value)} placeholder="Nama pelaksana logistik" />
            </label>
            <label style={labelStyle(C)}>Pelaksara Pemeliharaan *
              <input style={{ ...sty.input, marginTop: 4 }} value={pelaksaraPemeliharaan} onChange={e => setPelaksaraPemeliharaan(e.target.value)} placeholder="Nama pelaksara pemeliharaan" />
            </label>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Field bertanda * wajib diisi sebelum menyimpan BA.</p>

          {/* Langkah 2 — Pilih material */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "grid", gap: 12 }}>
            <StepHeader n={2} title="Pilih Material Cadang" C={C} trailing={
              <span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>
                Material {items.length}/{MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH}
              </span>
            } />
            {items.length > 0 && (
              <div style={{ height: 6, borderRadius: 999, background: C.border, overflow: "hidden" }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: "linear-gradient(90deg,#2f6bf0,#1d4ed8)", transition: "width .2s" }} />
              </div>
            )}
            <div className="approval-actions" style={{ justifyContent: "flex-start" }}>
              <button
                className="approval-btn--primary"
                disabled={items.length >= MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH}
                onClick={() => setPickerOpen(v => !v)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Plus size={16} weight="bold" /> {pickerOpen ? "Tutup Pemilihan" : "Tambah Material Cadang"}
              </button>
            </div>
            {items.length >= MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH && (
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Maksimal {MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH} material per BA tercapai.</p>
            )}

            {pickerOpen && (
              <div style={{
                border: `1.5px solid ${C.accent}40`,
                borderRadius: 12,
                padding: 14,
                display: "grid",
                gap: 10,
                background: C.surface,
                boxShadow: "0 8px 24px -10px rgba(29,78,216,0.25)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 10, paddingLeft: 12, background: C.bg }}>
                  <MagnifyingGlass size={16} color={C.muted} />
                  <input
                    ref={pickerSearchRef}
                    style={{ ...sty.input, border: "none", background: "transparent", paddingLeft: 0, flex: 1 }}
                    placeholder={lockedGudang ? `Cari material Cadang di ${lockedGudang.nama}…` : "Cari material Cadang…"}
                    value={pickerQuery}
                    onChange={e => setPickerQuery(e.target.value)}
                  />
                </div>
                {lockedGudang && (
                  <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                    Gudang terkunci: <b style={{ color: C.text }}>{lockedGudang.nama}</b> — material dari gudang lain tidak bisa dipilih.
                  </p>
                )}
                {pickerResults.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>
                    <Package size={32} weight="thin" style={{ opacity: 0.5 }} />
                    <p style={{ margin: "8px 0 0" }}>Tidak ada material Cadang tersedia{lockedGudang ? ` di gudang ${lockedGudang.nama}` : ""}.</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                    {pickerResults.map(opt => (
                      <button key={opt.stock.id} onClick={() => addItem(opt.stock.id)} style={{
                        textAlign: "left", padding: "10px 12px", borderRadius: 10,
                        border: `1px solid ${C.border}`, background: "transparent", color: C.text,
                        cursor: "pointer", display: "grid", gap: 2, transition: "border-color .12s, background .12s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = `${C.accent}0d`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "transparent"; }}
                      >
                        <strong style={{ fontSize: 13 }}>{opt.katalog?.katalog || opt.katalog?.noKatalog || "—"}</strong>
                        <span style={{ fontSize: 12, color: C.muted }}>
                          {opt.katalog?.name || opt.stock.name || "Material"} · {opt.lokasi?.kode || opt.lokasi?.nama || "—"} · {opt.stock.qty || 0} {opt.katalog?.satuan || opt.stock.satuan || "BH"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {items.length === 0 ? (
              <div style={{
                border: `1.5px dashed ${C.border}`, borderRadius: 14, padding: isMobile ? 28 : 40,
                textAlign: "center", display: "grid", gap: 14, justifyItems: "center",
              }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.bg, display: "grid", placeItems: "center", color: C.accent }}>
                  <Stack size={32} weight="thin" />
                </div>
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Belum ada material</h3>
                  <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Pilih material Cadang dari stok untuk mulai inspeksi.</p>
                </div>
                <div className="approval-actions" style={{ justifyContent: "center" }}>
                  <button className="approval-btn--primary" onClick={() => setPickerOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Plus size={16} weight="bold" /> Tambah Material Cadang
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <StepHeader n={3} title="Isi Hasil Inspeksi per Material" C={C} trailing={
                  <span style={{ fontSize: 12, color: C.muted }}>
                    {completeCount === items.length ? "Semua lengkap" : (completeCount + "/" + items.length + " lengkap — klik material untuk membuka")}
                  </span>
                } />
                {items.map((item, index) => (
                  <ItemCard
                    key={item.stockId}
                    item={item}
                    index={index}
                    expanded={expandedItemIndex === index}
                    isMobile={isMobile}
                    C={C}
                    sty={sty}
                    onToggle={() => toggleItem(index)}
                    onUpdate={patch => updateItem(index, patch)}
                    onChecklist={(k, v) => updateItemChecklist(index, k, v)}
                    onAddPhotos={files => addPhotos(index, files)}
                    onRemovePhoto={pi => removePhoto(index, pi)}
                    onRemove={() => removeItem(index)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Langkah 4 — Simpan */}
          <div style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 4,
            paddingTop: 16,
            borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ display: "grid", gap: 2, minWidth: 0, flex: "1 1 auto" }}>
              <StepHeader n={4} title="Simpan Berita Acara" C={C} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, paddingLeft: 36 }}>
                {items.length} material · {items.length && completeCount === items.length ? "siap disimpan" : `${completeCount}/${items.length || 0} lengkap`}
              </span>
              <span style={{ fontSize: 12, color: C.muted, paddingLeft: 36 }}>
                {formInvalid ? "Lengkapi pelaksana & dua foto per material sebelum simpan." : "Semua materi lengkap, siap membuat BA."}
              </span>
            </div>
            <div className="approval-actions" style={{
              flex: isMobile ? "1 1 auto" : "0 0 auto",
              justifyContent: isMobile ? "stretch" : "flex-end",
              alignSelf: isMobile ? "stretch" : "center",
              margin: 0,
            }}>
              <button
                type="button"
                className="approval-btn--primary"
                disabled={saving || formInvalid}
                onClick={saveBatch}
              >
                <CheckCircle size={16} weight="fill" aria-hidden="true" />
                {saving ? "Menyimpan…" : "Simpan BA Inspeksi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "form" && !writer && (
        <div className="no-print" style={{ ...sty.card, textAlign: "center", color: C.muted, fontSize: 13 }}>
          Akses baca saja. Hanya ADMIN/TL yang dapat membuat Berita Acara inspeksi.
        </div>
      )}

      {view === "history" && (
        <div className="no-print" style={{ ...sty.card, display: "grid", gap: 12 }}>
          <StepHeader n={1} title="Riwayat Berita Acara" C={C} />
          {materialInspectionBatches.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Belum ada BA tersimpan.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
              {materialInspectionBatches.map(batch => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  expanded={expandedBatchId === batch.id}
                  photoUrls={batchPhotoUrls}
                  isMobile={isMobile}
                  C={C}
                  sty={sty}
                  onToggle={() => setExpandedBatchId(id => (id === batch.id ? null : batch.id))}
                  onPrint={() => printBa(batch)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {printBatch && (
        <article className="inspection-ba">
          <h2 style={{ textAlign: "center", marginBottom: 2, fontSize: 18 }}>BERITA ACARA INSPEKSI MATERIAL CADANG</h2>
          <p style={{ textAlign: "center", marginTop: 0, fontSize: 13 }}>Nomor: {printBatch.nomorBa || "—"}</p>
          <p style={{ fontSize: 13 }}>
            Pada tanggal {printBatch.tanggal || "—"}, telah dilakukan inspeksi material cadang di Gudang {printBatch.namaGudang || printBatch.gudangId || "—"} ({printBatch.namaUpt || printBatch.uptId || "—"}).
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}>
            <thead>
              <tr>
                {["No", "Nomor Katalog", "Nama Material", "Lokasi", "Jumlah", "Kondisi", "Kelayakan", "Keterangan"].map(h => (
                  <th key={h} style={{ border: "1px solid #222", padding: 6, textAlign: "left", background: "#eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(printBatch.items || []).map((it, i) => (
                <tr key={it.id || i}>
                  <td style={{ border: "1px solid #222", padding: 6 }}>{i + 1}</td>
                  <td style={{ border: "1px solid #222", padding: 6 }}>{it.noKatalog || "—"}</td>
                  <td style={{ border: "1px solid #222", padding: 6 }}>{it.namaBarang || "—"}</td>
                  <td style={{ border: "1px solid #222", padding: 6 }}>{it.lokasiNama || "—"}</td>
                  <td style={{ border: "1px solid #222", padding: 6 }}>{it.qtyStok} {it.satuan || ""}</td>
                  <td style={{ border: "1px solid #222", padding: 6 }}>{it.kondisi || "—"}</td>
                  <td style={{ border: "1px solid #222", padding: 6 }}>{it.statusKelayakan || "—"}</td>
                  <td style={{ border: "1px solid #222", padding: 6 }}>{it.keteranganVisual || it.catatan || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {printBatch.items?.some(it => it.photoPaths?.length) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
              {printBatch.items.flatMap((it, i) => (it.photoPaths || []).map((p, pi) => (
                <figure key={`${i}-${pi}`} style={{ margin: 0 }}>
                  {batchPhotoUrls[p] ? <img src={batchPhotoUrls[p]} alt={`Foto ${pi + 1}`} style={{ width: 180, maxHeight: 150, objectFit: "cover", border: "1px solid #222" }} /> : null}
                  <figcaption style={{ fontSize: 10, textAlign: "center" }}>{it.namaBarang} #{pi + 1}</figcaption>
                </figure>
              )))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 45, textAlign: "center", fontSize: 12 }}>
            <div>Pelaksana Logistik<br /><br /><br /><b>{printBatch.pelaksanaLogistik || "—"}</b></div>
            <div>Pelaksara Pemeliharaan<br /><br /><br /><b>{printBatch.pelaksaraPemeliharaan || "—"}</b></div>
            <div>Manager UPT<br /><br /><br /><b>{printBatch.managerUpt || "—"}</b></div>
          </div>
        </article>
      )}
    </div>
  );
}

function StepHeader({ n, title, C, trailing }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        width: 26, height: 26, borderRadius: "50%", flex: "0 0 auto",
        background: "linear-gradient(180deg,#2f6bf0,#1d4ed8)", color: "#fff",
        display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900,
      }}>{n}</span>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.text }}>{title}</h3>
      {trailing && <span style={{ marginLeft: "auto" }}>{trailing}</span>}
    </div>
  );
}

function ChipReadonly({ label, value, muted, C }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px",
      background: C.surface, display: "grid", gap: 2,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: muted ? C.muted : C.text }}>{value}</span>
    </div>
  );
}

function ItemCard({ item, index, expanded, isMobile, C, sty, onToggle, onUpdate, onChecklist, onAddPhotos, onRemovePhoto, onRemove }) {
  const previews = usePhotoPreviews(item.photos);
  const complete = itemComplete(item);
  return (
    <div style={{
      border: `1.5px solid ${expanded ? C.accent : C.border}`, borderRadius: 12, overflow: "hidden",
      boxShadow: expanded ? "0 6px 18px -8px rgba(29,78,216,0.25)" : "none",
      transition: "border-color .12s, box-shadow .12s",
    }}>
      {/* Header kartu (klik → toggle accordion) */}
      <button onClick={onToggle} style={{
        width: "100%", textAlign: "left", border: "none", background: "transparent",
        color: C.text, cursor: "pointer", padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{item.namaBarang || "Material"}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {item.noKatalog || "—"} · {item.lokasiNama || "—"} · {item.qtyStok} {item.satuan}
          </div>
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 800,
          padding: "3px 10px", borderRadius: 999,
          background: complete ? "#dcfce7" : "#fef3c7", color: complete ? C.green : C.yellow,
          boxShadow: `inset 0 0 0 1px ${complete ? C.green : C.yellow}33`,
        }}>
          {complete ? <CheckCircle size={14} weight="fill" /> : <Camera size={14} weight="fill" />}
          {complete ? "Lengkap" : `Foto ${item.photos.length}/2`}
        </span>
        <CaretDown
          size={18}
          color={C.muted}
          style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}
        />
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 14, display: "grid", gap: 14 }}>
          {/* 3.1 — Identitas terkunci + Hapus material */}
          <MicroStep n="3.1" title="Identitas material (terkunci)" C={C}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <ChipReadonly label="No. Katalog" value={item.noKatalog || "—"} C={C} />
              <ChipReadonly label="Lokasi" value={item.lokasiNama || "—"} C={C} />
              <ChipReadonly label="Qty" value={`${item.qtyStok} ${item.satuan}`} C={C} />
              <span style={{ flex: 1 }} />
              <button
                className="approval-btn--cancel"
                onClick={onRemove}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
              >
                <Trash size={14} /> Hapus material
              </button>
            </div>
          </MicroStep>

          {/* 3.2 — Penilaian */}
          <MicroStep n="3.2" title="Penilaian" C={C}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <label style={labelStyle(C)}>Kondisi
                <select style={{ ...sty.select, marginTop: 4 }} value={item.kondisi} onChange={e => onUpdate({ kondisi: e.target.value })}>
                  {KONDISI.map(v => <option key={v}>{v}</option>)}
                </select>
              </label>
              <label style={labelStyle(C)}>Kelayakan
                <select style={{ ...sty.select, marginTop: 4 }} value={item.statusKelayakan} onChange={e => onUpdate({ statusKelayakan: e.target.value })}>
                  {KELAYAKAN.map(v => <option key={v}>{v}</option>)}
                </select>
              </label>
              <label style={labelStyle(C)}>Jenis MTU
                <input style={{ ...sty.input, marginTop: 4 }} value={item.jenisMtu} onChange={e => onUpdate({ jenisMtu: e.target.value })} placeholder="Contoh: MTU 1 phasa" />
              </label>
            </div>
          </MicroStep>

          {/* 3.3 — Checklist visual (chip toggle) */}
          <MicroStep n="3.3" title="Checklist Visual" C={C}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CHECKLIST_KEYS.map(([key, label]) => {
                const on = item.checklist[key];
                return (
                  <button key={key} type="button" onClick={() => onChecklist(key, !on)} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 12px", minHeight: 36, borderRadius: 999, cursor: "pointer",
                    fontSize: 13, fontWeight: 700, border: `1.5px solid ${on ? C.green : C.border}`,
                    background: on ? "#dcfce7" : "transparent", color: on ? C.green : C.muted,
                    transition: "all .12s",
                  }}>
                    {on ? <CheckCircle size={15} weight="fill" /> : <span style={{ width: 15, height: 15, borderRadius: "50%", border: `1.5px solid ${C.border}`, display: "inline-block" }} />}
                    {label}
                  </button>
                );
              })}
            </div>
          </MicroStep>

          {/* 3.4 — Keterangan + Catatan */}
          <MicroStep n="3.4" title="Keterangan & Catatan" C={C}>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={labelStyle(C)}>Keterangan Visual
                <textarea style={{ ...sty.input, marginTop: 4, minHeight: 56 }} value={item.keteranganVisual} onChange={e => onUpdate({ keteranganVisual: e.target.value })} placeholder="Contoh: cat mengelupas pada body…" />
              </label>
              <label style={labelStyle(C)}>Catatan
                <textarea style={{ ...sty.input, marginTop: 4, minHeight: 56 }} value={item.catatan} onChange={e => onUpdate({ catatan: e.target.value })} placeholder="Catatan tambahan untuk inspeksi ini…" />
              </label>
            </div>
          </MicroStep>

          {/* 3.5 — Foto wajib 2 */}
          <MicroStep n="3.5" title="Foto Inspeksi (wajib tepat 2)" C={C} trailing={
            <span style={{
              fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
              background: complete ? "#dcfce7" : "#fee2e2", color: complete ? C.green : C.red,
              boxShadow: `inset 0 0 0 1px ${complete ? C.green : C.red}33`,
            }}>
              {complete ? "2/2 lengkap" : `${item.photos.length}/2 kurang`}
            </span>
          }>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "120px 120px", gap: 12, justifyItems: "stretch" }}>
              {[0, 1].map(slot => {
                const file = item.photos[slot];
                const url = previews[slot];
                return (
                  <div key={slot} style={{
                    border: `1.5px dashed ${file ? C.green : C.border}`, borderRadius: 10,
                    padding: 8, minHeight: 120, display: "grid", gap: 6, placeItems: "center",
                    background: file ? "#dcfce722" : "transparent", position: "relative",
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>Foto {slot + 1}</span>
                    {url ? (
                      <div style={{ position: "relative" }}>
                        <img src={url} alt={`Foto ${slot + 1}`} style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                        <button onClick={() => onRemovePhoto(slot)} style={{ position: "absolute", top: -8, right: -8, borderRadius: "50%", border: "none", background: "#dc2626", color: "#fff", width: 22, height: 22, fontSize: 13, cursor: "pointer", lineHeight: 1, display: "grid", placeItems: "center" }}>×</button>
                      </div>
                    ) : (
                      <label style={{ display: "grid", gap: 4, justifyItems: "center", cursor: "pointer", color: C.muted }}>
                        <Camera size={22} weight="thin" />
                        <span style={{ fontSize: 11 }}>Tambah foto</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          onChange={e => { onAddPhotos(e.target.files); e.target.value = ""; }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </MicroStep>
        </div>
      )}
    </div>
  );
}

function MicroStep({ n, title, C, trailing, children }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.accent }}>{n}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: ".3px" }}>{title}</span>
        {trailing && <span style={{ marginLeft: "auto" }}>{trailing}</span>}
      </div>
      {children}
    </div>
  );
}

function BatchCard({ batch, expanded, photoUrls, isMobile, C, sty, onToggle, onPrint }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: "grid", gap: 10,
      boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.accent, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ClipboardText size={14} weight="fill" /> {batch.nomorBa || "—"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <MetaChip C={C}>{batch.tanggal || "—"}</MetaChip>
            <MetaChip C={C}>{batch.namaGudang || batch.gudangId || "—"}</MetaChip>
            <MetaChip C={C}>{batch.items?.length || 0} material</MetaChip>
          </div>
        </div>
        <div className="approval-actions approval-actions--compact" style={{ flex: "0 0 auto", alignSelf: "center", margin: 0 }}>
          <button type="button" className="approval-btn--cancel" onClick={onToggle}>
            {expanded ? "Tutup" : "Detail"}
          </button>
          <button type="button" className="approval-btn--cancel" onClick={onPrint}>
            <Printer size={14} aria-hidden="true" /> Cetak BA
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <MetaChip C={C} bold>UPT: {batch.namaUpt || batch.uptId || "—"}</MetaChip>
        <MetaChip C={C}>Logistik: {batch.pelaksanaLogistik || "—"}</MetaChip>
        <MetaChip C={C}>Pemeliharaan: {batch.pelaksaraPemeliharaan || "—"}</MetaChip>
        <MetaChip C={C}>Manager: {batch.managerUpt || "—"}</MetaChip>
      </div>
      {expanded && (batch.items || []).length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          {(batch.items || []).map((it, i) => (
            <div key={it.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 13, display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 800 }}>{it.namaBarang || "Material"}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{it.noKatalog || "—"} · {it.lokasiNama || "—"} · {it.qtyStok} {it.satuan}</div>
              <div style={{ fontSize: 12 }}>Kondisi: <b>{it.kondisi || "—"}</b> · Kelayakan: <b>{it.statusKelayakan || "—"}</b></div>
              {it.keteranganVisual && <div style={{ fontSize: 12, color: C.muted }}>Keterangan: {it.keteranganVisual}</div>}
              {it.photoPaths?.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {it.photoPaths.map((p, pi) => photoUrls[p] ? (
                    <img key={pi} src={photoUrls[p]} alt={`Foto ${pi + 1}`} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                  ) : null)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetaChip({ C, children, bold }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: bold ? 800 : 600,
      background: C.bg, color: bold ? C.text : C.muted, border: `1px solid ${C.border}`,
    }}>{children}</span>
  );
}
