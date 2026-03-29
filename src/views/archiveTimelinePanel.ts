import * as vscode from "vscode";
import * as crypto from "node:crypto";
import type { ProgressState } from "../types";
import type { ArchiveMetadata } from "../parsers/archive";
import { computeTimeline, parseTimestamp } from "../parsers/timeline";
import { renderTimelineHtml, type TimelineHeader } from "./timelineHtml";
import { formatDate, computeDuration } from "../parsers/archive";

export interface ArchiveTimelineDeps {
  createWebviewPanel: typeof vscode.window.createWebviewPanel;
}

export class ArchiveTimelinePanel {
  private readonly _deps: ArchiveTimelineDeps;
  private readonly _panels = new Map<string, vscode.WebviewPanel>();

  constructor(deps: ArchiveTimelineDeps) {
    this._deps = deps;
  }

  reveal(
    archiveName: string,
    progress: ProgressState,
    metadata: ArchiveMetadata | null,
  ): void {
    const existing = this._panels.get(archiveName);
    if (existing) {
      existing.reveal();
      return;
    }

    const title = metadata?.plan ?? archiveName;
    const panel = this._deps.createWebviewPanel(
      "oxveil.archiveTimeline",
      `Timeline: ${title}`,
      vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: false },
    );

    panel.onDidDispose(() => {
      this._panels.delete(archiveName);
    });

    this._panels.set(archiveName, panel);

    const finishedDate = this._resolveFinishDate(progress, metadata);
    const data = computeTimeline(progress, finishedDate);
    const nonce = crypto.randomBytes(16).toString("hex");
    const cspSource = panel.webview.cspSource;

    const header: TimelineHeader = {
      title,
      date: metadata ? formatDate(metadata.started) : "",
      duration: this._computePhaseDuration(progress),
      status: metadata?.status ?? "unknown",
      phaseCount: progress.totalPhases,
    };

    panel.webview.html = renderTimelineHtml(data, nonce, cspSource, header);
  }

  dispose(): void {
    for (const panel of this._panels.values()) {
      panel.dispose();
    }
    this._panels.clear();
  }

  private _resolveFinishDate(
    progress: ProgressState,
    metadata: ArchiveMetadata | null,
  ): Date {
    let latestMs = 0;
    for (const phase of progress.phases) {
      if (phase.completed) {
        const t = parseTimestamp(phase.completed);
        if (t > latestMs) latestMs = t;
      }
    }
    if (latestMs > 0) return new Date(latestMs);

    if (metadata?.finished) {
      const t = new Date(metadata.finished).getTime();
      if (!isNaN(t)) return new Date(t);
    }

    for (const phase of progress.phases) {
      if (phase.started) {
        const t = parseTimestamp(phase.started);
        if (t > 0) return new Date(t);
      }
    }

    return new Date();
  }

  private _computePhaseDuration(progress: ProgressState): string {
    let earliestStarted = "";
    let latestCompleted = "";
    for (const phase of progress.phases) {
      if (phase.started && (!earliestStarted || phase.started < earliestStarted)) {
        earliestStarted = phase.started;
      }
      if (phase.completed && (!latestCompleted || phase.completed > latestCompleted)) {
        latestCompleted = phase.completed;
      }
    }
    if (!earliestStarted || !latestCompleted) return "";
    return computeDuration(earliestStarted, latestCompleted);
  }
}
