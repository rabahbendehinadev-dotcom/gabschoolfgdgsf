export function DarkSlate() {
  const nav = [
    { icon: "⊞", label: "Tableau de bord", active: true, section: null },
    { icon: "👥", label: "Utilisateurs", active: false, section: null },
    { icon: "💳", label: "Abonnements", active: false, section: null },
    { icon: "💰", label: "Paiements", active: false, section: null },
    { icon: "─", label: "CONTENU", active: false, section: true },
    { icon: "🎓", label: "Cours", active: false, section: null },
    { icon: "📂", label: "Catégories", active: false, section: null },
    { icon: "─", label: "SYSTÈME", active: false, section: true },
    { icon: "🔔", label: "Notifications", active: false, section: null },
    { icon: "⚙️", label: "Plans", active: false, section: null },
  ];

  const stats = [
    { label: "Utilisateurs actifs", value: "1 248", icon: "👥", color: "#3B82F6" },
    { label: "Abonnements VIP", value: "342", icon: "⭐", color: "#8B5CF6" },
    { label: "Revenus du mois", value: "48 600 DA", icon: "💰", color: "#10B981" },
    { label: "En attente", value: "18", icon: "⏳", color: "#F59E0B" },
  ];

  const rows = [
    { name: "Ahmed Benali", plan: "VIP", status: "Actif", date: "22 jul 2026", amount: "4 500 DA" },
    { name: "Sara Meziane", plan: "Normal", status: "Actif", date: "21 jul 2026", amount: "1 800 DA" },
    { name: "Karim Oussaid", plan: "VIP", status: "Expiré", date: "15 jul 2026", amount: "4 500 DA" },
    { name: "Nadia Chaker", plan: "Normal", status: "En attente", date: "20 jul 2026", amount: "1 800 DA" },
    { name: "Youcef Hamdi", plan: "VIP", status: "Actif", date: "19 jul 2026", amount: "4 500 DA" },
  ];

  const statusBg: Record<string, {bg:string;color:string}> = {
    "Actif":       {bg:"#DCFCE7", color:"#15803D"},
    "Expiré":      {bg:"#FEE2E2", color:"#B91C1C"},
    "En attente":  {bg:"#FEF3C7", color:"#92400E"},
  };
  const planBg: Record<string, {bg:string;color:string}> = {
    "VIP":    {bg:"#EDE9FE", color:"#6D28D9"},
    "Normal": {bg:"#F3F4F6", color:"#6B7280"},
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", fontFamily:"'Inter','Segoe UI',sans-serif", background:"#F1F5F9", fontSize:"13px" }}>
      {/* Dark Sidebar */}
      <div style={{ width:"220px", background:"#0F172A", display:"flex", flexDirection:"column", flexShrink:0 }}>
        {/* Brand */}
        <div style={{ padding:"20px 16px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
            <div style={{ width:"32px", height:"32px", borderRadius:"8px", background:"#3B82F6", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:"14px" }}>G</div>
            <div>
              <div style={{ fontWeight:700, fontSize:"13px", color:"#F8FAFC", letterSpacing:"-0.01em" }}>GAB School</div>
              <div style={{ fontSize:"11px", color:"#475569", marginTop:"1px" }}>Administration</div>
            </div>
          </div>
        </div>
        {/* Nav */}
        <div style={{ flex:1, padding:"10px 8px", display:"flex", flexDirection:"column", gap:"1px" }}>
          {nav.map((n, i) => n.section ? (
            <div key={i} style={{ fontSize:"10px", fontWeight:600, color:"#334155", letterSpacing:"0.08em", padding:"12px 10px 4px" }}>{n.label}</div>
          ) : (
            <div key={n.label} style={{
              display:"flex", alignItems:"center", gap:"9px",
              padding:"7px 10px", borderRadius:"7px", cursor:"pointer",
              background: n.active ? "#1E293B" : "transparent",
              color: n.active ? "#60A5FA" : "#64748B",
              fontWeight: n.active ? 600 : 500,
              fontSize:"12.5px",
              position:"relative",
            }}>
              {n.active && <div style={{ position:"absolute", left:0, top:"6px", bottom:"6px", width:"3px", background:"#3B82F6", borderRadius:"0 3px 3px 0" }} />}
              <span style={{ fontSize:"13px", marginLeft: n.active ? "3px" : "0" }}>{n.icon}</span>
              {n.label}
            </div>
          ))}
        </div>
        {/* User footer */}
        <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", padding:"12px 14px", display:"flex", alignItems:"center", gap:"9px" }}>
          <div style={{ width:"30px", height:"30px", borderRadius:"50%", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", color:"#60A5FA", fontWeight:700, fontSize:"12px", flexShrink:0 }}>A</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:"12px", fontWeight:600, color:"#E2E8F0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>Admin</div>
            <div style={{ fontSize:"11px", color:"#475569" }}>Super admin</div>
          </div>
          <div style={{ color:"#475569", fontSize:"13px", cursor:"pointer" }}>⋯</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ height:"56px", background:"#FFFFFF", borderBottom:"1px solid #E2E8F0", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:"16px", color:"#0F172A" }}>Tableau de bord</div>
            <div style={{ fontSize:"11px", color:"#94A3B8" }}>Mardi 22 juillet 2026</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <div style={{ padding:"0 14px", height:"34px", borderRadius:"7px", border:"1px solid #E2E8F0", background:"#F8FAFC", display:"flex", alignItems:"center", gap:"7px", color:"#94A3B8", fontSize:"12.5px" }}>
              🔍 <span>Rechercher…</span>
            </div>
            <button style={{ padding:"0 16px", height:"34px", borderRadius:"7px", background:"#F97316", color:"#fff", border:"none", fontWeight:600, fontSize:"12.5px", cursor:"pointer" }}>
              ＋ Ajouter
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:"24px", overflow:"auto" }}>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"14px", marginBottom:"24px" }}>
            {stats.map(s => (
              <div key={s.label} style={{ background:"#FFFFFF", border:"1px solid #E2E8F0", borderRadius:"10px", padding:"16px 18px", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px" }}>
                  <div style={{ fontSize:"11px", color:"#64748B", fontWeight:500 }}>{s.label}</div>
                  <div style={{ width:"30px", height:"30px", borderRadius:"8px", background:`${s.color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px" }}>{s.icon}</div>
                </div>
                <div style={{ fontSize:"22px", fontWeight:700, color:"#0F172A", letterSpacing:"-0.02em" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ background:"#FFFFFF", border:"1px solid #E2E8F0", borderRadius:"10px", boxShadow:"0 1px 3px rgba(0,0,0,0.05)", overflow:"hidden" }}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight:600, fontSize:"13.5px", color:"#0F172A" }}>Derniers paiements</div>
              <div style={{ display:"flex", gap:"6px" }}>
                {["Tous","Actifs","En attente","Expirés"].map((f,i) => (
                  <div key={f} style={{ padding:"4px 10px", borderRadius:"6px", fontSize:"11.5px", fontWeight:500, cursor:"pointer",
                    background: i===0 ? "#EFF6FF" : "transparent",
                    color: i===0 ? "#1D4ED8" : "#64748B",
                    border: i===0 ? "1px solid #BFDBFE" : "1px solid transparent",
                  }}>{f}</div>
                ))}
              </div>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#F8FAFC" }}>
                  {["Utilisateur","Plan","Statut","Date","Montant","Actions"].map(h => (
                    <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontSize:"10.5px", fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid #E2E8F0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name} style={{ background: i%2===0 ? "#FFFFFF" : "#FAFBFC", borderBottom:"1px solid #F1F5F9" }}>
                    <td style={{ padding:"11px 16px", color:"#0F172A", fontWeight:500 }}>{r.name}</td>
                    <td style={{ padding:"11px 16px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:"999px", fontSize:"11px", fontWeight:600, background: planBg[r.plan].bg, color: planBg[r.plan].color }}>{r.plan}</span>
                    </td>
                    <td style={{ padding:"11px 16px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:"999px", fontSize:"11px", fontWeight:600, background: statusBg[r.status].bg, color: statusBg[r.status].color }}>{r.status}</span>
                    </td>
                    <td style={{ padding:"11px 16px", color:"#64748B" }}>{r.date}</td>
                    <td style={{ padding:"11px 16px", color:"#0F172A", fontWeight:600 }}>{r.amount}</td>
                    <td style={{ padding:"11px 16px" }}>
                      <div style={{ display:"flex", gap:"4px" }}>
                        <button style={{ width:"26px", height:"26px", borderRadius:"6px", border:"1px solid #E2E8F0", background:"#fff", color:"#64748B", cursor:"pointer", fontSize:"12px" }}>✏️</button>
                        <button style={{ width:"26px", height:"26px", borderRadius:"6px", border:"1px solid #E2E8F0", background:"#fff", color:"#64748B", cursor:"pointer", fontSize:"12px" }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:"12px 18px", borderTop:"1px solid #F1F5F9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:"12px", color:"#94A3B8" }}>Affichage 1–5 sur 142 résultats</div>
              <div style={{ display:"flex", gap:"4px" }}>
                {["←","1","2","3","→"].map((p,i) => (
                  <div key={i} style={{ width:"28px", height:"28px", borderRadius:"6px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", cursor:"pointer",
                    background: p==="1" ? "#3B82F6" : "#fff", color: p==="1" ? "#fff" : "#64748B", border:"1px solid #E2E8F0", fontWeight: p==="1" ? 600 : 400,
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
