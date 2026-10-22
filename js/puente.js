/* Report Hub · puente para las páginas de reporte.
   Cualquier reporte (dentro de la app o abierto por separado) usa esto para:
   - guardar su resultado como una temporada del dashboard,
   - mostrar el panel «Guardar en el dashboard»,
   - avisar a la app y navegar al dashboard.
   Requiere util.js, store.js y registry.js. */
(function (RH) {
  'use strict';
  const u = RH.util, el = u.el;
  const embebido = window.self !== window.top;
  // igual que RH.modelo.MAX_SEMANA: semanas mayores vienen de fechas mal capturadas (p. ej. año 2062)
  const MAX_SEMANA = 60;

  /** Filas en semanas fuera de rango de un Map(semana -> Map(tipo -> {campos})): { filas, semanas[] } */
  function fueraDeRango(datos, campo) {
    const semanas = [...datos.keys()].filter(k => k !== 'N/A' && k > MAX_SEMANA).sort((a, b) => a - b);
    let filas = 0;
    semanas.forEach(w => datos.get(w).forEach(o => { filas += +o[campo] || 0; }));
    return { filas, semanas };
  }
  /** Última semana sin contar las de fuera de rango */
  function ultimaSemana(semanas) {
    return semanas.map(Number).filter(w => isFinite(w) && w <= MAX_SEMANA).reduce((a, b) => Math.max(a, b), 0);
  }

  // tema compartido con la app
  function aplicarTema() {
    const t = u.lsGet('rh-tema', 'auto');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  aplicarTema();
  window.addEventListener('storage', ev => { if (ev.key === 'rh-tema') aplicarTema(); });
  if (embebido) document.documentElement.classList.add('embebido');

  function irA(hash) {
    if (embebido) window.parent.postMessage({ rh: 'navegar', hash }, '*');
    else location.href = '../index.html' + hash;
  }

  /** Construye el snapshot a partir de un Map(semana -> Map(tipo -> {campos})) como el de los reportes */
  function desdeMapa(datos, campos) {
    const weeks = {};
    let na = null;
    const tipos = new Set();
    for (const [w, mt] of datos) {
      const bloque = {};
      for (const [t, o] of mt) {
        const c = {};
        campos.forEach(k => { c[k] = +o[k] || 0; });
        bloque[t] = c;
        if (w !== 'N/A') tipos.add(t);
      }
      if (w === 'N/A') na = bloque; else weeks[w] = bloque;
    }
    return { weeks, na, types: [...tipos].sort() };
  }

  async function guardar(snap) {
    snap.id = snap.id || RH.store.idDe(snap.dataset, snap.season);
    snap.updatedAt = new Date().toISOString();
    snap.meta = Object.assign({ origen: 'local', procesado: snap.updatedAt }, snap.meta || {});
    await RH.store.guardar(snap, { origen: 'reporte' });
    if (embebido) window.parent.postMessage({ rh: 'guardado', dataset: snap.dataset, season: snap.season }, '*');
    return snap;
  }

  /**
   * Panel para guardar. opts:
   *  contenedor, dataset, construir: () => snapshot sin id (o lanza error),
   *  temporadaInput: <input>, validar?: (snap) => mensaje de advertencia o null
   */
  function panelGuardar(opts) {
    const reg = RH.registro;
    const dash = reg.dashboardDeDataset(opts.dataset);
    const cont = opts.contenedor;
    const resumen = el('div', { class: 'save-sum' });
    const btn = el('button', { class: 'btn primary', type: 'button' }, 'Guardar en el dashboard ' + (dash ? dash.titulo : ''));
    const ver = el('button', { class: 'btn', type: 'button', hidden: true }, 'Ver dashboard →');
    const estado = el('div', { class: 'save-msg', role: 'status' });
    cont.replaceChildren(
      el('div', { class: 'save-ico', 'aria-hidden': 'true' }, '✓'),
      el('div', { class: 'save-body' },
        el('h3', null, 'Resultados listos'),
        resumen,
        el('div', { class: 'save-actions' }, btn, ver),
        estado));
    cont.hidden = true;

    ver.addEventListener('click', () => irA('#/dash/' + (dash ? dash.id : '')));
    // clave de producto + medida (GOWNS): dos reportes solo son "gemelos" si comparten esa clave
    const claveVar = x => (x.meta && x.meta.producto ? x.meta.producto + '|' + (x.meta.modo || '') : '');
    const idNuevo = x => x.id || RH.store.idDe(x.dataset, x.season);

    btn.addEventListener('click', async () => {
      let lista;
      try { lista = [].concat(opts.construir()); } catch (e) { estado.textContent = e.message; estado.className = 'save-msg err'; return; }
      if (!lista.length || !lista[0].season) { estado.textContent = 'Escribe la etiqueta de la temporada (por ejemplo, 2026).'; estado.className = 'save-msg err'; return; }
      const conDatos = lista.filter(x => Object.keys(x.weeks || {}).length);
      if (!conDatos.length) { estado.textContent = 'No hay ninguna semana con datos (todas las filas quedaron en N/A): revisa el lunes de la semana 1 y vuelve a procesar.'; estado.className = 'save-msg err'; return; }
      const omitidos = lista.length - conDatos.length;
      lista = conDatos;
      const aviso = opts.validar ? opts.validar(lista[0]) : null;
      if (aviso && !(await u.confirmar('Revisa antes de guardar', aviso, { aceptar: 'Guardar de todos modos' }))) return;
      const existentes = (await RH.store.snapshots(lista[0].dataset)).filter(x => !x.demo);
      const gemelas = new Map();
      lista.forEach(x => existentes.filter(y => y.week1 === x.week1 && claveVar(y) === claveVar(x) && y.id !== idNuevo(x)).forEach(y => gemelas.set(y.id, y)));
      if (gemelas.size) {
        const nombres = [...gemelas.values()].map(y => '«' + y.season + '»').join(', ');
        const msg = 'Ya existe(n) la(s) temporada(s) ' + nombres + ' con el mismo lunes de semana 1 (' + u.fmtFecha(lista[0].week1) + '). ' +
          'Si es la misma temporada, se reemplaza por «' + lista[0].season + '» para no compararla contra sí misma.';
        if (!(await u.confirmar('Misma temporada con otra etiqueta', msg, { aceptar: 'Reemplazar' }))) return;
      }
      const previos = lista.map(x => existentes.find(y => y.id === idNuevo(x))).filter(Boolean);
      if (previos.length) {
        const p0 = previos[0];
        const msg = 'Ya existe la temporada ' + lista[0].season + ' en ' + (dash ? dash.titulo : lista[0].dataset) +
          (previos.length > 1 ? ' para ' + previos.length + ' reportes' : '') +
          ' (procesada ' + u.fmtFechaHora(p0.meta && p0.meta.procesado) + ', ' + (p0.meta && p0.meta.archivo ? p0.meta.archivo.nombre : '') + ').' +
          (p0.week1 !== lista[0].week1 ? ' OJO: tenía otro lunes de semana 1 (' + u.fmtFecha(p0.week1) + ').' : '') +
          ' La versión anterior se conserva en el historial de actualizaciones (podrás verla y compararla en el dashboard). ¿Reemplazar' + (previos.length > 1 ? 'los' : 'la') + ' con este archivo?';
        if (!(await u.confirmar('Reemplazar temporada', msg, { aceptar: 'Reemplazar' }))) return;
      }
      btn.disabled = true;
      try {
        for (const g of gemelas.values()) await RH.store.borrar(g.id);
        for (const x of lista) await guardar(x);
        estado.textContent = lista.length === 1
          ? 'Guardado: temporada ' + lista[0].season + ' en ' + (dash ? dash.titulo : lista[0].dataset) + '. Ya no necesitas volver a cargar este archivo.'
          : 'Guardados ' + lista.length + ' reportes en ' + (dash ? dash.titulo : lista[0].dataset) + ': ' + lista.map(x => x.id.split('|')[1]).join(', ') + '. Ya no necesitas volver a cargar este archivo.' +
            (omitidos ? ' (' + omitidos + ' sin semanas con datos, omitido(s).)' : '');
        estado.className = 'save-msg ok';
        ver.hidden = false;
      } catch (e) {
        estado.textContent = 'No se pudo guardar: ' + e.message;
        estado.className = 'save-msg err';
      }
      btn.disabled = false;
    });

    return {
      mostrar(texto) {
        cont.hidden = false;
        resumen.textContent = texto;
        estado.textContent = '';
        estado.className = 'save-msg';
        ver.hidden = true;
      },
      ocultar() { cont.hidden = true; }
    };
  }

  // lunes de semana 1 → etiqueta de una temporada ya guardada (para sugerir la misma etiqueta)
  const etiquetaPorLunes = new Map();
  let sugerirActual = null;
  let chipsSuscritos = false;

  /** Muestra las temporadas ya guardadas como chips que rellenan temporada y lunes */
  async function actualizarTemporadas(opts) {
    if (!opts.chips) return;
    if (!chipsSuscritos) {
      chipsSuscritos = true;
      RH.store.alCambiar(m => { if (!m || m.tipo === 'snapshots') actualizarTemporadas(opts); });
    }
    // GOWNS guarda un reporte por producto y medida: aquí interesa la temporada («2026»), una sola vez
    const etiqueta = s => String(s.meta && s.meta.temporada != null ? s.meta.temporada : s.season);
    const vistas = new Set();
    const snaps = (await RH.store.snapshots(opts.dataset)).filter(s => !s.demo)
      .sort((a, b) => (b.week1 || '').localeCompare(a.week1 || ''))
      .filter(s => { const k = s.week1 + '|' + etiqueta(s); if (vistas.has(k)) return false; vistas.add(k); return true; })
      .map(s => Object.assign({}, s, { season: etiqueta(s) }));
    etiquetaPorLunes.clear();
    snaps.forEach(s => { if (s.week1 && !etiquetaPorLunes.has(s.week1)) etiquetaPorLunes.set(s.week1, String(s.season)); });
    if (sugerirActual) sugerirActual();   // sin disparar eventos: no invalida un resultado ya procesado
    opts.chips.replaceChildren();
    if (!snaps.length) { opts.chips.appendChild(el('span', { class: 'muted' }, 'Ninguna todavía.')); return; }
    snaps.forEach(s => {
      const semanas = Object.keys(s.weeks || {});
      const nFuera = semanas.filter(w => +w > MAX_SEMANA).length;
      const b = el('button', { type: 'button', class: 'chip-btn', title: 'Usar esta temporada (rellena temporada y lunes de la semana 1)' },
        el('strong', null, s.season), ' · S1–S' + ultimaSemana(semanas) + (nFuera ? ' + ' + nFuera + ' fuera de rango' : '') + ' · ' + u.fmtFechaHora(s.meta && s.meta.procesado));
      b.addEventListener('click', () => {
        if (opts.temporadaInput) { opts.temporadaInput.value = s.season; opts.temporadaInput.dataset.manual = '1'; }
        if (opts.inicioInput && s.week1) { opts.inicioInput.value = s.week1; opts.inicioInput.dispatchEvent(new Event('input')); }
      });
      opts.chips.appendChild(b);
    });
  }

  /** Temporada automática a partir del lunes de la semana 1, salvo que el usuario la edite */
  function enlazarTemporada(inicio, temporada, info) {
    const sugerir = () => {
      const v = inicio.value;
      if (!temporada.dataset.manual && /^\d{4}/.test(v)) temporada.value = etiquetaPorLunes.get(v) || String(+v.slice(0, 4) + 1);   // la temporada se nombra por el año en que termina
      if (info) {
        if (!v) { info.textContent = ''; return; }
        const d = new Date(v + 'T00:00:00Z');
        const lunes = d.getUTCDay() === 1;
        info.textContent = 'Semana 1: ' + u.fmtRango(v, u.addDays(v, 6)) + (lunes ? '' : ' · ⚠ la fecha elegida no es lunes');
        info.className = 'hint' + (lunes ? '' : ' warn');
      }
    };
    sugerirActual = sugerir;
    temporada.addEventListener('input', () => { temporada.dataset.manual = temporada.value ? '1' : ''; });
    inicio.addEventListener('input', sugerir);
    inicio.addEventListener('change', sugerir);
    sugerir();
  }

  const EXT_OK = /\.(csv|txt|xlsx|xlsm|xltx|xltm|xls|xlsb)$/i;

  /** Arrastrar y soltar sobre la zona del archivo */
  function zonaArchivo(label, input, info) {
    ['dragenter', 'dragover'].forEach(t => label.addEventListener(t, ev => { ev.preventDefault(); label.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(t => label.addEventListener(t, ev => { ev.preventDefault(); label.classList.remove('drag'); }));
    const conArchivos = ev => !!ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes('Files');
    document.addEventListener('dragover', ev => { if (conArchivos(ev)) ev.preventDefault(); });
    document.addEventListener('drop', ev => {
      if (!conArchivos(ev) || label.contains(ev.target)) return;
      ev.preventDefault();
      soltar(ev);
    });
    label.addEventListener('drop', soltar);
    function soltar(ev) {
      const f = ev.dataTransfer && ev.dataTransfer.files;
      if (!f || !f.length) return;
      if (!EXT_OK.test(f[0].name)) { u.toast('Ese archivo no es CSV ni Excel (.xlsx).', { tipo: 'warn' }); return; }
      try { const dt = new DataTransfer(); dt.items.add(f[0]); input.files = dt.files; } catch (e) { try { input.files = f; } catch (e2) { return; } }
      input.dispatchEvent(new Event('change'));
    }
    input.addEventListener('change', () => {
      const f = input.files[0];
      label.classList.toggle('has', !!f);
      if (info) info.textContent = f ? f.name + ' · ' + (esExcel(f) ? 'Excel' : 'CSV') + ' · ' + u.fmtTamano(f.size) + ' · modificado ' + u.fmtFechaHora(f.lastModified) : '';
    });
  }

  function esExcel(f) { return !!f && /\.(xlsx|xlsm|xltx|xltm|xls|xlsb)$/i.test(f.name || ''); }

  /**
   * Prepara un archivo de Excel: llena el selector de hojas (visible solo si hay más
   * de una) y devuelve el encabezado de la hoja elegida, como textos sin normalizar.
   */
  async function prepararExcel(file, selHoja, wrapHoja) {
    const hojas = await RH.excelFilas.hojas(file);
    const visibles = hojas.filter(h => !h.oculta);
    const lista = visibles.length ? visibles : hojas;
    // con el mismo archivo se respeta la hoja elegida; con otro, la activa del libro (la que Excel guarda como CSV)
    const clave = [file.name, file.size, file.lastModified].join('|');
    const previa = selHoja.dataset.archivo === clave ? selHoja.value : null;
    const activa = lista.find(h => h.activa) || lista[0];
    selHoja.replaceChildren(...lista.map(h => new Option(h.nombre, h.nombre)));
    selHoja.value = lista.some(h => h.nombre === previa) ? previa : activa.nombre;
    selHoja.dataset.archivo = clave;
    wrapHoja.hidden = lista.length < 2;
    return RH.excelFilas.encabezados(file, { hoja: selHoja.value });
  }

  /**
   * Lee los encabezados de un archivo. La fila del encabezado se detecta sola (los reportes suelen traer
   * títulos antes) y se puede corregir en inpFila (1 = primera fila con contenido).
   */
  async function cargarEncabezados(file, selHoja, wrapHoja, inpFila) {
    const excel = esExcel(file);
    if (excel) await prepararExcel(file, selHoja, wrapHoja);
    const hoja = excel ? selHoja.value : null;
    const clave = [file.name, file.size, file.lastModified, hoja].join('|');
    if (inpFila.dataset.clave !== clave) {
      inpFila.value = RH.csv.detectarEncabezado(await RH.csv.muestra(file, { hoja, max: 60 })) + 1;
      inpFila.dataset.clave = clave;
    }
    const fila = Math.max(1, Math.floor(+inpFila.value) || 1) - 1;
    const cols = await RH.csv.encabezados(file, { hoja, filaEncabezado: fila });
    return cols.map(c => String(c).replace(/^\uFEFF/, '').trim().toUpperCase());
  }

  /** Columnas cuyo contenido (primeras filas de datos) es numérico: candidatas a cantidad, sin depender del nombre */
  async function columnasNumericas(file, selHoja, inpFila) {
    const hoja = esExcel(file) ? selHoja.value : null;
    const fila = Math.max(1, Math.floor(+inpFila.value) || 1) - 1;
    const filas = await RH.csv.muestra(file, { hoja, max: fila + 301 });
    const cab = (filas[fila] || []).map(c => String(c).replace(/^\uFEFF/, '').trim().toUpperCase());
    const ok = new Set();
    cab.forEach((nombre, i) => {
      let n = 0, num = 0;
      filas.slice(fila + 1).forEach(r => { const t = String(r[i] == null ? '' : r[i]).trim().replace(/,/g, ''); if (t === '') return; n++; if (isFinite(Number(t))) num++; });
      if (n && num / n >= 0.9) ok.add(nombre);
    });
    return ok;
  }

  /** Si la configuración cambia después de procesar, el resultado ya no corresponde: se invalida */
  function invalidarAlCambiar(nodos, cb) {
    nodos.filter(Boolean).forEach(n => {
      n.addEventListener('input', cb);
      n.addEventListener('change', cb);
    });
  }

  /** Avisos de configuración sospechosa (lunes de inicio de otra temporada, fechas ilegibles) */
  function avisosResultado(r) {
    const avisos = [];
    const base = r.base || 0;
    if (base && r.antesDeInicio / base > 0.3) avisos.push(Math.round(r.antesDeInicio / base * 100) + ' % de las filas quedó ANTES del lunes de la semana 1 (fila N/A). ¿El lunes de inicio corresponde a este archivo?');
    if (base && r.fechasMalas / base > 0.3) avisos.push(Math.round(r.fechasMalas / base * 100) + ' % de las filas no tiene una fecha legible (fila N/A). Revisa la columna de fecha y el formato Mes/Día o Día/Mes.');
    // pocas filas muy lejos de la temporada son fechas mal capturadas, no un lunes equivocado
    const fuera = r.fuera || { filas: 0, semanas: [] };
    const pocas = fuera.filas > 0 && fuera.filas <= Math.max(5, base * 0.02);
    if (pocas) avisos.push(fuera.filas + ' fila(s) con fecha fuera de la temporada (semana ' + fuera.semanas.slice(0, 5).join(', ') + (fuera.semanas.length > 5 ? '…' : '') + '): probablemente fechas mal capturadas. Están en la tabla, pero el dashboard no las grafica.');
    const maxSemana = pocas ? (r.maxEnRango || 0) : r.maxSemana;
    if (maxSemana > 53) avisos.push('Hay datos en la semana ' + maxSemana + ': parece que el lunes de la semana 1 es de una temporada anterior.');
    return avisos;
  }

  function metaArchivo(f, hoja) {
    return f ? { nombre: f.name, tam: f.size, modificado: f.lastModified, tipo: esExcel(f) ? 'excel' : 'csv', hoja: hoja || null } : null;
  }

  // Versiones anteriores guardaban valores del formulario; ya no se usan (los campos
  // arrancan siempre igual que en el HTML original), así que se limpian.
  try { Object.keys(localStorage).filter(k => k.startsWith('rh-form-')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* sin almacenamiento */ }

  /** Avisos al guardar sobre semanas imposibles: separa fechas mal capturadas de un lunes equivocado */
  function avisoSemanas(snap) {
    const semanas = Object.keys(snap.weeks || {});
    const ult = ultimaSemana(semanas), nFuera = semanas.filter(w => +w > MAX_SEMANA).length;
    const avisos = [];
    if (ult > 53) avisos.push('Hay datos en la semana ' + ult + ': parece que el lunes de la semana 1 es de otra temporada.');
    if (nFuera) avisos.push('Hay ' + nFuera + ' semana(s) fuera de rango (fechas mal capturadas): se guardan, pero el dashboard no las grafica.');
    return avisos;
  }

  RH.puente = { embebido, irA, desdeMapa, guardar, panelGuardar, actualizarTemporadas, enlazarTemporada, zonaArchivo, metaArchivo, esExcel, prepararExcel, cargarEncabezados, columnasNumericas, invalidarAlCambiar, avisosResultado, fueraDeRango, ultimaSemana, avisoSemanas, MAX_SEMANA };
})(window.RH = window.RH || {});
