/**
 * DataState — Reusable loading / error / empty state UI components
 * matching the golden spiritual PanditSuggest design system.
 */

import type { ReactNode } from "react";
import "./DataState.css";

/* ══════════════════════════════ LOADING ══════════════════════════════ */

interface LoadingProps {
  /** Number of skeleton rows/cards to show (default 3) */
  lines?: number;
  /** Visual style variant */
  type?: "card" | "list" | "detail" | "inline";
}

export function Loading({ lines = 3, type = "card" }: LoadingProps) {
  if (type === "inline") {
    return <span className="ds-shimmer-inline" />;
  }

  return (
    <div className={`ds-loading ds-loading--${type}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="ds-skeleton-card">
          <div className="ds-skeleton ds-skeleton--img" />
          <div className="ds-skeleton ds-skeleton--title" />
          <div className="ds-skeleton ds-skeleton--text" />
          <div className="ds-skeleton ds-skeleton--text ds-skeleton--short" />
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════ ERROR ══════════════════════════════ */

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "Something went wrong. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="ds-error">
      <div className="ds-error__icon">⚠️</div>
      <p className="ds-error__msg">{message}</p>
      {onRetry && (
        <button className="btn btn-gold btn-sm" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════ EMPTY ══════════════════════════════ */

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: string;
  children?: ReactNode;
}

export function EmptyState({
  title = "No Results Found",
  message = "Try adjusting your filters or search terms.",
  icon = "🕉️",
  children,
}: EmptyStateProps) {
  return (
    <div className="ds-empty">
      <div className="ds-empty__icon">{icon}</div>
      <h3 className="ds-empty__title">{title}</h3>
      <p className="ds-empty__msg">{message}</p>
      {children}
    </div>
  );
}
