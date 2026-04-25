#!/usr/bin/env node
/**
 * Mixr → Notion 同期スクリプト
 *
 * 使い方:
 *   node notion-sync.cjs <event.json> <parentPageId>
 *   NOTION_PARENT_ID=<id> node notion-sync.cjs <event.json>
 *
 * event.json は Mixr Webアプリの「JSONをダウンロード」で書き出したもの。
 * Notion Integration キーは ~/.notion/config.json から読み込む。
 * （フォーマット: {"integration_key":"ntn_..."}）
 *
 * 実行前に Notion 側で対象ページを Integration に共有 (Connections) しておくこと。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const NOTION_VERSION = '2022-06-28';
const CONFIG_PATH = path.join(os.homedir(), '.notion', 'config.json');

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[error] Notion config not found: ${CONFIG_PATH}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const key = raw.integration_key || raw.token || raw.NOTION_TOKEN;
  if (!key) {
    console.error('[error] integration_key not found in config');
    process.exit(1);
  }
  return key;
}

async function notionFetch(token, route, body, method) {
  const m = method || (body ? 'POST' : 'GET');
  const res = await fetch(`https://api.notion.com/v1${route}`, {
    method: m,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status} ${m} ${route}: ${text}`);
  }
  return res.json();
}

const rt = (text) => [{ type: 'text', text: { content: String(text).slice(0, 2000) } }];

function buildBlocks(event) {
  const { settings, participants, rounds } = event;
  const out = [];

  out.push({
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: rt('イベント情報') },
  });
  const info = [
    `参加者: ${participants.length}名`,
    `グループ数: ${settings.groupCount}`,
    `1グループの人数: ${settings.groupSize}`,
    `ラウンド数: ${settings.roundCount}`,
    `テーブル形状: ${settings.tableShape === 'round' ? '丸' : '長方形'}`,
  ];
  for (const line of info) {
    out.push({ object:'block', type:'bulleted_list_item',
      bulleted_list_item: { rich_text: rt(line) } });
  }

  out.push({
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: rt('参加者一覧') },
  });
  for (const p of participants) {
    out.push({ object:'block', type:'bulleted_list_item',
      bulleted_list_item: { rich_text: rt(`${p.id}. ${p.name || ('参加者' + p.id)}`) } });
  }

  for (const round of rounds) {
    out.push({ object:'block', type:'heading_2',
      heading_2: { rich_text: rt(round.name) } });
    for (const group of round.groups) {
      out.push({ object:'block', type:'heading_3',
        heading_3: { rich_text: rt(group.name) } });
      for (const sid of group.seats) {
        const label = sid === null ? '空席'
          : `${sid}. ${(participants.find(p => p.id === sid)?.name) || ('参加者' + sid)}`;
        out.push({ object:'block', type:'bulleted_list_item',
          bulleted_list_item: { rich_text: rt(label) } });
      }
    }
  }
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const file = process.argv[2];
  const parent = process.argv[3] || process.env.NOTION_PARENT_ID;
  if (!file || !parent) {
    console.error('使い方:');
    console.error('  node notion-sync.cjs <event.json> <parentPageId>');
    console.error('  NOTION_PARENT_ID=<id> node notion-sync.cjs <event.json>');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`[error] ファイルが見つかりません: ${file}`);
    process.exit(1);
  }
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!event.settings || !event.participants || !event.rounds) {
    console.error('[error] event.json の形式が不正です（settings/participants/rounds が必要）');
    process.exit(1);
  }
  const token = readConfig();

  const eventName = event.settings.eventName || 'Mixr';
  const date = new Date().toISOString().slice(0, 10);
  const title = `${eventName} 席順 (${date})`;

  const allBlocks = buildBlocks(event);
  const batches = chunk(allBlocks, 100);

  console.log(`[info] Notionページ作成中: "${title}"`);
  console.log(`[info] ブロック数: ${allBlocks.length} (${batches.length} バッチ)`);

  const page = await notionFetch(token, '/pages', {
    parent: { page_id: parent },
    properties: { title: { title: rt(title) } },
    children: batches[0] || [],
  });

  for (let i = 1; i < batches.length; i++) {
    await notionFetch(token, `/blocks/${page.id}/children`, { children: batches[i] }, 'PATCH');
    console.log(`[info] バッチ ${i + 1}/${batches.length} 追加`);
  }

  console.log(`\n[done] 作成完了: ${page.url}`);
}

main().catch((e) => {
  console.error('\n[fail]', e.message || e);
  process.exit(1);
});
