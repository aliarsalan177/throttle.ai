import type { NormalizedMessage } from "./types.js";

/**
 * Session history / continuity store.
 *
 * The proxy sees every turn of every conversation, so it can persist them. That
 * gives users **resume**: when an agent is closed, crashes, or a chat hits the
 * context-window ceiling, the saved session lets them pick up from exactly where
 * they left off instead of starting over.
 *
 * Privacy: this holds the user's own prompts/code. It stays local and is only
 * written when `TreConfig.store` is true (`--no-store` disables it). A later
 * version backs it with SQLite so sessions survive a proxy restart; this
 * in-memory implementation keeps the same interface so wiring and tests are stable.
 *
 * Purity: the engine never calls the clock itself — callers pass `at`
 * timestamps — so history stays deterministic and testable.
 */

/** Lightweight, append-only record of one request in a session (for the timeline). */
export interface TurnRecord {
  /** 0-based position within the session. */
  index: number;
  model: string;
  /** Token count of the request at this turn (from the tokenizer). */
  tokens: number;
  /** Epoch millis, supplied by the caller. */
  at: number;
}

/** A resumable checkpoint: the full conversation snapshot plus its timeline. */
export interface SessionCheckpoint {
  sessionId: string;
  model: string;
  /** The most recent full conversation, ready to continue from. */
  messages: NormalizedMessage[];
  timeline: TurnRecord[];
  turns: number;
  firstSeen: number;
  lastActive: number;
  totalTokens: number;
}

/** Compact summary for listing sessions a user could resume. */
export interface SessionSummary {
  sessionId: string;
  model: string;
  turns: number;
  lastActive: number;
  totalTokens: number;
}

export interface AppendTurn {
  model: string;
  messages: NormalizedMessage[];
  tokens: number;
  at: number;
}

export interface SessionHistoryStore {
  /** Record a turn, updating the resumable snapshot for this session. */
  append(sessionId: string, turn: AppendTurn): void;
  /** Full resumable checkpoint, or undefined if the session is unknown. */
  resume(sessionId: string): SessionCheckpoint | undefined;
  /** All known sessions, most-recently-active first. */
  list(): SessionSummary[];
  /** Forget one session (or everything). Supports privacy/TTL purges. */
  clear(sessionId?: string): void;
}

export interface SessionState {
  sessionId: string;
  model: string;
  messages: NormalizedMessage[];
  timeline: TurnRecord[];
  firstSeen: number;
  lastActive: number;
  totalTokens: number;
}

/**
 * In-memory session history. Optionally bounds how many timeline records are
 * retained per session (the resumable snapshot is always the latest, full one).
 */
export class InMemoryHistoryStore implements SessionHistoryStore {
  private readonly sessions = new Map<string, SessionState>();

  /** @param maxTimeline cap on retained timeline records per session (0 = unbounded). */
  constructor(private readonly maxTimeline = 0) {}

  append(sessionId: string, turn: AppendTurn): void {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = {
        sessionId,
        model: turn.model,
        messages: [],
        timeline: [],
        firstSeen: turn.at,
        lastActive: turn.at,
        totalTokens: 0,
      };
      this.sessions.set(sessionId, s);
    }
    s.timeline.push({ index: s.timeline.length, model: turn.model, tokens: turn.tokens, at: turn.at });
    if (this.maxTimeline > 0 && s.timeline.length > this.maxTimeline) {
      s.timeline.splice(0, s.timeline.length - this.maxTimeline);
    }
    // Latest full conversation is the resume point.
    s.messages = turn.messages;
    s.model = turn.model;
    s.lastActive = turn.at;
    s.totalTokens += turn.tokens;
  }

  resume(sessionId: string): SessionCheckpoint | undefined {
    const s = this.sessions.get(sessionId);
    if (!s) return undefined;
    return {
      sessionId: s.sessionId,
      model: s.model,
      messages: s.messages,
      timeline: [...s.timeline],
      turns: s.timeline.length,
      firstSeen: s.firstSeen,
      lastActive: s.lastActive,
      totalTokens: s.totalTokens,
    };
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()]
      .map((s) => ({
        sessionId: s.sessionId,
        model: s.model,
        turns: s.timeline.length,
        lastActive: s.lastActive,
        totalTokens: s.totalTokens,
      }))
      .sort((a, b) => b.lastActive - a.lastActive);
  }

  clear(sessionId?: string): void {
    if (sessionId === undefined) this.sessions.clear();
    else this.sessions.delete(sessionId);
  }

  /** Plain-data snapshot for persistence (pure; no I/O). */
  snapshot(): SessionState[] {
    return [...this.sessions.values()];
  }

  /** Rehydrate from a snapshot, replacing current state. */
  restore(states: SessionState[]): void {
    this.sessions.clear();
    for (const s of states) this.sessions.set(s.sessionId, s);
  }
}
