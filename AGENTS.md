# Project: TS-League 野手成績自動反映ツール

## Goal

Order Made 側の試合スコアページから **野手成績のみ** を取得し、TS-League の管理画面に自動反映するローカル常駐アプリを実装する。

最終的なユーザー操作は **Webブラウザだけで完結** させること。
ユーザーは必要情報を入力して実行ボタンを押すだけにする。
実処理はバックグラウンドジョブとして非同期に動かすこと。

## Business Context

- ソース例:
  - `https://ordermade.sakura.ne.jp/kanri/game/37`
- ターゲットログイン:
  - `https://ts-league.com/team/order-made/login.php`
- ターゲット試合一覧:
  - `https://ts-league.com/team/order-made/game.php`
- 目的:
  - Order Made 側の試合データを読み取り
  - TS-League 側の対象試合に対して
  - **野手成績だけ** を入力・保存する

## Scope

### In scope

- ソースページのスクレイピング
- ターゲットサイトへのログイン
- ターゲット試合の特定
- 野手成績入力フォームの特定
- 野手成績の自動入力
- 実行結果の表示
- 失敗時のログ、スクリーンショット保存
- 再実行しやすい設計
- ローカルWeb UI
- 非同期ジョブ実行
- ローカルPC上での運用
- Cloudflare Tunnel などでの公開を前提にした最低限の安全対策

### Out of scope

- 投手成績
- 対戦日程の自動作成
- 本格的な分散ジョブ基盤
- モバイルアプリ
- CAPTCHA 回避
- 利用規約違反の回避策
- 不正アクセス的な実装
- クラウドネイティブな大規模構成

## Product Requirements

### UX requirements

- セットアップ後、ユーザーはターミナル操作を基本不要にすること
- ユーザーはブラウザで以下を入力できること
  - ソース試合 ID またはソース試合 URL
  - ターゲット試合を識別するための情報
  - dry-run / commit の切り替え
- 実行後は即座にジョブIDが払い出され、画面上で進捗確認できること
- 完了後に成功/失敗/警告を表示すること
- 失敗時は原因の候補を表示すること
- 画面リロード後も直近ジョブ履歴を見られること

### Operational requirements

- 家のPCで動作すること
- ローカルサーバとして起動できること
- Cloudflare Tunnel 等で公開しやすいように、アプリは `localhost` バインド前提で実装すること
- 外部公開する場合を考慮し、アプリ側にも認証レイヤを追加できる構造にすること
- TS-League の認証情報はローカル secrets に保存し、Git に含めないこと

## Architecture Constraints

以下の優先順位で実装すること。

1. **Node.js + TypeScript**
2. **Playwright** をブラウザ操作の主手段にする
3. Web UI は最小でよい
4. バックエンドは **Express** などの軽量構成を優先する
5. 永続化は最初は **JSON ファイル or SQLite** で十分
6. 重いフレームワークは不要
7. 初期版は単一プロセスでよい
8. ユーザーの通常操作はブラウザのみで完結させる

## Secrets Policy

- 認証情報を `AGENTS.md`、ソースコード、README に直書きしてはいけない
- 認証情報は以下のいずれかに保存すること
  - `.env.local`
  - `secrets/*.json`
  - OS の secure store
- `*.local.*` `secrets/` `.env*` は `.gitignore` に含めること
- サンプルとしては `.example` ファイルのみコミットすること

推奨 secrets ファイル例:

- `secrets/ts_league.local.json`

期待フォーマット例:

```json
{
  "tsLeague": {
    "loginUrl": "https://ts-league.com/team/order-made/login.php",
    "gameListUrl": "https://ts-league.com/team/order-made/game.php",
    "username": "SET_LOCALLY",
    "password": "SET_LOCALLY"
  }
}
```

## What Codex must do first

実装を急がず、まず以下を調査してから設計に入ること。

