# Discovery

Observed on 2026-03-17 and updated on 2026-03-21. This document now includes authenticated discovery using local-only secrets supplied during the session.

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
| グラウンドトップ | `https://kouen.sports.metro.tokyo.lg.jp/web/index.jsp` | ログイン導線はトップページの `ログイン` ボタンから辿るのが安定した。 | Confirmed |

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
- The page has a season switcher `select` above the result rows.
  - Selected option on 2026-04-19:
    - value: `/team/order-made/game.php?type=1`
    - label: `2026シーズンの結果編集をする`
  - Alternate season observed:
    - value: `/team/order-made/game.php?type=1&year=2025`
    - label: `2025シーズンの結果編集をする`
- As of 2026-04-19, `https://ts-league.com/team/order-made/game.php?type=1&year=2025` showed `2025シーズンの結果編集` and contained 2026-04-19 fixtures, so the editing season cannot be inferred safely from the match date alone.
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

### TS-League empty-lineup variant confirmed on 2026-03-21

- Target game `2026-03-21 プレアデス` opened the same `gameof_edit.php` form shape, but every lineup row started empty:
  - `bcount=9`
  - `select[name="MemberScoreOfUserId[ROW]"]` had selected value `0`
  - selected player label was `-`
  - selected position label was `-`
- The per-row player select still exposed the full registered roster, including:
  - `[4]伊藤`
  - `[6]津村`
  - `[10]早河`
  - `[17]安楽`
  - `[19]岩本`
  - `[33]坂田`
  - `[61]戸嶋`
  - `[77]山本`
  - `[00]助っ人1`
- This means empty rows are writable, but automation must explicitly select:
  - `MemberScoreOfUserId[ROW]`
  - `MemberScoreOfSyubi[ROW]`
  before filling batting result controls.

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

### TS-League live save flow confirmed on 2026-03-21 for an initially empty lineup

- Source game `Order Made game/38` was mapped to target game `2026-03-21 プレアデス`.
- All 9 target rows began with no selected player and no selected position.
- After selecting player + position first, then filling stats + plate appearances, save completed successfully.
- Re-open verification succeeded with the expected lineup:
  - row 1 `[4]伊藤`
  - row 2 `[6]津村`
  - row 3 `[77]山本`
  - row 4 `[17]安楽`
  - row 5 `[10]早河`
  - row 6 `[33]坂田`
  - row 7 `[19]岩本`
  - row 8 `[61]戸嶋`
  - row 9 `[00]助っ人1`

### TS-League pitcher edit page

- The pitcher-edit navigation on the authenticated game list is a normal HTML `POST` form:
  - action: `gamedf_edit.php`
  - hidden inputs observed on live rows:
    - `Id`
    - `MemberScoreDfGameYear`
    - `MemberScoreDfGameYear2`
    - `GameDay`
    - `GameTypeId`
    - `CmtCk`
- The pitcher edit page itself is also a normal HTML form:
  - page URL: `https://ts-league.com/team/order-made/gamedf_edit.php`
  - method: `post`
  - action: `gamedf_edit_complete.php`
  - hidden inputs observed:
    - `bcount`
    - `Id`
    - `GameDay`
    - `GameTypeId`
    - `MemberScoreDfGameYear`
    - `MemberScoreDfGameYear2`
    - `GroupLeagueType`
- Repeated pitcher row controls observed live:
  - `select[name="MemberScoreDfUserId[ROW]"]`
  - `input[name="MemberScoreDfIning[ROW]"]`
  - `input[name="MemberScoreDfKaisu[ROW]"]`
  - `input[name="MemberScoreDfJiseki[ROW]"]`
  - `input[name="MemberScoreDfSiten[ROW]"]`
  - `input[name="MemberScoreDfDatusansin[ROW]"]`
  - `input[name="MemberScoreDfSikyu[ROW]"]`
  - `input[name="MemberScoreDfSisikyu[ROW]"]`
  - `input[name="MemberScoreDfHianda[ROW]"]`
  - `input[name="MemberScoreDfHiHr[ROW]"]`
  - `input[name="MemberScoreDfBoutou[ROW]"]`
  - `input[name="MemberScoreDfBok[ROW]"]`
  - `select[name="MemberScoreDfsyouhai[ROW]"]`
  - `select[name="MemberScoreDfKantou[ROW]"]`
