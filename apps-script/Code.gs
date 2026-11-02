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
    ['notes', 'Заметки'], ['createdAt', 'Создан'],
    ['phone2', 'Доп. телефон'], ['telegram', 'Мессенджер'], ['address', 'Адрес'], ['birthDate', 'Дата рождения', 'd'],
    ['height', 'Рост, см', 'n'], ['programs', 'Программы'], ['rateTour', 'Ставка турнир, ₽', 'n'],
    ['rates', 'Ставки по видам (JSON)'], ['extra', 'Доп. поля (JSON)'], ['gender', 'Пол']]],
  clients: ['Ученики', [
    ['id', 'ID'], ['name', 'ФИО'], ['phone', 'Телефон'], ['email', 'Email'], ['birthDate', 'Дата рождения', 'd'],
    ['company', 'Компания'], ['trainerIds', 'ID тренеров'], ['trainerNames', 'Тренеры'], ['partnerId', 'ID партнёра'],
    ['contractNo', '№ договора'], ['contractDate', 'Дата договора', 'd'], ['active', 'Активен', 'b'],
    ['notes', 'Заметки'], ['createdAt', 'Создан'], ['extra', 'Доп. поля (JSON)'], ['gender', 'Пол']]],
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
    ['deduct', 'Списывать с абонемента', 'b'], ['notes', 'Заметки'], ['createdBy', 'Кто создал'], ['createdAt', 'Создано'],
    ['groupId', 'ID группы'], ['location', 'Место'], ['results', 'Итоги']]],
  groups: ['Группы', [
    ['id', 'ID'], ['name', 'Название'], ['typeId', 'Вид'], ['trainerIds', 'ID тренеров'], ['trainerNames', 'Тренеры'],
    ['clientIds', 'ID участников'], ['clientNames', 'Участники'], ['schedule', 'Расписание'], ['notes', 'Заметки'],
    ['active', 'Активна', 'b'], ['createdAt', 'Создана']]],
  dict: ['Справочники', [
    ['id', 'ID'], ['list', 'Список'], ['name', 'Название'], ['kind', 'Категория'], ['mode', 'Режим'],
    ['rate', 'Ставка по умолч.', 'n'], ['deduct', 'Списывать с абонемента', 'b'], ['options', 'Варианты'],
    ['color', 'Цвет'], ['order', 'Порядок', 'n'], ['active', 'Активен', 'b'], ['createdAt', 'Создан']]],
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
    ['date', 'Дата', 'd'], ['notes', 'Заметки'], ['createdAt', 'Создан'],
    ['endDate', 'Действует до', 'd'], ['amount', 'Сумма', 'n'], ['fileId', 'Файл ID'], ['fileName', 'Файл']]],
  acts: ['Акты', [
    ['id', 'ID'], ['number', 'Номер'], ['trainerId', 'ID тренера'], ['trainerName', 'Тренер'], ['dateFrom', 'С', 'd'],
    ['dateTo', 'По', 'd'], ['hours', 'Часов', 'n'], ['amount', 'Сумма', 'n'], ['docUrl', 'Документ'], ['pdfUrl', 'PDF'],
    ['createdBy', 'Кто создал'], ['createdAt', 'Создан'], ['data', 'Данные (JSON)']]],
  messages: ['Чат', [
    ['id', 'ID'], ['channel', 'Канал'], ['userId', 'ID автора'], ['userName', 'Автор'], ['text', 'Текст'], ['createdAt', 'Время']]],
  settings: ['Настройки', [['key', 'Параметр'], ['value', 'Значение']]],
  errors: ['Ошибки', [['id', 'ID'], ['createdAt', 'Время'], ['userName', 'Пользователь'], ['where', 'Где'], ['message', 'Ошибка'], ['stack', 'Подробности'], ['ua', 'Устройство']]],
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
  actTitle: 'АКТ',
  actSubtitle: 'об оказанных услугах',
  actText: 'Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.',
  actSaveCopy: 'true',
  backupEnabled: 'true',
  backupEvery: 1,
  backupHour: 3,
  backupKeep: 30,
  backupFormat: 'xlsx',
};
const PUBLIC_SETTINGS = ['clubName', 'halls', 'lowHours', 'trainerEditDays'];
const KINDS = { client: 'Ученик', trainer: 'Тренер', partner: 'Партнёр', rent: 'Аренда', other: 'Прочее' };
const TABLE_OF = { client: 'clients', trainer: 'trainers', partner: 'partners', rent: 'rent' };
// Встроенные виды занятий: [id, название, категория, оплата, списывать с абонемента, цвет]
// категория: ind — индивидуальное, group — групповое, event — мероприятие/турнир
// оплата: hour — ставка за час, fixed — ставка за участие
const BUILTIN_TYPES = [
  ['ind', 'Индивидуальное', 'ind', 'hour', true, '#32467a'],
  ['group', 'Групповое', 'group', 'hour', true, '#3f7cac'],
  ['practice', 'Танцпрактика', 'group', 'hour', true, '#2a9d8f'],
  ['camp', 'Сборы', 'group', 'hour', false, '#8e5ea2'],
  ['event', 'Мероприятие', 'event', 'hour', false, '#c9a24a'],
  ['tournament', 'Турнир', 'event', 'fixed', false, '#c93d3d'],
];
const DEFAULT_PROGRAMS = ['Стандарт', 'Латина', '10 танцев', 'Pro-Am', 'Свадебный танец'];

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

/**
 * Удаляет тестовые записи: тренеров и учеников, чьё ФИО начинается с «ТЕСТ»,
 * а также их абонементы, занятия, записи, логины, договоры и акты (файлы актов — в корзину).
 */
function removeTestData() {
  ensureSchema_();
  const isT = s => /^ТЕСТ/i.test(String(s || '').trim());
  const tr = tbl_('trainers').rows.filter(t => isT(t.name)).map(t => t.id);
  const cl = tbl_('clients').rows.filter(c => isT(c.name)).map(c => c.id);
  const has = (arr, id) => arr.indexOf(id) >= 0;
  const acts = tbl_('acts').rows.filter(a => has(tr, a.trainerId));
  acts.forEach(a => [a.docUrl, a.pdfUrl].forEach(u => {
    const m = String(u || '').match(/\/d\/([-\w]+)/);
    if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* уже удалён */ } }
  }));
  const n = {};
  n.acts = del_('acts', acts.map(a => a.id));
  n.lessons = del_('lessons', tbl_('lessons').rows.filter(l => has(tr, l.trainerId) || has(cl, l.clientId)).map(l => l.id));
  n.subs = del_('subs', tbl_('subs').rows.filter(s => has(cl, s.clientId) || has(tr, s.trainerId)).map(s => s.id));
  n.events = del_('events', tbl_('events').rows.filter(e => ids_(e.trainerIds).every(t => has(tr, t))).map(e => e.id));
  const slots = tbl_('slots').rows.filter(s => has(tr, s.trainerId)).map(s => s.id);
  n.bookings = del_('bookings', tbl_('bookings').rows.filter(b => has(slots, b.slotId) || has(cl, b.clientId)).map(b => b.id));
  n.slots = del_('slots', slots);
  n.users = del_('users', tbl_('users').rows.filter(u => has(tr, u.trainerId) || has(cl, u.clientId)).map(u => u.id));
  n.groups = del_('groups', tbl_('groups').rows.filter(g => /^ТЕСТ/i.test(g.name)).map(g => g.id));
  n.contracts = del_('contracts', tbl_('contracts').rows.filter(c => has(tr, c.partyId) || has(cl, c.partyId)).map(c => c.id));
  n.trainers = del_('trainers', tr);
  n.clients = del_('clients', cl);
  if (!tbl_('acts').rows.length) setSetting_('next_act', 1);
  Logger.log('Удалено: ' + JSON.stringify(n));
}

