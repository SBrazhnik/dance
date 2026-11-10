/**
 * Дополнительные инструменты (отдельный модуль, основной код не меняет):
 *  1. Подбор пары и тренера      — анкеты танцоров, подсказки по росту, полу, программе, уровню и дням
 *  2. Паспорт танцора            — уровни по танцам и дневник занятий (что отработали, видео)
 *  3. Корпоративная лига         — баллы компаний за часы, турниры, рост уровня и награды
 *  4. Отчёт для HR               — сотрудники компании за период, печать
 *  5. Telegram-бот               — напоминания, остаток часов, сводка менеджеру; у каждого своя галка уведомлений
 *
 * Действия регистрируются в toolHandlers_() — основной api() ищет их там, если не нашёл в HANDLERS.
 * Константы основного файла здесь читаются только внутри функций, поэтому порядок файлов не важен.
 */

const TOOL_LEVELS = ['—', 'Начинающий', 'Базовый', 'Уверенный', 'Продвинутый', 'Турнирный'];
const TOOL_DANCES = 'Медленный вальс, Танго, Венский вальс, Медленный фокстрот, Квикстеп, Ча-ча-ча, Самба, Румба, Пасодобль, Джайв';
const TOOL_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const TOOL_DEFAULTS = {
  tools_dances: TOOL_DANCES,
  league_name: 'Корпоративная лига',
  league_from: '', league_to: '',
  league_pHour: 1, league_pEvent: 5, league_pLevel: 3,
  bot_hour: 10, bot_remind: 'true', bot_low: 'true', bot_lowHours: 2,
  bot_inactive: 14, bot_digest: 'true', bot_nudge: 'false', bot_name: '',
};

function toolSettings_() {
  const S = settings_();
  const o = {};
  Object.keys(TOOL_DEFAULTS).forEach(k => { o[k] = (k in S && S[k] !== '') ? S[k] : TOOL_DEFAULTS[k]; });
  const y = today_().slice(0, 4);
  if (!o.league_from) o.league_from = y + '-01-01';
  if (!o.league_to) o.league_to = y + '-12-31';
  return o;
}
function toolDances_() { return String(toolSettings_().tools_dances).split(',').map(s => s.trim()).filter(Boolean); }
function isStaff_(u) { return STAFF.indexOf(u.role) >= 0; }
function toolCanEditClient_(user, clientId) {
  if (isStaff_(user)) return true;
  if (user.role === 'trainer') return !!trainerClientIds_(user.trainerId)[clientId];
  return false;
}
function toolClientIds_(user) {
  if (isStaff_(user)) return null; // все
  if (user.role === 'trainer') return trainerClientIds_(user.trainerId);
  const o = {}; if (user.clientId) o[user.clientId] = 1; return o;
}
function companyOf_(c) {
  if (c.company) return String(c.company).trim();
  if (c.partnerId) { const p = find_('partners', c.partnerId); if (p) return p.name; }
  return '';
}

// ---------------------------------------------------------------------------
// Загрузка данных модуля
// ---------------------------------------------------------------------------
function toolsLoad_(user) {
  const allow = toolClientIds_(user);
  const ok = id => !allow || !!allow[id];
  const T = toolSettings_();
  const res = {
    levels: TOOL_LEVELS, dances: toolDances_(), days: TOOL_DAYS,
    settings: { league_name: T.league_name, league_from: T.league_from, league_to: T.league_to,
      league_pHour: +T.league_pHour, league_pEvent: +T.league_pEvent, league_pLevel: +T.league_pLevel },
    dancers: tbl_('dancers').rows.filter(d => ok(d.clientId)),
    progress: tbl_('progress').rows.filter(p => ok(p.clientId)),
    diary: tbl_('diary').rows.filter(p => ok(p.clientId)).slice(-800),
    awards: isStaff_(user) ? tbl_('awards').rows : [],
    companies: isStaff_(user) ? toolCompanies_() : [],
    me: { tg: myTg_(user) },
  };
  if (isStaff_(user)) {
    res.tg = tbl_('tg').rows.map(r => ({ id: r.id, kind: r.kind, refId: r.refId, name: r.name, linked: !!r.chatId, notify: r.notify, linkedAt: r.linkedAt, lastSent: r.lastSent, phone: r.kind === 'pending' ? r.code : '' }));
    res.bot = botStatus_(user);
    Object.assign(res.settings, { bot_hour: +T.bot_hour, bot_remind: T.bot_remind === 'true', bot_low: T.bot_low === 'true', bot_lowHours: +T.bot_lowHours,
      bot_inactive: +T.bot_inactive, bot_digest: T.bot_digest === 'true', bot_nudge: T.bot_nudge === 'true', tools_dances: T.tools_dances });
  }
  return res;
}
function toolCompanies_() {
  const set = {};
  tbl_('clients').rows.forEach(c => { const k = companyOf_(c); if (k) set[k] = (set[k] || 0) + (c.active ? 1 : 0); });
  return Object.keys(set).sort().map(k => ({ name: k, people: set[k] }));
}

// ---------------------------------------------------------------------------
// 1. Анкеты и подбор пары / тренера
// ---------------------------------------------------------------------------
function saveDancer_(user, p) {
  const cid = req_(p.clientId, 'Выберите ученика');
  must_('clients', cid, 'Ученик');
  if (!(toolCanEditClient_(user, cid) || (user.role === 'client' && user.clientId === cid))) throw new Error('Недостаточно прав');
  const d = {
    clientId: cid, height: +p.height || '', level: Math.min(Math.max(parseInt(p.level, 10) || 0, 0), 5),
    programs: [].concat(p.programs || []).join(', '), days: [].concat(p.days || []).join(', '),
    seek: !!p.seek, note: String(p.note || '').slice(0, 500), updatedAt: now_()
  };
  const ex = tbl_('dancers').rows.find(x => x.clientId === cid);
  if (ex) update_('dancers', ex.id, d); else insert_('dancers', d);
  return true;
}
function listOf_(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }

