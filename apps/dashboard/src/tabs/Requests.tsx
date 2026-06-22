import type { MetricsResponse } from "../api.js";
import { Card } from "../ui.js";
import { fmt, fmtTime } from "../util.js";

export function Requests({ metrics }: { metrics: MetricsResponse | null }) {
  const rows = metrics?.recent ?? [];
  return (
    <Card title={`Recent requests (${rows.length})`}>
      {rows.length === 0 ? (
        <p className="empty">No requests captured yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Session</th>
                <th className="num">Before</th>
                <th className="num">After</th>
                <th className="num">Saved</th>
                <th className="num">ms</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtTime(r.at)}</td>
                  <td>
                    <span className={`pill pill-${r.provider}`}>{r.provider}</span>
                  </td>
                  <td className="mono">{r.model}</td>
                  <td className="mono dim">{r.sessionId}</td>
                  <td className="num">{fmt(r.tokensBefore)}</td>
                  <td className="num">{fmt(r.tokensAfter)}</td>
                  <td className="num saved">{r.saved > 0 ? fmt(r.saved) : "—"}</td>
                  <td className="num dim">{r.durationMs.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
