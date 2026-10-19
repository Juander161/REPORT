/* Report Hub · aplicación: navegación, menú, tema, PWA y sincronización. */
(function (RH) {
  'use strict';
  const u = RH.util, el = u.el, reg = RH.registro;

  const vistas = new Map();      // clave de ruta -> { nodo, ctl }
  const marcos = new Map();      // id de reporte -> iframe (se conservan para no perder un proceso en curso)
  let snaps = [];
  let actual = null;

  // ---------------------------------------------------------------- iconos del menú
  const ICONOS = {
    panorama: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    'tassel-only': '<path d="M12 3v7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9 10h6l-1 10h-4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M11 13v5M13 13v5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    'gowns-activas': '<path d="M9 3l3 3 3-3 4 3-2 4-2-1v12H9V9L7 10 5 6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 21h3M18 21h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    gowns: '<path d="M9 3l3 3 3-3 4 3-2 4-2-1v12H9V9L7 10 5 6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    homeship: '<path d="M3 11l9-7 9 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v10h14V10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    reporte: '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    pendiente: '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3 2" stroke-linejoin="round"/><path d="M12 10v6M9 13h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    proyeccion: '<path d="M3 18l5-6 4 3 8-10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 5h4v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 17l2 1 2-1 2 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none" stroke-dasharray="2 2"/>',
    datos: '<ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    ayuda: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1" fill="currentColor"/>'
  };
  const svg = n => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' + (ICONOS[n] || ICONOS.reporte) + '</svg>';

  // ---------------------------------------------------------------- menú lateral
  function menuLateral() {
    const nav = u.$('#nav');
    const item = (href, texto, ico, extra) => el('a', { class: 'nav-i', href, 'data-ruta': href, html: svg(ico) + '<span>' + u.esc(texto) + '</span>' + (extra || '') });
    nav.replaceChildren(
      el('div', { class: 'nav-sec' }, 'Dashboards'),
      item('#/panorama', 'Panorama general', 'panorama'),
      ...reg.dashboards.map(d => item('#/dash/' + d.id, d.titulo, d.id, d.estado === 'pendiente' ? '<em class="nav-badge">pronto</em>' : '')),
      el('div', { class: 'nav-sec' }, 'Reportes · actualizar datos'),
      ...reg.reportes.map(r => item('#/reporte/' + r.id, r.titulo, r.archivo ? 'reporte' : 'pendiente', !r.archivo ? '<em class="nav-badge">pendiente</em>' : '')),
      el('div', { class: 'nav-sec' }, 'Análisis'),
      item('#/proyeccion', 'Proyección de temporada', 'proyeccion'),
      el('div', { class: 'nav-sec' }, 'Datos'),
      item('#/datos', 'Base de datos (Excel)', 'datos', '<span class="nav-sync" id="navSync" hidden></span>'),
      item('#/ayuda', 'Guía de uso', 'ayuda'));
  }

  function marcarMenu(hash) {
    u.$$('.nav-i').forEach(a => {
      const on = hash === a.dataset.ruta || hash.startsWith(a.dataset.ruta + '/');
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ---------------------------------------------------------------- rutas
  function ruta() {
    const h = location.hash || '#/panorama';
    const [, seccion, id] = h.split('/');
    return { hash: h, seccion: seccion || 'panorama', id: id ? decodeURIComponent(id) : null };
  }

  async function navegar() {
    // relee la base en cada cambio de pantalla: así nada queda desactualizado aunque el
    // navegador no entregue los avisos entre pestañas (por ejemplo, al abrir desde una carpeta)
    try { snaps = await RH.store.snapshots(); } catch (e) { /* se usa lo último leído */ }
    const r = ruta();
    const cont = u.$('#views');
    const marcosCont = u.$('#frames');
    let clave = r.seccion + (r.id ? '/' + r.id : '');
    let titulo = 'Panorama general';

    if (r.seccion === 'reporte') {
      const rep = reg.reporte(r.id);
      if (rep && rep.archivo) {
        cont.hidden = true;
        marcosCont.hidden = false;
        mostrarReporte(rep);
        titulo = rep.titulo;
        actual = null;
      } else {
        marcosCont.hidden = true;
        cont.hidden = false;
        mostrarVista('reporte-pend/' + (r.id || ''), c => montarPendiente(c, rep));
        titulo = rep ? rep.titulo : 'Reporte';
      }
    } else {
      marcosCont.hidden = true;
      cont.hidden = false;
      if (r.seccion === 'dash') {
        const d = reg.dashboard(r.id) || reg.dashboards[0];
        clave = 'dash/' + d.id;
        titulo = d.titulo;
        mostrarVista(clave, c => RH.dashboard.montar(c, d));
      } else if (r.seccion === 'proyeccion') { titulo = 'Proyección de temporada'; mostrarVista('proyeccion', c => RH.proyeccionUI.montar(c)); }
      else if (r.seccion === 'datos') { titulo = 'Base de datos'; mostrarVista('datos', c => RH.datos.montar(c)); }
      else if (r.seccion === 'ayuda') { titulo = 'Guía de uso'; mostrarVista('ayuda', c => RH.ayuda.montar(c)); }
      else { clave = 'panorama'; mostrarVista('panorama', c => RH.panorama.montar(c)); }
    }
    marcarMenu(r.seccion === 'panorama' || !location.hash ? '#/panorama' : r.hash);
    document.title = titulo + ' · ' + reg.app.nombre;
    u.$('#crumb').textContent = titulo;
    document.body.classList.remove('nav-open');
    window.scrollTo(0, 0);
  }

  function mostrarVista(clave, fabrica) {
    const cont = u.$('#views');
    vistas.forEach((v, k) => { v.nodo.hidden = k !== clave; });
    let v = vistas.get(clave);
    if (!v) {
      const nodo = el('div', { class: 'view' });
      cont.appendChild(nodo);
      v = { nodo, ctl: fabrica(nodo) };
      vistas.set(clave, v);
    }
    v.nodo.hidden = false;
    actual = v;
    v.ctl.actualizar(snaps);
  }

  function mostrarReporte(rep) {
    const marcosCont = u.$('#frames');
    let f = marcos.get(rep.id);
    if (!f) {
      const consulta = rep.parametros ? rep.parametros + '&' : '';
      const iframe = el('iframe', { src: rep.archivo + '?' + consulta + 'embed=1', title: rep.titulo, class: 'rep-frame', loading: 'eager' });
      const barra = el('div', { class: 'rep-bar' },
        el('div', null, el('div', { class: 'eyebrow' }, 'Reporte' + (rep.dashboard ? ' · alimenta ' + ((reg.dashboard(rep.dashboard) || {}).titulo || '') : '')), el('strong', null, rep.titulo)),
        el('div', { class: 'rep-bar-r' },
          rep.dashboard ? el('a', { class: 'btn sm', href: '#/dash/' + rep.dashboard }, 'Ver dashboard') : null,
          el('a', { class: 'btn ghost sm', href: rep.archivo + (rep.parametros ? '?' + rep.parametros : ''), target: '_blank', rel: 'noopener' }, 'Abrir en pestaña nueva'),
          rep.original ? el('a', { class: 'btn ghost sm', href: rep.original, target: '_blank', rel: 'noopener', title: 'Archivo original sin cambios' }, 'Versión original') : null));
      const wrap = el('div', { class: 'rep-wrap' }, barra, iframe);
      marcosCont.appendChild(wrap);
      f = { wrap, iframe };
      marcos.set(rep.id, f);
    }
    marcos.forEach((m, id) => { m.wrap.hidden = id !== rep.id; });
  }

  /** Pantalla reservada para un reporte que todavía no tiene archivo (p. ej. Gowns) */
  function montarPendiente(c, rep) {
    const d = rep && reg.dashboard(rep.dashboard);
    c.replaceChildren(el('div', { class: 'pend-view' },
      el('header', { class: 'page-head' }, el('div', { class: 'ph-l' },
        el('div', { class: 'eyebrow' }, 'Reporte'),
        el('h1', { class: 'ph-t' }, rep ? rep.titulo : 'Reporte no encontrado'),
        el('p', { class: 'ph-sub' }, rep ? rep.descripcion : 'Revisa el enlace.'))),
      el('section', { class: 'card slot' },
        el('div', { class: 'slot-art', 'aria-hidden': 'true', html: svg('pendiente') }),
        el('h2', null, 'Espacio listo para el reporte' + (d ? ' de ' + d.titulo : '')),
        el('p', null, 'Aquí se integrará el tercer archivo HTML. En cuanto se conecte, podrás procesar el CSV desde esta misma pantalla y sus resultados alimentarán el dashboard ' + (d ? d.titulo : '') + ' con todas las comparaciones por temporada.'),
        el('ol', { class: 'steps' },
          el('li', null, 'El archivo se guarda en ', el('code', null, 'reportes/'), ' con el mismo estilo que los demás.'),
          el('li', null, 'Se registra en ', el('code', null, 'js/registry.js'), ' y se activa su dashboard.'),
          el('li', null, 'Sus resultados se guardan por temporada, igual que Tassel Only y Homeship.')),
        d ? el('a', { class: 'btn', href: '#/dash/' + d.id }, 'Ver tablero ' + d.titulo) : null)));
    return { actualizar() {}, retematizar() {} };
  }

  // ---------------------------------------------------------------- datos
  const refrescar = u.debounce(async () => {
    snaps = await RH.store.snapshots();
    vistas.forEach(v => { if (!v.nodo.hidden) v.ctl.actualizar(snaps); });
    // las vistas ocultas se refrescan al mostrarse
  }, 120);

  const sincronizarExcel = u.debounce(() => { RH.dbx.sincronizar({ interactivo: false }); }, 1500);

  // ---------------------------------------------------------------- tema
  function aplicarTema(t) {
    const raiz = document.documentElement;
    if (t === 'light' || t === 'dark') raiz.setAttribute('data-theme', t); else raiz.removeAttribute('data-theme');
    const oscuro = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = u.$('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', oscuro ? '#0a1322' : '#0f2340');
    u.$$('[data-tema]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === (t || 'auto'))));
    vistas.forEach(v => v.ctl.retematizar && v.ctl.retematizar());
  }

  // ---------------------------------------------------------------- PWA
  let instalar = null;
  let actualizando = false;
  function pwa() {
    window.addEventListener('beforeinstallprompt', ev => {
      ev.preventDefault();
      instalar = ev;
      u.$('#btnInstalar').hidden = false;
    });
    u.$('#btnInstalar').addEventListener('click', async () => {
      if (!instalar) return;
      instalar.prompt();
      const r = await instalar.userChoice.catch(() => null);
      if (r && r.outcome === 'accepted') u.toast('Report Hub se instaló como aplicación.', { tipo: 'ok' });
      instalar = null;
      u.$('#btnInstalar').hidden = true;
    });
    window.addEventListener('appinstalled', () => { u.$('#btnInstalar').hidden = true; RH.store.persistente(); });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').then(reg0 => {
        const avisar = w => {
          const b = u.$('#banners');
          if (u.$('#bannerUpd')) return;
          b.appendChild(el('div', { class: 'banner banner-upd', id: 'bannerUpd' },
            el('span', null, el('strong', null, 'Nueva versión disponible. '), 'Actualiza antes de procesar archivos: puede traer correcciones en los cálculos.'),
            el('button', { class: 'btn sm primary', type: 'button', onclick: () => { actualizando = true; w.postMessage({ tipo: 'activar' }); } }, 'Actualizar ahora')));
        };
        if (reg0.waiting && navigator.serviceWorker.controller) avisar(reg0.waiting);
        reg0.addEventListener('updatefound', () => {
          const w = reg0.installing;
          if (!w) return;
          w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) avisar(w); });
        });
        setInterval(() => reg0.update().catch(() => {}), 60 * 60 * 1000);
      }).catch(err => console.warn('Service worker no registrado:', err));
      // solo se recarga cuando la persona eligió «Actualizar ahora» (no en la primera instalación)
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (actualizando) { actualizando = false; location.reload(); } });
    }
  }

  function estadoRed() {
    const chip = u.$('#chipRed');
    const f = () => { chip.hidden = navigator.onLine; };
    window.addEventListener('online', f); window.addEventListener('offline', f); f();
  }

  function estadoVinculo(ev) {
    const v = ev ? ev.detail : RH.dbx.vinculo;
    const chip = u.$('#chipExcel');
    const nav = u.$('#navSync');
    const b = u.$('#banners');
    const prev = u.$('#bannerPermiso');
    if (prev) prev.remove();
    chip.hidden = !v.nombre;
    if (v.nombre) {
      chip.className = 'chip-top ' + ({ ok: 'ok', sincronizando: 'busy', permiso: 'warn', error: 'err' }[v.estado] || '');
      chip.textContent = { ok: 'Excel sincronizado', sincronizando: 'Sincronizando…', permiso: 'Excel sin permiso', error: 'Error con Excel' }[v.estado] || 'Excel vinculado';
      chip.title = v.nombre + (v.error ? ' · ' + v.error : '');
    }
    if (nav) { nav.hidden = !v.nombre; nav.className = 'nav-sync ' + (v.estado || ''); }
    if (v.estado === 'permiso') {
      b.appendChild(el('div', { class: 'banner banner-warn', id: 'bannerPermiso' },
        el('span', null, 'Para seguir sincronizando con ', el('strong', null, v.nombre), ' el navegador necesita tu permiso.'),
        el('button', { class: 'btn sm primary', type: 'button', onclick: async () => { const r = await RH.dbx.sincronizar({ interactivo: true }); if (r.estado === 'ok') u.toast('Excel reconectado.', { tipo: 'ok' }); } }, 'Reconectar Excel')));
    }
  }

  // ---------------------------------------------------------------- mensajes de los reportes
  function mensajes() {
    window.addEventListener('message', ev => {
      if (ev.origin !== location.origin && location.protocol !== 'file:') return;
      const d = ev.data || {};
      if (d.rh === 'navegar' && typeof d.hash === 'string' && d.hash.startsWith('#/')) location.hash = d.hash;
      if (d.rh === 'guardado') {
        refrescar();
        const dash = reg.dashboardDeDataset(d.dataset);
        u.toast('Temporada ' + d.season + ' guardada en ' + (dash ? dash.titulo : d.dataset) + '.', {
          tipo: 'ok', accion: dash ? { texto: 'Ver dashboard', fn: () => { location.hash = '#/dash/' + dash.id; } } : null
        });
      }
    });
  }

  // ---------------------------------------------------------------- arranque
  async function iniciar() {
    menuLateral();
    RH.info.observar(document.getElementById('views'));
    u.$('#appVer').textContent = 'v' + reg.app.version;

    // tema
    const tema = u.lsGet('rh-tema', 'auto');
    aplicarTema(tema);
    u.$$('[data-tema]').forEach(b => b.addEventListener('click', () => { u.lsSet('rh-tema', b.dataset.tema); aplicarTema(b.dataset.tema); }));
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (u.lsGet('rh-tema', 'auto') === 'auto') aplicarTema('auto'); });
    window.addEventListener('storage', ev => { if (ev.key === 'rh-tema') aplicarTema(u.lsGet('rh-tema', 'auto')); });

    // menú móvil
    u.$('#btnMenu').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    u.$('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

    pwa();
    estadoRed();
    mensajes();
    window.addEventListener('rh-vinculo', estadoVinculo);
    window.addEventListener('rh-sync-cambios', ev => {
      const x = ev.detail || {};
      const partes = [];
      if (x.nuevos) partes.push(x.nuevos + ' nueva(s)');
      if (x.actualizados) partes.push(x.actualizados + ' actualizada(s)');
      if (x.borrados) partes.push(x.borrados + ' eliminada(s)');
      u.toast('Cambios traídos de ' + x.nombre + ' (otra persona o edición en Excel): ' + partes.join(', ') + '.' +
        (x.otraConfig && x.otraConfig.length ? ' OJO: ' + x.otraConfig.join(', ') + ' se procesó con otro lunes de inicio u otras opciones; revisa su «Tabla del reporte».' : ''), { tipo: x.otraConfig && x.otraConfig.length ? 'warn' : 'info', ms: 9000 });
    });
    window.addEventListener('focus', () => refrescar());

    try {
      snaps = await RH.store.snapshots();
    } catch (e) {
      u.toast('No se pudo abrir el almacenamiento local: ' + e.message, { tipo: 'error', ms: 10000 });
      snaps = [];
    }
    RH.store.alCambiar(msg => {
      refrescar();
      if (msg && msg.tipo === 'snapshots' && !['sync', 'demo'].includes(msg.origen) && RH.dbx.vinculo.nombre) sincronizarExcel();
    });
    window.addEventListener('hashchange', navegar);
    navegar();

    // tareas de fondo: base compartida, Excel vinculado, protección del almacenamiento
    RH.store.persistente();
    RH.dbx.cargarCompartida().then(r => {
      if (r && r.estado === 'ok' && (r.nuevos || r.actualizados)) {
        u.toast('Base compartida del equipo: ' + (r.nuevos + r.actualizados) + ' temporada(s) cargadas.', { tipo: 'ok' });
      }
    }).catch(() => {});
    RH.store.ajuste('enlaceBase', null).then(e => e && e.url && navigator.onLine !== false && RH.dbx.cargarEnlace(e.url).then(r => {
      if (r && r.estado === 'ok' && (r.nuevos || r.actualizados)) u.toast('Excel del enlace: ' + (r.nuevos + r.actualizados) + ' temporada(s) actualizadas.', { tipo: 'ok' });
    })).catch(() => {});
    RH.dbx.iniciarRecepcion(r => u.toast('Datos actualizados desde el archivo compartido: ' + (r.nuevos + r.actualizados) + ' temporada(s).', { tipo: 'ok' }));
    RH.dbx.iniciarPublicacion();
    RH.dbx.iniciarVinculo();
    let ultimoFoco = Date.now();
    window.addEventListener('focus', () => {
      if (Date.now() - ultimoFoco > 30000 && RH.dbx.vinculo.nombre && RH.dbx.vinculo.estado !== 'permiso') { ultimoFoco = Date.now(); RH.dbx.sincronizar({ interactivo: false }); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.RH = window.RH || {});
