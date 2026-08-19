import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedPanditRoute } from "./lib/ProtectedPanditRoute";
import { PanditLayout } from "./components/PanditLayout";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Profile from "./pages/Profile";
import Services from "./pages/Services";
import Availability from "./pages/Availability";
import Reviews from "./pages/Reviews";
import Analytics from "./pages/Analytics";
import Plan from "./pages/Plan";
import Settings from "./pages/Settings";

/**
 * Mounted at /pandit/* from App.tsx. The public site's /dashboard route is
 * left exactly as it was — it is linked from the marketing pages and this
 * change is meant to be additive, not a rug-pull on existing URLs.
 */
export default function PanditApp() {
  return (
    <Routes>
      <Route element={<ProtectedPanditRoute />}>
        <Route element={<PanditLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="dashboard/leads" element={<Leads />} />
          <Route path="dashboard/profile" element={<Profile />} />
          <Route path="dashboard/services" element={<Services />} />
          <Route path="dashboard/availability" element={<Availability />} />
          <Route path="dashboard/reviews" element={<Reviews />} />
          <Route path="dashboard/analytics" element={<Analytics />} />
          <Route path="dashboard/plan" element={<Plan />} />
          <Route path="dashboard/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/pandit/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
