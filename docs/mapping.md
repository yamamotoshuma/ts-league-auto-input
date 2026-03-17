# Mapping

Observed on 2026-03-17. This document now reflects authenticated discovery of the actual Order Made batter table and the actual TS-League `gameof_edit.php` form.

## Normalized model

The automation should normalize the source data into a `BatterStat` object before touching the target form.

```ts
type BatterStat = {
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
  plateAppearanceResults: Array<{
    appearanceIndex: number;
    rawText: string;
  }>;
};
```

Important implementation note:

- TS-League does not expose a simple per-player summary grid for all batting stats.
- The actual writable structure is:
  - lineup row selection
  - player select
  - position select
  - summary inputs like `MemberScoreOfDaten[ROW]`
  - event selects like `MemberScoreOf{N}[ROW]`
  - per-event RBI selects like `MemberScoreOf{N}_daten[ROW]`

## Field mapping policy

| Normalized field | Source-side extraction policy | Target-side fill policy | If missing or ambiguous |
| --- | --- | --- | --- |
| `playerName` | Extract from the batter row label cell. | Secondary key. TS-League target labels include jersey prefixes like `[4]伊藤`. | Do not auto-commit unmatched players. Show warning. |
| `battingOrder` | Extract from explicit `打順`. | Primary key. TS-League target rows are indexed by lineup row. | Keep `null`; commit should fail closed. |
| `position` | Extract from `守備位置` and normalize by stripping parentheses. | Primary or secondary key. TS-League uses `MemberScoreOfSyubi[ROW]`. | Keep `null`; reduce match confidence. |
| `plateAppearances` | Use explicit source value only. If absent, derive only when all necessary component stats are available and the calculation is unambiguous. | Fill only if the target has an explicit field. | Keep `null` and warn if target requires it. |
| `atBats` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `runs` | No explicit runs column was observed on Order Made game `37`. | Target has `MemberScoreOfTokuten[ROW]`, but the current implementation leaves it untouched when the source cannot provide a value. | Keep `null`; do not synthesize. |
| `hits` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `rbi` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `doubles` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `triples` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `homeRuns` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `walks` | Use explicit source value only. | Fill matching target input if present. | If the source only exposes a combined metric, do not split by guesswork. |
| `hitByPitch` | Use explicit source value only. | Fill matching target input if present. | If the source only exposes a combined metric, keep `null` and warn. |
| `strikeouts` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `sacrificeBunts` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `sacrificeFlies` | Use explicit source value. | Fill matching target input if present. | Keep `null`; skip target field. |
| `stolenBases` | Use explicit source value when present; Order Made blank cells may still mean zero when the column exists. | Fill `MemberScoreOfTorui[ROW]`. | If the source column is absent, keep `null`. |
| `errors` | No explicit defensive-error source column was confirmed on the batter table. | Target has `MemberScoreOfEr[ROW]`, but the current implementation leaves it untouched when the source cannot provide a value. | Keep `null`; do not synthesize. |
| `plateAppearanceResults` | Extract from numbered source columns `1..N` as ordered appearance slots. | Map to `MemberScoreOf{N}[ROW]` on TS-League. | If any appearance text cannot be converted to a target option, do not auto-commit. |

## Live event mapping examples

| Order Made text | TS-League option label |
| --- | --- |
| `二ゴロ` | `ニゴ` |
| `一ゴロ` | `一ゴ` |
| `捕ゴロ` | `捕ゴ` |
| `中安打` | `中安` |
| `中二塁打` | `中２` |
| `空振三振` | `空三振` or `三振` |
| `見逃三振` | `見三振` or `三振` |
| `四球` / `投四球` | `四球` |
| `右エラー` | `右失` |
| `投エラー` | `投失` |
| `三フライ` | `三飛` |
| `左フライ` | `左飛` |

Compatibility rule confirmed live:

- If the target already contains a compatible broader value, it may be preserved instead of overwritten.
- Example:
  - source `空振三振`
  - existing target `三振`
  - action: keep current target value, do not force an overwrite to `空三振`

## Player matching rules

1. Normalize names before comparison.
2. Match with this priority:
   - batting order + normalized position
   - normalized player name + batting order
   - normalized player name + normalized position
   - normalized player name only
3. If multiple target rows still match, mark the row as ambiguous and do not auto-commit.
4. If no target row matches, keep the source stat in the dry-run output and surface it as unmapped.

Observed reason for this order:

- Order Made source names may contain nicknames such as `いわもん`.
- TS-League target labels may contain registered player names such as `[19]岩本`.
- In live data, batting order and position were more stable than raw display-name equality.

## Name normalization rules

The code should normalize both source and target player identifiers before matching:

- Unicode NFKC normalization
- Trim leading and trailing whitespace
- Collapse consecutive spaces
- Remove full-width and half-width internal spaces for comparison
- Lower sensitivity to punctuation variants where safe

Do not silently drop semantically meaningful suffixes if doing so would increase collision risk.

## Missing-value handling

- `null` is valid for any stat that is absent from the source or absent from the target form.
- Do not synthesize stats from partial data.
- Do not write zero just because the source column is missing.
- If the source column exists and the cell is blank for a numeric stat like `盗塁`, treating it as zero is acceptable.
- If the target already has a compatible value and the source does not provide a more safely writable number, preserving the existing value is preferred over overwriting.
- Dry-run must distinguish:
  - extracted value
  - explicitly blank / unavailable
  - target field not present
  - player row not matched
  - plate-appearance event mapped
  - plate-appearance event unmapped

## Unknowns still requiring authenticated discovery

- Whether `MemberScoreOfTokuten[ROW]` is required or can always be omitted safely when the source does not expose runs
- Whether `MemberScoreOfEr[ROW]` is required or can always be omitted safely when the source does not expose errors
- Whether `MemberScoreOf{N}s[ROW]` is needed for games with two plate appearances in the same slot/inning

## Commit safety rules

- Commit only when every targeted write has a confident target row and every `plateAppearanceResults` entry resolves to a target option.
- If an existing target value is already compatible with the source event, keep the current value rather than overwriting it.
- If an existing target value is incompatible and overwrite behavior is unclear, stop and require manual review.
- If `runs` or `errors` remain unresolved because the source does not expose them, leave those fields untouched and continue only if all other writes are safe.
- Save success should be verified by both completion-page detection and by reopening the same target game to compare persisted values.
- If any required mapping remains unresolved, downgrade the run to an effective dry-run and report why.
