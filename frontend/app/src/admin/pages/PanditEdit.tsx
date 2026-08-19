import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi, ADMIN_BASE, type Paged } from "../lib/adminApi";
import { Icon } from "../../lib/icons";
import { MediaManager } from "../components/MediaManager";

const ALL_LANGUAGES = ["Hindi", "Sanskrit", "English", "Tamil", "Telugu", "Kannada", "Marathi", "Bengali", "Gujarati", "Odia", "Assamese", "Maithili", "Punjabi"];

interface FullPandit {
  id: string;
  slug: string;
  bio: string | null;
  short_bio: string | null;
  experience_years: number;
  primary_specialization: string | null;
  whatsapp_number: string | null;
  public_phone: string | null;
  verification_status: string;
  current_tier: string;
  is_featured: boolean;
  is_available: boolean;
  avg_rating: string;
  review_count: number;
  name: string;
  email: string;
  phone: string | null;
  city: string;
  state: string;
  languages: string[];
  services: { slug: string; name: string; offers_online?: boolean; is_online_available?: boolean }[];
  vedic_education?: string | null;
  gotra?: string | null;
  tradition?: string | null;
  responds_within?: string | null;
  accepts_online?: boolean;
  temples: { slug: string; name: string; association_type: string; is_primary: boolean }[];
}
interface ServiceOpt { slug: string; name: string; is_online_available?: boolean; }
interface TempleOpt { slug: string; name: string; city: string; }

