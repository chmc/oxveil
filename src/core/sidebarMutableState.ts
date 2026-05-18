import type { DetectionStatus } from "../types";
import type { PlanUserChoice, PhaseView } from "../views/sidebarState";
import { SessionMetrics } from "./sessionMetrics";

export class SidebarMutableState {
  private _detectionStatus: DetectionStatus;
  private _planDetected: boolean;
  private _planUserChoice: PlanUserChoice;
  private _cachedPlanPhases: PhaseView[];
  private _selfImprovementActive: boolean;
  private _lessonsAvailable: boolean;
  private _aiParsing: boolean;
  readonly metrics: SessionMetrics;

  constructor(initial?: {
    detectionStatus?: DetectionStatus;
    planDetected?: boolean;
    planUserChoice?: PlanUserChoice;
    cachedPlanPhases?: PhaseView[];
    cost?: number;
    todoDone?: number;
    todoTotal?: number;
    selfImprovementActive?: boolean;
    lessonsAvailable?: boolean;
    aiParsing?: boolean;
  }) {
    this._detectionStatus = initial?.detectionStatus ?? "not-found";
    this._planDetected = initial?.planDetected ?? false;
    this._planUserChoice = initial?.planUserChoice ?? "none";
    this._cachedPlanPhases = initial?.cachedPlanPhases ?? [];
    this._selfImprovementActive = initial?.selfImprovementActive ?? false;
    this._lessonsAvailable = initial?.lessonsAvailable ?? false;
    this._aiParsing = initial?.aiParsing ?? false;
    this.metrics = new SessionMetrics();
    if (initial?.cost) this.metrics.setCost(initial.cost);
    if (initial?.todoDone !== undefined && initial?.todoTotal !== undefined) {
      this.metrics.setTodos(initial.todoDone, initial.todoTotal);
    }
  }

  get detectionStatus(): DetectionStatus { return this._detectionStatus; }
  get planDetected(): boolean { return this._planDetected; }
  get planUserChoice(): PlanUserChoice { return this._planUserChoice; }
  get cachedPlanPhases(): PhaseView[] { return this._cachedPlanPhases; }
  get cost(): number { return this.metrics.cost; }
  get todoDone(): number { return this.metrics.todoDone; }
  get todoTotal(): number { return this.metrics.todoTotal; }
  get selfImprovementActive(): boolean { return this._selfImprovementActive; }
  get lessonsAvailable(): boolean { return this._lessonsAvailable; }
  get aiParsing(): boolean { return this._aiParsing; }

  setDetectionStatus(v: DetectionStatus): void { this._detectionStatus = v; }
  setPlanDetected(v: boolean): void { this._planDetected = v; }
  setPlanUserChoice(v: PlanUserChoice): void { this._planUserChoice = v; }
  setCachedPlanPhases(v: PhaseView[]): void { this._cachedPlanPhases = v; }
  addCost(delta: number): void { this.metrics.addCost(delta); }
  setCost(v: number): void { this.metrics.setCost(v); }
  setTodos(done: number, total: number): void { this.metrics.setTodos(done, total); }
  setSelfImprovementActive(v: boolean): void { this._selfImprovementActive = v; }
  setLessonsAvailable(v: boolean): void { this._lessonsAvailable = v; }
  setAiParsing(v: boolean): void { this._aiParsing = v; }

  resetForNewRun(): void {
    this.metrics.reset();
    this._aiParsing = false;
    this._selfImprovementActive = false;
  }

  resetPlanState(): void {
    this._cachedPlanPhases = [];
    this._planUserChoice = "none";
  }

  resetAll(): void {
    this._detectionStatus = "not-found";
    this._planDetected = false;
    this._planUserChoice = "none";
    this._cachedPlanPhases = [];
    this.metrics.reset();
    this._selfImprovementActive = false;
    this._lessonsAvailable = false;
    this._aiParsing = false;
  }
}