// ---------------------------------------------------------------------------
// Резервные копии базы: папка «Бэкапы» рядом с таблицей
// ---------------------------------------------------------------------------
/** Запустите один раз из редактора: даст разрешения и включит ежедневный бэкап. */
function setupBackup() {
  ensureSchema_();
  installBackupTrigger_();
  const r = backupNow_('настройка');
  Logger.log('Бэкап включён. Первая копия: ' + r.name + ' — ' + r.url);
}
/** Вызывается триггером по расписанию. */
function runBackup() {
  try { backupNow_('автоматически'); } catch (e) { setSetting_('backupLastStatus', 'Ошибка: ' + e.message); throw e; }
}
function backupFolder_() {
  const S = settings_();
  if (S.folder_backups) { try { const f = DriveApp.getFolderById(S.folder_backups); if (!f.isTrashed()) return f; } catch (e) { /* создадим */ } }
  const parents = DriveApp.getFileById(ss_().getId()).getParents();
  const base = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const ex = base.getFoldersByName('Бэкапы');
  const f = ex.hasNext() ? ex.next() : base.createFolder('Бэкапы');
  setSetting_('folder_backups', f.getId());
  return f;
}
function backupNow_(by) {
  const S = settings_();
  const folder = backupFolder_();
  const ss = ss_();
  SpreadsheetApp.flush();
  const stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH-mm');
  const name = 'Бэкап ' + ss.getName() + ' ' + stamp;
  const fmt = String(S.backupFormat || 'xlsx');
  const made = [];
  if (fmt === 'xlsx' || fmt === 'both') {
    const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
    const resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('Google не отдал файл Excel (код ' + resp.getResponseCode() + ')');
    made.push(folder.createFile(resp.getBlob().setName(name + '.xlsx')));
  }
  if (fmt === 'sheet' || fmt === 'both') made.push(DriveApp.getFileById(ss.getId()).makeCopy(name, folder));
  // храним только последние N копий каждого формата
  const keep = Math.max(1, parseInt(S.backupKeep, 10) || 30);
  const all = [];
  const it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('Бэкап ') === 0) all.push(f); }
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.google-apps.spreadsheet'].forEach(mime => {
    all.filter(f => f.getMimeType() === mime).sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(keep).forEach(f => f.setTrashed(true));
  });
  const when = now_();
  setSetting_('backupLast', when);
  setSetting_('backupLastStatus', 'Готово (' + by + '): ' + made.map(f => f.getName()).join(', '));
  return { name: made.map(f => f.getName()).join(', '), url: folder.getUrl(), when };
}
function installBackupTrigger_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runBackup').forEach(t => ScriptApp.deleteTrigger(t));
  const S = settings_();
  if (String(S.backupEnabled) === 'false') return 'off';
  const every = Math.min(Math.max(parseInt(S.backupEvery, 10) || 1, 1), 7);
  const hour = Math.min(Math.max(parseInt(S.backupHour, 10) || 0, 0), 23);
  const b = ScriptApp.newTrigger('runBackup').timeBased().atHour(hour).nearMinute(15);
  (every === 7 ? b.everyWeeks(1) : b.everyDays(every)).inTimezone(tz_()).create();
  return 'on';
}
function saveBackup_(u, p) {
  setSetting_('backupEnabled', p.backupEnabled === false ? 'false' : 'true');
  setSetting_('backupEvery', Math.min(Math.max(parseInt(p.backupEvery, 10) || 1, 1), 7));
  setSetting_('backupHour', Math.min(Math.max(parseInt(p.backupHour, 10) || 0, 0), 23));
  setSetting_('backupKeep', Math.min(Math.max(parseInt(p.backupKeep, 10) || 30, 1), 365));
  setSetting_('backupFormat', ['xlsx', 'sheet', 'both'].indexOf(p.backupFormat) >= 0 ? p.backupFormat : 'xlsx');
  try { return installBackupTrigger_(); }
  catch (e) { throw new Error('Настройки сохранены, но расписание не включилось: нужно разрешение. Откройте Apps Script и один раз запустите функцию setupBackup. (' + e.message + ')'); }
}
function backupInfo_() {
  const S = settings_();
  let files = [], folderUrl = '', triggerOn = false, err = '';
  try {
    const folder = backupFolder_(); folderUrl = folder.getUrl();
    const it = folder.getFiles();
    while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('Бэкап ') === 0) files.push({ name: f.getName(), url: f.getUrl(), size: f.getSize(), date: Utilities.formatDate(f.getDateCreated(), tz_(), 'yyyy-MM-dd HH:mm') }); }
    files.sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) { err = e.message; }
  try { triggerOn = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runBackup'); } catch (e) { err = err || 'Нужно разрешение: запустите setupBackup в редакторе Apps Script'; }
  return { files: files.slice(0, 60), folderUrl, triggerOn, last: S.backupLast || '', status: S.backupLastStatus || '', err };
}

