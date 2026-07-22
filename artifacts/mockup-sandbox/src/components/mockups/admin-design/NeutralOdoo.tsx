export function NeutralOdoo() {
  const sections = [
    {
      title: "GESTION",
      items: [
        { icon: "⊞", label: "Tableau de bord", active: true },
        { icon: "👥", label: "Utilisateurs", active: false },
        { icon: "💳", label: "Abonnements", active: false },
        { icon: "💰", label: "Paiements", active: false },
      ]
    },
    {
      title: "CONTENU",
      items: [
        { icon: "🎓", label: "Cours", active: false },
        { icon: "📂", label: "Catégories", active: false },
        { icon: "🎬", label: "Vidéos", active: false },
      ]
    },
    {
      title: "CONFIGURATION",
      items: [
        { icon: "🔔", label: "Notifications", active: false },
        { icon: "⚙️", label: "Plans", active: false },
      ]
    }
  ];

  const stats = [
    { label: "Total utilisateurs", value: "1 248", sub: "dont 342 VIP", icon: "👥" },
    { label: "Revenus du mois", value: "48 600 DA", sub: "+8% vs mois dernier", icon: "📈" },
    { label: "Paiements en attente", value: "18", sub: "à valider", icon: "⏳" },
    { label: "Abonnements actifs", value: "1 089", sub: "87% du total", icon: "✅" },
  ];

  const rows = [
    { name: "Ahmed Benali", plan: "VIP", status: "Actif", date: "22 jul 2026", amount: "4 500 DA" },
    { name: "Sara Meziane", plan: "Normal", status: "Actif", date: "21 jul 2026", amount: "1 800 DA" },
    { name: "Karim Oussaid", plan: "VIP", status: "Expiré", date: "15 jul 2026", amount: "4 500 DA" },
    { name: "Nadia Chaker", plan: "Normal", status: "En attente", date: "20 jul 2026", amount: "1 800 DA" },
    { name: "Youcef Hamdi", plan: "VIP", status: "Actif", date: "19 jul 2026", amount: "4 500 DA" },
  ];

  const statusStyle: Record<string, {bg:string;color:string;border:string}> = {
    "Actif":       {bg:"#F0FDF4", color:"#166534", border:"#BBF7D0"},
    "Expiré":      {bg:"#FFF1F2", color:"#9F1239", border:"#FECDD3"},
    "En attente":  {bg:"#FFFBEB", color:"#92400E", border:"#FDE68A"},
  };
  const planStyle: Record<string, {bg:string;color:string;border:string}> = {
    "VIP":    {bg:"#EEF2FF", color:"#3730A3", border:"#C7D2FE"},
    "Normal": {bg:"#F9FAFB", color:"#6B7280", border:"#E5E7EB"},
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", fontFamily:"'Inter','Segoe UI',sans-serif", background:"#F5F7FA", fontSize:"13px" }}>
      {/* Slate Sidebar */}
      <div style={{ width:"220px", background:"#1E293B", display:"flex", flexDirection:"column", flexShrink:0 }}>
        {/* Brand */}
        <div style={{ padding:"18px 16px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
            <div style={{ width:"34px", height:"34px", borderRadius:"9px", background:"linear-gradient(135deg,#2563EB,#1D4ED8)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:"15px", letterSpacing:"-0.02em" }}>G</div>
            <div>
              <div style={{ fontWeight:700, fontSize:"13px", color:"#F1F5F9", letterSpacing:"-0.01em" }}>GAB School</div>
              <div style={{ fontSize:"10.5px", color:"#475569", marginTop:"1px" }}>Panneau Admin</div>
            </div>
          </div>
        </div>

        {/* Nav Sections */}
        <div style={{ flex:1, padding:"8px", display:"flex", flexDirection:"column", gap:"0px", overflowY:"auto" }}>
          {sections.map(section => (
            <div key={section.title} style={{ marginBottom:"4px" }}>
              <div style={{ fontSize:"9.5px", fontWeight:700, color:"#334155", letterSpacing:"0.1em", padding:"10px 10px 5px" }}>{section.title}</div>
              {section.items.map(item => (
                <div key={item.label} style={{
                  display:"flex", alignItems:"center", gap:"9px",
                  padding:"7.5px 10px", borderRadius:"7px", cursor:"pointer",
                  background: item.active ? "rgba(59,130,246,0.15)" : "transparent",
                  color: item.active ? "#93C5FD" : "#64748B",
                  fontWeight: item.active ? 600 : 400,
                  fontSize:"12.5px",
                  position:"relative",
                  transition:"all 120ms",
                }}>
                  {item.active && <div style={{ position:"absolute", left:0, top:"5px", bottom:"5px", width:"3px", background:"#3B82F6", borderRadius:"0 3px 3px 0" }} />}
                  <span style={{ fontSize:"13px" }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* User footer */}
        <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)", padding:"12px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
            <div style={{ width:"30px", height:"30px", borderRadius:"50%", background:"rgba(59,130,246,0.2)", display:"flex", alignItems:"center", justifyContent:"center", color:"#60A5FA", fontWeight:700, fontSize:"12px", flexShrink:0, border:"1px solid rgba(59,130,246,0.3)" }}>A</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"12px", fontWeight:600, color:"#CBD5E1" }}>Admin Principal</div>
              <div style={{ fontSize:"10.5px", color:"#475569" }}>Connecté</div>
            </div>
          </div>
          <button style={{ marginTop:"10px", width:"100%", height:"30px", borderRadius:"7px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", color:"#F87171", fontSize:"11.5px", fontWeight:500, cursor:"pointer" }}>
            Déconnexion
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ height:"54px", background:"#FFFFFF", borderBottom:"1px solid #E5E7EB", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <div style={{ fontSize:"11px", color:"#9CA3AF" }}>Admin</div>
            <div style={{ color:"#D1D5DB" }}>/</div>
            <div style={{ fontWeight:600, fontSize:"13px", color:"#111827" }}>Tableau de bord</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <div style={{ padding:"0 12px", height:"32px", borderRadius:"7px", border:"1px solid #E5E7EB", background:"#F9FAFB", display:"flex", alignItems:"center", gap:"7px", color:"#9CA3AF", fontSize:"12px", minWidth:"200px" }}>
              🔍 <span>Rechercher dans le panneau…</span>
            </div>
            <button style={{ padding:"0 14px", height:"32px", borderRadius:"7px", background:"#2563EB", color:"#fff", border:"none", fontWeight:600, fontSize:"12px", cursor:"pointer", display:"flex", alignItems:"center", gap:"6px" }}>
              ＋ Ajouter
            </button>
            <button style={{ padding:"0 14px", height:"32px", borderRadius:"7px", background:"#F97316", color:"#fff", border:"none", fontWeight:600, fontSize:"12px", cursor:"pointer" }}>
              Exporter
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:"20px 24px", overflow:"auto" }}>
          {/* Page title */}
          <div style={{ marginBottom:"20px" }}>
            <h1 style={{ fontSize:"18px", fontWeight:700, color:"#111827", margin:0, letterSpacing:"-0.02em" }}>Vue d'ensemble</h1>
            <p style={{ fontSize:"12px", color:"#9CA3AF", margin:"3px 0 0" }}>Mardi 22 juillet 2026 — Données en temps réel</p>
          </div>

          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px", marginBottom:"20px" }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{ background:"#FFFFFF", border:"1px solid #E5E7EB", borderRadius:"10px", padding:"14px 16px", boxShadow:"0 1px 2px rgba(0,0,0,0.04)", borderTop: `3px solid ${["#2563EB","#10B981","#F59E0B","#2563EB"][i]}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:"10.5px", color:"#6B7280", fontWeight:500, marginBottom:"7px" }}>{s.label}</div>
                    <div style={{ fontSize:"20px", fontWeight:700, color:"#111827", letterSpacing:"-0.02em" }}>{s.value}</div>
                    <div style={{ fontSize:"11px", color:"#9CA3AF", marginTop:"4px" }}>{s.sub}</div>
                  </div>
                  <div style={{ fontSize:"18px" }}>{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ background:"#FFFFFF", border:"1px solid #E5E7EB", borderRadius:"10px", boxShadow:"0 1px 2px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                <div style={{ fontWeight:600, fontSize:"13px", color:"#111827" }}>Paiements récents</div>
                <span style={{ fontSize:"11px", background:"#EFF6FF", color:"#1D4ED8", padding:"2px 8px", borderRadius:"999px", fontWeight:600, border:"1px solid #BFDBFE" }}>142 total</span>
              </div>
              <div style={{ display:"flex", gap:"6px" }}>
                {["Tous","Actifs","En attente","Expirés"].map((f,i) => (
                  <div key={f} style={{ padding:"4px 10px", borderRadius:"6px", fontSize:"11.5px", fontWeight:500, cursor:"pointer",
                    background: i===0 ? "#2563EB" : "#F9FAFB",
                    color: i===0 ? "#FFFFFF" : "#6B7280",
                    border: "1px solid " + (i===0 ? "#2563EB" : "#E5E7EB"),
                  }}>{f}</div>
                ))}
              </div>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#F9FAFB" }}>
                  {["Utilisateur","Plan","Statut","Date","Montant",""].map(h => (
                    <th key={h+Math.random()} style={{ padding:"9px 14px", textAlign:"left", fontSize:"10.5px", fontWeight:600, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid #E5E7EB" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name} style={{ background: i%2===0 ? "#FFFFFF" : "#FAFAFA", borderBottom:"1px solid #F3F4F6" }}>
                    <td style={{ padding:"10px 14px", color:"#111827", fontWeight:500 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                        <div style={{ width:"26px", height:"26px", borderRadius:"50%", background:"#EFF6FF", display:"flex", alignItems:"center", justifyContent:"center", color:"#1D4ED8", fontWeight:700, fontSize:"11px", flexShrink:0 }}>{r.name[0]}</div>
                        {r.name}
                      </div>
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:"5px", fontSize:"11px", fontWeight:600, background: planStyle[r.plan].bg, color: planStyle[r.plan].color, border:`1px solid ${planStyle[r.plan].border}` }}>{r.plan}</span>
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:"5px", fontSize:"11px", fontWeight:600, background: statusStyle[r.status].bg, color: statusStyle[r.status].color, border:`1px solid ${statusStyle[r.status].border}`, display:"inline-flex", alignItems:"center", gap:"4px" }}>
                        <span style={{ width:"5px", height:"5px", borderRadius:"50%", background: r.status==="Actif" ? "#16A34A" : r.status==="Expiré" ? "#9F1239" : "#D97706", display:"inline-block" }} />
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding:"10px 14px", color:"#6B7280", fontSize:"12px" }}>{r.date}</td>
                    <td style={{ padding:"10px 14px", color:"#111827", fontWeight:600 }}>{r.amount}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", gap:"4px" }}>
                        <button style={{ padding:"4px 10px", borderRadius:"6px", border:"1px solid #E5E7EB", background:"#fff", color:"#374151", cursor:"pointer", fontSize:"11.5px", fontWeight:500 }}>Voir</button>
                        <button style={{ padding:"4px 10px", borderRadius:"6px", border:"1px solid #FEE2E2", background:"#FFF1F2", color:"#9F1239", cursor:"pointer", fontSize:"11.5px", fontWeight:500 }}>Suppr.</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:"10px 16px", borderTop:"1px solid #F3F4F6", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:"12px", color:"#9CA3AF" }}>1–5 sur 142 résultats</div>
              <div style={{ display:"flex", gap:"3px" }}>
                {["‹","1","2","3","4","5","›"].map((p, i) => (
                  <div key={i} style={{ width:"26px", height:"26px", borderRadius:"5px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", cursor:"pointer",
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
