import type { TimelineData } from "../types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function computeTicks(maxTimeMs: number): { ms: number; label: string }[] {
  if (maxTimeMs <= 0) return [{ ms: 0, label: "0m" }];

  // Aim for 5-7 ticks. Pick a nice interval in minutes.
  const maxMinutes = maxTimeMs / 60_000;
  const candidates = [1, 2, 5, 10, 15, 30, 60];
  let interval = 1;
  for (const c of candidates) {
    if (maxMinutes / c <= 7) {
      interval = c;
      break;
    }
  }

  const ticks: { ms: number; label: string }[] = [];
  let m = 0;
  while (m * 60_000 <= maxTimeMs * 1.1) {
    ticks.push({ ms: m * 60_000, label: `${m}m` });
    m += interval;
    if (ticks.length >= 8) break;
  }
  return ticks;
}

function statusClass(status: string): string {
  switch (status) {
    case "completed":
      return "complete";
    case "in_progress":
      return "running";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

export function renderTimelineHtml(
  data: TimelineData,
  nonce: string,
  cspSource: string,
): string {
  const ticks = computeTicks(data.maxTimeMs);
  const timelineWidth = Math.max(data.maxTimeMs, data.nowOffsetMs, 1);

  const tickMarksHtml = ticks
    .map((t) => {
      const pct = (t.ms / timelineWidth) * 100;
      return `<div class="tick" style="left:${pct}%"><div class="tick-line"></div><span class="tick-label">${t.label}</span></div>`;
    })
    .join("\n");

  const gridLinesHtml = ticks
    .map((t) => {
      const pct = (t.ms / timelineWidth) * 100;
      return `<div class="grid-line" style="left:${pct}%"></div>`;
    })
    .join("\n");

  const nowPct = (data.nowOffsetMs / timelineWidth) * 100;
  const nowMinutes = Math.round(data.nowOffsetMs / 60_000);
  const nowLineHtml = `<div class="now-line" style="left:${nowPct}%"><span class="now-label">NOW ${nowMinutes}m</span></div>`;

  const barsHtml = data.bars
    .map((bar) => {
      const cls = statusClass(bar.status);
      const leftPct = (bar.startOffsetMs / timelineWidth) * 100;
      const widthPct = (bar.durationMs / timelineWidth) * 100;

      let barInner: string;
      if (bar.status === "pending") {
        barInner = `<div class="bar-track"><div class="bar ${cls}" style="right:0;width:60px"></div></div>`;
      } else {
        barInner = `<div class="bar-track"><div class="bar ${cls}" style="left:${leftPct}%;width:${widthPct}%"><span class="bar-label">${escapeHtml(bar.label)}</span></div></div>`;
      }

      return `<div class="row">
  <div class="phase-label">${escapeHtml(String(bar.phase))}. ${escapeHtml(bar.title)}</div>
  ${barInner}
</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); background: var(--vscode-editor-background); color: var(--vscode-foreground, #ccc); padding: 0; }

    .timeline-container { padding: 16px; }

    .timeline-header { background: var(--vscode-titleBar-activeBackground, #333); padding: 10px 16px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border, #444); }
    .timeline-header .icon { color: #007acc; }
    .timeline-header .elapsed { margin-left: auto; color: #4ec9b0; font-weight: 400; font-size: 13px; }

    .chart { position: relative; margin-top: 12px; }

    .time-axis { position: relative; height: 28px; margin-left: 160px; }
    .tick { position: absolute; top: 0; }
    .tick-line { width: 1px; height: 8px; background: #555; }
    .tick-label { font-size: 11px; color: #888; position: absolute; top: 10px; transform: translateX(-50%); white-space: nowrap; }

    .tracks { position: relative; margin-left: 160px; }
    .grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.06); }

    .row { display: flex; align-items: center; height: 32px; }
    .phase-label { width: 160px; flex-shrink: 0; font-size: 12px; color: #ccc; padding-right: 12px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: -160px; }
    .bar-track { flex: 1; position: relative; height: 22px; }

    .bar { position: absolute; height: 100%; border-radius: 3px; display: flex; align-items: center; padding: 0 8px; font-size: 11px; font-weight: 600; color: #fff; min-width: 2px; }
    .bar.complete { background: #2e7d32; }
    .bar.running { background: #0e639c; box-shadow: 0 0 8px rgba(14,99,156,0.5); }
    .bar.failed { background: #c72e2e; }
    .bar.pending { background: #333; border: 1px dashed #666; color: #888; }

    .bar-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .now-line { position: absolute; top: 0; bottom: 0; width: 2px; background: #007acc; z-index: 10; }
    .now-label { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #007acc; font-weight: 600; white-space: nowrap; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .bar.running .bar-label { animation: pulse 2s ease-in-out infinite; }
  </style>
</head>
<body>
  <div class="timeline-header">
    <span class="icon codicon codicon-graph-line">&#x2197;</span>
    Execution Timeline
    <span class="elapsed">Total: ${formatElapsed(data.totalElapsedMs)}</span>
  </div>
  <div class="timeline-container">
    <div class="chart">
      <div class="time-axis">
        ${tickMarksHtml}
      </div>
      <div class="tracks">
        ${gridLinesHtml}
        ${nowLineHtml}
        ${barsHtml}
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      var startTime = Date.now();
      var nowLine = document.querySelector('.now-line');
      var nowLabel = document.querySelector('.now-label');
      var initialPct = ${nowPct};
      var timelineMs = ${timelineWidth};

      setInterval(function() {
        var elapsedSinceLoad = Date.now() - startTime;
        var newNowMs = ${data.nowOffsetMs} + elapsedSinceLoad;
        var pct = (newNowMs / timelineMs) * 100;
        if (nowLine) nowLine.style.left = pct + '%';
        if (nowLabel) nowLabel.textContent = 'NOW ' + Math.round(newNowMs / 60000) + 'm';
      }, 10000);
    })();
  </script>
</body>
</html>`;
}
