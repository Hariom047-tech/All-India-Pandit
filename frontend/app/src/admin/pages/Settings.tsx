import { useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../lib/adminApi";
import { useAdminAuth } from "../lib/AdminAuth";

interface Setting { key: string; value: unknown; description: string | null; updated_at: string; }

interface TaxSettings {
  enabled: boolean; name: string; percentage: number; inclusive: boolean;
  businessGstin: string; businessLegalName: string; businessAddress: string; invoicePrefix: string;
}

const DEFAULT_TAX: TaxSettings = {
  enabled: false, name: "GST", percentage: 18, inclusive: false,
  businessGstin: "", businessLegalName: "", businessAddress: "", invoicePrefix: "INV",
};

interface ReminderSettings { enabled: boolean; offsets: number[] }
const DEFAULT_REMINDERS: ReminderSettings = { enabled: true, offsets: [7, 5, 3, 1, 0, -3] };
/** Matches services/billing/reminderScheduler.js's own offset semantics —
 *  >=0 is "N days before expiry", negative is "N days after". */
const OFFSET_CHOICES: { value: number; label: string }[] = [
  { value: 7, label: "7 days before" },
  { value: 5, label: "5 days before" },
  { value: 3, label: "3 days before" },
  { value: 1, label: "1 day before" },
  { value: 0, label: "On the day of expiry" },
  { value: -3, label: "3 days after (grace check-in)" },
];

/**
 * A friendly structured form over the SAME generic /settings/billing_tax
 * key the raw key/value table below already edits — no new backend route,
 * just a form that can't produce invalid JSON for something financially
 * sensitive. Defaults OFF: an admin who has never touched this never has a
 * GST rate invented for them (see backend/src/services/billing/tax.js).
 */
function BillingTaxPanel({ canEdit, settings }: { canEdit: boolean; settings: Setting[] }) {
  const [tax, setTax] = useState<TaxSettings>(DEFAULT_TAX);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Hydrates from the SAME list the generic key/value table below already
  // loads (AdminSettings' own load()) — one request, one source of truth
  // for whether billing_tax has been saved yet.
  useEffect(() => {
    const row = settings.find((s) => s.key === "billing_tax");
    if (row && row.value && typeof row.value === "object") {
      setTax({ ...DEFAULT_TAX, ...(row.value as Partial<TaxSettings>) });
    }
  }, [settings]);

  async function save() {
    setSaving(true); setNotice(""); setError("");
    try {
      await adminApi.put("/settings/billing_tax", {
        value: tax,
        description: "GST/tax config for pandit plan purchases — see services/billing/tax.js",
      });
      setNotice("Billing & tax settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-panel" style={{ marginBottom: 18 }}>
      <div className="admin-panel__head"><h2>Billing &amp; Tax</h2></div>
      <div className="admin-panel__body">
        <p className="muted" style={{ fontSize: ".85rem", marginTop: 0 }}>
          Off by default — no GST is added to a plan price until this is explicitly enabled with a real rate.
        </p>
        {notice && <div className="admin-login__setup" style={{ marginBottom: 12 }}>{notice}</div>}
        {error && <div className="admin-login__error" style={{ marginBottom: 12 }}>{error}</div>}

        <label className="row" style={{ gap: 8, marginBottom: 14 }}>
          <input type="checkbox" checked={tax.enabled} disabled={!canEdit}
            onChange={(e) => setTax((t) => ({ ...t, enabled: e.target.checked }))} />
          Enable tax on plan purchases
        </label>

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Tax name</span>
            <input className="input" value={tax.name} disabled={!canEdit}
              onChange={(e) => setTax((t) => ({ ...t, name: e.target.value }))} />
          </label>
          <label className="admin-field">
            <span>Percentage</span>
            <input className="input" type="number" min={0} max={100} step="0.01" value={tax.percentage} disabled={!canEdit}
              onChange={(e) => setTax((t) => ({ ...t, percentage: Number(e.target.value) }))} />
          </label>
          <label className="admin-field">
            <span>Price is</span>
            <select className="select" value={tax.inclusive ? "inclusive" : "exclusive"} disabled={!canEdit}
              onChange={(e) => setTax((t) => ({ ...t, inclusive: e.target.value === "inclusive" }))}>
              <option value="exclusive">Tax added on top of the listed price</option>
              <option value="inclusive">Listed price already includes tax</option>
            </select>
          </label>
          <label className="admin-field">
            <span>Invoice number prefix</span>
            <input className="input" value={tax.invoicePrefix} disabled={!canEdit}
              onChange={(e) => setTax((t) => ({ ...t, invoicePrefix: e.target.value }))} />
          </label>
          <label className="admin-field">
            <span>Business GSTIN</span>
            <input className="input" value={tax.businessGstin} disabled={!canEdit}
              onChange={(e) => setTax((t) => ({ ...t, businessGstin: e.target.value }))} />
          </label>
          <label className="admin-field">
            <span>Business legal name</span>
            <input className="input" value={tax.businessLegalName} disabled={!canEdit}
              onChange={(e) => setTax((t) => ({ ...t, businessLegalName: e.target.value }))} />
          </label>
          <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
            <span>Business address</span>
            <input className="input" value={tax.businessAddress} disabled={!canEdit}
              onChange={(e) => setTax((t) => ({ ...t, businessAddress: e.target.value }))} />
          </label>
        </div>

        {canEdit && (
          <button className="btn btn-gold" style={{ marginTop: 12 }} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save billing & tax settings"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Same pattern as BillingTaxPanel — a friendly form over the generic
 * /settings/billing_reminders key, driving services/billing/reminderScheduler.js.
 * Toggling an offset off here means that reminder is simply never dispatched;
 * it does not retroactively un-send ones already logged in
 * subscription_reminder_log.
 */
function ReminderSettingsPanel({ canEdit, settings }: { canEdit: boolean; settings: Setting[] }) {
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const row = settings.find((s) => s.key === "billing_reminders");
    if (row && row.value && typeof row.value === "object") {
      setReminders({ ...DEFAULT_REMINDERS, ...(row.value as Partial<ReminderSettings>) });
    }
  }, [settings]);

  function toggleOffset(value: number) {
    setReminders((r) => ({
      ...r,
      offsets: r.offsets.includes(value) ? r.offsets.filter((o) => o !== value) : [...r.offsets, value].sort((a, b) => b - a),
    }));
  }

  async function save() {
    setSaving(true); setNotice(""); setError("");
    try {
      await adminApi.put("/settings/billing_reminders", {
        value: reminders,
        description: "Subscription expiry reminder offsets — see services/billing/reminderScheduler.js",
      });
      setNotice("Reminder settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-panel" style={{ marginBottom: 18 }}>
      <div className="admin-panel__head"><h2>Subscription Reminders</h2></div>
      <div className="admin-panel__body">
        <p className="muted" style={{ fontSize: ".85rem", marginTop: 0 }}>
          In-app notification + dashboard banner (the mandatory channel) — sent once per pandit per offset, never twice.
        </p>
        {notice && <div className="admin-login__setup" style={{ marginBottom: 12 }}>{notice}</div>}
        {error && <div className="admin-login__error" style={{ marginBottom: 12 }}>{error}</div>}

        <label className="row" style={{ gap: 8, marginBottom: 14 }}>
          <input type="checkbox" checked={reminders.enabled} disabled={!canEdit}
            onChange={(e) => setReminders((r) => ({ ...r, enabled: e.target.checked }))} />
          Enable expiry reminders
        </label>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {OFFSET_CHOICES.map((o) => (
            <label key={o.value} className="row" style={{ gap: 6, border: "1px solid var(--border-soft)", borderRadius: 8, padding: "6px 12px" }}>
              <input type="checkbox" checked={reminders.offsets.includes(o.value)} disabled={!canEdit}
                onChange={() => toggleOffset(o.value)} />
              {o.label}
            </label>
          ))}
        </div>

        {canEdit && (
          <button className="btn btn-gold" style={{ marginTop: 14 }} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save reminder settings"}
          </button>
        )}
      </div>
    </div>
  );
}

const DEFAULT_PANDITS_PER_PAGE = 30;

/**
 * Same generic-key pattern as the panels above, over /settings/pandits_per_page
 * (a plain number, not an object). Drives PER_PAGE on the public /pandits
 * directory (frontend/app/src/pages/Pandits.tsx) via GET /api/settings.
 */
function PanditsPerPagePanel({ canEdit, settings }: { canEdit: boolean; settings: Setting[] }) {
  const [perPage, setPerPage] = useState(DEFAULT_PANDITS_PER_PAGE);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const row = settings.find((s) => s.key === "pandits_per_page");
    if (row && typeof row.value === "number" && row.value > 0) setPerPage(row.value);
  }, [settings]);

  async function save() {
    setSaving(true); setNotice(""); setError("");
    try {
      await adminApi.put("/settings/pandits_per_page", {
        value: perPage,
        description: "Pandit cards per page on the public /pandits directory — see pages/Pandits.tsx",
      });
      setNotice("Pandit directory page size saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-panel" style={{ marginBottom: 18 }}>
      <div className="admin-panel__head"><h2>Pandit Directory</h2></div>
      <div className="admin-panel__body">
        <p className="muted" style={{ fontSize: ".85rem", marginTop: 0 }}>
          How many pandit cards show per page on the public Pandits page, before "Next" pagination kicks in.
        </p>
        {notice && <div className="admin-login__setup" style={{ marginBottom: 12 }}>{notice}</div>}
        {error && <div className="admin-login__error" style={{ marginBottom: 12 }}>{error}</div>}

        <label className="admin-field" style={{ maxWidth: 220 }}>
          <span>Cards per page</span>
          <input className="input" type="number" min={5} max={200} step={5} value={perPage} disabled={!canEdit}
            onChange={(e) => setPerPage(Math.max(1, Number(e.target.value)))} />
        </label>

        {canEdit && (
          <button className="btn btn-gold" style={{ marginTop: 12 }} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { user } = useAdminAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canEdit = user?.role === "super_admin";

  async function load() {
    setSettings(await adminApi.get<Setting[]>("/settings"));
  }
  useEffect(() => { load(); }, []);

  async function onSave(key: string, raw: string) {
    setError(""); setNotice("");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      setError(`"${key}": value must be valid JSON — wrap plain text in quotes, e.g. "yes".`);
      return;
    }
    try {
      await adminApi.put(`/settings/${key}`, { value });
      setNotice(`${key} saved.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setting");
    }
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const key = String(data.get("key") || "").trim();
    const raw = String(data.get("value") || "");
    if (!key) return;
    await onSave(key, raw || '""');
    e.currentTarget.reset();
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Settings</h2>
          <p>Platform-wide key/value settings. {canEdit ? "" : "Only a super_admin can change these — you can view them."}</p>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}
      {notice && <div className="admin-login__setup" style={{ marginBottom: 18 }}>{notice}</div>}

      <PanditsPerPagePanel canEdit={canEdit} settings={settings} />
      <BillingTaxPanel canEdit={canEdit} settings={settings} />
      <ReminderSettingsPanel canEdit={canEdit} settings={settings} />

      <div className="admin-panel">
        <div className="admin-panel__head"><h2>All Settings (raw)</h2></div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Key</th><th>Value (JSON)</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {settings.map((s) => (
                <SettingRow key={s.key} setting={s} canEdit={canEdit} onSave={onSave} />
              ))}
            </tbody>
          </table>
          {!settings.length && <div className="admin-empty">No settings defined yet.</div>}
        </div>
        {canEdit && (
          <form className="admin-panel__body row" style={{ gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border-soft)" }} onSubmit={onAdd}>
            <input className="input" name="key" placeholder="setting_key" required style={{ maxWidth: 200 }} />
            <input className="input" name="value" placeholder='JSON value, e.g. "on" or 42 or {"a":1}' style={{ flex: 1, minWidth: 220 }} />
            <button className="btn btn-gold btn-sm" type="submit">Add / update</button>
          </form>
        )}
      </div>
    </>
  );
}

function SettingRow({ setting, canEdit, onSave }: { setting: Setting; canEdit: boolean; onSave: (key: string, raw: string) => void }) {
  const [raw, setRaw] = useState(JSON.stringify(setting.value));
  return (
    <tr>
      <td><strong>{setting.key}</strong>{setting.description && <div className="muted-cell">{setting.description}</div>}</td>
      <td>
        <input className="input" value={raw} disabled={!canEdit} onChange={(e) => setRaw(e.target.value)} style={{ fontFamily: "monospace", fontSize: ".85rem" }} />
      </td>
      <td className="muted-cell">{new Date(setting.updated_at).toLocaleDateString("en-IN")}</td>
      <td>{canEdit && <button className="btn btn-outline btn-sm" onClick={() => onSave(setting.key, raw)}>Save</button>}</td>
    </tr>
  );
}
