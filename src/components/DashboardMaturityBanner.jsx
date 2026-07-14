export function DashboardMaturityBanner({maturity, levelLabel, warehouse, canAssess, onAssess, formatDate}) {
  return (
    <section className="dashboard-maturity" aria-label="Maturity Level Gudang">
      <div className="dashboard-maturity__copy">
        <span>Maturity Level UPT</span>
        <strong>{maturity ? `Level ${maturity.level}` : "Belum dinilai"}</strong>
        <small>{maturity ? `${levelLabel} · asesmen ${formatDate(maturity.tanggalAsesmen)}` : "Belum ada asesmen maturity untuk unit ini"}</small>
      </div>
      <div className="dashboard-maturity__unit">
        <span>Lingkup</span>
        <strong>{warehouse}</strong>
      </div>
      {canAssess && <button onClick={onAssess}>Perbarui asesmen</button>}
    </section>
  );
}
