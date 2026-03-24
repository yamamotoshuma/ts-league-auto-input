import type {
  BatterStat,
  MappingAssignment,
  MappingPreview,
  MatchConfidence,
  PlateAppearanceAssignment,
  TargetControlRef,
  TargetFormPreview,
  TargetOptionAssignment,
  TargetPlayerRow,
  TargetSelectOption,
} from "./types";
import type { BatterStatField } from "../utils/constants";
import { BATTER_STAT_FIELDS } from "../utils/constants";
import { findTargetEventOption, isTargetEventLabelCompatible, normalizePosition } from "./playEvent";
import { expandNameCandidates, namesLooselyMatch, normalizeName } from "../utils/nameNormalizer";

const TARGET_WRITABLE_STAT_FIELDS: Array<"rbi" | "runs" | "stolenBases" | "errors"> = [
  "rbi",
  "runs",
  "stolenBases",
  "errors",
];

function normalizeTargetPlayerName(label: string): string {
  return normalizeName(label.replace(/\[[^\]]+\]/g, ""));
}

function stringifyStatValue(value: BatterStat[keyof BatterStat]): string {
  if (value === null) {
    return "";
  }

  return String(value);
}

function isMeaningfulAppearanceValue(value: string | null): boolean {
  return value !== null && value !== "" && value !== "0";
}

function isMeaningfulSelectValue(value: string | null): boolean {
  return value !== null && value !== "" && value !== "0";
}

function isPlaceholderLabel(value: string | null): boolean {
  return value === null || value.trim() === "" || value.trim() === "-";
}

function getTargetPosition(target: TargetPlayerRow): string | null {
  if (isPlaceholderLabel(target.selectedPositionLabel)) {
    return null;
  }

  return normalizePosition(target.selectedPositionLabel);
}

function compareConfidence(source: BatterStat, target: TargetPlayerRow): MatchConfidence {
  const sourcePosition = normalizePosition(source.position);
  const targetPosition = getTargetPosition(target);

  const orderMatches = source.battingOrder !== null && target.lineupIndex === source.battingOrder;
  const positionMatches = sourcePosition !== null && targetPosition !== null && sourcePosition === targetPosition;
  const nameMatches =
    !isPlaceholderLabel(target.playerLabel) && namesLooselyMatch(source.playerName, normalizeTargetPlayerName(target.playerLabel));

  if (orderMatches && positionMatches) {
    return nameMatches ? "high" : "medium";
  }

  if (nameMatches && (orderMatches || positionMatches)) {
    return "high";
  }

  if (nameMatches || orderMatches || positionMatches) {
    return "medium";
  }

  return "none";
}

function scoreTargetRow(source: BatterStat, target: TargetPlayerRow): number {
  const confidence = compareConfidence(source, target);
  const orderBonus = source.battingOrder !== null && target.lineupIndex === source.battingOrder ? 20 : 0;
  const positionBonus =
    normalizePosition(source.position) !== null && getTargetPosition(target) === normalizePosition(source.position) ? 10 : 0;
  const nameBonus =
    !isPlaceholderLabel(target.playerLabel) && namesLooselyMatch(source.playerName, normalizeTargetPlayerName(target.playerLabel))
      ? 15
      : 0;

  switch (confidence) {
    case "high":
      return 100 + orderBonus + positionBonus + nameBonus;
    case "medium":
      return 60 + orderBonus + positionBonus + nameBonus;
    default:
      return 0;
  }
}

function isWritableField(field: BatterStatField): field is Exclude<BatterStatField, "playerName" | "battingOrder" | "position"> {
  return !["playerName", "battingOrder", "position"].includes(field);
}

function collectAssignments(target: TargetPlayerRow | null): Partial<Record<BatterStatField, TargetControlRef>> {
  if (!target) {
    return {};
  }

  const result: Partial<Record<BatterStatField, TargetControlRef>> = {};
  for (const field of BATTER_STAT_FIELDS) {
    if (!isWritableField(field)) {
      continue;
    }

    const control = target.statFields[field];
    if (control) {
      result[field] = control;
    }
  }

  return result;
}

