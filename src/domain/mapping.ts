import type {
  BatterStat,
  MappingAssignment,
  MappingPreview,
  MatchConfidence,
  PlateAppearanceAssignment,
  TargetControlRef,
  TargetFormPreview,
  TargetPlayerRow,
} from "./types";
import type { BatterStatField } from "../utils/constants";
import { BATTER_STAT_FIELDS } from "../utils/constants";
import { findTargetEventOption, isTargetEventLabelCompatible, normalizePosition } from "./playEvent";
import { normalizeName } from "../utils/nameNormalizer";

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

function compareConfidence(source: BatterStat, target: TargetPlayerRow): MatchConfidence {
  const sourceName = normalizeName(source.playerName);
  const targetName = normalizeTargetPlayerName(target.playerLabel);
  const sourcePosition = normalizePosition(source.position);
  const targetPosition = normalizePosition(target.selectedPositionLabel);

  const orderMatches = source.battingOrder !== null && target.lineupIndex === source.battingOrder;
  const positionMatches = sourcePosition !== null && targetPosition !== null && sourcePosition === targetPosition;
  const nameMatches = sourceName !== "" && targetName !== "" && targetName.includes(sourceName);

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
    normalizePosition(source.position) !== null &&
    normalizePosition(target.selectedPositionLabel) === normalizePosition(source.position)
      ? 10
      : 0;
  const nameBonus = normalizeTargetPlayerName(target.playerLabel).includes(normalizeName(source.playerName)) ? 15 : 0;

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

function collectAssignments(
  target: TargetPlayerRow | null,
): Partial<Record<BatterStatField, TargetControlRef>> {
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
      confidence: "none",
      statAssignments: {},
      appearanceAssignments: buildAppearanceAssignments(source, null, targetPreview),
      warnings: ["target player row not found"],
    };
  }

  if (second && second.score === best.score) {
    warnings.push("multiple target rows matched with equal score");
  }

  const confidence = compareConfidence(source, best.target);
  const nameMatches = normalizeTargetPlayerName(best.target.playerLabel).includes(normalizeName(source.playerName));
  if (!nameMatches) {
    warnings.push("matched by batting order / position because player name did not match directly");
  }

  const appearanceAssignments = buildAppearanceAssignments(source, best.target, targetPreview);
  warnings.push(
    ...appearanceAssignments.flatMap((assignment) =>
      assignment.warnings.map((warning) => `appearance ${assignment.appearanceIndex}: ${warning}`),
    ),
  );

  return {
    source,
    targetPlayerLabel: best.target.playerLabel,
    confidence,
    statAssignments: collectAssignments(best.target),
    appearanceAssignments,
    warnings,
  };
}

function hasOverwriteRisk(assignment: MappingAssignment): boolean {
  for (const field of TARGET_WRITABLE_STAT_FIELDS) {
    const sourceValue = assignment.source[field];
    if (sourceValue === null) {
      continue;
    }

    const control = assignment.statAssignments[field];
    if (!control) {
      return true;
    }

    const currentValue = control.currentValue ?? "";
    const intendedValue = stringifyStatValue(sourceValue);
    if (currentValue !== "" && currentValue !== intendedValue) {
      return true;
    }
  }

  return assignment.appearanceAssignments.some((appearance) => {
    const currentValue = appearance.targetControl?.currentValue ?? null;
    return isMeaningfulAppearanceValue(currentValue) && currentValue !== appearance.targetOptionValue;
  });
}

function hasAllWritableFields(assignment: MappingAssignment): boolean {
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

  return !hasOverwriteRisk(assignment);
}

export function buildMappingPreview(
  sourceStats: BatterStat[],
  targetPreview: TargetFormPreview,
): MappingPreview {
  const assignments = sourceStats.map((source) => createAssignment(source, targetPreview));
  const matchedTargetNames = new Set(
    assignments
      .map((assignment) => assignment.targetPlayerLabel)
      .filter((value): value is string => value !== null),
  );

  return {
    assignments,
    unmatchedSourcePlayers: assignments
      .filter((assignment) => assignment.targetPlayerLabel === null)
      .map((assignment) => assignment.source.playerName),
    unmatchedTargetPlayers: targetPreview.playerRows
      .filter((row) => !matchedTargetNames.has(row.playerLabel))
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

    const targetRow = targetPreview.playerRows.find((row) => row.playerLabel === assignment.targetPlayerLabel);
    if (!targetRow) {
      issues.push(`${assignment.source.playerName}: target row disappeared after save`);
      continue;
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
