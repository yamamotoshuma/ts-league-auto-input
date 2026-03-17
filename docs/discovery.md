# Discovery

Observed on 2026-03-17. This document now includes authenticated discovery using local-only secrets supplied during the session.

## Current repository state

- The working directory contained only `AGENTS.md` at the start of this task.
- There was no existing application code, config, or Git metadata in this directory.

## Observed external pages

| Area | URL | Observation | Evidence level |
| --- | --- | --- | --- |
| Source sample game | `https://ordermade.sakura.ne.jp/kanri/game/37` | Unauthenticated `GET` returned `302` to `/kanri/login`. The actual game DOM was not observable. | Confirmed |
| Source login | `https://ordermade.sakura.ne.jp/kanri/login` | Server-rendered login page with a normal HTML `POST` form and a hidden CSRF token. A JS bundle is also loaded. | Confirmed |
| Target login | `https://ts-league.com/team/order-made/login.php` | Plain HTML login page with a normal HTML `POST` form to `../../pass/pass_check.php`. | Confirmed |
| Target game list | `https://ts-league.com/team/order-made/game.php` | Unauthenticated `GET` returned `302` to `logout.php`; final page displayed `セッションがタイムアウトしました。`. The authenticated game list DOM was not observable. | Confirmed |

## Authenticated discovery summary

### Order Made source game `game/37`

- Authenticated page URL remained `https://ordermade.sakura.ne.jp/kanri/game/37`
- Page title remained `オーダーメイド管理システム`
- Three tables were observed:
  - team score by inning
  - batter table
  - pitcher table
- Selected batter table index: `1`
- Batter table headers:
  - `打順`
  - `守備位置`
  - `選手名`
  - `打数`
  - `安打`
  - `打点`
  - `打率`
  - `盗塁`
  - `1`
  - `2`
  - `3`
  - `4`
  - `5`
- Observed batter table rows show values such as:
  - `伊藤 / (遊) / 3 / 1 / 0 / 二ゴロ / 中安打 / 捕フライ`
  - `山本 / (中) / 3 / 1 / 0 / 空振三振 / 中二塁打 / 見逃三振`
  - `坂田 / (捕) / 0 / 0 / 1 / 四球 / 右エラー`

Inference from authenticated data:

- The numbered source columns `1..5` are not safe to treat as innings.
- They behave like batting-appearance slots or lineup-cycle slots, because players have entries beyond the innings shown in the score table.

### TS-League authenticated game list

- Post-login landing page: `https://ts-league.com/team/order-made/main.php`
- Game list page after login: `https://ts-league.com/team/order-made/game.php`
- The batting-edit navigation is not an anchor link. It is a normal HTML `POST` form:
  - action: `gameof_edit.php`
  - hidden fields observed on the relevant row:
    - `Id=14248`
    - `MemberScoreOfGameYear=2026`
    - `MemberScoreOfGameYear2=2026`
    - `GameDay=20260307`
    - `GameTypeId=1`
    - `CmtCk=1`
- The game-list row text contained enough information to identify the match:
  - `LG 3/7/9:00- 光が丘公園 ORDERMADE BASEBALL CLUB 3 対 6 Ｒｅ`

### TS-League batting edit page

- Page URL after submitting the row form: `https://ts-league.com/team/order-made/gameof_edit.php`
- Main form:
  - action: `gameof_edit_complete.php`
  - method: `post`
- Hidden fields observed:
  - `bcount=10`
  - `GameDay=20260307`
  - `MemberScoreOfGameYear=2026`
  - `MemberScoreOfGameYear2=2026`
  - `Id=14248`
  - `GameTypeId=1`
  - `GroupLeagueType=7`
- Submit control observed:
  - `input type="submit" id="sbmitBtn"`
