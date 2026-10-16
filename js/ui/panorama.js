/* Report Hub · Panorama general (pantalla de inicio). */
(function (RH) {
  'use strict';
  const u = RH.util, M = RH.modelo, G = RH.graf, el = u.el;

  function sparkline(cur, prev, marca, fmt) {
    const W = 300, H = 72, P = 4;
    const n = Math.max(cur.length, prev ? prev.length : 0);
    if (n < 2) return el('div', { class: 'spark-empty' });
    let max = 0;
    [cur, prev || []].forEach(a => a.forEach(v => { if (v != null) max = Math.max(max, v); }));
    if (!max) max = 1;
    const x = i => P + (i / (n - 1)) * (W - 2 * P);
    const y = v => H - P - (v / max) * (H - 2 * P - 4);
    const camino = arr => {
      let d = '', abierto = false;
      arr.forEach((v, i) => {
        if (v == null) { abierto = false; return; }
        d += (abierto ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        abierto = true;
      });
      return d.trim();
    };
    const ultimo = (() => { for (let i = cur.length - 1; i >= 0; i--) if (cur[i] != null) return i; return -1; })();
    const area = ultimo > 0 ? camino(cur.slice(0, ultimo + 1)) + ' L' + x(ultimo).toFixed(1) + ' ' + (H - P) + ' L' + x(0).toFixed(1) + ' ' + (H - P) + ' Z' : '';
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Tendencia semanal">' +
      (marca != null && marca >= 1 && marca <= n ? '<line x1="' + x(marca - 1) + '" x2="' + x(marca - 1) + '" y1="0" y2="' + H + '" class="sp-mark"/>' : '') +
      '<line x1="0" x2="' + W + '" y1="' + (H - P) + '" y2="' + (H - P) + '" class="sp-base"/>' +
      (prev ? '<path d="' + camino(prev) + '" class="sp-prev"/>' : '') +
      (area ? '<path d="' + area + '" class="sp-area"/>' : '') +
      '<path d="' + camino(cur) + '" class="sp-cur"/>' +
      (ultimo >= 0 ? '<circle cx="' + x(ultimo) + '" cy="' + y(cur[ultimo]) + '" r="3.5" class="sp-dot"/>' : '') +
      '</svg>';
    return el('div', { class: 'spark', html: svg });
  }

  function tarjetaDash(dash, snaps) {
    // en dashboards con variantes (GOWNS) la tarjeta muestra el primer producto/medida (orden alfabético)
    const variantes = dash.variantes ? M.variantes(snaps, dash.dataset) : [];
    const claveVar = variantes[0] ? variantes[0].clave : null;
    if (dash.variantes) dash = M.dashPara(dash, claveVar);
    const temps = M.temporadas(snaps, dash.dataset, claveVar);
    const pendiente = dash.estado === 'pendiente';
    const card = el('article', { class: 'card pano' + (pendiente ? ' pano-pend' : '') });
    const estado = pendiente ? ['Pendiente', 'pill-pend'] : !temps.length ? ['Sin datos', 'pill-off'] : temps[0].demo ? ['Demostración', 'pill-demo'] : ['Actualizado', 'pill-ok'];
    card.appendChild(el('header', { class: 'pano-h' },
      el('div', null, el('div', { class: 'eyebrow' }, 'Dashboard'), el('h2', { class: 'pano-t' }, dash.titulo)),
      el('span', { class: 'pill ' + estado[1] }, estado[0])));

    if (pendiente) {
      card.appendChild(el('p', { class: 'pano-desc' }, dash.descripcion));
      card.appendChild(el('div', { class: 'pano-placeholder', html: '<svg viewBox="0 0 300 72" preserveAspectRatio="none"><path d="M4 60 C60 58 80 40 120 42 S200 18 296 12" class="sp-ghost"/></svg>' }));
      card.appendChild(el('div', { class: 'pano-rows' }, el('div', { class: 'pano-row muted' }, 'Listo para conectar el tercer reporte.')));
      card.appendChild(el('footer', { class: 'pano-f' }, el('a', { class: 'btn ghost sm', href: '#/dash/' + dash.id }, 'Ver tablero')));
      return card;
    }
    if (!temps.length) {
      card.appendChild(el('p', { class: 'pano-desc' }, dash.descripcion));
      card.appendChild(el('div', { class: 'pano-placeholder', html: '<svg viewBox="0 0 300 72" preserveAspectRatio="none"><path d="M4 60 C60 58 80 40 120 42 S200 18 296 12" class="sp-ghost"/></svg>' }));
      card.appendChild(el('footer', { class: 'pano-f' },
        el('a', { class: 'btn primary sm', href: '#/reporte/' + dash.reporte }, 'Cargar datos'),
        el('a', { class: 'btn ghost sm', href: '#/dash/' + dash.id }, 'Abrir')));
      return card;
    }

    const cur = temps[0];
    const prev = temps.find(s => s.id !== cur.id && (s.week1 || '') < (cur.week1 || '')) || null;
    const metrica = dash.metricas.find(m => m.id === dash.principal);
    const optsDe = s => { const o = {}; (dash.opciones || []).forEach(op => { o[op.id] = !!(s && s.meta && s.meta.config && s.meta.config[op.id]); }); return o; };
    const opts = optsDe(cur), optsP = optsDe(prev);
    const ult = M.ultimaSemana(cur), ultP = M.ultimaSemana(prev);
    const ws = u.rango(1, ult);
    const tc = M.total(cur, metrica, ws, null, opts);
    const tp = prev ? M.total(prev, metrica, ws.filter(w => w <= ultP), null, optsP) : null;
    const p = tc && tp ? u.variacion(tc.v, tp.v) : null;

    card.appendChild(el('div', { class: 'pano-hero' },
      el('div', { class: 'pano-l' }, metrica.etiqueta + ' · temporada ' + cur.season + ' a la fecha (semanas 1–' + ult + ')'),
      el('div', { class: 'pano-v' }, u.fmtInt(tc && tc.v)),
      p != null ? el('div', { class: 'kpi-d ' + (p > 0 ? 'up' : p < 0 ? 'down' : 'flat') },
        el('span', { class: 'kpi-arrow', 'aria-hidden': 'true' }, p > 0 ? '▲' : p < 0 ? '▼' : '■'),
        el('span', null, u.fmtSignedPct(p)), el('span', { class: 'kpi-ds' }, 'vs ' + prev.season + ' a la misma semana (' + u.fmtInt(tp.v) + ')')) :
        el('div', { class: 'kpi-n' }, prev ? '' : 'Agrega la temporada anterior para comparar')));

    const maxW = Math.max(ult, ultP);
    const serie = s => s ? u.rango(1, maxW).map(w => { const m = M.medir(metrica, M.agregado(s, w, null), optsDe(s)); return m ? m.v : null; }) : null;
    const sc = serie(cur), sp = serie(prev);
    card.appendChild(sparkline(sc, sp, M.semanaHoy(cur), 'int'));
    card.appendChild(el('div', { class: 'spark-lg' },
      el('span', null, el('i', { class: 'k-cur' }), 'Temporada ' + cur.season),
      prev ? el('span', null, el('i', { class: 'k-prev' }), 'Temporada ' + prev.season) : null));

    // última semana completa
    const parcial = M.semanaParcial(cur);
    const wC = parcial ? parcial.semana - 1 : ult;
    const filas = el('div', { class: 'pano-rows' });
    if (wC >= 1) {
      const a = sc[wC - 1], b = sp ? sp[wC - 1] : null;
      const d = u.variacion(a, b);
      filas.appendChild(el('div', { class: 'pano-row' },
        el('span', null, 'Última semana completa (S' + wC + ')'),
        el('strong', null, u.fmtInt(a)),
        d != null ? el('span', { class: 'delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') }, u.fmtSignedPct(d)) : el('span')));
    }
    if (parcial) {
      filas.appendChild(el('div', { class: 'pano-row' },
        el('span', null, 'Semana en curso (S' + parcial.semana + ')'),
        el('strong', null, u.fmtInt(sc[parcial.semana - 1])),
        el('span', { class: 'muted' }, 'parcial')));
    }
    const mPart = dash.participacion ? dash.metricas.find(m => m.id === dash.participacion) : null;
    if (mPart) {
      const sh = M.total(cur, mPart, ws, null, opts), shp = prev ? M.total(prev, mPart, ws.filter(w => w <= ultP), null, optsP) : null;
      const dd = sh && shp && sh.v != null && shp.v != null ? sh.v - shp.v : null;
      filas.appendChild(el('div', { class: 'pano-row' },
        el('span', null, mPart.etiqueta),
        el('strong', null, u.fmtPct(sh && sh.v)),
        dd != null ? el('span', { class: 'delta ' + (dd > 0 ? 'up' : dd < 0 ? 'down' : 'flat') }, u.fmtPp(dd)) : el('span')));
    }
    card.appendChild(filas);
    // cada temporada se calcula con la opción con que se procesó: si difieren, la variación mezcla criterios
    const distintas = prev ? (dash.opciones || []).filter(o => opts[o.id] !== optsP[o.id]) : [];
    if (distintas.length) {
      card.appendChild(el('p', { class: 'pano-warn', title: 'Ábrelo en el dashboard y usa el interruptor para calcular las dos temporadas con la misma opción.' },
        '⚠ ' + distintas.map(o => '«' + o.etiqueta + '»: ' + cur.season + ' = ' + (opts[o.id] ? 'Sí' : 'No') + ', ' + prev.season + ' = ' + (optsP[o.id] ? 'Sí' : 'No')).join(' · ') +
        '. La variación compara criterios distintos.'));
    }
    card.appendChild(el('footer', { class: 'pano-f' },
      el('span', { class: 'muted small' }, cur.demo ? 'Datos de demostración' : 'Actualizado ' + u.fmtFechaHora((cur.meta && cur.meta.procesado) || cur.updatedAt)),
      el('a', { class: 'btn primary sm', href: '#/dash/' + dash.id }, 'Abrir dashboard →')));
    return card;
  }

  function montar(cont) {
    const raiz = el('div', { class: 'pano-view' });
    cont.replaceChildren(raiz);
    let snaps = [];

    async function render() {
      const reg = RH.registro;
      const reales = snaps.filter(s => !s.demo);
      // semana actual según la temporada más reciente
      const recientes = snaps.slice().sort((a, b) => (b.week1 || '').localeCompare(a.week1 || ''));
      const ref = recientes[0];
      const week1 = ref ? ref.week1 : RH.demo.inicioTemporada(RH.demo.temporadaActual());
      const temporada = ref ? ref.season : String(RH.demo.temporadaActual());
      const wHoy = u.weekOf(week1, u.hoyIso());
      const lunes = u.weekMonday(week1, wHoy);

      const hoy = new Date();
      const saludo = hoy.getHours() < 12 ? 'Buenos días' : hoy.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
      const encabezado = el('header', { class: 'page-head pano-head' },
        el('div', { class: 'ph-l' },
          el('div', { class: 'eyebrow' }, 'Panorama general'),
          el('h1', { class: 'ph-t' }, saludo),
          el('p', { class: 'ph-sub' }, 'Resumen de los tres tableros con la información más reciente. Elige uno para analizar por rangos de semanas o una semana puntual.')),
        el('div', { class: 'week-badge', title: 'Semana calculada con el lunes de la semana 1 de la temporada ' + temporada },
          el('div', { class: 'wb-l' }, 'Hoy · temporada ' + temporada),
          el('div', { class: 'wb-v' }, wHoy >= 1 ? 'Semana ' + wHoy : 'Pretemporada'),
          el('div', { class: 'wb-d' }, wHoy >= 1 ? u.fmtRango(lunes, u.addDays(lunes, 6)) : '')));

      const demo = snaps.some(s => s.demo);
      const banner = demo ? el('div', { class: 'banner banner-demo' }, el('strong', null, 'DEMOSTRACIÓN · '),
        'Algunos tableros muestran datos ficticios. ', el('a', { href: '#/datos' }, 'Quitar demostración')) : null;

      const grid = el('div', { class: 'pano-grid' }, reg.dashboards.map(d => tarjetaDash(d, snaps)));

      // actividad reciente
      const act = el('section', { class: 'card span-7' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Actividad reciente'), el('p', { class: 'card-s' }, 'Últimas temporadas procesadas o importadas'))));
      const lista = el('ul', { class: 'act-list' });
      const orden = snaps.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6);
      if (!orden.length) lista.appendChild(el('li', { class: 'muted' }, 'Todavía no hay actividad. Procesa un reporte para empezar.'));
      orden.forEach(s => {
        const d = reg.dashboardDeDataset(s.dataset);
        const origen = { compartida: 'Base compartida', excel: 'Excel', demo: 'Demostración' }[s.meta && s.meta.origen] || 'Procesado en esta computadora';
        lista.appendChild(el('li', { class: 'act' },
          el('span', { class: 'act-dot ' + (s.demo ? 'dot-demo' : 'dot-ok') }),
          el('div', { class: 'act-b' },
            el('div', null, el('strong', null, (d ? d.titulo : s.dataset) + ' · Temporada ' + s.season), el('span', { class: 'muted' }, ' · ' + M.ultimaSemana(s) + ' semanas')),
            el('div', { class: 'muted small' }, origen + ' · ' + u.fmtFechaHora((s.meta && s.meta.procesado) || s.updatedAt) + (s.meta && s.meta.archivo && s.meta.archivo.nombre && !s.demo ? ' · ' + s.meta.archivo.nombre : ''))),
          d ? el('a', { class: 'act-go', href: '#/dash/' + d.id, 'aria-label': 'Abrir ' + d.titulo }, '→') : null));
      });
      act.appendChild(lista);

      // estado de la base
      const v = RH.dbx.vinculo;
      const comp = await RH.store.ajuste('compartida', null);
      const base = el('section', { class: 'card span-5' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Base de datos'), el('p', { class: 'card-s' }, 'Dónde viven tus datos'))),
        el('ul', { class: 'db-stat' },
          el('li', null, el('span', null, 'Temporadas guardadas'), el('strong', null, String(reales.length))),
          el('li', null, el('span', null, 'Excel vinculado'), el('strong', null,
            v.estado === 'ok' ? '✓ ' + v.nombre : v.estado === 'permiso' ? 'Requiere reconectar' : v.estado === 'error' ? 'Con error' : v.estado === 'no-soportado' ? 'No disponible en este navegador' : 'No vinculado')),
          el('li', null, el('span', null, 'Base compartida del equipo'), el('strong', null,
            comp && comp.estado === 'ok' ? '✓ ' + (comp.temporadas || []).length + ' temporada(s)' : comp && comp.estado === 'error' ? 'Con error' : 'No publicada'))),
        el('div', { class: 'card-actions' }, el('a', { class: 'btn sm', href: '#/datos' }, 'Administrar base de datos')));

      raiz.replaceChildren(...[encabezado, banner, grid, el('div', { class: 'grid' }, act, base)].filter(Boolean));
    }

    return { actualizar(lista) { snaps = lista; render(); }, retematizar() {} };
  }

  RH.panorama = { montar };
})(window.RH = window.RH || {});
