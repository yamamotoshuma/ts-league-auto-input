import type {
  MatchConfidence,
  PitcherAllocation,
  PitcherDerivedStatLine,
  PitcherMappingAssignment,
  PitcherMappingPreview,
  PitcherSourcePreview,
  PitcherStatField,
  PitcherTargetFormPreview,
  PitcherTargetRow,
  TargetControlRef,
  TargetOptionAssignment,
  TargetSelectOption,
} from "./types";
import { expandNameCandidates, namesLooselyMatch, normalizeName } from "../utils/nameNormalizer";

const TARGET_WRITABLE_PITCHER_FIELDS: Array<
  "innings" | "outs" | "runsAllowed" | "strikeouts" | "walks" | "hitByPitch" | "hitsAllowed" | "homeRunsAllowed"
> = ["innings", "outs", "runsAllowed", "strikeouts", "walks", "hitByPitch", "hitsAllowed", "homeRunsAllowed"];

function isMeaningfulSelectValue(value: string | null): boolean {
  return value !== null && value !== "" && value !== "0";
}

function stringifyStatValue(value: number | null): string {
  if (value === null) {
    return "";
  }

  return String(value);
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

function compareConfidence(allocation: PitcherAllocation, target: PitcherTargetRow): MatchConfidence {
  if (target.pitcherLabel && namesLooselyMatch(allocation.pitcherName, target.pitcherLabel)) {
    return "high";
  }

  if (!isMeaningfulSelectValue(target.selectedUserId) && target.pitcherIndex === allocation.order) {
    return "medium";
  }

  if (
    !isMeaningfulSelectValue(target.selectedUserId) &&
    target.pitcherOptions.some((option) => scorePlayerOption(allocation.pitcherName, option) > 0)
  ) {
    return "medium";
  }

  return "none";
}

function scoreTargetRow(allocation: PitcherAllocation, target: PitcherTargetRow): number {
  const confidence = compareConfidence(allocation, target);
  const indexBonus = target.pitcherIndex === allocation.order ? 20 : 0;

  switch (confidence) {
    case "high":
      return 100 + indexBonus;
    case "medium":
      return 50 + indexBonus;
    default:
      return 0;
  }
}

function resolvePitcherSelection(allocation: PitcherAllocation, target: PitcherTargetRow): TargetOptionAssignment {
  const warnings: string[] = [];
  const currentValue = target.pitcherControl?.currentValue ?? target.selectedUserId;
  const currentLabel = target.pitcherLabel;

  if (!target.pitcherControl) {
    return {
      control: null,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings: ["target pitcher select not found"],
    };
  }

  if (isMeaningfulSelectValue(currentValue)) {
    if (namesLooselyMatch(allocation.pitcherName, currentLabel)) {
      return {
        control: target.pitcherControl,
        targetOptionValue: currentValue,
        targetOptionLabel: currentLabel,
        warnings,
      };
    }

    return {
      control: target.pitcherControl,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings: ["existing target pitcher would be overwritten"],
    };
  }

  const candidates = target.pitcherOptions
    .map((option) => ({ option, score: scorePlayerOption(allocation.pitcherName, option) }))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0] ?? null;
  const second = candidates[1] ?? null;

  if (!best || best.score === 0) {
    warnings.push("target pitcher option not resolved");
    return {
      control: target.pitcherControl,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings,
    };
  }

  if (second && second.score === best.score) {
    warnings.push("multiple target pitcher options matched with equal score");
  }

  return {
    control: target.pitcherControl,
    targetOptionValue: best.option.value,
    targetOptionLabel: best.option.label,
    warnings,
  };
}

function isMeaningfulNumericValue(value: string | null): boolean {
  return value !== null && value !== "";
}

function hasOverwriteRisk(assignment: PitcherMappingAssignment): boolean {
  if (assignment.playerSelection?.control) {
    const currentValue = assignment.playerSelection.control.currentValue ?? null;
    if (
      isMeaningfulSelectValue(currentValue) &&
      assignment.playerSelection.targetOptionValue !== null &&
      currentValue !== assignment.playerSelection.targetOptionValue
    ) {
      return true;
    }
  }

  return TARGET_WRITABLE_PITCHER_FIELDS.some((field) => {
    const control = assignment.statAssignments[field];
    const intendedValue = assignment.derivedStats[field];
    if (!control || intendedValue === null) {
      return false;
    }

    return isMeaningfulNumericValue(control.currentValue) && control.currentValue !== stringifyStatValue(intendedValue);
  });
}

