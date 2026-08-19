import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { siteConfig, absoluteUrl } from "./siteConfig";

interface SeoProps {
  /** Page-specific title. Site name is appended automatically unless it's
   *  already present (entity pages sometimes build it in themselves). */
  title: string;
  description?: string;
  /** Canonical path, e.g. "/temples/foo". Defaults to the current route —
   *  pass explicitly on paginated/filtered views so every query-string
   *  variation still canonicalizes to the same clean URL (master prompt
   *  §31, "Canonical URL architecture"). */
  path?: string;
  image?: string;
  /** Auth/dashboard/internal-search pages — indexed nowhere, but still
   *  followed so any inbound link doesn't dead-end a crawler. */
  noindex?: boolean;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Centralized <head> metadata for one page — title, description, canonical,
 * Open Graph, Twitter Card.
 *
 * Deliberately imperative (a useEffect mutating singleton DOM nodes), not
 * React 19's declarative <title>/<meta> tag rendering: that API does NOT
 * de-duplicate against tags rendered by a different component (verified
 * empirically — a Layout-level default and a page-level override both
 * persisted as separate DOM nodes, with the wrong one winning). Mutating
 * the same node in place is what the three pages that already managed their
 * own document.title were doing all along, generalized here to cover
 * description/canonical/OG too, and centralized so every page shares one
 * implementation instead of five.
 *
 * Render this ONCE per route, at the top level of the page component (not
 * nested inside a conditional loading state, and never in more than one
 * place at a time — e.g. a shared layout must NOT also render one, or its
 * effect can win the last-write race against the page's own). index.html
 * ships no static <title>/<meta name="description"> for exactly this reason.
 */
export function Seo({ title, description, path, image, noindex }: SeoProps) {
  const location = useLocation();

  useEffect(() => {
    const fullTitle = title.includes(siteConfig.name) ? title : `${title} | ${siteConfig.name}`;
    const desc = description?.trim() || siteConfig.defaultDescription;
    const canonicalUrl = absoluteUrl(path ?? location.pathname);
    const ogImage = absoluteUrl(image || siteConfig.defaultOgImage);

    document.title = fullTitle;
    setMeta("name", "description", desc);
    setLink("canonical", canonicalUrl);

    const robots = document.querySelector('meta[name="robots"]');
    if (noindex) setMeta("name", "robots", "noindex, follow");
    else if (robots) robots.remove();

    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", siteConfig.name);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", ogImage);

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", ogImage);
    // No cleanup-on-unmount: the next page's effect updates these same
    // singleton nodes before paint, so removing them here would only open a
    // brief tag-less window during route transitions for no benefit.
  }, [title, description, path, image, noindex, location.pathname]);

  return null;
}
