/**
 * Setup.gs
 * 初期設定 (シート構築・ダミーデータ投入) とトリガー管理。
 */

const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAY_ORDER = ['月', '火', '水', '木', '金', '土', '日'];

/**
 * サイドバーから呼び出される。シート2枚を構築しダミーデータを入れる。
 * 既存シートがある場合は上書きせず警告のみ。
 */
function runInitialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];
  const skipped = [];

  if (ss.getSheetByName(SHEET_TASK_MASTER)) {
    skipped.push(SHEET_TASK_MASTER);
  } else {
    buildTaskMasterSheet_(ss);
    created.push(SHEET_TASK_MASTER);
  }

  if (ss.getSheetByName(SHEET_MAPPING)) {
    skipped.push(SHEET_MAPPING);
  } else {
    buildMappingSheet_(ss);
    created.push(SHEET_MAPPING);
  }

  if (!ss.getSheetByName(SHEET_LOG)) {
    buildLogSheet_(ss);
    created.push(SHEET_LOG);
  }

  return {
    ok: true,
    created: created,
    skipped: skipped,
    message: '初期設定が完了しました。' +
      (created.length ? ' 作成: ' + created.join(', ') : '') +
      (skipped.length ? ' (既存のためスキップ: ' + skipped.join(', ') + ')' : '')
  };
}

/**
 * タスクマスタシートを作成する。
 */
function buildTaskMasterSheet_(ss) {
  const sheet = ss.insertSheet(SHEET_TASK_MASTER);
  const headers = ['曜日', 'タスク名', 'カテゴリ', '優先度', '備考', '有効'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#2b6cb0')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  const dummy = [
    ['月', '週次レポート作成',     'レポート', '高', '前週分の数値を集計',        true],
    ['月', 'チーム朝会',           'ミーティング', '中', '15分',                  true],
    ['火', '顧客フォローアップ',   '営業',     '高', '前週商談分のメール返信',   true],
    ['水', '在庫チェック',         '運用',     '中', 'スプレッドシートで確認',   true],
    ['木', '請求書発行準備',       '経理',     '高', '月末以外も漏れがないか',   true],
    ['金', '週次振り返り',         'レポート', '中', '良かった点・改善点を記録', true],
    ['金', '来週の予定確認',       '計画',     '中', 'カレンダーで一週間分確認', true],
    ['土', '個人タスク棚卸し',     '個人',     '低', '次週用にプール',           true],
    ['日', '週次バックアップ確認', '運用',     '低', '完了通知メールをチェック', true]
  ];
  sheet.getRange(2, 1, dummy.length, headers.length).setValues(dummy);

  // 入力規則
  const dayRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(WEEKDAY_ORDER, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 1, 200, 1).setDataValidation(dayRule);

  const prRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['高', '中', '低'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 4, 200, 1).setDataValidation(prRule);

  sheet.getRange(2, 6, 200, 1).insertCheckboxes();

  // 列幅
  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 240);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 280);
  sheet.setColumnWidth(6, 60);
}

/**
 * 設定 (マッピング) シートを作成する。
 */
function buildMappingSheet_(ss) {
  const sheet = ss.insertSheet(SHEET_MAPPING);
  const headers = ['シート列名', 'Notionプロパティ名', '型', '備考'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#2b6cb0')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  const rows = [
    ['タスク名', 'Name',     'title',     '※ title 型は1プロパティのみ必須'],
    ['カテゴリ', 'カテゴリ', 'select',    'Notion側で選択肢を事前作成すると安全'],
    ['優先度',   '優先度',   'select',    '高 / 中 / 低'],
    ['備考',     '備考',     'rich_text', '長文OK']
  ];
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['title', 'rich_text', 'select', 'multi_select', 'date', 'number', 'checkbox', 'url'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 3, 100, 1).setDataValidation(typeRule);

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 320);

  // 注記
  const noteRow = rows.length + 3;
  sheet.getRange(noteRow, 1).setValue('▼ 自動付与されるプロパティ (シート列は不要)');
  sheet.getRange(noteRow, 1).setFontWeight('bold');
  sheet.getRange(noteRow + 1, 1, 2, 3).setValues([
    ['(自動)', '実行日', 'date'],
    ['(自動)', '曜日',   'select']
  ]);
}

/**
 * ログシートを作成する。
 */
function buildLogSheet_(ss) {
  const sheet = ss.insertSheet(SHEET_LOG);
  const headers = ['日時', '対象曜日', '成功件数', '失敗件数', '詳細'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#2b6cb0')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 170);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 480);
}

/**
 * 毎朝5時トリガーを有効化する。既存の同名トリガーは削除して作り直す。
 */
function enableDailyTrigger() {
  removeDailyTrigger();
  ScriptApp.newTrigger(TRIGGER_FUNCTION)
    .timeBased()
    .atHour(5)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create();
  return { ok: true, message: '毎朝5時のトリガーを有効化しました。' };
}

/**
 * トリガーを削除する。
 */
function removeDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return { ok: true, removed: removed, message: removed + ' 件のトリガーを削除しました。' };
}
