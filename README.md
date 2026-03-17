# スカイツリーグ 野手成績自動反映ツール

Order Made の試合ページから野手成績を取得し、TS-League 管理画面へ反映するローカル常駐アプリです。通常操作はブラウザだけで完結する想定です。

## 現状

- `docs/discovery.md` と `docs/mapping.md` を先に作成済みです。
- `dry-run` を先に通す構成です。
- `commit` は安全側で実装しており、マッピングや保存結果を確認できない場合は失敗させます。
- 2026-03-17 に live site で `3/7/9:00-光が丘公園` の保存フローを確認済みです。
- 保存後は `complete.php` の完了画面検知だけで終わらず、同じ試合を再度開いて反映値を検証します。

## セットアップ

1. 依存関係を入れる

```bash
npm install
```

2. Playwright ブラウザを入れる

```bash
npx playwright install chromium
```

3. example からローカル secrets を作る

```bash
cp secrets/order_made.local.json.example secrets/order_made.local.json
cp secrets/ts_league.local.json.example secrets/ts_league.local.json
cp secrets/notifications.local.json.example secrets/notifications.local.json
```

4. `.env.example` を必要に応じて反映する

5. 開発サーバを起動する

```bash
npm run dev
```

6. ブラウザで `http://127.0.0.1:3000` を開く

## Secrets

認証情報はコミットしません。以下をローカルで作成してください。

- `secrets/order_made.local.json`
- `secrets/ts_league.local.json`
- `secrets/notifications.local.json`

`secrets/notifications.local.json` は任意です。設定すると LINE Bot push 通知を送ります。

```json
{
  "line": {
    "apiUrl": "https://api.line.me/v2/bot/message/push",
    "accessToken": "SET_LOCALLY",
    "recipientId": "SET_LOCALLY"
  }
}
```

通知タイミング:

- ジョブ開始時
- ジョブ完了時
- ジョブ失敗時

通知内容:

- 試合日
- 対戦相手
- 球場
- 実行モード
- ジョブ ID
- 完了時の件数要約または失敗内容

## 画面

- トップ画面
  - ソース試合 ID または URL
  - 対象試合の識別キーワード
  - 任意の対象日 / 対戦相手 / 球場
  - `dry-run` / `commit` 切替
  - 日本語ベースの説明と注意書き
- ジョブ詳細画面
  - 状態
  - 実行結果
  - 進捗ログ
  - ソース成績プレビュー
  - ターゲットフォームの現在値
  - マッピング結果
  - エラー要約
  - artifact 一覧

## API

- `GET /api/health`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs`
- `POST /api/jobs/:id/retry`

## Manual check scripts

- `npm run discover:auth -- --source-game-id 37 --target-form-index 0`
- `npm run check:source -- --source-url https://ordermade.sakura.ne.jp/kanri/game/37`
- `npm run check:target-login`
- `npm run check:target-form -- --target-game-key "3/7 光が丘 Re" --target-game-date 2026-03-07 --target-venue 光が丘公園`

## 注意

- Order Made の sample game URL は 2026-03-17 時点では未認証だとログイン画面へリダイレクトされました。source 側にもローカル secrets が必要な前提で実装しています。
- TS-League の保存フローは 2026-03-17 に live で確認済みです。`gameof_edit_complete.php` へ POST 後、`complete.php` に遷移して `無事に登録が完了しました。` が表示されました。
- それでも `commit` は fail-closed です。既存値との衝突や保存後再検証で不整合が出た場合は失敗として停止します。
- artifact はローカルで `/artifacts/<job-id>/<file>` としてブラウザから参照できます。
- CAPTCHA、2FA、想定外ページに遭遇したら停止する方針です。
