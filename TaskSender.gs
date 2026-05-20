/**
 * TaskSender.gs
 * シートからタスクを読み込み、Notion へ送信するオーケストレーション。
 */

/**
 * 毎朝5時のトリガーから呼ばれるエントリポイント。今日の曜日のタスクを送信する。
 */
function sendTodayTasksToNotion() {
  const today = new Date();
  const dow = DAYS_JP[today.getDay()];
  return sendTasksForDay_(dow, today);
}

/**
 * サイドバーの「今日分を今すぐ送信」用。
 */
function sendTodayTasksManually() {
  return sendTodayTasksToNotion();
}

/**
 * サイドバーの「指定曜日を送信」用。
 * @param {string} dayJp '月' | '火' | ...
 */
function sendTasksForSpecifiedDay(dayJp) {
  if (WEEKDAY_ORDER.indexOf(dayJp) === -1) {
    throw new Error('曜日の指定が不正です: ' + dayJp);
  }
  return sendTasksForDay_(dayJp, new Date());
}

/**
 * 指定曜日のタスクをNotionへ送る本体。
 */
function sendTasksForDay_(dayJp, executeDate) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty(PROP_NOTION_KEY);
  const dbId = props.getProperty(PROP_NOTION_DB);
  if (!key || !dbId) {
    const msg = '認証情報が未設定のため送信を中止しました。';
    writeLog_(dayJp, 0, 0, msg);
    return { ok: false, message: msg, success: 0, failure: 0 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const taskSheet = ss.getSheetByName(SHEET_TASK_MASTER);
  const mappingSheet = ss.getSheetByName(SHEET_MAPPING);
  if (!taskSheet || !mappingSheet) {
    const msg = '必要なシートが見つかりません。先に「初期設定を実行」してください。';
    writeLog_(dayJp, 0, 0, msg);
    return { ok: false, message: msg, success: 0, failure: 0 };
  }

  const mappings = readMappings_(mappingSheet);
  const tasks = readTasksForDay_(taskSheet, dayJp);

  if (tasks.length === 0) {
    const msg = '対象タスクは0件でした (曜日=' + dayJp + ')';
    writeLog_(dayJp, 0, 0, msg);
    updateLastRun_(dayJp, 0, 0);
    return { ok: true, message: msg, success: 0, failure: 0 };
  }

  let success = 0;
  let failure = 0;
  const errors = [];

  tasks.forEach(function (rowMap, idx) {
    const properties = buildNotionProperties_(rowMap, mappings, {
      date: executeDate,
      dayOfWeek: dayJp
    });
    const result = notionCreatePage_(key, dbId, properties);
    if (result.ok) {
      success++;
    } else {
      failure++;
      errors.push('行 ' + (idx + 2) + ': ' + (result.error || '').slice(0, 200));
    }
    Utilities.sleep(350); // レートリミット対策
  });

  const detail = errors.length ? errors.join(' / ') : 'OK';
  writeLog_(dayJp, success, failure, detail);
  updateLastRun_(dayJp, success, failure);

  return {
    ok: failure === 0,
    message: '送信完了: 成功 ' + success + ' 件 / 失敗 ' + failure + ' 件',
    success: success,
    failure: failure,
    errors: errors
  };
}

/**
 * 設定シートからマッピング配列を読む。
 */
function readMappings_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, 3).getValues();
  const mappings = [];
  values.forEach(function (r) {
    const column = String(r[0] || '').trim();
    const notionName = String(r[1] || '').trim();
    const type = String(r[2] || '').trim();
    if (!column || !notionName || !type) return;
    if (column === '(自動)') return; // 注記行はスキップ
    mappings.push({ column: column, notionName: notionName, type: type });
  });
  return mappings;
}

/**
 * タスクマスタから指定曜日 & 有効=TRUE の行を {ヘッダ名: 値} 形式で返す。
 */
function readTasksForDay_(sheet, dayJp) {
  const last = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (last < 2) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h || '').trim(); });
  const rows = sheet.getRange(2, 1, last - 1, lastCol).getValues();

  const idxDay = headers.indexOf('曜日');
  const idxEnabled = headers.indexOf('有効');

  const result = [];
  rows.forEach(function (r) {
    if (idxDay === -1) return;
    if (String(r[idxDay]).trim() !== dayJp) return;
    if (idxEnabled !== -1 && r[idxEnabled] !== true) return;

    const rowMap = {};
    headers.forEach(function (h, i) {
      if (!h) return;
      if (h === '曜日' || h === '有効') return; // 内部利用のみ
      rowMap[h] = r[i];
    });
    result.push(rowMap);
  });
  return result;
}

function writeLog_(dayJp, success, failure, detail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) {
    buildLogSheet_(ss);
    sheet = ss.getSheetByName(SHEET_LOG);
  }
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([now, dayJp, success, failure, detail]);
}

function updateLastRun_(dayJp, success, failure) {
  const props = PropertiesService.getScriptProperties();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  props.setProperty(PROP_LAST_RUN_AT, now);
  props.setProperty(PROP_LAST_RUN_RESULT,
    '曜日=' + dayJp + ' / 成功=' + success + ' / 失敗=' + failure);
}
