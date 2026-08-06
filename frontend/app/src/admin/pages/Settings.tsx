import { useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../lib/adminApi";
import { useAdminAuth } from "../lib/AdminAuth";

interface Setting { key: string; value: unknown; description: string | null; updated_at: string; }

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

      <div className="admin-panel">
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
