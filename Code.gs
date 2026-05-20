/**
 * Code.gs
 * メニュー / サイドバー / ヘルプ / 認証情報管理など、UI からの公開エントリポイントをまとめる。
 */

const SHEET_TASK_MASTER = 'タスクマスタ';
const SHEET_MAPPING = '設定';
const SHEET_LOG = 'ログ';

const PROP_NOTION_KEY = 'NOTION_INTEGRATION_KEY';
const PROP_NOTION_DB = 'NOTION_DATABASE_ID';
const PROP_LAST_RUN_AT = 'LAST_RUN_AT';
const PROP_LAST_RUN_RESULT = 'LAST_RUN_RESULT';

const TRIGGER_FUNCTION = 'sendTodayTasksToNotion';

/**
 * スプレッドシートを開いた時にメニューを追加する。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 タスク連携')
    .addItem('サイドバーを開く', 'showSidebar')
    .addItem('ヘルプを開く', 'showHelp')
    .addToUi();
}

/**
 * サイドバーを表示する。
 */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('タスク連携 設定');
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * ヘルプモーダルを表示する。
 */
function showHelp() {
  const html = HtmlService.createHtmlOutputFromFile('Help')
    .setWidth(720)
    .setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'ヘルプ - タスク連携ツール');
}

/**
 * 認証情報を ScriptProperties に保存する。
 * サイドバーから呼ばれる。
 * @param {{integrationKey: string, databaseId: string}} payload
 */
function saveCredentials(payload) {
  const key = (payload.integrationKey || '').trim();
  const db = (payload.databaseId || '').trim();
  if (!key) throw new Error('Integration Key を入力してください。');
  if (!db) throw new Error('Database ID を入力してください。');

  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_NOTION_KEY, key);
  props.setProperty(PROP_NOTION_DB, db);
  return { ok: true, message: '認証情報を保存しました。' };
}

/**
 * サイドバー表示時に現在の設定状況を返す。
 */
function getStatus() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty(PROP_NOTION_KEY) || '';
  const db = props.getProperty(PROP_NOTION_DB) || '';
  const triggerEnabled = ScriptApp.getProjectTriggers()
    .some(function (t) { return t.getHandlerFunction() === TRIGGER_FUNCTION; });
  return {
    hasKey: !!key,
    hasDatabaseId: !!db,
    maskedKey: key ? key.slice(0, 6) + '…' + key.slice(-4) : '',
    maskedDb: db ? db.slice(0, 6) + '…' + db.slice(-4) : '',
    triggerEnabled: triggerEnabled,
    lastRunAt: props.getProperty(PROP_LAST_RUN_AT) || '',
    lastRunResult: props.getProperty(PROP_LAST_RUN_RESULT) || ''
  };
}

/**
 * Notion への接続テスト。
 * /v1/databases/{id} を取得し、200 ならプロパティ一覧を返す。
 */
function testNotionConnection() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty(PROP_NOTION_KEY);
  const db = props.getProperty(PROP_NOTION_DB);
  if (!key || !db) throw new Error('Integration Key と Database ID を保存してから実行してください。');

  const info = notionRetrieveDatabase_(key, db);
  const propNames = Object.keys(info.properties || {});
  return {
    ok: true,
    title: extractDatabaseTitle_(info),
    properties: propNames
  };
}
