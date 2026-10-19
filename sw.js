/* Report Hub · service worker (funcionamiento sin conexión).
   IMPORTANTE: al publicar cambios, sube el número de VERSION para que cada
   persona reciba el aviso «Nueva versión disponible». */
const VERSION = 'report-hub-v1.8.0';
const DATOS = 'report-hub-datos';

const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'vendor/chart.umd.min.js',
  'js/core/util.js',
  'js/core/store.js',
  'js/core/zip.js',
  'js/core/xlsx.js',
  'js/core/csv.js',
  'js/core/excel-filas.js',
  'js/core/tablas.js',
  'js/core/model.js',
  'js/core/proyeccion.js',
  'js/core/dbexcel.js',
  'js/core/demo.js',
  'js/registry.js',
  'js/puente.js',
  'js/ui/info.js',
  'js/ui/charts.js',
  'js/ui/dashboard.js',
  'js/ui/proyeccion.js',
  'js/ui/panorama.js',
  'js/ui/datos.js',
  'js/ui/ayuda.js',
  'js/app.js',
  'reportes/reporte.css',
  'reportes/tassel-only.html',
  'reportes/homeship.html',
  'reportes/gowns.html',
  'reportes/gowns-activas.html',
  'reportes/dos-archivos.html',
  'data/base-compartida.js',
  'reportes/plantilla.html',
  'reportes/originales/CREARR2.html',
  'reportes/originales/filtro_menos_tassels.html',
  'icons/favicon.svg',
  'icons/icon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(a => new Request(a, { cache: 'reload' })))));
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k.startsWith('report-hub-') && k !== VERSION && k !== DATOS).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', ev => {
  if (ev.data && ev.data.tipo === 'activar') self.skipWaiting();
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Base compartida: primero la red (para tener la última), si no hay conexión la copia guardada
  if (url.pathname.includes('/data/')) {
    ev.respondWith((async () => {
      const cache = await caches.open(DATOS);
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        const guardada = await cache.match(req);
        return guardada || new Response('', { status: 504, statusText: 'Sin conexión' });
      }
    })());
    return;
  }

  // Archivos de la app: desde la caché (instantáneo y sin conexión); lo demás, red con respaldo
  ev.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const enCache = await cache.match(req, { ignoreSearch: true });
    if (enCache) return enCache;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const inicio = await cache.match('index.html');
        if (inicio) return inicio;
      }
      return new Response('', { status: 504, statusText: 'Sin conexión' });
    }
  })());
});