- On the empty `2026-03-21 プレアデス` pitcher form:
  - `bcount=1`
  - row 1 was blank
  - a visible `追加` control existed for increasing row count

### Public TS-League game page as pitcher source

- The public result page URL pattern is:
  - `https://ts-league.com/game/<year>/index.php?gameid=<Id>`
- Example confirmed live:
  - `https://ts-league.com/game/2026/index.php?gameid=14248`
- The public page contains:
  - inning score table
  - both teams' batting detail tables
  - both teams' pitcher summary tables
- At least on `2026-03-07 Ｒｅ`, the public batting detail is rendered as one combined `打撃成績一覧` table:
  - ORDERMADE batting rows
  - `先攻` / `後攻` score rows
  - a repeated batting header row
  - opponent batting rows
- For pitcher automation, the usable source is:
  - the opponent batting detail table
  - plus the inning score table for opponent runs by inning
- On `2026-03-07 Ｒｅ`, opponent batting rows were present and consistent with the already-saved pitcher totals.
- On `2026-03-21 プレアデス`, the page still showed `まだ試合情報が登録されていません。` and the opponent batting table was not present.
- This means pitcher automation must fail closed when the public page does not yet expose opponent batting detail.

## グラウンド 抽選 discovery

Observed on 2026-04-08 with the sample account supplied locally.

### 画面遷移

1. `GET /web/index.jsp`
2. `#btn-login` から `rsvWTransUserLoginAction.do`
3. `#userId`, `#password`, `#btn-go` でログイン
4. ログイン後ホーム `rsvWUserAttestationLoginAction.do` から `抽選申込み`
5. `lotWOpeLotSearchAction.do` の抽選分類一覧で `doLotEntry("<分類コード>")` を実行
6. `lotWOpeTransLotInstSrchVacantAction.do` で公園 / 施設 / 利用日 / コマ選択
7. `#btn-go` で `lotWInstTempLotApplyAction.do`
8. 確認画面で `applyHopeNo` に `1件目 / 2件目` を指定
9. `#btn-go` で最終申込み送信
10. ログアウトして次アカウント

### 主要 URL

- トップ: `https://kouen.sports.metro.tokyo.lg.jp/web/index.jsp`
- ログイン: `https://kouen.sports.metro.tokyo.lg.jp/web/rsvWTransUserLoginAction.do`
- 抽選分類一覧: `lotWOpeLotSearchAction.do`
- 空き検索 / コマ選択: `lotWOpeTransLotInstSrchVacantAction.do`
- 申込み確認: `lotWInstTempLotApplyAction.do`
- ログアウト action: `gRsvWTransUserAttestationEndAction`

補足:

- ログイン後ホームにも `#daystart-home` などの空き検索フォームがあるが、抽選申込み workflow では使わない。
- 抽選は必ず `抽選申込み -> 抽選分類一覧 -> doLotEntry("<分類コード>")` の順で遷移するのが安定した。

### 主要セレクタ候補

- ログインボタン: `#btn-login`
- 利用者番号: `#userId`
- パスワード: `#password`
- ログイン送信: `#btn-go`
- 公園 select: `#bname`
- 施設 select: `#iname`
- 利用日テーブル: `#usedate-table`
- 次週: `#next-week`
- 前週: `#last-week`
- 申込み番号 select: `#apply`

### 競技分類コード

- `100`: 野球
- `110`: 野球（小）
- `120`: テニス（ハード）
- `130`: テニス（人工芝）
- `140`: サッカー・ラグビー・ホッケー
- `150`: サッカー（小）

