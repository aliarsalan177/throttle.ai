import type { ReactNode } from "react";
import type { ModelBreakdown } from "./api.js";
import { fmt } from "./util.js";

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      {(title || right) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`stat${accent ? " stat-accent" : ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Horizontal progress meter (0–100). */
export function Meter({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="meter" role="progressbar" aria-valuenow={Math.round(clamped)}>
      <div className="meter-fill" style={{ width: `${clamped}%` }} />
      <span className="meter-label">{clamped.toFixed(1)}% saved</span>
    </div>
  );
}

/** Simple hand-rolled SVG bar chart of tokens-before vs saved, per model. */
export function SavingsBars({ data }: { data: ModelBreakdown[] }) {
  if (data.length === 0) return <p className="empty">No requests yet — point an agent at the proxy.</p>;
  const max = Math.max(...data.map((d) => d.tokensBefore), 1);
  const rowH = 34;
  const w = 520;
  const labelW = 150;
  const barW = w - labelW - 60;
  return (
    <svg className="bars" viewBox={`0 0 ${w} ${data.length * rowH + 8}`} role="img" aria-label="Savings by model">
      {data.map((d, i) => {
        const y = i * rowH + 4;
        const totalW = (d.tokensBefore / max) * barW;
        const savedW = d.tokensBefore > 0 ? (d.saved / d.tokensBefore) * totalW : 0;
        return (
          <g key={d.model}>
            <text x={0} y={y + 18} className="bar-label">
              {d.model.length > 18 ? d.model.slice(0, 17) + "…" : d.model}
            </text>
            <rect x={labelW} y={y + 6} width={Math.max(totalW, 2)} height={16} rx={3} className="bar-total" />
            <rect x={labelW} y={y + 6} width={Math.max(savedW, 0)} height={16} rx={3} className="bar-saved" />
            <text x={labelW + Math.max(totalW, 2) + 6} y={y + 18} className="bar-value">
              {fmt(d.tokensBefore)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