function hasAllWritableFields(assignment: PitcherMappingAssignment): boolean {
  if (!assignment.playerSelection?.control || !assignment.playerSelection.targetOptionValue) {
    return false;
  }

  for (const field of TARGET_WRITABLE_PITCHER_FIELDS) {
    const intendedValue = assignment.derivedStats[field];
    if (intendedValue === null) {
      continue;
    }

    if (!assignment.statAssignments[field]) {
      return false;
    }
  }

  return !hasOverwriteRisk(assignment);
}

function collectAssignments(target: PitcherTargetRow | null): Partial<Record<PitcherStatField, TargetControlRef>> {
  if (!target) {
    return {};
  }

  return { ...target.statFields };
}

function deriveAllocationRanges(allocations: PitcherAllocation[]): Array<{ allocation: PitcherAllocation; inningStart: number; inningEnd: number }> {
  let inningCursor = 1;

  return allocations.map((allocation) => {
    const inningStart = inningCursor;
    const inningEnd = inningCursor + allocation.innings - 1;
    inningCursor = inningEnd + 1;
    return {
      allocation,
      inningStart,
      inningEnd,
    };
  });
}

function buildDerivedStatsForRange(
  allocation: PitcherAllocation,
  inningStart: number,
  inningEnd: number,
  source: PitcherSourcePreview,
): { sourceInnings: PitcherMappingAssignment["sourceInnings"]; derivedStats: PitcherDerivedStatLine; warnings: string[] } {
  const warnings: string[] = [];
  const sourceInnings = source.innings.filter((inning) => inning.inning >= inningStart && inning.inning <= inningEnd);

  if (allocation.outs > 0) {
    warnings.push("部分イニングの配賦はまだ対応していません");
  }

  if (sourceInnings.length !== allocation.innings) {
    warnings.push("投手割当に必要な回の打撃結果が公開ページに揃っていません");
  }

  const runsAllowedValues = sourceInnings.map((inning) => inning.runsAllowed);
  const hasUnknownRuns = runsAllowedValues.some((value) => value === null);

  return {
    sourceInnings,
    derivedStats: {
      innings: allocation.innings,
      outs: allocation.outs,
      earnedRuns: null,
      runsAllowed: hasUnknownRuns
        ? null
        : runsAllowedValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      strikeouts: sourceInnings.reduce((sum, inning) => sum + inning.strikeouts, 0),
      walks: sourceInnings.reduce((sum, inning) => sum + inning.walks, 0),
      hitByPitch: sourceInnings.reduce((sum, inning) => sum + inning.hitByPitch, 0),
      hitsAllowed: sourceInnings.reduce((sum, inning) => sum + inning.hitsAllowed, 0),
      homeRunsAllowed: sourceInnings.reduce((sum, inning) => sum + inning.homeRunsAllowed, 0),
      wildPitches: null,
      balks: null,
    },
    warnings,
  };
}

function createAssignment(
  allocation: PitcherAllocation,
  inningStart: number,
  inningEnd: number,
  source: PitcherSourcePreview,
  targetPreview: PitcherTargetFormPreview,
  takenRows: Set<number>,
): PitcherMappingAssignment {
  const sortedCandidates = targetPreview.pitcherRows
    .filter((target) => target.pitcherIndex === null || !takenRows.has(target.pitcherIndex))
    .map((target) => ({ target, score: scoreTargetRow(allocation, target) }))
    .sort((left, right) => right.score - left.score);

  const best = sortedCandidates[0];
  const second = sortedCandidates[1];
  const warnings: string[] = [];

  const { sourceInnings, derivedStats, warnings: derivationWarnings } = buildDerivedStatsForRange(
    allocation,
    inningStart,
    inningEnd,
    source,
  );
  warnings.push(...derivationWarnings);

  if (!best || best.score === 0) {
    return {
      allocation,
      inningStart,
      inningEnd,
      sourceInnings,
      targetPitcherLabel: null,
      targetRowIndex: null,
      confidence: "none",
      playerSelection: null,
      statAssignments: {},
      derivedStats,
      warnings: ["target pitcher row not found", ...warnings],
    };
  }

  if (second && second.score === best.score) {
    warnings.push("multiple target rows matched with equal score");
  }

  const playerSelection = resolvePitcherSelection(allocation, best.target);
  warnings.push(...playerSelection.warnings);
  const statAssignments = collectAssignments(best.target);

  for (const field of TARGET_WRITABLE_PITCHER_FIELDS) {
    const intendedValue = derivedStats[field];
    if (intendedValue === null) {
      continue;
    }

    const control = statAssignments[field];
    if (!control) {
      warnings.push(`target field "${field}" not found`);
      continue;
    }

    if (
      isMeaningfulNumericValue(control.currentValue) &&
      control.currentValue !== stringifyStatValue(intendedValue)
    ) {
      warnings.push(`existing target ${field} would be overwritten`);
    }
  }

  if (!best.target.pitcherLabel && best.target.pitcherIndex !== allocation.order) {
    warnings.push("target row was chosen outside the same input order");
  }

  if (best.target.pitcherIndex !== null) {
    takenRows.add(best.target.pitcherIndex);
  }

  return {
    allocation,
    inningStart,
    inningEnd,
    sourceInnings,
    targetPitcherLabel: playerSelection.targetOptionLabel ?? best.target.pitcherLabel,
    targetRowIndex: best.target.pitcherIndex,
    confidence: compareConfidence(allocation, best.target),
    playerSelection,
    statAssignments,
    derivedStats,
    warnings,
  };
}

