/**
 * Модуль «Клуб+» — развитие приложения без переделки основного кода:
 *  • запись на занятия через Telegram-бота, лист ожидания, напоминание за 3 часа («приду / не приду»)
 *  • продление абонементов: список «кому продлевать», напоминание с реквизитами и QR для оплаты
 *  • удержание: ученики, которые перестали ходить, и «позвать обратно»
 *  • оценка занятий учениками (1–5 и комментарий) — рейтинг тренеров
 *  • календарь занятости залов и пересечения аренды с расписанием (в интерфейсе)
 *  • доходы и расходы, прибыль по месяцам и по компаниям
 *  • замена тренера с уведомлением записанных
 *  • ссылка для HR компании (только просмотр, без входа)
 *  • мероприятия клуба: регистрация пар, репетиции, напоминания, итоги в лигу и паспорт танцора
 *  • домашние задания с видео, поздравления с днём рождения, уведомления о баллах лиги
 *  • фото-аватары и настраиваемая Главная
 *
 * Действия регистрируются в clubHandlers_() — api_() ищет их там после HANDLERS и toolHandlers_().
 * Константы основного файла и Tools.gs здесь читаются только внутри функций.
 */

const CLUB_DEFAULTS = {
  bot_book: 'true', bot_rem3: 'true', bot_remHours: 3, bot_fb: 'true', bot_bday: 'true', bot_renew: 'true',
  renew_days: 5, lost_days: 21,
  bday_text: 'С днём рождения, {имя}! 🎉 Желаем лёгкости в каждом шаге, ярких выступлений и радости от танца. Ждём вас на паркете!',
  call_text: 'Здравствуйте, {имя}! Мы скучаем 💃 Давно не виделись на паркете. Хотите, подберём удобное время занятия? Ответьте на это сообщение или запишитесь через «📅 Расписание».',
  pay_link: '', pay_name: '', pay_acc: '', pay_bank: '', pay_bic: '', pay_corr: '', pay_inn: '', pay_kpp: '',
  exp_cats: 'Аренда помещения, Зарплата сотрудников, Реклама, Костюмы и инвентарь, Налоги и банк, Прочее',
};
const FEST_KINDS = { party: 'Корпоративный вечер', tournament: 'Турнир', show: 'Выступление', master: 'Мастер-класс', other: 'Другое' };

function clubSettings_() {
  const S = settings_();
  const o = {};
  Object.keys(CLUB_DEFAULTS).forEach(k => { o[k] = (k in S && S[k] !== '') ? S[k] : CLUB_DEFAULTS[k]; });
  return o;
}
function clubName_() { return settings_().clubName || CLUB_NAME; }
function firstName_(full) { const p = String(full || '').trim().split(/\s+/); return p[1] || p[0] || ''; }
function clubNowHM_() { return Utilities.formatDate(new Date(), tz_(), 'HH:mm'); }
function hm2min_(s) { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : -1; }
function isOn_(v) { return v === true || String(v) === 'true'; }
function clubCanTg_() { return typeof tgToken_ === 'function' && !!tgToken_(); }

/** Подключённые чаты человека. respect — учитывать галку «уведомления». */
function tgChats_(kind, refId, respect) {
  return tbl_('tg').rows.filter(r => r.kind === kind && r.refId === refId && r.chatId && (!respect || r.notify));
}
/** Отправить человеку в Telegram. key — защита от повтора (хранится в botSent_). Возвращает число отправленных. */
function tgNotify_(kind, refId, text, markup, key, sent, respect) {
  if (!clubCanTg_()) return 0;
  if (key && sent && sent[key]) return 0;
  let n = 0;
  const seen = {};
  tgChats_(kind, refId, respect !== false).forEach(r => {
    if (seen[r.chatId]) return; seen[r.chatId] = 1;
    if (tgSend_(r.chatId, text, markup)) { n++; try { update_('tg', r.id, { lastSent: now_() }); } catch (e) { /* не важно */ } }
  });
  if (n && key && sent) sent[key] = today_();
  return n;
}
function clubMenuKb_() {
  return { keyboard: [[{ text: '📅 Расписание' }, { text: '🗓 Мои записи' }], [{ text: '⏳ Остаток часов' }, { text: '🎉 Мероприятия' }], [{ text: '🔑 Войти в приложение' }]], resize_keyboard: true };
}
function slotTitle_(s) { return s.title || typeOf_(s.type).name; }
function slotWhen_(s) { return TOOL_DAYS[(new Date(s.date + 'T12:00:00Z').getUTCDay() + 6) % 7] + ' ' + ruDate_(s.date).slice(0, 5) + ' ' + (s.time || ''); }

