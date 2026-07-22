export function LightBlue() {
  const nav = [
    { icon: "⊞", label: "Tableau de bord", active: true },
    { icon: "👥", label: "Utilisateurs", active: false },
    { icon: "💳", label: "Abonnements", active: false },
    { icon: "💰", label: "Paiements", active: false },
    { icon: "🎓", label: "Cours", active: false },
    { icon: "📂", label: "Catégories", active: false },
    { icon: "🔔", label: "Notifications", active: false },
    { icon: "⚙️", label: "Plans", active: false },
  ];

  const stats = [
    { label: "Utilisateurs actifs", value: "1 248", delta: "+12%", up: true },
    { label: "Abonnements VIP", value: "342", delta: "+5%", up: true },
    { label: "Revenus du mois", value: "48 600 DA", delta: "+8%", up: true },
    { label: "Paiements en attente", value: "18", delta: "-3", up: false },
  ];

  const rows = [
    { name: "Ahmed Benali", plan: "VIP", status: "Actif", date: "22 jul 2026", amount: "4 500 DA" },
    { name: "Sara Meziane", plan: "Normal", status: "Actif", date: "21 jul 2026", amount: "1 800 DA" },
    { name: "Karim Oussaid", plan: "VIP", status: "Expiré", date: "15 jul 2026", amount: "4 500 DA" },
    { name: "Nadia Chaker", plan: "Normal", status: "En attente", date: "20 jul 2026", amount: "1 800 DA" },
    { name: "Youcef Hamdi", plan: "VIP", status: "Actif", date: "19 jul 2026", amount: "4 500 DA" },
  ];

  const statusStyle: Record<string, string> = {
    "Actif":       "background:#DCFCE7;color:#15803D;border:1px solid #BBF7D0",
    "Expiré":      "background:#FEE2E2;color:#B91C1C;border:1px solid #FECACA",
    "En attente":  "background:#FEF3C7;color:#92400E;border:1px solid #FDE68A",
  };
  const planStyle: Record<string, string> = {
    "VIP":    "background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE",
    "Normal": "background:#F3F4F6;color:#6B7280;border:1px solid #E5E7EB",
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", fontFamily:"'Inter','Segoe UI',sans-serif", background:"#F8FAFC", fontSize:"13px" }}>
      {/* Sidebar */}
      <div style={{ width:"220px", background:"#FFFFFF", borderRight:"1px solid #E5E7EB", display:"flex", flexDirection:"column", flexShrink:0 }}>
        {/* Brand */}
        <div style={{ padding:"20px 16px 16px", borderBottom:"1px solid #F1F5F9" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
            <div style={{ width:"32px", height:"32px", borderRadius:"8px", background:"#2563EB", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:"14px" }}>G</div>
            <div>
              <div style={{ fontWeight:700, fontSize:"13px", color:"#111827", letterSpacing:"-0.01em" }}>GAB School</div>
              <div style={{ fontSize:"11px", color:"#9CA3AF", marginTop:"1px" }}>Administration</div>
            </div>
          </div>
        </div>
        {/* Nav */}
        <div style={{ flex:1, padding:"10px 8px", display:"flex", flexDirection:"column", gap:"2px" }}>
          <div style={{ fontSize:"10px", fontWeight:600, color:"#9CA3AF", letterSpacing:"0.07em", textTransform:"uppercase", padding:"8px 8px 4px" }}>Menu principal</div>
          {nav.map(n => (
            <div key={n.label} style={{
              display:"flex", alignItems:"center", gap:"9px",
              padding:"7px 10px", borderRadius:"7px", cursor:"pointer",
              background: n.active ? "#EFF6FF" : "transparent",
              color: n.active ? "#1D4ED8" : "#6B7280",
              fontWeight: n.active ? 600 : 500,
              fontSize:"12.5px",
              position:"relative",
            }}>
              {n.active && <div style={{ position:"absolute", left:0, top:"6px", bottom:"6px", width:"3px", background:"#2563EB", borderRadius:"0 3px 3px 0" }} />}
              <span style={{ fontSize:"14px", marginLeft: n.active ? "3px" : "0" }}>{n.icon}</span>
              {n.label}
            </div>
          ))}
        </div>
        {/* User footer */}
        <div style={{ borderTop:"1px solid #F1F5F9", padding:"12px 14px", display:"flex", alignItems:"center", gap:"9px" }}>
          <div style={{ width:"30px", height:"30px", borderRadius:"50%", background:"#DBEAFE", display:"flex", alignItems:"center", justifyContent:"center", color:"#1D4ED8", fontWeight:700, fontSize:"12px", flexShrink:0 }}>A</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:"12px", fontWeight:600, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>Admin</div>
            <div style={{ fontSize:"11px", color:"#9CA3AF" }}>Super admin</div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ height:"56px", background:"#FFFFFF", borderBottom:"1px solid #E5E7EB", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:"16px", color:"#111827" }}>Tableau de bord</div>
            <div style={{ fontSize:"11px", color:"#9CA3AF" }}>Mardi 22 juillet 2026</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <div style={{ padding:"0 14px", height:"34px", borderRadius:"7px", border:"1px solid #E5E7EB", background:"#F9FAFB", display:"flex", alignItems:"center", gap:"7px", color:"#6B7280", fontSize:"12.5px" }}>
              🔍 <span>Rechercher…</span>
            </div>
            <button style={{ padding:"0 16px", height:"34px", borderRadius:"7px", background:"#F97316", color:"#fff", border:"none", fontWeight:600, fontSize:"12.5px", cursor:"pointer", display:"flex", alignItems:"center", gap:"6px" }}>
              ＋ Ajouter
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:"24px", overflow:"auto" }}>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"14px", marginBottom:"24px" }}>
            {stats.map(s => (
              <div key={s.label} style={{ background:"#FFFFFF", border:"1px solid #E5E7EB", borderRadius:"10px", padding:"16px 18px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize:"11px", color:"#6B7280", fontWeight:500, marginBottom:"8px" }}>{s.label}</div>
                <div style={{ fontSize:"22px", fontWeight:700, color:"#111827", letterSpacing:"-0.02em" }}>{s.value}</div>
                <div style={{ marginTop:"6px", fontSize:"11px", color: s.up ? "#15803D" : "#B91C1C", fontWeight:500 }}>{s.delta} ce mois</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ background:"#FFFFFF", border:"1px solid #E5E7EB", borderRadius:"10px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight:600, fontSize:"13.5px", color:"#111827" }}>Derniers paiements</div>
              <div style={{ display:"flex", gap:"6px" }}>
                {["Tous","Actifs","En attente","Expirés"].map((f,i) => (
                  <div key={f} style={{ padding:"4px 10px", borderRadius:"6px", fontSize:"11.5px", fontWeight:500, cursor:"pointer",
                    background: i===0 ? "#EFF6FF" : "transparent",
                    color: i===0 ? "#1D4ED8" : "#6B7280",
                    border: i===0 ? "1px solid #BFDBFE" : "1px solid transparent",
                  }}>{f}</div>
                ))}
              </div>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#F9FAFB" }}>
                  {["Utilisateur","Plan","Statut","Date","Montant","Actions"].map(h => (
                    <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontSize:"10.5px", fontWeight:600, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid #E5E7EB" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name} style={{ background: i%2===0 ? "#FFFFFF" : "#FAFAFA", borderBottom:"1px solid #F1F5F9" }}>
                    <td style={{ padding:"11px 16px", color:"#111827", fontWeight:500 }}>{r.name}</td>
                    <td style={{ padding:"11px 16px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:"999px", fontSize:"11px", fontWeight:600, ...(Object.fromEntries(planStyle[r.plan].split(";").map(e => { const [k,v]=e.split(":"); return [k?.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v?.trim()]; }).filter(e=>e[0]))) }}>{r.plan}</span>
                    </td>
                    <td style={{ padding:"11px 16px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:"999px", fontSize:"11px", fontWeight:600, ...(Object.fromEntries(statusStyle[r.status].split(";").map(e => { const [k,v]=e.split(":"); return [k?.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v?.trim()]; }).filter(e=>e[0]))) }}>{r.status}</span>
                    </td>
                    <td style={{ padding:"11px 16px", color:"#6B7280" }}>{r.date}</td>
                    <td style={{ padding:"11px 16px", color:"#111827", fontWeight:600 }}>{r.amount}</td>
                    <td style={{ padding:"11px 16px" }}>
                      <div style={{ display:"flex", gap:"4px" }}>
                        <button style={{ width:"26px", height:"26px", borderRadius:"6px", border:"1px solid #E5E7EB", background:"#fff", color:"#6B7280", cursor:"pointer", fontSize:"12px" }}>✏️</button>
                        <button style={{ width:"26px", height:"26px", borderRadius:"6px", border:"1px solid #E5E7EB", background:"#fff", color:"#6B7280", cursor:"pointer", fontSize:"12px" }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:"12px 18px", borderTop:"1px solid #F1F5F9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:"12px", color:"#9CA3AF" }}>Affichage 1–5 sur 142 résultats</div>
              <div style={{ display:"flex", gap:"4px" }}>
                {["←","1","2","3","→"].map((p,i) => (
                  <div key={i} style={{ width:"28px", height:"28px", borderRadius:"6px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", cursor:"pointer",
                    background: p==="1" ? "#2563EB" : "#fff", color: p==="1" ? "#fff" : "#6B7280", border:"1px solid #E5E7EB", fontWeight: p==="1" ? 600 : 400,
                  }}>{p}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
