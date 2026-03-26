# Refra

Refraは、社内チーム向けのリファレンス素材（画像・動画）を共有・閲覧・比較・コメントできるWebアプリです。

## 主な特徴
- 完全サーバーレス構成（S3/LocalStack、Cognito認証）
- フロントエンド: Vite + React + TypeScript
- ダーク/ライトテーマ対応、レスポンシブUI
- アセットのアップロード・詳細・比較・コメント機能
- フォルダ・タグ管理、仮想スクロール
- テスト: Vitest（ユニット/コンポーネント）、Playwright（E2E）

## 開発環境
- Docker ComposeでLocalStackを起動し、S3/Cognitoをエミュレート
- `.env`で環境変数を設定
- `npm install`で依存パッケージ導入
- `npm run dev`でローカル開発サーバ起動

## テスト
- `npm run test`（ユニット/コンポーネント）
- `npm run e2e`（E2E: Playwright）

## ディレクトリ構成
- `src/` ... フロントエンド実装
- `docker-compose.yml` ... LocalStack構成
- `to_human.md` ... 人間向け質問/要望記載（gitignore済み）
- `spec.md` ... 仕様書

## 注意事項
- 環境依存パッケージは極力Dockerで吸収。追加インストールが必要な場合は`to_human.md`に記載。
- 実装・進捗管理はGitHub Issueで行い、完了タスクは随時Close。
- **認証・認可は未実装です。** 誰でもアクセス・操作できる状態のため、機密性の高い素材の共有には使用しないでください。

## ライセンス
MIT License
