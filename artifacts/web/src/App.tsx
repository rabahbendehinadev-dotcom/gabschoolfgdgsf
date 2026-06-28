import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Home } from "@/pages/public/Home";
import { Login } from "@/pages/public/Login";
import { Register } from "@/pages/public/Register";
import { Videos } from "@/pages/public/Videos";
import { VideoDetail } from "@/pages/public/VideoDetail";
import { Dashboard } from "@/pages/public/Dashboard";
import { Subscribe } from "@/pages/public/Subscribe";
import { Community } from "@/pages/public/Community";
import { Notifications } from "@/pages/public/Notifications";
import { CompletePhone } from "@/pages/public/CompletePhone";
import { AdminLogin } from "@/pages/admin/AdminLogin";
import { AdminDashboard } from "@/pages/admin/Dashboard";
import { AdminUsers } from "@/pages/admin/Users";
import { AdminVideos } from "@/pages/admin/Videos";
import { AdminCategories } from "@/pages/admin/Categories";
import { AdminPlaylists } from "@/pages/admin/Playlists";
import { AdminPlans } from "@/pages/admin/Plans";
import { AdminSubscriptions } from "@/pages/admin/Subscriptions";
import { AdminActivityLog } from "@/pages/admin/ActivityLog";
import { AdminPayments } from "@/pages/admin/Payments";
import { AdminChangePassword } from "@/pages/admin/ChangePassword";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col rtl pb-[calc(70px_+_env(safe-area-inset-bottom))] lg:pb-0" dir="rtl">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}

// New users (signed up via Google with no WhatsApp number yet) must provide one
// before reaching any user-facing page. We block protected pages from mounting
// while such a user is routed to onboarding, and we wait for the server-confirmed
// profile (`bootstrapped`) before redirecting so existing users are never sent to
// the phone page on a stale cache. Admin pages use a separate session and are
// excluded; existing users (phone already set) render immediately with no loader.
function GatedRouter() {
  const { token, user, bootstrapped } = useAuth();
  const [location, navigate] = useLocation();

  const isAdminRoute = location.startsWith("/gab-ctrl-9x");
  const onCompletePhone = location === "/complete-phone";
  const phoneMissing = !!token && !!user && !user.phone && !isAdminRoute;

  useEffect(() => {
    if (!bootstrapped) return;
    if (phoneMissing && !onCompletePhone) {
      navigate("/complete-phone", { replace: true });
    }
  }, [bootstrapped, phoneMissing, onCompletePhone, navigate]);

  // Hold protected pages until we know the phone status, so a phone-less user
  // never mounts a lesson page or fires its data requests before redirecting.
  if (phoneMissing && !onCompletePhone) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <Router />;
}

// Public pages share one persistent chrome (Navbar / Footer / BottomNav) so that
// switching tabs only swaps the inner content — the header no longer re-animates and
// the bottom-nav active indicator slides smoothly between tabs (true native feel).
function PublicRoutes() {
  return (
    <PublicLayout>
      <Switch>
        <Route path="/"><Home /></Route>
        <Route path="/videos"><Videos /></Route>
        <Route path="/videos/:id"><VideoDetail /></Route>
        <Route path="/dashboard"><Dashboard /></Route>
        <Route path="/subscribe"><Subscribe /></Route>
        <Route path="/community"><Community /></Route>
        <Route path="/notifications"><Notifications /></Route>
        <Route component={NotFound} />
      </Switch>
    </PublicLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Login />
      </Route>
      <Route path="/register">
        <Register />
      </Route>
      <Route path="/complete-phone">
        <CompletePhone />
      </Route>
      <Route path="/gab-ctrl-9x/login">
        <AdminLogin />
      </Route>
      <Route path="/gab-ctrl-9x">
        <AdminLayout><AdminDashboard /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/users">
        <AdminLayout><AdminUsers /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/videos">
        <AdminLayout><AdminVideos /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/categories">
        <AdminLayout><AdminCategories /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/playlists">
        <AdminLayout><AdminPlaylists /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/plans">
        <AdminLayout><AdminPlans /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/subscriptions">
        <AdminLayout><AdminSubscriptions /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/activity-log">
        <AdminLayout><AdminActivityLog /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/payments">
        <AdminLayout><AdminPayments /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/change-password">
        <AdminLayout><AdminChangePassword /></AdminLayout>
      </Route>
      <Route><PublicRoutes /></Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <GatedRouter />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
