/**
 * Клуб корпоративных бальных танцев — учёт занятий.
 * Серверная часть (Google Apps Script, привязанный к Google Таблице).
 *
 * Первый запуск: выполните функцию setup() в редакторе — она создаст листы
 * и пользователя admin. Пароль появится в журнале выполнения и на листе «Настройки».
 */

const CLUB_NAME = 'Клуб корпоративных бальных танцев';
const STAFF = ['admin', 'manager'];
const ALL = ['admin', 'manager', 'trainer', 'client'];
const SESSION_DAYS = 30;

// ---------------------------------------------------------------------------
// Схема базы. [ключ, заголовок столбца, тип]  типы: n — число, b — да/нет,
// d — дата (текст гггг-мм-дд), t — время (текст ЧЧ:мм), иначе — текст.
// Столбцы ищутся по заголовку, поэтому порядок в таблице можно менять,
// но заголовки переименовывать нельзя.
// ---------------------------------------------------------------------------
const TABLES = {
  users: ['Пользователи', [
    ['id', 'ID'], ['login', 'Логин'], ['name', 'Имя'], ['role', 'Роль'],
    ['trainerId', 'ID тренера'], ['clientId', 'ID ученика'], ['active', 'Активен', 'b'],
    ['mustChange', 'Сменить пароль', 'b'], ['passHash', 'Хэш пароля'], ['salt', 'Соль'], ['createdAt', 'Создан']]],
  sessions: ['Сессии', [
    ['token', 'Токен'], ['userId', 'ID пользователя'], ['expiresAt', 'Истекает', 'n'], ['createdAt', 'Создана']]],
  trainers: ['Тренеры', [
    ['id', 'ID'], ['name', 'ФИО'], ['phone', 'Телефон'], ['email', 'Email'], ['spec', 'Направление'],
    ['rateInd', 'Ставка индивид., ₽/ч', 'n'], ['rateGroup', 'Ставка групп., ₽/ч', 'n'], ['rateEvent', 'Ставка мероприятия, ₽/ч', 'n'],
    ['contractNo', '№ договора'], ['contractDate', 'Дата договора', 'd'], ['active', 'Активен', 'b'],
    ['notes', 'Заметки'], ['createdAt', 'Создан']]],
  clients: ['Ученики', [
    ['id', 'ID'], ['name', 'ФИО'], ['phone', 'Телефон'], ['email', 'Email'], ['birthDate', 'Дата рождения', 'd'],
    ['company', 'Компания'], ['trainerIds', 'ID тренеров'], ['trainerNames', 'Тренеры'], ['partnerId', 'ID партнёра'],
    ['contractNo', '№ договора'], ['contractDate', 'Дата договора', 'd'], ['active', 'Активен', 'b'],
    ['notes', 'Заметки'], ['createdAt', 'Создан']]],
  partners: ['Партнёры', [
    ['id', 'ID'], ['name', 'Название'], ['contact', 'Контактное лицо'], ['phone', 'Телефон'],
    ['contractNo', '№ договора'], ['contractDate', 'Дата договора', 'd'], ['active', 'Активен', 'b'],
    ['notes', 'Заметки'], ['createdAt', 'Создан']]],
  subs: ['Абонементы', [
    ['id', 'ID'], ['clientId', 'ID ученика'], ['clientName', 'Ученик'], ['trainerId', 'ID тренера'], ['trainerName', 'Тренер'],
    ['partnerId', 'ID партнёра'], ['partnerName', 'Партнёр'], ['title', 'Название'], ['hours', 'Часов', 'n'],
    ['price', 'Стоимость', 'n'], ['paid', 'Оплачено', 'n'], ['startDate', 'Начало', 'd'], ['endDate', 'Окончание', 'd'],
    ['status', 'Статус'], ['notes', 'Заметки'], ['createdAt', 'Создан']]],
  lessons: ['Занятия', [
    ['id', 'ID'], ['date', 'Дата', 'd'], ['time', 'Время', 't'], ['hours', 'Часов', 'n'], ['type', 'Тип'],
    ['trainerId', 'ID тренера'], ['trainerName', 'Тренер'], ['clientId', 'ID ученика'], ['clientName', 'Ученик'],
    ['subId', 'ID абонемента'], ['eventId', 'ID группы/мероприятия'], ['notes', 'Заметки'],
    ['createdBy', 'Кто отметил'], ['createdAt', 'Создано']]],
  events: ['Группы и мероприятия', [
    ['id', 'ID'], ['type', 'Тип'], ['title', 'Название'], ['date', 'Дата', 'd'], ['time', 'Время', 't'], ['hours', 'Часов', 'n'],
    ['trainerIds', 'ID тренеров'], ['trainerNames', 'Тренеры'], ['clientIds', 'ID участников'], ['clientNames', 'Участники'],
    ['deduct', 'Списывать с абонемента', 'b'], ['notes', 'Заметки'], ['createdBy', 'Кто создал'], ['createdAt', 'Создано']]],
  slots: ['Расписание', [
    ['id', 'ID'], ['date', 'Дата', 'd'], ['time', 'Время', 't'], ['hours', 'Часов', 'n'], ['trainerId', 'ID тренера'],
    ['trainerName', 'Тренер'], ['type', 'Тип'], ['title', 'Название'], ['capacity', 'Мест', 'n'], ['status', 'Статус'],
    ['resultId', 'ID результата'], ['notes', 'Заметки'], ['createdBy', 'Кто создал'], ['createdAt', 'Создано']]],
  bookings: ['Записи', [
    ['id', 'ID'], ['slotId', 'ID слота'], ['clientId', 'ID ученика'], ['clientName', 'Ученик'], ['status', 'Статус'], ['createdAt', 'Создано']]],
  rent: ['Аренда', [
    ['id', 'ID'], ['date', 'Дата', 'd'], ['time', 'Время', 't'], ['hours', 'Часов', 'n'], ['renter', 'Арендатор'],
    ['hall', 'Зал'], ['amount', 'Сумма', 'n'], ['paid', 'Оплачено', 'b'], ['contractNo', '№ договора'],
    ['notes', 'Заметки'], ['createdAt', 'Создано']]],
  contracts: ['Договоры', [
    ['id', 'ID'], ['number', 'Номер'], ['kind', 'Вид'], ['partyId', 'ID стороны'], ['partyName', 'Сторона'],
    ['date', 'Дата', 'd'], ['notes', 'Заметки'], ['createdAt', 'Создан']]],
  acts: ['Акты', [
    ['id', 'ID'], ['number', 'Номер'], ['trainerId', 'ID тренера'], ['trainerName', 'Тренер'], ['dateFrom', 'С', 'd'],
    ['dateTo', 'По', 'd'], ['hours', 'Часов', 'n'], ['amount', 'Сумма', 'n'], ['docUrl', 'Документ'], ['pdfUrl', 'PDF'],
    ['createdBy', 'Кто создал'], ['createdAt', 'Создан']]],
  messages: ['Чат', [
    ['id', 'ID'], ['channel', 'Канал'], ['userId', 'ID автора'], ['userName', 'Автор'], ['text', 'Текст'], ['createdAt', 'Время']]],
  settings: ['Настройки', [['key', 'Параметр'], ['value', 'Значение']]],
};