function buildAppearanceAssignments(
  source: BatterStat,
  target: TargetPlayerRow | null,
  targetPreview: TargetFormPreview,
): PlateAppearanceAssignment[] {
  if (!target) {
    return source.plateAppearanceResults.map((appearance) => ({
      appearanceIndex: appearance.appearanceIndex,
      sourceText: appearance.rawText,
      targetOptionValue: null,
      targetOptionLabel: null,
      targetControl: null,
      rbiControl: null,
      warnings: ["target row not found"],
    }));
  }

  return source.plateAppearanceResults.map((appearance) => {
    const fieldGroup =
      target.appearanceFields.find((field) => field.appearanceIndex === appearance.appearanceIndex) ?? null;
    const currentControl = fieldGroup?.main ?? null;
    const keepCurrentValue =
      isMeaningfulAppearanceValue(currentControl?.currentValue ?? null) &&
      isTargetEventLabelCompatible(appearance.rawText, currentControl?.currentLabel ?? null);
    const option = keepCurrentValue
      ? {
          value: currentControl?.currentValue ?? "",
          label: currentControl?.currentLabel ?? "",
        }
      : findTargetEventOption(appearance.rawText, targetPreview.eventOptions);
    const warnings: string[] = [];

    if (!fieldGroup?.main) {
      warnings.push("target appearance slot not found");
    }

    if (!option) {
      warnings.push("target event option not resolved");
    }

    if (
      !keepCurrentValue &&
      isMeaningfulAppearanceValue(currentControl?.currentValue ?? null) &&
      currentControl?.currentValue !== option?.value
    ) {
      warnings.push("existing target appearance value would be overwritten");
    }

    return {
      appearanceIndex: appearance.appearanceIndex,
      sourceText: appearance.rawText,
      targetOptionValue: option?.value ?? null,
      targetOptionLabel: option?.label ?? null,
      targetControl: currentControl,
      rbiControl: fieldGroup?.rbi ?? null,
      warnings,
    };
  });
}

function scorePlayerOption(sourcePlayerName: string, option: TargetSelectOption): number {
  if (!isMeaningfulSelectValue(option.value)) {
    return 0;
  }

  const sourceCandidates = expandNameCandidates(sourcePlayerName);
  let score = 0;

  for (const candidate of sourceCandidates) {
    if (option.normalizedLabel === candidate) {
      score = Math.max(score, 100);
      continue;
    }

    if (option.normalizedLabel.includes(candidate) || candidate.includes(option.normalizedLabel)) {
      score = Math.max(score, 80);
    }
  }

  return score;
}

function findBestPlayerOption(sourcePlayerName: string, options: TargetSelectOption[]): {
  best: { option: TargetSelectOption; score: number } | null;
  second: { option: TargetSelectOption; score: number } | null;
} {
  const candidates = options
    .map((option) => ({ option, score: scorePlayerOption(sourcePlayerName, option) }))
    .sort((left, right) => right.score - left.score);

  return {
    best: candidates[0] ?? null,
    second: candidates[1] ?? null,
  };
}

function resolvePlayerSelection(source: BatterStat, target: TargetPlayerRow): TargetOptionAssignment {
  const currentValue = target.playerControl?.currentValue ?? target.selectedUserId;
  const currentLabel = target.playerLabel;

  if (!target.playerControl) {
    return {
      control: null,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings: ["target player select not found"],
    };
  }

  const warnings: string[] = [];
  const { best, second } = findBestPlayerOption(source.playerName, target.playerOptions);

  if (isMeaningfulSelectValue(currentValue)) {
    if (namesLooselyMatch(source.playerName, currentLabel)) {
      return {
        control: target.playerControl,
        targetOptionValue: currentValue,
        targetOptionLabel: currentLabel,
        warnings,
      };
    }
    warnings.push("existing target player would be overwritten");
  }

  if (!best || best.score === 0) {
    warnings.push("target player option not resolved");
    return {
      control: target.playerControl,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings,
    };
  }

  if (second && second.score === best.score) {
    warnings.push("multiple target player options matched with equal score");
  }

  return {
    control: target.playerControl,
    targetOptionValue: best.option.value,
    targetOptionLabel: best.option.label,
    warnings,
  };
}

