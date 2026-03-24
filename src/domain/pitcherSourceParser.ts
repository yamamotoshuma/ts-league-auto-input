import type {
  PitcherSourceBatterRow,
  PitcherSourceInningResult,
  PitcherSourceInningSummary,
  PitcherSourcePreview,
  RawTable,
  TableSnapshot,
} from "./types";
import { BATTER_HEADER_ALIASES, NAME_HEADER_ALIASES, PITCHER_ONLY_HEADER_ALIASES } from "../utils/constants";
import { getTargetEventLabelCandidates } from "./playEvent";
import { normalizeLooseKey, normalizeText } from "../utils/nameNormalizer";

type InningColumn = {
  index: number;
  inning: number;
};

const COMPACT_EVENT_PATTERNS = [
  /^見逃三振(?:\(\d+\))?/,
  /^空振三振(?:\(\d+\))?/,
  /^見三振(?:\(\d+\))?/,
  /^空三振(?:\(\d+\))?/,
  /^三振(?:\(\d+\))?/,
  /^振逃(?:\(\d+\))?/,
  /^敬遠(?:\(\d+\))?/,
  /^四球(?:\(\d+\))?/,
  /^死球(?:\(\d+\))?/,
  /^本塁打(?:\(\d+\))?/,
  /^三塁打(?:\(\d+\))?/,
  /^二塁打(?:\(\d+\))?/,
  /^内野安打(?:\(\d+\))?/,
  /^内安(?:\(\d+\))?/,
  /^安打(?:\(\d+\))?/,
  /^安[23２３](?:\(\d+\))?/,
  /^犠飛(?:\(\d+\))?/,
  /^犠打(?:\(\d+\))?/,
  /^野選(?:\(\d+\))?/,
  /^敵失(?:\(\d+\))?/,
  /^エラー(?:\(\d+\))?/,
  /^三重殺(?:\(\d+\))?/,
  /^併殺(?:\(\d+\))?/,
  /^ゲッツー(?:\(\d+\))?/,
  /^アウト(?:\(\d+\))?/,
  /^[投捕一二三遊左右中ニ](?:安|2|3|２|３|本|ゴ|飛|直|失|併|選)(?:\(\d+\))?/,
  /^[投捕一二三遊左右中ニ](?:犠打|犠飛|邪飛)(?:\(\d+\))?/,
  /^ア(?:ゴ|飛|直)(?:\(\d+\))?/,
];

function findHeaderIndex(headers: string[], aliases: string[]): number | null {
  const normalizedHeaders = headers.map((header) => normalizeLooseKey(header));
  const normalizedAliases = aliases.map((alias) => normalizeLooseKey(alias));

  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const header = normalizedHeaders[index];
    if (normalizedAliases.some((alias) => header.includes(alias))) {
      return index;
    }
  }

  return null;
}

function extractInningColumns(headers: string[]): InningColumn[] {
  return headers.flatMap((header, index) => {
    const match = normalizeText(header).match(/^(\d+)(?:回)?$/);
    if (!match) {
      return [];
    }

    return [
      {
        index,
        inning: Number.parseInt(match[1], 10),
      },
    ];
  });
}

function scoreOpponentBattingTable(table: RawTable, targetOpponent: string | null): number {
  const inningColumns = extractInningColumns(table.headers);
  if (inningColumns.length === 0) {
    return 0;
  }

  const headers = table.headers.map((header) => normalizeLooseKey(header));
  const context = normalizeLooseKey([table.caption, table.contextText].filter(Boolean).join(" "));
  let score = inningColumns.length * 5;

  if (headers.some((header) => NAME_HEADER_ALIASES.some((alias) => header.includes(normalizeLooseKey(alias))))) {
    score += 10;
  }

  if (headers.some((header) => BATTER_HEADER_ALIASES.battingOrder.some((alias) => header.includes(normalizeLooseKey(alias))))) {
    score += 5;
  }

  if (table.rows.length >= 6) {
    score += 10;
  }

  if (PITCHER_ONLY_HEADER_ALIASES.some((alias) => headers.some((header) => header.includes(normalizeLooseKey(alias))))) {
    score -= 20;
  }

  if (context.includes("打撃") || context.includes("打者")) {
    score += 10;
  }

  if (context.includes("打撃成績一覧")) {
    score += 30;
  }

  if (targetOpponent && context.includes(normalizeLooseKey(targetOpponent))) {
    score += 40;
  }

  if (context.includes("ordermade") || context.includes("order made")) {
    score -= 15;
  }

  return score;
}

