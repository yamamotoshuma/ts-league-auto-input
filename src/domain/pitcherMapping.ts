import type {
  MatchConfidence,
  PitcherAllocation,
  PitcherDerivedStatLine,
  PitcherMappingAssignment,
  PitcherMappingPreview,
  PitcherSourceInningSummary,
  PitcherSourcePreview,
  PitcherSourceScoreboardRow,
  PitcherStatField,
  PitcherTargetFormPreview,
  PitcherTargetRow,
  TargetControlRef,
  TargetOptionAssignment,
  TargetSelectOption,
} from "./types";
import { getTargetEventLabelCandidates } from "./playEvent";
import { expandNameCandidates, namesLooselyMatch, normalizeName } from "../utils/nameNormalizer";

const TARGET_WRITABLE_PITCHER_FIELDS: Array<
  "innings" | "outs" | "earnedRuns" | "runsAllowed" | "strikeouts" | "walks" | "hitByPitch" | "hitsAllowed" | "homeRunsAllowed"
> = ["innings", "outs", "earnedRuns", "runsAllowed", "strikeouts", "walks", "hitByPitch", "hitsAllowed", "homeRunsAllowed"];

const REQUIRED_PITCHER_COMMIT_FIELDS: Array<
  "innings" | "outs" | "strikeouts" | "walks" | "hitByPitch" | "hitsAllowed" | "homeRunsAllowed"
> = ["innings", "outs", "strikeouts", "walks", "hitByPitch", "hitsAllowed", "homeRunsAllowed"];

type PitcherDecision = "win" | "loss";

type SourceEvent = {
  eventIndex: number;
  inning: number;
  playerName: string;
  rawText: string;
  outsMade: number;
  runsScored: number;
  batterBase: 0 | 1 | 2 | 3 | 4;
  reachesBase: boolean;
  reachesOnError: boolean;
  isHit: boolean;
  isHomeRun: boolean;
  isStrikeout: boolean;
  isWalk: boolean;
  isHitByPitch: boolean;
  isPassedBall: boolean;
  isWildPitch: boolean;
  isBalk: boolean;
  isDefensiveInterference: boolean;
};

type InningRunnerState = {
  belongsToSegment: boolean;
  earned: boolean;
};

type AllocationSegment = {
  allocation: PitcherAllocation;
  inningStart: number;
  inningEnd: number;
  events: SourceEvent[];
  sourceInnings: PitcherSourceInningSummary[];
  warnings: string[];
};

function formatOutCount(outCount: number): string {
  const innings = Math.floor(outCount / 3);
  const outs = outCount % 3;
  return outs === 0 ? `${innings}回` : `${innings}回${outs}/3`;
}

function isMeaningfulSelectValue(value: string | null): boolean {
  return value !== null && value !== "" && value !== "0";
}

