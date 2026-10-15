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
    snap.id = RH.store.idDe(snap.dataset, snap.season);
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
    btn.addEventListener('click', async () => {
      let snap;
      try { snap = opts.construir(); } catch (e) { estado.textContent = e.message; estado.className = 'save-msg err'; return; }
      if (!snap.season) { estado.textContent = 'Escribe la etiqueta de la temporada (por ejemplo, 2026).'; estado.className = 'save-msg err'; return; }
      const aviso = opts.validar ? opts.validar(snap) : null;
      if (aviso && !(await u.confirmar('Revisa antes de guardar', aviso, { aceptar: 'Guardar de todos modos' }))) return;
      const previo = await RH.store.snapshot(RH.store.idDe(snap.dataset, snap.season));
      if (previo && !previo.demo) {
        const msg = 'Ya existe la temporada ' + snap.season + ' en ' + (dash ? dash.titulo : snap.dataset) +
          ' (procesada ' + u.fmtFechaHora(previo.meta && previo.meta.procesado) + ', ' + (previo.meta && previo.meta.archivo ? previo.meta.archivo.nombre : '') + ').' +
          (previo.week1 !== snap.week1 ? ' OJO: tenía otro lunes de semana 1 (' + u.fmtFecha(previo.week1) + ').' : '') +
          ' ¿Reemplazarla con este archivo?';
        if (!(await u.confirmar('Reemplazar temporada', msg, { aceptar: 'Reemplazar' }))) return;
      }
      btn.disabled = true;
      try {
        await guardar(snap);
        estado.textContent = 'Guardado: temporada ' + snap.season + ' en ' + (dash ? dash.titulo : snap.dataset) + '. Ya no necesitas volver a cargar este archivo.';
        estado.className = 'save-msg ok';
        ver.hidden = false;
        actualizarTemporadas(opts);
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

  /** Muestra las temporadas ya guardadas como chips que rellenan temporada y lunes */
  async function actualizarTemporadas(opts) {
    if (!opts.chips) return;
    const snaps = (await RH.store.snapshots(opts.dataset)).filter(s => !s.demo)
      .sort((a, b) => (b.week1 || '').localeCompare(a.week1 || ''));
    opts.chips.replaceChildren();
    if (!snaps.length) { opts.chips.appendChild(el('span', { class: 'muted' }, 'Ninguna todavía.')); return; }
    snaps.forEach(s => {
      const ult = Object.keys(s.weeks || {}).map(Number).filter(isFinite).reduce((a, b) => Math.max(a, b), 0);
      const b = el('button', { type: 'button', class: 'chip-btn', title: 'Usar esta temporada (rellena temporada y lunes de la semana 1)' },
        el('strong', null, s.season), ' · S1–S' + ult + ' · ' + u.fmtFechaHora(s.meta && s.meta.procesado));
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
      if (!temporada.dataset.manual && /^\d{4}/.test(v)) temporada.value = v.slice(0, 4);
      if (info) {
        if (!v) { info.textContent = ''; return; }
        const d = new Date(v + 'T00:00:00Z');
        const lunes = d.getUTCDay() === 1;
        info.textContent = 'Semana 1: ' + u.fmtRango(v, u.addDays(v, 6)) + (lunes ? '' : ' · ⚠ la fecha elegida no es lunes');
        info.className = 'hint' + (lunes ? '' : ' warn');
      }
    };
    temporada.addEventListener('input', () => { temporada.dataset.manual = temporada.value ? '1' : ''; });
    inicio.addEventListener('input', sugerir);
    inicio.addEventListener('change', sugerir);
    sugerir();
  }

  /** Arrastrar y soltar sobre la zona del archivo */
  function zonaArchivo(label, input, info) {
    ['dragenter', 'dragover'].forEach(t => label.addEventListener(t, ev => { ev.preventDefault(); label.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(t => label.addEventListener(t, ev => { ev.preventDefault(); label.classList.remove('drag'); }));
    label.addEventListener('drop', ev => {
      const f = ev.dataTransfer && ev.dataTransfer.files;
      if (!f || !f.length) return;
      try { input.files = f; } catch (e) { return; }
      input.dispatchEvent(new Event('change'));
    });
    input.addEventListener('change', () => {
      const f = input.files[0];
      label.classList.toggle('has', !!f);
      if (info) info.textContent = f ? f.name + ' · ' + u.fmtTamano(f.size) + ' · modificado ' + u.fmtFechaHora(f.lastModified) : '';
    });
  }

  function metaArchivo(f) {
    return f ? { nombre: f.name, tam: f.size, modificado: f.lastModified } : null;
  }

  /** Recuerda valores de campos simples entre sesiones (por reporte) */
  function recordar(clave, ids) {
    const guardado = u.lsGet('rh-form-' + clave, {});
    ids.forEach(id => {
      const n = document.getElementById(id);
      if (!n) return;
      if (guardado[id] != null) {
        if (n.type === 'checkbox') n.checked = !!guardado[id]; else n.value = guardado[id];
      }
      n.addEventListener('change', () => {
        const g = u.lsGet('rh-form-' + clave, {});
        g[id] = n.type === 'checkbox' ? n.checked : n.value;
        u.lsSet('rh-form-' + clave, g);
      });
    });
  }

  RH.puente = { embebido, irA, desdeMapa, guardar, panelGuardar, actualizarTemporadas, enlazarTemporada, zonaArchivo, metaArchivo, recordar };
})(window.RH = window.RH || {});
