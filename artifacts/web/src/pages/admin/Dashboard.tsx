import { useGetAdminStats } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Users, Crown, Video, Eye, CreditCard, TrendingUp, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export function AdminDashboard() {
  const { getAdminAuthHeaders } = useAuth();
  const { data: stats, isLoading } = useGetAdminStats({ request: getAdminAuthHeaders() });

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320 }}>
      <div style={{ width: 28, height: 28, border: "3px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
    </div>
  );
  if (!stats) return null;

  const pieData = [
    { name: "VIP", value: stats.vipUsers, color: "#2563EB" },
    { name: "Standard", value: stats.normalUsers, color: "#CBD5E1" },
  ];

  const planData = [
    { name: "Essai",  value: stats.demoSubscriptions },
    { name: "Annuel", value: stats.annualSubscriptions },
    { name: "À vie",  value: stats.lifetimeSubscriptions },
  ];

  const statCards = [
    {
      label: "Total utilisateurs",
      value: stats.totalUsers,
      icon: Users,
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      accent: "#2563EB",
    },
    {
      label: "Utilisateurs VIP",
      value: stats.vipUsers,
      icon: Crown,
      iconBg: "#EEF2FF",
      iconColor: "#4F46E5",
      accent: "#4F46E5",
    },
    {
      label: "Leçons uploadées",
      value: stats.totalVideos,
      icon: Video,
      iconBg: "#F0FDF4",
      iconColor: "#15803D",
      accent: "#15803D",
    },
    {
      label: "Total visites",
      value: stats.totalVisits,
      icon: Eye,
      iconBg: "#FFFBEB",
      iconColor: "#92400E",
      accent: "#D97706",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: 0 }}>
          Vue d'ensemble
        </h1>
        <p style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 4 }}>
          Statistiques globales de la plateforme GAB School
        </p>
      </div>

      {/* KPI stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {statCards.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="ad-stat" style={{ borderTop: `3px solid ${s.accent}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: s.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={17} color={s.iconColor} />
                </div>
                <TrendingUp size={13} color="#94A3B8" />
              </div>
              <div className="ad-stat-value">{s.value.toLocaleString("fr-FR")}</div>
              <div className="ad-stat-label">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Pie — account types */}
        <div className="ad-card" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A" }}>Types de comptes</div>
              <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 2 }}>Répartition VIP / Standard</div>
            </div>
            <Users size={16} color="#94A3B8" />
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" }}
                  itemStyle={{ color: "#475569" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                <span style={{ fontSize: 12, color: "#475569" }}>{d.name} <strong style={{ color: "#0F172A" }}>({d.value})</strong></span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar — subscriptions */}
        <div className="ad-card" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A" }}>Abonnements actifs</div>
              <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 2 }}>Par type de plan</div>
            </div>
            <CreditCard size={16} color="#94A3B8" />
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planData} barSize={36}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94A3B8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#94A3B8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" }}
                  itemStyle={{ color: "#475569" }}
                  cursor={{ fill: "#F1F5F9" }}
                />
                <Bar dataKey="value" fill="#2563EB" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick info banner */}
      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <AlertCircle size={15} color="#2563EB" style={{ flexShrink: 0 }} />
        <p style={{ fontSize: 12.5, color: "#1D4ED8", margin: 0 }}>
          Données en temps réel. Consultez la section <strong>Paiements</strong> pour valider les abonnements en attente.
        </p>
      </div>
    </div>
  );
}
