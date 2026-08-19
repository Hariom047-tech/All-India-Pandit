import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Icon } from "../../lib/icons";

interface ToastItem {
  id: number;
  msg: string;
}

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const VISIBLE_MS = 3200;
// Must match .toast--leaving's transition duration in base.css.
const EXIT_MS = 250;

/** CSS-only enter/exit (base.css's existing `fadeUp` keyframe for enter, a
 *  `.toast--leaving` transition for exit) instead of framer-motion's
 *  AnimatePresence — same visual result, but ToastProvider wraps every
 *  route (App.tsx), so this was the one thing keeping framer-motion in
 *  EVERY page's critical bundle, not just Home's (Phase 12,
 *  docs/SEO_ARCHITECTURE.md). */
function ToastEntry({ msg, onDone }: { msg: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), VISIBLE_MS);
    return () => clearTimeout(leaveTimer);
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const removeTimer = setTimeout(onDone, EXIT_MS);
    return () => clearTimeout(removeTimer);
  }, [leaving, onDone]);

  return (
    <div className={`toast${leaving ? " toast--leaving" : ""}`} role="status">
      <Icon name="check-circle" size={18} />
      <span>{msg}</span>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, msg }]);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host">
        {items.map((t) => (
          <ToastEntry key={t.id} msg={t.msg} onDone={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
