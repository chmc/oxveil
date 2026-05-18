import * as os from "node:os";
import * as path from "node:path";
import type { PlanFileCategory, PersistedPlanState } from "./planPreviewPanel";

const SESSIONLESS_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export interface TrackedFile {
  path: string;
  category: PlanFileCategory;
  birthtimeMs: number;
}

export interface PlanFileResolverDeps {
  statFile?: (filePath: string) => Promise<{ birthtimeMs: number; mtimeMs: number } | undefined>;
  persistPlanPath?: (state: PersistedPlanState | undefined) => void;
  loadPersistedPlanPath?: () => PersistedPlanState | undefined;
  fileExists?: (filePath: string) => Promise<boolean>;
}

export interface FileCandidate {
  path: string;
  category: PlanFileCategory;
  mtimeMs: number;
}

export class PlanFileResolver {
  private _sessionStartTime: number | undefined;
  private _trackedFiles = new Map<PlanFileCategory, TrackedFile>();
  private _activeCategory: PlanFileCategory | undefined;
  private _autoSwitch = true;
  private readonly _deps: PlanFileResolverDeps;

  constructor(deps: PlanFileResolverDeps) {
    this._deps = deps;
  }

  get activeCategory(): PlanFileCategory | undefined {
    return this._activeCategory;
  }

  get trackedFiles(): Map<PlanFileCategory, TrackedFile> {
    return this._trackedFiles;
  }

  getTrackedPaths(): string[] {
    return Array.from(this._trackedFiles.values()).map(f => f.path);
  }

  getActiveFilePath(): string | undefined {
    if (!this._activeCategory) return undefined;
    return this._trackedFiles.get(this._activeCategory)?.path;
  }

  beginSession(): void {
    this._sessionStartTime = Date.now();
    this._trackedFiles = new Map();
    this._activeCategory = undefined;
    this._autoSwitch = true;
    this._deps.persistPlanPath?.(undefined);
  }

  endSession(): void {
    this._sessionStartTime = undefined;
    this._trackedFiles.clear();
    this._activeCategory = undefined;
  }

  switchTab(category: PlanFileCategory): TrackedFile | undefined {
    const tracked = this._trackedFiles.get(category);
    if (!tracked) return undefined;
    this._autoSwitch = false;
    this._activeCategory = category;
    return tracked;
  }

  nextTabCategory(): PlanFileCategory | undefined {
    if (this._trackedFiles.size < 2) return undefined;
    const keys = Array.from(this._trackedFiles.keys());
    const currentIndex = this._activeCategory ? keys.indexOf(this._activeCategory) : -1;
    return keys[(currentIndex + 1) % keys.length];
  }

  /**
   * Resolves which file to display from the available candidates.
   * Returns the tracked file for the active category, or undefined if none resolved.
   */
  async resolve(candidates: FileCandidate[]): Promise<TrackedFile | undefined> {
    let newCategoryAdded: PlanFileCategory | undefined;
    console.log("[PlanResolver] resolve candidates:", candidates.length, "sessionStartTime:", this._sessionStartTime);

    if (this._sessionStartTime) {
      newCategoryAdded = await this._resolveWithSession(candidates);
    } else {
      newCategoryAdded = await this._resolveWithoutSession(candidates);
    }

    // Auto-switch: always switch when a new category appears
    if (newCategoryAdded) {
      this._activeCategory = newCategoryAdded;
    } else if (!this._activeCategory && this._trackedFiles.size > 0) {
      this._activeCategory = this._trackedFiles.keys().next().value;
    }

    return this._activeCategory ? this._trackedFiles.get(this._activeCategory) : undefined;
  }

