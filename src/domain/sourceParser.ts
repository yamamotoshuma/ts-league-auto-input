import type { BatterStat, RawTable, SourcePreview, TableSnapshot } from "./types";
import { BATTER_HEADER_ALIASES, NAME_HEADER_ALIASES, PITCHER_ONLY_HEADER_ALIASES } from "../utils/constants";
import { normalizeLooseKey, normalizeText } from "../utils/nameNormalizer";
import { deriveSupplementalStats, extractPlateAppearanceResults, normalizePosition } from "./playEvent";

type ColumnMap = Partial<Record<keyof BatterStat, number>>;

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

function parseInteger(value: string): number | null {
  const normalized = normalizeText(value).replace(/,/g, "");
  if (normalized === "" || normalized === "-" || normalized === "--") {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseStatCell(value: string, hasColumn: boolean): number | null {
  if (!hasColumn) {
    return null;
  }

  const normalized = normalizeText(value);
  if (normalized === "") {
    return 0;
  }

  return parseInteger(value);
}

function createColumnMap(headers: string[]): ColumnMap {
  return {
    playerName: findHeaderIndex(headers, NAME_HEADER_ALIASES) ?? undefined,
    battingOrder: findHeaderIndex(headers, BATTER_HEADER_ALIASES.battingOrder) ?? undefined,
    position: findHeaderIndex(headers, BATTER_HEADER_ALIASES.position) ?? undefined,
    plateAppearances: findHeaderIndex(headers, BATTER_HEADER_ALIASES.plateAppearances) ?? undefined,
    atBats: findHeaderIndex(headers, BATTER_HEADER_ALIASES.atBats) ?? undefined,
    runs: findHeaderIndex(headers, BATTER_HEADER_ALIASES.runs) ?? undefined,
    hits: findHeaderIndex(headers, BATTER_HEADER_ALIASES.hits) ?? undefined,
    rbi: findHeaderIndex(headers, BATTER_HEADER_ALIASES.rbi) ?? undefined,
    doubles: findHeaderIndex(headers, BATTER_HEADER_ALIASES.doubles) ?? undefined,
    triples: findHeaderIndex(headers, BATTER_HEADER_ALIASES.triples) ?? undefined,
    homeRuns: findHeaderIndex(headers, BATTER_HEADER_ALIASES.homeRuns) ?? undefined,
    walks: findHeaderIndex(headers, BATTER_HEADER_ALIASES.walks) ?? undefined,
    hitByPitch: findHeaderIndex(headers, BATTER_HEADER_ALIASES.hitByPitch) ?? undefined,
    strikeouts: findHeaderIndex(headers, BATTER_HEADER_ALIASES.strikeouts) ?? undefined,
    sacrificeBunts: findHeaderIndex(headers, BATTER_HEADER_ALIASES.sacrificeBunts) ?? undefined,
    sacrificeFlies: findHeaderIndex(headers, BATTER_HEADER_ALIASES.sacrificeFlies) ?? undefined,
    stolenBases: findHeaderIndex(headers, BATTER_HEADER_ALIASES.stolenBases) ?? undefined,
    errors: findHeaderIndex(headers, BATTER_HEADER_ALIASES.errors) ?? undefined,
  };
}

function scoreTable(table: RawTable): number {
  const headers = table.headers.map((header) => normalizeLooseKey(header));
  let score = 0;

  if (headers.some((header) => NAME_HEADER_ALIASES.some((alias) => header.includes(normalizeLooseKey(alias))))) {
    score += 5;
  }

  for (const aliases of Object.values(BATTER_HEADER_ALIASES)) {
    if (headers.some((header) => aliases.some((alias) => header.includes(normalizeLooseKey(alias))))) {
      score += 2;
    }
  }

  for (const alias of PITCHER_ONLY_HEADER_ALIASES) {
    if (headers.some((header) => header.includes(normalizeLooseKey(alias)))) {
      score -= 3;
    }
  }

  if (table.rows.length >= 6) {
    score += 2;
  }

  return score;
}

export function selectLikelyBatterTable(tables: RawTable[]): RawTable | null {
  const scored = tables
    .map((table) => ({ table, score: scoreTable(table) }))
    .sort((left, right) => right.score - left.score);

  if (!scored[0] || scored[0].score <= 0) {
    return null;
  }

  return scored[0].table;
}

function getCellValue(row: string[], index: number | undefined): string {
  if (index === undefined) {
    return "";
  }

  return row[index] ?? "";
}

function derivePlateAppearances(stat: BatterStat): number | null {
  const values = [stat.atBats, stat.walks, stat.hitByPitch, stat.sacrificeBunts, stat.sacrificeFlies];
  if (values.some((value) => value === null)) {
    return null;
  }

  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function shouldSkipRow(playerName: string): boolean {
  const normalized = normalizeLooseKey(playerName);
  return normalized === "" || ["計", "合計", "total", "team"].includes(normalized);
}

export function parseBatterTable(table: RawTable): { batterStats: BatterStat[]; unknownHeaders: string[] } {
  const headers = table.headers.map((header) => normalizeText(header));
  const columnMap = createColumnMap(headers);
  const knownIndexes = new Set<number>(Object.values(columnMap).filter((value): value is number => value !== undefined));
  const unknownHeaders = headers.filter((_, index) => !knownIndexes.has(index));

  const batterStats: BatterStat[] = [];

  for (const row of table.rows) {
    const values = row.cells.map((cell) => normalizeText(cell.text));
    const playerName = getCellValue(values, columnMap.playerName);

    if (shouldSkipRow(playerName)) {
      continue;
    }

    const stat: BatterStat = {
      playerName,
      battingOrder: parseInteger(getCellValue(values, columnMap.battingOrder)),
      position: normalizePosition(getCellValue(values, columnMap.position)),
      plateAppearances: parseInteger(getCellValue(values, columnMap.plateAppearances)),
      atBats: parseStatCell(getCellValue(values, columnMap.atBats), columnMap.atBats !== undefined),
      runs: parseStatCell(getCellValue(values, columnMap.runs), columnMap.runs !== undefined),
      hits: parseStatCell(getCellValue(values, columnMap.hits), columnMap.hits !== undefined),
      rbi: parseStatCell(getCellValue(values, columnMap.rbi), columnMap.rbi !== undefined),
      doubles: parseStatCell(getCellValue(values, columnMap.doubles), columnMap.doubles !== undefined),
      triples: parseStatCell(getCellValue(values, columnMap.triples), columnMap.triples !== undefined),
      homeRuns: parseStatCell(getCellValue(values, columnMap.homeRuns), columnMap.homeRuns !== undefined),
      walks: parseStatCell(getCellValue(values, columnMap.walks), columnMap.walks !== undefined),
      hitByPitch: parseStatCell(getCellValue(values, columnMap.hitByPitch), columnMap.hitByPitch !== undefined),
      strikeouts: parseStatCell(getCellValue(values, columnMap.strikeouts), columnMap.strikeouts !== undefined),
      sacrificeBunts: parseStatCell(
        getCellValue(values, columnMap.sacrificeBunts),
        columnMap.sacrificeBunts !== undefined,
      ),
      sacrificeFlies: parseStatCell(
        getCellValue(values, columnMap.sacrificeFlies),
        columnMap.sacrificeFlies !== undefined,
      ),
      stolenBases: parseStatCell(getCellValue(values, columnMap.stolenBases), columnMap.stolenBases !== undefined),
      errors: parseStatCell(getCellValue(values, columnMap.errors), columnMap.errors !== undefined),
      plateAppearanceResults: extractPlateAppearanceResults(headers, values),
    };

    const supplemented = {
      ...stat,
      ...deriveSupplementalStats(stat),
    };

    if (supplemented.plateAppearances === null) {
      supplemented.plateAppearances = derivePlateAppearances(supplemented);
    }

    batterStats.push(supplemented);
  }

  return { batterStats, unknownHeaders };
}

export function buildSourcePreview(snapshot: TableSnapshot): SourcePreview {
  const selectedTable = selectLikelyBatterTable(snapshot.tables);

  if (!selectedTable) {
    return {
      sourceUrl: snapshot.url,
      pageTitle: snapshot.title,
      selectedTableIndex: null,
      selectedHeaders: [],
      unknownHeaders: [],
      batterStats: [],
    };
  }

  const parsed = parseBatterTable(selectedTable);
  return {
    sourceUrl: snapshot.url,
    pageTitle: snapshot.title,
    selectedTableIndex: selectedTable.tableIndex,
    selectedHeaders: selectedTable.headers,
    unknownHeaders: parsed.unknownHeaders,
    batterStats: parsed.batterStats,
  };
}
