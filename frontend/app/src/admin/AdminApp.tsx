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
import AdminFaqs from "./pages/Faqs";
import AdminUsers from "./pages/Users";
import AdminUserDetail from "./pages/UserDetail";
import AdminUsersList from "./pages/AdminUsersList";
import AdminPanditAnalytics from "./pages/PanditAnalytics";
import AdminInquiries from "./pages/Inquiries";
import AdminAnalytics from "./pages/Analytics";
import AdminSecurity from "./pages/Security";
import AdminSettings from "./pages/Settings";
import Distribution from "./pages/Distribution";
import AiKnowledge from "./pages/AiKnowledge";
import AiAnalytics from "./pages/AiAnalytics";
import Plans from "./pages/Plans";
import AdminSubscriptions from "./pages/Subscriptions";
import AdminPayments from "./pages/Payments";
import AdminRevenue from "./pages/Revenue";
import HomeSettings from "./pages/HomeSettings";
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
          <Route path="pandits/:id/analytics" element={<AdminPanditAnalytics />} />
          <Route path="temples" element={<AdminTemples />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="faqs" element={<AdminFaqs />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="admin-users" element={<AdminUsersList />} />
          <Route path="inquiries" element={<AdminInquiries />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="distribution" element={<Distribution />} />
          <Route path="ai-knowledge" element={<AiKnowledge />} />
          <Route path="ai-analytics" element={<AiAnalytics />} />
          <Route path="plans" element={<Plans />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="revenue" element={<AdminRevenue />} />
          <Route path="home" element={<HomeSettings />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
