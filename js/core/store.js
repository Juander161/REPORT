/* Report Hub · almacenamiento local (IndexedDB).
   Cada "snapshot" es el resultado de procesar un reporte para una temporada:
   { id: 'dataset|temporada', dataset, season, week1, types[], weeks{semana:{tipo:{campo:n}}},
     na{tipo:{campo:n}}, meta{...}, updatedAt, demo? }
   Los cambios se avisan por BroadcastChannel para que la app y los reportes
   (aunque estén en otra pestaña o en un iframe) se enteren al instante. */
(function (RH) {
  'use strict';

  const DB_NAME = 'report-hub';
  const DB_VER = 1;
  const canal = ('BroadcastChannel' in window) ? new BroadcastChannel('report-hub-db') : null;
  const oyentes = new Set();
  let dbp = null;

  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          const s = db.createObjectStore('snapshots', { keyPath: 'id' });
          s.createIndex('dataset', 'dataset');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      };
      rq.onsuccess = () => {
        const db = rq.result;
        db.onversionchange = () => { db.close(); dbp = null; };
        res(db);
      };
      rq.onerror = () => { dbp = null; rej(rq.error); };
      rq.onblocked = () => console.warn('IndexedDB bloqueada por otra pestaña');
    });
    return dbp;
  }

  function req(r) {
    return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }

  async function tx(nombre, modo, fn) {
    const db = await abrir();
    const t = db.transaction(nombre, modo);
    const fin = new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transacción cancelada'));
    });
    const r = await fn(t.objectStore(nombre));
    await fin;
    return r;
  }

  function avisar(det) {
    const msg = Object.assign({ t: Date.now() }, det);
    if (canal) canal.postMessage(msg);
    oyentes.forEach(cb => { try { cb(msg); } catch (e) { console.error(e); } });
  }
  if (canal) canal.onmessage = ev => oyentes.forEach(cb => { try { cb(ev.data); } catch (e) { console.error(e); } });

  const store = {
    idDe(dataset, season) { return dataset + '|' + season; },

    async snapshots(dataset) {
      const todos = await tx('snapshots', 'readonly', s => req(s.getAll()));
      return dataset ? todos.filter(x => x.dataset === dataset) : todos;
    },

    async snapshot(id) { return tx('snapshots', 'readonly', s => req(s.get(id))); },

    /** Guarda uno o varios snapshots. Al guardar datos reales de un dataset se
        retiran los datos de demostración de ese mismo dataset. */
    async guardar(lista, opts = {}) {
      lista = Array.isArray(lista) ? lista : [lista];
      if (!lista.length) return;
      const reales = new Set(lista.filter(s => !s.demo).map(s => s.dataset));
      const previos = reales.size ? await store.snapshots() : [];
      const borrarDemo = previos.filter(p => p.demo && reales.has(p.dataset)).map(p => p.id);
      await tx('snapshots', 'readwrite', s => {
        for (const id of borrarDemo) s.delete(id);
        for (const snap of lista) {
          if (!snap.id) snap.id = store.idDe(snap.dataset, snap.season);
          if (!snap.updatedAt) snap.updatedAt = new Date().toISOString();
          s.put(snap);
        }
      });
      // si algo se había borrado antes y vuelve a guardarse, ya no es "borrado"
      const tumbas = await store.ajuste('tombstones', {});
      let cambio = false;
      for (const snap of lista) if (tumbas[snap.id]) { delete tumbas[snap.id]; cambio = true; }
      if (cambio) await store.fijar('tombstones', tumbas);
      avisar({ tipo: 'snapshots', ids: lista.map(x => x.id), origen: opts.origen || 'local' });
    },

    async borrar(ids, opts = {}) {
      ids = Array.isArray(ids) ? ids : [ids];
      const lista = await Promise.all(ids.map(id => store.snapshot(id)));
      await tx('snapshots', 'readwrite', s => { for (const id of ids) s.delete(id); });
      // las "tumbas" evitan que la base compartida vuelva a traer lo que se borró a propósito
      const tumbas = await store.ajuste('tombstones', {});
      const ahora = new Date().toISOString();
      lista.forEach((snap, i) => {
        if (snap && !snap.demo) tumbas[ids[i]] = (opts.tumbas && opts.tumbas[ids[i]]) || ahora;
      });
      await store.fijar('tombstones', tumbas);
      avisar({ tipo: 'snapshots', ids, borrado: true, origen: opts.origen || 'local' });
    },

    async ajuste(clave, def) {
      const v = await tx('settings', 'readonly', s => req(s.get(clave)));
      return v === undefined ? def : v;
    },
    async fijar(clave, valor) {
      await tx('settings', 'readwrite', s => req(s.put(valor, clave)));
    },

    alCambiar(cb) { oyentes.add(cb); return () => oyentes.delete(cb); },

    async persistente() {
      try {
        if (navigator.storage && navigator.storage.persist) {
          if (await navigator.storage.persisted()) return true;
          return await navigator.storage.persist();
        }
      } catch (e) { /* no soportado */ }
      return false;
    }
  };

  RH.store = store;
})(window.RH = window.RH || {});
