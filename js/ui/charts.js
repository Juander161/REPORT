/* Report Hub · gráficas.
   Cada gráfica se describe con un "spec" independiente de la librería:
     { id, tipo:'col'|'line'|'barH'|'colStacked'|'diverging', titulo, subtitulo,
       categorias[], categoriasLargas[], notas[], ejeX, formato:'int'|'pct'|'dInt'|'dPct',
       series:[{nombre, valores[], rol:'cur'|'prev'|'cat', cat?:n, area?:bool}],
       resaltar?: índice, delta?: bool, total?: bool, archivo: 'nombre' }
   Con el mismo spec se dibuja en pantalla (Chart.js), se exporta a PNG, se copia
   como tabla para Excel y se genera un .xlsx con la gráfica NATIVA de Excel. */
(function (RH) {
  'use strict';
  const u = RH.util;

  const EXPORTAR = {
    cur: '#1f6fd1', prev: '#7f93b0', pos: '#1f6fd1', neg: '#e34948', otros: '#9aa3b2',
    grid: '#e6e9ee', axis: '#c3c8d1', text1: '#0f1b2d', text2: '#4a5568', text3: '#6b7789', surface: '#ffffff',
    banda: 'rgba(31,111,209,0.07)',
    cats: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
  };

  function tema() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    return {
      cur: g('--c-cur', EXPORTAR.cur), prev: g('--c-prev', EXPORTAR.prev),
      pos: g('--c-pos', EXPORTAR.pos), neg: g('--c-neg', EXPORTAR.neg), otros: g('--c-otros', EXPORTAR.otros),
      grid: g('--c-grid', EXPORTAR.grid), axis: g('--c-axis', EXPORTAR.axis),
      text1: g('--text-1', EXPORTAR.text1), text2: g('--text-2', EXPORTAR.text2), text3: g('--text-3', EXPORTAR.text3),
      surface: g('--surface', EXPORTAR.surface), banda: g('--c-banda', EXPORTAR.banda),
      cats: [1, 2, 3, 4, 5, 6, 7, 8].map(i => g('--cat-' + i, EXPORTAR.cats[i - 1]))
    };
  }

  function alpha(color, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    if (!m) return color;
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function colorSerie(s, T) {
    if (s.rol === 'cur') return T.cur;
    if (s.rol === 'prev') return T.prev;
    if (s.rol === 'otros') return T.otros;
    if (s.rol === 'cat') return T.cats[(s.cat || 0) % T.cats.length];
    return T.cur;
  }

  function fmtValor(v, f) {
    if (v == null || !isFinite(v)) return '–';
    switch (f) {
      case 'pct': return u.fmtPct(v);
      case 'dPct': return u.fmtSignedPct(v);
      case 'dInt': return u.fmtSignedInt(v);
      case 'pp': return u.fmtPp(v);
      case 'dec': return u.fmtDec(v);
      default: return u.fmtInt(v);
    }
  }
  function fmtTick(v, f) {
    if (f === 'pct' || f === 'dPct') return Math.round(v * 1000) / 10 + ' %';
    if (f === 'pp') return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v * 1000) / 10) + ' pp';
    if (f === 'dInt') return (v > 0 ? '+' : v < 0 ? '−' : '') + u.fmtCompact(Math.abs(v));
    return u.fmtCompact(v);
  }

  // ---------------------------------------------------------------- plugins propios
  const pluginBanda = {
    id: 'rhBanda',
    beforeDatasetsDraw(chart, args, o) {
      if (o == null || o.indice == null) return;
      const horizontal = chart.options.indexAxis === 'y';
      const esc = horizontal ? chart.scales.y : chart.scales.x;
      const n = chart.data.labels.length;
      if (!esc || !n) return;
      const pos = esc.getPixelForValue(o.indice);
      const paso = (horizontal ? esc.height : esc.width) / n;
      const { ctx, chartArea: a } = chart;
      ctx.save();
      ctx.fillStyle = o.color;
      if (horizontal) ctx.fillRect(a.left, pos - paso / 2, a.right - a.left, paso);
      else ctx.fillRect(pos - paso / 2, a.top, paso, a.bottom - a.top);
      ctx.restore();
    }
  };
  const pluginCruz = {
    id: 'rhCruz',
    afterDatasetsDraw(chart, args, o) {
      if (!o || !o.activo) return;
      const act = chart.tooltip && chart.tooltip.getActiveElements && chart.tooltip.getActiveElements();
      if (!act || !act.length) return;
      const x = act[0].element.x;
      const { ctx, chartArea: a } = chart;
      ctx.save();
      ctx.strokeStyle = o.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, a.top); ctx.lineTo(Math.round(x) + 0.5, a.bottom); ctx.stroke();
      ctx.restore();
    }
  };
  const pluginFondo = {
    id: 'rhFondo',
    beforeDraw(chart, args, o) {
      if (!o || !o.color) return;
      const { ctx, width, height } = chart;
      ctx.save(); ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = o.color; ctx.fillRect(0, 0, width, height); ctx.restore();
    },
    afterDraw(chart, args, o) {
      if (!o || !o.pie) return;
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#8a94a6'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(o.pie, width - 24, height - 8);
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------- config Chart.js
  function config(spec, T, exp, h) {
    const horizontal = spec.tipo === 'barH';
    const linea = spec.tipo === 'line';
    const apilada = spec.tipo === 'colStacked';
    const div = spec.tipo === 'diverging';
    const hi = spec.resaltar;
    const n = spec.categorias.length;
    const tenue = exp ? 0.35 : 0.28;

    const datasets = spec.series.map((s, k) => {
      const color = colorSerie(s, T);
      if (linea) {
        return {
          label: s.nombre, data: s.valores.slice(),
          borderColor: color, backgroundColor: s.area ? alpha(color, 0.10) : color,
          fill: s.area ? 'origin' : false, borderWidth: exp ? 2.5 : 2, tension: 0.25,
          borderCapStyle: 'round', borderJoinStyle: 'round',
          pointRadius: s.valores.map((v, i) => (i === hi || n === 1 || (hi == null && i === lastIdx(s.valores) && s.rol === 'cur')) ? 4 : 0),
          pointHoverRadius: 5, pointBackgroundColor: color, pointBorderColor: T.surface, pointBorderWidth: 2,
          pointHitRadius: 12, spanGaps: false, order: s.rol === 'cur' ? 0 : 1
        };
      }
      let bg;
      if (div) bg = s.valores.map((v, i) => { const c = v < 0 ? T.neg : T.pos; return hi != null && i !== hi ? alpha(c, tenue) : c; });
      else if (hi != null) bg = s.valores.map((v, i) => i === hi ? color : alpha(color, tenue));
      else bg = color;
      return {
        label: s.nombre, data: s.valores.slice(), backgroundColor: bg,
        borderRadius: apilada ? 0 : 4, borderSkipped: 'start',
        borderWidth: apilada ? { top: 2, right: 0, bottom: 0, left: 0 } : 0,
        borderColor: T.surface,
        maxBarThickness: horizontal ? 18 : 24,
        categoryPercentage: horizontal ? 0.74 : 0.72, barPercentage: apilada ? 0.92 : 0.86
      };
    });

    const fsz = exp ? 13 : 11;
    const ejeValor = {
      beginAtZero: true, stacked: apilada,
      grid: { color: ctx => (div && ctx.tick && ctx.tick.value === 0) ? T.axis : T.grid, drawTicks: false, lineWidth: 1 },
      border: { display: false },
      ticks: { color: T.text3, font: { size: fsz }, padding: 8, maxTicksLimit: 6, precision: (spec.formato === 'int' || spec.formato === 'dInt') ? 0 : undefined, callback: v => fmtTick(v, spec.formato) }
    };
    const ejeCat = {
      stacked: apilada,
      grid: { display: false },
      border: { display: true, color: T.axis },
      ticks: { color: T.text3, font: { size: fsz }, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 }
    };
    if (horizontal) {
      ejeCat.ticks.callback = function (val) {
        const l = String(this.getLabelForValue(val));
        return l.length > 24 ? l.slice(0, 23) + '…' : l;
      };
      ejeCat.border.display = false;
    }

    const plugins = {
      legend: { display: false },
      tooltip: { enabled: false },
      rhBanda: { indice: hi, color: T.banda },
      rhCruz: { activo: linea && !exp, color: T.axis },
      rhFondo: exp ? { color: '#ffffff', pie: 'Report Hub · ' + u.fmtFecha(u.hoyIso()) } : {}
    };
    if (h) plugins.tooltip.external = tooltipExterno(h);

    if (exp) {
      plugins.title = { display: true, text: spec.titulo, align: 'start', color: T.text1, font: { size: 20, weight: '600' }, padding: { top: 0, bottom: 4 } };
      plugins.subtitle = { display: !!spec.subtitulo, text: spec.subtitulo || '', align: 'start', color: T.text2, font: { size: 13 }, padding: { bottom: 12 } };
      const items = leyendaItems(spec, T);
      plugins.legend = {
        display: items.length > 1, position: 'top', align: 'start',
        labels: {
          color: T.text2, font: { size: 13 }, boxWidth: linea ? 18 : 12, boxHeight: linea ? 3 : 12, padding: 16,
          generateLabels: () => items.map((it, i) => ({ text: it.texto, fillStyle: it.color, strokeStyle: it.color, lineWidth: 0, hidden: false, datasetIndex: i }))
        },
        onClick: () => {}
      };
    }

    return {
      type: linea ? 'line' : 'bar',
      data: { labels: spec.categorias.slice(), datasets },
      options: {
        responsive: !exp, maintainAspectRatio: false,
        animation: exp ? false : { duration: 380, easing: 'easeOutCubic' },
        indexAxis: horizontal ? 'y' : 'x',
        interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
        layout: { padding: exp ? { left: 20, right: 28, top: 18, bottom: 30 } : { top: 6, right: 6 } },
        plugins,
        scales: horizontal ? { x: ejeValor, y: ejeCat } : { x: ejeCat, y: ejeValor },
        font: { family: '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif' }
      },
      plugins: [pluginBanda, pluginCruz, pluginFondo]
    };
  }

  function lastIdx(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i; return -1; }

  function leyendaItems(spec, T) {
    if (spec.tipo === 'diverging') return [{ texto: 'Aumento', color: T.pos, forma: 'rect' }, { texto: 'Disminución', color: T.neg, forma: 'rect' }];
    return spec.series.map(s => ({ texto: s.nombre, color: colorSerie(s, T), forma: spec.tipo === 'line' ? 'linea' : 'rect' }));
  }

  // ---------------------------------------------------------------- tooltip HTML
  function tooltipExterno(h) {
    return ({ chart, tooltip }) => {
      const tip = h.tip, spec = h.spec;
      if (!tip) return;
      if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) { tip.classList.remove('on'); return; }
      const T = tema();
      const i = tooltip.dataPoints[0].dataIndex;
      const linea = spec.tipo === 'line';
      tip.replaceChildren();
      tip.appendChild(u.el('div', { class: 'tt-t' }, (spec.categoriasLargas || spec.categorias)[i]));
      if (spec.notas && spec.notas[i]) tip.appendChild(u.el('div', { class: 'tt-n' }, spec.notas[i]));
      let filas = 0;
      spec.series.forEach((s, k) => {
        if (!chart.isDatasetVisible(k)) return;
        const v = s.valores[i];
        if (spec.tipo === 'colStacked' && !v) return;
        const color = spec.tipo === 'diverging' ? (v < 0 ? T.neg : T.pos) : colorSerie(s, T);
        tip.appendChild(u.el('div', { class: 'tt-r' },
          u.el('span', { class: 'tt-k ' + (linea ? 'ln' : 'bx'), style: { background: color } }),
          u.el('strong', null, fmtValor(v, spec.formato)),
          u.el('span', { class: 'tt-s' }, s.nombre)));
        filas++;
      });
      if (spec.tipo === 'colStacked' && filas > 1) {
        const tot = u.sum(spec.series.map(s => s.valores[i]));
        tip.appendChild(u.el('div', { class: 'tt-d' }, u.el('span', null, 'Total'), u.el('strong', null, fmtValor(tot, spec.formato))));
      }
      if (spec.delta && spec.series.length === 2) {
        const a = spec.series[0].valores[i], b = spec.series[1].valores[i];
        if (a != null && b != null) {
          let txt, signo = b - a;
          if (spec.formato === 'pct') txt = u.fmtPp(b - a);
          else { const p = u.variacion(b, a); txt = u.fmtSignedInt(b - a) + (p != null ? '  (' + u.fmtSignedPct(p) + ')' : ''); }
          tip.appendChild(u.el('div', { class: 'tt-d ' + (signo > 0 ? 'up' : signo < 0 ? 'down' : '') },
            u.el('span', null, 'Variación'), u.el('strong', null, (signo > 0 ? '▲ ' : signo < 0 ? '▼ ' : '') + txt)));
        }
      }
      tip.classList.add('on');
      const cw = h.caja.clientWidth, ch = h.caja.clientHeight;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = tooltip.caretX + 14, y = tooltip.caretY - th / 2;
      if (x + tw > cw - 4) x = tooltip.caretX - tw - 14;
      x = u.clamp(x, 0, Math.max(0, cw - tw));
      y = u.clamp(y, 0, Math.max(0, ch - th));
      tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    };
  }

  // ---------------------------------------------------------------- instancia en pantalla
  function crear(caja, spec, leyenda) {
    const h = { spec, caja, chart: null, leyenda };
    function montar() {
      const canvas = u.el('canvas', { role: 'img', 'aria-label': spec.titulo });
      const tip = u.el('div', { class: 'viz-tip', 'aria-hidden': 'true' });
      caja.replaceChildren(canvas, tip);
      h.tip = tip;
      h.chart = new Chart(canvas, config(h.spec, tema(), false, h));
      canvas.addEventListener('mouseleave', () => tip.classList.remove('on'));
    }
    h.actualizar = nuevo => {
      const cambiaTipo = (nuevo.tipo === 'line') !== (h.spec.tipo === 'line') || nuevo.tipo !== h.spec.tipo;
      h.spec = nuevo;
      if (!h.chart || cambiaTipo) { if (h.chart) h.chart.destroy(); montar(); }
      else {
        const c = config(nuevo, tema(), false, h);
        h.chart.data.labels = c.data.labels;
        // conserva la visibilidad elegida en la leyenda
        c.data.datasets.forEach((d, i) => { if (h.chart.data.datasets[i] && h.chart.getDatasetMeta(i).hidden != null) d.hidden = h.chart.getDatasetMeta(i).hidden; });
        h.chart.data.datasets = c.data.datasets;
        h.chart.options = c.options;
        h.chart.update();
      }
      pintarLeyenda(h);
    };
    h.retematizar = () => { if (h.chart) { h.chart.destroy(); h.chart = null; } montar(); pintarLeyenda(h); };
    h.destruir = () => { if (h.chart) h.chart.destroy(); h.chart = null; };
    montar();
    pintarLeyenda(h);
    return h;
  }

  function pintarLeyenda(h) {
    if (!h.leyenda) return;
    const T = tema();
    const items = leyendaItems(h.spec, T);
    h.leyenda.replaceChildren();
    if (items.length < 2) return;
    const toggle = h.spec.tipo !== 'diverging';
    items.forEach((it, i) => {
      const b = u.el(toggle ? 'button' : 'span', { class: 'lg-i', type: toggle ? 'button' : null, 'aria-pressed': toggle ? 'true' : null },
        u.el('span', { class: 'lg-k ' + (it.forma === 'linea' ? 'ln' : 'bx'), style: { background: it.color } }), it.texto);
      if (toggle) {
        if (h.chart && h.chart.getDatasetMeta(i).hidden) { b.classList.add('off'); b.setAttribute('aria-pressed', 'false'); }
        b.addEventListener('click', () => {
          const vis = h.chart.isDatasetVisible(i);
          h.chart.setDatasetVisibility(i, !vis);
          h.chart.update();
          b.classList.toggle('off', vis);
          b.setAttribute('aria-pressed', String(!vis));
        });
      }
      h.leyenda.appendChild(b);
    });
  }

  // ---------------------------------------------------------------- exportar imagen
  async function png(spec, o) {
    o = o || {};
    const W = o.ancho || (spec.tipo === 'barH' ? 1000 : 1200);
    const H = o.alto || (spec.tipo === 'barH' ? Math.max(420, 140 + spec.categorias.length * 46) : 560);
    const host = u.el('div', { style: { position: 'fixed', left: '-30000px', top: '0', width: W + 'px', height: H + 'px', pointerEvents: 'none' } });
    const cv = u.el('canvas', { width: W, height: H, style: { width: W + 'px', height: H + 'px' } });
    host.appendChild(cv);
    document.body.appendChild(host);
    try {
      const cfg = config(Object.assign({}, spec), EXPORTAR, true, null);
      cfg.options.devicePixelRatio = 2;
      const ch = new Chart(cv, cfg);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      ch.destroy();
      return blob;
    } finally { host.remove(); }
  }

  async function copiarImagen(spec) {
    const ok = await u.copiarImagen(png(spec));
    if (ok) u.toast('Imagen copiada. Pégala en Excel, Word, PowerPoint o el correo con Ctrl+V.', { tipo: 'ok' });
    else { await descargarPng(spec); u.toast('Tu navegador no permite copiar imágenes; se descargó el PNG.', { tipo: 'warn' }); }
  }
  async function descargarPng(spec) {
    const b = await png(spec);
    u.descargar(b, u.nombreArchivo(spec.archivo || spec.titulo) + '.png');
  }

  // ---------------------------------------------------------------- tabla (pantalla, TSV, HTML)
  function columnas(spec) {
    const cols = [{ nombre: spec.ejeX || 'Categoría', formato: 'txt', valores: spec.categoriasLargas || spec.categorias }];
    spec.series.forEach(s => cols.push({ nombre: s.nombre, formato: spec.formato, valores: s.valores }));
    if (spec.delta && spec.series.length === 2) {
      const a = spec.series[0].valores, b = spec.series[1].valores;
      if (spec.formato === 'pct') cols.push({ nombre: 'Variación (pp)', formato: 'pp', valores: a.map((v, i) => v != null && b[i] != null ? b[i] - v : null), delta: true });
      else {
        cols.push({ nombre: 'Variación', formato: 'dInt', valores: a.map((v, i) => v != null && b[i] != null ? b[i] - v : null), delta: true });
        cols.push({ nombre: 'Variación %', formato: 'dPct', valores: a.map((v, i) => u.variacion(b[i], v)), delta: true });
      }
    }
    (spec.extras || []).forEach(e => cols.push(e));
    return cols;
  }

  function tsvValor(v, f) {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '';
    if (f === 'pct' || f === 'dPct') return (Math.round(v * 10000) / 100) + '%';
    if (f === 'pp') return String(Math.round(v * 1000) / 10);
    if (typeof v === 'number') return String(Math.round(v * 100) / 100);
    return String(v).replace(/[\t\n\r]+/g, ' ');
  }
  const MSO = { int: '\\#\\,\\#\\#0', dInt: '\\+\\#\\,\\#\\#0\\;\\-\\#\\,\\#\\#0\\;0', pct: '0\\.0%', dPct: '\\+0\\.0%\\;\\-0\\.0%\\;0\\.0%', pp: '\\+0\\.0\\;\\-0\\.0\\;0\\.0', dec: '\\#\\,\\#\\#0\\.0' };

  function tabla(spec) {
    const cols = columnas(spec);
    const n = spec.categorias.length;
    const tsv = [cols.map(c => c.nombre).join('\t')];
    for (let i = 0; i < n; i++) tsv.push(cols.map(c => tsvValor(c.valores[i], c.formato)).join('\t'));

    const th = 'background:#0f2a4a;color:#fff;font-weight:bold;padding:4px 8px;border:1px solid #c3c8d1;';
    let html = '<table style="border-collapse:collapse;font-family:Calibri,Segoe UI,sans-serif;font-size:11pt">';
    if (spec.titulo) html += '<tr><td colspan="' + cols.length + '" style="font-weight:bold;font-size:13pt;color:#0f2a4a">' + u.esc(spec.titulo) + '</td></tr>';
    if (spec.subtitulo) html += '<tr><td colspan="' + cols.length + '" style="color:#4a5568">' + u.esc(spec.subtitulo) + '</td></tr>';
    html += '<tr>' + cols.map(c => '<th style="' + th + '">' + u.esc(c.nombre) + '</th>').join('') + '</tr>';
    for (let i = 0; i < n; i++) {
      html += '<tr>' + cols.map(c => {
        const v = c.valores[i];
        if (c.formato === 'txt') return '<td style="border:1px solid #e5e7eb;padding:3px 8px">' + u.esc(v) + '</td>';
        if (v == null || !isFinite(v)) return '<td style="border:1px solid #e5e7eb"></td>';
        const val = c.formato === 'pp' ? Math.round(v * 1000) / 10 : v;
        return '<td style="border:1px solid #e5e7eb;padding:3px 8px;text-align:right;mso-number-format:\'' + (MSO[c.formato] || MSO.int) + '\'">' + val + '</td>';
      }).join('') + '</tr>';
    }
    html += '</table>';
    return { cols, tsv: tsv.join('\n'), html };
  }

  function tablaDom(spec) {
    const { cols } = tabla(spec);
    const n = spec.categorias.length;
    const t = u.el('table', { class: 'tbl' });
    t.appendChild(u.el('thead', null, u.el('tr', null, cols.map((c, j) => u.el('th', { class: j ? 'num' : '' }, c.nombre)))));
    const tb = u.el('tbody');
    for (let i = 0; i < n; i++) {
      const tr = u.el('tr', { class: spec.resaltar === i ? 'hl' : '' });
      cols.forEach((c, j) => {
        const v = c.valores[i];
        const td = u.el('td', { class: j ? 'num' : '' }, c.formato === 'txt' ? String(v) : fmtValor(v, c.formato));
        if (c.delta && v != null && isFinite(v)) td.classList.add(v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    return t;
  }

  async function copiarDatos(spec) {
    const { tsv, html } = tabla(spec);
    const ok = await u.copiarTabla(tsv, html);
    u.toast(ok ? 'Datos copiados. En Excel selecciona una celda y pega (Ctrl+V).' : 'No se pudo copiar al portapapeles.', { tipo: ok ? 'ok' : 'error' });
  }

  // ---------------------------------------------------------------- Excel con gráfica nativa
  const ESTILO_FMT = { int: 'int', pct: 'pct', dInt: 'dInt', dPct: 'dPct', pp: 'pp', dec: 'dec' };
  const TOT_FMT = { int: 'totInt', pct: 'totPct', dInt: 'totDInt', dPct: 'totDPct', pp: 'totPp', dec: 'totDec' };
  const hex = c => c.replace('#', '').toUpperCase();

  /** Agrega a un libro una hoja con la tabla del spec y su gráfica nativa */
  function hojaExcel(wb, spec, nombre) {
    const X = RH.xlsx;
    const h = wb.hoja(nombre || spec.titulo, { grid: false, tab: '1F3A5F' });
    const n = spec.categorias.length;
    const nS = spec.series.length;
    const C = i => X.col(i);
    const fmt = spec.formato || 'int';

    h.fila([spec.titulo], { estilo: 'titulo', alto: 26 });
    h.fila([spec.subtitulo || ''], { estilo: 'sub' });
    h.fila(['Generado con Report Hub el ' + u.fmtFechaHora(Date.now())], { estilo: 'nota' });
    h.vacia();
    const r0 = h.siguiente;            // fila de encabezados (base 0)
    const d1 = r0 + 1, d2 = r0 + n;    // filas de datos (base 0)

    // columnas extra con fórmulas vivas
    const extras = [];
    const xr = r => r + 1;             // fila base 1 para fórmulas
    if (spec.delta && nS === 2) {
      if (fmt === 'pct') {
        extras.push({ nombre: 'Variación (pp)', estilo: 'pp', f: r => '(' + C(2) + xr(r) + '-' + C(1) + xr(r) + ')*100', v: i => dif(i, 100) });
      } else {
        extras.push({ nombre: 'Variación', estilo: 'dInt', f: r => C(2) + xr(r) + '-' + C(1) + xr(r), v: i => dif(i, 1) });
        extras.push({ nombre: 'Variación %', estilo: 'dPct', f: r => 'IF(' + C(1) + xr(r) + '=0,"",' + C(2) + xr(r) + '/' + C(1) + xr(r) + '-1)', v: i => { const p = u.variacion(spec.series[1].valores[i], spec.series[0].valores[i]); return p == null ? '' : p; } });
      }
    }
    if (spec.tipo === 'diverging') {
      const k = fmt === 'pp' ? 100 : 1;
      extras.push({ nombre: 'Aumento', estilo: ESTILO_FMT[fmt], f: r => 'MAX(' + C(1) + xr(r) + ',0)', v: i => { const v = spec.series[0].valores[i]; return v == null ? null : Math.max(v, 0) * k; } });
      extras.push({ nombre: 'Disminución', estilo: ESTILO_FMT[fmt], f: r => 'MIN(' + C(1) + xr(r) + ',0)', v: i => { const v = spec.series[0].valores[i]; return v == null ? null : Math.min(v, 0) * k; } });
    }
    function dif(i, k) {
      const a = spec.series[0].valores[i], b = spec.series[1].valores[i];
      return a == null || b == null ? null : (b - a) * k;
    }

    const cab = [spec.ejeX || 'Categoría', ...spec.series.map(s => s.nombre), ...extras.map(e => e.nombre)];
    h.fila(cab, { estilo: 'header', alto: 30 });
    for (let i = 0; i < n; i++) {
      const r = d1 + i;
      const fila = [{ v: (spec.categoriasLargas || spec.categorias)[i], s: 'texto' }];
      spec.series.forEach(s => fila.push({ v: s.valores[i] == null ? null : s.valores[i] * (fmt === 'pp' ? 100 : 1), s: ESTILO_FMT[fmt] }));
      extras.forEach(e => {
        const ok = spec.series.every(s => s.valores[i] != null);
        fila.push(ok ? { v: e.v(i), f: e.f(r), s: e.estilo } : { v: null, s: e.estilo });
      });
      h.fila(fila);
    }
    const sumable = spec.total !== false && (fmt === 'int' || fmt === 'dInt') && spec.tipo !== 'line';
    let ultima = d2;
    if (sumable && n > 1) {
      const rt = d2 + 1;
      const fila = [{ v: 'Total', s: 'totTexto' }];
      spec.series.forEach((s, k) => fila.push({ v: u.sum(s.valores), f: 'SUM(' + C(k + 1) + xr(d1) + ':' + C(k + 1) + xr(d2) + ')', s: TOT_FMT[fmt] }));
      extras.forEach(e => {
        if (e.nombre === 'Variación') fila.push({ v: u.sum(spec.series[1].valores) - u.sum(spec.series[0].valores), f: C(2) + xr(rt) + '-' + C(1) + xr(rt), s: 'totDInt' });
        else if (e.nombre === 'Variación %') {
          const p = u.variacion(u.sum(spec.series[1].valores), u.sum(spec.series[0].valores));
          fila.push({ v: p == null ? '' : p, f: 'IF(' + C(1) + xr(rt) + '=0,"",' + C(2) + xr(rt) + '/' + C(1) + xr(rt) + '-1)', s: 'totDPct' });
        } else fila.push({ v: null, s: 'totTexto' });
      });
      h.fila(fila);
      ultima = rt;
    }

    h.ancho([Math.max(14, Math.min(34, Math.max(...cab.slice(0, 1).map(s => String(s).length), ...(spec.categoriasLargas || spec.categorias).map(s => String(s).length)) + 2)),
      ...cab.slice(1).map(s => Math.max(13, Math.min(24, String(s).length + 3)))]);
    h.congelar(r0 + 1, 1);

    // gráfica nativa
    const T = EXPORTAR;
    let tipo = { col: 'col', line: 'line', barH: 'bar', colStacked: 'colStacked', diverging: 'colDiverging' }[spec.tipo] || 'col';
    let series;
    if (spec.tipo === 'diverging') {
      const ci = 1 + nS + extras.length - 2;
      const k = fmt === 'pp' ? 100 : 1;
      series = [
        { nombre: 'Aumento', nombreRef: { c: ci, r: r0 }, c: ci, r1: d1, r2: d2, color: hex(T.pos), valores: spec.series[0].valores.map(v => v == null ? null : Math.max(v, 0) * k) },
        { nombre: 'Disminución', nombreRef: { c: ci + 1, r: r0 }, c: ci + 1, r1: d1, r2: d2, color: hex(T.neg), valores: spec.series[0].valores.map(v => v == null ? null : Math.min(v, 0) * k) }
      ];
    } else {
      series = spec.series.map((s, k) => ({ nombre: s.nombre, nombreRef: { c: k + 1, r: r0 }, c: k + 1, r1: d1, r2: d2, color: hex(colorSerie(s, T)), valores: fmt === 'pp' ? s.valores.map(v => v == null ? null : v * 100) : s.valores }));
    }
    const totalCols = cab.length;
    const abajo = totalCols > 7;
    const altoFilas = spec.tipo === 'barH' ? Math.max(18, Math.min(40, n * 2 + 6)) : 20;
    h.grafica({
      tipo, titulo: spec.titulo, categorias: (spec.categoriasLargas || spec.categorias).map(String),
      cat: { c: 0, r1: d1, r2: d2 }, series,
      formatoEje: (fmt === 'pct' || fmt === 'dPct') ? '0%' : fmt === 'pp' ? '+0.0" pp";-0.0" pp";0' : '#,##0',
      formatoCache: (fmt === 'pct' || fmt === 'dPct') ? '0.0%' : fmt === 'pp' ? '0.0' : '#,##0',
      ancla: abajo ? { c: 0, r: ultima + 2, w: 12, h: altoFilas } : { c: totalCols + 1, r: r0, w: 11, h: altoFilas }
    });
    return h;
  }

  async function descargarExcel(spec) {
    const wb = RH.xlsx.libro({ titulo: spec.titulo });
    hojaExcel(wb, spec, 'Datos');
    const blob = await wb.blob();
    u.descargar(blob, u.nombreArchivo(spec.archivo || spec.titulo) + '.xlsx');
    u.toast('Excel descargado con la tabla y la gráfica nativa (editable).', { tipo: 'ok' });
  }

  RH.graf = { crear, png, copiarImagen, descargarPng, tabla, tablaDom, copiarDatos, hojaExcel, descargarExcel, fmtValor, tema, colorSerie, alpha, EXPORTAR };
})(window.RH = window.RH || {});
