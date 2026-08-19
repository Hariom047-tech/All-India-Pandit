import { useSearchParams } from "react-router-dom";

/**
 * URL-backed active-tab state for a tabbed detail page.
 *
 * The URL is the source of truth, not component memory: a direct link, a
 * copied share URL, and a browser refresh all need to restore the same tab,
 * and only the URL survives a full reload. The tab is derived synchronously
 * from `?tab=` on every render — no effect, no post-mount correction — so
 * there is never a frame where the wrong tab is visible.
 *
 * An invalid or missing `?tab=` value falls back to `defaultTab` rather than
 * throwing or rendering blank.
 *
 * Tab switches use history REPLACE, not push: a tab is a sub-view of one
 * page, not a distinct destination. Pushing an entry per click would make
 * the browser Back button step through every tab a visitor opened instead of
 * leaving the page, which is the opposite of what Back is for here.
 */
export function useUrlTab<T extends string>(validTabs: readonly T[], defaultTab: T) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab = raw && (validTabs as readonly string[]).includes(raw) ? (raw as T) : defaultTab;

  function setTab(next: T) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        // Keep the canonical URL clean for the default tab rather than
        // writing a redundant ?tab=overview everywhere.
        if (next === defaultTab) params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );
  }

  return [tab, setTab] as const;
}
