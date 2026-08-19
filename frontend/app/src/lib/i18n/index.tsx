import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "./dictionary.en";

export type Lang = "en" | "hi";
type Dictionary = typeof en;
const STORAGE_KEY = "panditconnect_lang";

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "hi") return stored;
  // default to English — Devanagari-first would surprise a fresh visitor
  // who hasn't chosen it, even though most of the audience reads Hindi
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);
  // The Hindi dictionary (~28KB source, mostly Devanagari — bigger than the
  // English one) is loaded on demand instead of bundled into every visit's
  // critical JS: English is the default for a first-time visitor (above),
  // so most page loads never need it at all. Only a returning visitor who
  // already chose Hindi (persisted in localStorage) pays a brief
  // dictionary-load moment, once, instead of every visitor paying the
  // weight upfront (Phase 12, docs/SEO_ARCHITECTURE.md).
  const [hiDict, setHiDict] = useState<Dictionary | null>(null);

  useEffect(() => {
    if (lang === "hi" && !hiDict) {
      import("./dictionary.hi").then((mod) => setHiDict(mod.default));
    }
  }, [lang, hiDict]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const toggle = () => setLangState((l) => (l === "en" ? "hi" : "en"));

  const t = useMemo(() => {
    const active: Dictionary = lang === "hi" && hiDict ? hiDict : en;
    return (key: string, vars?: Record<string, string | number>) => {
      let str = getPath(active, key);
      if (typeof str !== "string") str = getPath(en, key);
      if (typeof str !== "string") return key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) str = (str as string).replace(`{${k}}`, String(v));
      }
      return str as string;
    };
  }, [lang, hiDict]);

  return <I18nContext.Provider value={{ lang, setLang, toggle, t }}>{children}</I18nContext.Provider>;
}

export function useLang() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLang must be used within I18nProvider");
  return ctx;
}
