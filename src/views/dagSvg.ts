import type { DagLayout, DagNode, DagEdge } from "./dagLayout";

const STATUS_COLORS: Record<string, string> = {
  completed: "#4ec9b0",
  in_progress: "#007acc",
  failed: "#f44747",
  pending: "#555",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderNode(node: DagNode): string {
  const color = STATUS_COLORS[node.status] ?? STATUS_COLORS.pending;
  const statusLabel =
    node.status === "in_progress" ? "running" : node.status;

  let durationText = statusLabel;
  if (node.started && node.completed) {
    const ms =
      new Date(node.completed).getTime() - new Date(node.started).getTime();
    const secs = Math.round(ms / 1000);
    durationText = `${secs}s`;
  }

  const filter =
    node.status === "in_progress" ? ' filter="url(#glow)"' : "";

  return `<g class="dag-node dag-status-${node.status}"${filter}>
  <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="6" ry="6" fill="var(--vscode-editor-background, #1e1e1e)" stroke="${color}" stroke-width="2"/>
  <text x="${node.x + node.width / 2}" y="${node.y + 24}" text-anchor="middle" font-weight="bold" font-size="13" fill="${color}">Phase ${escapeXml(String(node.phaseNumber))}</text>
  <text x="${node.x + node.width / 2}" y="${node.y + 44}" text-anchor="middle" font-size="11" fill="var(--vscode-foreground, #ccc)">${escapeXml(node.title)}</text>
  <text x="${node.x + node.width / 2}" y="${node.y + 62}" text-anchor="middle" font-size="10" fill="${color}">${escapeXml(durationText)}</text>
</g>`;
}

function renderEdge(edge: DagEdge): string {
  return `<line class="dag-edge" x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="var(--vscode-foreground, #888)" stroke-width="1.5" stroke-opacity="0.5" marker-end="url(#arrowhead)"/>`;
}

function renderLegend(x: number): string {
  const items = [
    { label: "Completed", color: STATUS_COLORS.completed },
    { label: "Running", color: STATUS_COLORS.in_progress },
    { label: "Failed", color: STATUS_COLORS.failed },
    { label: "Pending", color: STATUS_COLORS.pending },
  ];

  const lines = items
    .map(
      (item, i) =>
        `<circle cx="${x + 8}" cy="${12 + i * 20}" r="5" fill="${item.color}"/>
    <text x="${x + 20}" y="${16 + i * 20}" font-size="11" fill="var(--vscode-foreground, #ccc)">${item.label}</text>`
    )
    .join("\n  ");

  return `<g class="dag-legend">\n  ${lines}\n</g>`;
}

export function renderDagSvg(layout: DagLayout): string {
  if (layout.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"></svg>`;
  }

  const legendWidth = 100;
  const padding = 20;
  const svgWidth = layout.width + legendWidth + padding * 3;
  const svgHeight = Math.max(layout.height, 100) + padding * 2;

  const defs = `<defs>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
    <polygon points="0 0, 8 3, 0 6" fill="var(--vscode-foreground, #888)" opacity="0.5"/>
  </marker>
</defs>`;

  const edgeSvg = layout.edges.map(renderEdge).join("\n");
  const nodeSvg = layout.nodes.map(renderNode).join("\n");
  const legendSvg = renderLegend(layout.width + padding * 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" font-family="var(--vscode-font-family, sans-serif)">
${defs}
<g transform="translate(${padding}, ${padding})">
${edgeSvg}
${nodeSvg}
${legendSvg}
</g>
</svg>`;
}
