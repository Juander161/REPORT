/* Report Hub · vista «Proyección»: estima el cierre de la temporada actual con las anteriores.
   Es dinámica: tú eliges el dashboard (cualquier reporte registrado), la métrica o el campo,
   los tipos, las temporadas base, la semana de corte y el método. */
(function (RH) {
  'use strict';
  const u = RH.util, el = u.el, M = RH.modelo, G = RH.graf, P = RH.proy;

  const LLAVE = 'rh-proy';
  const cargar = () => { try { return JSON.parse(sessionStorage.getItem(LLAVE)) || {}; } catch (e) { return {}; } };

  /** Medidas disponibles de un dashboard: métricas de conteo y cada campo guardado */
  function medidasDe(dash) {
    const out = [];
    (dash.metricas || []).filter(m => m.tipo !== 'ratio').forEach(m => out.push({ id: 'm:' + m.id, etiqueta: m.etiqueta, unidad: m.unidad || '', medida: (a, o) => m.num(a, o) }));
    Object.keys(dash.campos || {}).forEach(k => out.push({ id: 'c:' + k, etiqueta: 'Campo · ' + dash.campos[k], unidad: '', medida: a => +a[k] || 0 }));
    return out;
  }

  function montar(cont) {
    const raiz = el('div', { class: 'dash proy' });
    cont.replaceChildren(raiz);
    let snaps = [];
    let e = cargar();
    const guardar = () => { try { sessionStorage.setItem(LLAVE, JSON.stringify(e)); } catch (err) { /* sin almacenamiento */ } };

    raiz.appendChild(el('header', { class: 'page-head' },
      el('div', { class: 'ph-l' }, el('div', { class: 'eyebrow' }, 'Análisis'), el('h1', { class: 'ph-t' }, 'Proyección de temporada'),
        el('p', { class: 'ph-sub' }, 'Estima cómo cerrará la temporada actual a partir de las anteriores, con la misma lógica del índice de crecimiento. Elige el reporte, la métrica, los tipos y el método: funciona con cualquier archivo que hayas guardado.'))));
    const filtros = el('div', { class: 'filters proy-filtros', role: 'group', 'aria-label': 'Parámetros de la proyección' });
    raiz.appendChild(el('div', { class: 'filters-wrap' }, filtros));
    const aviso = el('div', { class: 'filters-sum' });
    raiz.appendChild(aviso);
    const kpiCaja = el('div', { class: 'kpis' });
    raiz.appendChild(kpiCaja);
    const grid = el('div', { class: 'grid' });
    raiz.appendChild(grid);
    const cAc = RH.dashboard.tarjeta({ id: 'proy-acumulado', span: 8, alto: 'l' });
    const cExp = el('section', { class: 'card span-4 insights' });
    const cSem = RH.dashboard.tarjeta({ id: 'proy-semanal', span: 12 });
    const cCmp = el('section', { class: 'card span-12 table-card' });
    grid.append(cAc.el, cExp, cSem.el, cCmp);
    const vacio = el('div', { class: 'empty', hidden: true });
    raiz.appendChild(vacio);

    // ------------------------------------------------------------ estado derivado
    function contexto() {
      const dashes = RH.registro.dashboards.filter(d => d.estado !== 'pendiente' && (d.metricas || []).length &&
        snaps.some(s => s.dataset === d.dataset));
      if (!dashes.length) return null;
      const dash = dashes.find(d => d.id === e.dash) || dashes[0];
      const temps = M.temporadas(snaps, dash.dataset);
      const cur = temps.find(s => s.id === e.cur) || temps[0];
      const posibles = temps.filter(s => s.id !== cur.id && (s.week1 || '') < (cur.week1 || ''));
      const elegidas = Array.isArray(e.bases) ? posibles.filter(s => e.bases.includes(s.id)) : posibles;
      const medidas = medidasDe(dash);
      const med = medidas.find(x => x.id === e.medida) || medidas.find(x => x.id === 'm:' + dash.principal) || medidas[0];
      const tiposTodos = M.tiposDe(cur, ...posibles);
      const excl = (Array.isArray(e.tiposExcl) ? e.tiposExcl : []).filter(t => tiposTodos.includes(t));
      const tipos = excl.length && excl.length < tiposTodos.length ? new Set(tiposTodos.filter(t => !excl.includes(t))) : null;
      const optsDe = s => { const o = {}; (dash.opciones || []).forEach(op => { o[op.id] = op.id in (e.opts || {}) ? !!e.opts[op.id] : !!(s && s.meta && s.meta.config && s.meta.config[op.id]); }); return o; };
      const Lc = M.ultimaSemana(cur);
      const parcial = M.semanaParcial(cur);
      const kDef = parcial ? parcial.semana - 1 : Lc;
      const k = Math.max(1, Math.min(Lc, e.k || kDef || 1));
      return { dashes, dash, temps, cur, posibles, bases: elegidas, medidas, med, tiposTodos, tipos, excl, optsDe, Lc, parcial, kDef, k };
    }

    // ------------------------------------------------------------ controles
    function campo(etiqueta, ...nodos) { return el('div', { class: 'f-g' }, el('span', { class: 'f-l' }, etiqueta), ...nodos); }
    function sel(opciones, valor, al, etiqueta) {
      const s = el('select', { 'aria-label': etiqueta }, opciones.map(([v, t]) => el('option', { value: v, selected: String(v) === String(valor) }, t)));
      s.addEventListener('change', () => al(s.value));
      return s;
    }

    function pintarControles(c) {
      filtros.replaceChildren();
      filtros.appendChild(campo('Reporte', sel(c.dashes.map(d => [d.id, d.titulo]), c.dash.id, v => { e = { dash: v }; cambio(); }, 'Reporte')));
      filtros.appendChild(campo('Qué proyectar', sel(c.medidas.map(m => [m.id, m.etiqueta]), c.med.id, v => { e.medida = v; cambio(); }, 'Métrica')));
      filtros.appendChild(campo('Temporada a proyectar', sel(c.temps.map(s => [s.id, s.season + (s.demo ? ' (demo)' : '')]), c.cur.id, v => { e.cur = v; e.bases = null; e.k = null; cambio(); }, 'Temporada')));

      // temporadas base
      const mBases = el('button', { class: 'btn sm', type: 'button' }, c.posibles.length ? c.bases.length + ' de ' + c.posibles.length + ' temporada(s)' : 'Sin temporadas anteriores');
      mBases.disabled = !c.posibles.length;
      mBases.addEventListener('click', ev => {
        ev.stopPropagation(); cerrarMenus();
        const m = el('div', { class: 'menu menu-check', role: 'menu', onclick: x => x.stopPropagation() });
        c.posibles.forEach(s => {
          const cb = el('input', { type: 'checkbox', checked: c.bases.some(b => b.id === s.id) });
          cb.addEventListener('change', () => {
            const ids = new Set(c.bases.map(b => b.id));
            if (cb.checked) ids.add(s.id); else ids.delete(s.id);
            e.bases = [...ids]; cambio();
          });
          m.appendChild(el('label', { class: 'menu-c' }, cb, el('span', null, s.season)));
        });
        document.body.appendChild(m);
        const r = mBases.getBoundingClientRect();
        m.style.top = (r.bottom + window.scrollY + 6) + 'px';
        m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
      });
      filtros.appendChild(campo('Temporadas base', mBases));

      // tipos
      const mTipos = el('button', { class: 'btn sm', type: 'button' }, c.tipos ? c.tipos.size + ' de ' + c.tiposTodos.length + ' tipos' : 'Todos los tipos');
      mTipos.addEventListener('click', ev => {
        ev.stopPropagation(); cerrarMenus();
        const m = el('div', { class: 'menu menu-check', role: 'menu', onclick: x => x.stopPropagation() });
        const todos = el('button', { class: 'menu-i', type: 'button', onclick: () => { e.tiposExcl = []; cambio(); cerrarMenus(); } }, 'Todos los tipos');
        m.appendChild(todos);
        c.tiposTodos.forEach(t => {
          const cb = el('input', { type: 'checkbox', checked: !c.excl.includes(t) });
          cb.addEventListener('change', () => {
            const ex = new Set(c.excl);
            if (cb.checked) ex.delete(t); else ex.add(t);
            e.tiposExcl = [...ex]; cambio();
          });
          m.appendChild(el('label', { class: 'menu-c' }, cb, el('span', null, t)));
        });
        document.body.appendChild(m);
        const r = mTipos.getBoundingClientRect();
        m.style.top = (r.bottom + window.scrollY + 6) + 'px';
        m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
      });
      filtros.appendChild(campo('Tipo de asignación', mTipos));

      // semana de corte y horizonte
      const semanas = u.rango(1, c.Lc);
      filtros.appendChild(campo('Semana de corte (lo real llega hasta aquí)', sel(semanas.map(w => [w, 'S' + w + (c.parcial && c.parcial.semana === w ? ' (parcial)' : '') + (c.cur.week1 ? ' · ' + u.fmtDia(u.addDays(u.weekMonday(c.cur.week1, w), 6)) : '')]), c.k, v => { e.k = +v; cambio(); }, 'Semana de corte')));
      const maxBase = Math.max(c.k, ...c.bases.map(b => M.ultimaSemana(b)));
      const horizontes = u.rango(c.k, Math.min(M.MAX_SEMANA, Math.max(maxBase, c.k + 1) + 4));
      filtros.appendChild(campo('Proyectar hasta', sel(horizontes.map(w => [w, 'S' + w]), e.H && e.H >= c.k && e.H <= horizontes[horizontes.length - 1] ? e.H : maxBase, v => { e.H = +v; cambio(); }, 'Horizonte')));

      // método
      const metodo = P.METODOS.find(x => x.id === (e.metodo || 'indice')) || P.METODOS[0];
      filtros.appendChild(campo('Método', sel(P.METODOS.map(x => [x.id, x.nombre]), metodo.id, v => { e.metodo = v; cambio(); }, 'Método')));
      if (metodo.id === 'reciente') {
        filtros.appendChild(campo('Últimas semanas', sel([2, 3, 4, 6, 8].map(n => [n, n + ' semanas']), e.ventana || 4, v => { e.ventana = +v; cambio(); }, 'Ventana reciente')));
      }
      (c.dash.opciones || []).forEach(o => {
        const cb = el('input', { type: 'checkbox', role: 'switch', checked: !!c.optsDe(c.cur)[o.id] });
        cb.addEventListener('change', () => { e.opts = Object.assign({}, e.opts, { [o.id]: cb.checked }); cambio(); });
        filtros.appendChild(campo('Opciones', el('label', { class: 'switch', title: o.ayuda || '' }, cb, el('span', { class: 'sw' }), el('span', null, o.etiqueta))));
      });
    }

    function cerrarMenus() { u.$$('.menu').forEach(m => m.remove()); }
    document.addEventListener('click', cerrarMenus);

    // ------------------------------------------------------------ cálculo y pintado
    let ultimoCalc = null;
    function cambio() { guardar(); render(); }

    function render() {
      const c = contexto();
      if (!c) {
        filtros.parentElement.hidden = true; kpiCaja.hidden = true; grid.hidden = true; aviso.hidden = true;
        vacio.hidden = false;
        vacio.replaceChildren(el('h3', null, 'Aún no hay datos para proyectar'), el('p', null, 'Procesa y guarda al menos una temporada en un reporte; con una o más temporadas anteriores podrás proyectar el cierre.'),
          el('a', { class: 'btn primary', href: '#/reporte/tassel-only' }, 'Ir a los reportes'));
        return;
      }
      filtros.parentElement.hidden = false; kpiCaja.hidden = false; grid.hidden = false; aviso.hidden = false; vacio.hidden = true;
      pintarControles(c);

      const nombre = c.med.etiqueta;
      const r = c.bases.length ? P.calcular({
        cur: c.cur, bases: c.bases, medida: c.med.medida, tipos: c.tipos,
        optsCur: c.optsDe(c.cur), optsBase: c.optsDe, k: c.k, H: e.H && e.H >= c.k ? e.H : null,
        metodo: e.metodo || 'indice', ventana: e.ventana || 4
      }) : null;
      ultimoCalc = { c, r };

      aviso.replaceChildren(...[
        el('span', { class: 'chip' }, nombre + (c.tipos ? ' · ' + c.tipos.size + ' tipos' : ' · todos los tipos')),
        el('span', { class: 'chip' }, 'Real: S1–S' + c.k + ' de ' + c.cur.season),
        c.bases.length ? el('span', { class: 'chip' }, 'Base: ' + c.bases.map(b => b.season).join(', ')) : el('span', { class: 'chip chip-warn' }, 'Elige al menos una temporada base'),
        c.parcial && c.k >= c.parcial.semana ? el('span', { class: 'chip chip-warn', title: 'La semana en curso aún no termina: lo real queda corto y la proyección saldría baja.' }, 'S' + c.parcial.semana + ' es parcial: conviene cortar en S' + (c.parcial.semana - 1)) : null,
        ...(r ? r.notas.map(n => el('span', { class: 'chip chip-warn' }, n)) : []),
        r && r.util.length === 1 ? el('span', { class: 'chip chip-warn', title: 'Con una sola temporada base no hay forma de medir la dispersión: el rango es solo orientativo.' }, 'Solo 1 temporada base') : null
      ].filter(Boolean));

      if (!r || r.sel.vacio) {
        kpiCaja.replaceChildren(el('div', { class: 'kpi' }, el('div', { class: 'kpi-l' }, 'Sin proyección'), el('div', { class: 'kpi-n' }, !c.bases.length ? 'Elige al menos una temporada anterior como base.' : (r && r.notas.join(' ')) || 'Los datos no alcanzan para este método. Prueba con otro método, otra semana de corte u otra métrica.')));
        cAc.poner(null); cSem.poner(null); cExp.replaceChildren(); cCmp.replaceChildren();
        if (r) pintarComparacion(c, r);
        return;
      }
      pintarKpis(c, r);
      pintarGraficas(c, r);
      pintarExplicacion(c, r);
      pintarComparacion(c, r);
    }

    function fmt(n) { return n == null ? '–' : u.fmtInt(Math.round(n)); }

    function pintarKpis(c, r) {
      const s = r.sel, crec = r.crecimiento;
      const ancho = s.high - s.low;
      kpiCaja.replaceChildren(
        el('div', { class: 'kpi kpi-hero' }, el('div', { class: 'kpi-l' }, c.med.etiqueta + ' · cierre estimado ' + c.cur.season),
          el('div', { class: 'kpi-v' }, fmt(s.total)),
          crec != null ? el('div', { class: 'kpi-d ' + (crec > 0 ? 'up' : crec < 0 ? 'down' : 'flat') }, el('span', { class: 'kpi-arrow', 'aria-hidden': 'true' }, crec > 0 ? '▲' : crec < 0 ? '▼' : '■'), el('span', null, u.fmtSignedPct(crec)), el('span', { class: 'kpi-ds' }, 'vs promedio de las bases (' + fmt(r.refBase) + ')')) : null,
          el('div', { class: 'kpi-n' }, s.detalle || '')),
        el('div', { class: 'kpi' }, el('div', { class: 'kpi-l' }, 'Rango estimado'), el('div', { class: 'kpi-v' }, fmt(s.low) + ' – ' + fmt(s.high)),
          el('div', { class: 'kpi-n' }, ancho > 0 ? '±' + fmt(ancho / 2) + ' alrededor del centro · ' : 'Sin dispersión (una sola referencia) · ', 'mín–máx entre ', RH.info.termino('referencias', 'rango'))),
        el('div', { class: 'kpi' }, el('div', { class: 'kpi-l' }, 'Real a la fecha (S1–S' + r.k + ')'), el('div', { class: 'kpi-v' }, fmt(r.ytd)),
          el('div', { class: 'kpi-n' }, s.total ? Math.round(r.ytd / s.total * 100) + ' % del cierre estimado' : '')),
        el('div', { class: 'kpi' }, el('div', { class: 'kpi-l' }, 'Falta por llegar'), el('div', { class: 'kpi-v' }, fmt(Math.max(0, s.total - r.ytd))),
          el('div', { class: 'kpi-n' }, r.nSem + ' semana' + (r.nSem === 1 ? '' : 's') + ' (S' + (r.k + 1) + '–S' + r.H + ')' + (r.nSem ? ' · ' + fmt((s.total - r.ytd) / r.nSem) + ' por semana' : ''))));
    }

    function pintarGraficas(c, r) {
      const cats = r.semanas.map(w => 'S' + w);
      const largas = r.semanas.map(w => 'Semana ' + w + (c.cur.week1 ? ' · ' + u.fmtRango(u.weekMonday(c.cur.week1, w), u.addDays(u.weekMonday(c.cur.week1, w), 6)) : '') + (w > r.k ? ' (proyectada)' : ''));
      const nombre = c.med.etiqueta;
      const baseSer = r.series.basesAc.map((b, i) => ({ nombre: 'Temporada ' + b.season, valores: b.v, rol: i === r.series.basesAc.length - 1 ? 'prev' : 'cat', cat: i }));
      const subt = 'Real hasta S' + r.k + ' · proyección con «' + (P.METODOS.find(x => x.id === r.sel.id) || {}).corto + '»';
      cAc.poner({
        id: 'proy-acumulado', tipo: 'line', titulo: 'Acumulado proyectado · ' + nombre + ' · ' + c.cur.season, subtitulo: subt,
        categorias: cats, categoriasLargas: largas, ejeX: 'Semana', formato: 'int', resaltar: r.k - 1,
        series: [
          ...baseSer,
          { nombre: 'Máximo', valores: r.series.high, rol: 'otros', dash: true, fino: true },
          { nombre: 'Mínimo', valores: r.series.low, rol: 'otros', dash: true, fino: true },
          { nombre: 'Proyección ' + c.cur.season, valores: r.series.central, rol: 'cur', dash: true },
          { nombre: 'Real ' + c.cur.season, valores: r.series.realAc, rol: 'cur' }
        ],
        archivo: 'Proyeccion_' + nombre + '_' + c.cur.season
      });
      cSem.poner({
        id: 'proy-semanal', tipo: 'colStacked', titulo: 'Semana a semana · real y proyectado · ' + nombre, subtitulo: subt,
        categorias: cats, categoriasLargas: largas, ejeX: 'Semana', formato: 'int', total: false,
        series: [{ nombre: 'Real', valores: r.series.semReal, rol: 'cur' }, { nombre: 'Proyectado', valores: r.series.semProy, rol: 'proy' }],
        archivo: 'Proyeccion_semanal_' + nombre + '_' + c.cur.season
      });
      cSem.el.hidden = false;
    }

    function pintarExplicacion(c, r) {
      const m = P.METODOS.find(x => x.id === r.sel.id);
      const lista = el('ul', { class: 'ins-list' });
      const li = (ico, ...partes) => lista.appendChild(el('li', { class: 'ins ins-' + ico }, el('span', { class: 'ins-i', 'aria-hidden': 'true' }, { up: '▲', down: '▼', info: 'i', warn: '!', star: '★' }[ico]), el('span', null, ...partes)));
      li('info', el('strong', null, m.corto + ': '), m.ayuda);
      if (r.sel.detalle) li('info', r.sel.detalle);
      li('info', 'Se usan ', el('strong', null, r.util.length + ' temporada' + (r.util.length === 1 ? '' : 's') + ' base'), ' (' + r.util.map(b => b.season + ': ' + fmt(b.total)).join(' · ') + ').');
      if (r.util.length < 3) li('warn', 'Con pocas temporadas la proyección es orientativa: cada temporada extra mejora la estimación y el rango.');
      if (c.parcial && c.k >= c.parcial.semana) li('warn', 'La semana de corte es parcial; la proyección puede salir baja.');
      li('info', 'Es una estimación estadística, no una promesa: no conoce promociones, cambios de calendario ni eventos únicos.');
      cExp.replaceChildren(el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Cómo se calculó'), el('p', { class: 'card-s' }, 'Explicación en lenguaje sencillo'))), lista);
    }

    function pintarComparacion(c, r) {
      const filas = r.todos.map(t => [t.nombre, t.total, t.low, t.high, t.total != null && r.refBase ? t.total / r.refBase - 1 : null, t.id]);
      const tabla = el('table', { class: 'tbl' });
      tabla.appendChild(el('thead', null, el('tr', null, ['Método', 'Cierre estimado', 'Mínimo', 'Máximo', 'vs bases'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))));
      const tb = el('tbody');
      filas.forEach(f => tb.appendChild(el('tr', { class: f[5] === r.sel.id ? 'sel' : '' },
        el('td', null, f[0] + (f[5] === r.sel.id ? ' ◀' : '')), el('td', { class: 'num' }, fmt(f[1])), el('td', { class: 'num' }, fmt(f[2])), el('td', { class: 'num' }, fmt(f[3])),
        el('td', { class: 'num' }, f[4] == null ? '–' : u.fmtSignedPct(f[4])))));
      tabla.appendChild(tb);
      const btn = el('button', { class: 'btn sm primary', type: 'button' }, 'Copiar tabla (para pegar en Excel)');
      btn.addEventListener('click', async () => {
        const txt = [['Método', 'Cierre estimado', 'Mínimo', 'Máximo', 'vs bases'], ...filas.map(f => [f[0], Math.round(f[1] || 0), Math.round(f[2] || 0), Math.round(f[3] || 0), f[4] == null ? '' : (f[4] * 100).toFixed(1) + ' %'])].map(l => l.join('\t')).join('\n');
        const ok = await u.copiarTexto(txt);
        u.toast(ok ? 'Tabla copiada. Pégala en Excel con Ctrl+V.' : 'No se pudo copiar.', { tipo: ok ? 'ok' : 'error' });
      });
      cCmp.replaceChildren(
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Todos los métodos, lado a lado'),
          el('p', { class: 'card-s' }, 'Si coinciden, la estimación es sólida; si se separan mucho, hay incertidumbre. ', RH.info.termino('Índice de crecimiento', 'indice'), ' · ', RH.info.termino('Geométrico', 'geometrico'), ' · ', RH.info.termino('Lineal', 'lineal'))),
          el('div', { class: 'card-hr' }, btn)),
        el('div', { class: 'table-wrap' }, tabla));
    }

    return {
      actualizar(lista) { snaps = lista.filter(s => !s.demo || lista.every(x => x.demo)); render(); },
      retematizar() { [cAc, cSem].forEach(x => x.h && x.h.retematizar()); }
    };
  }

  RH.proyeccionUI = { montar };
})(window.RH = window.RH || {});