- Player row structure is not a simple text table. It is a repeated indexed form pattern:
  - `select[name="MemberScoreOfUserId[ROW]"]`
  - `select[name="MemberScoreOfSyubi[ROW]"]`
  - `input[name="MemberScoreOfDaten[ROW]"]`
  - `input[name="MemberScoreOfTokuten[ROW]"]`
  - `input[name="MemberScoreOfTorui[ROW]"]`
  - `input[name="MemberScoreOfTouruisi[ROW]"]`
  - `input[name="MemberScoreOfEr[ROW]"]`
  - `input[name="MemberScoreOfBigi[ROW]"]`
  - `select[name="MemberScoreOf{N}[ROW]"]`
  - `select[name="MemberScoreOf{N}_daten[ROW]"]`
  - `select[name="MemberScoreOf{N}s[ROW]"]`
  - `select[name="MemberScoreOf{N}s_daten[ROW]"]`
- Observed row/user alignment on this page:
  - row 1: `[4]伊藤`, position `遊`
  - row 2: `[77]山本`, position `中`
  - row 3: `[1]若菜`, position `三`
  - row 4: `[17]安楽`, position `投`
  - row 5: `[33]坂田`, position `捕`
  - row 6: `[18]藤田`, position `一`
  - row 7: `[61]戸嶋`, position `右`
  - row 8: `[19]岩本`, position `左`
  - row 9: `[6]津村`, position `二`

Observed target event option labels include:

- `安打`
- `内安`
- `安２`
- `安３`
- `本塁打`
- `四球`
- `死球`
- `三振`
- `空三振`
- `見三振`
- `投安` `捕安` `一安` `ニ安` `三安` `遊安` `左安` `中安` `右安`
- `投ゴ` `捕ゴ` `一ゴ` `ニゴ` `三ゴ` `遊ゴ`
- `投飛` `捕飛` `一飛` `ニ飛` `三飛` `遊飛` `左飛` `中飛` `右飛`
- `投失` `捕失` `一失` `二失` `三失` `遊失` `左失` `中失` `右失`

### Source-to-target event examples observed live

| Source text | Target selected label | Target value |
| --- | --- | --- |
| `二ゴロ` | `ニゴ` | `49` |
| `中安打` | `中安` | `32` |
| `一ゴロ` | `一ゴ` | `48` |
| `捕ゴロ` | `捕ゴ` | `47` |
| `空振三振` | `三振` | `14` |
| `中二塁打` | `中２` | `38` |
| `投四球` / `四球` | `四球` | `6` |
| `右エラー` | `右失` | `91` |
| `投エラー` | `投失` | `83` |
| `三フライ` | `三飛` | `68` |
| `左フライ` | `左飛` | `70` |

### TS-League live save flow confirmed on 2026-03-17

Confirmed against the approved live match `3/7/9:00-光が丘公園`.

- Pre-submit edit page URL: `https://ts-league.com/team/order-made/gameof_edit.php`
- Submit control used: `input#sbmitBtn`
- Submit request:
  - method: `POST`
  - endpoint: `https://ts-league.com/team/order-made/gameof_edit_complete.php`
- Server response:
  - `302` redirect to `https://ts-league.com/team/order-made/complete.php`
- Final completion page body included:
  - `無事に登録が完了しました。`
- No intermediate confirmation form was observed.
- Re-opening the same game after save showed the expected persisted values, so the current implementation now verifies commit by:
  1. detecting `complete.php`
  2. reopening the same target game
  3. comparing saved values against the intended mapping

## Unauthenticated screen transitions

### Order Made

1. `GET /kanri/game/:id`
2. `302 Location: https://ordermade.sakura.ne.jp/kanri/login`
3. Login page rendered at `/kanri/login`

Observed cookies and tokens:

- `ENC_XSRF-TOKEN`
- `ENC__session`
- Login form hidden field `_token`

### TS-League

1. `GET /team/order-made/game.php`
2. `302 Location: logout.php`
3. Final HTML shows `セッションがタイムアウトしました。`
4. Timeout page links back to `login.php`

Observed cookie:

- `PHPSESSID`

## Rendering model and submission method

### Order Made login

- Rendering: server-rendered HTML page with linked CSS and module JS bundle
- Login submission: normal HTML form `POST https://ordermade.sakura.ne.jp/kanri/login`
- Observed fields:
  - `input[name="_token"]`
  - `input[name="email"]`
  - `input[name="password"]`
  - `input[name="remember"]`
  - submit button `type="submit"`

Selector candidates:

