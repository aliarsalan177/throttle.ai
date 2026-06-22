import { useEffect, useState } from "react";
import { api, type SessionCheckpoint, type SessionSummary } from "../api.js";
import { Card } from "../ui.js";
import { fmt, fmtTime } from "../util.js";

export function Sessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [active, setActive] = useState<SessionCheckpoint | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setSessions((await api.sessions()).sessions);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function open(id: string) {
    try {
      setActive(await api.session(id));
    } catch (e) {
      setErr(String(e));
    }
  }

  async function purge(id: string) {
    await api.deleteSession(id);
    if (active?.sessionId === id) setActive(null);
    refresh();
  }

  if (err) return <p className="error">Couldn't reach the proxy: {err}</p>;

  return (
    <div className="cols">
      <Card title={`Saved sessions (${sessions.length})`} right={<button className="btn" onClick={refresh}>Refresh</button>}>
        {sessions.length === 0 ? (
          <p className="empty">No saved sessions yet. Conversations are stored unless <code>--no-store</code>.</p>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.sessionId} className={active?.sessionId === s.sessionId ? "active" : ""}>
                <button className="session-btn" onClick={() => open(s.sessionId)}>
                  <span className="mono">{s.sessionId}</span>
                  <span className="dim">
                    {s.turns} turns · {fmt(s.totalTokens)} tok · {fmtTime(s.lastActive)}
                  </span>
                </button>
                <button className="btn btn-danger" onClick={() => purge(s.sessionId)} aria-label="purge">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={active ? `Resume: ${active.sessionId}` : "Resume"}>
        {!active ? (
          <p className="empty">Pick a session to preview where you'd pick back up.</p>
        ) : (
          <div className="stack">
            <div className="dim">
              {active.turns} turns · {active.model} · {fmt(active.totalTokens)} tokens total
            </div>
            <div className="convo">
              {active.messages.map((m, i) => (
                <div key={i} className={`bubble ${m.role}`}>
                  <span className="role">{m.role}</span>
                  <span className="text">
                    {m.content.map((c) => c.text ?? `[${c.type}]`).join(" ") || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
