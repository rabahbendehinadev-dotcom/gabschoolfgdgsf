import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Home } from "@/pages/public/Home";
import { Login } from "@/pages/public/Login";
import { Register } from "@/pages/public/Register";
import { Videos } from "@/pages/public/Videos";
import { VideoDetail } from "@/pages/public/VideoDetail";
import { Dashboard } from "@/pages/public/Dashboard";
import { Subscribe } from "@/pages/public/Subscribe";
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
    <div className="min-h-screen flex flex-col rtl" dir="rtl">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <PublicLayout><Home /></PublicLayout>
      </Route>
      <Route path="/login">
        <Login />
      </Route>
      <Route path="/register">
        <Register />
      </Route>
      <Route path="/videos">
        <PublicLayout><Videos /></PublicLayout>
      </Route>
      <Route path="/videos/:id">
        <PublicLayout><VideoDetail /></PublicLayout>
      </Route>
      <Route path="/dashboard">
        <PublicLayout><Dashboard /></PublicLayout>
      </Route>
      <Route path="/subscribe">
        <PublicLayout><Subscribe /></PublicLayout>
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
