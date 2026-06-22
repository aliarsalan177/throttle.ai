import type { MetricsResponse } from "../api.js";
import { Card, Stat, Meter, SavingsBars } from "../ui.js";
import { fmt } from "../util.js";

export function Overview({ metrics }: { metrics: MetricsResponse | null }) {
  if (!metrics) return <p className="empty">Connecting to the proxy…</p>;
  const a = metrics.aggregate;
  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="Requests" value={fmt(a.requests)} />
        <Stat label="Tokens saved" value={fmt(a.saved)} accent sub={`of ${fmt(a.tokensBefore)} sent`} />
        <Stat label="Reduction" value={`${a.savedPct.toFixed(1)}%`} accent />
        <Stat label="Avg overhead" value={`${a.avgDurationMs.toFixed(1)} ms`} sub="pipeline time" />
      </div>

      <Card title="Overall reduction">
        <Meter pct={a.savedPct} />
        <p className="hint">
          {a.saved > 0
            ? `You've avoided sending ${fmt(a.saved)} tokens so far.`
            : "All reduction stages are off (passthrough). Enable some on the Stages tab to start saving."}
        </p>
      </Card>

      <Card title="Savings by model">
        <SavingsBars data={a.byModel} />
        <p className="legend">
          <span className="swatch bar-total" /> tokens sent &nbsp;&nbsp;
          <span className="swatch bar-saved" /> saved
        </p>
      </Card>
    </div>
  );
}
