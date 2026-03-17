import type { BatterStatField } from "../utils/constants";

export type RunMode = "dry-run" | "commit";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type LogLevel = "info" | "warn" | "error";
export type MatchConfidence = "high" | "medium" | "low" | "none";

export interface JobInput {
  sourceGameId: string | null;
  sourceUrl: string | null;
  targetGameKey: string;
  targetGameDate: string | null;
  targetOpponent: string | null;
  targetVenue: string | null;
  mode: RunMode;
}

export interface JobLogEntry {
  at: string;
  level: LogLevel;
  step: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface JobErrorSummary {
  message: string;
  step: string | null;
  url: string | null;
  candidateCauses: string[];
}

export interface JobResultSummary {
  message: string;
  sourcePlayerCount: number;
  matchedPlayers: number;
  unmappedPlayers: number;
  saveAttempted: boolean;
  saved: boolean;
  targetGameUrl: string | null;
}

export interface JobRecord extends JobInput {
  id: string;
  dedupeKey: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  logs: JobLogEntry[];
  resultSummary: JobResultSummary | null;
  errorSummary: JobErrorSummary | null;
  preview: DryRunPreview | null;
  lastStep: string | null;
  artifactPaths: string[];
  retryOf: string | null;
}

export interface BatterStat {
  playerName: string;
  battingOrder: number | null;
  position: string | null;
  plateAppearances: number | null;
  atBats: number | null;
  runs: number | null;
  hits: number | null;
  rbi: number | null;
  doubles: number | null;
  triples: number | null;
  homeRuns: number | null;
  walks: number | null;
  hitByPitch: number | null;
  strikeouts: number | null;
  sacrificeBunts: number | null;
  sacrificeFlies: number | null;
  stolenBases: number | null;
  errors: number | null;
  plateAppearanceResults: PlateAppearanceResult[];
}

export interface PlateAppearanceResult {
  appearanceIndex: number;
  rawText: string;
  normalizedText: string;
}

export interface SourcePreview {
  sourceUrl: string;
  pageTitle: string;
  selectedTableIndex: number | null;
  selectedHeaders: string[];
  unknownHeaders: string[];
  batterStats: BatterStat[];
}

export interface RawControl {
  tagName: string;
  type: string | null;
  name: string | null;
  id: string | null;
  value: string | null;
  rowIndex: number;
  cellIndex: number;
  controlIndex: number;
  placeholder: string | null;
}

export interface RawTableCell {
  text: string;
  controls: RawControl[];
}

export interface RawTableRow {
  rowIndex: number;
  cells: RawTableCell[];
}

export interface RawTable {
  tableIndex: number;
  caption: string | null;
  headers: string[];
  rows: RawTableRow[];
}

export interface TableSnapshot {
  url: string;
  title: string;
  tables: RawTable[];
}

export interface FormSnapshot {
  formIndex: number;
  action: string | null;
  method: string | null;
  tables: RawTable[];
  looseControls: RawControl[];
}

export interface TargetControlRef {
  formIndex: number;
  tableIndex: number;
  rowIndex: number;
  cellIndex: number;
  controlIndex: number;
  headerText: string;
  tagName: string;
  type: string | null;
  name: string | null;
  id: string | null;
  currentValue: string | null;
  currentLabel?: string | null;
}

export interface TargetEventOption {
  value: string;
  label: string;
}

export interface TargetAppearanceField {
  appearanceIndex: number;
  main: TargetControlRef | null;
  sub: TargetControlRef | null;
  rbi: TargetControlRef | null;
  rbiSub: TargetControlRef | null;
}

export interface TargetPlayerRow {
  formIndex: number;
  tableIndex: number;
  rowIndex: number;
  lineupIndex: number | null;
  playerLabel: string;
  normalizedPlayerLabel: string;
  selectedUserId: string | null;
  selectedPositionLabel: string | null;
  statFields: Partial<Record<BatterStatField, TargetControlRef>>;
  appearanceFields: TargetAppearanceField[];
  extraControls: TargetControlRef[];
}

export interface TargetFormPreview {
  pageUrl: string;
  pageTitle: string;
  selectedFormIndex: number | null;
  selectedTableIndex: number | null;
  action: string | null;
  method: string | null;
  availableForms: Array<{
    formIndex: number;
    action: string | null;
    method: string | null;
    tableCount: number;
    looseControlCount: number;
  }>;
  headers: string[];
  hiddenInputs: Array<{
    name: string | null;
    value: string | null;
  }>;
  eventOptions: TargetEventOption[];
  playerRows: TargetPlayerRow[];
}

export interface PlateAppearanceAssignment {
  appearanceIndex: number;
  sourceText: string;
  targetOptionValue: string | null;
  targetOptionLabel: string | null;
  targetControl: TargetControlRef | null;
  rbiControl: TargetControlRef | null;
  warnings: string[];
}

export interface MappingAssignment {
  source: BatterStat;
  targetPlayerLabel: string | null;
  confidence: MatchConfidence;
  statAssignments: Partial<Record<BatterStatField, TargetControlRef>>;
  appearanceAssignments: PlateAppearanceAssignment[];
  warnings: string[];
}

export interface MappingPreview {
  assignments: MappingAssignment[];
  unmatchedSourcePlayers: string[];
  unmatchedTargetPlayers: string[];
  warnings: string[];
}

export interface DryRunPreview {
  source: SourcePreview | null;
  target: TargetFormPreview | null;
  mapping: MappingPreview | null;
  warnings: string[];
  commitReady: boolean;
}

export interface OrderMadeSecrets {
  baseUrl: string;
  loginUrl: string;
  username: string;
  password: string;
}

export interface TsLeagueSecrets {
  loginUrl: string;
  gameListUrl: string;
  username: string;
  password: string;
}

export interface LineNotificationSecrets {
  apiUrl: string;
  accessToken: string;
  recipientId: string;
}

export interface AppSecrets {
  orderMade: OrderMadeSecrets;
  tsLeague: TsLeagueSecrets;
}

export interface AutomationContext {
  log: (level: LogLevel, step: string, message: string, context?: Record<string, unknown>) => Promise<void>;
  attachArtifact: (relativePath: string) => Promise<void>;
  savePreview: (preview: DryRunPreview) => Promise<void>;
  saveResult: (result: JobResultSummary) => Promise<void>;
  updateLastStep: (step: string) => Promise<void>;
}

export interface GameMatchCandidate {
  label: string;
  href: string | null;
  score: number;
}
