import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { ToastProvider } from "./components/ui/Toast";
import { EnquiryModalProvider } from "./components/ui/EnquiryModal";
import { AuthProvider } from "./lib/Auth";
import { I18nProvider } from "./lib/i18n";
import { GoogleOAuthProvider } from "@react-oauth/google";
// ADMIN_BASE is now a fixed string in adminApi.ts ("/admin-panel") — no secret path in the bundle.
import Home from "./pages/Home";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";

const Temples = lazy(() => import("./pages/Temples"));
const TempleDetail = lazy(() => import("./pages/TempleDetail"));
const Pandits = lazy(() => import("./pages/Pandits"));
const PanditProfile = lazy(() => import("./pages/PanditProfile"));
const Services = lazy(() => import("./pages/Services"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));
const ServicePandits = lazy(() => import("./pages/ServicePandits"));
const TempleMap = lazy(() => import("./pages/TempleMap"));
const AiRecommender = lazy(() => import("./pages/AiRecommender"));
const Blog = lazy(() => import("./pages/Blog"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Login = lazy(() => import("./pages/Login"));
const About = lazy(() => import("./pages/About"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Contact = lazy(() => import("./pages/Contact"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Search = lazy(() => import("./pages/Search"));
const Legal = lazy(() => import("./pages/Legal"));
const AdminApp = lazy(() => import("./admin/AdminApp"));
const PanditApp = lazy(() => import("./pandit/PanditApp"));
const PanditLogin = lazy(() => import("./pages/PanditLogin"));
const PanditForgotPassword = lazy(() => import("./pages/PanditForgotPassword"));

function RouteFallback() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "70vh",
      gap: 18,
      background: "linear-gradient(180deg, #fffcf0 0%, #fff8e7 100%)",
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        border: "3px solid rgba(212,160,23,0.15)",
        borderTopColor: "#d4a017",
        animation: "spin .7s linear infinite",
      }} />
      <span style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: "1.1rem",
        color: "#b8860b",
        fontWeight: 600,
        letterSpacing: ".5px",
      }}>Loading...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={(import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || ""}>
      <I18nProvider>
      <ToastProvider>
      <EnquiryModalProvider>
        <AuthProvider>
          {/* Catches render errors so one broken component shows a message
              instead of unmounting the whole app to a blank white page. */}
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
            {/* Admin panel is at a fixed /admin-panel route.
                Security is backend TOTP (requireAdmin) — not URL obscurity. */}
            <Route path="admin-panel/*" element={<AdminApp />} />
            {/* Pandit dashboard lives outside the public Layout: it has its own
                sidebar shell. The public /dashboard route below is left in place
                so existing links keep working. */}
            <Route path="pandit/*" element={<PanditApp />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="temples" element={<Temples />} />
              <Route path="temples/:id" element={<TempleDetail />} />
              <Route path="pandits" element={<Pandits />} />
              <Route path="pandits/:id" element={<PanditProfile />} />
              <Route path="services" element={<Services />} />
              <Route path="services/:id" element={<ServiceDetail />} />
              <Route path="services/:id/pandits" element={<ServicePandits />} />
              <Route path="search" element={<Search />} />
              <Route path="temple-map" element={<TempleMap />} />
              <Route path="ai-recommender" element={<AiRecommender />} />
              <Route path="blog" element={<Blog />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="about" element={<About />} />
              <Route path="how-it-works" element={<HowItWorks />} />
              <Route path="contact" element={<Contact />} />
              {/* /pandit-ji removed — the AI Pooja Guide at /ai-recommender is
                  the single AI surface. PanditChat.tsx and the /api/chat
                  backend are left in place, unrouted, so nothing else breaks
                  and the code can be deleted deliberately later. */}
              <Route path="login" element={<Login />} />
              <Route path="pandit-login" element={<PanditLogin />} />
              <Route path="pandit-forgot-password" element={<PanditForgotPassword />} />
              <Route path="privacy" element={<Legal />} />
              <Route path="terms" element={<Legal />} />
              <Route path="*" element={<NotFound />} />
            </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </EnquiryModalProvider>
    </ToastProvider>
      </I18nProvider>
    </GoogleOAuthProvider>
  );
}
