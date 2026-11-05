/**
 * Fit Habits — Google Apps Script backend.
 *
 * Data lives in this Google Sheet (one tab per table), files in a private
 * Drive folder, email goes out through the owner's Gmail, and an hourly
 * trigger handles the weekly motivation, missed-payment emails and reports.
 *
 * The phone app talks to this script's web-app URL. Every request must carry
 * the APP_KEY (created by setup()), except the two intake actions, which a
 * client uses from their texted link and which check a one-time token instead.
 *
 * First-time setup: run setup() once from the editor, then Deploy → New
 * deployment → Web app (Execute as: Me, Who has access: Anyone).
 */

var PROPS = PropertiesService.getScriptProperties();

// s = text, n = number, b = true/false, j = JSON (lists and objects)
var TABLES = {
  clients: { id: 's', firstName: 's', lastName: 's', birthDate: 's', gender: 's', phone: 's', email: 's', address: 's', sessionDays: 'j', sessionTime: 's', rate: 'n', cycle: 's', dueWeekday: 'n', dueDayOfMonth: 'n', channel: 's', medicalCurrent: 's', medicalPast: 's', emergencyName: 's', emergencyPhone: 's', notes: 's', startDate: 's', active: 'b', createdAt: 's' },
  payments: { id: 's', clientId: 's', amount: 'n', paidOn: 's', note: 's', receiptVia: 's', createdAt: 's' },
  measurements: { id: 's', clientId: 's', takenOn: 's', values: 'j', note: 's', fileId: 's', createdAt: 's' },
  goals: { id: 's', clientId: 's', metric: 's', target: 'n', byDate: 's', createdAt: 's' },
  files: { id: 's', clientId: 's', kind: 's', name: 's', path: 's', mime: 's', size: 'n', createdAt: 's' },
  templates: { id: 's', title: 's', body: 's', sort: 'n' },
  motivations: { id: 's', body: 's', sentOn: 's', createdAt: 's' },
  intakes: { id: 's', clientId: 's', token: 's', createdAt: 's', completedAt: 's', answers: 'j' },
  exercises: { id: 's', name: 's', group: 's', kind: 's', createdAt: 's' },
  exerciseLogs: { id: 's', clientId: 's', exerciseId: 's', date: 's', value: 'n', reps: 'n', note: 's', createdAt: 's' },
  workouts: { id: 's', name: 's', items: 'j', createdAt: 's', updatedAt: 's' },
  sessions: { id: 's', clientId: 's', date: 's', name: 's', items: 'j', workoutId: 's', completedAt: 's', note: 's', createdAt: 's' },
  notices: { id: 's', clientId: 's', kind: 's', channel: 's', to: 's', body: 's', status: 's', error: 's', localDate: 's', createdAt: 's' }
};
var APP_TABLES = ['clients', 'payments', 'measurements', 'goals', 'files', 'templates', 'motivations', 'intakes', 'exercises', 'exerciseLogs', 'workouts', 'sessions'];
var CHILD_TABLES = ['payments', 'measurements', 'goals', 'files', 'intakes', 'exerciseLogs', 'sessions'];
var INTAKE_MAX_DAYS = 21;

// ---------- setup ----------

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from its Google Sheet (Extensions → Apps Script) and run setup() again.');
  PROPS.setProperty('SHEET_ID', ss.getId());
  Object.keys(TABLES).forEach(function (t) { sheet_(t); });
  settingsSheet_();
  if (!PROPS.getProperty('FOLDER_ID')) {
    PROPS.setProperty('FOLDER_ID', DriveApp.createFolder('Fit Habits client files (private)').getId());
  }
  if (!PROPS.getProperty('APP_KEY')) {
    PROPS.setProperty('APP_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'hourly') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('hourly').timeBased().everyHours(1).create();
  var first = ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);
  Logger.log('Setup done. Next: Deploy → New deployment → Web app (Execute as: Me, Access: Anyone), then run connectionCode().');
}

/** Run after deploying: logs the code to paste into the app's Settings → Connect. */
function connectionCode() {
  var url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Deploy the web app first (Deploy → New deployment → Web app).');
  var code = Utilities.base64EncodeWebSafe(JSON.stringify({ api: url, key: PROPS.getProperty('APP_KEY') }));
  Logger.log('Connection code (keep it private — it unlocks your client data):\n\n' + code);
  return code;
}

