import * as vscode from "vscode";

interface Aggregate {
  requests: number;
  saved: number;
  savedPct: number;
}

function cfg<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration("tre").get<T>(key, fallback);
}

/**
 * TRE VS Code extension — UX and config only.
 *
 * It cannot intercept other extensions' AI calls (that's the proxy's job); it
 * surfaces live savings from the running proxy and helps point clients at it.
 */
export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "tre.showSavings";
  context.subscriptions.push(status);

  async function fetchAggregate(): Promise<Aggregate | undefined> {
    const url = cfg("proxyUrl", "http://127.0.0.1:8787");
    try {
      const res = await fetch(`${url}/v1/metrics`);
      if (!res.ok) return undefined;
      const body = (await res.json()) as { aggregate: Aggregate };
      return body.aggregate;
    } catch {
      return undefined;
    }
  }

  async function refresh(): Promise<void> {
    const agg = await fetchAggregate();
    if (!agg) {
      status.text = "$(zap) TRE offline";
      status.tooltip = "TRE proxy not reachable. Start it on 127.0.0.1:8787.";
    } else {
      status.text = `$(zap) TRE ${agg.savedPct.toFixed(0)}%`;
      status.tooltip = `${agg.requests} requests · ${agg.saved.toLocaleString()} tokens saved`;
    }
    status.show();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("tre.showSavings", async () => {
      const agg = await fetchAggregate();
      if (!agg) {
        vscode.window.showWarningMessage("TRE proxy not reachable. Start it on 127.0.0.1:8787.");
        return;
      }
      vscode.window.showInformationMessage(
        `TRE: ${agg.savedPct.toFixed(1)}% reduction across ${agg.requests} requests (${agg.saved.toLocaleString()} tokens saved).`,
      );
      await refresh();
    }),
    vscode.commands.registerCommand("tre.openDashboard", async () => {
      await vscode.env.openExternal(vscode.Uri.parse(cfg("dashboardUrl", "http://127.0.0.1:5173")));
    }),
    vscode.commands.registerCommand("tre.copyBaseUrl", async () => {
      const url = cfg("proxyUrl", "http://127.0.0.1:8787");
      await vscode.env.clipboard.writeText(url);
      vscode.window.showInformationMessage(`Copied ${url} — set ANTHROPIC_BASE_URL / OPENAI_BASE_URL to it.`);
    }),
  );

  void refresh();
  const seconds = Math.max(2, cfg("refreshSeconds", 5));
  const timer = setInterval(() => void refresh(), seconds * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

export function deactivate(): void {
  /* nothing to clean up beyond disposables */
}
