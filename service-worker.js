/* ============================================================
   LH Nail PWA · Service Worker
   功能：
   1) 离线缓存静态资源（HTML/CSS/JS/图标）
   2) 页面优先取缓存 + 后台更新（Stale-While-Revalidate）
   3) 缓存命中后不阻塞主进程，保证手机上秒开 App
   ============================================================ */
const VERSION = 'lhnail-v1.0.99';
const CACHE_NAME = 'lhnail-cache-' + VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './clear-cache.html',
  './manifest.json',
  './assets/css/style.css?v=1.0.96',
  './assets/js/supabase.min.js?v=1.0.96',
  './assets/js/supabase-config.js?v=1.0.96',
  './assets/js/app.js?v=1.0.96',
  './scan-this-on-phone.html',
  './app-install-guide.html',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/images/menu_icon.jpg',
  './assets/images/brand_starfish.jpg'
];

// 1) 安装：写入 App Shell 缓存
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// 2) 激活：清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// 3) 拦截请求：Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 只处理 GET
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 跨域请求直接透传（比如 qrcodejs CDN、字体等）
  if (url.origin !== self.location.origin) return;
  // 页面导航请求（HTML）和 JS 文件：网络优先 + 失败回退缓存
  // 🛡️ 关键修复：JS 文件也用网络优先，防止旧版 app.js 被缓存命中而跳过更新
  if (req.mode === 'navigate' || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }
  // 静态资源：缓存优先 + 后台更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((net) => {
        if (net && net.status === 200) {
          const copy = net.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return net;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});


