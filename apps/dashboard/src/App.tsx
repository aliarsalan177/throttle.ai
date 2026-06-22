import { useEffect, useState } from "react";
import { api, type MetricsResponse } from "./api.js";
import { Overview } from "./tabs/Overview.js";
import { Requests } from "./tabs/Requests.js";
import { Sessions } from "./tabs/Sessions.js";
import { Stages } from "./tabs/Stages.js";
import { TokenCalculator } from "./tabs/TokenCalculator.js";

type Tab = "overview" | "requests" | "stages" | "sessions" | "calculator";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "requests", label: "Requests", icon: "📜" },
  { id: "stages", label: "Stages", icon: "🎛️" },
  { id: "sessions", label: "Sessions", icon: "🧠" },
  { id: "calculator", label: "Token calculator", icon: "🔢" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  // Poll metrics every 2s so Overview/Requests stay live.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const m = await api.metrics();
        if (alive) {
          setMetrics(m);
          setOnline(true);
        }
      } catch {
        if (alive) setOnline(false);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚡</span>
          <div>
            <div className="title">Token Reduction Engine</div>
            <div className="subtitle">local dashboard</div>
          </div>
        </div>
        <div className={`conn ${online === null ? "unknown" : online ? "up" : "down"}`}>
          <span className="dot" />
          {online === null ? "connecting" : online ? "proxy connected" : "proxy offline"}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {online === false && (
          <div className="banner">
            Can't reach the proxy. Start it with <code>node packages/proxy/dist/index.js</code> (or{" "}
            <code>pnpm dev:proxy</code>) on <code>127.0.0.1:8787</code>.
          </div>
        )}
        {tab === "overview" && <Overview metrics={metrics} />}
        {tab === "requests" && <Requests metrics={metrics} />}
        {tab === "stages" && <Stages />}
        {tab === "sessions" && <Sessions />}
        {tab === "calculator" && <TokenCalculator />}
      </main>
    </div>
  );
}
