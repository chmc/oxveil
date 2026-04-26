import type { PlanFileCategory, PersistedPlanState } from "./planPreviewPanel";

export interface TrackedFile {
  path: string;
  category: PlanFileCategory;
  birthtimeMs: number;
}

export interface PlanFileResolverDeps {
  statFile?: (filePath: string) => Promise<{ birthtimeMs: number; mtimeMs: number } | undefined>;
  persistPlanPath?: (state: PersistedPlanState | undefined) => void;
  loadPersistedPlanPath?: () => PersistedPlanState | undefined;
  resolveFromSessionData?: () => Promise<{ planPath: string } | undefined>;
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
  private _sessionDataResolved = false;
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

  getActiveFilePath(): string | undefined {
    if (!this._activeCategory) return undefined;
    return this._trackedFiles.get(this._activeCategory)?.path;
  }

  beginSession(): void {
    this._sessionStartTime = Date.now();
    this._trackedFiles = new Map();
    this._activeCategory = undefined;
    this._autoSwitch = true;
    this._sessionDataResolved = false;
    this._deps.persistPlanPath?.(undefined);
  }

  endSession(): void {
    this._sessionStartTime = undefined;
    this._sessionDataResolved = false;
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
    // Sessionless resolution: 3-layer pipeline
    const resolved = await this._resolveSessionless(candidates);
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
  ): Promise<FileCandidate | undefined> {
    // Layer 1: workspaceState cache
    const cached = this._deps.loadPersistedPlanPath?.();
    if (cached) {
      const exists = this._deps.fileExists
        ? await this._deps.fileExists(cached.planPath)
        : candidates.some((c) => c.path === cached.planPath);
      if (exists) {
        const match = candidates.find((c) => c.path === cached.planPath);
        if (match) return match;
        return { path: cached.planPath, category: "plan", mtimeMs: cached.resolvedAt };
      }
    }

    // Layer 2: Session JSONL lookup (runs once per activation)
    if (!this._sessionDataResolved && this._deps.resolveFromSessionData) {
      this._sessionDataResolved = true;
      try {
        const result = await this._deps.resolveFromSessionData();
        if (result) {
          this._deps.persistPlanPath?.({ planPath: result.planPath, resolvedAt: Date.now() });
          const match = candidates.find((c) => c.path === result.planPath);
          if (match) return match;
          return { path: result.planPath, category: "plan", mtimeMs: Date.now() };
        }
      } catch {
        // Layer 2 failed gracefully — fall through
      }
    }

    // Layer 3: mtimeMs fallback
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
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
