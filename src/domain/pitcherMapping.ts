import type {
  MatchConfidence,
  PitcherAllocation,
  PitcherDerivedStatLine,
  PitcherMappingAssignment,
  PitcherMappingPreview,
  PitcherSourceInningSummary,
  PitcherSourcePreview,
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

function isMeaningfulNumericValue(value: string | null): boolean {
  return value !== null && value !== "";
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
  };
}

function scoreRunner(
  runner: InningRunnerState | null,
  earnedRunsTotal: { value: number },
): void {
  if (!runner || !runner.belongsToSegment || !runner.earned) {
    return;
  }

  earnedRunsTotal.value += 1;
}

function scoreHighestBaseRunners(
  bases: Array<InningRunnerState | null>,
  count: number,
  earnedRunsTotal: { value: number },
): void {
  let remaining = count;
  for (let index = 2; index >= 0 && remaining > 0; index -= 1) {
    if (!bases[index]) {
      continue;
    }

    scoreRunner(bases[index], earnedRunsTotal);
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

function estimateEarnedRunsForInning(
  inning: number,
  inningEvents: SourceEvent[],
  inningSummary: PitcherSourceInningSummary | null,
  segmentEventIndexes: Set<number>,
): { earnedRuns: number | null; warnings: string[] } {
  const warnings: string[] = [];
  const parsedInningRuns = inningEvents.reduce((sum, event) => sum + event.runsScored, 0);
  const inningRunsAllowed = inningSummary?.runsAllowed ?? null;

  if (inningEvents.length === 0) {
    if (inningRunsAllowed === null || inningRunsAllowed > 0) {
      warnings.push(`${inning}回の自責点を公開ページから特定できません`);
      return { earnedRuns: null, warnings };
    }

    return { earnedRuns: 0, warnings };
  }

  if (inningRunsAllowed === null) {
    if (parsedInningRuns > 0) {
      warnings.push(`${inning}回の自責点を公開ページから特定できません`);
      return { earnedRuns: null, warnings };
    }

    return { earnedRuns: 0, warnings };
  }

  if (parsedInningRuns !== inningRunsAllowed) {
    warnings.push(`${inning}回の自責点を公開ページから特定できません`);
    return { earnedRuns: null, warnings };
  }

  const bases: Array<InningRunnerState | null> = [null, null, null];
  const earnedRunsTotal = { value: 0 };

  for (const event of inningEvents) {
    const batterRunner: InningRunnerState = {
      belongsToSegment: segmentEventIndexes.has(event.eventIndex),
      earned: !event.reachesOnError,
    };

    if (event.isHomeRun) {
      scoreHighestBaseRunners(bases, 3, earnedRunsTotal);
      scoreRunner(batterRunner, earnedRunsTotal);
      bases[0] = null;
      bases[1] = null;
      bases[2] = null;
      continue;
    }

    if (event.isWalk || event.isHitByPitch) {
      if (bases[0]) {
        if (bases[1]) {
          if (bases[2]) {
            scoreRunner(bases[2], earnedRunsTotal);
          }
          bases[2] = bases[1];
        }
        bases[1] = bases[0];
      }
      bases[0] = batterRunner;
      continue;
    }

    if (event.reachesBase) {
      scoreHighestBaseRunners(bases, event.runsScored, earnedRunsTotal);
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
      continue;
    }

    scoreHighestBaseRunners(bases, event.runsScored, earnedRunsTotal);
    if (event.outsMade > 1) {
      removeForcedOutRunners(bases, event.outsMade - 1);
    }
  }

  return {
    earnedRuns: earnedRunsTotal.value,
    warnings,
  };
}

function buildOrderedSourceEvents(source: PitcherSourcePreview): SourceEvent[] {
  const grouped = new Map<number, Array<{ battingOrder: number; rowIndex: number; playerName: string; events: string[] }>>();

  source.batterRows.forEach((row, rowIndex) => {
    row.inningResults.forEach((inningResult) => {
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
  let runsAllowedKnown = true;

  for (const inning of sourceInnings) {
    if (inning.runsAllowed === null) {
      runsAllowedKnown = false;
      continue;
    }

    runsAllowedTotal += inning.runsAllowed;
  }

  return {
    runsAllowed: runsAllowedKnown ? runsAllowedTotal : null,
    strikeouts: sourceInnings.reduce((sum, inning) => sum + inning.strikeouts, 0),
    walks: sourceInnings.reduce((sum, inning) => sum + inning.walks, 0),
    hitByPitch: sourceInnings.reduce((sum, inning) => sum + inning.hitByPitch, 0),
    hitsAllowed: sourceInnings.reduce((sum, inning) => sum + inning.hitsAllowed, 0),
    homeRunsAllowed: sourceInnings.reduce((sum, inning) => sum + inning.homeRunsAllowed, 0),
  };
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
): { sourceInnings: PitcherMappingAssignment["sourceInnings"]; derivedStats: PitcherDerivedStatLine; warnings: string[] } {
  const warnings = [...segment.warnings];
  if (segment.events.length === 0) {
    if (segment.allocation.outs > 0) {
      return {
        sourceInnings: segment.sourceInnings,
        derivedStats: {
          innings: segment.allocation.innings,
          outs: segment.allocation.outs,
          earnedRuns: null,
          runsAllowed: null,
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

    return {
      sourceInnings: segment.sourceInnings,
      derivedStats: {
        innings: segment.allocation.innings,
        outs: segment.allocation.outs,
        earnedRuns: null,
        ...buildWholeInningDerivedTotals(segment.sourceInnings),
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
  let earnedRunsKnown = true;
  let runsAllowedTotal = 0;
  let runsAllowedKnown = true;
  let strikeoutsTotal = 0;
  let walksTotal = 0;
  let hitByPitchTotal = 0;
  let hitsAllowedTotal = 0;
  let homeRunsAllowedTotal = 0;

  for (const inning of inningNumbers) {
    const inningEvents = allEventsByInning.get(inning) ?? [];
    const segmentEvents = segment.events.filter((event) => event.inning === inning);
    const inningSummary = sourceInningMap.get(inning) ?? null;
    const earnedRunEstimate = estimateEarnedRunsForInning(inning, inningEvents, inningSummary, segmentEventIndexes);
    if (earnedRunEstimate.earnedRuns === null) {
      earnedRunsKnown = false;
      warnings.push(...earnedRunEstimate.warnings);
    } else {
      earnedRunsTotal += earnedRunEstimate.earnedRuns;
    }
    const inningRunsAllowed = inningSummary?.runsAllowed ?? null;
    const parsedInningRuns = inningEvents.reduce((sum, event) => sum + event.runsScored, 0);
    const parsedSegmentRuns = segmentEvents.reduce((sum, event) => sum + event.runsScored, 0);
    const coversWholeInning = inningEvents.length > 0 && segmentEvents.length === inningEvents.length;

    if (coversWholeInning && inningSummary) {
      if (inningRunsAllowed === null) {
        runsAllowedKnown = false;
        warnings.push(`${inning}回の失点を公開ページから特定できません`);
      } else {
        runsAllowedTotal += inningRunsAllowed;
      }

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
      runsAllowedKnown = false;
      warnings.push(`${inning}回の失点を公開ページから特定できません`);
      continue;
    }

    if (parsedInningRuns === inningRunsAllowed) {
      runsAllowedTotal += parsedSegmentRuns;
      continue;
    }

    runsAllowedKnown = false;
    warnings.push(`${inning}回の部分イニング失点配分を公開ページから特定できません`);
  }

  return {
    sourceInnings,
    derivedStats: {
      innings: segment.allocation.innings,
      outs: segment.allocation.outs,
      earnedRuns: earnedRunsKnown ? earnedRunsTotal : null,
      runsAllowed: runsAllowedKnown ? runsAllowedTotal : null,
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
): PitcherMappingAssignment {
  const allocation = segment.allocation;
  const sortedCandidates = targetPreview.pitcherRows
    .filter((target) => target.pitcherIndex === null || !takenRows.has(target.pitcherIndex))
    .map((target) => ({ target, score: scoreTargetRow(allocation, target) }))
    .sort((left, right) => right.score - left.score);

  const best = sortedCandidates[0];
  const second = sortedCandidates[1];
  const warnings: string[] = [];

  const { sourceInnings, derivedStats, warnings: derivationWarnings } = buildDerivedStatsForSegment(segment, source);
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
    createAssignment(range, source, targetPreview, takenRows),
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
    warnings: [
      ...(sourceEvents.length > 0 && sourceOuts !== requestedOuts
        ? [
            `公開打撃成績から確認できたアウト数は ${sourceOuts}アウト (${formatOutCount(sourceOuts)}) ですが、入力された投手割当は ${requestedOuts}アウト (${formatOutCount(requestedOuts)}) です`,
          ]
        : []),
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