- `form[action="https://ordermade.sakura.ne.jp/kanri/login"]`
- `input#email`
- `input#password`
- `input#remember_me`

### TS-League login

- Rendering: plain server-rendered HTML
- Login submission: normal HTML form `POST ../../pass/pass_check.php`
- Observed fields:
  - `input[name="userid"]`
  - `input[name="password"]`
  - `input[name="url"][value="order-made"]`
  - `input[name="login2"]`

Selector candidates:

- `form[action="../../pass/pass_check.php"]`
- `input#userid`
- `input#password`
- `input#url`
- `input#login2`

### Remaining unknowns after authenticated discovery

- Whether `MemberScoreOfTokuten` and `MemberScoreOfEr` are ever required for matches where the source cannot provide those values
- Whether row 10 in `bcount=10` is intended for a bench player, helper row, or an optional substitute slot

## Known form details

| Page | Method | Action | Hidden fields | JS dependency |
| --- | --- | --- | --- | --- |
| Order Made login | `POST` | `/kanri/login` | `_token` | JS bundle present, but login itself is standard form submit |
| TS-League login | `POST` | `../../pass/pass_check.php` | `url=order-made` | No JS observed on the login page |
| Order Made game edit/view | `GET` after authenticated login | `/kanri/game/:id` | Laravel session + CSRF on login page | Batter game page itself rendered as normal HTML |
| TS-League batter entry/save | `POST` | `gameof_edit.php` -> `gameof_edit_complete.php` -> `complete.php` | `Id`, `GameDay`, `MemberScoreOfGameYear`, `GameTypeId`, `GroupLeagueType`, `bcount` | No XHR observed during page discovery; standard form flow |

## Required authenticated discovery still pending

These items still deserve continued observation as more matches are tested:

1. Whether the target site recalculates summary values or requires explicit `runs/errors/steals` inputs in edge cases
2. Whether row 10 must remain blank or must be normalized explicitly
3. Whether there are match types whose form structure differs from the `gameof_edit.php` page observed here

## Minimum user input identified so far

Confirmed:

- Source game ID or source game URL
- Execution mode: `dry-run` or `commit`

Now confirmed as useful target-game identification inputs:

- `targetGameKey`
- `targetGameDate`
- `targetVenue`
- `targetOpponent`

Observed evidence:

- The game-list row text includes league marker, month/day, start time, venue, team names, and score.
- Matching against the row text is more reliable than trying to infer from anchors, because batting edit uses POST forms rather than links.

Implementation implication:

- The first UI/API version should accept a free-form `targetGameKey` plus optional structured hints.
- Dry-run should surface the exact target-match criteria used.
- Commit should fail closed if the game match confidence is insufficient.

## Failure patterns already observable

- Missing or expired source session redirects to `/kanri/login`
- Missing or expired target session redirects to `logout.php` and yields the timeout page
- Missing local secrets will block both authenticated discovery and live execution
- Protected DOM can change without notice; selector strategies must keep ordered candidates rather than a single hard-coded selector
- TS-League batting edit is form-name-pattern driven rather than header-text driven

## Safety constraints derived from discovery

- Order Made appears to require authenticated access to the sample game URL, so source-side secrets or a reusable authenticated session are likely required.
- TS-League is an older PHP application with session-cookie login; Playwright should treat full-page form submits and redirects as the primary path.
- The target batting form is indexed by lineup row and plate-appearance slot, not by a simple stat table.
- Because save flow and required summary-field completeness are still unconfirmed, `commit` should remain fail-closed unless every required mapping is resolved.
- Dry-run should remain the default validation path and preserve screenshots/HTML even when authentication fails.

## Artifact plan

The application should save the following under `artifacts/` per job:

- Step screenshots before and after each critical navigation or submit
- Current page HTML on failure
- Current URL, last completed step, and network-level error summary
- Final preview payload for dry-run

## Open questions

1. Does `gameof_edit_complete.php` save immediately or show a confirmation page?
2. Can `runs` and `errors` be derived server-side if left unchanged, or must the client supply them explicitly?
3. Is row 10 in `bcount=10` a substitute slot that must be normalized for all games?
4. Can existing entered batter stats be safely detected before overwrite in cases where some slots are already non-zero?
