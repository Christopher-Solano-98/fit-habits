// In-memory stand-ins for the Google Apps Script services Code.js uses, so the
// backend can be exercised with Node (tests/gas.test.ts and the e2e script).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function a1Cols(a1) {
  const m = /^([A-Z]):([A-Z])$/.exec(a1);
  return [m[1].charCodeAt(0) - 64, m[2].charCodeAt(0) - 64];
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  getLastRow() { let n = this.rows.length; while (n && this.rows[n - 1].every((v) => v === '')) n--; return n; }
  getLastColumn() { return Math.max(0, ...this.rows.map((r) => { let n = r.length; while (n && r[n - 1] === '') n--; return n; })); }
  getMaxRows() { return Math.max(1000, this.rows.length); }
  setFrozenRows() {}
  deleteRow(i) { this.rows.splice(i - 1, 1); }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') { const [c1, c2] = a1Cols(r); return this.getRange(1, c1, this.getMaxRows(), c2 - c1 + 1); }
    const sh = this; nr = nr ?? 1; nc = nc ?? 1;
    const range = {
      setValues(vals) {
        for (let i = 0; i < nr; i++) {
          while (sh.rows.length < r + i) sh.rows.push([]);
          const row = sh.rows[r + i - 1];
          for (let j = 0; j < nc; j++) { while (row.length < c + j) row.push(''); row[c + j - 1] = vals[i][j]; }
        }
        return range;
      },
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = sh.rows[r + i - 1] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c + j - 1] ?? ''); out.push(o); }
        return out;
      },
      clearContent() { for (let i = 0; i < nr; i++) { const row = sh.rows[r + i - 1]; if (row) for (let j = 0; j < nc; j++) if (row.length >= c + j) row[c + j - 1] = ''; } return range; },
      setFontWeight() { return range; },
      setNumberFormat() { return range; },
    };
    return range;
  }
}

function createGas({ now = () => new Date() } = {}) {
  const sheets = [new Sheet('Sheet1')];
  const props = {};
  const files = {};
  const folders = {};
  const mail = [];
  const fetches = [];
  let fileSeq = 0;
  const ss = {
    getId: () => 'SHEET',
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1),
  };
  const folder = (id, name) => folders[id] || (folders[id] = {
    getId: () => id,
    name,
    getFoldersByName(n) { const kids = Object.values(folders).filter((f) => f.parent === id && f.name === n); let i = 0; return { hasNext: () => i < kids.length, next: () => kids[i++] }; },
    createFolder(n) { const f = folder('F' + ++fileSeq, n); f.parent = id; return f; },
    createFile(blob) { const fid = 'D' + ++fileSeq; files[fid] = { blob, trashed: false, parent: id }; return { getId: () => fid, getSize: () => blob.bytes.length }; },
  });
  const ctx = {
    console,
    Logger: { log: (...a) => ctx.__logs.push(a.join(' ')) },
    __logs: [],
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    DriveApp: {
      createFolder: (n) => folder('ROOT', n),
      getFolderById: (id) => folders[id],
      getFileById: (id) => {
        const f = files[id];
        if (!f) throw new Error('no file');
        return { setTrashed: (t) => { f.trashed = t; }, getBlob: () => ({ getContentType: () => f.blob.mime, getBytes: () => f.blob.bytes }) };
      },
    },
    Utilities: {
      getUuid: () => require('crypto').randomUUID(),
      base64Encode: (b) => Buffer.from(typeof b === 'string' ? b : Uint8Array.from(b)).toString('base64'),
      base64EncodeWebSafe: (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: (d, tz, fmt) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
        if (fmt === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
        if (fmt === 'H') return String(Number(p.hour));
        if (fmt === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
        throw new Error('fmt ' + fmt);
      },
    },
    Session: { getScriptTimeZone: () => 'America/New_York' },
    MailApp: { sendEmail: (m) => mail.push(m) },
    UrlFetchApp: { fetch: (url, opts) => { fetches.push({ url, opts }); return { getResponseCode: () => 201, getContentText: () => '{}' }; } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }), MimeType: { JSON: 'json' } },
    ScriptApp: {
      triggers: [],
      getProjectTriggers() { return this.triggers; },
      deleteTrigger(t) { this.triggers.splice(this.triggers.indexOf(t), 1); },
      newTrigger(fn) { const self = this; return { timeBased: () => ({ everyHours: () => ({ create: () => self.triggers.push({ getHandlerFunction: () => fn }) }) }) }; },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
    },
  };
  // Code.js reads `new Date()`; let tests pin the clock.
  const RealDate = Date;
  ctx.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(now().getTime()); }
    static now() { return now().getTime(); }
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  vm.runInContext(fs.readFileSync(path.join(dir, 'Shared.js'), 'utf8'), ctx, { filename: 'Shared.js' });
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.js'), 'utf8'), ctx, { filename: 'Code.js' });
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { ctx, post, props, sheets, files, mail, fetches };
}

module.exports = { createGas };
