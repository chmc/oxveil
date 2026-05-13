import type { DetectionStatus } from "../types";
import type { PlanUserChoice, PhaseView } from "../views/sidebarState";

export class SidebarMutableState {
  private _detectionStatus: DetectionStatus;
  private _planDetected: boolean;
  private _planUserChoice: PlanUserChoice;
  private _cachedPlanPhases: PhaseView[];
  private _cost: number;
  private _todoDone: number;
  private _todoTotal: number;
  private _selfImprovementActive: boolean;
  private _lessonsAvailable: boolean;
  private _aiParsing: boolean;

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
    this._cost = initial?.cost ?? 0;
    this._todoDone = initial?.todoDone ?? 0;
    this._todoTotal = initial?.todoTotal ?? 0;
    this._selfImprovementActive = initial?.selfImprovementActive ?? false;
    this._lessonsAvailable = initial?.lessonsAvailable ?? false;
    this._aiParsing = initial?.aiParsing ?? false;
  }

  get detectionStatus(): DetectionStatus { return this._detectionStatus; }
  get planDetected(): boolean { return this._planDetected; }
  get planUserChoice(): PlanUserChoice { return this._planUserChoice; }
  get cachedPlanPhases(): PhaseView[] { return this._cachedPlanPhases; }
  get cost(): number { return this._cost; }
  get todoDone(): number { return this._todoDone; }
  get todoTotal(): number { return this._todoTotal; }
  get selfImprovementActive(): boolean { return this._selfImprovementActive; }
  get lessonsAvailable(): boolean { return this._lessonsAvailable; }
  get aiParsing(): boolean { return this._aiParsing; }

  setDetectionStatus(v: DetectionStatus): void { this._detectionStatus = v; }
  setPlanDetected(v: boolean): void { this._planDetected = v; }
  setPlanUserChoice(v: PlanUserChoice): void { this._planUserChoice = v; }
  setCachedPlanPhases(v: PhaseView[]): void { this._cachedPlanPhases = v; }
  addCost(delta: number): void { this._cost += delta; }
  setCost(v: number): void { this._cost = v; }
  setTodos(done: number, total: number): void { this._todoDone = done; this._todoTotal = total; }
  setSelfImprovementActive(v: boolean): void { this._selfImprovementActive = v; }
  setLessonsAvailable(v: boolean): void { this._lessonsAvailable = v; }
  setAiParsing(v: boolean): void { this._aiParsing = v; }

  /** Resets session-level counters for a new run (cost, todos, aiParsing, selfImprovementActive). */
  resetForNewRun(): void {
    this._cost = 0;
    this._todoDone = 0;
    this._todoTotal = 0;
    this._aiParsing = false;
    this._selfImprovementActive = false;
  }

  /** Resets plan-related state (cachedPlanPhases, planUserChoice). */
  resetPlanState(): void {
    this._cachedPlanPhases = [];
    this._planUserChoice = "none";
  }

  /** Resets all fields to their default values. */
  resetAll(): void {
    this._detectionStatus = "not-found";
    this._planDetected = false;
    this._planUserChoice = "none";
    this._cachedPlanPhases = [];
    this._cost = 0;
    this._todoDone = 0;
    this._todoTotal = 0;
    this._selfImprovementActive = false;
    this._lessonsAvailable = false;
    this._aiParsing = false;
  }
}
