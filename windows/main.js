// Приложение Клуба танцев для Windows: окно с приложением клуба (Google Apps Script) без браузера.
// Открывает приложение напрямую с серверов Google — не зависит от настроек браузера и сайта corpdance.ru.
const { app, BrowserWindow, shell, Menu, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const EXEC = 'https://script.google.com/macros/s/AKfycbxiFk2Vp8ES7BW8Y6WUnfSHbBkS3w0lxnHS2lmuf2qPfLxGLo5NsJ2rpdlHRA8XDNYI_g/exec';
// Внутри окна остаются только страницы приложения и входа Google; всё остальное — в обычном браузере.
const INSIDE = /^https:\/\/([a-z0-9-]+\.)*(script\.google\.com|googleusercontent\.com|accounts\.google\.com|google\.com\/accounts)(\/|$)/i;

app.setAppUserModelId('ru.corpdance.app');
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
const statePath = () => path.join(app.getPath('userData'), 'window.json');
function loadState() { try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch (e) { return { width: 1280, height: 860 }; } }
function saveState() {
  if (!win || win.isMinimized()) return;
  try { fs.writeFileSync(statePath(), JSON.stringify(Object.assign(win.getNormalBounds(), { max: win.isMaximized() }))); } catch (e) { /* не важно */ }
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1280, height: st.height || 860, x: st.x, y: st.y, minWidth: 360, minHeight: 500,
    backgroundColor: '#121721', title: 'Клуб танцев', icon: path.join(__dirname, 'build', 'icon.png'), show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('resize', saveState); win.on('move', saveState); win.on('close', saveState);
  // приложение клуба узнаёт, что открыто в программе для Windows
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' DanceClubWin/' + app.getVersion());
  win.loadURL(EXEC);

  // ссылки: приложение и вход Google — внутри; сайты, Telegram, файлы на Диске — в браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (INSIDE.test(url) && !/\/(file|document|spreadsheets|presentation)\/d\//.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#121721' } };
    if (/^(https?|mailto|tel|tg):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!INSIDE.test(url)) { e.preventDefault(); if (/^(https?|mailto|tel|tg):/i.test(url)) shell.openExternal(url); }
  });
  // нет интернета — понятная страница с кнопкой «Повторить»
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { u: EXEC, e: desc || String(code) } });
  });
  // проблемы с сертификатом не обходим — объясняем, что делать
  win.webContents.on('certificate-error', (e, url, error) => {
    dialog.showMessageBox(win, { type: 'warning', title: 'Защищённое соединение', message: 'Не удалось проверить защищённое соединение с ' + new URL(url).host,
      detail: 'Ошибка: ' + error + '\n\nПроверьте дату и время на компьютере. Если на компьютере стоит антивирус с проверкой HTTPS или корпоративный прокси — попросите администратора добавить script.google.com в исключения.' });
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Приложение', submenu: [
      { label: 'Обновить', accelerator: 'F5', click: () => win && win.webContents.reload() },
      { label: 'На главную', accelerator: 'Alt+Home', click: () => win && win.loadURL(EXEC) },
      { type: 'separator' },
      { label: 'Масштаб +', accelerator: 'Ctrl+=', role: 'zoomIn' }, { label: 'Масштаб −', accelerator: 'Ctrl+-', role: 'zoomOut' }, { label: 'Обычный масштаб', accelerator: 'Ctrl+0', role: 'resetZoom' },
      { type: 'separator' }, { label: 'Во весь экран', accelerator: 'F11', role: 'togglefullscreen' },
      { type: 'separator' }, { label: 'Выход', role: 'quit' }] },
    { label: 'Правка', submenu: [{ label: 'Отменить', role: 'undo' }, { label: 'Повторить', role: 'redo' }, { type: 'separator' }, { label: 'Вырезать', role: 'cut' }, { label: 'Копировать', role: 'copy' }, { label: 'Вставить', role: 'paste' }, { label: 'Выделить всё', role: 'selectAll' }] },
    { label: 'Справка', submenu: [{ label: 'Сайт клуба ano.dance', click: () => shell.openExternal('https://ano.dance') }, { label: 'О программе', click: () => dialog.showMessageBox(win, { title: 'Клуб танцев', message: 'Клуб танцев для Windows', detail: 'Версия ' + app.getVersion() + '\nПриложение клуба корпоративных бальных танцев.\nСодержимое обновляется само.' }) }] },
  ]));
  // загрузки (акты, выгрузки, открытки) — с выбором папки
  session.defaultSession.on('will-download', item => { item.setSaveDialogOptions({ title: 'Сохранить файл' }); });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