/** Makes a new key; every connected phone must reconnect with the new code. */
function rotateKey() {
  PROPS.setProperty('APP_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  connectionCode();
}

// ---------- web app ----------

function doGet() {
  return ContentService.createTextOutput('Fit Habits API is running.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    out = { result: route_(req) };
  } catch (err) {
    out = { error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route_(req) {
  var a = req.action;
  if (a === 'intakeInfo') return intakeInfo_(req.token);
  if (a === 'intakeSubmit') return withLock_(function () { return intakeSubmit_(req); });
  if (!req.key || req.key !== PROPS.getProperty('APP_KEY')) throw new Error('Not connected. Re-enter your connection code in Settings.');
  switch (a) {
    case 'load': return load_();
    case 'put': return withLock_(function () { return put_(req.table, req.row); });
    case 'remove': return withLock_(function () { return remove_(req.table, req.id); });
    case 'saveSettings': return withLock_(function () { return saveSettings_(req.settings); });
    case 'upload': return withLock_(function () { return upload_(req); });
    case 'file': return getFile_(req.id);
    case 'deleteFile': return withLock_(function () { return deleteFile_(req.id); });
    case 'notify': return notify_(req);
    default: throw new Error('Unknown action ' + a);
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- sheet storage ----------

function ss_() {
  return SpreadsheetApp.openById(PROPS.getProperty('SHEET_ID'));
}

function sheet_(table) {
  var ss = ss_();
  var sh = ss.getSheetByName(table);
  var cols = Object.keys(TABLES[table]);
  if (!sh) {
    sh = ss.insertSheet(table);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Plain text everywhere, so dates and phone numbers aren't reformatted.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  }
  return sh;
}

function toCell_(type, v) {
  if (v === null || v === undefined) return '';
  if (type === 'j') return JSON.stringify(v);
  if (type === 'b') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function fromCell_(type, v) {
  if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (v === '' || v === null || v === undefined) return type === 'j' ? null : type === 'b' ? false : type === 'n' ? 0 : null;
  if (type === 'n') return Number(v);
  if (type === 'b') return v === true || String(v).toUpperCase() === 'TRUE';
  if (type === 'j') { try { return JSON.parse(v); } catch (e) { return null; } }
  return String(v);
}

function readTable_(table) {
  var sh = sheet_(table);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var types = TABLES[table];
  return sh.getRange(2, 1, last - 1, head.length).getValues().filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (k, i) { if (types[k]) o[k] = fromCell_(types[k], r[i]); });
    if (table === 'clients' && !Array.isArray(o.sessionDays)) o.sessionDays = [];
    if (table === 'measurements' && !o.values) o.values = {};
    if ((table === 'workouts' || table === 'sessions') && !Array.isArray(o.items)) o.items = [];
    return o;
  });
}

function rowIndex_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function put_(table, row) {
  if (APP_TABLES.indexOf(table) < 0 && table !== 'notices') throw new Error('Unknown table');
  if (!row || !row.id) throw new Error('Missing id');
  var sh = sheet_(table);
  var types = TABLES[table];
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var values = [head.map(function (k) { return types[k] ? toCell_(types[k], row[k]) : ''; })];
  var at = rowIndex_(sh, String(row.id));
  if (at < 0) at = sh.getLastRow() + 1;
  sh.getRange(at, 1, 1, head.length).setNumberFormat('@').setValues(values);
  return true;
}

function deleteRows_(table, pred) {
  var sh = sheet_(table);
  var rows = readTable_(table);
  for (var i = rows.length - 1; i >= 0; i--) if (pred(rows[i])) sh.deleteRow(i + 2);
}

function remove_(table, id) {
  if (APP_TABLES.indexOf(table) < 0) throw new Error('Unknown table');
  deleteRows_(table, function (r) { return r.id === id; });
  if (table === 'clients') {
    readTable_('files').forEach(function (f) { if (f.clientId === id) trash_(f.path); });
    CHILD_TABLES.forEach(function (t) { deleteRows_(t, function (r) { return r.clientId === id; }); });
  }
  return true;
}

// ---------- settings ----------

function settingsSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName('settings');
  if (!sh) {
    sh = ss.insertSheet('settings');
    sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
  }
  return sh;
}

function getSettings_() {
  var sh = settingsSheet_();
  var last = sh.getLastRow();
  if (last < 2) return null;
  var o = {};
  sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
    if (r[0] === '') return;
    try { o[r[0]] = JSON.parse(r[1]); } catch (e) { o[r[0]] = r[1]; }
  });
  o.id = 'settings';
  return o;
}

function saveSettings_(s) {
  var sh = settingsSheet_();
  var keys = Object.keys(s).filter(function (k) { return k !== 'id'; });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  sh.getRange(2, 1, keys.length, 2).setValues(keys.map(function (k) { return [k, JSON.stringify(s[k])]; }));
  return true;
}

function load_() {
  var out = { settings: getSettings_() };
  APP_TABLES.forEach(function (t) { out[t] = readTable_(t); });
  return out;
}

// ---------- files (private Drive folder) ----------

function clientFolder_(clientId) {
  var root = DriveApp.getFolderById(PROPS.getProperty('FOLDER_ID'));
  var it = root.getFoldersByName(clientId);
  return it.hasNext() ? it.next() : root.createFolder(clientId);
}

function saveBlob_(clientId, kind, name, mime, base64) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime || 'application/octet-stream', name || 'file');
  var file = clientFolder_(clientId).createFile(blob);
  var row = { id: Utilities.getUuid(), clientId: clientId, kind: kind, name: name, path: file.getId(), mime: mime, size: file.getSize(), createdAt: new Date().toISOString() };
  put_('files', row);
  return row;
}

