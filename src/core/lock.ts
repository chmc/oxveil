export interface LockState {
  locked: boolean;
  pid?: number;
}

export function parseLock(content: string | undefined): LockState {
  if (!content) return { locked: false };

  const trimmed = content.trim();
  if (!trimmed) return { locked: false };

  const pid = parseInt(trimmed, 10);
  if (isNaN(pid) || pid <= 0) return { locked: false };

  return { locked: true, pid };
}
