# tre-vscode

VS Code extension — **UX and config only**.

Scope reminder: a VS Code extension can only influence prompts that *its own
extension* sends or that go through the official Language Model API. It **cannot**
intercept Copilot's or Cursor's internal calls. So this extension is not an
interceptor — the local proxy is. It:

- shows a **live savings status-bar item** (`⚡ TRE 41%`) polled from the proxy,
- **TRE: Show Savings** — quick reduction summary,
- **TRE: Open Dashboard** — opens the local dashboard,
- **TRE: Copy Proxy Base URL** — copy the base URL to point a client at.

Settings: `tre.proxyUrl`, `tre.dashboardUrl`, `tre.refreshSeconds`.

## Build / run

```bash
pnpm --filter tre-vscode build   # compiles to out/extension.js
```

Then press **F5** in VS Code (or package with `vsce`) to launch an Extension
Development Host. Requires the TRE proxy running on `tre.proxyUrl`.
