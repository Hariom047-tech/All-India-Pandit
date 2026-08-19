import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Stops one broken component from taking down the entire site.
 *
 * React unmounts the whole tree on an uncaught render error, which produces a
 * completely blank white page with nothing in the UI to explain it — the worst
 * possible failure mode, because it looks identical to a dead server. A
 * `t.lat.toFixed()` on a string did exactly that to the temple page.
 *
 * Must be a class: there is still no hook equivalent of componentDidCatch.
 */
interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console so the real stack is still one click away in devtools.
    console.error("[ErrorBoundary]", this.props.label ?? "", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="section">
        <div className="shell" style={{ textAlign: "center", padding: "48px 20px", maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }} aria-hidden="true">🙏</div>
          <h1 style={{ fontFamily: "var(--font-head, Georgia)", fontSize: "1.5rem", marginBottom: 8 }}>
            Yeh section load nahi ho paya
          </h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            Kuch technical dikkat aa gayi. Page reload karke dobara try karein.
          </p>
          <div className="row" style={{ gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-gold" onClick={() => window.location.reload()}>Reload</button>
            <a className="btn btn-outline" href="/">Home</a>
          </div>
          {import.meta.env.DEV && (
            // Only in dev: production users get no stack trace.
            <pre style={{
              textAlign: "left", marginTop: 24, padding: 12, borderRadius: 8,
              background: "#fdf3f3", color: "#96231f", fontSize: ".78rem",
              overflowX: "auto", whiteSpace: "pre-wrap",
            }}>{this.state.error.message}</pre>
          )}
        </div>
      </div>
    );
  }
}
