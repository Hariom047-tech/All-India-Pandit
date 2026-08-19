import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { useLang } from "../lib/i18n";
import { Seo } from "../lib/Seo";

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="notfound">
      <Seo title="Page Not Found" noindex />
      <div className="om-mark"><Icon name="om" size={72} /></div>
      <h1 className="section-title" style={{ marginTop: 14 }}>{t("notFound.title")}</h1>
      <p className="section-sub">{t("notFound.text")}</p>
      <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
        <Link className="btn btn-gold btn-lg" to="/">{t("notFound.backHome")}</Link>
        <Link className="btn btn-outline btn-lg" to="/pandits">{t("common.findAPandit")}</Link>
      </div>
    </div>
  );
}