1. ソースページのDOM構造を確認する
2. ソース側の野手成績テーブルを抽出可能か確認する
3. ターゲットログイン後の導線を確認する
4. ターゲット試合一覧から対象試合へどう遷移するか確認する
5. 野手成績入力フォームの構造を確認する
6. 保存ボタン、確認画面、完了画面の有無を確認する
7. JavaScript描画か、通常HTMLフォームかを確認する
8. XHR / fetch / form post のどれが使われているかを確認する
9. 入力項目名とソース項目の対応表を作る
10. 自動化に必要な最小ユーザー入力を特定する

## Required discovery outputs

実装前に少なくとも以下を作成すること。

- `docs/discovery.md`
  - 画面遷移
  - ページURL
  - 主要セレクタ候補
  - フォームの送信方式
  - 想定される失敗パターン
- `docs/mapping.md`
  - ソース項目 → ターゲット項目の対応表
  - 不明項目
  - 欠損時の扱い
- `artifacts/`
  - 主要画面のスクリーンショット
  - 失敗時HTMLダンプ
  - 失敗時スクリーンショット

## Implementation target

MVP として以下を実装すること。

### 1. Web UI

最低限以下の画面を持つこと。

- トップ画面
  - ソース試合IDまたはURL入力
  - ターゲット試合識別情報入力
  - dry-run / commit 切替
  - 実行ボタン
- ジョブ詳細画面
  - ステータス
  - 進捗ログ
  - 抽出した野手成績のプレビュー
  - 入力対象フォームのプレビュー
  - 実行結果
  - エラー詳細

### 2. Backend API

最低限以下を用意すること。

- `POST /api/jobs`
  - ジョブ作成
- `GET /api/jobs/:id`
  - ジョブ状態取得
- `GET /api/jobs`
  - 直近ジョブ一覧
- `POST /api/jobs/:id/retry`
  - 再実行
- `GET /api/health`
  - ヘルスチェック

### 3. Worker

- ジョブを非同期に処理すること
- 初期版は in-process queue でよい
- 二重実行を避けるロックを持つこと
- 同一試合の重複投入を防げる設計にすること

### 4. Browser automation

- Playwright を使用すること
- ログイン処理を共通化すること
- セッション再利用を検討すること
- ただしセッション切れ時は自動再ログインできるようにすること
- セレクタは1個に決め打ちせず候補を持つこと
- 重要操作前後でスクリーンショットを取れるようにすること

## Data model

最低限、以下の概念を持つこと。

### Job

- id
- sourceGameId
- sourceUrl
- targetGameKey
- mode (`dry-run` or `commit`)
- status (`queued`, `running`, `succeeded`, `failed`, `cancelled`)
- createdAt
- startedAt
- finishedAt
- logs
- resultSummary
- errorSummary

### BatterStat

最低限以下を扱える設計にすること。
実際のターゲット入力欄に合わせて拡張可。

- playerName
- battingOrder
- position
- plateAppearances
- atBats
- runs
- hits
- rbi
- doubles
- triples
- homeRuns
- walks
- hitByPitch
- strikeouts
- sacrificeBunts
- sacrificeFlies
- stolenBases
- errors

注意:

- 実際のソースやターゲットに項目が無い場合は、無理に埋めず `null` を許容すること
- 不明な列は discovery で明示すること
- ハードコードで `game/37` 専用にしないこと

## Mapping rules

- まずソース側の野手成績を構造化データに正規化する
- 次にターゲット側のフォーム構造にマッピングする
- プレイヤー名一致だけに依存しすぎないこと
- 可能なら打順、守備位置、既存登録順なども補助キーに使うこと
- 同姓同名や表記揺れに備えて正規化関数を持つこと
- マッピングできない選手は一覧表示してユーザーに分かるようにすること
- 送信前に「入力予定値一覧」を確認できるようにすること

## Validation rules

### Dry-run mode

- 実際の保存はしない
- 取得したソース成績
- ターゲットフォームの対応先
- 入力予定値
- 警告一覧
  を表示すること

### Commit mode