function stringifyStatValue(value: number | null): string {
  if (value === null) {
    return "";
  }

  return String(value);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
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

function findBestPitcherOption(pitcherName: string, options: TargetSelectOption[]): {
  best: { option: TargetSelectOption; score: number } | null;
  second: { option: TargetSelectOption; score: number } | null;
} {
  const candidates = options
    .map((option) => ({ option, score: scorePlayerOption(pitcherName, option) }))
    .sort((left, right) => right.score - left.score);

  return {
    best: candidates[0] ?? null,
    second: candidates[1] ?? null,
  };
}

function getBestPitcherOptionScore(allocation: PitcherAllocation, target: PitcherTargetRow): number {
  return findBestPitcherOption(allocation.pitcherName, target.pitcherOptions).best?.score ?? 0;
}

function compareConfidence(allocation: PitcherAllocation, target: PitcherTargetRow): MatchConfidence {
  if (target.pitcherLabel && namesLooselyMatch(allocation.pitcherName, target.pitcherLabel)) {
    return "high";
  }

  if (getBestPitcherOptionScore(allocation, target) > 0) {
    return "medium";
  }

  if (!isMeaningfulSelectValue(target.selectedUserId) && target.pitcherIndex === allocation.order) {
    return "low";
  }

  return "none";
}

function scoreTargetRow(allocation: PitcherAllocation, target: PitcherTargetRow): number {
  const currentValue = target.pitcherControl?.currentValue ?? target.selectedUserId;
  const isOccupiedByOtherPitcher =
    isMeaningfulSelectValue(currentValue) && !namesLooselyMatch(allocation.pitcherName, target.pitcherLabel);
  const optionScore = getBestPitcherOptionScore(allocation, target);
  const indexBonus = target.pitcherIndex === allocation.order ? 20 : 0;

  if (target.pitcherLabel && namesLooselyMatch(allocation.pitcherName, target.pitcherLabel)) {
    return 200 + indexBonus;
  }

  if (optionScore > 0) {
    return (isOccupiedByOtherPitcher ? 60 : 100) + optionScore + indexBonus;
  }

  if (!isMeaningfulSelectValue(currentValue) && target.pitcherIndex === allocation.order) {
    return 20;
  }

  return 0;
}

function resolvePitcherSelection(allocation: PitcherAllocation, target: PitcherTargetRow): TargetOptionAssignment {
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

  const warnings: string[] = [];
  const { best, second } = findBestPitcherOption(allocation.pitcherName, target.pitcherOptions);

  if (isMeaningfulSelectValue(currentValue)) {
    if (namesLooselyMatch(allocation.pitcherName, currentLabel)) {
      return {
        control: target.pitcherControl,
        targetOptionValue: currentValue,
        targetOptionLabel: currentLabel,
        warnings,
      };
    }
    warnings.push("existing target pitcher would be overwritten");
  }

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

function normalizeDecisionOptionLabel(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[　\s]+/g, "")
    .trim()
    .toUpperCase();
}

function optionMatchesDecision(option: TargetSelectOption, decision: PitcherDecision): boolean {
  const label = normalizeDecisionOptionLabel(option.label);
  if (label === "" || label === "-" || label === "0") {
    return false;
  }

  if (decision === "win") {
    return ["勝", "勝ち", "勝利", "勝投手", "勝利投手", "W"].includes(label);
  }

  return ["敗", "負け", "敗戦", "敗投手", "敗戦投手", "L"].includes(label);
}

function resolveDecisionSelection(
  decision: PitcherDecision | null,
  target: PitcherTargetRow | null,
): TargetOptionAssignment | null {
  if (decision === null) {
    return null;
  }

  const control = target?.statFields.decision ?? null;
  if (!control) {
    return {
      control: null,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings: ["target decision select not found"],
    };
  }

  const options = target?.decisionOptions ?? [];
  const option = options.find((candidate) => optionMatchesDecision(candidate, decision)) ?? null;
  if (!option) {
    return {
      control,
      targetOptionValue: null,
      targetOptionLabel: null,
      warnings: [`target decision option not resolved for ${decision}`],
    };
  }

  return {
    control,
    targetOptionValue: option.value,
    targetOptionLabel: option.label,
    warnings: [],
  };
}

function isMeaningfulNumericValue(value: string | null): boolean {
  return value !== null && value !== "";
}

function hasAllWritableFields(assignment: PitcherMappingAssignment): boolean {
  if (!assignment.playerSelection?.control || !assignment.playerSelection.targetOptionValue) {
    return false;
  }

  if (
    assignment.derivedStats.decision !== null &&
    (!assignment.decisionSelection?.control || assignment.decisionSelection.targetOptionValue === null)
  ) {
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

  return true;
}

function collectAssignments(target: PitcherTargetRow | null): Partial<Record<PitcherStatField, TargetControlRef>> {
  if (!target) {
    return {};
  }

  return { ...target.statFields };
}

function parseRunsScored(rawText: string): number {
  const normalized = rawText.normalize("NFKC");
  const match = normalized.match(/[（(](\d+)[）)]$/);
  if (!match) {
    return 0;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function countOutsMade(rawText: string): number {
  const normalized = rawText.normalize("NFKC").replace(/[（(]\d+[）)]$/, "");
  const candidates = getTargetEventLabelCandidates(normalized).map((candidate) => candidate.normalize("NFKC"));

  if (normalized.includes("三重殺")) {
    return 3;
  }

  if (normalized.includes("併殺") || normalized.includes("ゲッツー")) {
    return 2;
  }

  if (normalized.includes("振逃")) {
    return 0;
  }

  if (normalized.includes("三振")) {
    return 1;
  }

  if (normalized.includes("アウト")) {
    return 1;
  }

  if (normalized.includes("犠飛") || normalized.includes("犠打")) {
    return 1;
  }

  if (normalized.includes("フライ") || normalized.includes("ライナー") || normalized.includes("ゴロ")) {
    return 1;
  }

  if (candidates.some((candidate) => ["アウト", "犠飛", "犠打"].includes(candidate) || /[飛直ゴ]$/.test(candidate))) {
    return 1;
  }

  return 0;
}

function classifySourceEvent(rawText: string): Omit<SourceEvent, "eventIndex" | "inning" | "playerName" | "rawText"> {
  const normalized = rawText.replace(/[（(]\d+[）)]$/, "");
  const candidates = getTargetEventLabelCandidates(normalized);

  const isWalk =
    normalized.includes("四球") || normalized.includes("敬遠") || candidates.some((candidate) => candidate === "四球");
  const isHitByPitch =
    normalized.includes("死球") || candidates.some((candidate) => candidate === "死球");
  const isStrikeout =
    normalized.includes("三振") || candidates.some((candidate) => ["三振", "空三振", "見三振", "振逃"].includes(candidate));
  const isHomeRun =
    normalized.includes("本塁打") || candidates.some((candidate) => candidate === "本塁打" || /本$/.test(candidate));
  const isReachOnError =
    normalized.includes("敵失") ||
    normalized.includes("エラー") ||
    /失$/.test(normalized) ||
    candidates.some((candidate) => candidate === "敵失" || /失$/.test(candidate));
  const isFieldersChoice =
    normalized.includes("野選") || candidates.some((candidate) => candidate === "野選" || /選$/.test(candidate));
  const isDroppedThirdStrike =
    normalized.includes("振逃") || candidates.some((candidate) => candidate === "振逃");
  const isPassedBall =
    normalized.includes("捕逸") ||
    normalized.includes("パスボール") ||
    /\bPB\b/i.test(normalized);
  const isWildPitch =
    normalized.includes("暴投") ||
    /\bWP\b/i.test(normalized);
  const isBalk =
    normalized.includes("ボーク") ||
    /\bBK\b/i.test(normalized);
  const isDefensiveInterference =
    normalized.includes("打撃妨害") ||
    normalized.includes("守備妨害") ||
    normalized.includes("妨害");
  const isHit =
    isHomeRun ||
    normalized.includes("安打") ||
    normalized.includes("内安") ||
    normalized.includes("二塁打") ||
    normalized.includes("三塁打") ||
    candidates.some(
      (candidate) =>
        ["安打", "内安", "安２", "安３"].includes(candidate) ||
        /安$/.test(candidate) ||
        /[23２３]$/.test(candidate) ||
        /本$/.test(candidate),
    );
  const reachesBase =
    isWalk || isHitByPitch || isHit || isReachOnError || isFieldersChoice || isDroppedThirdStrike;
  const batterBase: 0 | 1 | 2 | 3 | 4 =
    isHomeRun
      ? 4
      : normalized.includes("三塁打") ||
          candidates.some((candidate) => candidate === "安３" || /[3３]$/.test(candidate))
        ? 3
        : normalized.includes("二塁打") ||
            candidates.some((candidate) => candidate === "安２" || /[2２]$/.test(candidate))
          ? 2
          : reachesBase
            ? 1
            : 0;

  return {
    outsMade: countOutsMade(rawText),
    runsScored: parseRunsScored(rawText),
    batterBase,
    reachesBase,
    reachesOnError: isReachOnError,
    isHit,
    isHomeRun,
    isStrikeout,
    isWalk,
    isHitByPitch,
    isPassedBall,
    isWildPitch,
    isBalk,
    isDefensiveInterference,
  };
}

function scoreRunner(
  runner: InningRunnerState | null,
  earnedRunsTotal: { value: number },
  allowEarned = true,
): void {
  if (!allowEarned || !runner || !runner.belongsToSegment || !runner.earned) {
    return;
  }

  earnedRunsTotal.value += 1;
}

function scoreHighestBaseRunners(
  bases: Array<InningRunnerState | null>,
  count: number,
  earnedRunsTotal: { value: number },
  allowEarned = true,
): void {
  let remaining = count;
  for (let index = 2; index >= 0 && remaining > 0; index -= 1) {
    if (!bases[index]) {
      continue;
    }

    scoreRunner(bases[index], earnedRunsTotal, allowEarned);
    bases[index] = null;
    remaining -= 1;
  }
}

function removeForcedOutRunners(bases: Array<InningRunnerState | null>, count: number): void {
  let remaining = count;
  for (const index of [0, 1, 2]) {
    if (remaining <= 0) {
      return;
    }

    if (!bases[index]) {
      continue;
    }

    bases[index] = null;
    remaining -= 1;
  }
}

function advanceExistingRunners(
  bases: Array<InningRunnerState | null>,
  basesAdvanced: number,
): Array<InningRunnerState | null> {
  const nextBases: Array<InningRunnerState | null> = [null, null, null];

  for (let index = 2; index >= 0; index -= 1) {
    const runner = bases[index];
    if (!runner) {
      continue;
    }

    let target = Math.min(index + basesAdvanced, 2);
    while (target >= 0 && nextBases[target] !== null) {
      target -= 1;
    }

    if (target >= 0) {
      nextBases[target] = runner;
    }
  }

  return nextBases;
}

function getSegmentEventsForInning(segment: AllocationSegment, inning: number): SourceEvent[] {
  return segment.events.filter((event) => event.inning === inning);
}

function isUnearnedRiskEvent(event: SourceEvent): boolean {
  return event.reachesOnError || event.isPassedBall || event.isDefensiveInterference;
}

function getRunDistributionWeight(events: SourceEvent[]): number {
  return events.reduce((sum, event) => {
    if (event.runsScored > 0) {
      return sum + event.runsScored * 4;
    }

    if (event.isHomeRun) {
      return sum + 5;
    }

    if (event.batterBase === 3) {
      return sum + 3;
    }

    if (event.batterBase === 2) {
      return sum + 2;
    }

    if (event.isHit || event.isWildPitch || event.isBalk) {
      return sum + 1.5;
    }

    if (event.isWalk || event.isHitByPitch || event.reachesBase) {
      return sum + 1;
    }

    if (event.rawText.includes("犠飛")) {
      return sum + 0.8;
    }

    return sum + (event.outsMade === 0 ? 0.25 : 0);
  }, 0);
}

function distributeIntegerRuns(
  totalRuns: number,
  items: Array<{ segment: AllocationSegment; weight: number }>,
): Map<AllocationSegment, number> {
  const result = new Map<AllocationSegment, number>();
  for (const item of items) {
    result.set(item.segment, 0);
  }

  if (totalRuns <= 0 || items.length === 0) {
    return result;
  }

  const normalizedItems = items.map((item) => ({
    ...item,
    weight: item.weight > 0 ? item.weight : 1,
  }));
  const weightTotal = normalizedItems.reduce((sum, item) => sum + item.weight, 0);
  if (weightTotal <= 0) {
    result.set(normalizedItems[0].segment, totalRuns);
    return result;
  }

  const shares = normalizedItems
    .map((item, index) => {
      const rawShare = (totalRuns * item.weight) / weightTotal;
      const wholeRuns = Math.floor(rawShare);
      return {
        ...item,
        index,
        wholeRuns,
        remainder: rawShare - wholeRuns,
      };
    })
    .sort((left, right) => right.remainder - left.remainder || right.weight - left.weight || left.index - right.index);

  let assigned = 0;
  for (const share of shares) {
    result.set(share.segment, share.wholeRuns);
    assigned += share.wholeRuns;
  }

  let cursor = 0;
  while (assigned < totalRuns && shares.length > 0) {
    const share = shares[cursor % shares.length];
    result.set(share.segment, (result.get(share.segment) ?? 0) + 1);
    assigned += 1;
    cursor += 1;
  }

  return result;
}

function estimateRunsAllowedForSegmentInning(
  inning: number,
  inningEvents: SourceEvent[],
  inningSummary: PitcherSourceInningSummary | null,
  segment: AllocationSegment,
  allSegments: AllocationSegment[],
): { runsAllowed: number; warnings: string[] } {
  const warnings: string[] = [];
  const inningRunsAllowed = inningSummary?.runsAllowed ?? null;
  const parsedInningRuns = inningEvents.reduce((sum, event) => sum + event.runsScored, 0);
  const segmentEvents = getSegmentEventsForInning(segment, inning);
  const parsedSegmentRuns = segmentEvents.reduce((sum, event) => sum + event.runsScored, 0);

  if (inningRunsAllowed === 0 || inningEvents.length === 0) {
    if (inningRunsAllowed === null && parsedSegmentRuns > 0) {
      warnings.push(`${inning}回の失点を打撃イベント末尾の得点表記から概算しました`);
    }

    return { runsAllowed: inningRunsAllowed ?? parsedSegmentRuns, warnings };
  }

  if (inningRunsAllowed === null) {
    if (parsedInningRuns > 0) {
      warnings.push(`${inning}回の失点を打撃イベント末尾の得点表記から概算しました`);
    }

    return { runsAllowed: parsedSegmentRuns, warnings };
  }

  const coversWholeInning = inningEvents.length > 0 && segmentEvents.length === inningEvents.length;
  if (coversWholeInning) {
    return { runsAllowed: inningRunsAllowed, warnings };
  }

  if (parsedInningRuns === inningRunsAllowed) {
    return { runsAllowed: parsedSegmentRuns, warnings };
  }

  warnings.push(`${inning}回の部分イニング失点配分をスコアボードと打撃イベントから概算しました`);

  const segmentsInInning = allSegments.filter((candidate) => getSegmentEventsForInning(candidate, inning).length > 0);
  if (segmentsInInning.length === 0) {
    return { runsAllowed: 0, warnings };
  }

  if (parsedInningRuns > inningRunsAllowed) {
    const byExplicitRuns = distributeIntegerRuns(
      inningRunsAllowed,
      segmentsInInning.map((candidate) => ({
        segment: candidate,
        weight: getSegmentEventsForInning(candidate, inning).reduce((sum, event) => sum + event.runsScored, 0),
      })),
    );
    return { runsAllowed: byExplicitRuns.get(segment) ?? 0, warnings };
  }

  const allocatedRuns = new Map<AllocationSegment, number>();
  for (const candidate of segmentsInInning) {
    allocatedRuns.set(
      candidate,
      getSegmentEventsForInning(candidate, inning).reduce((sum, event) => sum + event.runsScored, 0),
    );
  }

  const residualRuns = inningRunsAllowed - parsedInningRuns;
  const byRisk = distributeIntegerRuns(
    residualRuns,
    segmentsInInning.map((candidate) => ({
      segment: candidate,
      weight: getRunDistributionWeight(getSegmentEventsForInning(candidate, inning)),
    })),
  );

  for (const candidate of segmentsInInning) {
    allocatedRuns.set(candidate, (allocatedRuns.get(candidate) ?? 0) + (byRisk.get(candidate) ?? 0));
  }

  return { runsAllowed: allocatedRuns.get(segment) ?? 0, warnings };
}

function estimateEarnedRunsForInning(
  inning: number,
  inningEvents: SourceEvent[],
  inningSummary: PitcherSourceInningSummary | null,
  segmentEventIndexes: Set<number>,
  segmentRunsAllowed: number,
): { earnedRuns: number; warnings: string[] } {
  const warnings: string[] = [];
  const parsedInningRuns = inningEvents.reduce((sum, event) => sum + event.runsScored, 0);
  const inningRunsAllowed = inningSummary?.runsAllowed ?? null;

  if (segmentRunsAllowed <= 0) {
    return { earnedRuns: 0, warnings };
  }

  if (inningEvents.length === 0) {
    warnings.push(`${inning}回の自責点を失点から概算しました`);
    return { earnedRuns: segmentRunsAllowed, warnings };
  }

  if (!inningEvents.some(isUnearnedRiskEvent)) {
    if (inningRunsAllowed !== null && parsedInningRuns !== inningRunsAllowed) {
      warnings.push(`${inning}回の自責点をスコアボードの失点から概算しました`);
    }

    return { earnedRuns: segmentRunsAllowed, warnings };
  }

  const bases: Array<InningRunnerState | null> = [null, null, null];
  const earnedRunsTotal = { value: 0 };
  let reconstructedOuts = 0;
  let scoringAfterReconstructedEnd = false;

  for (const event of inningEvents) {
    const belongsToSegment = segmentEventIndexes.has(event.eventIndex);
    const allowEarnedBeforePlay = reconstructedOuts < 3 && !event.reachesOnError && !event.isPassedBall && !event.isDefensiveInterference;
    const batterRunner: InningRunnerState = {
      belongsToSegment,
      earned: !event.reachesOnError && !event.isDefensiveInterference,
    };

    if (event.isHomeRun) {
      if (!allowEarnedBeforePlay && (belongsToSegment || bases.some((runner) => runner?.belongsToSegment))) {
        scoringAfterReconstructedEnd = true;
      }
      scoreHighestBaseRunners(bases, 3, earnedRunsTotal, allowEarnedBeforePlay);
      scoreRunner(batterRunner, earnedRunsTotal, allowEarnedBeforePlay);
      bases[0] = null;
      bases[1] = null;
      bases[2] = null;
      if (event.reachesOnError) {
        reconstructedOuts += 1;
      }
      continue;
    }

    if (event.isWalk || event.isHitByPitch) {
      if (bases[0]) {
        if (bases[1]) {
          if (bases[2]) {
            if (!allowEarnedBeforePlay && bases[2]?.belongsToSegment) {
              scoringAfterReconstructedEnd = true;
            }
            scoreRunner(bases[2], earnedRunsTotal, allowEarnedBeforePlay);
          }
          bases[2] = bases[1];
        }
        bases[1] = bases[0];
      }
      bases[0] = batterRunner;
      continue;
    }

    if (event.reachesBase) {
      if (!allowEarnedBeforePlay && event.runsScored > 0) {
        scoringAfterReconstructedEnd = true;
      }
      scoreHighestBaseRunners(bases, event.runsScored, earnedRunsTotal, allowEarnedBeforePlay);
      const advancedBases = advanceExistingRunners(bases, event.batterBase === 0 ? 1 : event.batterBase);
      bases[0] = advancedBases[0];
      bases[1] = advancedBases[1];
      bases[2] = advancedBases[2];

      if (event.batterBase > 0 && event.batterBase < 4) {
        const targetIndex = event.batterBase - 1;
        if (bases[targetIndex] === null) {
          bases[targetIndex] = batterRunner;
        }
      }
      if (event.reachesOnError) {
        reconstructedOuts += 1;
      }
      continue;
    }

    if (!allowEarnedBeforePlay && event.runsScored > 0) {
      scoringAfterReconstructedEnd = true;
    }
    scoreHighestBaseRunners(bases, event.runsScored, earnedRunsTotal, allowEarnedBeforePlay);
    if (event.outsMade > 1) {
      removeForcedOutRunners(bases, event.outsMade - 1);
    }
    reconstructedOuts += event.outsMade;
  }

  const simulatedEarnedRuns = clampInteger(earnedRunsTotal.value, 0, segmentRunsAllowed);
  const eventRunsMatchScoreboard = inningRunsAllowed !== null && parsedInningRuns === inningRunsAllowed;

  if (eventRunsMatchScoreboard || parsedInningRuns > 0 || scoringAfterReconstructedEnd) {
    return {
      earnedRuns: simulatedEarnedRuns,
      warnings,
    };
  }

  const segmentUnearnedRiskCount = inningEvents.filter(
    (event) => segmentEventIndexes.has(event.eventIndex) && isUnearnedRiskEvent(event),
  ).length;
  const fallbackEarnedRuns = clampInteger(segmentRunsAllowed - segmentUnearnedRiskCount, 0, segmentRunsAllowed);
  if (fallbackEarnedRuns !== segmentRunsAllowed) {
    warnings.push(`${inning}回の自責点を守備ミス数から概算しました`);
  }

  return {
    earnedRuns: Math.max(simulatedEarnedRuns, fallbackEarnedRuns),
    warnings,
  };
}

function buildOrderedSourceEvents(source: PitcherSourcePreview): SourceEvent[] {
  const grouped = new Map<number, Array<{ battingOrder: number; rowIndex: number; playerName: string; events: string[] }>>();
  const playedInnings = getPlayedInnings(source);

  source.batterRows.forEach((row, rowIndex) => {
    row.inningResults.forEach((inningResult) => {
      if (playedInnings > 0 && inningResult.inning > playedInnings) {
        return;
      }

      const current = grouped.get(inningResult.inning) ?? [];
      current.push({
        battingOrder: row.battingOrder ?? Number.MAX_SAFE_INTEGER,
        rowIndex,
        playerName: row.playerName,
        events: [...inningResult.events],
      });
      grouped.set(inningResult.inning, current);
    });
  });

  const orderedInnings = Array.from(grouped.keys()).sort((left, right) => left - right);
  const events: SourceEvent[] = [];
  let eventIndex = 0;

  orderedInnings.forEach((inning, inningIndex) => {
    const rows = (grouped.get(inning) ?? [])
      .slice()
      .sort((left, right) => left.battingOrder - right.battingOrder || left.rowIndex - right.rowIndex)
      .map((row) => ({ ...row, events: [...row.events] }));
    let outsInInning = 0;

    while (rows.some((row) => row.events.length > 0)) {
      for (const row of rows) {
        const rawText = row.events.shift();
        if (!rawText) {
          continue;
        }

        events.push({
          eventIndex,
          inning,
          playerName: row.playerName,
          rawText,
          ...classifySourceEvent(rawText),
        });
        eventIndex += 1;
        outsInInning += countOutsMade(rawText);
      }
    }

    const isLastVisibleInning = inningIndex === orderedInnings.length - 1;
    if (!isLastVisibleInning && outsInInning < 3) {
      for (let index = outsInInning; index < 3; index += 1) {
        events.push({
          eventIndex,
          inning,
          playerName: "__implicit_out__",
          rawText: "アウト",
          ...classifySourceEvent("アウト"),
        });
        eventIndex += 1;
      }
    }
  });

  return events;
}

function buildWholeInningDerivedTotals(sourceInnings: PitcherSourceInningSummary[]): Pick<
  PitcherDerivedStatLine,
  "runsAllowed" | "strikeouts" | "walks" | "hitByPitch" | "hitsAllowed" | "homeRunsAllowed"
> {
  let runsAllowedTotal = 0;

  for (const inning of sourceInnings) {
    if (inning.runsAllowed === null) {
      continue;
    }

    runsAllowedTotal += inning.runsAllowed;
  }

  return {
    runsAllowed: runsAllowedTotal,
    strikeouts: sourceInnings.reduce((sum, inning) => sum + inning.strikeouts, 0),
    walks: sourceInnings.reduce((sum, inning) => sum + inning.walks, 0),
    hitByPitch: sourceInnings.reduce((sum, inning) => sum + inning.hitByPitch, 0),
    hitsAllowed: sourceInnings.reduce((sum, inning) => sum + inning.hitsAllowed, 0),
    homeRunsAllowed: sourceInnings.reduce((sum, inning) => sum + inning.homeRunsAllowed, 0),
  };
}

function getRunsForInning(row: PitcherSourceScoreboardRow, inning: number): number {
  return row.runsByInning.find((item) => item.inning === inning)?.runs ?? 0;
}

function getTotalRuns(row: PitcherSourceScoreboardRow): number {
  return row.totalRuns ?? row.runsByInning.reduce((sum, item) => sum + (item.runs ?? 0), 0);
}

function findScoreboardRows(source: PitcherSourcePreview): {
  ownRow: PitcherSourceScoreboardRow;
  opponentRow: PitcherSourceScoreboardRow;
} | null {
  const rows = source.scoreboardRows ?? [];
  if (rows.length < 2) {
    return null;
  }

  const opponentRow =
    source.opponentTeam
      ? rows.find((row) => normalizeName(row.teamName).includes(normalizeName(source.opponentTeam ?? ""))) ?? null
      : null;
  if (opponentRow) {
    const ownRow = rows.find((row) => row !== opponentRow) ?? null;
    return ownRow ? { ownRow, opponentRow } : null;
  }

  if (rows.length === 2) {
    return {
      ownRow: rows[0],
      opponentRow: rows[1],
    };
  }

  return null;
}

function getLeader(ownRuns: number, opponentRuns: number): "own" | "opponent" | null {
  if (ownRuns > opponentRuns) {
    return "own";
  }

  if (opponentRuns > ownRuns) {
    return "opponent";
  }

  return null;
}

type FinalLeadChange = {
  winner: "own" | "opponent";
  inning: number;
  winnerRunsBeforeHalf: number;
  loserRunsBeforeHalf: number;
};

function findFinalLeadChange(
  ownRow: PitcherSourceScoreboardRow,
  opponentRow: PitcherSourceScoreboardRow,
): FinalLeadChange | null {
  const ownTotal = getTotalRuns(ownRow);
  const opponentTotal = getTotalRuns(opponentRow);
  const winner = getLeader(ownTotal, opponentTotal);
  if (!winner) {
    return null;
  }

  const innings = Array.from(
    new Set([
      ...ownRow.runsByInning.map((item) => item.inning),
      ...opponentRow.runsByInning.map((item) => item.inning),
    ]),
  ).sort((left, right) => left - right);

  const topRow = ownRow.battingSide === "top" ? ownRow : opponentRow.battingSide === "top" ? opponentRow : ownRow;
  const bottomRow = topRow === ownRow ? opponentRow : ownRow;
  let ownRuns = 0;
  let opponentRuns = 0;
  let previousLeader: "own" | "opponent" | null = null;
  let finalLeadChange: FinalLeadChange | null = null;

  for (const inning of innings) {
    for (const battingRow of [topRow, bottomRow]) {
      const ownBefore = ownRuns;
      const opponentBefore = opponentRuns;
      const runs = getRunsForInning(battingRow, inning);
      if (battingRow === ownRow) {
        ownRuns += runs;
      } else {
        opponentRuns += runs;
      }

      const currentLeader = getLeader(ownRuns, opponentRuns);
      if (currentLeader === winner && previousLeader !== winner) {
        finalLeadChange = {
          winner,
          inning,
          winnerRunsBeforeHalf: winner === "own" ? ownBefore : opponentBefore,
          loserRunsBeforeHalf: winner === "own" ? opponentBefore : ownBefore,
        };
      }
      previousLeader = currentLeader;
    }
  }

  return finalLeadChange;
}

function segmentCoversInning(segment: AllocationSegment, inning: number): boolean {
  return (
    getSegmentEventsForInning(segment, inning).length > 0 ||
    segment.sourceInnings.some((sourceInning) => sourceInning.inning === inning) ||
    (segment.inningStart <= inning && inning <= segment.inningEnd)
  );
}

function findSegmentsForInning(segments: AllocationSegment[], inning: number): AllocationSegment[] {
  return segments.filter((segment) => segmentCoversInning(segment, inning));
}

function findAssignmentBySegment(
  assignments: PitcherMappingAssignment[],
  segment: AllocationSegment | null,
): PitcherMappingAssignment | null {
  if (!segment) {
    return null;
  }

  return assignments.find((assignment) => assignment.allocation.order === segment.allocation.order) ?? null;
}

function getRecordedOuts(assignment: PitcherMappingAssignment): number {
  return assignment.derivedStats.innings * 3 + assignment.derivedStats.outs;
}

function getPlayedInnings(source: PitcherSourcePreview): number {
  const scoreboardInnings =
    source.scoreboardRows
      ?.flatMap((row) => row.runsByInning)
      .filter((inning) => inning.runs !== null)
      .map((inning) => inning.inning) ?? [];
  if (scoreboardInnings.length > 0) {
    return Math.max(...scoreboardInnings);
  }

  const sourceInnings = source.innings.map((inning) => inning.inning);
  return sourceInnings.length > 0 ? Math.max(...sourceInnings) : 0;
}

function getRequiredStarterWinOuts(source: PitcherSourcePreview): number {
  const playedInnings = getPlayedInnings(source);
  if (playedInnings > 0 && playedInnings <= 4) {
    return Math.ceil(playedInnings / 2) * 3;
  }

  return 9;
}

function chooseReliefWinAssignment(assignments: PitcherMappingAssignment[]): PitcherMappingAssignment | null {
  const relievers = assignments.filter((assignment) => assignment.allocation.order > 1);
  if (relievers.length === 0) {
    return null;
  }

  return relievers
    .slice()
    .sort((left, right) => {
      const leftRuns = left.derivedStats.runsAllowed ?? Number.MAX_SAFE_INTEGER;
      const rightRuns = right.derivedStats.runsAllowed ?? Number.MAX_SAFE_INTEGER;
      if (leftRuns !== rightRuns) {
        return leftRuns - rightRuns;
      }

      const leftEarnedRuns = left.derivedStats.earnedRuns ?? Number.MAX_SAFE_INTEGER;
      const rightEarnedRuns = right.derivedStats.earnedRuns ?? Number.MAX_SAFE_INTEGER;
      if (leftEarnedRuns !== rightEarnedRuns) {
        return leftEarnedRuns - rightEarnedRuns;
      }

      const outsDiff = getRecordedOuts(right) - getRecordedOuts(left);
      return outsDiff !== 0 ? outsDiff : left.allocation.order - right.allocation.order;
    })[0] ?? null;
}

function chooseWinningPitcherAssignment(
  assignments: PitcherMappingAssignment[],
  segments: AllocationSegment[],
  source: PitcherSourcePreview,
  inning: number,
): PitcherMappingAssignment | null {
  const sameInningSegment = findSegmentsForInning(segments, inning)[0] ?? null;
  const candidate = findAssignmentBySegment(assignments, sameInningSegment) ?? assignments[0] ?? null;
  if (!candidate) {
    return null;
  }

  if (candidate.allocation.order !== 1) {
    return candidate;
  }

  const requiredStarterOuts = getRequiredStarterWinOuts(source);
  if (getRecordedOuts(candidate) >= requiredStarterOuts) {
    return candidate;
  }

  const reliefWinner = chooseReliefWinAssignment(assignments);
  if (reliefWinner) {
    reliefWinner.warnings.push("先発投手がスカイツリーグの責任投球回を満たさないため、救援投手から勝利投手を概算しました");
    return reliefWinner;
  }

  candidate.warnings.push("先発投手がスカイツリーグの責任投球回を満たしませんが、代替候補がないため勝利投手を概算しました");
  return candidate;
}

function chooseLosingPitcherAssignment(
  assignments: PitcherMappingAssignment[],
  segments: AllocationSegment[],
  source: PitcherSourcePreview,
  leadChange: FinalLeadChange,
): PitcherMappingAssignment | null {
  const inning = leadChange.inning;
  const inningEvents = buildOrderedSourceEvents(source).filter((event) => event.inning === inning);
  const sourceInning = source.innings.find((candidate) => candidate.inning === inning) ?? null;
  const segmentsInInning = findSegmentsForInning(segments, inning);
  if (segmentsInInning.length === 0) {
    return null;
  }

  const goAheadRunNumber = Math.max(1, leadChange.loserRunsBeforeHalf - leadChange.winnerRunsBeforeHalf + 1);
  let cumulativeRuns = 0;
  for (const segment of segmentsInInning) {
    const estimate = estimateRunsAllowedForSegmentInning(inning, inningEvents, sourceInning, segment, segments);
    cumulativeRuns += estimate.runsAllowed;
    if (cumulativeRuns >= goAheadRunNumber) {
      return findAssignmentBySegment(assignments, segment);
    }
  }

  return findAssignmentBySegment(assignments, segmentsInInning.at(-1) ?? null);
}

function findTargetRowForAssignment(
  assignment: PitcherMappingAssignment,
  targetPreview: PitcherTargetFormPreview,
): PitcherTargetRow | null {
  if (assignment.targetRowIndex !== null) {
    return targetPreview.pitcherRows.find((row) => row.pitcherIndex === assignment.targetRowIndex) ?? null;
  }

  return null;
}

function applyPitcherDecisionEstimates(
  assignments: PitcherMappingAssignment[],
  segments: AllocationSegment[],
  source: PitcherSourcePreview,
  targetPreview: PitcherTargetFormPreview,
): string[] {
  const warnings: string[] = [];
  const rows = findScoreboardRows(source);
  if (!rows) {
    warnings.push("勝敗投手の算出に必要な両チームのスコアボードを特定できません");
    return warnings;
  }

  const leadChange = findFinalLeadChange(rows.ownRow, rows.opponentRow);
  if (!leadChange) {
    return warnings;
  }

  const decisionAssignment =
    leadChange.winner === "own"
      ? chooseWinningPitcherAssignment(assignments, segments, source, leadChange.inning)
      : chooseLosingPitcherAssignment(assignments, segments, source, leadChange);
  const decision: PitcherDecision = leadChange.winner === "own" ? "win" : "loss";

  if (!decisionAssignment) {
    warnings.push(`${leadChange.inning}回の勝敗投手候補を投手割当から特定できません`);
    return warnings;
  }

  decisionAssignment.derivedStats.decision = decision;
  const targetRow = findTargetRowForAssignment(decisionAssignment, targetPreview);
  const decisionSelection = resolveDecisionSelection(decision, targetRow);
  decisionAssignment.decisionSelection = decisionSelection;

  if (!decisionSelection) {
    return warnings;
  }

  decisionAssignment.warnings.push(...decisionSelection.warnings);
  if (
    decisionSelection.control &&
    decisionSelection.targetOptionValue !== null &&
    isMeaningfulSelectValue(decisionSelection.control.currentValue) &&
    decisionSelection.control.currentValue !== decisionSelection.targetOptionValue
  ) {
    decisionAssignment.warnings.push("existing target decision would be overwritten");
  }

  return warnings;
}

function deriveAllocationSegments(
  allocations: PitcherAllocation[],
  source: PitcherSourcePreview,
): AllocationSegment[] {
  const sourceEvents = buildOrderedSourceEvents(source);
  if (sourceEvents.length === 0) {
    let inningCursor = 0;

    return allocations.map((allocation) => {
      const warnings: string[] = [];
      const sourceInnings = source.innings.slice(inningCursor, inningCursor + allocation.innings);
      const fallbackInning = source.innings[inningCursor]?.inning ?? source.innings.at(-1)?.inning ?? 1;

      if (sourceInnings.length < allocation.innings) {
        warnings.push("投手割当に必要なイニング数が公開ページに揃っていません");
      }

      if (allocation.outs > 0) {
        warnings.push("部分イニングの配賦に必要な打席イベントが公開ページにありません");
      }

      inningCursor += allocation.innings;

      return {
        allocation,
        inningStart: sourceInnings[0]?.inning ?? fallbackInning,
        inningEnd: sourceInnings.at(-1)?.inning ?? fallbackInning,
        events: [],
        sourceInnings,
        warnings,
      };
    });
  }

  let cursor = 0;

  return allocations.map((allocation) => {
    const requiredOuts = allocation.innings * 3 + allocation.outs;
    const events: SourceEvent[] = [];
    const warnings: string[] = [];
    let recordedOuts = 0;

    while (cursor < sourceEvents.length && recordedOuts < requiredOuts) {
      const event = sourceEvents[cursor];
      events.push(event);
      recordedOuts += event.outsMade;
      cursor += 1;
    }

    if (recordedOuts < requiredOuts) {
      warnings.push("投手割当に必要なアウト数が公開ページに揃っていません");
    }

    const inningStart = events[0]?.inning ?? 1;
    const inningEnd = events.at(-1)?.inning ?? inningStart;
    const inningNumbers = Array.from(new Set(events.map((event) => event.inning)));
    const sourceInnings = source.innings.filter((inning) => inningNumbers.includes(inning.inning));

    return {
      allocation,
      inningStart,
      inningEnd,
      events,
      sourceInnings,
      warnings,
    };
  });
}

function buildDerivedStatsForSegment(
  segment: AllocationSegment,
  source: PitcherSourcePreview,
  allSegments: AllocationSegment[],
): { sourceInnings: PitcherMappingAssignment["sourceInnings"]; derivedStats: PitcherDerivedStatLine; warnings: string[] } {
  const warnings = [...segment.warnings];
  if (segment.events.length === 0) {
    if (segment.allocation.outs > 0) {
      warnings.push("部分イニングの投手成績を公開ページから特定できないため、失点と自責点は 0 で概算しました");
      return {
        sourceInnings: segment.sourceInnings,
        derivedStats: {
          innings: segment.allocation.innings,
          outs: segment.allocation.outs,
          decision: null,
          earnedRuns: 0,
          runsAllowed: 0,
          strikeouts: null,
          walks: null,
          hitByPitch: null,
          hitsAllowed: null,
          homeRunsAllowed: null,
          wildPitches: null,
          balks: null,
        },
        warnings,
      };
    }

    if (segment.sourceInnings.some((inning) => inning.runsAllowed === null)) {
      warnings.push(...segment.sourceInnings
        .filter((inning) => inning.runsAllowed === null)
        .map((inning) => `${inning.inning}回の失点を公開ページから特定できません`));
    }

    const wholeInningTotals = buildWholeInningDerivedTotals(segment.sourceInnings);
    const estimatedRunsAllowed = wholeInningTotals.runsAllowed ?? 0;
    if (wholeInningTotals.runsAllowed === null) {
      warnings.push("失点と自責点を 0 で概算しました");
    }

    return {
      sourceInnings: segment.sourceInnings,
      derivedStats: {
        innings: segment.allocation.innings,
        outs: segment.allocation.outs,
        decision: null,
        earnedRuns: estimatedRunsAllowed,
        ...wholeInningTotals,
        runsAllowed: estimatedRunsAllowed,
        wildPitches: null,
        balks: null,
      },
      warnings,
    };
  }

  const allSourceEvents = buildOrderedSourceEvents(source);
  const allEventsByInning = new Map<number, SourceEvent[]>();

  for (const event of allSourceEvents) {
    const current = allEventsByInning.get(event.inning) ?? [];
    current.push(event);
    allEventsByInning.set(event.inning, current);
  }

  const inningNumbers = Array.from(
    new Set([
      ...segment.sourceInnings.map((inning) => inning.inning),
      ...segment.events.map((event) => event.inning),
    ]),
  ).sort((left, right) => left - right);
  const sourceInnings = source.innings.filter((inning) => inningNumbers.includes(inning.inning));
  const sourceInningMap = new Map(source.innings.map((inning) => [inning.inning, inning]));
  const segmentEventIndexes = new Set(segment.events.map((event) => event.eventIndex));

  let earnedRunsTotal = 0;
  let runsAllowedTotal = 0;
  let strikeoutsTotal = 0;
  let walksTotal = 0;
  let hitByPitchTotal = 0;
  let hitsAllowedTotal = 0;
  let homeRunsAllowedTotal = 0;

  for (const inning of inningNumbers) {
    const inningEvents = allEventsByInning.get(inning) ?? [];
    const segmentEvents = segment.events.filter((event) => event.inning === inning);
    const inningSummary = sourceInningMap.get(inning) ?? null;
    const runsAllowedEstimate = estimateRunsAllowedForSegmentInning(
      inning,
      inningEvents,
      inningSummary,
      segment,
      allSegments,
    );
    runsAllowedTotal += runsAllowedEstimate.runsAllowed;
    warnings.push(...runsAllowedEstimate.warnings);
    const earnedRunEstimate = estimateEarnedRunsForInning(
      inning,
      inningEvents,
      inningSummary,
      segmentEventIndexes,
      runsAllowedEstimate.runsAllowed,
    );
    earnedRunsTotal += earnedRunEstimate.earnedRuns;
    warnings.push(...earnedRunEstimate.warnings);
    const inningRunsAllowed = inningSummary?.runsAllowed ?? null;
    const coversWholeInning = inningEvents.length > 0 && segmentEvents.length === inningEvents.length;

    if (coversWholeInning && inningSummary) {
      strikeoutsTotal += inningSummary.strikeouts;
      walksTotal += inningSummary.walks;
      hitByPitchTotal += inningSummary.hitByPitch;
      hitsAllowedTotal += inningSummary.hitsAllowed;
      homeRunsAllowedTotal += inningSummary.homeRunsAllowed;
      continue;
    }

    strikeoutsTotal += segmentEvents.reduce((sum, event) => sum + (event.isStrikeout ? 1 : 0), 0);
    walksTotal += segmentEvents.reduce((sum, event) => sum + (event.isWalk ? 1 : 0), 0);
    hitByPitchTotal += segmentEvents.reduce((sum, event) => sum + (event.isHitByPitch ? 1 : 0), 0);
    hitsAllowedTotal += segmentEvents.reduce((sum, event) => sum + (event.isHit ? 1 : 0), 0);
    homeRunsAllowedTotal += segmentEvents.reduce((sum, event) => sum + (event.isHomeRun ? 1 : 0), 0);

    if (inningRunsAllowed === null) {
      warnings.push(`${inning}回のスコアボード失点が無いため、打撃イベントから失点を概算しました`);
      continue;
    }
  }

  return {
    sourceInnings,
    derivedStats: {
      innings: segment.allocation.innings,
      outs: segment.allocation.outs,
      decision: null,
      earnedRuns: Math.min(earnedRunsTotal, runsAllowedTotal),
      runsAllowed: runsAllowedTotal,
      strikeouts: strikeoutsTotal,
      walks: walksTotal,
      hitByPitch: hitByPitchTotal,
      hitsAllowed: hitsAllowedTotal,
      homeRunsAllowed: homeRunsAllowedTotal,
      wildPitches: null,
      balks: null,
    },
    warnings,
  };
}

function createAssignment(
  segment: AllocationSegment,
  source: PitcherSourcePreview,
  targetPreview: PitcherTargetFormPreview,
  takenRows: Set<number>,
  allSegments: AllocationSegment[],
): PitcherMappingAssignment {
  const allocation = segment.allocation;
  const sortedCandidates = targetPreview.pitcherRows
    .filter((target) => target.pitcherIndex === null || !takenRows.has(target.pitcherIndex))
    .map((target) => ({ target, score: scoreTargetRow(allocation, target) }))
    .sort((left, right) => right.score - left.score);

  const best = sortedCandidates[0];
  const second = sortedCandidates[1];
  const warnings: string[] = [];

  const { sourceInnings, derivedStats, warnings: derivationWarnings } = buildDerivedStatsForSegment(
    segment,
    source,
    allSegments,
  );
  warnings.push(...derivationWarnings);

  if (!best || best.score === 0) {
    return {
      allocation,
      inningStart: segment.inningStart,
      inningEnd: segment.inningEnd,
      sourceInnings,
      targetPitcherLabel: null,
      targetRowIndex: null,
      confidence: "none",
      playerSelection: null,
      decisionSelection: null,
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
    inningStart: segment.inningStart,
    inningEnd: segment.inningEnd,
    sourceInnings,
    targetPitcherLabel: playerSelection.targetOptionLabel ?? best.target.pitcherLabel,
    targetRowIndex: best.target.pitcherIndex,
    confidence: compareConfidence(allocation, best.target),
    playerSelection,
    decisionSelection: null,
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
  const sourceEvents = buildOrderedSourceEvents(source);
  const requestedOuts = allocations.reduce((sum, allocation) => sum + allocation.innings * 3 + allocation.outs, 0);
  const sourceOuts = sourceEvents.reduce((sum, event) => sum + event.outsMade, 0);
  const ranges = deriveAllocationSegments(allocations, source);
  const takenRows = new Set<number>();
  const assignments = ranges.map((range) =>
    createAssignment(range, source, targetPreview, takenRows, ranges),
  );
  const decisionWarnings = applyPitcherDecisionEstimates(assignments, ranges, source, targetPreview);

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
    warnings: [
      ...(sourceEvents.length > 0 && sourceOuts !== requestedOuts
        ? [
            `公開打撃成績から確認できたアウト数は ${sourceOuts}アウト (${formatOutCount(sourceOuts)}) ですが、入力された投手割当は ${requestedOuts}アウト (${formatOutCount(requestedOuts)}) です`,
          ]
        : []),
      ...decisionWarnings,
      ...assignments.flatMap((assignment) =>
        assignment.warnings.map((warning) => `${assignment.allocation.pitcherName}: ${warning}`),
      ),
    ],
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

    if (assignment.warnings.some((warning) => warning.includes("投手割当に必要なアウト数が公開ページに揃っていません"))) {
      return false;
    }

    if (REQUIRED_PITCHER_COMMIT_FIELDS.some((field) => assignment.derivedStats[field] === null)) {
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

    if (
      assignment.decisionSelection &&
      assignment.decisionSelection.targetOptionValue !== null &&
      (targetRow.statFields.decision?.currentValue ?? "") !== assignment.decisionSelection.targetOptionValue
    ) {
      issues.push(`${assignment.allocation.pitcherName}: target decision was not selected as expected`);
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