const DEFAULT_SETTINGS = {
  clubName: CLUB_NAME,
  clubRequisites: '',
  director: '',
  city: '',
  halls: 'Большой зал, Малый зал',
  lowHours: 2,
  trainerEditDays: 7,
  prefix_client: 'У-', next_client: 1,
  prefix_trainer: 'Т-', next_trainer: 1,
  prefix_partner: 'П-', next_partner: 1,
  prefix_rent: 'А-', next_rent: 1,
  prefix_other: 'Д-', next_other: 1,
  prefix_act: '', next_act: 1,
  actsFolderId: '',
};
const PUBLIC_SETTINGS = ['clubName', 'halls', 'lowHours', 'trainerEditDays'];
const KINDS = { client: 'Ученик', trainer: 'Тренер', partner: 'Партнёр', rent: 'Аренда', other: 'Прочее' };

// ---------------------------------------------------------------------------
// Точки входа
// ---------------------------------------------------------------------------
function doGet() {
  ensureSchema_();
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CLUB_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Запустите один раз из редактора. */
function setup() {
  ensureSchema_();
  const users = tbl_('users').rows;
  if (!users.some(u => u.role === 'admin' && u.active)) {
    const pass = randomPassword_();
    createUser_({ login: 'admin', password: pass, role: 'admin', name: 'Администратор', mustChange: true });
    setSetting_('Первичный пароль admin', pass);
    Logger.log('Создан администратор. Логин: admin  Пароль: ' + pass);
  } else {
    Logger.log('Администратор уже есть. Если забыли пароль — запустите resetAdminPassword().');
  }
  Logger.log('Готово. Теперь: Развернуть → Новое развертывание → Веб-приложение.');
}

/** Сброс пароля admin (если забыли). Новый пароль — в журнале. */
function resetAdminPassword() {
  ensureSchema_();
  const u = tbl_('users').rows.find(x => x.login === 'admin');
  const pass = randomPassword_();
  if (!u) { createUser_({ login: 'admin', password: pass, role: 'admin', name: 'Администратор', mustChange: true }); }
  else {
    const salt = newId_(16);
    update_('users', u.id, { salt, passHash: hash_(pass, salt), active: true, mustChange: true, role: 'admin' });
  }
  Logger.log('Логин: admin  Новый пароль: ' + pass);
}

/** Единая точка вызова из интерфейса. */
function api(token, action, payload) {
  try {
    payload = payload || {};
    if (action === 'login') return { ok: true, data: login_(payload) };
    if (action === 'ping') return { ok: true, data: { club: CLUB_NAME } };
    const user = auth_(token);
    if (!user) return { ok: false, error: 'AUTH', message: 'Сессия истекла — войдите снова' };
    const h = HANDLERS[action];
    if (!h) throw new Error('Неизвестное действие: ' + action);
    if (h.roles.indexOf(user.role) < 0) throw new Error('Недостаточно прав');
    const data = h.write ? withLock_(() => h.fn(user, payload)) : h.fn(user, payload);
    return { ok: true, data: data === undefined ? null : data };
  } catch (e) {
    return { ok: false, error: 'ERR', message: (e && e.message) || String(e) };
  }
}

const HANDLERS = {
  logout: { roles: ALL, write: true, fn: (u, p) => logout_(p.token) },
  load: { roles: ALL, fn: load_ },
  changePassword: { roles: ALL, write: true, fn: changePassword_ },
  clientHistory: { roles: ALL, fn: clientHistory_ },
  report: { roles: ['admin', 'manager', 'trainer'], fn: report_ },

  saveTrainer: { roles: STAFF, write: true, fn: saveTrainer_ },
  saveClient: { roles: STAFF, write: true, fn: saveClient_ },
  savePartner: { roles: STAFF, write: true, fn: savePartner_ },
  saveSub: { roles: STAFF, write: true, fn: saveSub_ },
  deleteSub: { roles: STAFF, write: true, fn: deleteSub_ },
  saveRent: { roles: STAFF, write: true, fn: saveRent_ },
  deleteRent: { roles: STAFF, write: true, fn: (u, p) => del_('rent', p.id) },
  assignContract: { roles: STAFF, write: true, fn: (u, p) => assignContract_(p) },
  makeAct: { roles: STAFF, write: true, fn: makeAct_ },

  saveLesson: { roles: ['admin', 'manager', 'trainer'], write: true, fn: saveLesson_ },
  deleteLesson: { roles: ['admin', 'manager', 'trainer'], write: true, fn: deleteLesson_ },
  saveEvent: { roles: ['admin', 'manager', 'trainer'], write: true, fn: saveEvent_ },
  deleteEvent: { roles: ['admin', 'manager', 'trainer'], write: true, fn: deleteEvent_ },
  saveSlot: { roles: ['admin', 'manager', 'trainer'], write: true, fn: saveSlot_ },
  cancelSlot: { roles: ['admin', 'manager', 'trainer'], write: true, fn: cancelSlot_ },
  completeSlot: { roles: ['admin', 'manager', 'trainer'], write: true, fn: completeSlot_ },

  book: { roles: ['client', 'admin', 'manager'], write: true, fn: book_ },
  cancelBooking: { roles: ['client', 'admin', 'manager', 'trainer'], write: true, fn: cancelBooking_ },

  getMessages: { roles: ALL, fn: getMessages_ },
  postMessage: { roles: ALL, write: true, fn: postMessage_ },
  deleteMessage: { roles: STAFF, write: true, fn: (u, p) => del_('messages', p.id) },

  saveUser: { roles: ['admin'], write: true, fn: saveUser_ },
  saveSettings: { roles: ['admin'], write: true, fn: saveSettings_ },
};

// ---------------------------------------------------------------------------
// Доступ к таблице
// ---------------------------------------------------------------------------
let _ss = null;
const _cache = {};
function ss_() { return _ss || (_ss = SpreadsheetApp.getActive()); }
function tz_() { return ss_().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }

function ensureSchema_() {
  const props = PropertiesService.getScriptProperties();
  const ver = 'schema-3';
  if (props.getProperty('schema') === ver) return;
  const ss = ss_();
  Object.keys(TABLES).forEach(key => {
    const [name, cols] = TABLES[key];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const lastCol = sh.getLastColumn();
    const header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const missing = cols.filter(c => header.indexOf(c[1]) < 0).map(c => c[1]);
    if (missing.length) sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    const full = header.concat(missing);
    sh.getRange(1, 1, 1, full.length).setFontWeight('bold').setBackground('#253559').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    cols.forEach(c => {
      const i = full.indexOf(c[1]) + 1;
      const fmt = c[2] === 'n' ? '0.##' : c[2] === 'b' ? null : '@';
      if (fmt) sh.getRange(2, i, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(fmt);
    });
  });
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Лист1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  const S = settings_();
  Object.keys(DEFAULT_SETTINGS).forEach(k => { if (!(k in S)) setSetting_(k, DEFAULT_SETTINGS[k]); });
  props.setProperty('schema', ver);
}

function norm_(v, type) {
  if (type === 'n') { if (v === '' || v === null || v === undefined) return 0; const n = Number(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
  if (type === 'b') return v === true || v === 1 || /^(true|1|да|yes)$/i.test(String(v));
  if (v instanceof Date) {
    if (type === 't') return Utilities.formatDate(v, tz_(), 'HH:mm');
    if (type === 'd') return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
    return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm:ss');
  }
  return v === null || v === undefined ? '' : String(v);
}

function tbl_(key) {
  if (_cache[key]) return _cache[key];
  const [name, cols] = TABLES[key];
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Нет листа «' + name + '». Запустите setup().');
  const values = sh.getDataRange().getValues();
  const header = (values[0] || []).map(String);
  const idx = {};
  cols.forEach(c => { idx[c[0]] = header.indexOf(c[1]); });
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const raw = values[r];
    if (raw.every(x => x === '' || x === null)) continue;
    const o = {};
    cols.forEach(c => { o[c[0]] = norm_(idx[c[0]] >= 0 ? raw[idx[c[0]]] : '', c[2]); });
    Object.defineProperty(o, '_r', { value: r + 1, writable: true, enumerable: false });
    Object.defineProperty(o, '_raw', { value: raw, writable: true, enumerable: false });
    rows.push(o);
  }
  return (_cache[key] = { key, name, cols, sh, header, idx, rows });
}

function rowFor_(t, o, raw) {
  const row = raw ? raw.slice() : new Array(t.header.length).fill('');
  while (row.length < t.header.length) row.push('');
  const fmts = new Array(t.header.length).fill(null);
  t.cols.forEach(c => {
    const i = t.idx[c[0]];
    if (i < 0) return;
    let v = o[c[0]];
    if (c[2] === 'n') v = v === '' || v === null || v === undefined ? '' : Number(v);
    else if (c[2] === 'b') v = !!v;
    else v = v === null || v === undefined ? '' : String(v);
    row[i] = v;
    fmts[i] = c[2] === 'n' ? '0.##' : c[2] === 'b' ? 'General' : '@';
  });
  for (let i = 0; i < fmts.length; i++) if (!fmts[i]) fmts[i] = 'General';
  return { row, fmts };
}

function insertMany_(key, objs) {
  if (!objs.length) return [];
  const t = tbl_(key);
  const start = t.sh.getLastRow() + 1;
  const rows = [], fmts = [];
  objs.forEach((o, n) => {
    if (t.idx.id !== undefined && !o.id) o.id = newId_();
    if (t.idx.createdAt !== undefined && !o.createdAt) o.createdAt = now_();
    const r = rowFor_(t, o);
    rows.push(r.row); fmts.push(r.fmts);
    const clean = {};
    t.cols.forEach(c => { clean[c[0]] = norm_(o[c[0]], c[2]); });
    Object.defineProperty(clean, '_r', { value: start + n, writable: true, enumerable: false });
    Object.defineProperty(clean, '_raw', { value: r.row, writable: true, enumerable: false });
    t.rows.push(clean);
    o.id = clean.id;
  });
  const range = t.sh.getRange(start, 1, rows.length, t.header.length);
  range.setNumberFormats(fmts);
  range.setValues(rows);
  return objs.map(o => o.id);
}
function insert_(key, o) { return insertMany_(key, [o])[0]; }

function find_(key, id) { return tbl_(key).rows.find(r => r.id === id); }
function must_(key, id, what) { const r = find_(key, id); if (!r) throw new Error((what || 'Запись') + ' не найдена'); return r; }

function update_(key, id, patch) {
  const t = tbl_(key);
  const o = t.rows.find(r => r.id === id);
  if (!o) throw new Error('Запись не найдена');
  t.cols.forEach(c => { if (c[0] in patch && c[0] !== 'id') o[c[0]] = norm_(patch[c[0]], c[2]); });
  const r = rowFor_(t, o, o._raw);
  const range = t.sh.getRange(o._r, 1, 1, t.header.length);
  range.setNumberFormats([r.fmts]);
  range.setValues([r.row]);
  o._raw = r.row;
  return o;
}

function del_(key, ids) {
  ids = [].concat(ids).filter(Boolean);
  if (!ids.length) return 0;
  const t = tbl_(key);
  const rows = t.rows.filter(r => ids.indexOf(r.id) >= 0).map(r => r._r).sort((a, b) => b - a);
  rows.forEach(r => t.sh.deleteRow(r));
  delete _cache[key];
  return rows.length;
}

function settings_() {
  const t = tbl_('settings');
  const S = {};
  t.rows.forEach(r => { if (r.key) S[r.key] = r.value; });
  return S;
}
function setSetting_(k, v) {
  const t = tbl_('settings');
  const r = t.rows.find(x => x.key === k);
  if (r) {
    r.value = String(v);
    const row = rowFor_(t, r, r._raw);
    t.sh.getRange(r._r, 1, 1, t.header.length).setNumberFormats([row.fmts]).setValues([row.row]);
    r._raw = row.row;
  } else insert_('settings', { key: k, value: String(v) });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------
function newId_(len) { return Utilities.getUuid().replace(/-/g, '').slice(0, len || 10); }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function addDays_(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween_(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5); }
function ruDate_(ymd) { return ymd ? ymd.split('-').reverse().join('.') : ''; }
function ids_(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function round2_(n) { return Math.round(n * 100) / 100; }
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function req_(v, msg) { if (v === undefined || v === null || String(v).trim() === '') throw new Error(msg); return v; }
function hash_(pass, salt) {
  let h = salt + '|' + pass;
  for (let i = 0; i < 300; i++) {
    h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt)
      .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
  }
  return h;
}
function randomPassword_() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const u = Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < 10; i++) s += a[parseInt(u.substr(i * 2, 2), 16) % a.length];
  return s;
}
function nameOf_(key, id) { const r = id && find_(key, id); return r ? r.name : ''; }
function hoursOk_(h) { h = Number(h); if (!(h > 0 && h <= 24)) throw new Error('Укажите количество часов'); return round2_(h); }

// ---------------------------------------------------------------------------
// Авторизация
// ---------------------------------------------------------------------------
function createUser_(p) {
  const salt = newId_(16);
  return insert_('users', {
    login: String(p.login).trim().toLowerCase(), name: p.name || p.login, role: p.role,
    trainerId: p.trainerId || '', clientId: p.clientId || '', active: true,
    mustChange: !!p.mustChange, salt, passHash: hash_(p.password, salt)
  });
}

function login_(p) {
  const login = String(p.login || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + login;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 8) throw new Error('Слишком много попыток. Подождите 15 минут.');
  const u = tbl_('users').rows.find(x => x.login === login && x.active);
  if (!u || hash_(String(p.password || ''), u.salt) !== u.passHash) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('Неверный логин или пароль');
  }
  cache.remove(failKey);
  const token = newId_(32) + newId_(32);
  withLock_(() => {
    const t = tbl_('sessions');
    const old = t.rows.filter(s => s.expiresAt < Date.now()).map(s => s.token);
    if (old.length) { // очистка просроченных
      const rows = t.rows.filter(s => old.indexOf(s.token) >= 0).map(s => s._r).sort((a, b) => b - a);
      rows.forEach(r => t.sh.deleteRow(r)); delete _cache.sessions;
    }
    insert_('sessions', { token, userId: u.id, expiresAt: Date.now() + SESSION_DAYS * 864e5 });
  });
  cache.put('s_' + token, u.id, 21600);
  return { token, user: pubUser_(u) };
}

function auth_(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  let uid = cache.get('s_' + token);
  if (!uid) {
    const s = tbl_('sessions').rows.find(x => x.token === token);
    if (!s || s.expiresAt < Date.now()) return null;
    uid = s.userId;
    cache.put('s_' + token, uid, 21600);
  }
  const u = find_('users', uid);
  if (!u || !u.active) return null;
  u.token = token;
  return u;
}

function logout_(token) {
  CacheService.getScriptCache().remove('s_' + token);
  const t = tbl_('sessions');
  const s = t.rows.find(x => x.token === token);
  if (s) { t.sh.deleteRow(s._r); delete _cache.sessions; }
  return true;
}

function pubUser_(u) {
  return { id: u.id, login: u.login, name: u.name, role: u.role, trainerId: u.trainerId, clientId: u.clientId, mustChange: u.mustChange };
}

function changePassword_(user, p) {
  if (hash_(String(p.old || ''), user.salt) !== user.passHash) throw new Error('Текущий пароль неверный');
  if (String(p.new || '').length < 6) throw new Error('Новый пароль — минимум 6 символов');
  const salt = newId_(16);
  update_('users', user.id, { salt, passHash: hash_(p.new, salt), mustChange: false });
  if (user.login === 'admin') setSetting_('Первичный пароль admin', '(изменён)');
  return true;
}

function saveUser_(admin, p) {
  const login = String(req_(p.login, 'Укажите логин')).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new Error('Логин: латиница, цифры, точка, дефис; 3–30 символов');
  if (ALL.indexOf(p.role) < 0) throw new Error('Неверная роль');
  if (p.role === 'trainer' && !p.trainerId) throw new Error('Выберите тренера для этого логина');
  if (p.role === 'client' && !p.clientId) throw new Error('Выберите ученика для этого логина');
  const users = tbl_('users').rows;
  if (users.some(u => u.login === login && u.id !== p.id)) throw new Error('Такой логин уже есть');
  const data = {
    login, role: p.role, name: p.name || nameOf_('trainers', p.trainerId) || nameOf_('clients', p.clientId) || login,
    trainerId: p.role === 'trainer' ? p.trainerId : '', clientId: p.role === 'client' ? p.clientId : '',
    active: p.active !== false
  };
  if (p.id) {
    if (p.id === admin.id && (data.role !== 'admin' || !data.active)) throw new Error('Нельзя снять права с самого себя');
    if (p.password) {
      if (String(p.password).length < 6) throw new Error('Пароль — минимум 6 символов');
      data.salt = newId_(16); data.passHash = hash_(p.password, data.salt); data.mustChange = true;
    }
    update_('users', p.id, data);
    if (!data.active || p.password) { // завершить сессии
      const st = tbl_('sessions');
      const mine = st.rows.filter(s => s.userId === p.id);
      mine.forEach(s => CacheService.getScriptCache().remove('s_' + s.token));
      mine.map(s => s._r).sort((a, b) => b - a).forEach(r => st.sh.deleteRow(r));
      delete _cache.sessions;
    }
    return p.id;
  }
  if (String(p.password || '').length < 6) throw new Error('Пароль — минимум 6 символов');
  return createUser_(Object.assign(data, { password: p.password, mustChange: true }));
}

function saveSettings_(u, p) {
  const allowed = Object.keys(DEFAULT_SETTINGS).filter(k => k !== 'actsFolderId');
  Object.keys(p).forEach(k => { if (allowed.indexOf(k) >= 0) setSetting_(k, p[k]); });
  return true;
}

// ---------------------------------------------------------------------------
// Абонементы: остаток
// ---------------------------------------------------------------------------
function usage_() {
  const used = {};
  tbl_('lessons').rows.forEach(l => { if (l.subId) used[l.subId] = (used[l.subId] || 0) + l.hours; });
  return used;
}
function subView_(s, used, S, today) {
  const u = round2_(used[s.id] || 0);
  const rem = round2_(s.hours - u);
  let state = 'ok';
  if (s.status === 'closed') state = 'closed';
  else if (s.status === 'frozen') state = 'frozen';
  else if (rem <= 0) state = 'ended';
  else if (s.endDate && s.endDate < today) state = 'expired';
  else if (rem <= Number(S.lowHours || 2)) state = 'low';
  return Object.assign({}, s, { used: u, remaining: rem, state });
}
function pickSub_(clientId, trainerIds, date, hours) {
  const used = usage_();
  const S = settings_();
  trainerIds = [].concat(trainerIds).filter(Boolean);
  const cands = tbl_('subs').rows
    .filter(s => s.clientId === clientId && (s.status || 'active') === 'active')
    .filter(s => !s.trainerId || trainerIds.indexOf(s.trainerId) >= 0)
    .filter(s => !s.endDate || s.endDate >= date)
    .map(s => subView_(s, used, S, date))
    .filter(s => s.remaining > 0)
    .sort((a, b) => (b.trainerId ? 1 : 0) - (a.trainerId ? 1 : 0) || String(a.endDate || '9999').localeCompare(String(b.endDate || '9999')));
  return cands.length ? cands[0].id : '';
}

// ---------------------------------------------------------------------------
// Видимость данных по ролям
// ---------------------------------------------------------------------------
function trainerClientIds_(trainerId) {
  const set = {};
  tbl_('clients').rows.forEach(c => { if (ids_(c.trainerIds).indexOf(trainerId) >= 0) set[c.id] = 1; });
  tbl_('subs').rows.forEach(s => { if (s.trainerId === trainerId && (s.status || 'active') === 'active') set[s.clientId] = 1; });
  return set;
}
function canSeeClient_(user, clientId) {
  if (STAFF.indexOf(user.role) >= 0) return true;
  if (user.role === 'client') return user.clientId === clientId;
  if (user.role === 'trainer') return !!trainerClientIds_(user.trainerId)[clientId];
  return false;
}

function load_(user) {
  const S = settings_();
  const today = today_();
  const from = addDays_(today, -62);
  const staff = STAFF.indexOf(user.role) >= 0;
  const used = usage_();
  const res = { user: pubUser_(user), today, club: CLUB_NAME, settings: {} };
  (staff && user.role === 'admin' ? Object.keys(S) : PUBLIC_SETTINGS).forEach(k => {
    if (k !== 'Первичный пароль admin') res.settings[k] = S[k];
  });
  if (user.role === 'admin') res.settings.spreadsheetUrl = ss_().getUrl();

  const trainers = tbl_('trainers').rows;
  const clients = tbl_('clients').rows;
  const subs = tbl_('subs').rows.map(s => subView_(s, used, S, today));
  const lessons = tbl_('lessons').rows.filter(l => l.date >= from);
  const events = tbl_('events').rows.filter(e => e.date >= from);
  const slots = tbl_('slots').rows.filter(s => s.date >= addDays_(today, -14));
  const slotIds = {}; slots.forEach(s => { slotIds[s.id] = 1; });
  const bookings = tbl_('bookings').rows.filter(b => slotIds[b.slotId]);
  const lite = arr => arr.map(x => ({ id: x.id, name: x.name, active: x.active }));

  if (staff) {
    Object.assign(res, {
      trainers, clients, subs, lessons, events, slots, bookings,
      partners: tbl_('partners').rows, rent: tbl_('rent').rows,
      contracts: tbl_('contracts').rows, acts: tbl_('acts').rows,
    });
    if (user.role === 'admin') res.users = tbl_('users').rows.map(pubUserFull_);
  } else if (user.role === 'trainer') {
    const mine = trainerClientIds_(user.trainerId);
    const me = trainers.find(t => t.id === user.trainerId);
    Object.assign(res, {
      me,
      trainers: trainers.map(t => ({ id: t.id, name: t.name, spec: t.spec, active: t.active })),
      clients: clients.filter(c => mine[c.id]).map(c => ({ id: c.id, name: c.name, phone: c.phone, company: c.company, trainerIds: c.trainerIds, notes: c.notes, active: c.active, birthDate: c.birthDate })),
      allClients: lite(clients.filter(c => c.active)),
      subs: subs.filter(s => mine[s.clientId]).map(s => { const x = Object.assign({}, s); delete x.price; delete x.paid; return x; }),
      lessons: lessons.filter(l => l.trainerId === user.trainerId),
      events: events.filter(e => ids_(e.trainerIds).indexOf(user.trainerId) >= 0),
      slots: slots.filter(s => s.trainerId === user.trainerId),
    });
    const my = {}; res.slots.forEach(s => { my[s.id] = 1; });
    res.bookings = bookings.filter(b => my[b.slotId]);
  } else { // client
    const cid = user.clientId;
    const me = clients.find(c => c.id === cid);
    const fut = slots.filter(s => s.date >= today && s.status !== 'cancelled');
    const cnt = {};
    bookings.forEach(b => { if (b.status === 'booked') cnt[b.slotId] = (cnt[b.slotId] || 0) + 1; });
    Object.assign(res, {
      me: me ? { id: me.id, name: me.name, contractNo: me.contractNo, trainerIds: me.trainerIds } : null,
      trainers: trainers.filter(t => t.active).map(t => ({ id: t.id, name: t.name, spec: t.spec })),
      subs: subs.filter(s => s.clientId === cid).map(s => { const x = Object.assign({}, s); delete x.notes; return x; }),
      lessons: tbl_('lessons').rows.filter(l => l.clientId === cid),
      slots: fut.filter(s => s.status === 'open').map(s => Object.assign({}, s, { booked: cnt[s.id] || 0 })),
      bookings: bookings.filter(b => b.clientId === cid),
    });
  }
  return res;
}
function pubUserFull_(u) { const x = pubUser_(u); x.active = u.active; x.createdAt = u.createdAt; return x; }

// ---------------------------------------------------------------------------
// Справочники
// ---------------------------------------------------------------------------
function saveTrainer_(u, p) {
  const d = {
    name: String(req_(p.name, 'Укажите ФИО')).trim(), phone: p.phone || '', email: p.email || '', spec: p.spec || '',
    rateInd: Number(p.rateInd) || 0, rateGroup: Number(p.rateGroup) || 0, rateEvent: Number(p.rateEvent) || 0,
    active: p.active !== false, notes: p.notes || ''
  };
  let id = p.id;
  if (id) update_('trainers', id, d); else id = insert_('trainers', d);
  if (p.makeContract && !find_('trainers', id).contractNo) assignContract_({ kind: 'trainer', partyId: id, date: p.contractDate });
  return id;
}

function saveClient_(u, p) {
  const tids = [].concat(p.trainerIds || []).filter(Boolean);
  const d = {
    name: String(req_(p.name, 'Укажите ФИО')).trim(), phone: p.phone || '', email: p.email || '',
    birthDate: isDate_(p.birthDate) ? p.birthDate : '', company: p.company || '',
    trainerIds: tids.join(','), trainerNames: tids.map(t => nameOf_('trainers', t)).join(', '),
    partnerId: p.partnerId || '', active: p.active !== false, notes: p.notes || ''
  };
  let id = p.id;
  if (id) update_('clients', id, d); else id = insert_('clients', d);
  if (p.makeContract && !find_('clients', id).contractNo) assignContract_({ kind: 'client', partyId: id, date: p.contractDate });
  return id;
}

function savePartner_(u, p) {
  const d = { name: String(req_(p.name, 'Укажите название')).trim(), contact: p.contact || '', phone: p.phone || '', active: p.active !== false, notes: p.notes || '' };
  let id = p.id;
  if (id) update_('partners', id, d); else id = insert_('partners', d);
  if (p.makeContract && !find_('partners', id).contractNo) assignContract_({ kind: 'partner', partyId: id, date: p.contractDate });
  return id;
}

function saveSub_(u, p) {
  const c = must_('clients', req_(p.clientId, 'Выберите ученика'), 'Ученик');
  const hours = Number(p.hours);
  if (!(hours > 0)) throw new Error('Укажите количество часов абонемента');
  const d = {
    clientId: c.id, clientName: c.name, trainerId: p.trainerId || '', trainerName: nameOf_('trainers', p.trainerId),
    partnerId: p.partnerId || '', partnerName: nameOf_('partners', p.partnerId), title: p.title || 'Абонемент ' + hours + ' ч',
    hours, price: Number(p.price) || 0, paid: Number(p.paid) || 0,
    startDate: isDate_(p.startDate) ? p.startDate : today_(), endDate: isDate_(p.endDate) ? p.endDate : '',
    status: ['active', 'frozen', 'closed'].indexOf(p.status) >= 0 ? p.status : 'active', notes: p.notes || ''
  };
  let id = p.id;
  if (id) update_('subs', id, d); else id = insert_('subs', d);
  if (d.trainerId && ids_(c.trainerIds).indexOf(d.trainerId) < 0) { // закрепить тренера за учеником
    const t = ids_(c.trainerIds).concat(d.trainerId);
    update_('clients', c.id, { trainerIds: t.join(','), trainerNames: t.map(x => nameOf_('trainers', x)).join(', ') });
  }
  return id;
}

function deleteSub_(u, p) {
  if (tbl_('lessons').rows.some(l => l.subId === p.id)) throw new Error('По абонементу уже есть занятия. Поставьте статус «Закрыт» вместо удаления.');
  return del_('subs', p.id);
}

function saveRent_(u, p) {
  const d = {
    date: isDate_(p.date) ? p.date : today_(), time: p.time || '', hours: hoursOk_(p.hours),
    renter: String(req_(p.renter, 'Укажите арендатора')).trim(), hall: p.hall || '', amount: Number(p.amount) || 0,
    paid: !!p.paid, notes: p.notes || ''
  };
  let id = p.id;
  if (id) update_('rent', id, d); else id = insert_('rent', d);
  if (p.makeContract && !find_('rent', id).contractNo) assignContract_({ kind: 'rent', partyId: id, date: d.date });
  return id;
}

// Сквозная нумерация договоров
function assignContract_(p) {
  const kind = KINDS[p.kind] ? p.kind : 'other';
  const S = settings_();
  const n = Math.max(1, parseInt(S['next_' + kind], 10) || 1);
  const number = (S['prefix_' + kind] || '') + String(n).padStart(4, '0');
  const date = isDate_(p.date) ? p.date : today_();
  const tableOf = { client: 'clients', trainer: 'trainers', partner: 'partners', rent: 'rent' }[kind];
  let partyName = p.partyName || '';
  if (tableOf && p.partyId) {
    const party = must_(tableOf, p.partyId, 'Сторона договора');
    if (party.contractNo && !p.force) throw new Error('У этой записи уже есть договор № ' + party.contractNo);
    partyName = party.name || party.renter;
    const patch = { contractNo: number };
    if (kind !== 'rent') patch.contractDate = date;
    update_(tableOf, party.id, patch);
  }
  if (!partyName) throw new Error('Укажите сторону договора');
  insert_('contracts', { number, kind, partyId: p.partyId || '', partyName, date, notes: p.notes || '' });
  setSetting_('next_' + kind, n + 1);
  return number;
}

// ---------------------------------------------------------------------------
// Занятия
// ---------------------------------------------------------------------------
function trainerOf_(user, p) {
  if (user.role === 'trainer') {
    if (!user.trainerId) throw new Error('Логин не привязан к тренеру');
    return user.trainerId;
  }
  return req_(p.trainerId, 'Выберите тренера');
}
function checkEditWindow_(user, rec) {
  if (user.role !== 'trainer') return;
  const days = Number(settings_().trainerEditDays || 7);
  const created = String(rec.createdAt || '').slice(0, 10) || rec.date;
  if (daysBetween_(created, today_()) > days) throw new Error('Изменять можно только записи за последние ' + days + ' дн. Обратитесь к администратору.');
}

function saveLesson_(user, p) {
  const trainerId = trainerOf_(user, p);
  const t = must_('trainers', trainerId, 'Тренер');
  const c = must_('clients', req_(p.clientId, 'Выберите ученика'), 'Ученик');
  if (!canSeeClient_(user, c.id)) throw new Error('Ученик не закреплён за вами');
  const date = isDate_(p.date) ? p.date : today_();
  const hours = hoursOk_(p.hours);
  if (p.id) {
    const old = must_('lessons', p.id, 'Занятие');
    if (old.eventId) throw new Error('Это занятие группы — измените группу/мероприятие');
    if (user.role === 'trainer' && old.trainerId !== user.trainerId) throw new Error('Можно изменять только свои занятия');
    checkEditWindow_(user, old);
  }
  let subId = p.subId === 'auto' || p.subId === undefined ? pickSub_(c.id, [trainerId], date, hours) : (p.subId || '');
  if (subId) {
    const s = must_('subs', subId, 'Абонемент');
    if (s.clientId !== c.id) throw new Error('Абонемент другого ученика');
  }
  const d = {
    date, time: p.time || '', hours, type: 'ind', trainerId, trainerName: t.name, clientId: c.id, clientName: c.name,
    subId, eventId: '', notes: p.notes || ''
  };
  if (p.id) { update_('lessons', p.id, d); return p.id; }
  d.createdBy = user.name;
  return insert_('lessons', d);
}

function deleteLesson_(user, p) {
  const l = must_('lessons', p.id, 'Занятие');
  if (l.eventId) throw new Error('Это занятие группы — удалите участника в группе/мероприятии');
  if (user.role === 'trainer') {
    if (l.trainerId !== user.trainerId) throw new Error('Можно удалять только свои занятия');
    checkEditWindow_(user, l);
  }
  return del_('lessons', l.id);
}

function saveEvent_(user, p) {
  const type = p.type === 'event' ? 'event' : 'group';
  const tids = [].concat(p.trainerIds || []).filter(Boolean);
  if (user.role === 'trainer' && tids.indexOf(user.trainerId) < 0) tids.unshift(user.trainerId);
  if (!tids.length) throw new Error('Выберите тренера');
  tids.forEach(id => must_('trainers', id, 'Тренер'));
  const cids = [].concat(p.clientIds || []).filter(Boolean);
  cids.forEach(id => must_('clients', id, 'Ученик'));
  const date = isDate_(p.date) ? p.date : today_();
  const hours = hoursOk_(p.hours);
  if (p.id) {
    const old = must_('events', p.id, 'Запись');
    if (user.role === 'trainer') {
      if (ids_(old.trainerIds).indexOf(user.trainerId) < 0) throw new Error('Это не ваша группа');
      checkEditWindow_(user, old);
    }
  }
  const d = {
    type, title: String(req_(p.title, 'Укажите название')).trim(), date, time: p.time || '', hours,
    trainerIds: tids.join(','), trainerNames: tids.map(x => nameOf_('trainers', x)).join(', '),
    clientIds: cids.join(','), clientNames: cids.map(x => nameOf_('clients', x)).join(', '),
    deduct: !!p.deduct, notes: p.notes || ''
  };
  let id = p.id;
  if (id) update_('events', id, d); else { d.createdBy = user.name; id = insert_('events', d); }
  writeEventLessons_(user, id, d, p.subs || {});
  return id;
}

function writeEventLessons_(user, eventId, ev, subChoice) {
  del_('lessons', tbl_('lessons').rows.filter(l => l.eventId === eventId).map(l => l.id));
  const tids = ids_(ev.trainerIds);
  const main = find_('trainers', tids[0]);
  const rows = ids_(ev.clientIds).map(cid => {
    let subId = '';
    if (ev.deduct) subId = subChoice[cid] && subChoice[cid] !== 'auto' ? subChoice[cid] : pickSub_(cid, tids, ev.date, ev.hours);
    return {
      date: ev.date, time: ev.time, hours: ev.hours, type: ev.type, trainerId: main.id, trainerName: main.name,
      clientId: cid, clientName: nameOf_('clients', cid), subId, eventId, notes: ev.title, createdBy: user.name
    };
  });
  insertMany_('lessons', rows);
}

function deleteEvent_(user, p) {
  const e = must_('events', p.id, 'Запись');
  if (user.role === 'trainer') {
    if (ids_(e.trainerIds).indexOf(user.trainerId) < 0) throw new Error('Это не ваша группа');
    checkEditWindow_(user, e);
  }
  del_('lessons', tbl_('lessons').rows.filter(l => l.eventId === e.id).map(l => l.id));
  return del_('events', e.id);
}

function clientHistory_(user, p) {
  const cid = p.clientId || user.clientId;
  if (!canSeeClient_(user, cid)) throw new Error('Нет доступа к ученику');
  const S = settings_();
  const used = usage_();
  return {
    lessons: tbl_('lessons').rows.filter(l => l.clientId === cid).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    subs: tbl_('subs').rows.filter(s => s.clientId === cid).map(s => subView_(s, used, S, today_())),
  };
}

// ---------------------------------------------------------------------------
// Расписание и запись клиентов
// ---------------------------------------------------------------------------
function saveSlot_(user, p) {
  const trainerId = trainerOf_(user, p);
  const t = must_('trainers', trainerId, 'Тренер');
  const type = p.type === 'group' ? 'group' : 'ind';
  const d = {
    date: req_(isDate_(p.date) ? p.date : '', 'Укажите дату'), time: req_(p.time, 'Укажите время'), hours: hoursOk_(p.hours),
    trainerId, trainerName: t.name, type, title: p.title || (type === 'ind' ? 'Индивидуальное' : 'Групповое'),
    capacity: type === 'ind' ? 1 : Math.max(1, Number(p.capacity) || 10), notes: p.notes || ''
  };
  const repeat = Math.min(Math.max(Number(p.repeatWeeks) || 0, 0), 12);
  if (p.id) {
    const old = must_('slots', p.id, 'Слот');
    if (user.role === 'trainer' && old.trainerId !== user.trainerId) throw new Error('Это не ваш слот');
    update_('slots', p.id, d);
    return p.id;
  }
  const rows = [];
  for (let w = 0; w <= repeat; w++) rows.push(Object.assign({}, d, { date: addDays_(d.date, 7 * w), status: 'open', createdBy: user.name }));
  return insertMany_('slots', rows)[0];
}

function slotAccess_(user, id) {
  const s = must_('slots', id, 'Слот');
  if (user.role === 'trainer' && s.trainerId !== user.trainerId) throw new Error('Это не ваш слот');
  return s;
}

function cancelSlot_(user, p) {
  const s = slotAccess_(user, p.id);
  const bs = tbl_('bookings').rows.filter(b => b.slotId === s.id);
  if (!bs.length) { del_('slots', s.id); return 'deleted'; }
  update_('slots', s.id, { status: 'cancelled' });
  bs.forEach(b => { if (b.status === 'booked') update_('bookings', b.id, { status: 'cancelled' }); });
  return 'cancelled';
}

function completeSlot_(user, p) {
  const s = slotAccess_(user, p.id);
  if (s.status === 'done') throw new Error('Слот уже отмечен');
  const cids = [].concat(p.clientIds || []).filter(Boolean);
  if (!cids.length) throw new Error('Отметьте, кто пришёл');
  const hours = p.hours ? hoursOk_(p.hours) : s.hours;
  let resultId;
  const asUser = Object.assign({}, user, { role: user.role === 'trainer' ? 'admin' : user.role }); // клиенты из записи доступны тренеру
  if (s.type === 'ind' && cids.length === 1) {
    resultId = saveLesson_(asUser, { trainerId: s.trainerId, clientId: cids[0], date: s.date, time: s.time, hours, subId: 'auto', notes: 'По записи' });
  } else {
    resultId = saveEvent_(asUser, { type: 'group', title: s.title, date: s.date, time: s.time, hours, trainerIds: [s.trainerId], clientIds: cids, deduct: true, notes: 'По записи' });
  }
  update_('slots', s.id, { status: 'done', resultId });
  tbl_('bookings').rows.filter(b => b.slotId === s.id && b.status !== 'cancelled')
    .forEach(b => update_('bookings', b.id, { status: cids.indexOf(b.clientId) >= 0 ? 'attended' : 'missed' }));
  return resultId;
}

function book_(user, p) {
  const s = must_('slots', p.slotId, 'Слот');
  const cid = user.role === 'client' ? user.clientId : req_(p.clientId, 'Выберите ученика');
  const c = must_('clients', cid, 'Ученик');
  if (s.status !== 'open') throw new Error('Запись на этот слот закрыта');
  if (s.date < today_()) throw new Error('Слот уже прошёл');
  const bs = tbl_('bookings').rows.filter(b => b.slotId === s.id && b.status === 'booked');
  if (bs.some(b => b.clientId === cid)) throw new Error('Вы уже записаны');
  if (bs.length >= (s.capacity || 1)) throw new Error('Свободных мест нет');
  return insert_('bookings', { slotId: s.id, clientId: cid, clientName: c.name, status: 'booked' });
}

function cancelBooking_(user, p) {
  const b = must_('bookings', p.id, 'Запись');
  const s = must_('slots', b.slotId, 'Слот');
  if (user.role === 'client' && b.clientId !== user.clientId) throw new Error('Это не ваша запись');
  if (user.role === 'trainer' && s.trainerId !== user.trainerId) throw new Error('Это не ваш слот');
  if (user.role === 'client' && s.date < today_()) throw new Error('Слот уже прошёл');
  update_('bookings', b.id, { status: 'cancelled' });
  return true;
}

// ---------------------------------------------------------------------------
// Отчёты и акты
// ---------------------------------------------------------------------------
/** Плоский список фактов за период: th — часы тренера, ch — часы ученика. */
function facts_(from, to, trainerFilter) {
  const facts = [];
  tbl_('lessons').rows.forEach(l => {
    if (l.date < from || l.date > to) return;
    if (l.eventId) facts.push({ date: l.date, tr: l.trainerId, cl: l.clientId, type: l.type, th: 0, ch: l.hours, n: 0, ev: l.eventId, sub: l.subId });
    else facts.push({ date: l.date, tr: l.trainerId, cl: l.clientId, type: 'ind', th: l.hours, ch: l.hours, n: 1, sub: l.subId });
  });
  tbl_('events').rows.forEach(e => {
    if (e.date < from || e.date > to) return;
    ids_(e.trainerIds).forEach(tid => facts.push({ date: e.date, tr: tid, cl: '', type: e.type, th: e.hours, ch: 0, n: 1, ev: e.id, title: e.title }));
  });
  return trainerFilter ? facts.filter(f => f.tr === trainerFilter) : facts;
}

function report_(user, p) {
  const from = isDate_(p.from) ? p.from : today_().slice(0, 8) + '01';
  const to = isDate_(p.to) ? p.to : today_();
  const tr = user.role === 'trainer' ? user.trainerId : (p.trainerId || '');
  const facts = facts_(from, to, tr);
  const res = { from, to, facts };
  const evIds = {}; facts.forEach(f => { if (f.ev) evIds[f.ev] = 1; });
  res.events = tbl_('events').rows.filter(e => evIds[e.id]).map(e => ({ id: e.id, title: e.title, type: e.type, date: e.date, hours: e.hours, clientIds: e.clientIds }));
  if (user.role === 'trainer') {
    const cl = {}; facts.forEach(f => { if (f.cl) cl[f.cl] = 1; });
    res.clients = tbl_('clients').rows.filter(c => cl[c.id]).map(c => ({ id: c.id, name: c.name, company: c.company }));
  }
  return res;
}

function actCalc_(trainerId, from, to) {
  const t = must_('trainers', trainerId, 'Тренер');
  const f = facts_(from, to, trainerId).filter(x => x.th > 0);
  const sum = type => round2_(f.filter(x => x.type === type).reduce((a, x) => a + x.th, 0));
  const lines = [
    ['Индивидуальные занятия', sum('ind'), t.rateInd],
    ['Групповые занятия', sum('group'), t.rateGroup],
    ['Мероприятия', sum('event'), t.rateEvent],
  ].filter(l => l[1] > 0).map(l => ({ name: l[0], hours: l[1], rate: l[2], amount: round2_(l[1] * l[2]) }));
  return { t, f, lines, hours: round2_(lines.reduce((a, l) => a + l.hours, 0)), amount: round2_(lines.reduce((a, l) => a + l.amount, 0)) };
}

function makeAct_(user, p) {
  const from = req_(isDate_(p.from) ? p.from : '', 'Укажите период');
  const to = req_(isDate_(p.to) ? p.to : '', 'Укажите период');
  const calc = actCalc_(req_(p.trainerId, 'Выберите тренера'), from, to);
  if (!calc.hours) throw new Error('За период у тренера нет отработанных часов');
  const S = settings_();
  const n = Math.max(1, parseInt(S.next_act, 10) || 1);
  const number = (S.prefix_act || '') + n;
  const t = calc.t;
  const money = v => Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const doc = DocumentApp.create('Акт № ' + number + ' — ' + t.name + ' — ' + ruDate_(from) + '–' + ruDate_(to));
  const body = doc.getBody();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(40);
  const center = DocumentApp.HorizontalAlignment.CENTER;
  body.appendParagraph(S.clubName || CLUB_NAME).setAlignment(center).setFontSize(10).setForegroundColor('#253559');
  body.appendParagraph('АКТ № ' + number).setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(center);
  body.appendParagraph('об оказанных услугах').setAlignment(center);
  body.appendParagraph((S.city ? 'г. ' + S.city + '                                                            ' : '') + ruDate_(today_())).setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  body.appendParagraph('Исполнитель: ' + t.name + (t.contractNo ? ', договор № ' + t.contractNo + (t.contractDate ? ' от ' + ruDate_(t.contractDate) : '') : ''));
  body.appendParagraph('Заказчик: ' + (S.clubName || CLUB_NAME) + (S.clubRequisites ? ', ' + S.clubRequisites : ''));
  body.appendParagraph('Период оказания услуг: с ' + ruDate_(from) + ' по ' + ruDate_(to));
  const rows = [['№', 'Наименование услуг', 'Кол-во часов', 'Ставка, ₽/ч', 'Сумма, ₽']];
  const hh = v => String(v).replace('.', ',');
  calc.lines.forEach((l, i) => rows.push([String(i + 1), l.name, hh(l.hours), money(l.rate), money(l.amount)]));
  rows.push(['', 'Итого', hh(calc.hours), '', money(calc.amount)]);
  const tbl = body.appendTable(rows);
  tbl.getRow(0).editAsText().setBold(true);
  tbl.getRow(rows.length - 1).editAsText().setBold(true);
  body.appendParagraph('Всего оказано услуг на сумму ' + money(calc.amount) + ' руб. Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.');

  // Расшифровка: с кем и сколько
  body.appendParagraph('Расшифровка').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const byClient = {};
  calc.f.filter(x => x.type === 'ind').forEach(x => { byClient[x.cl] = (byClient[x.cl] || 0) + x.th; });
  const det = [['Ученик / группа', 'Дата', 'Часов']];
  Object.keys(byClient).sort((a, b) => nameOf_('clients', a).localeCompare(nameOf_('clients', b)))
    .forEach(cid => det.push([nameOf_('clients', cid) + ' (индивидуально)', 'за период', hh(round2_(byClient[cid]))]));
  calc.f.filter(x => x.type !== 'ind').sort((a, b) => a.date.localeCompare(b.date))
    .forEach(x => det.push([(x.type === 'event' ? 'Мероприятие: ' : 'Группа: ') + (x.title || ''), ruDate_(x.date), hh(x.th)]));
  const dt = body.appendTable(det);
  dt.getRow(0).editAsText().setBold(true);
  dt.editAsText().setFontSize(9);

  body.appendParagraph('');
  const sig = body.appendTable([
    ['Исполнитель', 'Заказчик'],
    ['_______________ / ' + t.name, '_______________ / ' + (S.director || '')],
  ]);
  sig.setBorderWidth(0);
  doc.saveAndClose();

  const folder = actsFolder_(S);
  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder);
  const pdf = folder.createFile(file.getAs('application/pdf')).setName(doc.getName() + '.pdf');
  setSetting_('next_act', n + 1);
  insert_('acts', {
    number, trainerId: t.id, trainerName: t.name, dateFrom: from, dateTo: to, hours: calc.hours, amount: calc.amount,
    docUrl: doc.getUrl(), pdfUrl: pdf.getUrl(), createdBy: user.name
  });
  return { number, docUrl: doc.getUrl(), pdfUrl: pdf.getUrl(), hours: calc.hours, amount: calc.amount };
}

