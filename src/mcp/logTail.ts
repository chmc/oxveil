const MAX_LINES = 500;
const MAX_BYTES = 64 * 1024;

interface LogEntry {
  t: number;
  line: string;
}

const ring: LogEntry[] = [];
let totalBytes = 0;

function push(line: string): void {
  const bytes = line.length * 2;
  ring.push({ t: Date.now(), line });
  totalBytes += bytes;
  while (ring.length > MAX_LINES || totalBytes > MAX_BYTES) {
    const removed = ring.shift();
    if (removed) totalBytes -= removed.line.length * 2;
  }
}

const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);

console.log = (...args: unknown[]) => { origLog(...args); push(args.map(String).join(" ")); };
console.warn = (...args: unknown[]) => { origWarn(...args); push("[WARN] " + args.map(String).join(" ")); };
console.error = (...args: unknown[]) => { origError(...args); push("[ERROR] " + args.map(String).join(" ")); };

export function getLogTail(opts: { since?: number; grep?: string }): LogEntry[] {
  let entries = ring.slice();
  if (opts.since !== undefined) entries = entries.filter((e) => e.t >= opts.since!);
  if (opts.grep) {
    const pat = opts.grep.toLowerCase();
    entries = entries.filter((e) => e.line.toLowerCase().includes(pat));
  }
  return entries;
}

export function _resetForTesting(): void {
  ring.length = 0;
  totalBytes = 0;
}