function selectOpponentBattingTable(tables: RawTable[], targetOpponent: string | null): RawTable | null {
  const scored = tables
    .map((table) => ({ table, score: scoreOpponentBattingTable(table, targetOpponent) }))
    .sort((left, right) => right.score - left.score);

  if (!scored[0] || scored[0].score <= 0) {
    return null;
  }

  return scored[0].table;
}

function scoreScoreboardTable(table: RawTable, targetOpponent: string | null): number {
  const inningColumns = extractInningColumns(table.headers);
  if (inningColumns.length === 0) {
    return 0;
  }

  let score = 0;
  if (table.rows.length >= 2 && table.rows.length <= 4) {
    score += 20;
  }

  const context = normalizeLooseKey([table.caption, table.contextText].filter(Boolean).join(" "));
  if (context.includes("スコア") || context.includes("試合経過")) {
    score += 10;
  }

  if (
    targetOpponent &&
    table.rows.some((row) => normalizeLooseKey(row.cells[0]?.text ?? "").includes(normalizeLooseKey(targetOpponent)))
  ) {
    score += 20;
  }

  const headers = table.headers.map((header) => normalizeLooseKey(header));
  if (headers.some((header) => header.includes(normalizeLooseKey("打順")) || header.includes(normalizeLooseKey("選手")))) {
    score -= 20;
  }

  return score;
}

function selectScoreboardTable(tables: RawTable[], targetOpponent: string | null): RawTable | null {
  const scored = tables
    .map((table) => ({ table, score: scoreScoreboardTable(table, targetOpponent) }))
    .sort((left, right) => right.score - left.score);

  if (!scored[0] || scored[0].score <= 0) {
    return null;
  }

  return scored[0].table;
}