export default function PanditEdit() {
  const { id } = useParams();
  const [pandit, setPandit] = useState<FullPandit | null>(null);
  const [allServices, setAllServices] = useState<ServiceOpt[]>([]);
  const [allTemples, setAllTemples] = useState<TempleOpt[]>([]);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  /** Subset of selectedServices this pandit performs remotely. */
  const [onlineServices, setOnlineServices] = useState<Set<string>>(new Set());
  const [selectedTemples, setSelectedTemples] = useState<Set<string>>(new Set());
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      adminApi.get<FullPandit>(`/pandits/${id}`),
      adminApi.get<Paged<ServiceOpt>>(`/services?perPage=100`),
      adminApi.get<Paged<TempleOpt>>(`/temples?perPage=100`),
    ])
      .then(([p, s, t]) => {
        setPandit(p);
        setAllServices(s.data);
        setAllTemples(t.data);
        setSelectedServices(new Set(p.services.map((x) => x.slug)));
        setOnlineServices(new Set(p.services.filter((x) => x.offers_online).map((x) => x.slug)));
        setSelectedTemples(new Set(p.temples.map((x) => x.slug)));
        setSelectedLangs(new Set(p.languages));
      })
      .catch((err) => setError(err.message || "Failed to load pandit"));
  }, [id]);

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, value: string) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pandit) return;
    setSaving(true);
    setError("");
    setNotice("");
    const data = new FormData(e.currentTarget);
    try {
      const updated = await adminApi.put<FullPandit>(`/pandits/${pandit.slug}`, {
        name: data.get("name"),
        city: data.get("city"),
        state: data.get("state"),
        phone: data.get("phone"),
        bio: data.get("bio"),
        shortBio: data.get("shortBio"),
        experienceYears: Number(data.get("experienceYears") || 0),
        primarySpecialization: data.get("primarySpecialization"),
        whatsappNumber: data.get("whatsappNumber"),
        publicPhone: data.get("publicPhone"),
        isAvailable: data.get("isAvailable") === "on",
        languages: Array.from(selectedLangs),
        // {slug, online} pairs so the backend can record who performs which
        // ritual remotely. Plain slugs are still accepted server-side.
        vedicEducation: (document.getElementById("vedicEducation") as HTMLInputElement)?.value ?? undefined,
        gotra: (document.getElementById("gotra") as HTMLInputElement)?.value ?? undefined,
        tradition: (document.getElementById("tradition") as HTMLInputElement)?.value ?? undefined,
        respondsWithin: (document.getElementById("respondsWithin") as HTMLInputElement)?.value ?? undefined,
        acceptsOnline: (document.getElementById("acceptsOnline") as HTMLInputElement)?.checked ?? undefined,
        services: Array.from(selectedServices).map((slug) => ({
          slug, online: onlineServices.has(slug),
        })),
        temples: Array.from(selectedTemples),
      });
      setPandit(updated);
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function verify(action: "approve" | "reject") {
    if (!pandit) return;
    await adminApi.post(`/pandits/${pandit.slug}/verify`, { action });
    const fresh = await adminApi.get<FullPandit>(`/pandits/${pandit.slug}`);
    setPandit(fresh);
  }

  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNotice, setPwNotice] = useState("");
  const [dob, setDob] = useState("");
  const [dobBusy, setDobBusy] = useState(false);

  async function resetPandinPassword() {
    if (!pandit) return;
    setPwBusy(true); setPwNotice("");
    try {
      await adminApi.post(`/pandits/${pandit.slug}/reset-password`, { temporaryPassword: newPassword });
      // Cleared immediately: this value should not linger in component state
      // or in React DevTools any longer than the request needs it.
      setNewPassword("");
      setPwNotice("Password reset ho gaya. Sessions revoke kar diye gaye.");
    } catch (err) {
      setPwNotice(err instanceof Error ? err.message : "Reset nahi ho paya.");
    } finally { setPwBusy(false); }
  }

  async function saveDob() {
    if (!pandit) return;
    setDobBusy(true);
    try {
      await adminApi.put(`/pandits/${pandit.slug}/date-of-birth`, { dateOfBirth: dob });
      setPwNotice("Date of birth save ho gayi.");
    } catch (err) {
      setPwNotice(err instanceof Error ? err.message : "Save nahi ho paya.");
    } finally { setDobBusy(false); }
  }

  async function setTier(tier: string) {
    if (!pandit) return;
    await adminApi.post(`/pandits/${pandit.slug}/subscription`, { tier });
    const fresh = await adminApi.get<FullPandit>(`/pandits/${pandit.slug}`);
    setPandit(fresh);
  }

  async function toggleFeatured() {
    if (!pandit) return;
    await adminApi.post(`/pandits/${pandit.slug}/toggle-featured`, { featured: !pandit.is_featured });
    const fresh = await adminApi.get<FullPandit>(`/pandits/${pandit.slug}`);
    setPandit(fresh);
  }

  if (error && !pandit) return <div className="admin-login__error">{error}</div>;
  if (!pandit) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <Link to={`${ADMIN_BASE}/pandits`} className="row" style={{ gap: 6, fontSize: ".85rem", color: "var(--gold-deep)", fontWeight: 600 }}>
            <Icon name="chevron-left" size={16} /> All pandits
          </Link>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem", marginTop: 8 }}>{pandit.name}</h2>
          <p>{pandit.avg_rating ? Number(pandit.avg_rating).toFixed(1) : "—"} ★ · {pandit.review_count} reviews · slug: {pandit.slug}</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {pandit.verification_status !== "verified" && (
            <button className="btn btn-gold btn-sm" onClick={() => verify("approve")}><Icon name="check" size={14} /> Approve</button>
          )}
          {pandit.verification_status !== "rejected" && (
            <button className="btn btn-outline btn-sm" onClick={() => verify("reject")}>Reject</button>
          )}
          <button className={`btn btn-sm ${pandit.is_featured ? "btn-gold" : "btn-outline"}`} onClick={toggleFeatured}>
            <Icon name="sparkles" size={14} /> {pandit.is_featured ? "Unfeature" : "Feature"}
          </button>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}
      {notice && <div className="admin-login__setup" style={{ marginBottom: 18 }}>{notice}</div>}

      <div className="grid g-2" style={{ alignItems: "start", gap: 18 }}>
        <form className="admin-panel" onSubmit={onSave} style={{ gridColumn: "1 / -1" }}>
          <div className="admin-panel__head"><h2>Profile</h2></div>
          <div className="admin-panel__body">
            <div className="admin-form-grid">
              <div className="admin-field"><label>Full name</label><input className="input" name="name" defaultValue={pandit.name} required /></div>
              <div className="admin-field"><label>Phone</label><input className="input" name="phone" defaultValue={pandit.phone || ""} /></div>
              <div className="admin-field"><label>City</label><input className="input" name="city" defaultValue={pandit.city} required /></div>
              <div className="admin-field"><label>State</label><input className="input" name="state" defaultValue={pandit.state} required /></div>
              <div className="admin-field"><label>Experience (years)</label><input className="input" name="experienceYears" type="number" min={0} defaultValue={pandit.experience_years} /></div>
              <div className="admin-field"><label>Primary specialization</label><input className="input" name="primarySpecialization" defaultValue={pandit.primary_specialization || ""} /></div>
              <div className="admin-field"><label>WhatsApp number</label><input className="input" name="whatsappNumber" defaultValue={pandit.whatsapp_number || ""} /></div>
              <div className="admin-field"><label>Public phone</label><input className="input" name="publicPhone" defaultValue={pandit.public_phone || ""} /></div>
              <div className="admin-field admin-field--full"><label>Short bio</label><input className="input" name="shortBio" defaultValue={pandit.short_bio || ""} maxLength={300} /></div>
              <div className="admin-field admin-field--full"><label>Full bio</label><textarea className="textarea" name="bio" defaultValue={pandit.bio || ""} style={{ minHeight: 100 }} /></div>
              <div className="admin-field">
                <label className="row" style={{ gap: 8 }}><input type="checkbox" name="isAvailable" defaultChecked={pandit.is_available} /> Currently accepting enquiries</label>
              </div>
            </div>

            <div className="admin-field admin-field--full" style={{ marginTop: 18 }}>
              <label>Languages spoken</label>
              <div className="admin-chip-grid">
                {ALL_LANGUAGES.map((l) => (
                  <button type="button" key={l} className={`admin-chip${selectedLangs.has(l) ? " is-on" : ""}`} onClick={() => toggle(selectedLangs, setSelectedLangs, l)}>{l}</button>
                ))}
              </div>
            </div>

            <div className="admin-form-grid" style={{ marginTop: 18 }}>
              <div className="admin-field">
                <label htmlFor="vedicEducation">Vedic education</label>
                <input className="input" id="vedicEducation" defaultValue={pandit.vedic_education || ""}
                  placeholder="Acharya, Sanskrit &amp; Jyotish — Ujjain" />
              </div>
              <div className="admin-field">
                <label htmlFor="gotra">Gotra</label>
                <input className="input" id="gotra" defaultValue={pandit.gotra || ""} placeholder="Bharadwaj" />
              </div>
              <div className="admin-field">
                <label htmlFor="tradition">Tradition / sampradaya</label>
                <input className="input" id="tradition" defaultValue={pandit.tradition || ""} placeholder="Shakt" />
              </div>
              <div className="admin-field">
                <label htmlFor="respondsWithin">Response time</label>
                <input className="input" id="respondsWithin" defaultValue={pandit.responds_within || ""}
                  placeholder="Usually replies within 2 hours" />
                <small style={{ opacity: .7 }}>Free text. Blank = section hidden.</small>
              </div>
              <div className="admin-field">
                <label className="row" style={{ gap: 8, marginTop: 22 }}>
                  <input type="checkbox" id="acceptsOnline" defaultChecked={pandit.accepts_online} />
                  Accepts online puja
                </label>
              </div>
            </div>

            <div className="admin-field admin-field--full" style={{ marginTop: 18 }}>
              <label>Services offered <span className="hint">({selectedServices.size} selected)</span></label>
              <p className="hint" style={{ margin: "0 0 8px" }}>
                Service select karein. Jo ritual online ho sakta hai uske aage 🌐 dabakar
                is Pandit ji ko online havan ke liye allocate karein.
              </p>
              <div className="admin-chip-grid">
                {allServices.map((s) => {
                  const on = selectedServices.has(s.slug);
                  const online = onlineServices.has(s.slug);
                  return (
                    <span key={s.slug} className="admin-chip-wrap">
                      <button
                        type="button"
                        className={`admin-chip${on ? " is-on" : ""}`}
                        onClick={() => {
                          toggle(selectedServices, setSelectedServices, s.slug);
                          // Deselecting a service must clear its online flag,
                          // otherwise a hidden true survives the next save.
                          if (on && online) toggle(onlineServices, setOnlineServices, s.slug);
                        }}
                      >{s.name}</button>
                      {on && s.is_online_available && (
                        <button
                          type="button"
                          className={`admin-chip admin-chip--online${online ? " is-on" : ""}`}
                          title={online ? "Online allocated — click to remove" : "Allocate for online puja"}
                          aria-pressed={online}
                          onClick={() => toggle(onlineServices, setOnlineServices, s.slug)}
                        >🌐</button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="admin-field admin-field--full" style={{ marginTop: 18 }}>
              <label>Associated temples <span className="hint">({selectedTemples.size} selected)</span></label>
              <div className="admin-chip-grid">
                {allTemples.map((t) => (
                  <button type="button" key={t.slug} className={`admin-chip${selectedTemples.has(t.slug) ? " is-on" : ""}`} onClick={() => toggle(selectedTemples, setSelectedTemples, t.slug)}>{t.name} <span className="hint">· {t.city}</span></button>
                ))}
              </div>
            </div>

            <button className="btn btn-gold" type="submit" disabled={saving} style={{ marginTop: 22 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>

        <div className="admin-panel">
          <div className="admin-panel__head"><h2>Subscription tier</h2></div>
          <div className="admin-panel__body row" style={{ gap: 8, flexWrap: "wrap" }}>
            {["free", "silver", "gold", "diamond"].map((t) => (
              <button key={t} className={`btn btn-sm ${pandit.current_tier === t ? "btn-gold" : "btn-outline"}`} onClick={() => setTier(t)} style={{ textTransform: "capitalize" }}>{t}</button>
            ))}
          </div>
        </div>

        <MediaManager slug={pandit.slug} />

        <div className="admin-panel">
          <div className="admin-panel__head"><h2>Account access</h2></div>
          <div className="admin-panel__body">
            {/* A reset, never a reveal: the stored value is a bcrypt hash, so
                the existing password cannot be displayed by design. */}
            <label className="admin-field" style={{ display: "block" }}>
              <span>New temporary password</span>
              <input
                className="input" type="text" autoComplete="off" minLength={8}
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="min 8 chars, ek letter + ek number"
              />
            </label>
            <button
              className="btn btn-outline btn-block" style={{ marginTop: 10 }}
              disabled={pwBusy || newPassword.length < 8}
              onClick={resetPandinPassword}
            >
              {pwBusy ? "Resetting…" : "Reset Pandit Password"}
            </button>
            {pwNotice && <p style={{ marginTop: 8, fontSize: ".85rem" }}>{pwNotice}</p>}
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>
              Reset karte hi pandit ke saare active sessions logout ho jaayenge.
              Purana password kabhi dikhaya nahi ja sakta.
            </p>

            <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid var(--admin-line, #e8d5b7)" }} />

            <label className="admin-field" style={{ display: "block" }}>
              <span>Date of birth (password-reset factor)</span>
              <input
                className="input" type="date" max={new Date().toISOString().slice(0, 10)}
                value={dob} onChange={(e) => setDob(e.target.value)}
              />
            </label>
            <button
              className="btn btn-outline btn-block" style={{ marginTop: 10 }}
              disabled={dobBusy || !dob} onClick={saveDob}
            >
              {dobBusy ? "Saving…" : "Save date of birth"}
            </button>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel__head"><h2>Public profile</h2></div>
          <div className="admin-panel__body">
            <Link className="btn btn-outline btn-block" to={`/pandits/${pandit.slug}`} target="_blank"><Icon name="eye" size={15} /> View live profile</Link>
          </div>
        </div>
      </div>
    </>
  );
}
