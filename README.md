# memo-clipper

スマホから X (Twitter) の投稿を Obsidian にマークダウンで保存する PWA。

## 機能

- X の URL を貼り付けてツイート内容を取得
- マークダウン形式に自動変換（frontmatter 付き）
- Obsidian URI スキームで直接保存
- **Web Share Target API** 対応 — X アプリの「共有」から直接起動
- PWA としてホーム画面に追加可能
- Vault 名・保存フォルダを設定可能（ローカル保存）

## 使い方

### セットアップ

1. GitHub Pages や Vercel 等で静的サイトとしてデプロイ
2. スマホのブラウザで開く
3. 「ホーム画面に追加」する

### クリップ手順

**方法 A: 共有から（推奨）**
1. X アプリで投稿を開く
2. 共有ボタン → 「Memo Clipper」を選択
3. 自動で内容が取得される
4. 「Obsidian に保存」をタップ

**方法 B: URL 貼り付け**
1. Memo Clipper を開く
2. X の URL を貼り付け
3. 「取得する」をタップ
4. 「Obsidian に保存」をタップ

## デプロイ

静的ファイルのみで構成されているので、任意の静的ホスティングにデプロイできます。

```bash
# GitHub Pages の場合
git push origin main
# リポジトリ Settings → Pages → Source: main branch
```

> **注意**: Share Target API を使うには HTTPS が必要です。

## 技術構成

- **フロントエンド**: Vanilla HTML/CSS/JS（フレームワーク不要）
- **ツイート取得**: [FxTwitter API](https://github.com/FixTweet/FxTwitter)（CORS 対応の公開 API）
- **保存**: Obsidian URI スキーム (`obsidian://new`)
- **オフライン**: Service Worker によるキャッシュ
- **共有受信**: Web Share Target API