### コマ選択の観測結果

- テーブルセル内に hidden input が埋まっている。
- 利用日: `selectUseYMD`
- コマ番号: `selectKomaNo`
- 開始時刻: `selectStime`
- 終了時刻: `selectEtime`
- 面情報: `selectField`
- 同じ日付内で連続するコマをクリックして範囲選択する作り。

### 1件目 / 2件目の観測結果

- 申込み確認画面の `select#apply[name="applyHopeNo"]` で選択する。
- 観測できた option:
  - `0-0`: 選択してください
  - `1-1`: 申込み1件目
  - `2-1`: 申込み2件目
- つまり UI では `申込み番号` を明示的に持たせる必要がある。

### 複数アカウント運用の観測結果

- ログイン後は同一アカウントで複数件を続けて処理できる。
- したがって自動化の基本ループは
  - 1アカウントで申込み一覧を上から順に全部処理
  - ログアウト
  - 次アカウントへ移行
  の順が自然。
- 野球、サッカーなど競技が違っても、同一アカウント内でそのまま継続処理する。

### 想定失敗パターン

- ログイン状態が切れてトップへ戻る
- 公園 / 施設名が option と一致しない
- 指定日が表示期間に無い
- 指定時間帯の連続コマが取れない
- `1件目 / 2件目` の希望枠が選べない
- 完了画面の文言が画面差分で取りづらい

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
- Whether partial-inning pitcher allocation can be reconstructed safely from the public batting table when a pitcher changes mid-inning
- Whether the `追加` behavior on `gamedf_edit.php` differs by game type or league settings

## Known form details

| Page | Method | Action | Hidden fields | JS dependency |
| --- | --- | --- | --- | --- |
| Order Made login | `POST` | `/kanri/login` | `_token` | JS bundle present, but login itself is standard form submit |
| TS-League login | `POST` | `../../pass/pass_check.php` | `url=order-made` | No JS observed on the login page |
| Order Made game edit/view | `GET` after authenticated login | `/kanri/game/:id` | Laravel session + CSRF on login page | Batter game page itself rendered as normal HTML |
| TS-League batter entry/save | `POST` | `gameof_edit.php` -> `gameof_edit_complete.php` -> `complete.php` | `Id`, `GameDay`, `MemberScoreOfGameYear`, `GameTypeId`, `GroupLeagueType`, `bcount` | No XHR observed during page discovery; standard form flow |
| TS-League pitcher entry/save | `POST` | `gamedf_edit.php` -> `gamedf_edit_complete.php` -> `complete.php` | `Id`, `GameDay`, `MemberScoreDfGameYear`, `GameTypeId`, `GroupLeagueType`, `bcount` | No XHR observed during page discovery; standard form flow |

## Required authenticated discovery still pending

These items still deserve continued observation as more matches are tested:

1. Whether the target site recalculates summary values or requires explicit `runs/errors/steals` inputs in edge cases
2. Whether row 10 must remain blank or must be normalized explicitly
3. Whether there are match types whose form structure differs from the `gameof_edit.php` page observed here
4. Whether there are match types whose `gamedf_edit.php` structure differs from the observed pitcher form

## Minimum user input identified so far

Confirmed:

- Source game ID or source game URL
- Execution mode: `dry-run` or `commit`

Now confirmed as useful target-game identification inputs:

- `targetGameKey`
- `targetGameDate`
- `targetVenue`
- `targetOpponent`
- For pitcher mode: manual pitcher allocation text such as `安楽 3回`

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
- TS-League pitcher edit is also form-name-pattern driven and may require row expansion via `追加`
- Public opponent batting data may be absent even when the target edit form exists

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
5. Can partial-inning pitcher changes be reconstructed safely enough for automatic stat splitting?
6. Are `暴投`, `ボーク`, and `完投系` ever derivable from public batting detail alone, or must they remain manual? `自責` and `勝敗` are now estimated, but must still be manually verified.
