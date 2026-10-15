/* Report Hub · Excel como base de datos.
   Tres formas de usarlo (se pueden combinar):
   1. Exportar / importar REPORT_DB.xlsx a mano (cualquier navegador).
   2. Vincular un archivo de Excel (Chrome / Edge en computadora): la app lo
      lee al abrir y lo reescribe al guardar. Si está en una carpeta de
      OneDrive / SharePoint / Teams, todo el equipo comparte la misma base.
   3. Base compartida publicada junto con la app en data/REPORT_DB.xlsx:
      cada persona que abre la PWA recibe automáticamente esas temporadas
      (por ejemplo, la del año pasado) sin cargar ningún archivo. */
(function (RH) {
  'use strict';
  const u = RH.util, store = RH.store;
  const RUTA_COMPARTIDA = 'data/REPORT_DB.xlsx';
  const NOMBRE = 'REPORT_DB.xlsx';

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  // ---------------------------------------------------------------- snapshots -> libro
  async function aLibro(snaps) {
    const X = RH.xlsx;
    const wb = X.libro({ titulo: 'Report Hub · Base de datos' });
    const reg = RH.registro;
    snaps = snaps.filter(s => !s.demo).sort((a, b) => a.dataset.localeCompare(b.dataset) || (a.week1 || '').localeCompare(b.week1 || ''));

    const L = wb.hoja('LEEME', { grid: false, tab: 'C9A227' });
    L.ancho([4, 110]);
    L.fila([null, 'Report Hub · Base de datos'], { estilo: 'titulo', alto: 28 });
    L.fila([null, 'Generada el ' + u.fmtFechaHora(Date.now()) + ' · ' + snaps.length + ' temporada(s)'], { estilo: 'sub' });
    L.vacia();
    [
      ['Qué es', 'Este libro es la base de datos de los dashboards de Report Hub. La app lo lee y lo escribe; no cambies los nombres de las hojas ni de los encabezados.'],
      ['Temporadas', 'Una fila por reporte procesado (dataset + temporada): lunes de la semana 1, archivo de origen, fecha de proceso y configuración usada.'],
      ['Datos', 'Formato largo, ideal para tablas dinámicas: una fila por dataset, temporada, semana, tipo y campo. Puedes corregir un valor aquí y la app lo tomará.'],
      ['Campos', 'Significado de cada campo por dataset.'],
      ['Compartir', 'Publica este archivo como data/REPORT_DB.xlsx junto a la app para que todo el equipo vea estas temporadas sin cargar nada, o vincúlalo desde una carpeta de OneDrive/SharePoint.']
    ].forEach(([t, d]) => { L.fila([null, t], { estilo: 'seccion' }); L.fila([null, d], { estilo: 'normal' }); L.vacia(); });

    const T = wb.hoja('Temporadas', { tab: '1F3A5F' });
    T.ancho([24, 14, 16, 12, 16, 14, 40, 14, 34, 20, 26, 26, 60]);
    T.fila(['ID', 'Dataset', 'Dashboard', 'Temporada', 'Lunes semana 1', 'Última semana', 'Tipos', 'Filas leídas', 'Archivo origen', 'Procesado', 'Actualizado', 'Origen', 'Configuración (JSON)'], { estilo: 'header', alto: 30 });
    for (const s of snaps) {
      const d = reg.dashboardDeDataset(s.dataset);
      const meta = Object.assign({}, s.meta || {}); delete meta.origen;
      T.fila([
        { v: s.id, s: 'texto' }, { v: s.dataset, s: 'texto' }, { v: d ? d.titulo : s.dataset, s: 'texto' }, { v: String(s.season), s: 'texto' },
        { v: s.week1 || '', s: 'texto' }, { v: RH.modelo.ultimaSemana(s), s: 'int' }, { v: (s.types || []).join(' | '), s: 'texto' },
        { v: meta.filas == null ? null : meta.filas, s: 'int' }, { v: (meta.archivo && meta.archivo.nombre) || '', s: 'texto' },
        { v: meta.procesado || '', s: 'texto' }, { v: s.updatedAt || '', s: 'texto' }, { v: (s.meta && s.meta.origen) || 'local', s: 'texto' },
        { v: JSON.stringify(meta), s: 'texto' }
      ]);
    }
    T.congelar(1, 1);

    const D = wb.hoja('Datos', { tab: '1F6FD1' });
    D.ancho([14, 12, 9, 13, 30, 10, 12]);
    D.fila(['Dataset', 'Temporada', 'Semana', 'Lunes', 'Tipo', 'Campo', 'Valor'], { estilo: 'header', alto: 22 });
    for (const s of snaps) {
      const semanas = RH.modelo.semanasDe(s);
      for (const w of semanas) {
        const lunes = s.week1 ? u.weekMonday(s.week1, w) : '';
        const bloque = s.weeks[w] || {};
        for (const tipo of Object.keys(bloque).sort()) {
          for (const [campo, valor] of Object.entries(bloque[tipo])) {
            D.fila([{ v: s.dataset, s: 'texto' }, { v: String(s.season), s: 'texto' }, { v: w, s: 'int' }, { v: lunes, s: 'texto' }, { v: tipo, s: 'texto' }, { v: campo, s: 'texto' }, { v: +valor || 0, s: 'int' }]);
          }
        }
      }
      if (s.na) {
        for (const tipo of Object.keys(s.na).sort()) {
          for (const [campo, valor] of Object.entries(s.na[tipo])) {
            D.fila([{ v: s.dataset, s: 'texto' }, { v: String(s.season), s: 'texto' }, { v: 'N/A', s: 'texto' }, { v: '', s: 'texto' }, { v: tipo, s: 'texto' }, { v: campo, s: 'texto' }, { v: +valor || 0, s: 'int' }]);
          }
        }
      }
    }
    D.congelar(1, 0);

    const Cm = wb.hoja('Campos', { tab: '7F93B0' });
    Cm.ancho([16, 12, 60]);
    Cm.fila(['Dataset', 'Campo', 'Descripción'], { estilo: 'header', alto: 22 });
    for (const d of reg.dashboards) for (const [k, v] of Object.entries(d.campos || {})) Cm.fila([{ v: d.dataset, s: 'texto' }, { v: k, s: 'texto' }, { v: v, s: 'texto' }]);

    return wb.blob();
  }

  // ---------------------------------------------------------------- libro -> snapshots
  async function deLibro(buffer) {
    const { hojas, nombres } = await RH.xlsx.leer(buffer);
    const buscarHoja = n => { const k = nombres.find(x => norm(x) === norm(n)); return k ? hojas[k] : null; };
    const T = buscarHoja('Temporadas'), D = buscarHoja('Datos');
    if (!T || !D) throw new Error('El Excel no tiene el formato de la base de Report Hub (faltan las hojas «Temporadas» y «Datos»).');

    const idx = (cab, nombre) => cab.findIndex(c => norm(c) === norm(nombre));
    const cT = (T[0] || []).map(norm);
    const iT = n => cT.indexOf(norm(n));
    const snaps = new Map();
    for (let r = 1; r < T.length; r++) {
      const f = T[r] || [];
      const dataset = f[iT('Dataset')], season = f[iT('Temporada')];
      if (!dataset || season == null || season === '') continue;
      let meta = {};
      try { meta = JSON.parse(f[iT('Configuración (JSON)')] || '{}') || {}; } catch (e) { meta = {}; }
      const id = store.idDe(String(dataset), String(season));
      snaps.set(id, {
        id, dataset: String(dataset), season: String(season),
        week1: fechaIso(f[iT('Lunes semana 1')]),
        types: [], weeks: {}, na: null,
        meta, updatedAt: String(f[iT('Actualizado')] || meta.procesado || new Date(0).toISOString())
      });
    }
    const cab = D[0] || [];
    const ix = { ds: idx(cab, 'Dataset'), t: idx(cab, 'Temporada'), w: idx(cab, 'Semana'), tipo: idx(cab, 'Tipo'), campo: idx(cab, 'Campo'), v: idx(cab, 'Valor') };
    if (Object.values(ix).some(i => i < 0)) throw new Error('La hoja «Datos» no tiene los encabezados esperados.');
    for (let r = 1; r < D.length; r++) {
      const f = D[r] || [];
      if (f[ix.ds] == null || f[ix.ds] === '') continue;
      const id = store.idDe(String(f[ix.ds]), String(f[ix.t]));
      const s = snaps.get(id);
      if (!s) continue;
      const tipo = String(f[ix.tipo] == null ? '' : f[ix.tipo]);
      const campo = String(f[ix.campo] || '');
      const val = typeof f[ix.v] === 'number' ? f[ix.v] : parseFloat(String(f[ix.v] || '0').replace(/,/g, '')) || 0;
      const w = f[ix.w];
      let bloque;
      if (norm(w) === 'n/a') bloque = s.na || (s.na = {});
      else {
        const wn = parseInt(w, 10);
        if (!(wn >= 1)) continue;
        bloque = s.weeks[wn] || (s.weeks[wn] = {});
      }
      const celda = bloque[tipo] || (bloque[tipo] = {});
      celda[campo] = (celda[campo] || 0) + val;
    }
    for (const s of snaps.values()) {
      const tipos = new Set();
      Object.values(s.weeks).forEach(b => Object.keys(b).forEach(t => tipos.add(t)));
      s.types = [...tipos].sort();
    }
    return [...snaps.values()];
  }

  function fechaIso(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') { // número de serie de Excel
      return u.utcToIso(Math.round((v - 25569) * 86400000));
    }
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : String(v);
  }

  // ---------------------------------------------------------------- fusión
  async function fusionar(entrantes, opts) {
    opts = opts || {};
    const tumbas = await store.ajuste('tombstones', {});
    const locales = new Map((await store.snapshots()).map(s => [s.id, s]));
    const guardar = [];
    let nuevos = 0, actualizados = 0, iguales = 0, omitidos = 0;
    for (const s of entrantes) {
      s.meta = Object.assign({}, s.meta, { origen: opts.origen || 'excel' });
      const loc = locales.get(s.id);
      if (!loc || loc.demo) {
        if (opts.respetarBorrados && tumbas[s.id] && tumbas[s.id] >= s.updatedAt) { omitidos++; continue; }
        guardar.push(s); nuevos++;
      } else if (opts.forzar || s.updatedAt > loc.updatedAt) {
        guardar.push(s); actualizados++;
      } else iguales++;
    }
    if (guardar.length) await store.guardar(guardar, { origen: opts.origen || 'excel' });
    return { nuevos, actualizados, iguales, omitidos, total: entrantes.length };
  }

  // ---------------------------------------------------------------- exportar / importar manual
  async function exportar() {
    const snaps = (await store.snapshots()).filter(s => !s.demo);
    if (!snaps.length) { u.toast('Todavía no hay temporadas guardadas para exportar.', { tipo: 'warn' }); return; }
    const blob = await aLibro(snaps);
    u.descargar(blob, NOMBRE);
    u.toast('Base exportada como ' + NOMBRE + ' (' + snaps.length + ' temporadas).', { tipo: 'ok' });
  }

  async function importar(file) {
    const snaps = await deLibro(await file.arrayBuffer());
    if (!snaps.length) throw new Error('El archivo no contiene temporadas.');
    return fusionar(snaps, { origen: 'excel' });
  }

  // ---------------------------------------------------------------- base compartida (servidor)
  async function cargarCompartida(opts) {
    opts = opts || {};
    let res;
    try { res = await fetch(RUTA_COMPARTIDA, { cache: 'no-cache' }); }
    catch (e) { return { estado: 'sin-conexion' }; }
    if (!res.ok) {
      await store.fijar('compartida', { estado: 'ausente', revisado: new Date().toISOString() });
      return { estado: 'ausente' };
    }
    const tipo = res.headers.get('content-type') || '';
    if (tipo.includes('text/html')) return { estado: 'ausente' };
    try {
      const buf = await res.arrayBuffer();
      const snaps = await deLibro(buf);
      const r = await fusionar(snaps, { origen: 'compartida', respetarBorrados: !opts.forzar, forzar: false });
      await store.fijar('compartida', {
        estado: 'ok', revisado: new Date().toISOString(), temporadas: snaps.map(s => s.id),
        modificado: res.headers.get('last-modified') || null
      });
      return Object.assign({ estado: 'ok' }, r);
    } catch (e) {
      await store.fijar('compartida', { estado: 'error', error: e.message, revisado: new Date().toISOString() });
      return { estado: 'error', error: e.message };
    }
  }

  // ---------------------------------------------------------------- archivo vinculado
  const soportaVinculo = typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
  const vinc = { estado: soportaVinculo ? 'sin-vincular' : 'no-soportado', nombre: null, ultimo: null, error: null, ocupado: false };
  const avisarVinc = () => window.dispatchEvent(new CustomEvent('rh-vinculo', { detail: Object.assign({}, vinc) }));
  const TIPOS_XLSX = [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];

  async function manejador() { return soportaVinculo ? store.ajuste('excelVinculado', null) : null; }

  async function vincular(modo) {
    if (!soportaVinculo) throw new Error('Tu navegador no permite vincular archivos. Usa Chrome o Edge en computadora, o exporta/importa manualmente.');
    let h;
    if (modo === 'nuevo') h = await window.showSaveFilePicker({ suggestedName: NOMBRE, types: TIPOS_XLSX });
    else [h] = await window.showOpenFilePicker({ types: TIPOS_XLSX, multiple: false });
    await store.fijar('excelVinculado', h);
    await store.fijar('excelSync', 0);
    vinc.nombre = h.name;
    return sincronizar({ interactivo: true });
  }

  async function desvincular() {
    await store.fijar('excelVinculado', null);
    await store.fijar('excelSync', 0);
    Object.assign(vinc, { estado: soportaVinculo ? 'sin-vincular' : 'no-soportado', nombre: null, ultimo: null, error: null });
    avisarVinc();
  }

  /** JSON con llaves ordenadas: dos snapshots iguales dan la misma firma sin importar el orden de origen */
  function estable(v) {
    if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + estable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  function firma(snaps) {
    return estable(snaps.filter(s => !s.demo).sort((a, b) => a.id.localeCompare(b.id))
      .map(s => [s.id, s.week1 || '', s.weeks || {}, s.na || null]));
  }

  let enCurso = null;
  function sincronizar(opts) {
    if (enCurso) return enCurso.then(() => sincronizar(opts));
    enCurso = _sincronizar(opts || {}).finally(() => { enCurso = null; });
    return enCurso;
  }

  async function _sincronizar({ interactivo }) {
    const h = await manejador();
    if (!h) { if (soportaVinculo) { vinc.estado = 'sin-vincular'; avisarVinc(); } return { estado: 'sin-vincular' }; }
    vinc.nombre = h.name;
    let permiso = await h.queryPermission({ mode: 'readwrite' });
    if (permiso !== 'granted' && interactivo) permiso = await h.requestPermission({ mode: 'readwrite' });
    if (permiso !== 'granted') { vinc.estado = 'permiso'; avisarVinc(); return { estado: 'permiso' }; }

    vinc.ocupado = true; vinc.estado = 'sincronizando'; avisarVinc();
    try {
      const archivo = await h.getFile();
      const ultimoSync = (await store.ajuste('excelSync', 0)) || 0;
      let deArchivo = [];
      if (archivo.size > 0) {
        try { deArchivo = await deLibro(await archivo.arrayBuffer()); }
        catch (e) { throw new Error('«' + h.name + '» no tiene el formato de la base de Report Hub. Elige otro archivo o crea uno nuevo.'); }
      }
      let importados = 0, borrados = 0;
      if (archivo.size > 0 && archivo.lastModified > ultimoSync) {
        // el archivo cambió fuera de esta app (otra persona, OneDrive o edición manual)
        const corte = new Date(ultimoSync).toISOString();
        const locales = new Map((await store.snapshots()).filter(s => !s.demo).map(s => [s.id, s]));
        const traer = [];
        for (const s of deArchivo) {
          const loc = locales.get(s.id);
          const localNuevo = loc && loc.updatedAt > corte && loc.updatedAt > s.updatedAt;
          if (!localNuevo && (!loc || firma([loc]) !== firma([s]) || loc.updatedAt !== s.updatedAt)) {
            s.meta = Object.assign({}, s.meta, { origen: 'excel' });
            traer.push(s);
          }
        }
        if (traer.length) { await store.guardar(traer, { origen: 'sync' }); importados = traer.length; }
        if (ultimoSync > 0) {
          const ids = new Set(deArchivo.map(s => s.id));
          const quitar = [...locales.values()].filter(l => !ids.has(l.id) && l.updatedAt <= corte).map(l => l.id);
          if (quitar.length) { await store.borrar(quitar, { origen: 'sync' }); borrados = quitar.length; }
        }
      }
      const actuales = (await store.snapshots()).filter(s => !s.demo);
      let escrito = false;
      if (firma(actuales) !== firma(deArchivo) || archivo.size === 0) {
        const blob = await aLibro(actuales);
        try {
          const w = await h.createWritable();
          await w.write(blob);
          await w.close();
          escrito = true;
        } catch (e) {
          throw new Error('No se pudo guardar en «' + h.name + '». Si está abierto en Excel, ciérralo; se reintentará en el próximo cambio.');
        }
      }
      const fin = await h.getFile();
      await store.fijar('excelSync', fin.lastModified);
      Object.assign(vinc, { estado: 'ok', ultimo: Date.now(), error: null, ocupado: false });
      avisarVinc();
      return { estado: 'ok', importados, borrados, escrito };
    } catch (e) {
      Object.assign(vinc, { estado: 'error', error: e.message, ocupado: false });
      avisarVinc();
      return { estado: 'error', error: e.message };
    }
  }

  async function iniciarVinculo() {
    if (!soportaVinculo) { avisarVinc(); return; }
    const h = await manejador();
    if (!h) { vinc.estado = 'sin-vincular'; avisarVinc(); return; }
    vinc.nombre = h.name;
    return sincronizar({ interactivo: false });
  }

  RH.dbx = {
    RUTA_COMPARTIDA, NOMBRE, soportaVinculo,
    aLibro, deLibro, fusionar, exportar, importar, cargarCompartida,
    vincular, desvincular, sincronizar, iniciarVinculo,
    get vinculo() { return Object.assign({}, vinc); }
  };
})(window.RH = window.RH || {});
