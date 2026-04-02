import { useAuth } from "@/lib/auth";
import { Card, Badge, Button } from "@/components/ui";
import { User, Crown, Calendar, ShieldAlert, LogOut } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

export function Dashboard() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="p-8 text-center glass-card max-w-md w-full">
          <User className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-bold mb-2">يجب تسجيل الدخول أولاً</h2>
          <p className="text-muted-foreground mb-6">سجل دخولك لعرض معلومات حسابك</p>
          <Link href="/login">
            <Button className="w-full">تسجيل الدخول</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isVIP = user.accountType === 'vip';
  const planName = {
    'demo': 'تجريبي',
    'annual': 'سنوي',
    'lifetime': 'مدى الحياة'
  }[user.subscriptionType] || user.subscriptionType;

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">حسابي</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="md:col-span-2 p-8 glass-card relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-primary/10 to-transparent" />
            
            <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="w-24 h-24 rounded-full bg-muted border-4 border-border flex items-center justify-center shadow-md z-10 shrink-0">
                <User className="w-12 h-12 text-primary" />
              </div>
              
              <div className="text-center sm:text-start flex-1 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold">{user.username}</h2>
                  {isVIP ? (
                    <Badge variant="vip" className="w-fit mx-auto sm:mx-0">حساب VIP</Badge>
                  ) : (
                    <Badge variant="secondary" className="w-fit mx-auto sm:mx-0">حساب عادي</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mb-6">{user.email}</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/60 p-4 rounded-xl border border-border">
                    <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center sm:justify-start gap-2">
                      <Crown className="w-4 h-4 text-primary" /> نوع الاشتراك
                    </div>
                    <div className="font-bold text-lg">{planName}</div>
                  </div>
                  <div className="bg-muted/60 p-4 rounded-xl border border-border">
                    <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center sm:justify-start gap-2">
                      <Calendar className="w-4 h-4 text-primary" /> تاريخ الانتهاء
                    </div>
                    <div className="font-bold text-lg">
                      {user.subscriptionType === 'lifetime' 
                        ? 'غير محدود' 
                        : user.subscriptionExpiresAt ? formatDate(user.subscriptionExpiresAt) : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Action Sidebar */}
          <div className="space-y-6">
            {!isVIP && (
              <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-orange-600/10 border-orange-500/30 text-center">
                <Crown className="w-12 h-12 text-orange-400 mx-auto mb-4" />
                <h3 className="font-bold text-lg mb-2 text-orange-500">قم بترقية حسابك</h3>
                <p className="text-sm text-muted-foreground mb-4">احصل على وصول كامل لجميع دروس الفلاش والديكوداج الحصرية.</p>
                <Link href="/#pricing">
                  <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold">عرض الباقات</Button>
                </Link>
              </Card>
            )}

            <Card className="p-6 glass-card">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" /> إعدادات الأمان
              </h3>
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground p-3 bg-muted/40 rounded-lg mb-4 border border-border">
                  ملاحظة: الحساب مرتبط بعنوان IP واحد فقط. في حال تغير الجهاز يرجى التواصل مع الإدارة.
                </div>
                <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={logout}>
                  <LogOut className="w-4 h-4 ml-2" /> تسجيل الخروج
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
