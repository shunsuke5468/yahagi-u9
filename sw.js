// 矢作SC 記録：ホーム画面アプリ用のサービスワーカー
// ・ページ本体は「ネット優先」。つながれば必ず最新版を出し、電波が弱い・圏外のときだけ保存しておいた版を出す
// ・Firebase / 3D / フォントなどのライブラリは、一度読んだものを保存して次から速く開く
// ・試合データ（Firebase のやりとり）と天気はここでは扱わない（アプリ側が保存データを使う）
const VERSION = 'yahagi-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
const LIB_HOSTS = ['www.gstatic.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const SKIP_HOSTS = ['firebasedatabase.app', 'firebaseio.com', 'open-meteo.com'];
const PAGE_TIMEOUT = 4000;   // これ以上かかるときは保存版を先に出す（裏で最新版を取りに行く）

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
};

// ページ本体：ネット優先（時間がかかりすぎたら保存版）
function pageFirst(req) {
  const net = fetch(req).then(res => put('./index.html', res));
  const fallback = () => caches.match('./index.html').then(r => r || caches.match('./'));
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => fallback().then(finish), PAGE_TIMEOUT);
    net.then(r => { clearTimeout(timer); finish(r); })
       .catch(() => { clearTimeout(timer); fallback().then(r => r ? finish(r) : resolve(Response.error())); });
  });
}

// ライブラリ：保存版を優先（URLにバージョンが入っているので変わらない）
function libFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res)));
}

// アイコンなど：保存版をすぐ出して、裏で新しくする
function staleWhileRevalidate(req) {
  return caches.match(req).then(hit => {
    const net = fetch(req).then(res => put(req, res)).catch(() => hit);
    return hit || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (SKIP_HOSTS.some(h => url.hostname.endsWith(h))) return;
  if (req.mode === 'navigate') { e.respondWith(pageFirst(req)); return; }
  if (LIB_HOSTS.includes(url.hostname)) { e.respondWith(libFirst(req)); return; }
  if (url.origin === self.location.origin) { e.respondWith(staleWhileRevalidate(req)); return; }
});
