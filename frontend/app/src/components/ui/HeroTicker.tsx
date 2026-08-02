/** Scrolling live-activity ticker — matches the Home page's hero ticker */
export function HeroTicker() {
  return (
    <div className="sp-hero__ticker">
      <div className="sp-hero__ticker-track">
        <div className="sp-hero__ticker-content">
          <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot" /> <b>Rahul</b> from Mumbai booked Satyanarayan Pooja with <b>Pt. Ram Naresh</b> <span style={{ color: "#aaa" }}>· just now</span></span>
          <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot sp-hero__ticker-dot--gold" /> <b>Neha</b> from Hyderabad contacted <b>Acharya Prem</b> <span style={{ color: "#aaa" }}>· 2 min ago</span></span>
          <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot" /> <b>Vikram</b> from Delhi booked Griha Pravesh with <b>Pt. Sharma</b> <span style={{ color: "#aaa" }}>· 5 min ago</span></span>
          <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot sp-hero__ticker-dot--gold" /> <b>Priya</b> from Pune left a 5-star review for <b>Pt. Mishra</b> <span style={{ color: "#aaa" }}>· 12 min ago</span></span>
          {/* Duplicate for infinite loop */}
          <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot" /> <b>Rahul</b> from Mumbai booked Satyanarayan Pooja with <b>Pt. Ram Naresh</b> <span style={{ color: "#aaa" }}>· just now</span></span>
          <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot sp-hero__ticker-dot--gold" /> <b>Neha</b> from Hyderabad contacted <b>Acharya Prem</b> <span style={{ color: "#aaa" }}>· 2 min ago</span></span>
          <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot" /> <b>Vikram</b> from Delhi booked Griha Pravesh with <b>Pt. Sharma</b> <span style={{ color: "#aaa" }}>· 5 min ago</span></span>
          <span className="sp-hero__ticker-item"><span className="sp-hero__ticker-dot sp-hero__ticker-dot--gold" /> <b>Priya</b> from Pune left a 5-star review for <b>Pt. Mishra</b> <span style={{ color: "#aaa" }}>· 12 min ago</span></span>
        </div>
      </div>
    </div>
  );
}