/** Единая точка вызова из интерфейса. */
function api(token, action, payload) {
  const t0 = Date.now();
  const r = api_(token, action, payload);
  r.ms = Date.now() - t0;
  return r;
}
function api_(token, action, payload) {
  try {
    payload = payload || {};
    prefetch_(Object.keys(TABLES).filter(k => (k !== 'messages' || /Message/.test(action)) && (k !== 'errors' || /Error/.test(action))));
    if (action === 'login') return { ok: true, data: login_(payload) };
    if (action === 'ping') return { ok: true, data: { club: CLUB_NAME } };
    const user = auth_(token);
    if (!user) return { ok: false, error: 'AUTH', message: 'Сессия истекла — войдите снова' };
    const h = HANDLERS[action];
    if (!h) throw new Error('Неизвестное действие: ' + action);
    if (h.roles.indexOf(user.role) < 0) throw new Error('Недостаточно прав');
    const data = h.write ? withLock_(() => {
      // внутри блокировки перечитываем версии листов: кто-то мог сохранить данные, пока мы ждали
      Object.keys(_cache).forEach(k => delete _cache[k]);
      prefetch_(Object.keys(TABLES).filter(k => (k !== 'messages' || /Message/.test(action)) && (k !== 'errors' || /Error/.test(action))));
      return h.fn(user, payload);
    }) : h.fn(user, payload);
    if (h.write && payload.__snap) {
      // свежие данные в том же ответе — интерфейсу не нужен второй запрос
      const fresh = auth_(token);
      return { ok: true, data: { __snap: 1, result: data === undefined ? null : data, snap: fresh ? load_(fresh) : null } };
    }
    return { ok: true, data: data === undefined ? null : data };
  } catch (e) {
    if (e && (e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError)) {
      try { logError_('сервер', action, e.message, e.stack, ''); } catch (x) { /* журнал недоступен */ }
      return { ok: false, error: 'ERR', message: 'Внутренняя ошибка (' + action + '): ' + e.message + '. Она записана в журнал ошибок.' };
    }
    return { ok: false, error: 'ERR', message: (e && e.message) || String(e) };
  }
}
function logError_(who, where, message, stack, ua) {
  const t = tbl_('errors');
  if (t.rows.length > 500) del_('errors', t.rows.slice(0, t.rows.length - 400).map(r => r.id));
  insert_('errors', { userName: who || '', where: String(where || '').slice(0, 200), message: String(message || '').slice(0, 500), stack: String(stack || '').slice(0, 1500), ua: String(ua || '').slice(0, 200) });
  return true;
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
  deleteUser: { roles: ['admin'], write: true, fn: deleteUser_ },
  saveSettings: { roles: ['admin'], write: true, fn: saveSettings_ },
  saveDict: { roles: ['admin'], write: true, fn: saveDict_ },
  deleteDict: { roles: ['admin'], write: true, fn: deleteDict_ },
  deleteTrainer: { roles: ['admin'], write: true, fn: deleteTrainer_ },
  deleteClient: { roles: ['admin'], write: true, fn: deleteClient_ },
  deletePartner: { roles: ['admin'], write: true, fn: deletePartner_ },
  deleteAct: { roles: ['admin'], write: true, fn: deleteAct_ },
  editAct: { roles: ['admin'], write: true, fn: editAct_ },

  saveGroup: { roles: STAFF, write: true, fn: saveGroup_ },
  deleteGroup: { roles: STAFF, write: true, fn: (u, p) => del_('groups', must_('groups', p.id, 'Группа').id) },
  saveContract: { roles: STAFF, write: true, fn: saveContract_ },
  deleteContract: { roles: STAFF, write: true, fn: deleteContract_ },
  nextContractNo: { roles: STAFF, fn: (u, p) => nextNo_(KINDS[p.kind] ? p.kind : 'other').number },
  uploadContractFile: { roles: STAFF, write: true, fn: uploadContractFile_ },
  removeContractFile: { roles: STAFF, write: true, fn: removeContractFile_ },
  getFile: { roles: STAFF, fn: getFile_ },
  logError: { roles: ALL, write: true, fn: (u, p) => logError_(u.name, p.where, p.message, p.stack, p.ua) },
  getErrors: { roles: ['admin'], fn: () => tbl_('errors').rows.slice(-50).reverse().map(e => ({ createdAt: e.createdAt, userName: e.userName, where: e.where, message: e.message })) },
  backupInfo: { roles: ['admin'], fn: backupInfo_ },
  backupNow: { roles: ['admin'], write: true, fn: (u) => backupNow_(u.name) },
  saveBackup: { roles: ['admin'], write: true, fn: saveBackup_ },
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
  const ver = 'schema-5';
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
  seedDict_();
  clearCache();
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
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (type === 'd') {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  if (type === 't') { const m = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?$/); if (m) return ('0' + m[1]).slice(-2) + ':' + m[2]; }
  return s;
}

function tbl_(key) {
  if (_cache[key]) return _cache[key];
  const sh = ss_().getSheetByName(TABLES[key][0]);
  if (!sh) throw new Error('Нет листа «' + TABLES[key][0] + '». Запустите setup().');
  const values = sh.getDataRange().getValues();
  storeCache_(key, values);
  return (_cache[key] = buildTbl_(key, values.map(r => r.map(cellStr_)), sh));
}

