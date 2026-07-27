import { useEffect, useMemo, useState } from "react";
import { can } from "../lib/perms.js";
import { createMaterialInspection, loadInspectionPhotoUrls, MATERIAL_INSPECTION_MAX_PHOTOS } from "../lib/materialInspectionSync.js";

const KONDISI = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "PERLU_KALIBRASI"];
const KELAYAKAN = ["READY", "MAINTENANCE", "RETEST", "ATTB_RECOMMENDED"];

function initialForm(currentUser) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone:"Asia/Jakarta" });
  return {
    stockId: "", katalogId: "", lokasiId: "", noKatalog: "", namaBarang: "", lokasiNama: "",
    qtyStok: 1, satuan: "BH", jenisMtu: "", kondisi: "BAIK", statusKelayakan: "READY",
    keteranganVisual: "", catatan: "", checklist: { kebersihan:true, bebasKarat:true, bebasBocor:true, kemasanBaik:true },
    finalBa: {
      nomor: "", tanggal: today, namaGudang: "", noSloc: "", namaUpt: currentUser?.upt || "",
      pelaksanaLogistik: currentUser?.name || "", pelaksanaPemeliharaan: "", managerUpt: "",
    },
  };
}

export function InspeksiMaterialCadangTab({
  stocks = [], katalogList = [], lokasiList = [], gudangList = [], materialInspections = [], onInspectionCreated,
  currentUser, rolePerms, C, sty, showToast,
}) {
  const [form, setForm] = useState(() => initialForm(currentUser));
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [photoUrls, setPhotoUrls] = useState({});
  const writer = ["ADMIN", "TL"].includes(currentUser?.role) && can(currentUser, "aksi.buatInspeksiMaterial", rolePerms);

  const stockOptions = useMemo(() => stocks.map(stock => {
    const katalog = katalogList.find(item => item.id === stock.katalogId);
    const lokasi = lokasiList.find(item => item.id === stock.lokasiId);
    return {
      stock,
      katalog,
      lokasi,
      label: `${katalog?.katalog || katalog?.noKatalog || stock.katalogId || "—"} — ${katalog?.name || stock.name || "Material"}`,
    };
  }), [stocks, katalogList, lokasiList]);

  useEffect(() => {
    if (!selectedInspection?.photoPaths?.length) { setPhotoUrls({}); return; }
    let active = true;
    loadInspectionPhotoUrls(selectedInspection.photoPaths).then(urls => { if (active) setPhotoUrls(urls); });
    return () => { active = false; };
  }, [selectedInspection]);

  function updateField(key, value) { setForm(previous => ({ ...previous, [key]: value })); }
  function updateBa(key, value) { setForm(previous => ({ ...previous, finalBa:{ ...previous.finalBa, [key]:value } })); }
  function selectStock(stockId) {
    const selected = stockOptions.find(option => option.stock.id === stockId);
    if (!selected) return;
    const { stock, katalog, lokasi } = selected;
    const gudang = gudangList.find(item => item.id === lokasi?.gudangId);
    setForm(previous => ({
      ...previous,
      stockId: stock.id,
      katalogId: stock.katalogId || null,
      lokasiId: stock.lokasiId || null,
      noKatalog: katalog?.katalog || katalog?.noKatalog || "",
      namaBarang: katalog?.name || stock.name || "",
      lokasiNama: lokasi?.kode || lokasi?.nama || "",
      qtyStok: stock.qty || 1,
      satuan: katalog?.satuan || stock.satuan || "BH",
      finalBa: { ...previous.finalBa, namaGudang: gudang?.nama || previous.finalBa.namaGudang },
    }));
  }
  function addPhotos(event) {
    const files = Array.from(event.target.files || []);
    if (photos.length + files.length > MATERIAL_INSPECTION_MAX_PHOTOS) {
      showToast("Maksimal dua foto inspeksi.", "error");
      return;
    }
    setPhotos(previous => [...previous, ...files]);
    event.target.value = "";
  }
  async function saveInspection() {
    if (!writer) return;
    if (!form.namaBarang.trim()) { showToast("Nama material wajib diisi.", "error"); return; }
    if (!form.finalBa.nomor.trim() || !form.finalBa.pelaksanaLogistik.trim() || !form.finalBa.pelaksanaPemeliharaan.trim() || !form.finalBa.managerUpt.trim()) {
      showToast("Nomor BA dan seluruh penandatangan wajib diisi sebelum simpan.", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMaterialInspection({
        inspection: {
          ...form,
          qtyStok: Number(form.qtyStok) || 1,
          inspectorId: currentUser.id,
          inspectorName: currentUser.name || currentUser.username || "Pemeriksa",
          createdAt: new Date().toISOString(),
        },
        photoFiles: photos,
      });
      onInspectionCreated(created);
      setSelectedInspection(created);
      setPhotos([]);
      setForm(initialForm(currentUser));
      showToast("Inspeksi Material Cadang tersimpan.");
    } catch (error) {
      console.error("Simpan inspeksi material gagal:", error);
      showToast(error.message || "Gagal menyimpan inspeksi material.", "error");
    } finally {
      setSaving(false);
    }
  }
  async function printBa(inspection) {
    const urls = inspection.photoPaths?.length
      ? await loadInspectionPhotoUrls(inspection.photoPaths)
      : {};
    setPhotoUrls(urls);
    setSelectedInspection(inspection);
    setTimeout(() => window.print(), 0);
  }

  return (
    <section style={{ display:"grid", gap:16 }}>
      <style>{`@media screen { .inspection-ba { display:none; } } @media print { body * { visibility:hidden; } .inspection-ba, .inspection-ba * { visibility:visible; } .inspection-ba { position:absolute; inset:0; padding:20px; color:#111; background:#fff; font-family:Georgia,serif; } .no-print { display:none !important; } }`}</style>
      <header style={{ ...sty.card, display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <div><div style={{ color:C.accent, fontSize:12, fontWeight:800, textTransform:"uppercase" }}>Material Cadang</div><h2 style={{ margin:"3px 0", fontSize:20 }}>Inspeksi Material Cadang</h2><p style={{ margin:0, color:C.muted, fontSize:13 }}>Riwayat bersifat append-only; satu inspeksi menghasilkan satu Berita Acara.</p></div>
        <span style={{ fontSize:12, fontWeight:700, color:writer ? C.green : C.muted }}>{writer ? "ADMIN/TL dapat membuat inspeksi" : "Akses baca saja"}</span>
      </header>

      {writer && <div className="no-print" style={{ ...sty.card, display:"grid", gap:12 }}>
        <h3 style={{ margin:0, fontSize:16 }}>Form Inspeksi Baru</h3>
        <label style={sty.label}>Pilih Data Stok
          <select style={sty.select} value={form.stockId} onChange={event => selectStock(event.target.value)}>
            <option value="">Isi manual / pilih material</option>
            {stockOptions.map(option => <option key={option.stock.id} value={option.stock.id}>{option.label}</option>)}
          </select>
        </label>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12 }}>
          <label style={sty.label}>Nomor Katalog<input style={sty.input} value={form.noKatalog} onChange={event => updateField("noKatalog", event.target.value)} /></label>
          <label style={sty.label}>Nama Material *<input style={sty.input} value={form.namaBarang} onChange={event => updateField("namaBarang", event.target.value)} /></label>
          <label style={sty.label}>Lokasi<input style={sty.input} value={form.lokasiNama} onChange={event => updateField("lokasiNama", event.target.value)} /></label>
          <label style={sty.label}>Qty<input style={sty.input} type="number" min="1" value={form.qtyStok} onChange={event => updateField("qtyStok", event.target.value)} /></label>
          <label style={sty.label}>Satuan<input style={sty.input} value={form.satuan} onChange={event => updateField("satuan", event.target.value)} /></label>
          <label style={sty.label}>Jenis MTU<input style={sty.input} value={form.jenisMtu} onChange={event => updateField("jenisMtu", event.target.value)} /></label>
          <label style={sty.label}>Kondisi<select style={sty.select} value={form.kondisi} onChange={event => updateField("kondisi", event.target.value)}>{KONDISI.map(value => <option key={value}>{value}</option>)}</select></label>
          <label style={sty.label}>Kelayakan<select style={sty.select} value={form.statusKelayakan} onChange={event => updateField("statusKelayakan", event.target.value)}>{KELAYAKAN.map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        <label style={sty.label}>Keterangan Visual<textarea style={{ ...sty.input, minHeight:72 }} value={form.keteranganVisual} onChange={event => updateField("keteranganVisual", event.target.value)} /></label>
        <label style={sty.label}>Catatan<textarea style={{ ...sty.input, minHeight:72 }} value={form.catatan} onChange={event => updateField("catatan", event.target.value)} /></label>
        <fieldset style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}><legend style={{ fontSize:12, fontWeight:700 }}>Checklist Visual</legend>
          {Object.entries({ kebersihan:"Kebersihan", bebasKarat:"Bebas karat", bebasBocor:"Bebas bocor", kemasanBaik:"Kemasan baik" }).map(([key, label]) => <label key={key} style={{ display:"inline-flex", alignItems:"center", gap:6, marginRight:16, fontSize:13 }}><input type="checkbox" checked={form.checklist[key]} onChange={event => setForm(previous => ({ ...previous, checklist:{ ...previous.checklist, [key]:event.target.checked } }))} />{label}</label>)}
        </fieldset>
        <label style={sty.label}>Foto Inspeksi (maks. 2, JPG/PNG/WebP, 5 MB/foto)<input style={sty.input} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} /></label>
        {photos.length > 0 && <div style={{ fontSize:12, color:C.muted }}>{photos.map(file => file.name).join(", ")}</div>}
        <fieldset style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}><legend style={{ fontSize:12, fontWeight:700 }}>Header & Penandatangan BA (disimpan final)</legend>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:12 }}>
            {[["nomor","Nomor BA"],["tanggal","Tanggal"],["namaGudang","Nama Gudang"],["noSloc","No. SLoc"],["namaUpt","Nama UPT"],["pelaksanaLogistik","Pelaksana Logistik"],["pelaksanaPemeliharaan","Pelaksana Pemeliharaan"],["managerUpt","Manager UPT"]].map(([key,label]) => <label key={key} style={sty.label}>{label}<input type={key==="tanggal"?"date":"text"} style={sty.input} value={form.finalBa[key]} onChange={event => updateBa(key, event.target.value)} /></label>)}
          </div>
        </fieldset>
        <button style={sty.btn("primary")} disabled={saving} onClick={saveInspection}>{saving ? "Menyimpan inspeksi..." : "Simpan Inspeksi & BA"}</button>
      </div>}

      <div className="no-print" style={{ ...sty.card, overflowX:"auto" }}>
        <h3 style={{ marginTop:0, fontSize:16 }}>Riwayat Inspeksi</h3>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth:700 }}>
          <thead><tr>{["Tanggal","Material","Kondisi","Kelayakan","Pemeriksa","BA"].map(label => <th key={label} style={{ textAlign:"left", padding:8, fontSize:12, borderBottom:`1px solid ${C.border}` }}>{label}</th>)}</tr></thead>
          <tbody>{materialInspections.length === 0 ? <tr><td colSpan="6" style={{ padding:14, color:C.muted, fontSize:13 }}>Belum ada inspeksi tersimpan.</td></tr> : materialInspections.map(inspection => <tr key={inspection.id}>
            <td style={{ padding:8, fontSize:12 }}>{new Date(inspection.createdAt).toLocaleDateString("id-ID")}</td><td style={{ padding:8, fontSize:13 }}>{inspection.namaBarang || "—"}</td><td style={{ padding:8, fontSize:12 }}>{inspection.kondisi || "—"}</td><td style={{ padding:8, fontSize:12 }}>{inspection.statusKelayakan || "—"}</td><td style={{ padding:8, fontSize:12 }}>{inspection.inspectorName || "—"}</td><td style={{ padding:8 }}><button style={sty.btn("ghost","sm")} onClick={() => printBa(inspection)}>Cetak BA</button></td>
          </tr>)}</tbody>
        </table>
      </div>

      {selectedInspection && <article className="inspection-ba">
        <h2 style={{ textAlign:"center", marginBottom:2, fontSize:18 }}>BERITA ACARA INSPEKSI MATERIAL CADANG</h2>
        <p style={{ textAlign:"center", marginTop:0, fontSize:13 }}>Nomor: {selectedInspection.finalBa?.nomor || "—"}</p>
        <p style={{ fontSize:13 }}>Pada tanggal {selectedInspection.finalBa?.tanggal || "—"}, telah dilakukan inspeksi material berikut.</p>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}><tbody>
          {[["Material",selectedInspection.namaBarang],["Nomor Katalog",selectedInspection.noKatalog],["Lokasi",selectedInspection.lokasiNama],["Jumlah",`${selectedInspection.qtyStok} ${selectedInspection.satuan}`],["Kondisi",selectedInspection.kondisi],["Kelayakan",selectedInspection.statusKelayakan],["Keterangan",selectedInspection.keteranganVisual || "—"]].map(([label,value]) => <tr key={label}><td style={{ border:"1px solid #222", padding:6, width:"32%", fontWeight:700 }}>{label}</td><td style={{ border:"1px solid #222", padding:6 }}>{value}</td></tr>)}
        </tbody></table>
        {selectedInspection.photoPaths?.length > 0 && <div style={{ display:"flex", gap:10, marginTop:14 }}>{selectedInspection.photoPaths.map(path => photoUrls[path] && <img key={path} src={photoUrls[path]} alt="Foto inspeksi" style={{ width:180, maxHeight:150, objectFit:"cover", border:"1px solid #222" }} />)}</div>}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginTop:45, textAlign:"center", fontSize:12 }}><div>Pelaksana Logistik<br/><br/><br/><b>{selectedInspection.finalBa?.pelaksanaLogistik || "—"}</b></div><div>Pelaksana Pemeliharaan<br/><br/><br/><b>{selectedInspection.finalBa?.pelaksanaPemeliharaan || "—"}</b></div><div>Manager UPT<br/><br/><br/><b>{selectedInspection.finalBa?.managerUpt || "—"}</b></div></div>
      </article>}
    </section>
  );
}