function actsFolder_(S) {
  if (S.actsFolderId) { try { return DriveApp.getFolderById(S.actsFolderId); } catch (e) { /* создадим заново */ } }
  const parent = DriveApp.getFileById(ss_().getId()).getParents();
  const base = parent.hasNext() ? parent.next() : DriveApp.getRootFolder();
  const f = base.createFolder('Акты — ' + CLUB_NAME);
  setSetting_('actsFolderId', f.getId());
  return f;
}

// ---------------------------------------------------------------------------
// Чат и объявления
// ---------------------------------------------------------------------------
function channelAccess_(user, channel, write) {
  if (channel === 'staff') { if (user.role === 'client') throw new Error('Нет доступа'); return; }
  if (channel === 'news') { if (write && STAFF.indexOf(user.role) < 0) throw new Error('Объявления публикует администрация'); return; }
  throw new Error('Неизвестный канал');
}
function getMessages_(user, p) {
  channelAccess_(user, p.channel, false);
  return tbl_('messages').rows.filter(m => m.channel === p.channel).slice(-150);
}
function postMessage_(user, p) {
  channelAccess_(user, p.channel, true);
  const text = String(p.text || '').trim().slice(0, 2000);
  if (!text) throw new Error('Пустое сообщение');
  return insert_('messages', { channel: p.channel, userId: user.id, userName: user.name, text });
}
