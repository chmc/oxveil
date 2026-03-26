import type {
  GitExecDeps,
  PhaseCommitRange,
} from "../core/gitIntegration";
import { findPhaseCommits, getPhaseUnifiedDiff } from "../core/gitIntegration";

export interface DiffProviderDeps {
  gitExec: GitExecDeps;
}

/** URI scheme for phase diff documents. */
export const DIFF_URI_SCHEME = "oxveil-diff";

/** Encode a phase number into a diff URI path. */
export function encodeDiffUri(phaseNumber: number | string): string {
  return `${DIFF_URI_SCHEME}:Phase-${phaseNumber}.diff`;
}

/** Extract phase number from a diff URI path. */
export function decodeDiffUri(path: string): number | string {
  const match = path.match(/^Phase-(.+)\.diff$/);
  if (!match) return 0;
  const num = Number(match[1]);
  return Number.isNaN(num) ? match[1] : num;
}

/**
 * TextDocumentContentProvider for `oxveil-diff:` URI scheme.
 * Provides unified diff content for a phase's git commits.
 */
export class PhaseDiffProvider {
  private _deps: DiffProviderDeps;

  constructor(deps: DiffProviderDeps) {
    this._deps = deps;
  }

  async provideTextDocumentContent(uri: { path: string }): Promise<string> {
    const phaseNumber = decodeDiffUri(uri.path);

    const range: PhaseCommitRange | null = await findPhaseCommits(
      this._deps.gitExec,
      phaseNumber,
    );

    if (!range) {
      return `No commits found for Phase ${phaseNumber}`;
    }

    const diff = await getPhaseUnifiedDiff(this._deps.gitExec, range);
    return diff || `No file changes found for Phase ${phaseNumber}`;
  }
}