// ---------------------------------------------------------------------------
// Запись через бота и лист ожидания
// ---------------------------------------------------------------------------
function bookedCount_(slotId) { return tbl_('bookings').rows.filter(b => b.slotId === slotId && b.status === 'booked').length; }
function waitList_(slotId) {
  return tbl_('bookings').rows.filter(b => b.slotId === slotId && b.status === 'wait').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
/** Открытые слоты на ближайшие дни (сегодняшние — ещё не начавшиеся). */
function slotsAhead_(days) {
  const td = today_(), last = addDays_(td, days), now = hm2min_(clubNowHM_());
  return tbl_('slots').rows.filter(s => s.status === 'open' && s.date >= td && s.date <= last && !(s.date === td && hm2min_(s.time) >= 0 && hm2min_(s.time) <= now))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
function joinWait_(clientId, slotId) {
  const s = must_('slots', slotId, 'Занятие');
  const c = must_('clients', clientId, 'Ученик');
  if (s.status !== 'open' || s.date < today_()) throw new Error('Запись на это занятие закрыта');
  const mine = tbl_('bookings').rows.find(b => b.slotId === s.id && b.clientId === clientId && (b.status === 'booked' || b.status === 'wait'));
  if (mine) throw new Error(mine.status === 'booked' ? 'Вы уже записаны' : 'Вы уже в листе ожидания');
  if (bookedCount_(s.id) < (s.capacity || 1)) return { booked: true, id: book_({ role: 'client', clientId }, { slotId: s.id }) };
  const id = insert_('bookings', { slotId: s.id, clientId, clientName: c.name, status: 'wait' });
  return { wait: true, id, pos: waitList_(s.id).findIndex(b => b.id === id) + 1 };
}
/** Освободилось место — первого из листа ожидания записываем и сообщаем ему. Вызывается из cancelBooking_. */
function clubSeatFreed_(s) {
  try {
    if (!s || s.status !== 'open' || s.date < today_()) return;
    let free = (s.capacity || 1) - bookedCount_(s.id);
    const wl = waitList_(s.id);
    while (free > 0 && wl.length) {
      const b = wl.shift();
      update_('bookings', b.id, { status: 'booked' });
      free--;
      tgNotify_('client', b.clientId, '🎉 Освободилось место — вы записаны!\n<b>' + tgEsc_(slotTitle_(s)) + '</b>, ' + slotWhen_(s) + ', тренер ' + tgEsc_(s.trainerName) + '.\nЕсли не сможете прийти — отмените запись, чтобы место досталось следующему.',
        { inline_keyboard: [[{ text: '❌ Отменить запись', callback_data: 'cx:' + b.id }]] }, null, null, false);
    }
  } catch (e) { /* запись уже отменена — уведомление не критично */ }
}
/** Слот отменили или заменили тренера — сообщаем записанным. Вызывается из cancelSlot_. */
function clubSlotCancelled_(s, bookings) {
  try {
    const msg = '⚠️ Занятие <b>' + tgEsc_(slotTitle_(s)) + '</b> ' + slotWhen_(s) + ' отменено. Приносим извинения! Выберите другое время: «📅 Расписание».';
    bookings.filter(b => b.status === 'booked' || b.status === 'wait').forEach(b => tgNotify_('client', b.clientId, msg, null, null, null, false));
  } catch (e) { /* без бота */ }
}
function joinWaitApi_(user, p) {
  const cid = user.role === 'client' ? user.clientId : req_(p.clientId, 'Выберите ученика');
  return joinWait_(cid, req_(p.slotId, 'Выберите занятие'));
}

/** Текст и кнопки расписания для ученика в боте. */
function botScheduleMsg_(clientId) {
  const c = find_('clients', clientId);
  const list = slotsAhead_(7).slice(0, 14);
  if (!list.length) return { text: 'На ближайшую неделю открытых занятий нет. Загляните позже!' };
  const mine = {};
  tbl_('bookings').rows.forEach(b => { if (b.clientId === clientId && (b.status === 'booked' || b.status === 'wait')) mine[b.slotId] = b; });
  const rows = list.map(s => {
    const b = mine[s.id], free = (s.capacity || 1) - bookedCount_(s.id);
    const lbl = slotWhen_(s) + ' ' + slotTitle_(s);
    if (b && b.status === 'booked') return [{ text: '✅ ' + lbl + ' — отменить', callback_data: 'cx:' + b.id }];
    if (b) return [{ text: '⏳ ' + lbl + ' — выйти из ожидания', callback_data: 'cx:' + b.id }];
    if (free > 0) return [{ text: '➕ ' + lbl + ' (мест: ' + free + ')', callback_data: 'bk:' + s.id + ':' + clientId }];
    return [{ text: '⏳ ' + lbl + ' — мест нет, в ожидание', callback_data: 'wt:' + s.id + ':' + clientId }];
  });
  return { text: '📅 <b>Расписание на неделю</b>' + (c ? ' · ' + tgEsc_(c.name) : '') + '\n✅ — вы записаны, ⏳ — лист ожидания. Нажмите на занятие, чтобы записаться или отменить.\n' +
    list.map(s => '• ' + slotWhen_(s) + ' — ' + tgEsc_(slotTitle_(s)) + ', ' + tgEsc_(s.trainerName)).join('\n'), markup: { inline_keyboard: rows } };
}
function botMyMsg_(clientId) {
  const td = today_();
  const S = {}; tbl_('slots').rows.forEach(s => { S[s.id] = s; });
  const bs = tbl_('bookings').rows.filter(b => b.clientId === clientId && (b.status === 'booked' || b.status === 'wait') && S[b.slotId] && S[b.slotId].date >= td && S[b.slotId].status === 'open')
    .sort((a, b) => (S[a.slotId].date + S[a.slotId].time).localeCompare(S[b.slotId].date + S[b.slotId].time));
  if (!bs.length) return { text: 'Ближайших записей нет. Записаться: «📅 Расписание».' };
  return { text: '🗓 <b>Мои записи</b>\n' + bs.map(b => '• ' + slotWhen_(S[b.slotId]) + ' — ' + tgEsc_(slotTitle_(S[b.slotId])) + (b.status === 'wait' ? ' (лист ожидания, №' + (waitList_(b.slotId).findIndex(x => x.id === b.id) + 1) + ')' : '')).join('\n'),
    markup: { inline_keyboard: bs.slice(0, 10).map(b => [{ text: '❌ Отменить: ' + slotWhen_(S[b.slotId]), callback_data: 'cx:' + b.id }]) } };
}
/** Обработка текста в боте (кнопки меню, команды, комментарий к оценке). true — обработано. */
function clubBotText_(chatId, text, mine) {
  const C = clubSettings_();
  const clients = mine.filter(r => r.kind === 'client');
  const props = PropertiesService.getScriptProperties();
  // комментарий к недавней оценке
  const pend = props.getProperty('fbc:' + chatId);
  if (pend && text.charAt(0) !== '/' && !/^(📅|🗓|⏳|🎉|🔑)/.test(text)) {
    props.deleteProperty('fbc:' + chatId);
    const [fid, exp] = pend.split('|');
    if (Date.now() < +exp && find_('feedback', fid)) { update_('feedback', fid, { comment: text.slice(0, 1000) }); tgSend_(chatId, 'Спасибо! Передали ваш отзыв в клуб 🙏'); return true; }
  }
  const one = (fn, emptyMsg) => {
    if (!clients.length) { tgSend_(chatId, emptyMsg || 'Эта функция для учеников клуба.'); return true; }
    clients.forEach(r => { const m = fn(r.refId); tgSend_(chatId, m.text, m.markup); });
    return true;
  };
  if (/^\/(schedule|book|расписание)|^📅/i.test(text)) {
    if (!isOn_(C.bot_book)) { tgSend_(chatId, 'Запись через бота пока выключена. Запишитесь в приложении клуба.'); return true; }
    return one(botScheduleMsg_);
  }
  if (/^\/(my|мои)|^🗓/i.test(text)) return one(botMyMsg_);
  if (/^⏳/.test(text)) { tgSend_(chatId, mine.map(botBalance_).join('\n\n')); return true; }
  if (/^\/(events|мероприятия)|^🎉/i.test(text)) return one(botFestsMsg_);
  if (/^\/(login|вход)|^🔑/i.test(text)) { botLogin_(chatId, mine); return true; }
  if (/^\/menu/.test(text)) { tgSend_(chatId, 'Меню внизу экрана 👇', clubMenuKb_()); return true; }
  return false;
}
function tgAnswer_(cq, text) { try { tgCall_('answerCallbackQuery', { callback_query_id: cq.id, text: String(text || '').slice(0, 190) }); } catch (e) { /* не важно */ } }
function tgEdit_(cq, m) {
  try { tgCall_('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: m.text, parse_mode: 'HTML', reply_markup: m.markup || { inline_keyboard: [] }, disable_web_page_preview: true }); }
  catch (e) { tgSend_(String(cq.message.chat.id), m.text, m.markup); }
}
/** Нажатие кнопки под сообщением бота. */
function clubCallback_(cq) {
  if (!cq || !cq.message) return;
  const chatId = String(cq.message.chat.id);
  const d = String(cq.data || '').split(':');
  const mine = tbl_('tg').rows.filter(r => r.chatId === chatId && r.kind !== 'pending');
  const own = cid => mine.some(r => r.kind === 'client' && r.refId === cid);
  try {
    if (d[0] === 'bk' || d[0] === 'wt') {
      if (!own(d[2])) return tgAnswer_(cq, 'Это не ваша запись');
      const r = joinWait_(d[2], d[1]);
      tgAnswer_(cq, r.booked ? '✅ Вы записаны!' : '⏳ Вы в листе ожидания, №' + r.pos + '. Сообщим, если место освободится');
      return tgEdit_(cq, botScheduleMsg_(d[2]));
    }
    if (d[0] === 'cx') {
      const b = find_('bookings', d[1]);
      if (!b || !own(b.clientId)) return tgAnswer_(cq, 'Запись не найдена');
      if (b.status === 'cancelled') return tgAnswer_(cq, 'Запись уже отменена');
      cancelBooking_({ role: 'client', clientId: b.clientId }, { id: b.id });
      tgAnswer_(cq, b.status === 'wait' ? 'Вы вышли из листа ожидания' : 'Запись отменена. Спасибо, что предупредили!');
      const isList = /Расписание на неделю/.test(cq.message.text || '');
      const isMy = /Мои записи/.test(cq.message.text || '');
      if (isList) return tgEdit_(cq, botScheduleMsg_(b.clientId));
      if (isMy) return tgEdit_(cq, botMyMsg_(b.clientId));
      return tgEdit_(cq, { text: (cq.message.text || '') + '\n\n❌ Вы отменили запись.' });
    }
    if (d[0] === 'sch') {
      if (!own(d[1])) return tgAnswer_(cq, 'Не найдено');
      tgAnswer_(cq, '');
      const m = botScheduleMsg_(d[1]); return tgSend_(chatId, m.text, m.markup);
    }
    if (d[0] === 'ok') { tgAnswer_(cq, 'Ждём вас! 💃'); return tgEdit_(cq, { text: (cq.message.text || '') + '\n\n✅ Вы подтвердили, что придёте.' }); }
    if (d[0] === 'fb') {
      const l = find_('lessons', d[1]);
      if (!l || !own(l.clientId)) return tgAnswer_(cq, 'Занятие не найдено');
      const score = Math.min(5, Math.max(1, parseInt(d[2], 10) || 0));
      const ex = tbl_('feedback').rows.find(f => f.lessonId === l.id);
      const o = { date: l.date, clientId: l.clientId, clientName: l.clientName, trainerId: l.trainerId, trainerName: l.trainerName, lessonId: l.id, score };
      const fid = ex ? (update_('feedback', ex.id, o), ex.id) : insert_('feedback', o);
      PropertiesService.getScriptProperties().setProperty('fbc:' + chatId, fid + '|' + (Date.now() + 3 * 3600 * 1000));
      tgAnswer_(cq, 'Спасибо за оценку!');
      return tgEdit_(cq, { text: (cq.message.text || '') + '\n\nВаша оценка: ' + '★'.repeat(score) + '☆'.repeat(5 - score) + '\nЕсли хотите, напишите пару слов о занятии одним сообщением — передадим в клуб.' });
    }
    if (d[0] === 'fr') {
      if (!own(d[2])) return tgAnswer_(cq, 'Не найдено');
      festRegister_(d[1], d[2], '');
      tgAnswer_(cq, '🎉 Вы зарегистрированы!');
      return tgEdit_(cq, botFestsMsg_(d[2]));
    }
    if (d[0] === 'fx') {
      const g = find_('regs', d[1]);
      if (!g || !own(g.clientId)) return tgAnswer_(cq, 'Не найдено');
      update_('regs', g.id, { status: 'cancelled' });
      tgAnswer_(cq, 'Регистрация отменена');
      return tgEdit_(cq, botFestsMsg_(g.clientId));
    }
    tgAnswer_(cq, '');
  } catch (e) { tgAnswer_(cq, e.message || 'Не получилось'); }
}

// ---------------------------------------------------------------------------
// Вход в приложение без пароля: одноразовая ссылка в Telegram
// ---------------------------------------------------------------------------
function appLink_() { return String(settings_().app_link || '').trim().replace(/\/+$/, '') || appUrl_(); }
function usersOfTg_(r) {
  const U = tbl_('users').rows.filter(u => u.active);
  if (r.kind === 'user') return U.filter(u => u.id === r.refId);
  if (r.kind === 'trainer') return U.filter(u => u.role === 'trainer' && u.trainerId === r.refId);
  if (r.kind === 'client') return U.filter(u => u.role === 'client' && u.clientId === r.refId);
  return [];
}
function botLogin_(chatId, mine) {
  const seen = {};
  const users = [];
  mine.forEach(r => usersOfTg_(r).forEach(u => { if (!seen[u.id]) { seen[u.id] = 1; users.push(u); } }));
  if (!users.length) return tgSend_(chatId, 'У вас пока нет входа в приложение клуба. Попросите администратора открыть доступ — потом нажмите «🔑 Войти в приложение» ещё раз.');
  const base = appLink_();
  if (!base) return tgSend_(chatId, 'Адрес приложения не настроен. Сообщите администратору.');
  const cache = CacheService.getScriptCache();
  const rows = users.slice(0, 4).map(u => {
    const code = newId_(16) + newId_(16);
    cache.put('lc_' + code, u.id, 900);
    return [{ text: '🔑 ' + (users.length > 1 ? u.name + ' — ' : '') + 'Открыть приложение', url: base + (base.indexOf('?') >= 0 ? '&' : '?') + 'code=' + code }];
  });
  return tgSend_(chatId, 'Нажмите кнопку — приложение откроется сразу, без логина и пароля.\nСсылка одноразовая и действует 15 минут. Не пересылайте её никому.', { inline_keyboard: rows });
}
function loginByCode_(p) {
  const code = String(p.code || '').replace(/[^A-Za-z0-9]/g, '');
  const cache = CacheService.getScriptCache();
  const uid = code.length >= 20 ? cache.get('lc_' + code) : null;
  if (!uid) throw new Error('Ссылка для входа устарела или уже использована. Запросите новую в боте: «🔑 Войти в приложение».');
  cache.remove('lc_' + code);
  const u = find_('users', uid);
  if (!u || !u.active) throw new Error('Доступ к приложению отключён');
  return newSession_(u);
}

// ---------------------------------------------------------------------------
// Периодические задачи бота: каждые ~10 минут (из botPoll) и раз в день (из botDailyRun_)
// ---------------------------------------------------------------------------
function clubTick_() {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('clubTick') || 0);
  if (Date.now() - last < 9 * 60 * 1000) return;
  props.setProperty('clubTick', String(Date.now()));
  withLock_(() => { Object.keys(_cache).forEach(k => delete _cache[k]); clubTickRun_(); });
}
function clubTickRun_() {
  if (!clubCanTg_()) return { sent: 0 };
  const C = clubSettings_(), td = today_(), now = hm2min_(clubNowHM_());
  const sent = botSent_();
  let n = 0;
  if (isOn_(C.bot_rem3)) {
    const ahead = (+C.bot_remHours || 3) * 60;
    tbl_('slots').rows.filter(s => s.date === td && s.status === 'open').forEach(s => {
      const st = hm2min_(s.time);
      if (st < 0 || st <= now || st - now > ahead) return;
      tbl_('bookings').rows.filter(b => b.slotId === s.id && b.status === 'booked').forEach(b => {
        n += tgNotify_('client', b.clientId, '⏰ Сегодня в <b>' + s.time + '</b> — ' + tgEsc_(slotTitle_(s)) + ', тренер ' + tgEsc_(s.trainerName) + '.\nВы придёте?',
          { inline_keyboard: [[{ text: '✅ Приду', callback_data: 'ok:' + b.id }, { text: '❌ Не приду', callback_data: 'cx:' + b.id }]] }, 'r3:' + b.id, sent);
      });
    });
  }
  if (isOn_(C.bot_fb)) {
    const yd = addDays_(td, -1);
    const recent = addDays_(td, -2);
    tbl_('lessons').rows.filter(l => l.clientId && (l.date === td || l.date === yd) && String(l.createdAt).slice(0, 10) >= recent).forEach(l => {
      if (sent['fb:' + l.id] || sent['fbd:' + l.clientId + ':' + l.date]) return;
      const st = hm2min_(l.time);
      const end = st >= 0 ? st + Math.round((+l.hours || 1) * 60) : 20 * 60;
      if (l.date === td && end + 15 > now) return;
      const k = tgNotify_('client', l.clientId, '⭐ Как прошло занятие ' + ruDate_(l.date) + ' с тренером ' + tgEsc_(l.trainerName) + '? Оцените, пожалуйста — это поможет клубу стать лучше.',
        { inline_keyboard: [[1, 2, 3, 4, 5].map(x => ({ text: x + '★', callback_data: 'fb:' + l.id + ':' + x }))] }, 'fb:' + l.id, sent);
      if (k) { sent['fbd:' + l.clientId + ':' + l.date] = td; n += k; }
    });
  }
  botSentSave_(sent);
  return { sent: n };
}
/** Ежедневные: дни рождения, срок абонемента, мероприятия и репетиции завтра. Вызывается из botDailyRun_. */
function clubDaily_(sent) {
  if (!clubCanTg_()) return 0;
  const C = clubSettings_(), td = today_(), tm = addDays_(td, 1), club = tgEsc_(clubName_());
  let n = 0;
  if (isOn_(C.bot_bday)) {
    const md = td.slice(5);
    const tpl = String(C.bday_text || CLUB_DEFAULTS.bday_text);
    [['client', 'clients'], ['trainer', 'trainers']].forEach(k => tbl_(k[1]).rows.filter(x => x.active && String(x.birthDate || '').slice(5) === md)
      .forEach(x => { n += tgNotify_(k[0], x.id, '🎂 ' + tgEsc_(tpl.replace(/\{имя\}/g, firstName_(x.name))) + '\n— ' + club, null, 'bd:' + k[0] + ':' + x.id + ':' + td.slice(0, 4), sent); }));
  }
  if (isOn_(C.bot_renew)) {
    const days = +C.renew_days || 5;
    renewals_().filter(r => r.reason === 'date').forEach(r => {
      n += tgNotify_('client', r.clientId, '📆 Абонемент «' + tgEsc_(r.title) + '» действует до ' + ruDate_(r.endDate) + ', осталось ' + num_(r.remaining) + ' ч. Успейте позаниматься или продлите абонемент.' + payText_(r) + '\n— ' + club,
        null, 'ends:' + r.subId + ':' + (daysBetween_(td, r.endDate) <= 1 ? '1' : days), sent);
    });
  }
  // мероприятия и репетиции завтра
  tbl_('fests').rows.filter(f => f.status !== 'done' && f.status !== 'cancelled').forEach(f => {
    const regs = tbl_('regs').rows.filter(g => g.festId === f.id && g.status !== 'cancelled');
    const plan = parseJson_(f.plan, []) || [];
    const msgs = [];
    if (f.date === tm) msgs.push(['fest', '🎉 Завтра — <b>' + tgEsc_(f.title) + '</b>' + (f.time ? ' в ' + f.time : '') + (f.place ? ', ' + tgEsc_(f.place) : '') + '. Ждём вас!']);
    plan.forEach((p, i) => { if (p.date === tm) msgs.push(['reh' + i, '🩰 Завтра репетиция к «' + tgEsc_(f.title) + '»' + (p.time ? ' в ' + p.time : '') + (p.title ? ': ' + tgEsc_(p.title) : '') + '.']); });
    msgs.forEach(m => regs.forEach(g => { n += tgNotify_('client', g.clientId, m[1] + '\n— ' + club, null, 'fest:' + f.id + ':' + m[0] + ':' + g.clientId, sent); }));
  });
  return n;
}

// ---------------------------------------------------------------------------
// Продление абонементов и оплата
// ---------------------------------------------------------------------------
function payText_(r) {
  const C = clubSettings_();
  const parts = [];
  if (C.pay_link) parts.push('Оплатить по СБП: ' + C.pay_link);
  else if (C.pay_acc && C.pay_bic) parts.push('Оплата по реквизитам: ' + tgEsc_(C.pay_name) + ', р/с ' + C.pay_acc + ', БИК ' + C.pay_bic + (r && r.price ? ', сумма ' + r.price + ' ₽' : ''));
  return parts.length ? '\n' + parts.join('\n') : '';
}
/** Кому продлевать: мало часов, часы закончились или скоро конец срока; без нового активного абонемента. */
function renewals_() {
  const C = clubSettings_(), S = settings_(), td = today_(), used = usage_();
  const lim = Number(S.lowHours || 2), days = +C.renew_days || 5;
  const views = tbl_('subs').rows.filter(s => (s.status || 'active') === 'active').map(s => subView_(s, used, S, td));
  const sent = botSent_();
  const C2 = {}; tbl_('clients').rows.forEach(c => { C2[c.id] = c; });
  const out = [];
  views.forEach(v => {
    if (!C2[v.clientId] || !C2[v.clientId].active) return;
    let reason = '';
    if (v.remaining <= 0) reason = 'ended';
    else if (v.endDate && v.endDate < td) reason = 'expired';
    else if (v.endDate && daysBetween_(td, v.endDate) <= days) reason = 'date';
    else if (v.remaining <= lim) reason = 'low';
    if (!reason) return;
    const fresh = views.some(o => o.id !== v.id && o.clientId === v.clientId && o.remaining > lim && (!o.endDate || o.endDate >= td) && o.startDate >= v.startDate);
    if (fresh) return;
    if (reason === 'expired' && daysBetween_(v.endDate, td) > 45) return;
    if (reason === 'ended' && String(v.endDate || '9999') < addDays_(td, -45)) return;
    const last = Object.keys(sent).filter(k => k.indexOf('renew:' + v.id) === 0).map(k => sent[k]).sort().pop() || '';
    out.push({ subId: v.id, clientId: v.clientId, name: C2[v.clientId].name, phone: C2[v.clientId].phone, company: companyOf_(C2[v.clientId]), title: v.title || (v.hours + ' ч'),
      hours: v.hours, remaining: v.remaining, endDate: v.endDate, price: +v.price || 0, trainerName: v.trainerName, reason, tg: tgChats_('client', v.clientId, false).length > 0, lastRemind: last });
  });
  const order = { ended: 0, expired: 1, low: 2, date: 3 };
  return out.sort((a, b) => order[a.reason] - order[b.reason] || a.remaining - b.remaining);
}
function renewRemind_(user, p) {
  const r = renewals_().find(x => x.subId === p.subId) || (() => {
    const s = must_('subs', p.subId, 'Абонемент'); const v = subView_(s, usage_(), settings_(), today_());
    return { subId: s.id, clientId: s.clientId, name: s.clientName, title: s.title || s.hours + ' ч', remaining: v.remaining, endDate: s.endDate, price: +s.price || 0 };
  })();
  if (!clubCanTg_()) throw new Error('Сначала подключите Telegram-бота');
  const text = String(p.text || '').trim() || ('Здравствуйте, ' + firstName_(r.name) + '! ' + (r.remaining > 0 ? 'В абонементе «' + r.title + '» осталось ' + num_(r.remaining) + ' ч.' : 'Часы в абонементе «' + r.title + '» закончились.') + ' Продлим, чтобы не прерывать занятия?');
  const n = tgNotify_('client', r.clientId, '💳 ' + tgEsc_(text) + payText_(r) + '\n— ' + tgEsc_(clubName_()), null, null, null, false);
  if (!n) throw new Error('Ученик не подключил бота — позвоните или напишите ему');
  const sent = botSent_(); sent['renew:' + r.subId + ':' + Date.now()] = today_(); botSentSave_(sent);
  return n;
}
function savePay_(user, p) {
  ['pay_link', 'pay_name', 'pay_acc', 'pay_bank', 'pay_bic', 'pay_corr', 'pay_inn', 'pay_kpp', 'renew_days', 'bot_renew'].forEach(k => { if (k in p) setSetting_(k, String(p[k]).trim()); });
  return true;
}

// ---------------------------------------------------------------------------
// Удержание: кто перестал ходить
// ---------------------------------------------------------------------------
function clubCalls_() { return parseJson_(PropertiesService.getScriptProperties().getProperty('clubCalls'), {}) || {}; }
function lost_(days) {
  const C = clubSettings_();
  days = +days || +C.lost_days || 21;
  const td = today_(), used = usage_(), S = settings_();
  const last = {}, lastTr = {}, visits = {};
  tbl_('lessons').rows.forEach(l => {
    if (!l.clientId) return;
    if (l.date >= addDays_(td, -120)) visits[l.clientId] = (visits[l.clientId] || 0) + 1;
    if (!last[l.clientId] || l.date > last[l.clientId]) { last[l.clientId] = l.date; lastTr[l.clientId] = l.trainerName; }
  });
  const subOk = {};
  tbl_('subs').rows.forEach(s => { const v = subView_(s, used, S, td); if (v.state === 'ok' || v.state === 'low') subOk[s.clientId] = v; });
  const calls = clubCalls_();
  const row = (c, kind) => ({ id: c.id, name: c.name, phone: c.phone, company: companyOf_(c), last: last[c.id] || '', days: last[c.id] ? daysBetween_(last[c.id], td) : null,
    trainer: lastTr[c.id] || '', visits: visits[c.id] || 0, remaining: subOk[c.id] ? subOk[c.id].remaining : 0, kind, tg: tgChats_('client', c.id, false).length > 0, called: calls[c.id] || '' });
  const withSub = [], gone = [];
  tbl_('clients').rows.filter(c => c.active).forEach(c => {
    const l = last[c.id];
    if (subOk[c.id]) { if (!l || daysBetween_(l, td) >= days) withSub.push(row(c, 'sub')); }
    else if (l && daysBetween_(l, td) >= days && l >= addDays_(td, -120)) gone.push(row(c, 'gone'));
  });
  const by = (a, b) => (b.days === null ? 9999 : b.days) - (a.days === null ? 9999 : a.days);
  return { days, withSub: withSub.sort(by), gone: gone.sort(by) };
}
function lostCall_(user, p) {
  const c = must_('clients', p.clientId, 'Ученик');
  const C = clubSettings_();
  const text = String(p.text || '').trim() || String(C.call_text).replace(/\{имя\}/g, firstName_(c.name));
  let n = 0;
  if (!p.markOnly) {
    if (!clubCanTg_()) throw new Error('Сначала подключите Telegram-бота');
    n = tgNotify_('client', c.id, tgEsc_(text) + '\n— ' + tgEsc_(clubName_()), isOn_(C.bot_book) ? { inline_keyboard: [[{ text: '📅 Посмотреть расписание', callback_data: 'sch:' + c.id }]] } : null, null, null, false);
    if (!n) throw new Error('Ученик не подключил бота — позвоните ему');
  }
  const calls = clubCalls_(); calls[c.id] = today_();
  PropertiesService.getScriptProperties().setProperty('clubCalls', JSON.stringify(calls));
  if (p.textTpl) setSetting_('call_text', String(p.textTpl).slice(0, 1000));
  return n;
}

// ---------------------------------------------------------------------------
// Оценки занятий
// ---------------------------------------------------------------------------
function ratings_(p) {
  const to = isDate_(p && p.to) ? p.to : today_(), from = isDate_(p && p.from) ? p.from : addDays_(to, -90);
  const list = tbl_('feedback').rows.filter(f => f.date >= from && f.date <= to && +f.score);
  const by = {};
  list.forEach(f => {
    const o = by[f.trainerId] || (by[f.trainerId] = { id: f.trainerId, name: f.trainerName, n: 0, sum: 0, dist: [0, 0, 0, 0, 0], comments: [] });
    o.n++; o.sum += +f.score; o.dist[+f.score - 1]++;
    if (f.comment) o.comments.push({ date: f.date, score: +f.score, text: f.comment, client: f.clientName });
  });
  const trainers = Object.keys(by).map(k => by[k]).map(o => Object.assign(o, { avg: Math.round(o.sum / o.n * 10) / 10, comments: o.comments.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8) }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n);
  const all = list.length ? Math.round(list.reduce((a, f) => a + +f.score, 0) / list.length * 10) / 10 : 0;
  return { from, to, total: list.length, avg: all, trainers, low: list.filter(f => +f.score <= 3).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Доходы и расходы
// ---------------------------------------------------------------------------
function factCost_(f, T) {
  const t = T[f.tr];
  if (!t) return 0;
  return (typeOf_(f.type).mode === 'fixed' ? f.n : f.th) * rateOf_(t, f.type);
}
function finance_(p) {
  const td = today_();
  const from = isDate_(p && p.from) ? p.from : td.slice(0, 8) + '01', to = isDate_(p && p.to) ? p.to : td;
  const T = {}; tbl_('trainers').rows.forEach(t => { T[t.id] = t; });
  const Cl = {}; tbl_('clients').rows.forEach(c => { Cl[c.id] = c; });
  const comp = id => (Cl[id] && companyOf_(Cl[id])) || 'Без компании';
  const months = {};
  const M = d => { const k = String(d).slice(0, 7); return months[k] || (months[k] = { m: k, subs: 0, rent: 0, trainers: 0, expenses: 0 }); };
  const cats = {}, companies = {};
  const CO = name => companies[name] || (companies[name] = { name, income: 0, cost: 0, people: {} });
  let receivable = 0, unpaidRent = 0, ownHours = 0;
  tbl_('subs').rows.forEach(s => {
    const d = isDate_(s.startDate) ? s.startDate : String(s.createdAt).slice(0, 10);
    if (d < from || d > to) return;
    const paid = +s.paid || 0;
    M(d).subs += paid;
    receivable += Math.max(0, (+s.price || 0) - paid);
    const c = CO(comp(s.clientId)); c.income += paid; c.people[s.clientId] = 1;
  });
  tbl_('rent').rows.forEach(r => {
    if (r.date < from || r.date > to) return;
    if (r.paid) M(r.date).rent += +r.amount || 0; else unpaidRent += +r.amount || 0;
  });
  const facts = facts_(from, to);
  const part = {};
  facts.forEach(f => { if (f.ev && f.cl) (part[f.ev] = part[f.ev] || []).push(f.cl); });
  facts.filter(f => f.n > 0).forEach(f => {
    if (f.own) { ownHours += f.th; return; }
    const cost = factCost_(f, T);
    M(f.date).trainers += cost;
    if (!f.ev && f.cl) CO(comp(f.cl)).cost += cost;
    else if (f.ev && part[f.ev] && part[f.ev].length) part[f.ev].forEach(cid => { CO(comp(cid)).cost += cost / part[f.ev].length; });
  });
  tbl_('expenses').rows.forEach(e => {
    if (e.date < from || e.date > to) return;
    M(e.date).expenses += +e.amount || 0;
    cats[e.category || 'Прочее'] = (cats[e.category || 'Прочее'] || 0) + (+e.amount || 0);
  });
  const list = Object.keys(months).sort().map(k => {
    const o = months[k];
    ['subs', 'rent', 'trainers', 'expenses'].forEach(x => { o[x] = round2_(o[x]); });
    o.income = round2_(o.subs + o.rent); o.profit = round2_(o.income - o.trainers - o.expenses);
    return o;
  });
  const tot = { subs: 0, rent: 0, trainers: 0, expenses: 0, income: 0, profit: 0 };
  list.forEach(o => Object.keys(tot).forEach(k => { tot[k] = round2_(tot[k] + o[k]); }));
  return { from, to, months: list, total: tot, receivable: round2_(receivable), unpaidRent: round2_(unpaidRent), ownHours: round2_(ownHours),
    cats: Object.keys(cats).map(k => ({ name: k, amount: round2_(cats[k]) })).sort((a, b) => b.amount - a.amount),
    companies: Object.keys(companies).map(k => companies[k]).map(c => ({ name: c.name, income: round2_(c.income), cost: round2_(c.cost), margin: round2_(c.income - c.cost), people: Object.keys(c.people).length }))
      .sort((a, b) => b.income - a.income) };
}
function saveExpense_(user, p) {
  const d = { date: req_(isDate_(p.date) ? p.date : '', 'Укажите дату'), category: String(p.category || 'Прочее').slice(0, 80), amount: round2_(+p.amount || 0), note: String(p.note || '').slice(0, 300) };
  if (!(d.amount > 0)) throw new Error('Укажите сумму');
  if (p.id) { must_('expenses', p.id, 'Расход'); update_('expenses', p.id, d); return p.id; }
  d.createdBy = user.name;
  return insert_('expenses', d);
}

// ---------------------------------------------------------------------------
// Ссылка для HR компании — страница только для просмотра, без входа
// ---------------------------------------------------------------------------
function shareUrl_(token) { const b = appLink_(); return b + (b.indexOf('?') >= 0 ? '&' : '?') + 'hr=' + token; }
function shareCreate_(user, p) {
  const company = String(req_(p.company, 'Выберите компанию')).trim();
  const token = newId_(12) + newId_(12);
  insert_('shares', { token, company, active: true, createdBy: user.name, opens: 0 });
  return { url: shareUrl_(token) };
}
function shares_() { return tbl_('shares').rows.map(r => ({ id: r.id, company: r.company, active: r.active, createdAt: r.createdAt, createdBy: r.createdBy, lastOpen: r.lastOpen, opens: r.opens, url: shareUrl_(r.token) })); }
function hrEsc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/** HTML страницы для HR. prm — параметры адреса: hr (ключ), p (период), from, to. */
function clubHrPage_(prm) {
  const sh = tbl_('shares').rows.find(r => r.token && r.token === String(prm.hr || '') && r.active);
  const club = hrEsc_(clubName_());
  const shell = (body) => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + club + '</title><style>' +
    'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d2433;background:#f4f5f8;margin:0;padding:16px}main{max-width:980px;margin:0 auto}' +
    'h1{font-size:22px;margin:4px 0}h2{font-size:17px;margin:22px 0 8px}.card{background:#fff;border:1px solid #e3e6ec;border-radius:14px;padding:14px 16px;margin:10px 0}' +
    '.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.k div{background:#fff;border:1px solid #e3e6ec;border-radius:12px;padding:12px}.k b{display:block;font-size:24px;color:#253559}.k span{font-size:13px;color:#6b7385}' +
    'table{width:100%;border-collapse:collapse;background:#fff;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid #eceef2;text-align:left;vertical-align:top}th{background:#f7f8fa;font-weight:600}td.n,th.n{text-align:right;white-space:nowrap}' +
    '.tw{overflow-x:auto;border:1px solid #e3e6ec;border-radius:12px}.chips a{display:inline-block;padding:6px 12px;margin:3px 4px 3px 0;border-radius:16px;border:1px solid #d5d9e2;color:#253559;text-decoration:none;font-size:14px;background:#fff}.chips a.on{background:#253559;color:#fff;border-color:#253559}' +
    '.muted{color:#6b7385;font-size:13px}button{padding:8px 14px;border-radius:10px;border:1px solid #253559;background:#253559;color:#fff;font-size:14px;cursor:pointer}@media print{.np{display:none}body{background:#fff}}' +
    '</style></head><body><main>' + body + '</main></body></html>';
  if (!sh) return shell('<div class="card"><h1>Ссылка недействительна</h1><p>Попросите клуб прислать новую ссылку на отчёт.</p></div>');
  const td = today_();
  const P = String(prm.p || 'm');
  const ranges = { m: [td.slice(0, 8) + '01', td], pm: [addDays_(td.slice(0, 8) + '01', -1).slice(0, 8) + '01', addDays_(td.slice(0, 8) + '01', -1)], q: [addDays_(td, -90), td], y: [td.slice(0, 4) + '-01-01', td] };
  const [from, to] = ranges[P] || ranges.m;
  try { withLock_(() => { const r = find_('shares', sh.id); if (r) update_('shares', r.id, { lastOpen: now_(), opens: (+r.opens || 0) + 1 }); }); } catch (e) { /* счётчик не важен */ }
  const r = hrReport_({ role: 'admin', name: 'HR' }, { company: sh.company, from, to });
  const t = r.total;
  const base = shareUrl_(sh.token);
  const chips = [['m', 'Этот месяц'], ['pm', 'Прошлый месяц'], ['q', '3 месяца'], ['y', 'С начала года']]
    .map(c => '<a target="_top" href="' + hrEsc_(base + '&p=' + c[0]) + '" class="' + (c[0] === P ? 'on' : '') + '">' + c[1] + '</a>').join('');
  return shell('<div class="muted">' + club + ' · корпоративная программа бальных танцев</div><h1>' + hrEsc_(sh.company) + '</h1>' +
    '<div class="muted">Период: ' + ruDate_(from) + ' — ' + ruDate_(to) + ' · данные на ' + ruDate_(td) + '</div>' +
    '<div class="chips np" style="margin:12px 0">' + chips + ' <button onclick="window.print()">Печать / PDF</button></div>' +
    '<div class="k"><div><b>' + t.activePeople + ' из ' + t.people + '</b><span>сотрудников занимались</span></div><div><b>' + num_(t.hours) + '</b><span>часов занятий</span></div>' +
    '<div><b>' + t.visits + '</b><span>посещений</span></div><div><b>' + t.events + '</b><span>турниров и событий</span></div>' +
    (r.league ? '<div><b>' + r.league.place + ' из ' + r.league.of + '</b><span>место в корпоративной лиге</span></div>' : '') + '</div>' +
    '<h2>Сотрудники</h2><div class="tw"><table><thead><tr><th>Сотрудник</th><th class="n">Часы</th><th class="n">Посещений</th><th>Последнее занятие</th><th>Турниры и события</th><th>Рост уровня</th></tr></thead><tbody>' +
    (r.rows.map(x => '<tr><td>' + hrEsc_(x.name) + '</td><td class="n">' + num_(x.hours) + '</td><td class="n">' + x.visits + '</td><td>' + (ruDate_(x.last) || '—') + '</td><td>' + (hrEsc_(x.events.join('; ')) || '—') + '</td><td>' + (hrEsc_(x.levels.join('; ')) || '—') + '</td></tr>').join('') || '<tr><td colspan="6">Нет данных</td></tr>') +
    '</tbody></table></div><p class="muted">Страница только для просмотра. Обновляется автоматически по данным клуба.</p>');
}

// ---------------------------------------------------------------------------
// Мероприятия клуба
// ---------------------------------------------------------------------------
function saveFest_(user, p) {
  const plan = [].concat(p.plan || []).filter(x => x && isDate_(x.date)).map(x => ({ date: x.date, time: String(x.time || ''), title: String(x.title || '').slice(0, 120) }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const d = { title: String(req_(p.title, 'Укажите название')).slice(0, 150), kind: FEST_KINDS[p.kind] ? p.kind : 'other',
    date: req_(isDate_(p.date) ? p.date : '', 'Укажите дату'), time: p.time || '', place: String(p.place || '').slice(0, 150), about: String(p.about || '').slice(0, 2000),
    capacity: Math.max(0, parseInt(p.capacity, 10) || 0), open: !!p.open, plan: JSON.stringify(plan) };
  if (p.id) { must_('fests', p.id, 'Мероприятие'); update_('fests', p.id, d); return p.id; }
  d.status = 'active';
  return insert_('fests', d);
}
function deleteFest_(user, p) {
  const f = must_('fests', p.id, 'Мероприятие');
  del_('regs', tbl_('regs').rows.filter(g => g.festId === f.id).map(g => g.id));
  return del_('fests', f.id);
}
function festRegister_(festId, clientId, partnerName, note) {
  const f = must_('fests', festId, 'Мероприятие');
  const c = must_('clients', clientId, 'Ученик');
  if (f.status === 'done' || f.status === 'cancelled') throw new Error('Регистрация закрыта');
  const regs = tbl_('regs').rows.filter(g => g.festId === f.id);
  const ex = regs.find(g => g.clientId === clientId);
  if (ex && ex.status !== 'cancelled') throw new Error('Уже зарегистрирован');
  if (+f.capacity && regs.filter(g => g.status !== 'cancelled').length >= +f.capacity) throw new Error('Мест больше нет');
  const d = { festId: f.id, clientId, clientName: c.name, partnerName: String(partnerName || '').slice(0, 120), note: String(note || '').slice(0, 300), status: 'ok' };
  if (ex) { update_('regs', ex.id, d); return ex.id; }
  return insert_('regs', d);
}
function saveReg_(user, p) {
  if (p.id) { const g = must_('regs', p.id, 'Участник'); update_('regs', g.id, { partnerName: String(p.partnerName || '').slice(0, 120), note: String(p.note || '').slice(0, 300) }); return g.id; }
  return festRegister_(req_(p.festId, 'Мероприятие?'), req_(p.clientId, 'Выберите ученика'), p.partnerName, p.note);
}
function botFestsMsg_(clientId) {
  const td = today_();
  const list = tbl_('fests').rows.filter(f => f.date >= td && f.status === 'active' && f.open).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  if (!list.length) return { text: 'Ближайших мероприятий с открытой регистрацией пока нет. Мы сообщим, когда появятся!' };
  const regs = tbl_('regs').rows.filter(g => g.clientId === clientId && g.status !== 'cancelled');
  return { text: '🎉 <b>Мероприятия клуба</b>\n' + list.map(f => '• <b>' + tgEsc_(f.title) + '</b> — ' + ruDate_(f.date) + (f.time ? ' ' + f.time : '') + (f.place ? ', ' + tgEsc_(f.place) : '') + (f.about ? '\n  ' + tgEsc_(String(f.about).slice(0, 200)) : '')).join('\n'),
    markup: { inline_keyboard: list.map(f => { const g = regs.find(x => x.festId === f.id); return [g ? { text: '✅ Вы участвуете · отменить: ' + f.title, callback_data: 'fx:' + g.id } : { text: '🎉 Участвую: ' + f.title, callback_data: 'fr:' + f.id + ':' + clientId }]; }) } };
}
function festInvite_(user, p) {
  const f = must_('fests', p.festId, 'Мероприятие');
  const list = bcRecipients_({ kinds: ['client'], company: p.company || '', groupId: p.groupId || '' });
  if (p.dry) return { total: list.length };
  if (!clubCanTg_()) throw new Error('Сначала подключите Telegram-бота');
  if (!f.open) update_('fests', f.id, { open: true });
  const text = '🎉 <b>' + tgEsc_(f.title) + '</b>\n' + ruDate_(f.date) + (f.time ? ' в ' + f.time : '') + (f.place ? ', ' + tgEsc_(f.place) : '') + (f.about ? '\n\n' + tgEsc_(f.about) : '') + (p.text ? '\n\n' + tgEsc_(p.text) : '') + '\n\n— ' + tgEsc_(clubName_());
  let sent = 0;
  list.forEach((r, i) => { if (tgSend_(r.chatId, text, { inline_keyboard: [[{ text: '🎉 Участвую', callback_data: 'fr:' + f.id + ':' + r.refId }]] })) sent++; if (i % 25 === 24) Utilities.sleep(1000); });
  insert_('broadcasts', { author: user.name, category: 'Мероприятие', title: f.title, text: text.replace(/<[^>]+>/g, '').slice(0, 3500), audience: 'приглашение: ученики' + (p.company ? ', ' + p.company : ''), total: list.length, sent, failed: list.length - sent });
  return { total: list.length, sent };
}
function festResults_(user, p) {
  const f = must_('fests', p.festId, 'Мероприятие');
  let n = 0;
  [].concat(p.rows || []).forEach(x => {
    const g = find_('regs', x.regId);
    if (!g || g.festId !== f.id || g.status === 'cancelled') return;
    const result = String(x.result || '').slice(0, 200), points = +x.points || 0;
    update_('regs', g.id, { result, points });
    const what = 'Мероприятие «' + f.title + '»' + (result ? ': ' + result : '');
    if (p.toLeague && points) insert_('awards', { date: f.date, clientId: g.clientId, clientName: g.clientName, title: what.slice(0, 200), points });
    if (p.toPassport) insert_('diary', { clientId: g.clientId, trainerId: '', trainerName: '', date: f.date, text: what + (g.partnerName ? ' (в паре с ' + g.partnerName + ')' : ''), video: '', createdBy: user.name });
    if (p.notify) tgNotify_('client', g.clientId, '🏆 Итоги «' + tgEsc_(f.title) + '»' + (result ? ': <b>' + tgEsc_(result) + '</b>' : '') + (points && p.toLeague ? '\n+' + num_(points) + ' баллов в корпоративную лигу' : '') + '\nСпасибо за участие!', null, null, null, false);
    n++;
  });
  update_('fests', f.id, { status: 'done', results: String(p.summary || '').slice(0, 2000) });
  return n;
}

// ---------------------------------------------------------------------------
// Замена тренера
// ---------------------------------------------------------------------------
function substitute_(user, p) {
  const sl = [].concat(p.slotIds || []).map(id => find_('slots', id)).filter(s => s && s.status === 'open');
  if (!sl.length) throw new Error('Выберите занятия');
  const reason = String(p.reason || '').trim();
  const bk = s => tbl_('bookings').rows.filter(b => b.slotId === s.id && (b.status === 'booked' || b.status === 'wait'));
  if (p.mode === 'cancel') {
    sl.forEach(s => {
      const bs = bk(s);
      update_('slots', s.id, { status: 'cancelled', notes: (s.notes ? s.notes + '; ' : '') + 'отменено' + (reason ? ': ' + reason : '') });
      bs.forEach(b => update_('bookings', b.id, { status: 'cancelled' }));
      if (p.notify) bs.forEach(b => tgNotify_('client', b.clientId, '⚠️ Занятие <b>' + tgEsc_(slotTitle_(s)) + '</b> ' + slotWhen_(s) + ' отменено' + (reason ? ': ' + tgEsc_(reason) : '') + '. Приносим извинения! Выберите другое время: «📅 Расписание».', null, null, null, false));
    });
    return sl.length;
  }
  const t = must_('trainers', req_(p.toTrainerId, 'Выберите, кто заменит'), 'Тренер');
  sl.forEach(s => {
    if (s.trainerId === t.id) return;
    const was = s.trainerName;
    update_('slots', s.id, { trainerId: t.id, trainerName: t.name, notes: (s.notes ? s.notes + '; ' : '') + 'замена: вместо ' + was });
    if (p.notify) bk(s).forEach(b => tgNotify_('client', b.clientId, '🔄 Замена тренера: <b>' + tgEsc_(slotTitle_(s)) + '</b> ' + slotWhen_(s) + ' проведёт <b>' + tgEsc_(t.name) + '</b> вместо ' + tgEsc_(was) + (reason ? ' (' + tgEsc_(reason) + ')' : '') + '. Запись сохраняется.',
      { inline_keyboard: [[{ text: '✅ Приду', callback_data: 'ok:' + b.id }, { text: '❌ Отменить запись', callback_data: 'cx:' + b.id }]] }, null, null, false));
  });
  if (p.notify) tgNotify_('trainer', t.id, '🔄 Вы заменяете коллегу:\n' + sl.map(s => '• ' + slotWhen_(s) + ' — ' + tgEsc_(slotTitle_(s)) + ' (записано ' + bookedCount_(s.id) + ')').join('\n') + (reason ? '\nПричина: ' + tgEsc_(reason) : ''), null, null, null, false);
  return sl.length;
}

// ---------------------------------------------------------------------------
// Домашние задания, баллы лиги — уведомления
// ---------------------------------------------------------------------------
function clubHomework_(row) {
  try {
    const n = tgNotify_('client', row.clientId, '📚 <b>Домашнее задание</b>' + (row.trainerName ? ' от тренера ' + tgEsc_(row.trainerName) : '') + ' (' + ruDate_(row.date) + '):\n' + tgEsc_(row.text) + (row.video ? '\n▶ Видео: ' + row.video : ''), null, null, null, false);
    if (n) update_('diary', row.id, { sentAt: now_() });
    return n;
  } catch (e) { return 0; }
}
function clubAwardNotify_(clientId, title, points) {
  try { if (+points) tgNotify_('client', clientId, '🏆 Вам начислено <b>' + num_(points) + '</b> ' + 'баллов в корпоративную лигу: ' + tgEsc_(title) + '. Так держать!', null, null, null, true); } catch (e) { /* без бота */ }
}

// ---------------------------------------------------------------------------
// Фото-аватары
// ---------------------------------------------------------------------------
function avatarAllowed_(user, kind, refId) {
  if (isStaff_(user)) return true;
  if (kind === 'user') return refId === user.id;
  if (user.role === 'trainer') return kind === 'trainer' && refId === user.trainerId;
  if (user.role === 'client') return kind === 'client' && refId === user.clientId;
  return false;
}
function avatarSet_(user, p) {
  const kind = p.kind, refId = String(p.refId || '');
  if (['client', 'trainer', 'user'].indexOf(kind) < 0 || !refId) throw new Error('Неизвестно, чьё фото');
  if (!avatarAllowed_(user, kind, refId)) throw new Error('Можно менять только своё фото');
  const data = String(p.data || '');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Это не изображение');
  if (data.length > 48000) throw new Error('Фото слишком большое');
  const ex = tbl_('avatars').rows.find(a => a.kind === kind && a.refId === refId);
  const d = { kind, refId, data, updatedAt: now_() };
  if (ex) update_('avatars', ex.id, d); else insert_('avatars', d);
  return d.updatedAt;
}
function avatarDel_(user, p) {
  if (!avatarAllowed_(user, p.kind, p.refId)) throw new Error('Можно удалить только своё фото');
  const ex = tbl_('avatars').rows.find(a => a.kind === p.kind && a.refId === p.refId);
  return ex ? del_('avatars', ex.id) : 0;
}
function avatarsLoad_(user, p) {
  const have = (p && p.have) || {};
  const v = {}, data = {};
  tbl_('avatars').rows.forEach(a => {
    const k = a.kind + ':' + a.refId;
    v[k] = a.updatedAt;
    if (have[k] !== a.updatedAt) data[k] = a.data;
  });
  return { v, data };
}

// ---------------------------------------------------------------------------
// Главная и загрузка модуля
// ---------------------------------------------------------------------------
function saveHome_(user, p) {
  const s = JSON.stringify(p.layout || {});
  if (s.length > 4000) throw new Error('Слишком много настроек');
  setSetting_('home:' + user.id, s);
  return true;
}
function clubHome_(user, p) {
  const td = today_();
  const res = { fests: tbl_('fests').rows.filter(f => f.date >= td && f.status === 'active').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
    .map(f => ({ id: f.id, title: f.title, date: f.date, time: f.time, place: f.place, kind: f.kind, regs: tbl_('regs').rows.filter(g => g.festId === f.id && g.status !== 'cancelled').length, capacity: f.capacity })) };
  const w = [].concat(p.w || []);
  if (!w.length || w.indexOf('rating') >= 0) { const r = ratings_({ to: td }); res.rating = { avg: r.avg, total: r.total, trainers: r.trainers.map(t => ({ id: t.id, name: t.name, avg: t.avg, n: t.n })), low: r.low.slice(0, 3) }; }
  if (!w.length || w.indexOf('lost') >= 0) { const l = lost_(); res.lost = { days: l.days, withSub: l.withSub.slice(0, 8), gone: l.gone.slice(0, 8), n: l.withSub.length + l.gone.length }; }
  if (!w.length || w.indexOf('renew') >= 0) res.renew = renewals_().slice(0, 12);
  if ((user.role === 'admin' || (toolsAccess_()[user.role] || []).indexOf('money') >= 0) && (!w.length || w.indexOf('money') >= 0)) { const f = finance_({ from: p.from, to: p.to }); res.money = { total: f.total, receivable: f.receivable, unpaidRent: f.unpaidRent, from: f.from, to: f.to }; }
  return res;
}
function clubLoad_(user) {
  const C = clubSettings_();
  C.app_link = String(settings_().app_link || '');
  return { settings: C, kinds: FEST_KINDS, cats: listOf_(C.exp_cats), url: appUrl_(),
    fests: tbl_('fests').rows.slice().sort((a, b) => b.date.localeCompare(a.date)),
    regs: tbl_('regs').rows, shares: shares_(), expenses: tbl_('expenses').rows.slice(-600).reverse(), bot: clubCanTg_() };
}
function clubBotSave_(user, p) {
  ['bot_book', 'bot_rem3', 'bot_remHours', 'bot_fb', 'bot_bday', 'bday_text', 'lost_days', 'call_text', 'exp_cats', 'bot_renew', 'renew_days', 'app_link'].forEach(k => { if (k in p) setSetting_(k, String(p[k])); });
  try { clubSetCommands_(); } catch (e) { /* без бота */ }
  return true;
}
/** Меню команд бота в Telegram (кнопка «Меню» слева от поля ввода). */
function clubSetCommands_() {
  if (!clubCanTg_()) return;
  tgCall_('setMyCommands', { commands: [
    { command: 'schedule', description: 'Расписание и запись на занятия' }, { command: 'my', description: 'Мои записи' },
    { command: 'balance', description: 'Остаток часов' }, { command: 'events', description: 'Мероприятия клуба' },
    { command: 'login', description: 'Войти в приложение без пароля' }, { command: 'next', description: 'Ближайшие занятия' }, { command: 'stop', description: 'Выключить уведомления' }, { command: 'on', description: 'Включить уведомления' }] });
}

const CLUB_HANDLER_TABS = {
  clubLoad: '*', renewals: ['renew'], renewRemind: ['renew'], savePay: ['renew'], lost: ['lost'], lostCall: ['lost'], ratings: ['rate'],
  finance: ['money'], saveExpense: ['money'], deleteExpense: ['money'], shareCreate: ['hr'], shareOff: ['hr'],
  saveFest: ['fests'], deleteFest: ['fests'], saveReg: ['fests'], deleteReg: ['fests'], festInvite: ['fests'], festResults: ['fests'],
  substitute: ['subst'], clubBotSave: ['bot'], clubTickNow: ['bot'],
};
function clubHandlers_() {
  const A = STAFF;
  return gateTools_({
    clubLoad: { roles: A, fn: clubLoad_ },
    clubHome: { roles: STAFF, fn: clubHome_ },
    saveHome: { roles: STAFF, write: true, fn: saveHome_ },
    joinWait: { roles: ['client', 'admin', 'manager'], write: true, fn: joinWaitApi_ },
    renewals: { roles: A, fn: () => renewals_() },
    renewRemind: { roles: A, write: true, fn: renewRemind_ },
    savePay: { roles: A, write: true, fn: savePay_ },
    lost: { roles: A, fn: (u, p) => lost_(p.days) },
    lostCall: { roles: A, write: true, fn: lostCall_ },
    ratings: { roles: A, fn: (u, p) => ratings_(p) },
    finance: { roles: A, fn: (u, p) => finance_(p) },
    saveExpense: { roles: A, write: true, fn: saveExpense_ },
    deleteExpense: { roles: A, write: true, fn: (u, p) => del_('expenses', must_('expenses', p.id, 'Расход').id) },
    shareCreate: { roles: A, write: true, fn: shareCreate_ },
    shareOff: { roles: A, write: true, fn: (u, p) => update_('shares', must_('shares', p.id, 'Ссылка').id, { active: false }) && true },
    saveFest: { roles: A, write: true, fn: saveFest_ },
    deleteFest: { roles: A, write: true, fn: deleteFest_ },
    saveReg: { roles: A, write: true, fn: saveReg_ },
    deleteReg: { roles: A, write: true, fn: (u, p) => del_('regs', must_('regs', p.id, 'Участник').id) },
    festInvite: { roles: A, write: true, fn: festInvite_ },
    festResults: { roles: A, write: true, fn: festResults_ },
    substitute: { roles: A, write: true, fn: substitute_ },
    clubBotSave: { roles: A, write: true, fn: clubBotSave_ },
    clubTickNow: { roles: A, write: true, fn: () => clubTickRun_() },
    avatarSet: { roles: ALL, write: true, fn: avatarSet_ },
    avatarDel: { roles: ALL, write: true, fn: avatarDel_ },
    avatarsLoad: { roles: ALL, fn: avatarsLoad_ },
  }, CLUB_HANDLER_TABS);
}