export function buildPitcherMappingPreview(
  allocations: PitcherAllocation[],
  source: PitcherSourcePreview,
  targetPreview: PitcherTargetFormPreview,
): PitcherMappingPreview {
  const ranges = deriveAllocationRanges(allocations);
  const takenRows = new Set<number>();
  const assignments = ranges.map((range) =>
    createAssignment(range.allocation, range.inningStart, range.inningEnd, source, targetPreview, takenRows),
  );

  const matchedRowIndexes = new Set(
    assignments
      .map((assignment) => assignment.targetRowIndex)
      .filter((value): value is number => value !== null),
  );

  return {
    assignments,
    unmatchedAllocations: assignments
      .filter((assignment) => assignment.targetPitcherLabel === null)
      .map((assignment) => assignment.allocation.pitcherName),
    unmatchedTargetPlayers: targetPreview.pitcherRows
      .filter((row) => row.pitcherIndex === null || !matchedRowIndexes.has(row.pitcherIndex))
      .map((row) => row.pitcherLabel),
    warnings: assignments.flatMap((assignment) =>
      assignment.warnings.map((warning) => `${assignment.allocation.pitcherName}: ${warning}`),
    ),
  };
}

export function isPitcherCommitReady(mapping: PitcherMappingPreview): boolean {
  return mapping.assignments.every((assignment) => {
    if (assignment.targetPitcherLabel === null) {
      return false;
    }

    if (assignment.confidence === "none") {
      return false;
    }

    if (assignment.allocation.outs > 0) {
      return false;
    }

    return hasAllWritableFields(assignment);
  });
}

function findTargetRowForVerification(
  assignment: PitcherMappingAssignment,
  targetPreview: PitcherTargetFormPreview,
): PitcherTargetRow | null {
  if (assignment.targetRowIndex !== null) {
    const byIndex =
      targetPreview.pitcherRows.find((row) => row.pitcherIndex === assignment.targetRowIndex) ?? null;
    if (byIndex) {
      return byIndex;
    }
  }

  if (!assignment.targetPitcherLabel) {
    return null;
  }

  return (
    targetPreview.pitcherRows.find((row) => normalizeName(row.pitcherLabel) === normalizeName(assignment.targetPitcherLabel ?? "")) ??
    null
  );
}

export function verifyAppliedPitcherMapping(
  mapping: PitcherMappingPreview,
  targetPreview: PitcherTargetFormPreview,
): { verified: boolean; issues: string[] } {
  const issues: string[] = [];

  for (const assignment of mapping.assignments) {
    if (!assignment.targetPitcherLabel) {
      issues.push(`${assignment.allocation.pitcherName}: target row not found`);
      continue;
    }

    const targetRow = findTargetRowForVerification(assignment, targetPreview);
    if (!targetRow) {
      issues.push(`${assignment.allocation.pitcherName}: target row disappeared after save`);
      continue;
    }

    if (
      assignment.playerSelection &&
      assignment.playerSelection.targetOptionValue !== null &&
      (targetRow.selectedUserId ?? "") !== assignment.playerSelection.targetOptionValue
    ) {
      issues.push(`${assignment.allocation.pitcherName}: target pitcher was not selected as expected`);
    }

    for (const field of TARGET_WRITABLE_PITCHER_FIELDS) {
      const intendedValue = assignment.derivedStats[field];
      if (intendedValue === null) {
        continue;
      }

      const control = targetRow.statFields[field];
      if (!control) {
        issues.push(`${assignment.allocation.pitcherName}: target field "${field}" was not found after save`);
        continue;
      }

      if ((control.currentValue ?? "") !== stringifyStatValue(intendedValue)) {
        issues.push(`${assignment.allocation.pitcherName}: target field "${field}" was not saved as expected`);
      }
    }
  }

  return {
    verified: issues.length === 0,
    issues,
  };
}
