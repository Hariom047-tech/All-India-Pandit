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

const Temples = lazy(() => import("./pages/Temples"));
const TempleDetail = lazy(() => import("./pages/TempleDetail"));
const Pandits = lazy(() => import("./pages/Pandits"));
const PanditProfile = lazy(() => import("./pages/PanditProfile"));
const Services = lazy(() => import("./pages/Services"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));
const Panchang = lazy(() => import("./pages/Panchang"));
const Festivals = lazy(() => import("./pages/Festivals"));
const TempleMap = lazy(() => import("./pages/TempleMap"));
const AiRecommender = lazy(() => import("./pages/AiRecommender"));
const Blog = lazy(() => import("./pages/Blog"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Login = lazy(() => import("./pages/Login"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PanditChat = lazy(() => import("./pages/PanditChat"));
const Search = lazy(() => import("./pages/Search"));
const Legal = lazy(() => import("./pages/Legal"));
const AdminApp = lazy(() => import("./admin/AdminApp"));

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
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Admin panel is at a fixed /admin-panel route.
                Security is backend TOTP (requireAdmin) — not URL obscurity. */}
            <Route path="admin-panel/*" element={<AdminApp />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="temples" element={<Temples />} />
              <Route path="temples/:id" element={<TempleDetail />} />
              <Route path="pandits" element={<Pandits />} />
              <Route path="pandits/:id" element={<PanditProfile />} />
              <Route path="services" element={<Services />} />
              <Route path="services/:id" element={<ServiceDetail />} />
              <Route path="panchang" element={<Panchang />} />
              <Route path="festivals" element={<Festivals />} />
              <Route path="search" element={<Search />} />
              <Route path="temple-map" element={<TempleMap />} />
              <Route path="ai-recommender" element={<AiRecommender />} />
              <Route path="blog" element={<Blog />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="about" element={<About />} />
              <Route path="contact" element={<Contact />} />
              <Route path="pandit-ji" element={<PanditChat />} />
              <Route path="login" element={<Login />} />
              <Route path="privacy" element={<Legal />} />
              <Route path="terms" element={<Legal />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
        </AuthProvider>
      </EnquiryModalProvider>
    </ToastProvider>
      </I18nProvider>
    </GoogleOAuthProvider>
  );
}
