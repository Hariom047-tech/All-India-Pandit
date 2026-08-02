import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";

export default function NotFound() {
  return (
    <div className="notfound">
      <div className="om-mark"><Icon name="om" size={72} /></div>
      <h1 className="section-title" style={{ marginTop: 14 }}>This page has wandered off on a yatra</h1>
      <p className="section-sub">The path you followed doesn't lead anywhere on PanditConnect. Let's get you back.</p>
      <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
        <Link className="btn btn-gold btn-lg" to="/">Back to Home</Link>
        <Link className="btn btn-outline btn-lg" to="/pandits">Find a Pandit</Link>
      </div>
    </div>
  );
}
