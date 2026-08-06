import { Fragment } from "react";
import { useLang } from "../../lib/i18n";

/** Scrolling live-activity ticker — matches the Home page's hero ticker */
export function HeroTicker() {
  const { t } = useLang();
  return (
    <div className="sp-hero__ticker">
      <div className="sp-hero__ticker-track">
        <div className="sp-hero__ticker-content">
          {[0, 1].map((dup) => (
            <Fragment key={dup}>
              <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot" /> <span dangerouslySetInnerHTML={{ __html: t("home.ticker1") }} /> <span style={{ color: "#aaa" }}>· {t("home.tickerJustNow")}</span></span>
              <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot sp-hero__ticker-dot--gold" /> <span dangerouslySetInnerHTML={{ __html: t("home.ticker2") }} /> <span style={{ color: "#aaa" }}>· {t("home.ticker2minAgo")}</span></span>
              <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot" /> <span dangerouslySetInnerHTML={{ __html: t("home.ticker3") }} /> <span style={{ color: "#aaa" }}>· {t("home.ticker5minAgo")}</span></span>
              <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot sp-hero__ticker-dot--gold" /> <span dangerouslySetInnerHTML={{ __html: t("home.ticker4") }} /> <span style={{ color: "#aaa" }}>· {t("home.ticker12minAgo")}</span></span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
