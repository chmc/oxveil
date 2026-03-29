export interface ArchiveMetadata {
  plan: string;
  started: string;
  finished: string;
  status: string;
  phasesTotal: number;
  phasesCompleted: number;
  phasesFailed: number;
  claudeloopVersion: string;
}

export interface ArchiveEntry {
  name: string;
  label: string;
  metadata: ArchiveMetadata | null;
  timestamp: string;
}

export interface ArchiveParseDeps {
  readdir: (dir: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
  isDirectory: (path: string) => Promise<boolean>;
}

function parseMetadata(content: string): ArchiveMetadata | null {
  const fields = new Map<string, string>();
  for (const line of content.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key && value) fields.set(key, value);
  }

  const plan = fields.get("plan");
  const started = fields.get("started");
  const finished = fields.get("finished");
  const status = fields.get("status");
  if (!plan || !started || !finished || !status) return null;

  return {
    plan,
    started,
    finished,
    status,
    phasesTotal: parseInt(fields.get("phases_total") ?? "0", 10) || 0,
    phasesCompleted: parseInt(fields.get("phases_completed") ?? "0", 10) || 0,
    phasesFailed: parseInt(fields.get("phases_failed") ?? "0", 10) || 0,
    claudeloopVersion: fields.get("claudeloop_version") ?? "unknown",
  };
}

function extractTimestamp(dirName: string): string {
  // Expected format: YYYYMMDD-HHMMSS
  const match = dirName.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!match) return dirName;
  const [, y, mo, d, h, mi] = match;
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

function computeDuration(started: string, finished: string): string {
  const s = new Date(started).getTime();
  const f = new Date(finished).getTime();
  if (isNaN(s) || isNaN(f)) return "";
  const mins = Math.round((f - s) / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export async function parseArchive(
  deps: ArchiveParseDeps,
  archiveRoot: string,
): Promise<ArchiveEntry[]> {
  let entries: string[];
  try {
    entries = await deps.readdir(archiveRoot);
  } catch {
    return [];
  }

  const results: ArchiveEntry[] = [];
  const sep = archiveRoot.endsWith("/") ? "" : "/";

  for (const name of entries) {
    const dirPath = `${archiveRoot}${sep}${name}`;
    let isDir: boolean;
    try {
      isDir = await deps.isDirectory(dirPath);
    } catch {
      continue;
    }
    if (!isDir) continue;

    let metadata: ArchiveMetadata | null = null;
    try {
      const content = await deps.readFile(`${dirPath}/metadata.txt`);
      metadata = parseMetadata(content);
    } catch {
      // Missing metadata.txt — fall back to dir name
    }

    const label = metadata?.plan ?? name;
    const timestamp = metadata?.started ?? extractTimestamp(name);

    results.push({ name, label, metadata, timestamp });
  }

  // Sort descending by timestamp (newest first)
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return results;
}

export { extractTimestamp, computeDuration, formatDate, parseMetadata };