function upload_(req) {
  if (!readTable_('clients').some(function (c) { return c.id === req.clientId; })) throw new Error('Unknown client');
  return saveBlob_(req.clientId, req.kind, req.name, req.mime, req.data);
}

function getFile_(id) {
  var f = readTable_('files').filter(function (x) { return x.id === id; })[0];
  if (!f) throw new Error('File not found');
  var blob = DriveApp.getFileById(f.path).getBlob();
  return { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function trash_(driveId) {
  try { DriveApp.getFileById(driveId).setTrashed(true); } catch (e) { /* already gone */ }
}

function deleteFile_(id) {
  var f = readTable_('files').filter(function (x) { return x.id === id; })[0];
  if (f) trash_(f.path);
  deleteRows_('files', function (r) { return r.id === id; });
  return true;
}

// ---------- sending ----------

function twilioReady_() {
  return !!(PROPS.getProperty('TWILIO_ACCOUNT_SID') && PROPS.getProperty('TWILIO_AUTH_TOKEN') && (PROPS.getProperty('TWILIO_FROM') || PROPS.getProperty('TWILIO_MESSAGING_SERVICE_SID')));
}

function sendText_(phone, body) {
  if (!twilioReady_()) return { ok: false, error: 'texting not set up' };
  var sid = PROPS.getProperty('TWILIO_ACCOUNT_SID');
  var payload = { To: FH.digits(phone), Body: body };
  if (PROPS.getProperty('TWILIO_MESSAGING_SERVICE_SID')) payload.MessagingServiceSid = PROPS.getProperty('TWILIO_MESSAGING_SERVICE_SID');
  else payload.From = PROPS.getProperty('TWILIO_FROM');
  var res = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
    method: 'post', payload: payload, muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + PROPS.getProperty('TWILIO_AUTH_TOKEN')) }
  });
  var ok = res.getResponseCode() < 300;
  return ok ? { ok: true } : { ok: false, error: 'twilio ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300) };
}

function sendEmail_(to, subject, body, s) {
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body, name: (s && s.businessName) || 'Fit Habits', replyTo: (s && s.email) || undefined });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function log_(kind, channel, to, body, r, localDate, clientId) {
  put_('notices', { id: Utilities.getUuid(), clientId: clientId || '', kind: kind, channel: channel, to: to, body: String(body).slice(0, 4000), status: r.ok ? 'sent' : 'failed', error: r.error || '', localDate: localDate, createdAt: new Date().toISOString() });
}

/** Receipt or message to one client. Reports which channels actually went out. */
function notify_(req) {
  var c = readTable_('clients').filter(function (x) { return x.id === req.clientId; })[0];
  if (!c) throw new Error('Unknown client');
  var body = String(req.body || '').slice(0, 1600);
  if (!body) throw new Error('Empty message');
  var s = getSettings_() || {};
  var today = local_(s.timezone).date;
  var sent = { text: false, email: false };
  if ((req.channel === 'text' || req.channel === 'both') && c.phone && twilioReady_()) {
    var t = sendText_(c.phone, body); log_('receipt', 'text', c.phone, body, t, today, c.id); sent.text = t.ok;
  }
  if ((req.channel === 'email' || req.channel === 'both') && c.email) {
    var m = sendEmail_(c.email, req.subject || (s.businessName || 'Fit Habits'), body, s); log_('receipt', 'email', c.email, body, m, today, c.id); sent.email = m.ok;
  }
  return sent;
}

// ---------- intake (public, token-checked) ----------

