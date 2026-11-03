// ===== かじーゲーム online ranking (Google Apps Script) =====
// This file is NOT part of the game. Paste it into a NEW Google Spreadsheet:
//
//  1. Make a new Google Spreadsheet (do not reuse another game's sheet).
//  2. Menu: 拡張機能 > Apps Script. Delete what is there and paste this whole file. Save.
//  3. Button: デプロイ > 新しいデプロイ > 種類「ウェブアプリ」
//       次のユーザーとして実行: 自分
//       アクセスできるユーザー: 全員
//     Press デプロイ and allow access when Google asks.
//  4. Copy the web app URL (https://script.google.com/macros/s/.../exec)
//     into config.js -> rankingUrl.
//  5. After changing this code later: デプロイ > デプロイを管理 > edit > 新バージョン.
//
// GET  <url>                 -> { ok: true, top: [{ name, score }, ...] }  (best 10)
// POST <url>  {"name","score"} (sent as text) -> { ok: true, top: [...] }
//
// Note: anyone who knows the URL can send a score, so a fake score is possible.
// That is fine for playing with friends; this script only blocks obviously bad data.

const SHEET_NAME = 'ranking';
const TOP = 10;              // how many names to send back
const MAX_SCORE = 1000000;   // anything bigger is refused

function getSheet_() {
  const book = SpreadsheetApp.getActive();
  return book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
}

// Best scores, high to low: [{ name, score }]
function getTop_() {
  const rows = getSheet_().getDataRange().getValues();
  return rows
    .filter((r) => r[0] !== '' && typeof r[1] === 'number')
    .map((r) => ({ name: String(r[0]), score: r[1] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP);
}

function reply_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return reply_({ ok: true, top: getTop_() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // two players sending at once must not break the sheet
  try {
    const data = JSON.parse(e.postData.contents);
    let name = String(data.name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 10) || 'ななし';
    // a name starting with = + - @ would become a spreadsheet formula: make it plain text
    if (/^[=+\-@]/.test(name)) name = "'" + name;
    const score = Math.floor(Number(data.score));
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
      return reply_({ ok: false, error: 'bad score' });
    }
    getSheet_().appendRow([name, score, new Date()]);
    return reply_({ ok: true, top: getTop_() });
  } catch (err) {
    return reply_({ ok: false, error: 'bad request' });
  } finally {
    lock.releaseLock();
  }
}
