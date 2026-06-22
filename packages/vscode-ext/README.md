# @tre/vscode-ext

VS Code extension — **UX and config only**.

Scope reminder: a VS Code extension can only influence prompts that *its own
extension* sends or that go through the official Language Model API. It **cannot**
intercept Copilot's or Cursor's internal calls. So this extension is not an
interceptor — the local proxy is. Its job is:

- configure `.trerc` (stage toggles, thresholds) with a UI,
- surface live savings from the running proxy,
- one-click "point this client at the proxy".

**Status: placeholder.** Built later, once the engine and dashboard are in place.
