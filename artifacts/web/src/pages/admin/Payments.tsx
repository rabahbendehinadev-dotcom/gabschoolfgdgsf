import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { CheckCheck, X, Clock, User, CreditCard, ImageIcon, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

const API_BASE = "";
const WHATSAPP_NUMBER = "213772339494";

interface PaymentSubmission {
  id: number;
  customerName: string;
  planType: string;
  planPrice: string;
  paymentMethod: string;
  proofObjectPath: string | null;
  proofUrl: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  userId: number | null;
  createdAt: string;
}

const statusConfig = {
  pending:  { label: "قيد المراجعة", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  approved: { label: "مقبول",        color: "bg-green-500/20 text-green-400 border-green-500/30" },
  rejected: { label: "مرفوض",        color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

export function AdminPayments() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<PaymentSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [processing, setProcessing] = useState<number | null>(null);
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [notesDialog, setNotesDialog] = useState<{ id: number; notes: string } | null>(null);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const headers = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`${API_BASE}/api/admin/payments`, { headers: headers as HeadersInit });
      if (!res.ok) throw new Error("فشل جلب البيانات");
      const data = await res.json();
      setSubmissions(data);
    } catch {
      toast({ variant: "destructive", title: "فشل تحميل الطلبات" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (id: number, status: "approved" | "rejected", notes?: string) => {
    setProcessing(id);
    try {
      const headers = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`${API_BASE}/api/admin/payments/${id}`, {
        method: "PATCH",
        headers: { ...(headers as HeadersInit), "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error();
      toast({ title: status === "approved" ? "تم القبول ✅" : "تم الرفض" });
      setNotesDialog(null);
      await fetchSubmissions();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ" });
    } finally {
      setProcessing(null);
    }
  };

  const openWhatsApp = (submission: PaymentSubmission) => {
    const template = encodeURIComponent(
      `مرحباً ${submission.customerName} 👋\nبخصوص طلب الاشتراك رقم #${submission.id}\nالخطة: ${submission.planType} — ${submission.planPrice}\n\n`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${template}`, "_blank");
  };

  const filtered = submissions?.filter(s => filter === "all" || s.status === filter) ?? [];

  const counts = {
    all: submissions?.length ?? 0,
    pending: submissions?.filter(s => s.status === "pending").length ?? 0,
    approved: submissions?.filter(s => s.status === "approved").length ?? 0,
    rejected: submissions?.filter(s => s.status === "rejected").length ?? 0,
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">طلبات الدفع</h1>
        <Button variant="secondary" onClick={fetchSubmissions} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {(["all", "pending", "approved", "rejected"] as const).map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`p-4 rounded-xl border text-center transition-all ${filter === key ? "bg-primary/10 border-primary/40 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"}`}
          >
            <div className="text-2xl font-bold">{counts[key]}</div>
            <div className="text-xs mt-1">
              {key === "all" ? "الكل" : statusConfig[key].label}
            </div>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border-white/5 text-muted-foreground">
          <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>لا توجد طلبات</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map(sub => {
            const sc = statusConfig[sub.status] || statusConfig.pending;
            return (
              <Card key={sub.id} className="p-5 border-white/5 bg-card">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Proof thumbnail */}
                  <div className="shrink-0">
                    {sub.proofUrl ? (
                      <button
                        onClick={() => setSelectedProof(sub.proofUrl!)}
                        className="w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-black/20 hover:border-primary/40 transition-colors flex items-center justify-center"
                      >
                        <img src={sub.proofUrl} alt="إيصال" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                      </button>
                    ) : (
                      <div className="w-20 h-20 rounded-xl border border-dashed border-white/10 bg-black/10 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-white/20" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-bold">{sub.customerName}</span>
                          <span className="text-xs text-muted-foreground">#{sub.id}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm">
                          <span className="text-primary font-semibold">{sub.planPrice}</span>
                          <span className="text-muted-foreground">({sub.planType})</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">{sub.paymentMethod}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(sub.createdAt)}
                        </div>
                        {sub.notes && (
                          <p className="text-xs text-muted-foreground mt-1.5 italic">ملاحظة: {sub.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2.5 py-1 rounded-full border ${sc.color}`}>{sc.label}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {sub.proofUrl && (
                        <Button variant="ghost" size="sm" onClick={() => window.open(sub.proofUrl!, "_blank")}>
                          <ExternalLink className="w-3.5 h-3.5 ml-1" /> فتح الإيصال
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                        onClick={() => openWhatsApp(sub)}
                      >
                        <MessageCircle className="w-3.5 h-3.5 ml-1" /> واتساب
                      </Button>
                      {sub.status !== "approved" && (
                        <Button
                          size="sm"
                          className="bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30"
                          onClick={() => updateStatus(sub.id, "approved")}
                          disabled={processing === sub.id}
                        >
                          {processing === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5 ml-1" />}
                          قبول
                        </Button>
                      )}
                      {sub.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30"
                          onClick={() => setNotesDialog({ id: sub.id, notes: sub.notes ?? "" })}
                          disabled={processing === sub.id}
                        >
                          <X className="w-3.5 h-3.5 ml-1" /> رفض
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Proof image modal */}
      <Dialog open={!!selectedProof} onOpenChange={() => setSelectedProof(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>إيصال الدفع</DialogTitle></DialogHeader>
          {selectedProof && (
            <img src={selectedProof} alt="إيصال" className="w-full rounded-xl" />
          )}
        </DialogContent>
      </Dialog>

      {/* Reject notes dialog */}
      <Dialog open={!!notesDialog} onOpenChange={() => setNotesDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>رفض الطلب</DialogTitle></DialogHeader>
          {notesDialog && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">سبب الرفض (اختياري)</label>
                <Input
                  value={notesDialog.notes}
                  onChange={e => setNotesDialog({ ...notesDialog, notes: e.target.value })}
                  placeholder="اكتب سبب الرفض..."
                />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => updateStatus(notesDialog.id, "rejected", notesDialog.notes)}
                disabled={processing === notesDialog.id}
              >
                {processing === notesDialog.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأكيد الرفض"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
