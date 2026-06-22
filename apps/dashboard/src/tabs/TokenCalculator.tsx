import { useEffect, useState } from "react";
import { api, type TokenizeResponse } from "../api.js";
import { Card, Stat } from "../ui.js";
import { PRICED_MODELS, estimateCost, fmt, fmtUsd } from "../util.js";

const SAMPLE = `You are a senior engineer. Refactor the authentication module to use JWT,
keep backwards compatibility with existing sessions, and add unit tests.`;

export function TokenCalculator() {
  const [text, setText] = useState(SAMPLE);
  const [model, setModel] = useState("claude-opus-4-8");
  const [res, setRes] = useState<TokenizeResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Debounced live count as you type.
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .tokenize(text, model)
        .then((r) => {
          setRes(r);
          setErr(null);
        })
        .catch((e) => setErr(String(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [text, model]);

  const tokens = res?.tokens ?? 0;
  const cost = estimateCost(tokens, model);

  return (
    <div className="stack">
      <Card
        title="Token calculator"
        right={
          <select value={model} onChange={(e) => setModel(e.target.value)} className="select">
            {PRICED_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        }
      >
        <textarea
          className="ta"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a prompt, file, or context block…"
          rows={10}
          spellCheck={false}
        />
        {err && <p className="error">Couldn't reach the proxy: {err}</p>}
        <div className="stat-grid">
          <Stat label="Tokens" value={fmt(tokens)} accent />
          <Stat label="Characters" value={fmt(res?.characters ?? text.length)} />
          <Stat label="Chars / token" value={tokens ? (text.length / tokens).toFixed(2) : "—"} />
          <Stat label="Est. input cost" value={fmtUsd(cost)} sub={`${model}`} />
        </div>
        <p className="hint">
          {res?.approximate
            ? "Counts are an estimate (fast approximate tokenizer). Exact per-model tokenizers slot in later."
            : "Exact per-model token count."}{" "}
          Cost is a rough input-price estimate — confirm current pricing with your provider.
        </p>
      </Card>

      <Card title="Why it matters">
        <p className="hint">
          Every token here is billed on <strong>every</strong> request that includes this text. A 1,000-token
          system prompt re-sent across 50 turns is 50,000 billed tokens — which is exactly the redundancy TRE's
          caching and dedup stages remove.
        </p>
      </Card>
    </div>
  );
}