- 入力前に必ず最終プレビューを生成すること
- 自動実行でも内部的にはプレビュー結果を保持すること
- 保存後は成功判定を行うこと
- 成功判定は URL、完了文言、保存後画面など複数条件で行うこと

## Failure handling

以下のケースを必ず考慮すること。

- ログイン失敗
- セッション切れ
- 試合が見つからない
- 野手成績テーブルが見つからない
- フォーム構造変更
- プレイヤー名不一致
- 一部項目しか埋められない
- 保存確認画面が出る
- 保存完了判定不能
- 途中でネットワーク失敗
- 二重送信の危険
- 既に入力済みデータの上書きリスク

失敗時は以下を必ず残すこと。

- エラーメッセージ
- 現在URL
- 直前ステップ
- スクリーンショット
- ページHTML
- ジョブログ

## Security and safety rules

- CAPTCHA、2FA、追加認証、アクセス制限に遭遇したら回避実装はしないこと
- 想定外のページに遷移したら停止して報告すること
- 保存系操作は commit モード時のみ実行すること
- 外部公開時はアプリ自体に認証を付けられる構造にすること
- Cloudflare Tunnel 公開だけで安全だと思わないこと
- target / source 双方の利用規約や運用ルールに反しそうなら注意喚起すること

## Coding rules

- TypeScript は strict mode を前提にすること
- 例外処理を省略しないこと
- ログを十分に出すこと
- タイムアウト、リトライ、待機条件を明示すること
- マジックナンバーを避けること
- DOMセレクタは定数・設定に寄せること
- 失敗時の再現性を高めること
- テストしやすいようにスクレイピング部、変換部、ブラウザ操作部を分離すること

## Testing strategy

最低限、以下を行うこと。

- ユニットテスト
  - テーブル解析
  - 名前正規化
  - マッピング
- 疑似統合テスト
  - 保存を伴わない dry-run
- 手動確認用スクリプト
  - ログイン確認
  - 試合一覧取得確認
  - ソース成績抽出確認
  - ターゲット入力欄抽出確認

## Directory expectations

構成案。必要に応じて微修正可。

```text
.
├─ AGENTS.md
├─ package.json
├─ tsconfig.json
├─ .gitignore
├─ .env.example
├─ secrets/
│  └─ ts_league.local.json.example
├─ artifacts/
├─ docs/
│  ├─ discovery.md
│  └─ mapping.md
├─ src/
│  ├─ app/
│  ├─ api/
│  ├─ worker/
│  ├─ domain/
│  ├─ infra/
│  ├─ playwright/
│  └─ utils/
└─ tests/
```

## Definition of done

以下を満たしたら MVP 完了。

1. ユーザーがブラウザ画面からジョブを起動できる
2. ソース試合から野手成績を抽出できる
3. ターゲット試合を特定できる
4. dry-run で入力予定値を確認できる
5. commit で実際に入力・保存できる
6. 失敗時に原因調査用アーティファクトが残る
7. README を見ればローカル起動できる
8. 認証情報がリポジトリに含まれない
9. 少なくとも 1 試合分で実証できる
10. 特定の1試合専用実装ではなく再利用可能な形になっている

## Priorities

優先順位は以下。

1. 正しく調査する
2. 保存事故を避ける
3. dry-run を強くする
4. 実装を簡潔に保つ
5. Web UI だけで運用できるようにする
6. 将来的な保守性を確保する

## Explicit instructions to Codex

- まず discovery と mapping を作ってから実装すること
- 不明点をコードでごまかさず、docs に明記すること
- 画面構造が不明なまま保存処理を書かないこと
- まず dry-run を完成させ、その後 commit に進むこと
- サイト構造が JavaScript 依存かどうかを必ず確認すること
- 可能なら API / form post / hidden input を観察して、DOM操作より堅い方法を優先すること
- ただし最終的な主手段は Playwright ベースでまとめること
- 1回通ったら終わりではなく、再実行性と失敗解析性を担保すること
- ユーザーの日常操作を CLI 前提にしないこと