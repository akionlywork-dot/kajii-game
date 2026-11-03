// ===== かじーの合体大合戦 online ranking (Google Apps Script) =====
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
// Every player takes part automatically. Each device has its own player id,
// and the sheet keeps ONE row per player with their best score:
//   column A: player id   B: name   C: best score   D: last update
//
// GET  <url>?id=<player id>
//   -> { ok, top: [{ name, score, mine }], rank, players }
//      top = best 10, mine = true on the asking player's row,
//      rank = the asking player's place (0 = not in the ranking yet)
// POST <url>  {"id","name","score"} (sent as text)
//   -> same answer. Updates the name; keeps the score only if it is a new best.
//
// Note: anyone who knows the URL can send a score, so a fake score is possible.
// That is fine for playing with friends; this script only blocks obviously bad data.
// To remove a player (for example a rude name), delete their row in the sheet.

const SHEET_NAME = 'ranking';
const TOP = 10;              // how many names to send back
const MAX_SCORE = 1000000;   // anything bigger is refused

function getSheet_() {
  const book = SpreadsheetApp.getActive();
  return book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
}

// All player rows, best score first: [id, name, score, date]
function sortedRows_() {
  return getSheet_().getDataRange().getValues()
    .filter((r) => r[0] !== '' && typeof r[2] === 'number')
    .sort((a, b) => b[2] - a[2]);
}

// The answer for one player: the top list, and where that player is
function answer_(id) {
  const rows = sortedRows_();
  const top = rows.slice(0, TOP).map((r) => ({ name: String(r[1]), score: r[2], mine: r[0] === id }));
  const place = rows.findIndex((r) => r[0] === id) + 1; // 0 = not found
  return { ok: true, top: top, rank: place, players: rows.length };
}

function reply_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const id = String((e && e.parameter && e.parameter.id) || '');
  return reply_(answer_(id));
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // two players sending at once must not break the sheet
  try {
    const data = JSON.parse(e.postData.contents);
    const id = String(data.id || '');
    if (!/^p-[a-z0-9]{8,32}$/.test(id)) return reply_({ ok: false, error: 'bad id' });
    let name = String(data.name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 10);
    if (!name) return reply_({ ok: false, error: 'no name' });
    // a name starting with = + - @ would become a spreadsheet formula: make it plain text
    if (/^[=+\-@]/.test(name)) name = "'" + name;
    const score = Math.floor(Number(data.score));
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return reply_({ ok: false, error: 'bad score' });

    const sheet = getSheet_();
    const values = sheet.getDataRange().getValues();
    const index = values.findIndex((r) => r[0] === id);
    if (index >= 0) {
      const row = index + 1; // sheet rows start at 1
      sheet.getRange(row, 2).setValue(name);                                   // a new name is always kept
      if (score > Number(values[index][2])) sheet.getRange(row, 3).setValue(score); // only a new best
      sheet.getRange(row, 4).setValue(new Date());
    } else if (score > 0) {
      sheet.appendRow([id, name, score, new Date()]); // a new player
    }
    return reply_(answer_(id));
  } catch (err) {
    return reply_({ ok: false, error: 'bad request' });
  } finally {
    lock.releaseLock();
  }
}
