# ミヤマ工業動画マニュアル

TeachMeBiz や Tebiki のように、現場担当者が動画をもとに手順書を作成し、承認後に閲覧公開できる業務アプリのプロトタイプです。

## 主な機能

- 動画マニュアル一覧、検索、新規作成
- 動画サムネイル、チャプター手順、タグ、部署の編集
- 下書き、承認待ち、承認済み、公開中のワークフロー
- 承認者、レビュー条件、公開ビューの確認
- Firebase Auth / Firestore / Storage 接続用の初期設定

## Firebase 想定構成

- `manuals`: マニュアル本体、手順、タグ、状態
- `approvalRequests`: 承認依頼、承認者、コメント、承認日時
- `viewLogs`: 閲覧者、閲覧日時、理解度、未受講管理
- `manualVideos`: Firebase Storage 上の動画、サムネイル

## 起動

```bash
npm install
npm run dev
```

開発中は `index.html` を直接開かず、`npm run dev` の画面に表示される `http://localhost:5173/` をブラウザで開いてください。

ファイルを直接開いて確認したい場合は、先に次を実行してから `dist-app/index.html` を開きます。

```bash
npm run build
```

Firebase を使う場合は `.env.example` をもとに `.env` を作成し、Firebase Web App の設定値を入れてください。
