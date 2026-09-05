import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { NotificationGate } from "@/components/notifications/NotificationGate";

const Home = lazy(() => import("@/pages/public/Home").then((module) => ({ default: module.Home })));
const Login = lazy(() => import("@/pages/public/Login").then((module) => ({ default: module.Login })));
const Register = lazy(() => import("@/pages/public/Register").then((module) => ({ default: module.Register })));
const Courses = lazy(() => import("@/pages/public/Courses").then((module) => ({ default: module.Courses })));
const CourseDetail = lazy(() => import("@/pages/public/CourseDetail").then((module) => ({ default: module.CourseDetail })));
const Videos = lazy(() => import("@/pages/public/Videos").then((module) => ({ default: module.Videos })));
const VideoDetail = lazy(() => import("@/pages/public/VideoDetail").then((module) => ({ default: module.VideoDetail })));
const Dashboard = lazy(() => import("@/pages/public/Dashboard").then((module) => ({ default: module.Dashboard })));
const Subscribe = lazy(() => import("@/pages/public/Subscribe").then((module) => ({ default: module.Subscribe })));
const Community = lazy(() => import("@/pages/public/Community").then((module) => ({ default: module.Community })));
const Tools = lazy(() => import("@/pages/public/Tools").then((module) => ({ default: module.Tools })));
const Notifications = lazy(() => import("@/pages/public/Notifications").then((module) => ({ default: module.Notifications })));
const CompletePhone = lazy(() => import("@/pages/public/CompletePhone").then((module) => ({ default: module.CompletePhone })));
const AdminLogin = lazy(() => import("@/pages/admin/AdminLogin").then((module) => ({ default: module.AdminLogin })));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard").then((module) => ({ default: module.AdminDashboard })));
const AdminUsers = lazy(() => import("@/pages/admin/Users").then((module) => ({ default: module.AdminUsers })));
const AdminVideos = lazy(() => import("@/pages/admin/Videos").then((module) => ({ default: module.AdminVideos })));
const AdminCategories = lazy(() => import("@/pages/admin/Categories").then((module) => ({ default: module.AdminCategories })));
const AdminCourses = lazy(() => import("@/pages/admin/Courses").then((module) => ({ default: module.AdminCourses })));
const AdminPlans = lazy(() => import("@/pages/admin/Plans").then((module) => ({ default: module.AdminPlans })));
const AdminSubscriptions = lazy(() => import("@/pages/admin/Subscriptions").then((module) => ({ default: module.AdminSubscriptions })));
const AdminActivityLog = lazy(() => import("@/pages/admin/ActivityLog").then((module) => ({ default: module.AdminActivityLog })));
const AdminPayments = lazy(() => import("@/pages/admin/Payments").then((module) => ({ default: module.AdminPayments })));
const AdminChangePassword = lazy(() => import("@/pages/admin/ChangePassword").then((module) => ({ default: module.AdminChangePassword })));
const AdminSendNotification = lazy(() => import("@/pages/admin/SendNotification").then((module) => ({ default: module.AdminSendNotification })));
const AdminCommunity = lazy(() => import("@/pages/admin/AdminCommunity").then((module) => ({ default: module.AdminCommunity })));
const AdminTools = lazy(() => import("@/pages/admin/AdminTools").then((module) => ({ default: module.AdminTools })));
const AdminToolCategories = lazy(() => import("@/pages/admin/AdminToolCategories").then((module) => ({ default: module.AdminToolCategories })));
const AdminSubscriptionAlerts = lazy(() => import("@/pages/admin/SubscriptionAlerts").then((module) => ({ default: module.AdminSubscriptionAlerts })));
const AdminAdmins = lazy(() => import("@/pages/admin/AdminAdmins").then((module) => ({ default: module.AdminAdmins })));
const AdminAuditLog = lazy(() => import("@/pages/admin/AdminAuditLog").then((module) => ({ default: module.AdminAuditLog })));
const AdminSecurity = lazy(() => import("@/pages/admin/Security").then((module) => ({ default: module.AdminSecurity })));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col rtl pb-[calc(70px_+_env(safe-area-inset-bottom))] lg:pb-0" dir="rtl">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <BottomNav />
      <NotificationGate />
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

  const isAdminRoute = location.startsWith("/bendehinaonline97") || location.startsWith("/gab-ctrl-9x");
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

function ScrollToTop() {
  const [location] = useLocation();
  const search = useSearch();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location, search]);
  return null;
}

// Public pages share one persistent chrome (Navbar / Footer / BottomNav) so that
// switching tabs only swaps the inner content — the header no longer re-animates and
// the bottom-nav active indicator slides smoothly between tabs (true native feel).
function PublicRoutes() {
  return (
    <PublicLayout>
      <ScrollToTop />
      <Switch>
        <Route path="/"><Home /></Route>
        <Route path="/courses/:id">{(params) => <CourseDetail id={Number(params.id)} />}</Route>
        <Route path="/courses"><Courses /></Route>
        <Route path="/videos/:id"><VideoDetail /></Route>
        <Route path="/videos"><Videos /></Route>
        <Route path="/dashboard"><Dashboard /></Route>
        <Route path="/subscribe"><Subscribe /></Route>
        <Route path="/community"><Community /></Route>
        <Route path="/notifications"><Notifications /></Route>
        <Route path="/tools"><Tools /></Route>
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
      <Route path="/bendehinaonline97/login">
        <AdminLogin />
      </Route>
      <Route path="/bendehinaonline97">
        <AdminLayout><AdminDashboard /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/users">
        <AdminLayout><AdminUsers /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/courses">
        <AdminLayout><AdminCourses /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/videos">
        <AdminLayout><AdminVideos /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/categories">
        <AdminLayout><AdminCategories /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/plans">
        <AdminLayout><AdminPlans /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/subscriptions">
        <AdminLayout><AdminSubscriptions /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/send-notification">
        <AdminLayout><AdminSendNotification /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/community">
        <AdminLayout><AdminCommunity /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/activity-log">
        <AdminLayout><AdminActivityLog /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/payments">
        <AdminLayout><AdminPayments /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/change-password">
        <AdminLayout><AdminChangePassword /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/subscription-alerts">
        <AdminLayout><AdminSubscriptionAlerts /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/tools">
        <AdminLayout><AdminTools /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/tool-categories">
        <AdminLayout><AdminToolCategories /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/admins">
        <AdminLayout><AdminAdmins /></AdminLayout>
      </Route>
      <Route path="/bendehinaonline97/admin-audit">
        <AdminLayout><AdminAuditLog /></AdminLayout>
      </Route>
      <Route path="/gab-ctrl-9x/security">
        <AdminLayout><AdminSecurity /></AdminLayout>
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
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center" dir="rtl">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }
            >
              <GatedRouter />
            </Suspense>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