function findIntake_(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  var r = readTable_('intakes').filter(function (i) { return i.token === token; })[0];
  if (!r) return null;
  if (Date.now() - new Date(r.createdAt).getTime() > INTAKE_MAX_DAYS * 864e5) return null;
  return r;
}

function intakeInfo_(token) {
  var r = findIntake_(token);
  if (!r) throw new Error('This link is not valid. Ask your trainer for a new one.');
  var c = readTable_('clients').filter(function (x) { return x.id === r.clientId; })[0];
  var s = getSettings_() || {};
  return { firstName: c ? c.firstName : '', business: s.businessName || 'Fit Habits', completed: !!r.completedAt };
}

function clip_(v, n) { return typeof v === 'string' ? v.slice(0, n || 2000) : ''; }

function intakeSubmit_(req) {
  var r = findIntake_(req.token);
  if (!r) throw new Error('This link has expired. Ask your trainer for a new one.');
  if (r.completedAt) throw new Error('Already submitted');
  var a = req.answers || {};
  var parq = Array.isArray(a.parq) ? a.parq.map(Boolean).slice(0, FH.PARQ_QUESTIONS.length) : [];
  if (parq.length !== FH.PARQ_QUESTIONS.length || !clip_(a.signature, 200).trim()) throw new Error('Please answer every question and sign.');
  var answers = { parq: parq, medicalCurrent: clip_(a.medicalCurrent), medicalPast: clip_(a.medicalPast), emergencyName: clip_(a.emergencyName, 200), emergencyPhone: clip_(a.emergencyPhone, 50), signature: clip_(a.signature, 200), signedAt: new Date().toISOString() };
  if (req.id && req.id.data) {
    if (!/^image\//.test(req.id.mime || '') || req.id.data.length > 14e6) throw new Error('ID photo must be an image under 10 MB');
    saveBlob_(r.clientId, 'id', 'Photo ID', req.id.mime, req.id.data);
  }
  r.completedAt = new Date().toISOString();
  r.answers = answers;
  put_('intakes', r);
  var c = readTable_('clients').filter(function (x) { return x.id === r.clientId; })[0];
  if (c) {
    ['medicalCurrent', 'medicalPast', 'emergencyName', 'emergencyPhone'].forEach(function (k) { if (answers[k]) c[k] = answers[k]; });
    put_('clients', c);
  }
  return true;
}

// ---------- hourly jobs ----------

function local_(tz) {
  var now = new Date();
  tz = tz || Session.getScriptTimeZone();
  return { date: Utilities.formatDate(now, tz, 'yyyy-MM-dd'), hour: Number(Utilities.formatDate(now, tz, 'H')), weekday: Number(Utilities.formatDate(now, tz, 'u')) % 7 };
}

function done_(kind, date) {
  return readTable_('notices').some(function (n) { return n.kind === kind && n.localDate === date; });
}

function money_(n) { return '$' + Number(n).toLocaleString('en-US'); }
function name_(c) { return (c.firstName + ' ' + c.lastName).trim(); }

function report_(label, from, to, clients, payments, s) {
  var pays = payments.filter(function (p) { return p.paidOn >= from && p.paidOn <= to; });
  var paid = clients.map(function (c) { return { c: c, t: pays.filter(function (p) { return p.clientId === c.id; }).reduce(function (a, p) { return a + p.amount; }, 0) }; }).filter(function (x) { return x.t > 0; });
  var unpaid = clients.filter(function (c) { return c.active && c.rate > 0 && !pays.some(function (p) { return p.clientId === c.id; }); });
  return [
    s.businessName + ': ' + label + ' (' + FH.fmtShort(from) + ' – ' + FH.fmtShort(to) + ')',
    'Collected ' + money_(FH.sumPayments(payments, from, to)) + ' from ' + pays.length + ' payment' + (pays.length === 1 ? '' : 's') + '.',
    '', 'PAID'
  ].concat(paid.length ? paid.map(function (x) { return '  ' + name_(x.c) + ': ' + money_(x.t); }) : ['  Nobody yet'])
    .concat(['', 'NO PAYMENT LOGGED'])
    .concat(unpaid.length ? unpaid.map(function (c) { return '  ' + name_(c); }) : ['  Nobody. Everyone paid!'])
    .join('\n');
}

function hourly() {
  var s = getSettings_();
  if (!s) return;
  var t = local_(s.timezone);
  var clients = readTable_('clients');
  var payments = readTable_('payments');
  var active = clients.filter(function (c) { return c.active; });

  // Weekly motivation (email; text too once Twilio is set up)
  var m = s.motivation || {};
  if (m.enabled && t.weekday === m.weekday && t.hour === Number(String(m.time).slice(0, 2)) && !done_('motivation', t.date)) {
    var lib = readTable_('motivations').sort(function (a, b) { return (a.sentOn || '') < (b.sentOn || '') ? -1 : 1; });
    var msg = lib[0];
    if (msg) {
      FH.motivationRecipients(active, m).forEach(function (c) {
        var reach = FH.motivationReach(c, m);
        if (reach.text && twilioReady_()) log_('motivation', 'text', c.phone, msg.body, sendText_(c.phone, msg.body), t.date, c.id);
        if (reach.email) log_('motivation', 'email', c.email, msg.body, sendEmail_(c.email, 'Your ' + s.businessName + ' motivation', 'Hey ' + c.firstName + ',\n\n' + msg.body + '\n\n- ' + s.trainerName, s), t.date, c.id);
      });
      msg.sentOn = t.date;
      put_('motivations', msg);
      log_('motivation', 'batch', 'all', msg.body, { ok: true }, t.date, '');
    }
  }

  if (!s.email) return;

  // Daily missed-payment + scan-due email
  var alerts = s.alerts || {};
  if (alerts.missedPayments && t.hour === Number(String(alerts.emailTime || '18').slice(0, 2)) && !done_('alert', t.date)) {
    var late = active.map(function (c) { return { c: c, st: FH.payStatus(c, payments, t.date) }; })
      .filter(function (x) { return FH.needsAttention(x.st) && x.st.daysLate >= (alerts.graceDays || 0); });
    var measurements = readTable_('measurements');
    var scans = active.map(function (c) {
      var pts = FH.series(measurements, c.id, 'bodyFat');
      return { c: c, due: pts.length ? FH.addMonths(pts[pts.length - 1].date, s.scanReminderMonths || 4) : null };
    }).filter(function (x) { return x.due && x.due <= FH.addDays(t.date, 7); });
    if (late.length || scans.length) {
      var body = []
        .concat(late.length ? ['Payments not logged yet:'].concat(late.map(function (x) { return '  ' + name_(x.c) + ': ' + money_(x.st.owed) + ' (' + x.st.label + ')'; })).concat(['']) : [])
        .concat(scans.length ? ['Body scans due:'].concat(scans.map(function (x) { return '  ' + name_(x.c) + ': ' + FH.fmtShort(x.due); })).concat(['']) : [])
        .concat(['Open the Fit Habits app to log payments or text a reminder.']).join('\n');
      var subject = late.length ? late.length + ' payment' + (late.length === 1 ? '' : 's') + ' not logged' : 'Body scans coming up';
      log_('alert', 'email', s.email, body, sendEmail_(s.email, subject, body, s), t.date);
    }
  }

  // Reports
  var reports = s.reports || {};
  var friday6 = t.weekday === 5 && t.hour === 18;
  var week = FH.startOfWeek(t.date);
  if (friday6 && reports.weekly && !done_('report-weekly', t.date)) {
    var w = report_('weekly report', week, FH.addDays(week, 6), clients, payments, s);
    log_('report-weekly', 'email', s.email, w, sendEmail_(s.email, 'Who paid this week', w, s), t.date);
  }
  var weekNo = Math.floor((Date.parse(week) / 864e5 + 3) / 7);
  if (friday6 && reports.biweekly && weekNo % 2 === 0 && !done_('report-biweekly', t.date)) {
    var b = report_('2-week summary', FH.addDays(week, -7), FH.addDays(week, 6), clients, payments, s);
    log_('report-biweekly', 'email', s.email, b, sendEmail_(s.email, 'Your 2-week summary', b, s), t.date);
  }
  if (/-01$/.test(t.date) && t.hour === 8 && reports.monthly && !done_('report-monthly', t.date)) {
    var lastDay = FH.addDays(t.date, -1);
    var mo = report_('monthly summary', FH.startOfMonth(lastDay), FH.endOfMonth(lastDay), clients, payments, s);
    log_('report-monthly', 'email', s.email, mo, sendEmail_(s.email, 'Your monthly summary', mo, s), t.date);
  }
}

/** Sends the weekly report to you right now, to check email works. */
function testReport() {
  var s = getSettings_();
  if (!s || !s.email) throw new Error('Add your email in the app under Settings first.');
  var t = local_(s.timezone);
  var week = FH.startOfWeek(t.date);
  var body = report_('weekly report (test)', week, FH.addDays(week, 6), readTable_('clients'), readTable_('payments'), s);
  sendEmail_(s.email, 'Fit Habits test report', body, s);
  Logger.log(body);
}
