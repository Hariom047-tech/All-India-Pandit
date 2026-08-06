import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "./dictionary.en";
import hi from "./dictionary.hi";

export type Lang = "en" | "hi";
const STORAGE_KEY = "panditconnect_lang";
const dictionaries: Record<Lang, typeof en> = { en, hi };

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const toggle = () => setLangState((l) => (l === "en" ? "hi" : "en"));

  const t = useMemo(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      let str = getPath(dictionaries[lang], key);
      if (typeof str !== "string") str = getPath(dictionaries.en, key);
      if (typeof str !== "string") return key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) str = (str as string).replace(`{${k}}`, String(v));
      }
      return str as string;
    };
  }, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, toggle, t }}>{children}</I18nContext.Provider>;
}

export function useLang() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLang must be used within I18nProvider");
  return ctx;
}
