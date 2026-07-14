// Item navigasi sidebar reguler. Dipisah dari App.jsx agar pola visual sidebar
// konsisten dan perubahan polish berikutnya tidak terus membesarkan entry utama.
export function SidebarNavItem({ item, active, isMobile, collapsed=false, onClick }) {
  const isApproval = item.id === "approval";
  return (
    <button
      className={`sidebar-nav-item${active ? " is-active" : ""}`}
      style={{minHeight:isMobile?44:undefined}}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
    >
      <span className="sidebar-nav-item__icon">{item.icon}</span>
      {!collapsed && <span className="sidebar-nav-item__label">{item.label}</span>}
      {item.badge>0 && (
        <span className={`sidebar-nav-item__badge${isApproval ? " is-pending" : ""}${collapsed ? " is-compact" : ""}`}>
          {item.badge}
        </span>
      )}
    </button>
  );
}