// ---------------------------------------------------------------------------
// Быстрый кэш листов (CacheService). Лист перечитывается из таблицы только после изменений.
// Версия каждого листа хранится в кэше; запись через приложение или ручная правка (onEdit) её сбрасывает.
// ---------------------------------------------------------------------------
const CACHE_TTL = 1800;      // 30 минут — даже без сброса данные обновятся сами
const CHUNK = 40000;         // символов в одном куске (лимит значения кэша — 100 КБ)
const _dirty = {};
function cache_() { return CacheService.getScriptCache(); }
function cellStr_(v) {
  if (v instanceof Date) {
    const t = Utilities.formatDate(v, tz_(), 'HH:mm:ss');
    if (v.getFullYear() < 1901) return Utilities.formatDate(v, tz_(), 'HH:mm');
    return Utilities.formatDate(v, tz_(), t === '00:00:00' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
  }
  return v;
}
/** Берёт листы из кэша одним-тремя обращениями; чего нет — дочитает tbl_ по одному и положит в кэш. */
function prefetch_(keys) {
  keys = keys.filter(k => !_cache[k]);
  if (!keys.length) return;
  let c;
  try { c = cache_(); } catch (e) { return; }
  const vers = c.getAll(keys.map(k => 'v_' + k));
  const metaKeys = keys.filter(k => vers['v_' + k]).map(k => 'm_' + k + '_' + vers['v_' + k]);
  const metas = metaKeys.length ? c.getAll(metaKeys) : {};
  const chunkKeys = [];
  const plan = {};
  keys.forEach(k => {
    const v = vers['v_' + k]; const n = v && Number(metas['m_' + k + '_' + v]);
    if (n) { plan[k] = { v, n }; for (let i = 0; i < n; i++) chunkKeys.push('c_' + k + '_' + v + '_' + i); }
  });
  const chunks = chunkKeys.length ? c.getAll(chunkKeys) : {};
  Object.keys(plan).forEach(k => {
    let str = '';
    for (let i = 0; i < plan[k].n; i++) { const part = chunks['c_' + k + '_' + plan[k].v + '_' + i]; if (part === undefined || part === null) return; str += part; }
    try { _cache[k] = buildTbl_(k, JSON.parse(str), null); _cache[k]._ver = plan[k].v; } catch (e) { /* испорченный кэш — перечитаем лист */ }
  });
  keys.filter(k => !_cache[k]).forEach(k => tbl_(k));
}
function storeCache_(key, values) {
  if (_dirty[key]) return; // лист менялся в этом запросе — кэшируем в следующем
  try {
    const c = cache_();
    const v = newId_(8);
    const str = JSON.stringify(values.map(r => r.map(cellStr_)));
    const put = {};
    let n = 0;
    for (let i = 0; i < str.length; i += CHUNK) put['c_' + key + '_' + v + '_' + (n++)] = str.slice(i, i + CHUNK);
    put['m_' + key + '_' + v] = String(n || 1);
    if (!n) put['c_' + key + '_' + v + '_0'] = '[]';
    c.putAll(put, CACHE_TTL);
    c.put('v_' + key, v, CACHE_TTL);
  } catch (e) { /* без кэша тоже работает */ }
}
function invalidate_(key) {
  if (_dirty[key]) return;
  _dirty[key] = 1;
  try { cache_().remove('v_' + key); } catch (e) { /* нет кэша */ }
}
/** Ручная правка таблицы администратором — сбрасываем кэш изменённого листа. */
function onEdit(e) {
  try {
    const name = e && e.range ? e.range.getSheet().getName() : '';
    Object.keys(TABLES).forEach(k => { if (!name || TABLES[k][0] === name) CacheService.getScriptCache().remove('v_' + k); });
  } catch (err) { /* нет доступа */ }
}
/** Если меняли структуру таблицы (удаляли строки, сортировали) — запустите, чтобы приложение перечитало всё. */
function clearCache() { Object.keys(TABLES).forEach(k => CacheService.getScriptCache().remove('v_' + k)); }

function buildTbl_(key, values, sheet) {
  const [name, cols] = TABLES[key];
  const header = (values[0] || []).map(String);
  const idx = {};
  cols.forEach(c => { idx[c[0]] = header.indexOf(c[1]); });
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const raw = (values[r] || []).slice();
    while (raw.length < header.length) raw.push('');
    if (raw.every(x => x === '' || x === null)) continue;
    const o = {};
    cols.forEach(c => { o[c[0]] = norm_(idx[c[0]] >= 0 ? raw[idx[c[0]]] : '', c[2]); });
    Object.defineProperty(o, '_r', { value: r + 1, writable: true, enumerable: false });
    Object.defineProperty(o, '_raw', { value: raw, writable: true, enumerable: false });
    rows.push(o);
  }
  return {
    key, name, cols, header, idx, rows, _sh: sheet,
    get sh() { return this._sh || (this._sh = ss_().getSheetByName(name)); }
  };
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
  invalidate_(key);
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
  invalidate_(key);
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
  invalidate_(key);
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
  invalidate_('settings');
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
      rows.forEach(r => t.sh.deleteRow(r)); delete _cache.sessions; invalidate_('sessions');
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
  if (s) { t.sh.deleteRow(s._r); delete _cache.sessions; invalidate_('sessions'); }
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
      delete _cache.sessions; invalidate_('sessions');
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
  res.dict = tbl_('dict').rows;

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
      contracts: tbl_('contracts').rows, acts: tbl_('acts').rows, groups: tbl_('groups').rows,
    });
    if (user.role === 'admin') res.users = tbl_('users').rows.map(pubUserFull_);
  } else if (user.role === 'trainer') {
    const mine = trainerClientIds_(user.trainerId);
    const me = Object.assign({}, trainers.find(t => t.id === user.trainerId) || {});
    ['rates', 'rateInd', 'rateGroup', 'rateEvent', 'rateTour'].forEach(k => delete me[k]);
    Object.assign(res, {
      me: me.id ? me : null,
      groups: tbl_('groups').rows.filter(g => ids_(g.trainerIds).indexOf(user.trainerId) >= 0),
      trainers: trainers.map(t => ({ id: t.id, name: t.name, spec: t.spec, programs: t.programs, height: t.height, gender: t.gender, active: t.active })),
      clients: clients.filter(c => mine[c.id]).map(c => ({ id: c.id, name: c.name, phone: c.phone, company: c.company, trainerIds: c.trainerIds, notes: c.notes, active: c.active, birthDate: c.birthDate, gender: c.gender })),
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
      trainers: trainers.filter(t => t.active).map(t => ({ id: t.id, name: t.name, spec: t.spec, programs: t.programs })),
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
  const rates = {};
  Object.keys(p.rates || {}).forEach(k => {
    const v = p.rates[k];
    if (v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) rates[k] = Number(v);
  });
  const programs = [].concat(p.programs || []).filter(Boolean);
  const d = {
    name: String(req_(p.name, 'Укажите ФИО')).trim(), phone: p.phone || '', phone2: p.phone2 || '', email: p.email || '',
    telegram: p.telegram || '', address: p.address || '', birthDate: isDate_(p.birthDate) ? p.birthDate : '',
    gender: ['М', 'Ж'].indexOf(p.gender) >= 0 ? p.gender : '',
    height: Number(p.height) || '', programs: programs.join(', '), spec: programs.join(', '),
    rates: JSON.stringify(rates), rateInd: rates.ind || 0, rateGroup: rates.group || 0, rateEvent: rates.event || 0,
    rateTour: rates.tournament || 0, extra: JSON.stringify(p.extra || {}),
    active: p.active !== false, notes: p.notes || ''
  };
  let id = p.id;
  if (id) update_('trainers', id, d); else id = insert_('trainers', d);
  contractFromForm_('trainer', id, p);
  return id;
}

function saveClient_(u, p) {
  const tids = [].concat(p.trainerIds || []).filter(Boolean);
  const d = {
    name: String(req_(p.name, 'Укажите ФИО')).trim(), phone: p.phone || '', email: p.email || '',
    birthDate: isDate_(p.birthDate) ? p.birthDate : '', company: p.company || '',
    trainerIds: tids.join(','), trainerNames: tids.map(t => nameOf_('trainers', t)).join(', '),
    partnerId: p.partnerId || '', active: p.active !== false, notes: p.notes || '', extra: JSON.stringify(p.extra || {}),
    gender: ['М', 'Ж'].indexOf(p.gender) >= 0 ? p.gender : ''
  };
  let id = p.id;
  if (id) update_('clients', id, d); else id = insert_('clients', d);
  contractFromForm_('client', id, p);
  return id;
}

function savePartner_(u, p) {
  const d = { name: String(req_(p.name, 'Укажите название')).trim(), contact: p.contact || '', phone: p.phone || '', active: p.active !== false, notes: p.notes || '' };
  let id = p.id;
  if (id) update_('partners', id, d); else id = insert_('partners', d);
  contractFromForm_('partner', id, p);
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
  contractFromForm_('rent', id, p);
  return id;
}

// ---------------------------------------------------------------------------
// Договоры: сквозная нумерация + ручные номера, правка и удаление
// ---------------------------------------------------------------------------
function numberUsed_(number, exceptId) {
  const n = String(number).trim().toLowerCase();
  return tbl_('contracts').rows.some(c => c.id !== exceptId && String(c.number).trim().toLowerCase() === n);
}
function nextNo_(kind) {
  const S = settings_();
  const prefix = S['prefix_' + kind] || '';
  let n = Math.max(1, parseInt(S['next_' + kind], 10) || 1);
  let number = prefix + String(n).padStart(4, '0');
  while (numberUsed_(number)) { n++; number = prefix + String(n).padStart(4, '0'); }
  return { number, n };
}
/** Если номер введён по шаблону счётчика — сдвигаем счётчик дальше, чтобы «Авто» не выдал его снова. */
function bumpCounter_(kind, number) {
  const S = settings_();
  const prefix = S['prefix_' + kind] || '';
  const s = String(number);
  if (prefix && s.indexOf(prefix) !== 0) return;
  const rest = s.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return;
  const n = parseInt(rest, 10);
  const next = parseInt(S['next_' + kind], 10) || 1;
  if (n === next) { // взят очередной номер — двигаем счётчик на следующий свободный
    let m = n + 1;
    while (numberUsed_(prefix + String(m).padStart(4, '0'))) m++;
    setSetting_('next_' + kind, m);
  }
}
function unlinkParty_(c) {
  const t = TABLE_OF[c.kind];
  if (!t || !c.partyId) return;
  const party = find_(t, c.partyId);
  if (party && party.contractNo === c.number) update_(t, party.id, { contractNo: '', contractDate: '' });
}

function saveContract_(u, p) {
  const kind = KINDS[p.kind] ? p.kind : 'other';
  const old = p.id ? must_('contracts', p.id, 'Договор') : null;
  let number = String(p.number || '').trim();
  if (!number) number = nextNo_(kind).number;
  if (numberUsed_(number, old && old.id)) throw new Error('Договор № ' + number + ' уже есть');
  const tableOf = TABLE_OF[kind];
  let partyId = tableOf ? (p.partyId || '') : '';
  let partyName = String(p.partyName || '').trim();
  if (partyId) { const party = must_(tableOf, partyId, 'Сторона договора'); partyName = party.name || party.renter; }
  if (!partyName) throw new Error('Укажите сторону договора');
  const d = {
    number, kind, partyId, partyName, date: isDate_(p.date) ? p.date : today_(),
    endDate: isDate_(p.endDate) ? p.endDate : '', amount: Number(p.amount) || 0, notes: p.notes || ''
  };
  if (old) unlinkParty_(old);
  let id;
  if (old) { update_('contracts', old.id, d); id = old.id; } else id = insert_('contracts', d);
  if (tableOf && partyId) {
    const patch = { contractNo: number };
    if (kind !== 'rent') patch.contractDate = d.date;
    update_(tableOf, partyId, patch);
  }
  bumpCounter_(kind, number);
  return { id, number };
}

function deleteContract_(u, p) {
  const c = must_('contracts', p.id, 'Договор');
  unlinkParty_(c);
  if (c.fileId) { try { DriveApp.getFileById(c.fileId).setTrashed(true); } catch (e) { /* уже удалён */ } }
  return del_('contracts', c.id);
}

/** Кнопка «Присвоить договор» — следующий номер по счётчику. */
function assignContract_(p) {
  const kind = KINDS[p.kind] ? p.kind : 'other';
  const tableOf = TABLE_OF[kind];
  if (tableOf && p.partyId) {
    const party = must_(tableOf, p.partyId, 'Сторона договора');
    if (party.contractNo && !p.force) throw new Error('У этой записи уже есть договор № ' + party.contractNo);
  }
  return saveContract_(null, { kind, partyId: p.partyId, partyName: p.partyName, number: p.number, date: p.date, notes: p.notes }).number;
}

/** Номер договора из карточки ученика/тренера/партнёра/аренды: можно ввести вручную, изменить или очистить. */
function contractFromForm_(kind, partyId, p) {
  if (p.contractNo === undefined) {
    if (p.makeContract) { const party = find_(TABLE_OF[kind], partyId); if (party && !party.contractNo) assignContract_({ kind, partyId, date: p.contractDate }); }
    return;
  }
  const t = TABLE_OF[kind];
  const party = must_(t, partyId);
  const number = String(p.contractNo || '').trim();
  const cur = party.contractNo ? tbl_('contracts').rows.find(c => c.kind === kind && c.partyId === partyId && c.number === party.contractNo) : null;
  const date = isDate_(p.contractDate) ? p.contractDate : (party.contractDate || party.date || today_());
  if (!number) {
    if (party.contractNo) { if (cur) del_('contracts', cur.id); update_(t, partyId, { contractNo: '', contractDate: '' }); }
    return;
  }
  if (cur) saveContract_(null, { id: cur.id, kind, partyId, number, date, endDate: cur.endDate, amount: cur.amount, notes: cur.notes });
  else saveContract_(null, { kind, partyId, number, date });
}

function folder_(key, title) {
  const S = settings_();
  const k = key === 'acts' ? 'actsFolderId' : 'folder_' + key;
  if (S[k]) { try { return DriveApp.getFolderById(S[k]); } catch (e) { /* создадим заново */ } }
  const parent = DriveApp.getFileById(ss_().getId()).getParents();
  const base = parent.hasNext() ? parent.next() : DriveApp.getRootFolder();
  const f = base.createFolder(title + ' — ' + CLUB_NAME);
  setSetting_(k, f.getId());
  return f;
}
function uploadContractFile_(u, p) {
  const c = must_('contracts', p.id, 'Договор');
  if (!p.data) throw new Error('Файл пустой');
  const bytes = Utilities.base64Decode(p.data);
  if (bytes.length > 15 * 1024 * 1024) throw new Error('Файл больше 15 МБ');
  const name = String(p.name || 'файл').slice(0, 120);
  const file = folder_('contracts', 'Договоры').createFile(Utilities.newBlob(bytes, p.mime || 'application/octet-stream', name));
  file.setName(c.number + ' — ' + name);
  if (c.fileId) { try { DriveApp.getFileById(c.fileId).setTrashed(true); } catch (e) { /* нет */ } }
  update_('contracts', c.id, { fileId: file.getId(), fileName: name });
  return true;
}
function removeContractFile_(u, p) {
  const c = must_('contracts', p.id, 'Договор');
  if (c.fileId) { try { DriveApp.getFileById(c.fileId).setTrashed(true); } catch (e) { /* нет */ } }
  update_('contracts', c.id, { fileId: '', fileName: '' });
  return true;
}
function getFile_(u, p) {
  const c = tbl_('contracts').rows.find(x => x.fileId && x.fileId === p.fileId);
  if (!c) throw new Error('Файл не найден');
  const b = DriveApp.getFileById(c.fileId).getBlob();
  return { name: c.fileName || b.getName(), mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
}

// ---------------------------------------------------------------------------
// Справочники: виды занятий, программы, доп. поля
// ---------------------------------------------------------------------------
function seedDict_() {
  const rows = tbl_('dict').rows;
  const add = [];
  if (!rows.some(r => r.list === 'type')) BUILTIN_TYPES.forEach((b, i) => add.push({ id: b[0], list: 'type', name: b[1], kind: b[2], mode: b[3], deduct: b[4], color: b[5], order: i + 1, active: true, rate: 0 }));
  if (!rows.some(r => r.list === 'program')) DEFAULT_PROGRAMS.forEach((n, i) => add.push({ list: 'program', name: n, order: i + 1, active: true }));
  insertMany_('dict', add);
  delete _cache.__types;
}
function types_() {
  if (_cache.__types) return _cache.__types;
  const m = {};
  BUILTIN_TYPES.forEach((b, i) => { m[b[0]] = { id: b[0], name: b[1], kind: b[2], mode: b[3], deduct: b[4], color: b[5], rate: 0, order: i + 1, active: true }; });
  tbl_('dict').rows.filter(d => d.list === 'type').forEach(d => { m[d.id] = d; });
  return (_cache.__types = m);
}
function typeOf_(id) { return types_()[id] || { id: id, name: id || '—', kind: 'group', mode: 'hour', rate: 0, order: 99 }; }
function typeKind_(id) { return typeOf_(id).kind || 'group'; }
function parseJson_(s, def) { try { return s ? JSON.parse(s) : def; } catch (e) { return def; } }
function progs_(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function trainerRates_(t) {
  const r = parseJson_(t.rates, {}) || {};
  [['ind', 'rateInd'], ['group', 'rateGroup'], ['event', 'rateEvent'], ['tournament', 'rateTour']].forEach(x => {
    if ((r[x[0]] === undefined || r[x[0]] === '') && Number(t[x[1]])) r[x[0]] = Number(t[x[1]]);
  });
  return r;
}
/** Ставка тренера по виду: своя ставка → ставка вида по умолчанию → базовая ставка категории (групповая/мероприятия, если оплата тоже почасовая). */
function rateOf_(t, typeId) {
  const r = trainerRates_(t);
  const has = k => r[k] !== undefined && r[k] !== '' && r[k] !== null;
  if (has(typeId)) return Number(r[typeId]) || 0;
  const ty = typeOf_(typeId);
  if (Number(ty.rate)) return Number(ty.rate);
  const base = ty.mode === 'hour' ? { group: 'group', event: 'event', ind: 'ind' }[ty.kind] : '';
  return base && has(base) ? Number(r[base]) || 0 : 0;
}

function saveDict_(u, p) {
  const list = ['type', 'program', 'field'].indexOf(p.list) >= 0 ? p.list : '';
  if (!list) throw new Error('Неизвестный справочник');
  const name = String(req_(p.name, 'Укажите название')).trim();
  const rows = tbl_('dict').rows.filter(d => d.list === list);
  if (rows.some(d => d.id !== p.id && d.name.toLowerCase() === name.toLowerCase() && (list !== 'field' || d.kind === p.kind))) throw new Error('«' + name + '» уже есть в списке');
  const d = { list, name, order: Number(p.order) || rows.length + 1, active: p.active !== false, color: p.color || '', options: '', kind: '', mode: '', rate: 0, deduct: false };
  if (list === 'type') {
    d.kind = p.id === 'ind' ? 'ind' : (['ind', 'group', 'event'].indexOf(p.kind) >= 0 ? p.kind : 'group');
    d.mode = p.mode === 'fixed' ? 'fixed' : 'hour';
    d.rate = Number(p.rate) || 0;
    d.deduct = !!p.deduct;
    if (!d.color) d.color = '#3f7cac';
  }
  if (list === 'field') {
    d.kind = p.kind === 'client' ? 'client' : 'trainer';
    d.mode = ['text', 'number', 'date', 'select', 'check'].indexOf(p.mode) >= 0 ? p.mode : 'text';
    d.options = progs_(p.options).join(', ');
  }
  delete _cache.__types;
  const old = p.id ? find_('dict', p.id) : null;
  if (old) {
    if (list === 'program' && old.name !== name) {
      tbl_('trainers').rows.forEach(t => {
        const a = progs_(t.programs); const i = a.indexOf(old.name);
        if (i >= 0) { a[i] = name; update_('trainers', t.id, { programs: a.join(', '), spec: a.join(', ') }); }
      });
    }
    update_('dict', old.id, d);
    return old.id;
  }
  if (p.id && BUILTIN_TYPES.some(b => b[0] === p.id)) d.id = p.id;
  return insert_('dict', d);
}

function deleteDict_(u, p) {
  const d = must_('dict', p.id, 'Запись');
  if (d.list === 'type') {
    if (BUILTIN_TYPES.some(b => b[0] === d.id)) throw new Error('Встроенный вид нельзя удалить. Снимите «Активен» — он скроется из списков.');
    const used = tbl_('lessons').rows.some(l => l.type === d.id) || tbl_('events').rows.some(e => e.type === d.id) ||
      tbl_('groups').rows.some(g => g.typeId === d.id) || tbl_('slots').rows.some(s => s.type === d.id);
    if (used) throw new Error('Этот вид уже есть в занятиях. Снимите «Активен» вместо удаления.');
  }
  if (d.list === 'program') {
    tbl_('trainers').rows.forEach(t => {
      const a = progs_(t.programs);
      if (a.indexOf(d.name) >= 0) { const n = a.filter(x => x !== d.name).join(', '); update_('trainers', t.id, { programs: n, spec: n }); }
    });
  }
  delete _cache.__types;
  return del_('dict', d.id);
}

// ---------------------------------------------------------------------------
// Постоянные группы (состав, тренеры, вид)
// ---------------------------------------------------------------------------
function saveGroup_(u, p) {
  const typeId = req_(p.typeId, 'Выберите вид');
  if (typeKind_(typeId) === 'ind') throw new Error('Для группы выберите групповой вид, мероприятие или турнир');
  const tids = [].concat(p.trainerIds || []).filter(Boolean);
  const cids = [].concat(p.clientIds || []).filter(Boolean);
  const d = {
    name: String(req_(p.name, 'Укажите название')).trim(), typeId,
    trainerIds: tids.join(','), trainerNames: tids.map(x => nameOf_('trainers', x)).join(', '),
    clientIds: cids.join(','), clientNames: cids.map(x => nameOf_('clients', x)).join(', '),
    schedule: p.schedule || '', notes: p.notes || '', active: p.active !== false
  };
  if (p.id) { update_('groups', must_('groups', p.id, 'Группа').id, d); return p.id; }
  return insert_('groups', d);
}

// ---------------------------------------------------------------------------
// Удаление записей (администратор)
// ---------------------------------------------------------------------------
function delUsersOf_(field, id) {
  const users = tbl_('users').rows.filter(x => x[field] === id).map(x => x.id);
  if (!users.length) return;
  const st = tbl_('sessions');
  st.rows.filter(s => users.indexOf(s.userId) >= 0).map(s => s._r).sort((a, b) => b - a).forEach(r => st.sh.deleteRow(r));
  delete _cache.sessions; invalidate_('sessions');
  del_('users', users);
}
function dropFromList_(table, field, namesField, nameTable, id) {
  tbl_(table).rows.forEach(r => {
    const a = ids_(r[field]);
    if (a.indexOf(id) < 0) return;
    const n = a.filter(x => x !== id);
    const patch = {}; patch[field] = n.join(','); patch[namesField] = n.map(x => nameOf_(nameTable, x)).join(', ');
    update_(table, r.id, patch);
  });
}
function deleteTrainer_(u, p) {
  const t = must_('trainers', p.id, 'Тренер');
  const used = tbl_('lessons').rows.some(l => l.trainerId === t.id) || tbl_('events').rows.some(e => ids_(e.trainerIds).indexOf(t.id) >= 0) ||
    tbl_('subs').rows.some(s => s.trainerId === t.id) || tbl_('slots').rows.some(s => s.trainerId === t.id) || tbl_('acts').rows.some(a => a.trainerId === t.id);
  if (used) throw new Error('У тренера есть занятия, абонементы или акты — удалить нельзя. Снимите «Активен», и он уйдёт в архив.');
  const name = t.name;
  dropFromList_('groups', 'trainerIds', 'trainerNames', 'trainers', t.id);
  dropFromList_('clients', 'trainerIds', 'trainerNames', 'trainers', t.id);
  delUsersOf_('trainerId', t.id);
  del_('trainers', t.id);
  return name;
}
function deleteClient_(u, p) {
  const c = must_('clients', p.id, 'Ученик');
  const used = tbl_('lessons').rows.some(l => l.clientId === c.id) || tbl_('subs').rows.some(s => s.clientId === c.id) || tbl_('bookings').rows.some(b => b.clientId === c.id);
  if (used) throw new Error('У ученика есть занятия, абонементы или записи — удалить нельзя. Снимите «Активен», и он уйдёт в архив.');
  dropFromList_('groups', 'clientIds', 'clientNames', 'clients', c.id);
  delUsersOf_('clientId', c.id);
  return del_('clients', c.id);
}
function deletePartner_(u, p) {
  const x = must_('partners', p.id, 'Партнёр');
  if (tbl_('subs').rows.some(s => s.partnerId === x.id) || tbl_('clients').rows.some(c => c.partnerId === x.id)) throw new Error('У партнёра есть ученики или абонементы — снимите «Активен» вместо удаления.');
  return del_('partners', x.id);
}
function deleteUser_(admin, p) {
  if (p.id === admin.id) throw new Error('Нельзя удалить самого себя');
  const u = must_('users', p.id, 'Пользователь');
  const st = tbl_('sessions');
  st.rows.filter(s => s.userId === u.id).forEach(s => CacheService.getScriptCache().remove('s_' + s.token));
  st.rows.filter(s => s.userId === u.id).map(s => s._r).sort((a, b) => b - a).forEach(r => st.sh.deleteRow(r));
  delete _cache.sessions; invalidate_('sessions');
  return del_('users', u.id);
}
function trashUrl_(url) {
  const m = String(url || '').match(/\/d\/([-\w]+)/);
  if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* нет */ } }
}
function deleteAct_(u, p) {
  const a = must_('acts', p.id, 'Акт');
  trashUrl_(a.docUrl); trashUrl_(a.pdfUrl);
  return del_('acts', a.id);
}
function editAct_(u, p) {
  const a = must_('acts', p.id, 'Акт');
  const number = String(req_(p.number, 'Укажите номер')).trim();
  if (tbl_('acts').rows.some(x => x.id !== a.id && String(x.number) === number)) throw new Error('Акт № ' + number + ' уже есть');
  const data = parseJson_(a.data, null);
  if (data) data.number = number;
  update_('acts', a.id, { number, data: data ? JSON.stringify(data) : a.data });
  return true;
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
  const type = p.typeId || p.type || 'group';
  if (typeKind_(type) === 'ind') throw new Error('Выберите групповой вид, мероприятие или турнир');
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
    deduct: !!p.deduct, notes: p.notes || '', groupId: p.groupId || '', location: p.location || '', results: p.results || ''
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
  const type = p.type && typeKind_(p.type) !== 'event' ? p.type : 'ind';
  const isInd = typeKind_(type) === 'ind';
  const d = {
    date: req_(isDate_(p.date) ? p.date : '', 'Укажите дату'), time: req_(p.time, 'Укажите время'), hours: hoursOk_(p.hours),
    trainerId, trainerName: t.name, type, title: p.title || typeOf_(type).name,
    capacity: isInd ? 1 : Math.max(1, Number(p.capacity) || 10), notes: p.notes || ''
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
  if (typeKind_(s.type) === 'ind' && cids.length === 1) {
    resultId = saveLesson_(asUser, { trainerId: s.trainerId, clientId: cids[0], date: s.date, time: s.time, hours, subId: 'auto', notes: 'По записи' });
  } else {
    resultId = saveEvent_(asUser, { type: typeKind_(s.type) === 'ind' ? 'group' : s.type, title: s.title, date: s.date, time: s.time, hours, trainerIds: [s.trainerId], clientIds: cids, deduct: true, notes: 'По записи' });
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
  // th — часы тренера, ch — часы ученика, n — 1 за проведённое занятие/участие (для оплаты «за участие»)
  const facts = [];
  tbl_('lessons').rows.forEach(l => {
    if (l.date < from || l.date > to) return;
    if (l.eventId) facts.push({ date: l.date, tr: l.trainerId, cl: l.clientId, type: l.type, th: 0, ch: l.hours, n: 0, ev: l.eventId, sub: l.subId });
    else facts.push({ date: l.date, tr: l.trainerId, cl: l.clientId, type: l.type || 'ind', th: l.hours, ch: l.hours, n: 1, sub: l.subId });
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
  res.events = tbl_('events').rows.filter(e => evIds[e.id]).map(e => ({ id: e.id, title: e.title, type: e.type, date: e.date, hours: e.hours, clientIds: e.clientIds, location: e.location, results: e.results, trainerNames: e.trainerNames }));
  if (user.role === 'trainer') {
    const cl = {}; facts.forEach(f => { if (f.cl) cl[f.cl] = 1; });
    res.clients = tbl_('clients').rows.filter(c => cl[c.id]).map(c => ({ id: c.id, name: c.name, company: c.company }));
  }
  return res;
}

function actCalc_(trainerId, from, to) {
  const t = must_('trainers', trainerId, 'Тренер');
  const f = facts_(from, to, trainerId).filter(x => x.n > 0);
  const by = {};
  f.forEach(x => { const o = by[x.type] = by[x.type] || { hours: 0, units: 0 }; o.hours += x.th; o.units += x.n; });
  const lines = Object.keys(by).sort((a, b) => (Number(typeOf_(a).order) || 99) - (Number(typeOf_(b).order) || 99)).map(k => {
    const ty = typeOf_(k), fixed = ty.mode === 'fixed', rate = rateOf_(t, k);
    const qty = fixed ? by[k].units : round2_(by[k].hours);
    return { type: k, name: ty.name, unit: fixed ? 'участие' : 'ч', qty, hours: round2_(by[k].hours), rate, amount: round2_(qty * rate) };
  });
  return { t, f, lines, hours: round2_(lines.reduce((a, l) => a + l.hours, 0)), amount: round2_(lines.reduce((a, l) => a + l.amount, 0)) };
}

function makeAct_(user, p) {
  const from = req_(isDate_(p.from) ? p.from : '', 'Укажите период');
  const to = req_(isDate_(p.to) ? p.to : '', 'Укажите период');
  const calc = actCalc_(req_(p.trainerId, 'Выберите тренера'), from, to);
  if (!calc.lines.length) throw new Error('За период у тренера нет занятий');
  const S = settings_();
  const n = Math.max(1, parseInt(S.next_act, 10) || 1);
  const number = (S.prefix_act || '') + n;
  const t = calc.t;
  const detail = [];
  const byClient = {};
  calc.f.filter(x => !x.ev).forEach(x => { byClient[x.cl] = (byClient[x.cl] || 0) + x.th; });
  Object.keys(byClient).sort((a, b) => nameOf_('clients', a).localeCompare(nameOf_('clients', b)))
    .forEach(cid => detail.push([nameOf_('clients', cid) + ' (индивидуально)', 'за период', round2_(byClient[cid]) + ' ч']));
  calc.f.filter(x => x.ev).sort((a, b) => a.date.localeCompare(b.date)).forEach(x => {
    const ty = typeOf_(x.type);
    const title = String(x.title || '').trim();
    detail.push([!title || title === ty.name ? ty.name : ty.name + ': ' + title, x.date, ty.mode === 'fixed' ? '1 участие' : round2_(x.th) + ' ч']);
  });
  const data = {
    number, date: today_(), from, to,
    trainer: { name: t.name, contractNo: t.contractNo, contractDate: t.contractDate },
    club: { name: S.clubName || CLUB_NAME, requisites: S.clubRequisites || '', director: S.director || '', city: S.city || '' },
    texts: { title: S.actTitle || 'АКТ', subtitle: S.actSubtitle || '', text: S.actText || '' },
    lines: calc.lines, detail, hours: calc.hours, amount: calc.amount
  };
  let docUrl = '', pdfUrl = '';
  if (String(S.actSaveCopy) !== 'false') { const r = actDoc_(data); docUrl = r.docUrl; pdfUrl = r.pdfUrl; }
  setSetting_('next_act', n + 1);
  const id = insert_('acts', {
    number, trainerId: t.id, trainerName: t.name, dateFrom: from, dateTo: to, hours: calc.hours, amount: calc.amount,
    docUrl, pdfUrl, createdBy: user.name, data: JSON.stringify(data)
  });
  return { id, number, docUrl, pdfUrl, hours: calc.hours, amount: calc.amount, data };
}

/** Копия акта в Google Документах и PDF (настройка «Сохранять копию акта на Google Диск»). */
function actDoc_(d) {
  const money = v => Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hh = v => String(v).replace('.', ',');
  const doc = DocumentApp.create('Акт № ' + d.number + ' — ' + d.trainer.name + ' — ' + ruDate_(d.from) + '–' + ruDate_(d.to));
  const body = doc.getBody();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(40);
  const center = DocumentApp.HorizontalAlignment.CENTER;
  body.appendParagraph(d.club.name).setAlignment(center).setFontSize(10).setForegroundColor('#253559');
  body.appendParagraph((d.texts.title || 'АКТ') + ' № ' + d.number).setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(center);
  if (d.texts.subtitle) body.appendParagraph(d.texts.subtitle).setAlignment(center);
  body.appendParagraph((d.club.city ? 'г. ' + d.club.city + '                                                            ' : '') + ruDate_(d.date)).setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  body.appendParagraph('Исполнитель: ' + d.trainer.name + (d.trainer.contractNo ? ', договор № ' + d.trainer.contractNo + (d.trainer.contractDate ? ' от ' + ruDate_(d.trainer.contractDate) : '') : ''));
  body.appendParagraph('Заказчик: ' + d.club.name + (d.club.requisites ? ', ' + d.club.requisites : ''));
  body.appendParagraph('Период оказания услуг: с ' + ruDate_(d.from) + ' по ' + ruDate_(d.to));
  const rows = [['№', 'Наименование услуг', 'Кол-во', 'Ед.', 'Ставка, ₽', 'Сумма, ₽']];
  d.lines.forEach((l, i) => rows.push([String(i + 1), l.name, hh(l.qty), l.unit, money(l.rate), money(l.amount)]));
  rows.push(['', 'Итого', '', '', '', money(d.amount)]);
  const tbl = body.appendTable(rows);
  tbl.getRow(0).editAsText().setBold(true);
  tbl.getRow(rows.length - 1).editAsText().setBold(true);
  body.appendParagraph('Всего оказано услуг на сумму ' + money(d.amount) + ' руб. ' + (d.texts.text || ''));
  if (d.detail.length) {
    body.appendParagraph('Расшифровка').setHeading(DocumentApp.ParagraphHeading.HEADING3);
    const dt = body.appendTable([['Ученик / событие', 'Дата', 'Объём']].concat(d.detail.map(r => [String(r[0]), isDate_(r[1]) ? ruDate_(r[1]) : String(r[1]), String(r[2]).replace('.', ',')])));
    dt.getRow(0).editAsText().setBold(true);
    dt.editAsText().setFontSize(9);
  }
  body.appendParagraph('');
  const sig = body.appendTable([['Исполнитель', 'Заказчик'], ['_______________ / ' + d.trainer.name, '_______________ / ' + (d.club.director || '')]]);
  sig.setBorderWidth(0);
  doc.saveAndClose();
  const folder = folder_('acts', 'Акты');
  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder);
  const pdf = folder.createFile(file.getAs('application/pdf')).setName(doc.getName() + '.pdf');
  return { docUrl: doc.getUrl(), pdfUrl: pdf.getUrl() };
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
