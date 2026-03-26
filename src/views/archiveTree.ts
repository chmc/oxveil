import type { ArchiveEntry } from "../parsers/archive";
import { computeDuration, formatDate } from "../parsers/archive";

export interface ArchiveTreeItem {
  label: string;
  description?: string;
  iconId?: string;
  iconColor?: string;
  contextValue?: string;
  archiveName?: string;
}

type ArchiveStatus = "completed" | "failed" | "unknown";

const STATUS_ICONS: Record<ArchiveStatus, { id: string; color: string }> = {
  completed: { id: "check", color: "testing.iconPassed" },
  failed: { id: "error", color: "testing.iconFailed" },
  unknown: { id: "warning", color: "problemsWarningIcon.foreground" },
};

function resolveStatus(entry: ArchiveEntry): ArchiveStatus {
  if (!entry.metadata) return "unknown";
  const s = entry.metadata.status;
  if (s === "completed") return "completed";
  if (s === "failed") return "failed";
  return "unknown";
}

function buildDescription(entry: ArchiveEntry): string {
  const parts: string[] = [];

  if (entry.metadata) {
    parts.push(formatDate(entry.metadata.started));
    if (entry.metadata.phasesTotal > 0) {
      parts.push(`${entry.metadata.phasesTotal} phases`);
    }
    const duration = computeDuration(entry.metadata.started, entry.metadata.finished);
    if (duration) parts.push(duration);
    parts.push(entry.metadata.status);
  } else {
    parts.push(entry.name);
    parts.push("unknown");
  }

  return parts.join(" · ");
}

export class ArchiveTreeProvider {
  private _entries: ArchiveEntry[] = [];

  update(entries: ArchiveEntry[]): void {
    this._entries = entries;
  }

  getChildren(): ArchiveTreeItem[] {
    if (this._entries.length === 0) {
      return [
        {
          label: "$(info) No past runs",
          description: "Completed sessions appear here",
        },
      ];
    }

    return this._entries.map((entry) => {
      const status = resolveStatus(entry);
      const icon = STATUS_ICONS[status];
      return {
        label: entry.label,
        description: buildDescription(entry),
        iconId: icon.id,
        iconColor: icon.color,
        contextValue: "archive",
        archiveName: entry.name,
      };
    });
  }
}
