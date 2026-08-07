import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Icon } from "../lib/icons";
import { useAuth } from "../lib/Auth";
import { useToast } from "../components/ui/Toast";
import { motion, AnimatePresence } from "framer-motion";

const SECTIONS = [
  { id: "profile", label: "My Profile", icon: "user" },
  { id: "bookings", label: "My Consultations", icon: "calendar" },
  { id: "saved", label: "Saved Pandits", icon: "heart" },
];

export default function Dashboard() {
  const { user, loading, logout, updateUser } = useAuth();
  const location = useLocation();
  const [section, setSection] = useState("profile");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const [name, setName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  
  // Astrology / Kundli specific fields
  const [dob, setDob] = useState("");
  const [tob, setTob] = useState("");
  const [pob, setPob] = useState("");
  const [gender, setGender] = useState("male");

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  async function onProfileSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      updateUser({ ...user!, full_name: name, phone });
      toast("Profile & Astrology details saved successfully!");
    } catch (err: any) {
      toast("Failed to save profile: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", paddingBottom: 60 }}>
      {/* Premium Gradient Hero */}
      <div style={{ 
        background: "linear-gradient(135deg, #1e1e1e 0%, #3a3a3a 100%)", 
        padding: "60px 0 100px", 
        color: "#fff",
        position: "relative",
        overflow: "hidden"
      }}>
        <div 
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            background: "url(/assets/img/mandala.svg) no-repeat center/contain",
            opacity: 0.1,
            animation: "spin 60s linear infinite"
          }} 
        />
        <div className="shell" style={{ position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              {/* Avatar Profile */}
              <div style={{ 
                width: 90, 
                height: 90, 
                borderRadius: "50%", 
                background: "#FFD700", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                fontSize: "2.5rem",
                fontWeight: 800,
                color: "#1e1e1e",
                border: "4px solid rgba(255,255,255,0.2)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.2)"
              }}>
                {user.full_name?.charAt(0).toUpperCase() || "D"}
              </div>
              <div>
                <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", margin: "0 0 8px 0", fontWeight: 700 }}>{user.full_name}</h1>
                <p style={{ margin: 0, opacity: 0.8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="phone" size={14} /> {user.phone}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Layout */}
      <div className="shell dash" style={{ marginTop: "-40px", position: "relative", zIndex: 10 }}>
        {/* Left Sidebar */}
        <aside className="dash-nav" style={{ 
          background: "#fff", 
          borderRadius: 16, 
          padding: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          marginBottom: 20
        }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SECTIONS.map((s) => {
              const isActive = section === s.id;
              return (
                <button 
                  key={s.id} 
                  onClick={() => setSection(s.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    background: isActive ? "#fff9e6" : "transparent",
                    color: isActive ? "#b8860b" : "#555",
                    border: "none",
                    borderRadius: 10,
                    fontWeight: isActive ? 600 : 500,
                    fontSize: "0.95rem",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "left"
                  }}
                >
                  <Icon name={s.icon} size={18} style={{ color: isActive ? "#FFD700" : "#999" }} /> 
                  {s.label}
                </button>
              );
            })}
          </nav>
          <hr style={{ margin: "16px 12px", borderColor: "#f0f0f0" }} />
          <button 
            onClick={logout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              background: "transparent",
              color: "#e53e3e",
              border: "none",
              width: "100%",
              borderRadius: 10,
              fontWeight: 500,
              fontSize: "0.95rem",
              cursor: "pointer",
              textAlign: "left"
            }}
          >
            <Icon name="log-out" size={18} /> Log Out
          </button>
        </aside>

        {/* Right Content Area */}
        <main style={{ minHeight: 400 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* 1. PROFILE SECTION */}
              {section === "profile" && (
                <div style={{ background: "#fff", borderRadius: 16, padding: "32px clamp(16px, 4vw, 32px)", boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}>
                  <div style={{ marginBottom: 30 }}>
                    <h2 style={{ fontSize: "1.4rem", margin: "0 0 6px 0", color: "#111" }}>Personal & Astrology Details</h2>
                    <p style={{ margin: 0, color: "#666", fontSize: "0.95rem" }}>Provide your birth details for accurate Kundli and Pandit consultations.</p>
                  </div>

                  <form onSubmit={onProfileSave}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: 16, color: "#333", borderBottom: "1px solid #eee", paddingBottom: 8 }}>Basic Info</h3>
                    <div className="grid g-2" style={{ gap: 20, marginBottom: 32 }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", color: "#555", marginBottom: 6, fontWeight: 500 }}>Full Name</label>
                        <input 
                          value={name} 
                          onChange={e => setName(e.target.value)} 
                          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: "0.95rem", outline: "none" }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", color: "#555", marginBottom: 6, fontWeight: 500 }}>Phone Number</label>
                        <input 
                          value={phone} 
                          disabled 
                          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: "0.95rem", background: "#f9f9f9", color: "#888" }} 
                        />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ display: "block", fontSize: "0.85rem", color: "#555", marginBottom: 6, fontWeight: 500 }}>Email Address</label>
                        <input 
                          value={user.email} 
                          disabled 
                          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: "0.95rem", background: "#f9f9f9", color: "#888" }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", color: "#555", marginBottom: 6, fontWeight: 500 }}>Gender</label>
                        <select 
                          value={gender}
                          onChange={e => setGender(e.target.value)}
                          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: "0.95rem", outline: "none", background: "#fff" }}
                        >
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    <h3 style={{ fontSize: "1.1rem", marginBottom: 16, color: "#333", borderBottom: "1px solid #eee", paddingBottom: 8 }}>Birth Details (For Kundli)</h3>
                    <div className="grid g-3" style={{ gap: 20, marginBottom: 32 }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", color: "#555", marginBottom: 6, fontWeight: 500 }}>Date of Birth</label>
                        <input 
                          type="date"
                          value={dob} 
                          onChange={e => setDob(e.target.value)} 
                          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: "0.95rem", outline: "none" }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", color: "#555", marginBottom: 6, fontWeight: 500 }}>Time of Birth</label>
                        <input 
                          type="time"
                          value={tob} 
                          onChange={e => setTob(e.target.value)} 
                          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: "0.95rem", outline: "none" }} 
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", color: "#555", marginBottom: 6, fontWeight: 500 }}>Place of Birth</label>
                        <input 
                          placeholder="e.g. Ujjain, MP"
                          value={pob} 
                          onChange={e => setPob(e.target.value)} 
                          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: "0.95rem", outline: "none" }} 
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button 
                        type="submit" 
                        disabled={saving}
                        style={{
                          background: "#FFD700",
                          color: "#000",
                          border: "none",
                          padding: "14px 32px",
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: "1rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          justifyContent: "center"
                        }}
                      >
                        <Icon name="check" size={18} /> {saving ? "Saving..." : "Save Details"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* 3. BOOKINGS SECTION */}
              {section === "bookings" && (
                <div style={{ background: "#fff", borderRadius: 16, padding: "32px clamp(16px, 4vw, 32px)", boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}>
                  <h2 style={{ fontSize: "1.4rem", margin: "0 0 24px 0", color: "#111" }}>My Consultations</h2>
                  <div style={{ textAlign: "center", padding: "60px 20px" }}>
                    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                      <Icon name="calendar" size={32} style={{ color: "#ccc" }} />
                    </div>
                    <h3 style={{ margin: "0 0 8px 0", color: "#555" }}>No recent consultations</h3>
                    <p style={{ margin: "0 0 24px 0", color: "#999", fontSize: "0.95rem" }}>You haven't chatted or called any Pandit recently.</p>
                    <Link to="/pandits" style={{ display: "inline-block", background: "#FFD700", color: "#000", padding: "12px 24px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
                      Find a Pandit
                    </Link>
                  </div>
                </div>
              )}

              {/* 4. SAVED SECTION */}
              {section === "saved" && (
                <div style={{ background: "#fff", borderRadius: 16, padding: "32px clamp(16px, 4vw, 32px)", boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}>
                  <h2 style={{ fontSize: "1.4rem", margin: "0 0 24px 0", color: "#111" }}>Saved Pandits</h2>
                  <div style={{ textAlign: "center", padding: "60px 20px" }}>
                    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                      <Icon name="heart" size={32} style={{ color: "#f87171" }} />
                    </div>
                    <h3 style={{ margin: "0 0 8px 0", color: "#555" }}>No saved profiles</h3>
                    <p style={{ margin: "0 0 24px 0", color: "#999", fontSize: "0.95rem" }}>Click the heart icon on any Pandit's profile to save them here.</p>
                    <Link to="/pandits" style={{ display: "inline-block", background: "#FFD700", color: "#000", padding: "12px 24px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
                      Explore Pandits
                    </Link>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
