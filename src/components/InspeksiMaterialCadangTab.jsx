import { useEffect, useMemo, useState } from "react";
import { can } from "../lib/perms.js";
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

export function InspeksiMaterialCadangTab({
  stocks = [],
  katalogList = [],
  lokasiList = [],
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
  const [pelaksanaLogistik, setPelaksanaLogistik] = useState(currentUser?.name || "");
  const [pelaksaraPemeliharaan, setPelaksaraPemeliharaan] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSavedBa, setLastSavedBa] = useState(null);
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [batchPhotoUrls, setBatchPhotoUrls] = useState({});
  const [printBatch, setPrintBatch] = useState(null);
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
    setItems(prev => {
      if (prev.length >= MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH) return prev;
      if (prev.some(it => it.stockId === stockId)) return prev;
      return [...prev, emptyItem(opt.stock, opt.katalog, opt.lokasi)];
    });
    setPickerOpen(false);
    setPickerQuery("");
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index));
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
    } finally {
      setSaving(false);
    }
  }

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

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <style>{`@media screen { .inspection-ba { display:none; } } @media print { body * { visibility:hidden; } .inspection-ba, .inspection-ba * { visibility:visible; } .inspection-ba { position:absolute; inset:0; padding:20px; color:#111; background:#fff; font-family:Georgia,serif; } .no-print { display:none !important; } }`}</style>

      <header style={{ ...sty.card, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.accent, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Material Cadang</div>
          <h2 style={{ margin: "3px 0", fontSize: 20 }}>Inspeksi Material Cadang</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>Satu Berita Acara dapat memuat 1–10 material dari satu gudang. Riwayat bersifat append-only.</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: writer ? C.green : C.muted }}>{writer ? "ADMIN/TL dapat membuat inspeksi" : "Akses baca saja"}</span>
      </header>

      {/* Sub-tab switch — pola Maturity (navy gradient active) */}
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
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 800,
            background: view === t.id ? "linear-gradient(180deg,#2f6bf0,#1d4ed8)" : "transparent",
            color: view === t.id ? "#ffffff" : C.text,
            boxShadow: view === t.id ? "0 3px 10px rgba(29,78,216,0.35)" : "none",
            whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      {view === "form" && writer && (
        <div className="no-print" style={{ ...sty.card, display: "grid", gap: 16 }}>
          {/* Header read-only otomatis */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <FieldReadonly label="Tanggal" value={today} C={C} sty={sty} />
            <FieldReadonly label="UPT" value={UPT_SBY} C={C} sty={sty} />
            <FieldReadonly label="Gudang" value={lockedGudang?.nama || "(terkunci otomatis dari material pertama)"} C={C} sty={sty} />
            <FieldReadonly label="Nomor BA" value={lastSavedBa?.nomorBa ? lastSavedBa.nomorBa : "(terisi otomatis saat simpan)"} C={C} sty={sty} />
            <FieldReadonly label="Manager UPT" value={MANAGER_UPT_SBY} C={C} sty={sty} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <label style={sty.label}>Pelaksana Logistik *
              <input style={sty.input} value={pelaksanaLogistik} onChange={e => setPelaksanaLogistik(e.target.value)} />
            </label>
            <label style={sty.label}>Pelaksara Pemeliharaan *
              <input style={sty.input} value={pelaksaraPemeliharaan} onChange={e => setPelaksaraPemeliharaan(e.target.value)} />
            </label>
          </div>

          {/* Daftar material + picker */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Material Diinspeksi ({items.length}/{MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH})</h3>
            <button
              style={sty.btn("primary")}
              disabled={items.length >= MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH}
              onClick={() => setPickerOpen(v => !v)}
            >{pickerOpen ? "Tutup Picker" : "Tambah Material"}</button>
          </div>
          {items.length >= MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH && (
            <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Maksimal {MATERIAL_INSPECTION_MAX_ITEMS_PER_BATCH} material per BA tercapai.</p>
          )}

          {pickerOpen && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
              <input
                style={sty.input}
                placeholder={lockedGudang ? `Cari material Cadang di gudang ${lockedGudang.nama}…` : "Cari material Cadang…"}
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
              />
              {pickerResults.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Tidak ada material Cadang tersedia{lockedGudang ? ` di gudang ${lockedGudang.nama}` : ""}.</p>
              ) : (
                <div style={{ display: "grid", gap: 4, maxHeight: 320, overflowY: "auto" }}>
                  {pickerResults.map(opt => (
                    <button key={opt.stock.id} onClick={() => addItem(opt.stock.id)} style={{
                      textAlign: "left", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                      background: "transparent", color: C.text, cursor: "pointer", fontSize: 13,
                    }}>
                      <strong>{opt.katalog?.katalog || opt.katalog?.noKatalog || "—"}</strong> — {opt.katalog?.name || opt.stock.name || "Material"} · {opt.lokasi?.kode || opt.lokasi?.nama || "—"} · {opt.stock.qty || 0} {opt.katalog?.satuan || opt.stock.satuan || "BH"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Belum ada material dipilih. Klik "Tambah Material" untuk memilih dari stok Cadang.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {items.map((item, index) => (
                <ItemCard
                  key={item.stockId}
                  item={item}
                  index={index}
                  isMobile={isMobile}
                  C={C}
                  sty={sty}
                  onUpdate={patch => updateItem(index, patch)}
                  onChecklist={(k, v) => updateItemChecklist(index, k, v)}
                  onAddPhotos={files => addPhotos(index, files)}
                  onRemovePhoto={pi => removePhoto(index, pi)}
                  onRemove={() => removeItem(index)}
                />
              ))}
            </div>
          )}

          <button style={sty.btn("primary")} disabled={saving || !items.length} onClick={saveBatch}>
            {saving ? "Menyimpan BA…" : "Simpan BA Inspeksi"}
          </button>
        </div>
      )}

      {view === "history" && (
        <div className="no-print" style={{ ...sty.card, display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Riwayat Berita Acara</h3>
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
    </section>
  );
}

function FieldReadonly({ label, value, C, sty }) {
  return (
    <label style={sty.label}>{label}
      <input style={{ ...sty.input, color: C.muted, background: "transparent" }} value={value} readOnly tabIndex={-1} />
    </label>
  );
}

function ItemCard({ item, index, isMobile, C, sty, onUpdate, onChecklist, onAddPhotos, onRemovePhoto, onRemove }) {
  const previews = usePhotoPreviews(item.photos);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 700 }}>{item.namaBarang || "Material"}</div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            {item.noKatalog || "—"} · {item.lokasiNama || "—"} · {item.qtyStok} {item.satuan}
          </div>
        </div>
        <button onClick={onRemove} style={sty.btn("ghost", "sm")}>Remove</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <label style={sty.label}>Kondisi
          <select style={sty.select} value={item.kondisi} onChange={e => onUpdate({ kondisi: e.target.value })}>
            {KONDISI.map(v => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label style={sty.label}>Kelayakan
          <select style={sty.select} value={item.statusKelayakan} onChange={e => onUpdate({ statusKelayakan: e.target.value })}>
            {KELAYAKAN.map(v => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label style={sty.label}>Jenis MTU
          <input style={sty.input} value={item.jenisMtu} onChange={e => onUpdate({ jenisMtu: e.target.value })} />
        </label>
      </div>
      <label style={sty.label}>Keterangan Visual
        <textarea style={{ ...sty.input, minHeight: 56 }} value={item.keteranganVisual} onChange={e => onUpdate({ keteranganVisual: e.target.value })} />
      </label>
      <label style={sty.label}>Catatan
        <textarea style={{ ...sty.input, minHeight: 56 }} value={item.catatan} onChange={e => onUpdate({ catatan: e.target.value })} />
      </label>
      <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
        <legend style={{ fontSize: 12, fontWeight: 700 }}>Checklist Visual</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {CHECKLIST_KEYS.map(([key, label]) => (
            <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={item.checklist[key]} onChange={e => onChecklist(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Foto Inspeksi ({item.photos.length}/{MATERIAL_INSPECTION_MAX_PHOTOS}, wajib tepat 2)</div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={item.photos.length >= MATERIAL_INSPECTION_MAX_PHOTOS}
          onChange={e => { onAddPhotos(e.target.files); e.target.value = ""; }}
          style={sty.input}
        />
        {previews.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {previews.map((url, pi) => url ? (
              <div key={pi} style={{ position: "relative" }}>
                <img src={url} alt={`Foto ${pi + 1}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                <button onClick={() => onRemovePhoto(pi)} style={{ position: "absolute", top: -6, right: -6, borderRadius: "50%", border: "none", background: "#dc2626", color: "#fff", width: 20, height: 20, fontSize: 12, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            ) : null)}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchCard({ batch, expanded, photoUrls, isMobile, C, sty, onToggle, onPrint }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.accent }}>{batch.nomorBa || "—"}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {batch.tanggal || "—"} · {batch.namaGudang || batch.gudangId || "—"} · {batch.items?.length || 0} material
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onToggle} style={sty.btn("ghost", "sm")}>{expanded ? "Tutup" : "Detail"}</button>
          <button onClick={onPrint} style={sty.btn("ghost", "sm")}>Cetak BA</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>
        UPT: {batch.namaUpt || batch.uptId || "—"} · Pelaksana Logistik: {batch.pelaksanaLogistik || "—"} · Pelaksara Pemeliharaan: {batch.pelaksaraPemeliharaan || "—"} · Manager: {batch.managerUpt || "—"}
      </div>
      {expanded && (batch.items || []).length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
          {(batch.items || []).map((it, i) => (
            <div key={it.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700 }}>{it.namaBarang || "Material"}</div>
              <div style={{ color: C.muted }}>{it.noKatalog || "—"} · {it.lokasiNama || "—"} · {it.qtyStok} {it.satuan}</div>
              <div>Kondisi: <b>{it.kondisi || "—"}</b> · Kelayakan: <b>{it.statusKelayakan || "—"}</b></div>
              {it.keteranganVisual && <div>Keterangan: {it.keteranganVisual}</div>}
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
