import { useEffect, useState } from "react";
import { api, type StageToggles, type TreConfig } from "../api.js";
import { Card } from "../ui.js";

const STAGE_INFO: Array<{ key: keyof StageToggles; title: string; desc: string; risk: "safe" | "lossy" }> = [
  { key: "cache", title: "Cache-first", desc: "Mark the stable prefix for provider-native prompt caching.", risk: "safe" },
  { key: "dedup", title: "Context dedup", desc: "Collapse blocks the model already saw this session.", risk: "safe" },
  { key: "strip", title: "Noise strip", desc: "Remove duplicate boilerplate and empty filler.", risk: "safe" },
  { key: "filediff", title: "File diff", desc: "Send a diff instead of re-sending a whole file.", risk: "lossy" },
  { key: "slice", title: "AST slice", desc: "Send only the referenced functions + dep signatures.", risk: "lossy" },
  { key: "intent", title: "Metadata extract", desc: "Compact framework/lang metadata (never the instruction).", risk: "lossy" },
];

export function Stages() {
  const [cfg, setCfg] = useState<TreConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(setCfg).catch((e) => setErr(String(e)));
  }, []);

  async function toggle(key: keyof StageToggles) {
    if (!cfg) return;
    setBusy(key);
    setErr(null);
    try {
      const next = await api.patchConfig({ stages: { ...cfg.stages, [key]: !cfg.stages[key] } });
      setCfg(next);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (err) return <p className="error">Couldn't reach the proxy: {err}</p>;
  if (!cfg) return <p className="empty">Loading config…</p>;

  return (
    <Card title="Pipeline stages" right={<span className="dim">live · applies to new requests</span>}>
      <p className="hint">
        Lossy stages stay off until benchmarked. A lossy stage that doesn't beat{" "}
        <strong>{cfg.minSavingsTokens}</strong> saved tokens is auto-reverted per request.
      </p>
      <ul className="stages">
        {STAGE_INFO.map((s) => {
          const on = cfg.stages[s.key];
          return (
            <li key={s.key} className={`stage-row${on ? " on" : ""}`}>
              <div>
                <div className="stage-title">
                  {s.title}
                  <span className={`tag tag-${s.risk}`}>{s.risk === "safe" ? "lossless" : "lossy"}</span>
                </div>
                <div className="stage-desc">{s.desc}</div>
              </div>
              <button
                className={`switch${on ? " switch-on" : ""}`}
                disabled={busy === s.key}
                onClick={() => toggle(s.key)}
                aria-pressed={on}
                aria-label={`toggle ${s.title}`}
              >
                <span className="knob" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
