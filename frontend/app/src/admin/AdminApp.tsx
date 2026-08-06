import { Routes, Route } from "react-router-dom";
import { AdminAuthProvider } from "./lib/AdminAuth";
import { AdminLayout } from "./components/AdminLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AdminPandits from "./pages/Pandits";
import CreatePandit from "./pages/CreatePandit";
import PanditEdit from "./pages/PanditEdit";
import AdminTemples from "./pages/Temples";
import AdminServices from "./pages/Services";
import AdminReviews from "./pages/Reviews";
import AdminUsers from "./pages/Users";
import AdminInquiries from "./pages/Inquiries";
import AdminAnalytics from "./pages/Analytics";
import AdminSecurity from "./pages/Security";
import AdminSettings from "./pages/Settings";
import LeadDistribution from "./pages/LeadDistribution";
import "./admin.css";

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="pandits" element={<AdminPandits />} />
          <Route path="pandits/new" element={<CreatePandit />} />
          <Route path="pandits/:id" element={<PanditEdit />} />
          <Route path="temples" element={<AdminTemples />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="inquiries" element={<AdminInquiries />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="leads" element={<LeadDistribution />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
