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

4. 必要なら環境変数を設定する

このアプリは `.env` を自動読込しません。`HOST` や `APP_BASIC_AUTH_*` を変えたい場合は、シェルで `export` するか systemd の `EnvironmentFile` で渡してください。何も指定しなければ `127.0.0.1:3000` で起動します。

5. 開発サーバを起動する

```bash
npm run dev
```

6. ブラウザで `http://127.0.0.1:3000` を開く

## Ubuntu 24.04 へのデプロイ

家の PC や Linux サーバへ常駐させるときの手順です。実運用では `localhost` バインドのまま動かし、必要なら Cloudflare Tunnel やリバースプロキシを前段に置いてください。

### 1. Node.js / npm / Git を入れる

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm git
```

### 2. GitHub から取得する

```bash
mkdir -p /home/yamamoto/dev
cd /home/yamamoto/dev
git clone https://github.com/yamamotoshuma/ts-league-auto-input.git
cd ts-league-auto-input
```

### 3. 依存関係と Playwright を入れる

```bash
npm ci
npx playwright install --with-deps chromium
```

### 4. secrets と環境変数ファイルを用意する

```bash
cp .env.example .env.production
cp secrets/order_made.local.json.example secrets/order_made.local.json
cp secrets/ts_league.local.json.example secrets/ts_league.local.json
cp secrets/notifications.local.json.example secrets/notifications.local.json
chmod 600 .env.production secrets/*.json
```

- `.env.production` は systemd から読み込みます
- `HOST=127.0.0.1` のまま運用してください
- 外部公開する場合は `APP_BASIC_AUTH_USER` と `APP_BASIC_AUTH_PASSWORD` も設定してください
- `secrets/*.json` には実値を入れます。Git には含めません

### 5. systemd サービスを作る

`/etc/systemd/system/ts-league-auto-input.service`

```ini
[Unit]
Description=TS-League batter sync app
After=network.target

[Service]
Type=simple
User=yamamoto
Group=yamamoto
WorkingDirectory=/home/yamamoto/dev/ts-league-auto-input
EnvironmentFile=/home/yamamoto/dev/ts-league-auto-input/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

反映:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ts-league-auto-input
sudo systemctl status ts-league-auto-input
```

### 6. ヘルスチェック

```bash
curl http://127.0.0.1:3000/api/health
```

ブラウザ確認:

- 同じマシンから `http://127.0.0.1:3000`
- 別端末から見る場合は SSH port forward や Cloudflare Tunnel を使う

### 7. 更新手順

```bash
cd /home/yamamoto/dev/ts-league-auto-input
git pull
npm ci
npm run build
sudo systemctl restart ts-league-auto-input
sudo systemctl status ts-league-auto-input
```

ログ確認:

```bash
journalctl -u ts-league-auto-input -n 200 --no-pager
```

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