function parseInteger(value: string): number | null {
  const normalized = normalizeText(value).replace(/,/g, "");
  if (normalized === "" || normalized === "-" || normalized === "--") {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function shouldSkipPlayerRow(label: string): boolean {
  const normalized = normalizeLooseKey(label);
  return normalized === "" || ["計", "合計", "total", "team", "選手名"].includes(normalized);
}

function sanitizePlayerName(value: string): string {
  return normalizeText(value)
    .replace(/\d+\s*view$/i, "")
    .replace(/\(\d+\)$/, "")
    .trim();
}

function parsePlayerName(value: string): { battingOrder: number | null; playerName: string } {
  const normalized = sanitizePlayerName(value);
  const match = normalized.match(/^(\d+)\s+(.+?)(?:\(\d+\))?$/);
  if (!match) {
    return {
      battingOrder: null,
      playerName: normalized,
    };
  }

  return {
    battingOrder: Number.parseInt(match[1], 10),
    playerName: match[2].trim(),
  };
}

function splitCellEvents(value: string): string[] {
  const normalized = normalizeText(value);
  if (normalized === "" || normalized === "-") {
    return [];
  }

  return normalized
    .replace(/[／/,]/g, " ")
    .split(/\s+/)
    .flatMap((token) => {
      const compact = normalizeText(token);
      if (!compact) {
        return [];
      }

      const events: string[] = [];
      let rest = compact;

      while (rest !== "") {
        const matchedPattern = COMPACT_EVENT_PATTERNS.find((pattern) => pattern.test(rest));
        if (!matchedPattern) {
          if (events.length === 0) {
            return [compact];
          }

          events.push(rest);
          break;
        }

        const match = rest.match(matchedPattern);
        if (!match || !match[0]) {
          break;
        }

        events.push(match[0]);
        rest = rest.slice(match[0].length);
      }

      return events.filter(Boolean);
    });
}

function classifyEvent(rawText: string) {
  const normalized = normalizeText(rawText).replace(/\(\d+\)$/, "");
  const candidates = getTargetEventLabelCandidates(normalized).map((candidate) => normalizeText(candidate));

  const isWalk =
    normalized.includes("四球") || normalized.includes("敬遠") || candidates.some((candidate) => candidate === "四球");
  const isHitByPitch =
    normalized.includes("死球") || candidates.some((candidate) => candidate === "死球");
  const isStrikeout =
    normalized.includes("三振") ||
    normalized.includes("振逃") ||
    candidates.some((candidate) => ["三振", "空三振", "見三振", "振逃"].includes(candidate));
  const isHomeRun =
    normalized.includes("本塁打") || candidates.some((candidate) => candidate === "本塁打" || /本$/.test(candidate));
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

  return {
    isHit,
    isHomeRun,
    isStrikeout,
    isWalk,
    isHitByPitch,
  };
}

function parseBattingRows(table: RawTable): PitcherSourceBatterRow[] {
  const headers = table.headers.map((header) => normalizeText(header));
  const inningColumns = extractInningColumns(headers);
  const orderIndex = findHeaderIndex(headers, BATTER_HEADER_ALIASES.battingOrder);
  const nameIndex = findHeaderIndex(headers, NAME_HEADER_ALIASES);
  const labelIndex = nameIndex ?? orderIndex ?? 0;

  const rows: PitcherSourceBatterRow[] = [];

  for (const row of table.rows) {
    const values = row.cells.map((cell) => normalizeText(cell.text));
    const labelCell = values[labelIndex] ?? "";
    if (shouldSkipPlayerRow(labelCell)) {
      continue;
    }

    const parsedLabel = parsePlayerName(labelCell);
    const explicitOrder = orderIndex !== null ? parseInteger(values[orderIndex] ?? "") : null;
    const explicitName = nameIndex !== null ? sanitizePlayerName(values[nameIndex] ?? "") : "";
    const inningResults: PitcherSourceInningResult[] = inningColumns
      .map((column) => ({
        inning: column.inning,
        rawText: normalizeText(values[column.index] ?? ""),
      }))
      .filter((result) => result.rawText !== "")
      .map((result) => ({
        ...result,
        events: splitCellEvents(result.rawText),
      }));

    rows.push({
      battingOrder: explicitOrder ?? parsedLabel.battingOrder,
      playerName: explicitName || parsedLabel.playerName,
      inningResults,
    });
  }

  return rows;
}

function isBattingHeaderRow(values: string[]): boolean {
  return normalizeText(values[0] ?? "") === "打順" && normalizeText(values[1] ?? "") === "選手名";
}

function isScoreRow(values: string[]): boolean {
  const first = normalizeText(values[0] ?? "");
  return (first === "先攻" || first === "後攻") && normalizeText(values[2] ?? "") !== "";
}

function normalizeCombinedRowValues(values: string[], headerLength: number): string[] {
  if (values.length === headerLength + 1 && values[1] === "") {
    return [values[0], ...values.slice(2)];
  }

  return values;
}

function parseRunsFromSummaryRow(values: string[]): Map<number, number | null> {
  const inningRuns = new Map<number, number | null>();
  const candidates = values.slice(4);

  candidates.forEach((value, index) => {
    const parsed = parseInteger(value);
    if (parsed === null && normalizeText(value) === "") {
      return;
    }

    inningRuns.set(index + 1, parsed);
  });

  return inningRuns;
}

function parseBattingRowsFromValues(headers: string[], rows: string[][]): PitcherSourceBatterRow[] {
  const inningColumns = extractInningColumns(headers);
  const orderIndex = findHeaderIndex(headers, BATTER_HEADER_ALIASES.battingOrder);
  const nameIndex = findHeaderIndex(headers, NAME_HEADER_ALIASES);
  const labelIndex = nameIndex ?? orderIndex ?? 0;
  const normalizedRows = rows.map((row) => normalizeCombinedRowValues(row, headers.length));

  return normalizedRows.flatMap((values) => {
    const labelCell = values[labelIndex] ?? "";
    if (shouldSkipPlayerRow(labelCell)) {
      return [];
    }

    const parsedLabel = parsePlayerName(labelCell);
    const explicitOrder = orderIndex !== null ? parseInteger(values[orderIndex] ?? "") : null;
    const explicitName = nameIndex !== null ? sanitizePlayerName(values[nameIndex] ?? "") : "";
    const inningResults: PitcherSourceInningResult[] = inningColumns
      .map((column) => ({
        inning: column.inning,
        rawText: normalizeText(values[column.index] ?? ""),
      }))
      .filter((result) => result.rawText !== "")
      .map((result) => ({
        ...result,
        events: splitCellEvents(result.rawText),
      }));

    return [
      {
        battingOrder: explicitOrder ?? parsedLabel.battingOrder,
        playerName: explicitName || parsedLabel.playerName,
        inningResults,
      },
    ];
  });
}

function parseCombinedBattingTable(
  table: RawTable,
  targetOpponent: string | null,
): {
  batterRows: PitcherSourceBatterRow[];
  runsByInning: Map<number, number | null>;
  scoreboardHeaders: string[];
} | null {
  const rows = table.rows.map((row) => row.cells.map((cell) => normalizeText(cell.text)));
  const teamNames: string[] = [];
  const runsByTeam = new Map<string, Map<number, number | null>>();
  const blocks: Array<{ headers: string[]; rows: string[][] }> = [];
  let currentHeaders = table.headers.map((header) => normalizeText(header));
  let currentRows: string[][] = [];

  for (const values of rows) {
    if (isBattingHeaderRow(values)) {
      if (currentRows.length > 0) {
        blocks.push({ headers: currentHeaders, rows: currentRows });
        currentRows = [];
      }
      currentHeaders = values;
      continue;
    }

    if (isScoreRow(values)) {
      if (currentRows.length > 0) {
        blocks.push({ headers: currentHeaders, rows: currentRows });
        currentRows = [];
      }

      const teamName = normalizeText(values[2] ?? "");
      if (teamName !== "") {
        teamNames.push(teamName);
        runsByTeam.set(normalizeLooseKey(teamName), parseRunsFromSummaryRow(values));
      }
      continue;
    }

    if (currentHeaders.length > 0) {
      currentRows.push(values);
    }
  }

  if (currentRows.length > 0) {
    blocks.push({ headers: currentHeaders, rows: currentRows });
  }

  if (blocks.length === 0) {
    return null;
  }

  const blockCandidates = blocks.map((block, index) => ({
    block,
    teamName: teamNames[index] ?? null,
  }));
  const selected =
    (targetOpponent
      ? blockCandidates.find((candidate) =>
          candidate.teamName ? normalizeLooseKey(candidate.teamName).includes(normalizeLooseKey(targetOpponent)) : false,
        ) ?? null
      : null) ??
    blockCandidates.at(-1) ??
    null;

  if (!selected) {
    return null;
  }

  return {
    batterRows: parseBattingRowsFromValues(selected.block.headers, selected.block.rows),
    runsByInning:
      selected.teamName && runsByTeam.has(normalizeLooseKey(selected.teamName))
        ? runsByTeam.get(normalizeLooseKey(selected.teamName)) ?? new Map<number, number | null>()
        : new Map<number, number | null>(),
    scoreboardHeaders: selected.block.headers.filter((header) => /^(\d+)(?:回)?$/.test(normalizeText(header))),
  };
}

function parseScoreboardRuns(table: RawTable, targetOpponent: string | null): Map<number, number | null> {
  const inningColumns = extractInningColumns(table.headers);
  const result = new Map<number, number | null>();
  if (inningColumns.length === 0 || !targetOpponent) {
    return result;
  }

  const targetRow =
    table.rows.find((row) =>
      normalizeLooseKey(row.cells[0]?.text ?? "").includes(normalizeLooseKey(targetOpponent)),
    ) ?? null;
  if (!targetRow) {
    return result;
  }

  const values = targetRow.cells.map((cell) => normalizeText(cell.text));
  for (const column of inningColumns) {
    result.set(column.inning, parseInteger(values[column.index] ?? ""));
  }

  return result;
}

function summarizeInnings(
  batterRows: PitcherSourceBatterRow[],
  runsByInning: Map<number, number | null>,
): PitcherSourceInningSummary[] {
  const inningMap = new Map<number, PitcherSourceInningSummary>();

  for (const row of batterRows) {
    for (const inningResult of row.inningResults) {
      const current =
        inningMap.get(inningResult.inning) ??
        {
          inning: inningResult.inning,
          runsAllowed: runsByInning.get(inningResult.inning) ?? null,
          hitsAllowed: 0,
          homeRunsAllowed: 0,
          strikeouts: 0,
          walks: 0,
          hitByPitch: 0,
          eventCount: 0,
          rawEvents: [],
        };

      for (const event of inningResult.events) {
        const classified = classifyEvent(event);
        current.eventCount += 1;
        current.rawEvents.push(`${row.playerName}: ${event}`);
        if (classified.isHit) {
          current.hitsAllowed += 1;
        }
        if (classified.isHomeRun) {
          current.homeRunsAllowed += 1;
        }
        if (classified.isStrikeout) {
          current.strikeouts += 1;
        }
        if (classified.isWalk) {
          current.walks += 1;
        }
        if (classified.isHitByPitch) {
          current.hitByPitch += 1;
        }
      }

      inningMap.set(inningResult.inning, current);
    }
  }

  return Array.from(inningMap.values()).sort((left, right) => left.inning - right.inning);
}

export function buildPitcherSourcePreview(snapshot: TableSnapshot, targetOpponent: string | null): PitcherSourcePreview {
  const warnings: string[] = [];
  const selectedTable = selectOpponentBattingTable(snapshot.tables, targetOpponent);
  const combined = selectedTable ? parseCombinedBattingTable(selectedTable, targetOpponent) : null;
  const scoreboardTable = combined?.runsByInning.size ? null : selectScoreboardTable(snapshot.tables, targetOpponent);

  if (!selectedTable) {
    warnings.push("公開試合ページで相手打撃成績テーブルを特定できませんでした");
  }

  if (!combined?.runsByInning.size && !scoreboardTable) {
    warnings.push("公開試合ページでスコアテーブルを特定できませんでした");
  }

  const batterRows = combined?.batterRows ?? (selectedTable ? parseBattingRows(selectedTable) : []);
  const runsByInning =
    combined?.runsByInning && combined.runsByInning.size > 0
      ? combined.runsByInning
      : scoreboardTable
        ? parseScoreboardRuns(scoreboardTable, targetOpponent)
        : new Map<number, number | null>();
  const innings = summarizeInnings(batterRows, runsByInning);

  if (selectedTable && batterRows.length === 0) {
    warnings.push("相手打撃成績テーブルは見つかりましたが、打席結果を抽出できませんでした");
  }

  return {
      sourceUrl: snapshot.url,
      pageTitle: snapshot.title,
      selectedTableIndex: selectedTable?.tableIndex ?? null,
      selectedHeaders: selectedTable?.headers ?? [],
      scoreboardTableIndex: combined?.runsByInning.size ? selectedTable?.tableIndex ?? null : scoreboardTable?.tableIndex ?? null,
      scoreboardHeaders: combined?.scoreboardHeaders ?? scoreboardTable?.headers ?? [],
      opponentTeam: targetOpponent,
      batterRows,
      innings,
    warnings,
  };
}
