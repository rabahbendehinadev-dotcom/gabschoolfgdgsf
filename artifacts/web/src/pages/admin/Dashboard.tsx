import { useGetAdminStats } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui";
import { Users, Crown, Video, Eye, CreditCard } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export function AdminDashboard() {
  const { getAdminAuthHeaders } = useAuth();
  const { data: stats, isLoading } = useGetAdminStats({ request: getAdminAuthHeaders() });

  if (isLoading) return <div>جاري التحميل...</div>;
  if (!stats) return null;

  const pieData = [
    { name: 'VIP', value: stats.vipUsers, color: '#f59e0b' },
    { name: 'عادي', value: stats.normalUsers, color: '#3f3f46' },
  ];

  const planData = [
    { name: 'تجريبي', value: stats.demoSubscriptions, color: '#3f3f46' },
    { name: 'سنوي', value: stats.annualSubscriptions, color: '#f97316' },
    { name: 'مدى الحياة', value: stats.lifetimeSubscriptions, color: '#ef4444' },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">نظرة عامة</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "إجمالي المستخدمين", val: stats.totalUsers, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
          { title: "مستخدمين VIP", val: stats.vipUsers, icon: Crown, color: "text-amber-500", bg: "bg-amber-500/10" },
          { title: "الدروس المرفوعة", val: stats.totalVideos, icon: Video, color: "text-green-500", bg: "bg-green-500/10" },
          { title: "إجمالي الزيارات", val: stats.totalVisits, icon: Eye, color: "text-purple-500", bg: "bg-purple-500/10" },
        ].map((item, i) => (
          <Card key={i} className="p-6 flex items-center gap-4 bg-card border-white/5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${item.bg} ${item.color}`}>
              <item.icon className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{item.title}</p>
              <h3 className="text-3xl font-bold">{item.val}</h3>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6 border-white/5">
          <h3 className="font-bold mb-6">أنواع الحسابات</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-sm">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 border-white/5">
          <h3 className="font-bold mb-6 flex items-center gap-2"><CreditCard className="w-5 h-5"/> الاشتراكات النشطة</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planData}>
                <XAxis dataKey="name" stroke="#71717a" />
                <YAxis stroke="#71717a" />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a' }} cursor={{ fill: '#27272a' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {planData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