/** Кандидаты в пару и подходящие тренеры для ученика. */
function toolsMatch_(user, p) {
  const cid = req_(p.clientId, 'Выберите ученика');
  const me = must_('clients', cid, 'Ученик');
  if (!toolCanEditClient_(user, cid)) throw new Error('Недостаточно прав');
  const D = {}; tbl_('dancers').rows.forEach(d => { D[d.clientId] = d; });
  const md = D[cid] || {};
  const myProg = listOf_(md.programs), myDays = listOf_(md.days);
  const out = [];
  const allow = toolClientIds_(user);
  tbl_('clients').rows.forEach(c => {
    if (c.id === cid || !c.active) return;
    if (allow && !allow[c.id] && !(D[c.id] && D[c.id].seek)) return;
    const d = D[c.id] || {};
    if (me.gender && c.gender && me.gender === c.gender) return;
    const reasons = [], warn = [];
    let score = 0;
    if (me.gender && c.gender) { score += 10; } else warn.push('пол не указан');
    if (d.seek) { score += 15; reasons.push('ищет пару'); }
    // рост: партнёр выше партнёрши на 5–20 см — идеально
    const man = me.gender === 'М' ? md : (c.gender === 'М' ? d : null);
    const woman = me.gender === 'Ж' ? md : (c.gender === 'Ж' ? d : null);
    if (man && woman && +man.height && +woman.height) {
      const diff = man.height - woman.height;
      if (diff >= 5 && diff <= 20) { score += 30; reasons.push('рост: разница ' + diff + ' см'); }
      else if (diff >= 0 && diff <= 25) { score += 15; reasons.push('рост: разница ' + diff + ' см'); }
      else warn.push('рост: разница ' + diff + ' см');
    } else warn.push('рост не указан');
    const commonP = myProg.filter(x => listOf_(d.programs).indexOf(x) >= 0);
    if (commonP.length) { score += 20; reasons.push(commonP.join(', ')); }
    else if (myProg.length && listOf_(d.programs).length) warn.push('разные программы');
    if (+md.level && +d.level) {
      const dl = Math.abs(md.level - d.level);
      if (dl === 0) { score += 15; reasons.push('один уровень'); } else if (dl === 1) { score += 8; reasons.push('уровни рядом'); } else warn.push('уровни далеко');
    }
    const commonD = myDays.filter(x => listOf_(d.days).indexOf(x) >= 0);
    if (commonD.length) { score += 10; reasons.push('дни: ' + commonD.join(', ')); }
    else if (myDays.length && listOf_(d.days).length) warn.push('нет общих дней');
    if (companyOf_(c) && companyOf_(c) === companyOf_(me)) { score += 3; reasons.push('та же компания'); }
    out.push({ id: c.id, name: c.name, gender: c.gender, company: companyOf_(c), height: +d.height || '', level: +d.level || 0,
      programs: d.programs || '', days: d.days || '', seek: !!d.seek, score, reasons, warn });
  });
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  // тренеры: общие программы, рост для пары с учеником, нагрузка
  const load = {};
  tbl_('clients').rows.forEach(c => { if (c.active) ids_(c.trainerIds).forEach(t => { load[t] = (load[t] || 0) + 1; }); });
  const trainers = tbl_('trainers').rows.filter(t => t.active).map(t => {
    let score = 0; const reasons = [];
    const common = myProg.filter(x => progs_(t.programs).indexOf(x) >= 0);
    if (common.length) { score += 30; reasons.push(common.join(', ')); }
    if (me.gender && t.gender && me.gender !== t.gender) {
      score += 15; reasons.push('может встать в пару');
      if (+md.height && +t.height) {
        const diff = me.gender === 'Ж' ? t.height - md.height : md.height - t.height;
        if (diff >= 5 && diff <= 20) { score += 20; reasons.push('рост подходит'); }
      }
    }
    const n = load[t.id] || 0;
    score += Math.max(0, 15 - n); reasons.push('учеников: ' + n);
    if (ids_(me.trainerIds).indexOf(t.id) >= 0) reasons.unshift('уже закреплён');
    return { id: t.id, name: t.name, gender: t.gender, height: +t.height || '', programs: t.programs, score, reasons };
  }).sort((a, b) => b.score - a.score);
  return { me: { id: me.id, name: me.name, gender: me.gender, dancer: md }, pairs: out.slice(0, 15), trainers: trainers.slice(0, 6) };
}

