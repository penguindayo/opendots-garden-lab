# OpenDots Garden Lab

園芸博向けの小さな公開ツールを、Macの電源が切れている間も制作・テストする公開リポジトリです。対象はこのリポジトリ自身の開発だけです。

4時間ごとに公開情報を調べ、予算・準備チェック・展示見学の時間割という3案を実装して比較します。標準Ubuntu runner内の [Ollama](https://docs.ollama.com/linux) で [`qwen3.5:0.8b`](https://ollama.com/library/qwen3.5) を動かせた場合は、追加の1案をJSONで生成します。モデル取得・生成・構造検査の失敗時には、失敗を明記して3案を残します。

AIは1回の制作につき最大1呼び出し・1600出力token・3分、思考出力なし。APIキーや有料AIへの切り替えはありません。Ollamaは公式v0.40.2配布をSHA-256検証し、runnerの一時領域へ置きます。モデル・ログをリポジトリやActions cache/artifactsへ保存しません。

公開ソースは次の7件だけです。Cookie・認証・非公開の返信は扱わず、リダイレクトは追いません。大きなページは先頭64KiBの範囲だけを調べます。

- https://pengu.info
- https://pengu.info/bbs
- https://x.com/penguin_expo
- https://x.com/penguin_expo_
- https://x.com/Trioxygen_
- https://expo2027yokohama.or.jp/about/overview/
- https://expo2027yokohama.or.jp/news/detail/001555.html

[Ollama公式のstructured outputs](https://docs.ollama.com/capabilities/structured-outputs)に従い、JSON schemaを`format`へ指定します。AI案は短いtitle/summaryと2,000 bytes以下のHTML1枚に限定します。失敗理由は `model_unavailable` / `truncated` / `json_invalid` / `schema_invalid` / `html_invalid` の固定分類だけをレビューへ残し、不正な生応答やログを保存しません。

手動専用の `smoke-ai.yml` は、本番と同じモデルのCI結合テストです。公開repoの標準Linux runner・同時1・10分上限で、モデル呼び出しは最大1回・3分です。生成物を制作・公開せず、`results/model-check.json` へ `{valid:boolean,reason:固定分類}` だけを記録します。成功時のreasonは`ok`です。モデル応答を保存・実行せず、本番ジョブの6件/日や既存成果物も変更しません。チェック失敗はworkflow失敗として報告します。

`results/public-<UTCの4時間枠整数>/artifact.json` と `files/` に成果物を保存します。`results/status.json` は最新32件のメタデータです。古いファイルは消しません。最大6件/UTC日・同時1実行・1workflow20分で、同じ時間枠の再実行は重複制作しません。GitHubのスケジュールは遅延・無効化される場合があり、24時間の連続計算を保証しません。手動の `workflow_dispatch` でも同じ上限が適用されます。

生成物は未検証の下書きです。CIは信頼済みの制作コードと純粋関数をテストし、成果物の構造・容量・保存内容を検査します。**AI生成コードは実行しません。** `review.md` は検査内容と未確認点を記録します。Mac復帰後、隔離取得してソース確認とブラウザ検証を行ってから利用します。

このworkflowは `penguindayo/opendots-garden-lab` の公開・mainブランチ・標準 `ubuntu-24.04` に固定しています。[GitHub公式料金](https://docs.github.com/en/billing/concepts/product-billing/github-actions)で公開リポジトリの標準runnerは無料です。非公開repo・大型runner・有料API・課金設定変更は使いません。repoを非公開にした場合は実行を停止します。GitHub側の利用条件や制限が変わった場合も無条件の無料を保証するものではありません。

書き込みはこのリポジトリの `results/` だけで、checkoutが持つこのrepoの `GITHUB_TOKEN` を使います。外部secretやMacのトークン、タスク本文、バックログ、リポジトリ、ブラウザ状態は送信しません。他のリポジトリへpushしません。唯一のActionは[SHA固定の公式checkout](https://github.com/actions/checkout/commit/11bd71901bbe5b1630ceea73d27597364c9af683)です。

依存パッケージ不要のローカルテスト:

```sh
node --test scripts/lab.test.mjs
```

公開前にこのディレクトリのファイルだけをレビューして新しいrepoへコピーしてください。親プロジェクトのGit履歴、設定、秘密ファイル、データベース、ログを含めません。初期状態では成果物はなく、公開と最初のworkflow成功後に作られます。
