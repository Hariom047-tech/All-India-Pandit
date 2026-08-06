import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Icon } from "../lib/icons";
import { useAuth } from "../lib/Auth";
import { useToast } from "../components/ui/Toast";

const SECTIONS = [
  { id: "profile", label: "My Profile", icon: "user" },
  { id: "saved", label: "Saved Pandits", icon: "heart" },
  { id: "inquiries", label: "My Inquiries", icon: "message-circle" },
];

export default function Dashboard() {
  const { user, loading, logout, updateUser } = useAuth();
  const [section, setSection] = useState("profile");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const [name, setName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  async function onProfileSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      // In a real app we'd have a PUT /api/auth/me or similar
      // Since it's demo, we mock it by updating context:
      updateUser({ ...user!, full_name: name, phone });
      toast("Profile saved successfully.");
    } catch (err: any) {
      toast("Failed to save profile: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="page-hero" style={{ padding: "44px 0 32px" }}>
        <img src="/assets/img/mandala.svg" className="watermark watermark--tr" alt="" />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs crumbs--left" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> My Profile</nav>
          <div className="row-between" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <div>
              <h1 className="section-title section-title--left" style={{ fontSize: "clamp(1.7rem,3vw,2.4rem)" }}>Devotee Dashboard</h1>
              <p className="muted" style={{ marginTop: 6 }}>Welcome back, {user.full_name}. Manage your profile and saved pandits here.</p>
            </div>
            <button className="btn btn-outline" onClick={logout}>
              <Icon name="log-out" size={17} /> Log Out
            </button>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 34, minHeight: "60vh" }}>
        <div className="shell dash">
          <aside className="dash-nav" aria-label="Dashboard sections">
            {SECTIONS.map((s) => (
              <button key={s.id} className={section === s.id ? "is-active" : ""} onClick={() => setSection(s.id)}>
                <Icon name={s.icon} size={18} /> {s.label}
              </button>
            ))}
          </aside>

          <div>
            {section === "profile" && (
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: 6 }}>My Profile</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Update your personal details below.</p>
                <form className="card card-pad" onSubmit={onProfileSave}>
                  <div className="grid g-2" style={{ gap: 16 }}>
                    <div>
                      <label className="label" htmlFor="dpName">Full Name</label>
                      <input className="input" id="dpName" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div>
                      <label className="label" htmlFor="dpPhone">Phone Number</label>
                      <input className="input" id="dpPhone" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="label" htmlFor="dpEmail">Email Address</label>
                      <input className="input" id="dpEmail" value={user.email} disabled style={{ background: "#f5f5f5", cursor: "not-allowed" }} />
                      <span className="muted" style={{ fontSize: "0.8rem", display: "block", marginTop: 4 }}>Email cannot be changed</span>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 12, marginTop: 22 }}>
                    <button className="btn btn-gold" type="submit" disabled={saving}>
                      <Icon name="check" size={17} /> {saving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {section === "saved" && (
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: 6 }}>Saved Pandits</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Pandits you've bookmarked for future poojas.</p>
                
                <div className="card card-pad" style={{ textAlign: "center", padding: "60px 20px" }}>
                  <Icon name="heart" size={48} style={{ color: "#ccc", marginBottom: 16 }} />
                  <h3 style={{ fontSize: "1.2rem", marginBottom: 8 }}>No saved pandits yet</h3>
                  <p className="muted" style={{ maxWidth: 400, margin: "0 auto 24px" }}>
                    When you find a Pandit Ji you like, click the heart icon on their profile to save them here.
                  </p>
                  <Link className="btn btn-gold" to="/pandits">Browse Pandits</Link>
                </div>
              </div>
            )}

            {section === "inquiries" && (
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: 6 }}>My Inquiries</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Messages and booking inquiries you've sent.</p>
                
                <div className="card card-pad" style={{ textAlign: "center", padding: "60px 20px" }}>
                  <Icon name="message-square" size={48} style={{ color: "#ccc", marginBottom: 16 }} />
                  <h3 style={{ fontSize: "1.2rem", marginBottom: 8 }}>No inquiries sent</h3>
                  <p className="muted" style={{ maxWidth: 400, margin: "0 auto" }}>
                    Reach out to pandits directly via phone or WhatsApp to see them appear here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
