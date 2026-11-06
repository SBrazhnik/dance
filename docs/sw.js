// Минимальный service worker: нужен, чтобы сайт можно было установить на телефон как приложение.
// Данные не кэшируются — приложение всегда открывается в актуальной версии.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
