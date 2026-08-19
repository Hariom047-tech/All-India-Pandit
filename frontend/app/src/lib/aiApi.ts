/**
 * Client for the AI Pooja Guide (/api/ai/*).
 *
 * Separate from lib/api.ts deliberately: that client aborts every request at
 * 6 seconds, which is correct for a newsletter signup and wrong here. One AI
 * turn embeds the query, runs hybrid retrieval, matches services and temples,
 * ranks pandits and then calls a generation model — comfortably past 6s on a
 * cold start. Reusing it would abort real answers and show a fallback.
 */

import { getToken } from "./api";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";

/** Generous, because a cold embedding call alone was observed at 20s+. */
const CHAT_TIMEOUT_MS = 45_000;
const EVENT_TIMEOUT_MS = 5_000;

/* ── stored identity ──────────────────────────────────────────────────── */

const CONV_KEY = "panditsuggest_ai_conversation";
const SESSION_KEY = "panditsuggest_ai_session";

/**
 * A guest's thread lives across reloads.
 *
 * The session key is the ONLY thing tying a logged-out devotee to their
 * conversation, so losing it on refresh means losing the context they already
 * typed — and the whole point of memory is that "Nalkheda" in turn 3 still
 * knows about the business puja from turn 1.
 */
export function loadConversation(): { conversationId?: string; sessionKey?: string } {
  try {
    return {
      conversationId: localStorage.getItem(CONV_KEY) || undefined,
      sessionKey: localStorage.getItem(SESSION_KEY) || undefined,
    };
  } catch {
    return {};   // private mode / storage disabled — degrade to a fresh thread
  }
}

function saveConversation(conversationId?: string, sessionKey?: string) {
  try {
    if (conversationId) localStorage.setItem(CONV_KEY, conversationId);
    if (sessionKey) localStorage.setItem(SESSION_KEY, sessionKey);
  } catch { /* storage unavailable — the thread just won't survive a reload */ }
}

export function clearConversation() {
  try {
    localStorage.removeItem(CONV_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch { /* nothing to clear */ }
}

/* ── types (mirror the backend response shape) ────────────────────────── */

export interface AiServiceCard {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  duration?: string | null;
  imageUrl?: string | null;
  onlineAvailable?: boolean;
  reason?: string | null;
}

export interface AiTempleCard {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  imageUrl?: string | null;
}

export interface AiPanditCard {
  panditId: string;
  slug: string;
  name: string;
  title?: string | null;
  photoUrl?: string | null;
  verified: boolean;
  rating: number;
  reviewCount: number;
  experienceYears: number;
  completedCeremonies: number;
  serviceReviews: number;
  city?: string | null;
  state?: string | null;
  offersOnline: boolean;
  matchLabel: string;
  reason: string;
}

export interface AiChatResponse {
  answer: string;
  followUpQuestion?: string | null;
  confidence?: "high" | "good" | "possible" | "low";
  needsClarification?: boolean;
  isCrisis?: boolean;
  isFallback?: boolean;
  degraded?: boolean;
  intent?: {
    language?: string;
    problemCategory?: string | null;
    temple?: string | null;
    city?: string | null;
    wantsOnline?: boolean;
  };
  recommendations: {
    services: AiServiceCard[];
    temples: AiTempleCard[];
    pandits: AiPanditCard[];
  };
  locationNote?: string | null;
  gapType?: string | null;
  conversationId?: string;
  messageId?: string;
  sessionKey?: string;
}

export type AiEventType =
  | "pandit_card_clicked" | "pandit_profile_opened"
  | "call_clicked" | "whatsapp_clicked"
  | "booking_started" | "booking_completed";

/* ── calls ────────────────────────────────────────────────────────────── */

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = "AbortController" in window ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const token = getToken();
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One conversational turn. Persists the returned ids for the next one. */
export async function sendMessage(message: string): Promise<AiChatResponse> {
  const stored = loadConversation();
  const res = await post<AiChatResponse>("/ai/chat", {
    message,
    conversationId: stored.conversationId,
    sessionKey: stored.sessionKey,
  }, CHAT_TIMEOUT_MS);
  saveConversation(res.conversationId, res.sessionKey);
  return res;
}

/**
 * Analytics only. Fire-and-forget — a failed event must never interrupt a tap
 * on Call or WhatsApp, and this endpoint cannot create a qualified lead. That
 * still happens server-side through the existing contact flow.
 */
export function trackEvent(eventType: AiEventType, payload: {
  panditId?: string; serviceId?: string; templeId?: string;
  messageId?: string; position?: number;
} = {}) {
  const stored = loadConversation();
  void post("/ai/events", {
    eventType,
    conversationId: stored.conversationId,
    ...payload,
  }, EVENT_TIMEOUT_MS).catch(() => { /* analytics is not worth an error to the user */ });
}

export async function sendFeedback(messageId: string, helpful: boolean, reason?: string) {
  const stored = loadConversation();
  return post("/ai/feedback", {
    messageId, helpful, reason, sessionKey: stored.sessionKey,
  }, EVENT_TIMEOUT_MS);
}

export async function aiStatus(): Promise<{ enabled: boolean }> {
  try {
    const res = await fetch(`${BASE}/ai/status`);
    if (!res.ok) return { enabled: false };
    return await res.json();
  } catch {
    return { enabled: false };
  }
}