// ---------------------------------------------------------------------------
// 2. Паспорт танцора: уровни и дневник
// ---------------------------------------------------------------------------
function saveProgress_(user, p) {
  const cid = req_(p.clientId, 'Выберите ученика');
  must_('clients', cid, 'Ученик');
  if (!toolCanEditClient_(user, cid)) throw new Error('Недостаточно прав');
  const dance = String(req_(p.dance, 'Выберите танец')).trim();
  const level = Math.min(Math.max(parseInt(p.level, 10) || 0, 1), 5);
  const tid = user.role === 'trainer' ? user.trainerId : (p.trainerId || '');
  return insert_('progress', { clientId: cid, dance, level, trainerId: tid, trainerName: tid ? nameOf_('trainers', tid) : user.name,
    date: isDate_(p.date) ? p.date : today_(), note: String(p.note || '').slice(0, 500) });
}
function deleteProgress_(user, p) {
  const r = must_('progress', p.id, 'Запись');
  if (!isStaff_(user) && !(user.role === 'trainer' && r.trainerId === user.trainerId)) throw new Error('Недостаточно прав');
  return del_('progress', r.id);
}
function saveDiary_(user, p) {
  const cid = req_(p.clientId, 'Выберите ученика');
  must_('clients', cid, 'Ученик');
  if (!toolCanEditClient_(user, cid)) throw new Error('Недостаточно прав');
  const video = String(p.video || '').trim();
  if (video && !/^https?:\/\//i.test(video)) throw new Error('Ссылка на видео должна начинаться с https://');
  const tid = user.role === 'trainer' ? user.trainerId : (p.trainerId || '');
  const d = { clientId: cid, trainerId: tid, trainerName: tid ? nameOf_('trainers', tid) : '', date: isDate_(p.date) ? p.date : today_(),
    text: String(req_(p.text, 'Напишите, что отработали')).slice(0, 2000), video, createdBy: user.name, homework: !!p.homework };
  let id;
  if (p.id) {
    const old = must_('diary', p.id, 'Запись');
    if (!isStaff_(user) && old.createdBy !== user.name) throw new Error('Можно править только свои записи');
    update_('diary', p.id, d); id = p.id;
  } else id = insert_('diary', d);
  const row = find_('diary', id);
  if (row && row.homework && p.send && typeof clubHomework_ === 'function') clubHomework_(row);
  return id;
}
function deleteDiary_(user, p) {
  const r = must_('diary', p.id, 'Запись');
  if (!isStaff_(user) && r.createdBy !== user.name) throw new Error('Можно удалить только свои записи');
  return del_('diary', r.id);
}

// ---------------------------------------------------------------------------
// 3. Корпоративная лига
// ---------------------------------------------------------------------------
function leaguePoints_(from, to) {
  const T = toolSettings_();
  const pH = +T.league_pHour || 0, pE = +T.league_pEvent || 0, pL = +T.league_pLevel || 0;
  const per = {};
  const get = cid => per[cid] || (per[cid] = { hours: 0, events: {}, levels: 0, awards: 0, awardList: [] });
  tbl_('lessons').rows.forEach(l => {
    if (!l.clientId || l.date < from || l.date > to) return;
    const ty = typeOf_(l.type);
    if (ty.mode === 'fixed') { if (l.eventId) get(l.clientId).events[l.eventId] = 1; }
    else get(l.clientId).hours += Number(l.hours) || 0;
  });
  // рост уровня: по каждому танцу — насколько поднялся уровень за период
  const byKey = {};
  tbl_('progress').rows.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(r => {
    const k = r.clientId + '|' + r.dance;
    if (r.date < from) { byKey[k] = { start: r.level, end: r.level }; return; }
    if (r.date > to) return;
    const o = byKey[k] || (byKey[k] = { start: 0, end: 0 });
    o.end = r.level;
    o.cid = r.clientId;
  });
  Object.keys(byKey).forEach(k => { const o = byKey[k]; if (o.cid && o.end > o.start) get(o.cid).levels += o.end - o.start; });
  tbl_('awards').rows.forEach(a => { if (a.date >= from && a.date <= to && a.clientId) { const g = get(a.clientId); g.awards += Number(a.points) || 0; g.awardList.push(a.title); } });
  const C = {}; tbl_('clients').rows.forEach(c => { C[c.id] = c; });
  const people = Object.keys(per).filter(id => C[id]).map(id => {
    const o = per[id], ev = Object.keys(o.events).length;
    const pts = Math.round((o.hours * pH + ev * pE + o.levels * pL + o.awards) * 10) / 10;
    return { id, name: C[id].name, company: companyOf_(C[id]) || 'Без компании', hours: round2_(o.hours), events: ev, levels: o.levels, awards: o.awards, points: pts };
  }).filter(x => x.points > 0).sort((a, b) => b.points - a.points);
  const comp = {};
  people.forEach(x => {
    const c = comp[x.company] || (comp[x.company] = { name: x.company, points: 0, people: 0, hours: 0, events: 0, levels: 0 });
    c.points += x.points; c.people++; c.hours += x.hours; c.events += x.events; c.levels += x.levels;
  });
  const companies = Object.keys(comp).map(k => comp[k]).map(c => Object.assign(c, { points: Math.round(c.points * 10) / 10, hours: round2_(c.hours), avg: Math.round(c.points / c.people * 10) / 10 }))
    .sort((a, b) => b.points - a.points);
  return { people, companies, rules: { pH, pE, pL } };
}
function leagueTable_(user, p) {
  const T = toolSettings_();
  const from = isDate_(p.from) ? p.from : T.league_from, to = isDate_(p.to) ? p.to : T.league_to;
  const r = leaguePoints_(from, to);
  const res = { name: T.league_name, from, to, companies: r.companies, rules: r.rules };
  if (isStaff_(user) || user.role === 'trainer') res.people = r.people.slice(0, 50);
  else {
    const mine = r.people.find(x => x.id === user.clientId);
    res.me = mine ? Object.assign({ place: r.people.indexOf(mine) + 1 }, mine) : null;
    res.people = r.people.slice(0, 10).map((x, i) => ({ name: x.name.split(' ').slice(0, 2).reverse().join(' ').replace(/ (\S)\S*$/, ' $1.'), company: x.company, points: x.points, place: i + 1 }));
  }
  return res;
}
function saveAward_(user, p) {
  const cid = req_(p.clientId, 'Выберите ученика');
  must_('clients', cid, 'Ученик');
  const id = insert_('awards', { date: isDate_(p.date) ? p.date : today_(), clientId: cid, clientName: nameOf_('clients', cid),
    title: String(req_(p.title, 'Напишите, за что баллы')).slice(0, 200), points: Number(p.points) || 0 });
  if (typeof clubAwardNotify_ === 'function') clubAwardNotify_(cid, String(p.title), Number(p.points) || 0);
  return id;
}
function saveLeague_(user, p) {
  ['league_name', 'league_from', 'league_to', 'league_pHour', 'league_pEvent', 'league_pLevel', 'tools_dances'].forEach(k => { if (k in p) setSetting_(k, p[k]); });
  return true;
}

// ---------------------------------------------------------------------------
// 4. Отчёт для HR компании
// ---------------------------------------------------------------------------
function hrReport_(user, p) {
  const company = String(req_(p.company, 'Выберите компанию'));
  const from = isDate_(p.from) ? p.from : addDays_(today_(), -30), to = isDate_(p.to) ? p.to : today_();
  const staff = tbl_('clients').rows.filter(c => companyOf_(c) === company);
  const ids = {}; staff.forEach(c => { ids[c.id] = 1; });
  const used = usage_(), S = settings_(), td = today_();
  const rows = {};
  staff.forEach(c => { rows[c.id] = { id: c.id, name: c.name, active: c.active, hours: 0, visits: 0, last: '', events: [], levels: [], remaining: 0, subEnd: '' }; });
  tbl_('lessons').rows.forEach(l => {
    if (!ids[l.clientId]) return;
    const r = rows[l.clientId];
    if (l.date > r.last && l.date <= to) r.last = l.date;
    if (l.date < from || l.date > to) return;
    const ty = typeOf_(l.type);
    if (ty.mode === 'fixed' || ty.kind === 'event') { const e = l.eventId ? find_('events', l.eventId) : null; r.events.push((e ? e.title : ty.name) + (e && e.results ? ' — ' + e.results : '')); }
    else { r.hours += Number(l.hours) || 0; r.visits++; }
  });
  tbl_('progress').rows.forEach(x => { if (ids[x.clientId] && x.date >= from && x.date <= to) rows[x.clientId].levels.push(x.dance + ': ' + (TOOL_LEVELS[x.level] || x.level)); });
  tbl_('subs').rows.forEach(s => {
    if (!ids[s.clientId]) return;
    const v = subView_(s, used, S, td);
    if (v.state === 'ok' || v.state === 'low') { rows[s.clientId].remaining += v.remaining; if (s.endDate && (!rows[s.clientId].subEnd || s.endDate < rows[s.clientId].subEnd)) rows[s.clientId].subEnd = s.endDate; }
  });
  const list = Object.keys(rows).map(k => rows[k]).filter(r => r.active || r.hours || r.events.length)
    .map(r => Object.assign(r, { hours: round2_(r.hours), remaining: round2_(r.remaining), events: Array.from(new Set(r.events)) }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  const lg = leaguePoints_(from, to);
  const place = lg.companies.findIndex(c => c.name === company);
  const tot = { people: list.length, activePeople: list.filter(r => r.hours > 0 || r.events.length).length,
    hours: round2_(list.reduce((a, r) => a + r.hours, 0)), visits: list.reduce((a, r) => a + r.visits, 0),
    events: list.reduce((a, r) => a + r.events.length, 0), levels: list.reduce((a, r) => a + r.levels.length, 0) };
  return { company, from, to, rows: list, total: tot, league: place >= 0 ? { place: place + 1, of: lg.companies.length, points: lg.companies[place].points } : null,
    club: settings_().clubName || CLUB_NAME };
}

// ---------------------------------------------------------------------------
// 5. Telegram-бот
// ---------------------------------------------------------------------------
function tgToken_() { return PropertiesService.getScriptProperties().getProperty('tgToken') || ''; }
function tgCall_(method, payload) {
  const token = tgToken_();
  if (!token) throw new Error('Бот не подключён');
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true });
  const j = parseJson_(r.getContentText(), {}) || {};
  if (!j.ok) throw new Error('Telegram: ' + (j.description || ('код ' + r.getResponseCode())));
  return j.result;
}
function tgSend_(chatId, text, markup) {
  const p = { chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (markup) p.reply_markup = markup;
  try { tgCall_('sendMessage', p); return true; }
  catch (e) { return false; }
}
function num_(n) { return String(round2_(+n || 0)).replace('.', ','); }
function tgEsc_(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function botStatus_(user) {
  const T = toolSettings_();
  let trig = false;
  try { trig = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'botPoll'); } catch (e) { /* нет прав */ }
  const rows = tbl_('tg').rows.filter(r => r.kind !== 'pending');
  const mode = PropertiesService.getScriptProperties().getProperty('tgMode') || 'poll';
  let hookErr = '';
  if (mode === 'hook' && user.role === 'admin') {
    try { const w = tgCall_('getWebhookInfo'); if (w.last_error_date && Date.now() / 1000 - w.last_error_date < 3600) hookErr = (w.last_error_message || 'ошибка доставки') + (w.pending_update_count ? ', ждут доставки: ' + w.pending_update_count : ''); } catch (e) { /* не критично */ }
  }
  return { connected: !!tgToken_(), name: T.bot_name || '', link: T.bot_name ? 'https://t.me/' + T.bot_name : '', triggers: trig, mode,
    hookNote: PropertiesService.getScriptProperties().getProperty('tgHookNote') || '', hookErr,
    linked: rows.filter(r => r.chatId).length, total: rows.length, pending: tbl_('tg').rows.filter(r => r.kind === 'pending').length, admin: user.role === 'admin' };
}
function botSave_(user, p) {
  if (user.role !== 'admin') throw new Error('Подключить бота может только администратор');
  const props = PropertiesService.getScriptProperties();
  if (p.token !== undefined && String(p.token).trim()) {
    const token = String(p.token).trim();
    if (!/^\d+:[\w-]{30,}$/.test(token)) throw new Error('Похоже, это не токен бота. Он выглядит как 123456789:AA…');
    props.setProperty('tgToken', token);
    try { const me = tgCall_('getMe'); setSetting_('bot_name', me.username || ''); }
    catch (e) { props.deleteProperty('tgToken'); throw new Error('Telegram не принял токен: ' + e.message); }
    props.deleteProperty('tgOffset');
  }
  ['bot_hour', 'bot_remind', 'bot_low', 'bot_lowHours', 'bot_inactive', 'bot_digest', 'bot_nudge'].forEach(k => { if (k in p) setSetting_(k, p[k]); });
  installBotTriggers_();
  if (typeof clubSetCommands_ === 'function') { try { clubSetCommands_(); } catch (e) { /* не критично */ } }
  // мгновенные ответы включаются сами (если не выключены вручную)
  if (PropertiesService.getScriptProperties().getProperty('tgMode') !== 'poll-manual') { try { botHookOn_(); } catch (e) { /* останется опрос раз в минуту */ } }
  return botStatus_(user);
}
// ---------------------------------------------------------------------------
// Мгновенные ответы: Telegram сам присылает сообщения в приложение (webhook).
// Если доставка не работает, бот сам возвращается к проверке раз в минуту.
// ---------------------------------------------------------------------------
function botHookOn_() {
  const url = ScriptApp.getService().getUrl();
  if (!url || /\/dev$/.test(url)) throw new Error('Не удалось определить адрес приложения');
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('tgHook') || newId_(24);
  props.setProperty('tgHook', secret);
  tgCall_('setWebhook', { url: url + '?tg=' + secret, allowed_updates: ['message', 'callback_query'], max_connections: 20 });
  props.setProperty('tgMode', 'hook');
  props.setProperty('tgHookAt', String(Date.now()));
  props.deleteProperty('tgHookNote');
}
function botHookOff_(note, manual) {
  const props = PropertiesService.getScriptProperties();
  try { tgCall_('deleteWebhook', { drop_pending_updates: false }); } catch (e) { /* бот отключён */ }
  props.setProperty('tgMode', manual ? 'poll-manual' : 'poll');
  if (note) props.setProperty('tgHookNote', note); else props.deleteProperty('tgHookNote');
}
function botHook_(user, p) {
  if (user.role !== 'admin') throw new Error('Только администратор');
  if (p.on) botHookOn_(); else botHookOff_('', true);
  return botStatus_(user);
}
/** Сообщение от Telegram (webhook). Повторы одного и того же сообщения отбрасываются. */
function tgWebhook_(u) {
  if (!u || !u.update_id) return;
  const c = cache_(), key = 'tgu_' + u.update_id;
  try { if (c.get(key)) return; c.put(key, '1', 21600); } catch (e) { /* без кэша */ }
  PropertiesService.getScriptProperties().setProperty('tgHookOk', String(Date.now()));
  withLock_(() => {
    Object.keys(_cache).forEach(k => delete _cache[k]);
    try { if (u.callback_query) { if (typeof clubCallback_ === 'function') clubCallback_(u.callback_query); } else if (u.message) botHandle_(u.message); }
    catch (e) { try { logError_('бот', 'webhook', e.message, e.stack, ''); } catch (x) { /* без журнала */ } }
  });
}
/** Раз в 5 минут: если Telegram не может доставить сообщения — назад к опросу раз в минуту. */
function botHookCheck_() {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('tgHookChk') || 0);
  if (Date.now() - last < 5 * 60000) return;
  props.setProperty('tgHookChk', String(Date.now()));
  let w; try { w = tgCall_('getWebhookInfo'); } catch (e) { return; }
  const now = Date.now() / 1000;
  const broken = !w.url || (w.last_error_date && now - w.last_error_date < 600 && (w.pending_update_count || 0) > 0);
  if (broken) {
    botHookOff_('Telegram не смог доставить сообщения' + (w.last_error_message ? ' (' + w.last_error_message + ')' : '') + ' — бот снова проверяет сообщения раз в минуту.');
    try { logError_('бот', 'webhook', 'Мгновенные ответы выключены: ' + (w.last_error_message || 'нет адреса'), '', ''); } catch (x) { /* без журнала */ }
  }
}
function botDisconnect_(user) {
  if (user.role !== 'admin') throw new Error('Только администратор');
  botHookOff_('', false);
  PropertiesService.getScriptProperties().deleteProperty('tgToken');
  ScriptApp.getProjectTriggers().filter(t => ['botPoll', 'botDaily'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  setSetting_('bot_name', '');
  return botStatus_(user);
}
function installBotTriggers_() {
  ScriptApp.getProjectTriggers().filter(t => ['botPoll', 'botDaily'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  if (!tgToken_()) return;
  ScriptApp.newTrigger('botPoll').timeBased().everyMinutes(1).create();
  const hour = Math.min(Math.max(parseInt(toolSettings_().bot_hour, 10) || 10, 0), 23);
  ScriptApp.newTrigger('botDaily').timeBased().atHour(hour).nearMinute(5).everyDays(1).inTimezone(tz_()).create();
}

/** Ссылка для подключения человека к боту. kind: client | trainer | user */
function tgLink_(user, p) {
  let kind = p.kind, refId = p.refId;
  if (!isStaff_(user) || p.self) {
    if (user.role === 'client') { kind = 'client'; refId = user.clientId; }
    else if (user.role === 'trainer') { kind = 'trainer'; refId = user.trainerId; }
    else { kind = 'user'; refId = user.id; }
  }
  if (['client', 'trainer', 'user'].indexOf(kind) < 0) throw new Error('Неизвестный тип');
  const name = kind === 'user' ? must_('users', refId, 'Пользователь').name : nameOf_(kind === 'client' ? 'clients' : 'trainers', refId);
  if (!name) throw new Error('Не найдено');
  let r = tbl_('tg').rows.find(x => x.kind === kind && x.refId === refId);
  if (!r) { insert_('tg', { kind, refId, name, code: newId_(12), notify: true }); r = tbl_('tg').rows.find(x => x.kind === kind && x.refId === refId); }
  else if (!r.code) update_('tg', r.id, { code: newId_(12) });
  const bot = toolSettings_().bot_name;
  return { id: r.id, linked: !!r.chatId, url: bot ? 'https://t.me/' + bot + '?start=' + r.code : '', code: r.code, name, bot };
}
function myTg_(user) {
  const kind = user.role === 'client' ? 'client' : user.role === 'trainer' ? 'trainer' : 'user';
  const refId = kind === 'client' ? user.clientId : kind === 'trainer' ? user.trainerId : user.id;
  const r = tbl_('tg').rows.find(x => x.kind === kind && x.refId === refId);
  return { connected: !!tgToken_(), linked: !!(r && r.chatId), notify: r ? r.notify : false, id: r ? r.id : '' };
}
function tgSetNotify_(user, p) {
  const r = must_('tg', p.id, 'Запись');
  if (!isStaff_(user)) {
    const mine = myTg_(user);
    if (mine.id !== r.id) throw new Error('Недостаточно прав');
  }
  update_('tg', r.id, { notify: !!p.notify });
  return true;
}
function tgUnlink_(user, p) {
  const r = must_('tg', p.id, 'Запись');
  update_('tg', r.id, { chatId: '', code: newId_(12), linkedAt: '' });
  return true;
}
function tgTest_(user, p) {
  const r = must_('tg', p.id, 'Запись');
  if (!r.chatId) throw new Error('Человек ещё не подключил бота');
  if (!tgSend_(r.chatId, '✅ Проверка связи от «' + tgEsc_(settings_().clubName || CLUB_NAME) + '». Уведомления работают.')) throw new Error('Telegram не доставил сообщение');
  return true;
}

/** Подтвердить заявку: привязать чат из «ждут подтверждения» к карточке. */
function tgAssign_(user, p) {
  const pend = must_('tg', p.id, 'Заявка');
  if (pend.kind !== 'pending') throw new Error('Это не заявка');
  const kind = p.kind, refId = p.refId;
  if (['client', 'trainer', 'user'].indexOf(kind) < 0 || !refId) throw new Error('Выберите, кого подключить');
  const name = kind === 'user' ? must_('users', refId, 'Пользователь').name : nameOf_(kind === 'client' ? 'clients' : 'trainers', refId);
  if (!name) throw new Error('Карточка не найдена');
  const chatId = pend.chatId;
  del_('tg', pend.id);
  tgBind_(kind, refId, name, chatId);
  tgSend_(chatId, 'Готово, ' + tgEsc_(name) + '! Менеджер подтвердил подключение к боту «' + tgEsc_(settings_().clubName || CLUB_NAME) + '».\n' + botHelp_(), botKb_());
  return true;
}
function tgReject_(user, p) {
  const pend = must_('tg', p.id, 'Заявка');
  if (pend.kind !== 'pending') throw new Error('Это не заявка');
  del_('tg', pend.id);
  return true;
}

/** Запускается каждую минуту: отвечает на команды бота. */
function botPoll() {
  if (!tgToken_()) return;
  const props = PropertiesService.getScriptProperties();
  const offset = Number(props.getProperty('tgOffset') || 0);
  let ups = [];
  if (props.getProperty('tgMode') === 'hook') { try { botHookCheck_(); } catch (e) { /* не критично */ } }
  if (props.getProperty('tgMode') !== 'hook') { try { ups = tgCall_('getUpdates', { offset: offset, timeout: 0, allowed_updates: ['message', 'callback_query'] }); } catch (e) { return; } }
  try { warmCache_(); } catch (e) { /* не критично */ }
  if (typeof clubTick_ === 'function') { try { clubTick_(); } catch (e) { try { logError_('бот', 'clubTick', e.message, e.stack, ''); } catch (x) { /* без журнала */ } } }
  if (!ups || !ups.length) return;
  props.setProperty('tgOffset', String(ups[ups.length - 1].update_id + 1));
  withLock_(() => {
    Object.keys(_cache).forEach(k => delete _cache[k]);
    ups.forEach(u => { try { if (u.callback_query) { if (typeof clubCallback_ === 'function') clubCallback_(u.callback_query); } else botHandle_(u.message); } catch (e) { try { logError_('бот', 'botPoll', e.message, e.stack, ''); } catch (x) { /* без журнала */ } } });
  });
}
const TG_PHONE_KB = { keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
const TG_NO_KB = { remove_keyboard: true };
/** Номер для сравнения: последние 10 цифр (+7, 8 и пробелы не важны). */
function phoneKey_(s) { const d = String(s || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
/** Привязать чат к карточке (создать запись, если её ещё нет). */
function tgBind_(kind, refId, name, chatId) {
  const r = tbl_('tg').rows.find(x => x.kind === kind && x.refId === refId);
  if (r) update_('tg', r.id, { chatId, linkedAt: now_(), notify: true, name });
  else insert_('tg', { kind, refId, name, chatId, code: newId_(12), notify: true, linkedAt: now_() });
}
/** Найти карточки по номеру телефона: ученики и тренеры. */
function tgFindByPhone_(phone) {
  const k = phoneKey_(phone);
  if (!k) return [];
  const out = [];
  tbl_('clients').rows.forEach(c => { if (c.active && phoneKey_(c.phone) === k) out.push({ kind: 'client', id: c.id, name: c.name }); });
  tbl_('trainers').rows.forEach(t => { if (t.active && (phoneKey_(t.phone) === k || phoneKey_(t.phone2) === k)) out.push({ kind: 'trainer', id: t.id, name: t.name }); });
  return out;
}
/** Тренер по нику Telegram из карточки (поле «Мессенджер»). */
function tgFindByNick_(nick) {
  nick = String(nick || '').toLowerCase().replace(/^@/, '');
  if (!nick) return [];
  return tbl_('trainers').rows.filter(t => t.active && String(t.telegram || '').toLowerCase().replace(/^@/, '').trim() === nick).map(t => ({ kind: 'trainer', id: t.id, name: t.name }));
}
function tgWelcome_(chatId, found, club) {
  found.forEach(f => tgBind_(f.kind, f.id, f.name, chatId));
  const names = Array.from(new Set(found.map(f => f.name))).join(', ');
  return tgSend_(chatId, 'Готово, ' + tgEsc_(names) + '! Вы подключены к боту «' + tgEsc_(club) + '».\n' + botHelp_(), botKb_());
}
function botHandle_(m) {
  if (!m || !m.chat) return;
  const chatId = String(m.chat.id);
  const text = String(m.text || '').trim();
  const club = settings_().clubName || CLUB_NAME;
  const mine = tbl_('tg').rows.filter(r => r.chatId === chatId && r.kind !== 'pending');
  // человек поделился номером
  if (m.contact) {
    if (m.from && m.contact.user_id && String(m.contact.user_id) !== String(m.from.id)) return tgSend_(chatId, 'Пожалуйста, отправьте свой номер кнопкой «Поделиться номером».', TG_PHONE_KB);
    const phone = m.contact.phone_number;
    const found = tgFindByPhone_(phone);
    const clientsFound = found.filter(f => f.kind === 'client');
    if (found.length && clientsFound.length <= 1) {
      tbl_('tg').rows.filter(r => r.kind === 'pending' && r.chatId === chatId).forEach(r => del_('tg', r.id));
      return tgWelcome_(chatId, found, club);
    }
    const who = [m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(' ') + (m.from && m.from.username ? ' (@' + m.from.username + ')' : '');
    const pend = tbl_('tg').rows.find(r => r.kind === 'pending' && r.chatId === chatId);
    const d = { kind: 'pending', refId: '', name: who || 'Без имени', chatId, code: '+' + String(phone).replace(/\D/g, ''), notify: true, linkedAt: now_() };
    if (pend) update_('tg', pend.id, d); else insert_('tg', d);
    return tgSend_(chatId, (found.length ? 'Этот номер указан у нескольких человек.' : 'Не нашли ваш номер в карточках клуба.') + ' Мы передали заявку менеджеру — он подтвердит подключение, и бот напишет вам.', TG_NO_KB);
  }
  if (!text) return;
  const st = text.match(/^\/start(?:\s+(\S+))?/);
  if (st) {
    const code = st[1];
    const r = code ? tbl_('tg').rows.find(x => x.code === code && x.kind !== 'pending') : null;
    if (r) {
      update_('tg', r.id, { chatId, linkedAt: now_(), notify: true });
      return tgSend_(chatId, 'Готово, ' + tgEsc_(r.name) + '! Вы подключены к боту «' + tgEsc_(club) + '».\n' + botHelp_(), botKb_());
    }
    if (mine.length) return tgSend_(chatId, 'Вы уже подключены: ' + tgEsc_(mine.map(x => x.name).join(', ')) + '\n' + botHelp_(), botKb_());
    const byNick = tgFindByNick_(m.from && m.from.username);
    if (byNick.length === 1) return tgWelcome_(chatId, byNick, club);
    if (tbl_('tg').rows.some(x => x.kind === 'pending' && x.chatId === chatId)) return tgSend_(chatId, 'Ваша заявка у менеджера. Как только он подтвердит, бот напишет вам.');
    return tgSend_(chatId, 'Здравствуйте! Это бот «' + tgEsc_(club) + '».\nЧтобы подключиться, нажмите кнопку <b>«📱 Поделиться номером»</b> внизу — мы найдём вас по номеру телефона из карточки клуба.', TG_PHONE_KB);
  }
  if (!mine.length) {
    if (tbl_('tg').rows.some(x => x.kind === 'pending' && x.chatId === chatId)) return tgSend_(chatId, 'Ваша заявка у менеджера. Как только он подтвердит, бот напишет вам.');
    return tgSend_(chatId, 'Вы ещё не подключены. Нажмите «📱 Поделиться номером», чтобы мы нашли вас по номеру телефона.', TG_PHONE_KB);
  }
  if (typeof clubBotText_ === 'function' && clubBotText_(chatId, text, mine)) return true;
  if (/^\/stop/.test(text)) { mine.forEach(r => update_('tg', r.id, { notify: false })); return tgSend_(chatId, 'Уведомления выключены. Включить снова: /on'); }
  if (/^\/on/.test(text)) { mine.forEach(r => update_('tg', r.id, { notify: true })); return tgSend_(chatId, 'Уведомления включены.'); }
  if (/^\/(balance|остаток)/i.test(text)) return tgSend_(chatId, mine.map(botBalance_).join('\n\n'));
  if (/^\/(next|ближайшие)/i.test(text)) return tgSend_(chatId, mine.map(botNext_).join('\n\n'));
  if (/^\/(today|сегодня)/i.test(text)) return tgSend_(chatId, botDigestText_(true) || 'Сегодня ничего не запланировано.');
  return tgSend_(chatId, botHelp_());
}
function botHelp_() {
  return 'Команды:\n/schedule — расписание и запись на занятия\n/my — мои записи\n/balance — остаток часов\n/events — мероприятия клуба\n/login — войти в приложение без пароля\n/apk — скачать приложение для Android\n/next — ближайшие занятия\n/today — сводка на сегодня (для сотрудников)\n/stop — выключить уведомления\n/on — включить уведомления';
}
function botKb_() { return typeof clubMenuKb_ === 'function' ? clubMenuKb_() : TG_NO_KB; }
function botBalance_(r) {
  if (r.kind !== 'client') return tgEsc_(r.name) + ': остаток часов есть только у учеников.';
  const used = usage_(), S = settings_(), td = today_();
  const subs = tbl_('subs').rows.filter(s => s.clientId === r.refId).map(s => subView_(s, used, S, td)).filter(s => ['ok', 'low', 'ended'].indexOf(s.state) >= 0);
  if (!subs.length) return tgEsc_(r.name) + ': активных абонементов нет.';
  return '<b>' + tgEsc_(r.name) + '</b>\n' + subs.map(s => '• ' + tgEsc_(s.title || (s.hours + ' ч')) + ': осталось <b>' + num_(s.remaining) + ' ч</b>' + (s.endDate ? ' (до ' + ruDate_(s.endDate) + ')' : '')).join('\n');
}
function botNext_(r) {
  const td = today_();
  const slots = {}; tbl_('slots').rows.forEach(s => { slots[s.id] = s; });
  let items = [];
  if (r.kind === 'client') items = tbl_('bookings').rows.filter(b => b.clientId === r.refId && b.status === 'booked' && slots[b.slotId] && slots[b.slotId].date >= td && slots[b.slotId].status === 'open').map(b => slots[b.slotId]);
  else if (r.kind === 'trainer') items = tbl_('slots').rows.filter(s => s.trainerId === r.refId && s.date >= td && s.status === 'open');
  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!items.length) return tgEsc_(r.name) + ': ближайших записей нет.';
  return '<b>' + tgEsc_(r.name) + '</b>\n' + items.slice(0, 8).map(s => '• ' + ruDate_(s.date) + ' ' + s.time + ' — ' + tgEsc_(s.title || typeOf_(s.type).name) + (r.kind === 'client' ? ', ' + tgEsc_(s.trainerName) : '')).join('\n');
}
function botSent_() { return parseJson_(PropertiesService.getScriptProperties().getProperty('tgSent'), {}) || {}; }
function botSentSave_(o) {
  const keys = Object.keys(o);
  if (keys.length > 1500) keys.sort((a, b) => String(o[a]).localeCompare(String(o[b]))).slice(0, keys.length - 1200).forEach(k => delete o[k]);
  PropertiesService.getScriptProperties().setProperty('tgSent', JSON.stringify(o));
}
function botInactive_(days) {
  const td = today_(), used = usage_(), S = settings_();
  const last = {}; tbl_('lessons').rows.forEach(l => { if (l.clientId && (!last[l.clientId] || l.date > last[l.clientId])) last[l.clientId] = l.date; });
  const withSub = {}; tbl_('subs').rows.forEach(s => { const v = subView_(s, used, S, td); if (v.state === 'ok' || v.state === 'low') withSub[s.clientId] = 1; });
  return tbl_('clients').rows.filter(c => c.active && withSub[c.id] && (!last[c.id] || daysBetween_(last[c.id], td) >= days))
    .map(c => ({ id: c.id, name: c.name, last: last[c.id] || '', days: last[c.id] ? daysBetween_(last[c.id], td) : null }))
    .sort((a, b) => (b.days || 999) - (a.days || 999));
}
function botDigestText_(short) {
  const T = toolSettings_(), td = today_(), used = usage_(), S = settings_();
  const parts = [];
  const slots = tbl_('slots').rows.filter(s => s.date === td && s.status === 'open').sort((a, b) => a.time.localeCompare(b.time));
  if (slots.length) parts.push('<b>Сегодня в расписании</b>\n' + slots.map(s => '• ' + s.time + ' ' + tgEsc_(s.trainerName) + ' — ' + tgEsc_(s.title || typeOf_(s.type).name) + ' (' + tbl_('bookings').rows.filter(b => b.slotId === s.id && bSeat_(b)).length + ' зап.)').join('\n'));
  const pend = tbl_('bookings').rows.filter(b => b.status === 'pending');
  if (pend.length) parts.push('🕓 <b>Ждут подтверждения записи: ' + pend.length + '</b> — откройте раздел «Записи» в приложении.');
  const rent = tbl_('rent').rows.filter(r => r.date === td || (r.unit === 'day' && r.date <= td && (r.endDate || r.date) >= td));
  if (rent.length) parts.push('<b>Аренда</b>\n' + rent.map(r => '• ' + r.time + ' ' + tgEsc_(r.renter) + ', ' + tgEsc_(r.hall)).join('\n'));
  if (short) return parts.join('\n\n');
  const low = tbl_('subs').rows.map(s => subView_(s, used, S, td)).filter(s => (s.state === 'low' || s.state === 'ended') && (s.status || 'active') === 'active');
  if (low.length) parts.push('<b>Абонементы заканчиваются</b>\n' + low.slice(0, 12).map(s => '• ' + tgEsc_(s.clientName) + ': ' + (s.remaining > 0 ? 'осталось ' + num_(s.remaining) + ' ч' : 'часы закончились')).join('\n') + (low.length > 12 ? '\n…и ещё ' + (low.length - 12) : ''));
  const ina = botInactive_(+T.bot_inactive || 14);
  if (ina.length) parts.push('<b>Давно не были (' + (+T.bot_inactive || 14) + '+ дней)</b>\n' + ina.slice(0, 12).map(c => '• ' + tgEsc_(c.name) + (c.last ? ' — с ' + ruDate_(c.last) : ' — ещё не занимался')).join('\n') + (ina.length > 12 ? '\n…и ещё ' + (ina.length - 12) : ''));
  const md = td.slice(5);
  const bd = tbl_('clients').rows.filter(c => c.active && String(c.birthDate || '').slice(5) === md).concat(tbl_('trainers').rows.filter(t => t.active && String(t.birthDate || '').slice(5) === md));
  if (bd.length) parts.push('🎂 <b>День рождения</b>: ' + bd.map(x => tgEsc_(x.name)).join(', '));
  return parts.join('\n\n');
}

/** Раз в день: напоминания, остаток часов, сводка сотрудникам. */
function botDaily() {
  if (!tgToken_()) return { sent: 0 };
  return withLock_(() => botDailyRun_());
}
function botDailyRun_() {
  const T = toolSettings_(), td = today_(), tm = addDays_(td, 1), used = usage_(), S = settings_();
  const sent = botSent_();
  const club = tgEsc_(S.clubName || CLUB_NAME);
  const tg = tbl_('tg').rows.filter(r => r.chatId && r.notify);
  const byRef = {}; tg.forEach(r => { (byRef[r.kind + ':' + r.refId] = byRef[r.kind + ':' + r.refId] || []).push(r); });
  let n = 0;
  const send = (r, text, key) => {
    if (key && sent[key]) return;
    if (tgSend_(r.chatId, text)) { n++; if (key) sent[key] = td; update_('tg', r.id, { lastSent: now_() }); }
  };
  const slots = {}; tbl_('slots').rows.forEach(s => { slots[s.id] = s; });
  if (T.bot_remind === 'true') {
    tbl_('bookings').rows.forEach(b => {
      const s = slots[b.slotId];
      if (!s || s.date !== tm || s.status !== 'open' || b.status !== 'booked') return;
      (byRef['client:' + b.clientId] || []).forEach(r => send(r, '🔔 Напоминание: завтра, ' + ruDate_(s.date) + ' в ' + s.time + ' — ' + tgEsc_(s.title || typeOf_(s.type).name) + ', тренер ' + tgEsc_(s.trainerName) + '.\n' + club, 'rem:' + b.id));
    });
    const byTr = {};
    tbl_('slots').rows.filter(s => s.date === tm && s.status === 'open').forEach(s => { (byTr[s.trainerId] = byTr[s.trainerId] || []).push(s); });
    Object.keys(byTr).forEach(tid => (byRef['trainer:' + tid] || []).forEach(r => send(r, '🔔 Завтра у вас:\n' + byTr[tid].sort((a, b) => a.time.localeCompare(b.time)).map(s => '• ' + s.time + ' ' + tgEsc_(s.title || typeOf_(s.type).name) + ' — записано ' + tbl_('bookings').rows.filter(b => b.slotId === s.id && b.status === 'booked').length).join('\n'), 'remtr:' + tid + ':' + tm)));
  }
  if (T.bot_low === 'true') {
    const lim = +T.bot_lowHours || 2;
    tbl_('subs').rows.forEach(s => {
      if ((s.status || 'active') !== 'active') return;
      const v = subView_(s, used, S, td);
      if (v.remaining > lim) return;
      const key = (v.remaining > 0 ? 'low:' : 'end:') + s.id;
      const text = v.remaining > 0 ? '⏳ В абонементе «' + tgEsc_(s.title || s.hours + ' ч') + '» осталось ' + num_(v.remaining) + ' ч. Продлить можно у менеджера клуба.'
        : '⌛ Часы в абонементе «' + tgEsc_(s.title || s.hours + ' ч') + '» закончились. Чтобы продолжить занятия, продлите абонемент у менеджера клуба.';
      const pay = typeof payText_ === 'function' ? payText_({ price: +s.price || 0 }) : '';
      (byRef['client:' + s.clientId] || []).forEach(r => send(r, text + pay + '\n' + club, key));
    });
  }
  if (T.bot_nudge === 'true') {
    botInactive_(+T.bot_inactive || 14).forEach(c => (byRef['client:' + c.id] || []).forEach(r => send(r, 'Мы скучаем! 💃 Давно не виделись на паркете. Запишитесь на занятие в приложении клуба или ответьте менеджеру.\n' + club, 'nudge:' + c.id + ':' + c.last)));
  }
  if (T.bot_digest === 'true') {
    const text = botDigestText_(false);
    const staff = tbl_('users').rows.filter(u => u.active && STAFF.indexOf(u.role) >= 0);
    staff.forEach(u => (byRef['user:' + u.id] || []).forEach(r => send(r, '☀️ <b>Сводка на ' + ruDate_(td) + '</b>\n\n' + (text || 'Всё спокойно: заканчивающихся абонементов и пропавших учеников нет.'), 'dig:' + u.id + ':' + td)));
  }
  if (typeof clubDaily_ === 'function') { try { n += clubDaily_(sent); } catch (e) { try { logError_('бот', 'clubDaily', e.message, e.stack, ''); } catch (x) { /* без журнала */ } } }
  botSentSave_(sent);
  return { sent: n };
}
function botRunNow_(user) {
  if (!tgToken_()) throw new Error('Сначала подключите бота');
  return botDailyRun_();
}

// ---------------------------------------------------------------------------
// Регистрация действий
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Рассылки: свободное сообщение всем или выбранным
// ---------------------------------------------------------------------------
const BC_TYPES = {
  info: ['📢', 'Объявление'], important: ['❗', 'Важно'], event: ['🎉', 'Мероприятие'],
  schedule: ['🗓', 'Изменение расписания'], tech: ['⚠️', 'Технические работы'], other: ['💬', 'Сообщение'],
};
/** Кто получит рассылку: подключённые к боту люди по фильтрам. */
function bcRecipients_(p) {
  const kinds = [].concat(p.kinds || []).filter(k => ['client', 'trainer', 'user'].indexOf(k) >= 0);
  const picked = [].concat(p.ids || []).filter(Boolean);
  let inGroup = null;
  if (p.groupId) {
    const g = must_('groups', p.groupId, 'Группа');
    inGroup = {}; ids_(g.clientIds).forEach(x => { inGroup['client:' + x] = 1; }); ids_(g.trainerIds).forEach(x => { inGroup['trainer:' + x] = 1; });
  }
  let comp = null;
  if (p.company) { comp = {}; tbl_('clients').rows.forEach(c => { if (companyOf_(c) === p.company) comp[c.id] = 1; }); }
  const C = {}; tbl_('clients').rows.forEach(c => { C[c.id] = c; });
  const T = {}; tbl_('trainers').rows.forEach(t => { T[t.id] = t; });
  const U = {}; tbl_('users').rows.forEach(u => { U[u.id] = u; });
  const seen = {};
  return tbl_('tg').rows.filter(r => {
    if (!r.chatId) return false;
    if (!p.force && !r.notify) return false;
    if (picked.length) return picked.indexOf(r.id) >= 0;
    if (kinds.indexOf(r.kind) < 0) return false;
    if (r.kind === 'client' && !(C[r.refId] && C[r.refId].active)) return false;
    if (r.kind === 'trainer' && !(T[r.refId] && T[r.refId].active)) return false;
    if (r.kind === 'user' && !(U[r.refId] && U[r.refId].active)) return false;
    if (inGroup && !inGroup[r.kind + ':' + r.refId]) return false;
    if (comp && !(r.kind === 'client' && comp[r.refId])) return false;
    return true;
  }).filter(r => { if (seen[r.chatId]) return false; seen[r.chatId] = 1; return true; });
}
function bcAudience_(p) {
  const names = { client: 'ученики', trainer: 'тренеры', user: 'сотрудники' };
  if ([].concat(p.ids || []).length) return 'выбранные: ' + [].concat(p.ids).length;
  const parts = [[].concat(p.kinds || []).map(k => names[k]).filter(Boolean).join(', ') || '—'];
  if (p.groupId) { const g = find_('groups', p.groupId); if (g) parts.push('группа «' + g.name + '»'); }
  if (p.company) parts.push('компания «' + p.company + '»');
  if (p.force) parts.push('включая отключивших уведомления');
  return parts.join('; ');
}
function bcText_(p) {
  const t = BC_TYPES[p.category] || BC_TYPES.info;
  const club = tgEsc_(settings_().clubName || CLUB_NAME);
  const title = String(p.title || '').trim();
  return t[0] + ' <b>' + tgEsc_(title || t[1]) + '</b>\n\n' + tgEsc_(String(p.text || '').trim()) + '\n\n— ' + club;
}
function botBroadcast_(user, p) {
  const text = String(p.text || '').trim();
  const list = bcRecipients_(p);
  if (p.dry) return { total: list.length, names: list.slice(0, 12).map(r => r.name) };
  if (!text) throw new Error('Напишите текст сообщения');
  if (text.length > 3500) throw new Error('Слишком длинное сообщение: до 3500 символов');
  if (!list.length && !p.news) throw new Error('Нет получателей: никто из выбранных не подключил бота');
  if (list.length && !tgToken_()) throw new Error('Сначала подключите бота');
  const msg = bcText_(p);
  let sent = 0, failed = 0;
  list.forEach((r, i) => {
    if (tgSend_(r.chatId, msg)) sent++; else failed++;
    if (i % 25 === 24) Utilities.sleep(1000); // ограничение Telegram — не больше ~30 сообщений в секунду
  });
  const cat = (BC_TYPES[p.category] || BC_TYPES.info)[1];
  withLock_(() => {
    Object.keys(_cache).forEach(k => delete _cache[k]);
    insert_('broadcasts', { author: user.name, category: cat, title: String(p.title || '').slice(0, 200), text: text.slice(0, 3500),
      audience: bcAudience_(p), total: list.length, sent, failed });
    if (p.news) insert_('messages', { channel: 'news', userId: user.id, userName: user.name, text: ((p.title ? p.title + '\n' : '') + text).slice(0, 2000) });
  });
  return { total: list.length, sent, failed };
}
function botBroadcasts_() {
  return tbl_('broadcasts').rows.slice(-50).reverse();
}

/** Вкладки «Инструментов», которые администратор может открыть другим ролям (настройка «Доступ»). Администратору доступно всё. */
const TOOL_TABS_FOR = {
  manager: ['bot', 'renew', 'lost', 'rate', 'fests', 'halls', 'subst', 'money', 'media', 'pair', 'passport', 'league', 'hr'],
  trainer: ['pair', 'passport', 'league', 'halls', 'media', 'tg'],
  client: ['my', 'league', 'media', 'tg'],
};
function toolsAccess_() {
  const a = parseJson_(settings_().tools_access, {}) || {};
  const o = {};
  Object.keys(TOOL_TABS_FOR).forEach(r => { o[r] = [].concat(a[r] || []).filter(t => TOOL_TABS_FOR[r].indexOf(t) >= 0); });
  return o;
}
function saveToolsAccess_(user, p) {
  const a = p.access || {};
  const o = {};
  Object.keys(TOOL_TABS_FOR).forEach(r => { o[r] = [].concat(a[r] || []).filter(t => TOOL_TABS_FOR[r].indexOf(t) >= 0); });
  setSetting_('tools_access', JSON.stringify(o));
  return o;
}
/** Оставляет у действия только те роли, которым открыта хотя бы одна из его вкладок. '*' — любая вкладка. */
function gateTools_(all, map) {
  const acc = toolsAccess_();
  Object.keys(all).forEach(k => {
    const tabs = map[k];
    if (tabs === undefined) return;
    all[k].roles = all[k].roles.filter(r => r === 'admin' || (tabs === '*' ? (acc[r] || []).length > 0 : tabs.some(t => (acc[r] || []).indexOf(t) >= 0)));
  });
  return all;
}
const TOOL_HANDLER_TABS = {
  toolsLoad: '*', saveDancer: ['pair', 'my', 'passport'], toolsMatch: ['pair'],
  saveProgress: ['passport'], deleteProgress: ['passport'], saveDiary: ['passport'], deleteDiary: ['passport'],
  leagueTable: ['league'], saveAward: ['league'], deleteAward: ['league'], saveLeague: ['league'], hrReport: ['hr'],
  botSave: ['bot'], botHook: ['bot'], botDisconnect: ['bot'], botRunNow: ['bot'], tgLink: ['bot', 'tg'], tgSetNotify: ['bot', 'tg'],
  tgUnlink: ['bot'], tgTest: ['bot'], tgAssign: ['bot'], tgReject: ['bot'], botBroadcast: ['bot'], botBroadcasts: ['bot'],
};
function toolHandlers_() {
  const all = gateTools_(toolHandlersAll_(), TOOL_HANDLER_TABS);
  all.saveToolsAccess = { roles: ['admin'], write: true, fn: saveToolsAccess_ };
  return all;
}
function toolHandlersAll_() {
  return {
  toolsLoad: { roles: ALL, fn: toolsLoad_ },
  saveDancer: { roles: ALL, write: true, fn: saveDancer_ },
  toolsMatch: { roles: ['admin', 'manager', 'trainer'], fn: toolsMatch_ },
  saveProgress: { roles: ['admin', 'manager', 'trainer'], write: true, fn: saveProgress_ },
  deleteProgress: { roles: ['admin', 'manager', 'trainer'], write: true, fn: deleteProgress_ },
  saveDiary: { roles: ['admin', 'manager', 'trainer'], write: true, fn: saveDiary_ },
  deleteDiary: { roles: ['admin', 'manager', 'trainer'], write: true, fn: deleteDiary_ },
  leagueTable: { roles: ALL, fn: leagueTable_ },
  saveAward: { roles: STAFF, write: true, fn: saveAward_ },
  deleteAward: { roles: STAFF, write: true, fn: (u, p) => del_('awards', must_('awards', p.id, 'Запись').id) },
  saveLeague: { roles: STAFF, write: true, fn: saveLeague_ },
  hrReport: { roles: STAFF, fn: hrReport_ },
  botSave: { roles: ['admin'], write: true, fn: botSave_ },
  botHook: { roles: ['admin'], write: true, fn: botHook_ },
  botDisconnect: { roles: ['admin'], write: true, fn: botDisconnect_ },
  botRunNow: { roles: ['admin'], write: true, fn: botRunNow_ },
  tgLink: { roles: ALL, write: true, fn: tgLink_ },
  tgSetNotify: { roles: ALL, write: true, fn: tgSetNotify_ },
  tgUnlink: { roles: STAFF, write: true, fn: tgUnlink_ },
  tgTest: { roles: STAFF, fn: tgTest_ },
  tgAssign: { roles: STAFF, write: true, fn: tgAssign_ },
  tgReject: { roles: STAFF, write: true, fn: tgReject_ },
  botBroadcast: { roles: STAFF, fn: botBroadcast_ },
  botBroadcasts: { roles: STAFF, fn: botBroadcasts_ },
  };
}