  private async _resolveWithSession(candidates: FileCandidate[]): Promise<PlanFileCategory | undefined> {
    let newCategoryAdded: PlanFileCategory | undefined;
    const candidatePaths = new Set(candidates.map((c) => c.path));

    // Prune tracked files that no longer exist in candidates
    for (const [category, tracked] of this._trackedFiles) {
      if (!candidatePaths.has(tracked.path)) {
        this._trackedFiles.delete(category);
        if (this._activeCategory === category) {
          this._activeCategory = undefined;
        }
      }
    }

    // Session-aware tracking: only track files created OR modified after session start.
    for (const candidate of candidates) {
      if (!this._deps.statFile) continue;

      const stats = await this._deps.statFile(candidate.path);
      if (!stats) continue;
      const isStale = stats.birthtimeMs <= this._sessionStartTime! && stats.mtimeMs <= this._sessionStartTime!;
      const aiParsedInCandidates = candidates.some(c => c.category === "ai-parsed");
      console.log("[PlanResolver] candidate:", { path: candidate.path, birthtimeMs: stats.birthtimeMs, mtimeMs: stats.mtimeMs, sessionStartTime: this._sessionStartTime, isStale });
      if (isStale && !aiParsedInCandidates) continue;

      const existing = this._trackedFiles.get(candidate.category);
      if (!existing) {
        newCategoryAdded = candidate.category;
        this._trackedFiles.set(candidate.category, {
          path: candidate.path,
          category: candidate.category,
          birthtimeMs: stats.birthtimeMs,
        });
      } else if (stats.birthtimeMs > existing.birthtimeMs) {
        this._trackedFiles.set(candidate.category, {
          path: candidate.path,
          category: candidate.category,
          birthtimeMs: stats.birthtimeMs,
        });
      }
    }

    // Persist matched plan path for reload recovery
    const activePath = this._activeCategory
      ? this._trackedFiles.get(this._activeCategory)?.path
      : this._trackedFiles.size > 0
        ? this._trackedFiles.values().next().value?.path
        : undefined;
    if (activePath) {
      this._deps.persistPlanPath?.({ planPath: activePath, resolvedAt: Date.now() });
    }

    return newCategoryAdded;
  }

  private async _resolveWithoutSession(candidates: FileCandidate[]): Promise<PlanFileCategory | undefined> {
    const homePlansDir = path.join(os.homedir(), ".claude", "plans");

    // Prune tracked global plans — they must not persist across resolve cycles
    for (const [category, tracked] of this._trackedFiles) {
      if (tracked.path.startsWith(homePlansDir)) {
        this._trackedFiles.delete(category);
        if (this._activeCategory === category) {
          this._activeCategory = undefined;
        }
      }
    }

    // Sessionless resolution: 3-layer pipeline
    const resolved = await this._resolveSessionless(candidates, homePlansDir);
    if (!resolved) return undefined;

    const existing = this._trackedFiles.get(resolved.category);
    if (!existing || existing.path !== resolved.path) {
      this._trackedFiles.set(resolved.category, {
        path: resolved.path,
        category: resolved.category,
        birthtimeMs: resolved.mtimeMs,
      });
      if (!this._activeCategory) {
        return resolved.category;
      }
    }
    return undefined;
  }

  private async _resolveSessionless(
    candidates: FileCandidate[],
    homePlansDir = path.join(os.homedir(), ".claude", "plans"),
  ): Promise<FileCandidate | undefined> {
    // In sessionless mode, exclude global plans — they may be from other projects
    candidates = candidates.filter(c => !c.path.startsWith(homePlansDir));

    if (candidates.length > 0) {
      candidates = [...candidates].sort((a, b) => b.mtimeMs - a.mtimeMs);
      if (Date.now() - candidates[0].mtimeMs > SESSIONLESS_MAX_AGE_MS) {
        this._deps.persistPlanPath?.(undefined);
        return undefined;
      }
    }

    // Layer 1: workspaceState cache - only use if it points to the newest candidate
    const cached = this._deps.loadPersistedPlanPath?.();
    if (cached && candidates.length > 0) {
      const newest = candidates[0];
      if (cached.planPath === newest.path) {
        return newest;
      }
      // Cache is stale (e.g. points to a file from a previous session) — clear it
      this._deps.persistPlanPath?.(undefined);
    }


    // Layer 3: mtimeMs fallback
    if (candidates.length > 0) {
      return candidates[0];
    }

    return undefined;
  }

  buildTabs(): Array<{ category: PlanFileCategory; label: string; active: boolean }> | undefined {
    if (this._trackedFiles.size < 2) return undefined;
    const labelMap: Record<PlanFileCategory, string> = {
      design: "Design",
      implementation: "Implementation",
      plan: "Plan",
      "ai-parsed": "AI Parsed",
    };
    return Array.from(this._trackedFiles.keys()).map((cat) => ({
      category: cat,
      label: labelMap[cat],
      active: cat === this._activeCategory,
    }));
  }
}
