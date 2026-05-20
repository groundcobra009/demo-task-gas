/**
 * Notion.gs
 * Notion API クライアント。
 *  - データベースの取得 (接続テスト用)
 *  - ページの作成
 *  - 設定シートの型に従った値→Notion property 変換
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';

/**
 * データベース情報を取得する (接続テスト用)。
 */
function notionRetrieveDatabase_(integrationKey, databaseId) {
  const res = UrlFetchApp.fetch(NOTION_API_BASE + '/databases/' + databaseId, {
    method: 'get',
    headers: notionHeaders_(integrationKey),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Notion 接続エラー (' + code + '): ' + body);
  }
  return JSON.parse(body);
}

/**
 * ページを作成する。
 * @param {string} integrationKey
 * @param {string} databaseId
 * @param {Object} properties  Notion API 仕様の properties オブジェクト
 * @return {{ok: boolean, id?: string, error?: string, status?: number}}
 */
function notionCreatePage_(integrationKey, databaseId, properties) {
  const payload = {
    parent: { database_id: databaseId },
    properties: properties
  };
  const res = UrlFetchApp.fetch(NOTION_API_BASE + '/pages', {
    method: 'post',
    headers: notionHeaders_(integrationKey),
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) {
    return { ok: false, status: code, error: body };
  }
  const json = JSON.parse(body);
  return { ok: true, id: json.id };
}

function notionHeaders_(integrationKey) {
  return {
    'Authorization': 'Bearer ' + integrationKey,
    'Notion-Version': NOTION_API_VERSION
  };
}

/**
 * データベース取得結果からタイトル文字列を抽出する。
 */
function extractDatabaseTitle_(databaseInfo) {
  const t = databaseInfo.title;
  if (!Array.isArray(t)) return '';
  return t.map(function (n) { return n.plain_text || ''; }).join('');
}

/**
 * シート1行 + マッピング定義 + 自動付与情報から Notion の properties を組み立てる。
 *
 * @param {Object} rowMap        ヘッダ名 -> セル値
 * @param {Array<{column: string, notionName: string, type: string}>} mappings
 * @param {{date: Date, dayOfWeek: string}} auto
 */
function buildNotionProperties_(rowMap, mappings, auto) {
  const props = {};
  mappings.forEach(function (m) {
    const v = rowMap[m.column];
    if (v === undefined || v === '' || v === null) return;
    const prop = toNotionProperty_(m.type, v);
    if (prop !== null) props[m.notionName] = prop;
  });
  // 自動付与
  props['実行日'] = toNotionProperty_('date', auto.date);
  props['曜日'] = toNotionProperty_('select', auto.dayOfWeek);
  return props;
}

/**
 * 型ごとに Notion property オブジェクトへ変換する。
 */
function toNotionProperty_(type, value) {
  switch (type) {
    case 'title':
      return { title: [{ text: { content: String(value) } }] };
    case 'rich_text':
      return { rich_text: [{ text: { content: String(value) } }] };
    case 'select':
      return { select: { name: String(value) } };
    case 'multi_select':
      return {
        multi_select: String(value).split(',').map(function (s) {
          return { name: s.trim() };
        }).filter(function (o) { return o.name; })
      };
    case 'date': {
      const d = (value instanceof Date) ? value : new Date(value);
      const iso = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      return { date: { start: iso } };
    }
    case 'number':
      return { number: Number(value) };
    case 'checkbox':
      return { checkbox: value === true || String(value).toLowerCase() === 'true' };
    case 'url':
      return { url: String(value) };
    default:
      return null;
  }
}
