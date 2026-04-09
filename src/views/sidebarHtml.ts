import type { SidebarState } from "./sidebarState";
import { renderBody } from "./sidebarRenderers";
import { sidebarCss } from "./sidebarStyles";
import { sidebarJs } from "./sidebarScript";

export function renderSidebar(nonce: string, cspSource: string, state?: SidebarState): string {
  const bodyHtml = renderBody(state);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${sidebarCss()}</style>
</head>
<body>
  <div id="content">${bodyHtml}</div>
  <script nonce="${nonce}">${sidebarJs()}</script>
</body>
</html>`;
}
