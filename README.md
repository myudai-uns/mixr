# Mixr — 席順ジェネレーター

ミキサー / 交流イベント向けの席順を自動生成するシングルページWebアプリ。

## 公開URL
https://myudai-uns.github.io/mixr/

## 機能
- 参加者数 / ラウンド数 / 1グループ人数 を指定して席順を自動生成
- 重複ペア最小化（80トライアルでスコアリング）
- 参加者は `01, 02, 03...` の番号で自動採番
- 四角テーブル + 周囲に椅子を配置
- PDF / PNG エクスポート、ローカル自動保存
- スマホ対応

## 技術
React 18 + Tailwind + html2canvas + jsPDF（すべてCDN、ビルド不要）

## Notion連携（任意）
`notion-sync.cjs` で席順をNotionページとして書き出せます。
- `~/.notion/config.json` の `integration_key` を使用
- 使い方: `node notion-sync.cjs <event.json> <parentPageId>`
