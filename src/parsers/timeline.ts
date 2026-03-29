import type { ProgressState, TimelineBar, TimelineData } from "../types";

export function parseTimestamp(ts: string): number {
  // Format: "YYYY-MM-DD HH:MM:SS" — treat as local time
  const [date, time] = ts.split(" ");
  if (!date || !time) return 0;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, s] = time.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function computeTimeline(
  progress: ProgressState,
  now: Date,
): TimelineData {
  if (progress.phases.length === 0) {
    return { bars: [], totalElapsedMs: 0, nowOffsetMs: 0, maxTimeMs: 0 };
  }

  const nowMs = now.getTime();

  // Find earliest start time across all phases
  let earliestMs = Infinity;
  for (const phase of progress.phases) {
    if (phase.started) {
      const t = parseTimestamp(phase.started);
      if (t > 0 && t < earliestMs) earliestMs = t;
    }
  }
  if (!isFinite(earliestMs)) earliestMs = nowMs;

  const bars: TimelineBar[] = [];
  let maxTimeMs = 0;

  for (const phase of progress.phases) {
    const startMs = phase.started ? parseTimestamp(phase.started) : 0;
    const startOffsetMs = startMs > 0 ? startMs - earliestMs : 0;

    let durationMs: number;
    let label: string;

    switch (phase.status) {
      case "completed": {
        const endMs = phase.completed ? parseTimestamp(phase.completed) : nowMs;
        durationMs = endMs - (startMs > 0 ? startMs : earliestMs);
        label = formatDuration(durationMs);
        break;
      }
      case "in_progress": {
        durationMs = nowMs - (startMs > 0 ? startMs : earliestMs);
        label = "running...";
        break;
      }
      case "failed": {
        const endMs = phase.completed ? parseTimestamp(phase.completed) : nowMs;
        durationMs = endMs - (startMs > 0 ? startMs : earliestMs);
        label = formatDuration(durationMs);
        break;
      }
      case "pending":
      default: {
        // Pending phases sit at the end as zero-width markers
        durationMs = 0;
        label = "pending";
        break;
      }
    }

    const barEnd =
      phase.status === "pending" ? 0 : startOffsetMs + durationMs;
    if (barEnd > maxTimeMs) maxTimeMs = barEnd;

    bars.push({
      phase: phase.number,
      title: phase.title,
      status: phase.status,
      startOffsetMs: phase.status === "pending" ? maxTimeMs : startOffsetMs,
      durationMs,
      label,
    });
  }

  // Fix pending bars — they should point to final maxTimeMs
  for (const bar of bars) {
    if (bar.status === "pending") {
      bar.startOffsetMs = maxTimeMs;
    }
  }

  const nowOffsetMs = nowMs - earliestMs;
  const totalElapsedMs = nowOffsetMs;

  return { bars, totalElapsedMs, nowOffsetMs, maxTimeMs };
}
