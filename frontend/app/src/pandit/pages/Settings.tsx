import { Link } from "react-router-dom";
import { useAuth } from "../../lib/Auth";
import { PageHead } from "./_shared";

export default function Settings() {
  const { user, logout } = useAuth();
  return (
    <div className="pandit-page">
      <PageHead title="Settings" />

      <section className="pandit-fieldset">
        <h2 className="pandit-section__title">Account</h2>
        <dl className="pandit-deflist">
          <dt>Name</dt><dd>{user?.full_name}</dd>
          <dt>Login Email</dt><dd>{user?.email}</dd>
          <dt>Role</dt><dd>Pandit</dd>
        </dl>
      </section>

      <section className="pandit-fieldset">
        <h2 className="pandit-section__title">Password</h2>
        <p className="pandit-hint">
          Password badalne ke liye email aur date of birth se verify karna hoga.
          Reset ke baad saare devices logout ho jaate hain.
        </p>
        <Link to="/pandit-forgot-password" className="pandit-btn pandit-btn--ghost">Password badlein</Link>
      </section>

      <section className="pandit-fieldset">
        <h2 className="pandit-section__title">Session</h2>
        <button className="pandit-btn pandit-btn--primary" onClick={logout}>Logout</button>
      </section>
    </div>
  );
}