function resolvePositionSelection(source: BatterStat, target: TargetPlayerRow): TargetOptionAssignment | null {
  const sourcePosition = normalizePosition(source.position);
  if (!sourcePosition) {
    return null;
  }

  if (!target.positionControl) {
    return {
      control: null,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings: ["target position select not found"],
    };
  }

  const currentValue = target.positionControl.currentValue;
  const currentLabel = target.selectedPositionLabel;
  const currentPosition = getTargetPosition(target);
  const option =
    target.positionOptions.find((candidate) => normalizePosition(candidate.label) === sourcePosition) ?? null;

  if (currentPosition === sourcePosition && currentValue !== null) {
    return {
      control: target.positionControl,
      targetOptionValue: currentValue,
      targetOptionLabel: currentLabel,
      warnings: [],
    };
  }

  if (!option) {
    return {
      control: target.positionControl,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings: ["target position option not resolved"],
    };
  }

  const warnings = currentPosition !== null && currentPosition !== sourcePosition ? ["existing target position would be overwritten"] : [];
  return {
    control: target.positionControl,
    targetOptionValue: option.value,
    targetOptionLabel: option.label,
    warnings,
  };
}

function createAssignment(source: BatterStat, targetPreview: TargetFormPreview): MappingAssignment {
  const sortedCandidates = targetPreview.playerRows
    .map((target) => ({ target, score: scoreTargetRow(source, target) }))
    .sort((left, right) => right.score - left.score);

  const best = sortedCandidates[0];
  const second = sortedCandidates[1];
  const warnings: string[] = [];

  if (!best || best.score === 0) {
    return {
      source,
      targetPlayerLabel: null,
      targetLineupIndex: null,
      confidence: "none",
      playerSelection: null,
      positionSelection: null,
      statAssignments: {},
      appearanceAssignments: buildAppearanceAssignments(source, null, targetPreview),
      warnings: ["target player row not found"],
    };
  }

  if (second && second.score === best.score) {
    warnings.push("multiple target rows matched with equal score");
  }

  const confidence = compareConfidence(source, best.target);
  const playerSelection = resolvePlayerSelection(source, best.target);
  const positionSelection = resolvePositionSelection(source, best.target);
  const displayTargetLabel = playerSelection.targetOptionLabel ?? best.target.playerLabel;
  const nameMatches = !isPlaceholderLabel(displayTargetLabel) && namesLooselyMatch(source.playerName, displayTargetLabel);
  if (!nameMatches) {
    warnings.push("matched by batting order / position because player name did not match directly");
  }

  warnings.push(...playerSelection.warnings);
  if (positionSelection) {
    warnings.push(...positionSelection.warnings);
  }

  const appearanceAssignments = buildAppearanceAssignments(source, best.target, targetPreview);
  warnings.push(
    ...appearanceAssignments.flatMap((assignment) =>
      assignment.warnings.map((warning) => `appearance ${assignment.appearanceIndex}: ${warning}`),
    ),
  );

  return {
    source,
    targetPlayerLabel: displayTargetLabel,
    targetLineupIndex: best.target.lineupIndex,
    confidence,
    playerSelection,
    positionSelection,
    statAssignments: collectAssignments(best.target),
    appearanceAssignments,
    warnings,
  };
}

function hasAllWritableFields(assignment: MappingAssignment): boolean {
  if (!assignment.playerSelection?.control || !assignment.playerSelection.targetOptionValue) {
    return false;
  }

  if (assignment.source.position !== null) {
    if (!assignment.positionSelection?.control || assignment.positionSelection.targetOptionValue === null) {
      return false;
    }
  }

  for (const field of TARGET_WRITABLE_STAT_FIELDS) {
    const sourceValue = assignment.source[field];
    if (sourceValue === null) {
      continue;
    }

    if (!assignment.statAssignments[field]) {
      return false;
    }
  }

  if (
    !assignment.appearanceAssignments.every(
      (appearance) => appearance.targetControl !== null && appearance.targetOptionValue !== null,
    )
  ) {
    return false;
  }

  return true;
}

export function buildMappingPreview(
  sourceStats: BatterStat[],
  targetPreview: TargetFormPreview,
): MappingPreview {
  const assignments = sourceStats.map((source) => createAssignment(source, targetPreview));
  const matchedLineupIndexes = new Set(
    assignments
      .map((assignment) => assignment.targetLineupIndex)
      .filter((value): value is number => value !== null),
  );

  return {
    assignments,
    unmatchedSourcePlayers: assignments
      .filter((assignment) => assignment.targetPlayerLabel === null)
      .map((assignment) => assignment.source.playerName),
    unmatchedTargetPlayers: targetPreview.playerRows
      .filter((row) => row.lineupIndex === null || !matchedLineupIndexes.has(row.lineupIndex))
      .map((row) => row.playerLabel),
    warnings: assignments.flatMap((assignment) =>
      assignment.warnings.map((warning) => `${assignment.source.playerName}: ${warning}`),
    ),
  };
}

export function isCommitReady(mapping: MappingPreview): boolean {
  return mapping.assignments.every((assignment) => {
    if (assignment.targetPlayerLabel === null) {
      return false;
    }

    if (assignment.confidence === "none") {
      return false;
    }

    return hasAllWritableFields(assignment);
  });
}

function findTargetRowForVerification(
  assignment: MappingAssignment,
  targetPreview: TargetFormPreview,
): TargetPlayerRow | null {
  if (assignment.targetLineupIndex !== null) {
    const byLineupIndex =
      targetPreview.playerRows.find((row) => row.lineupIndex === assignment.targetLineupIndex) ?? null;
    if (byLineupIndex) {
      return byLineupIndex;
    }
  }

  if (!assignment.targetPlayerLabel) {
    return null;
  }

  return targetPreview.playerRows.find((row) => row.playerLabel === assignment.targetPlayerLabel) ?? null;
}

export function verifyAppliedMapping(
  mapping: MappingPreview,
  targetPreview: TargetFormPreview,
): { verified: boolean; issues: string[] } {
  const issues: string[] = [];

  for (const assignment of mapping.assignments) {
    if (!assignment.targetPlayerLabel) {
      issues.push(`${assignment.source.playerName}: target row not found`);
      continue;
    }

    const targetRow = findTargetRowForVerification(assignment, targetPreview);
    if (!targetRow) {
      issues.push(`${assignment.source.playerName}: target row disappeared after save`);
      continue;
    }

    if (
      assignment.playerSelection &&
      assignment.playerSelection.targetOptionValue !== null &&
      (targetRow.selectedUserId ?? "") !== assignment.playerSelection.targetOptionValue
    ) {
      issues.push(`${assignment.source.playerName}: target player was not selected as expected`);
    }

    if (
      assignment.positionSelection &&
      assignment.positionSelection.targetOptionValue !== null &&
      (targetRow.positionControl?.currentValue ?? "") !== assignment.positionSelection.targetOptionValue
    ) {
      issues.push(`${assignment.source.playerName}: target position was not selected as expected`);
    }

    for (const field of TARGET_WRITABLE_STAT_FIELDS) {
      const sourceValue = assignment.source[field];
      if (sourceValue === null) {
        continue;
      }

      const control = targetRow.statFields[field];
      if (!control) {
        issues.push(`${assignment.source.playerName}: target field "${field}" was not found after save`);
        continue;
      }

      if ((control.currentValue ?? "") !== stringifyStatValue(sourceValue)) {
        issues.push(`${assignment.source.playerName}: target field "${field}" was not saved as expected`);
      }
    }

    for (const appearance of assignment.appearanceAssignments) {
      if (!appearance.targetOptionValue) {
        issues.push(`${assignment.source.playerName}: appearance ${appearance.appearanceIndex} has no target option`);
        continue;
      }

      const currentField =
        targetRow.appearanceFields.find((field) => field.appearanceIndex === appearance.appearanceIndex)?.main ?? null;
      if (!currentField) {
        issues.push(`${assignment.source.playerName}: appearance ${appearance.appearanceIndex} is missing after save`);
        continue;
      }

      if ((currentField.currentValue ?? "") !== appearance.targetOptionValue) {
        issues.push(`${assignment.source.playerName}: appearance ${appearance.appearanceIndex} was not saved as expected`);
      }
    }
  }

  return {
    verified: issues.length === 0,
    issues,
  };
}
