/* Report Hub · proyección de cierre de temporada a partir de temporadas anteriores.
   Es independiente del reporte: recibe temporadas guardadas (snapshots), una medida
   (cualquier conteo definido en el registro o cualquier campo guardado), un filtro de
   tipos y una semana de corte, y estima lo que falta por llegar.

   Todos los métodos parten de lo mismo: lo que ya llevas esta temporada hasta la semana
   de corte («a la fecha») y la forma semanal de las temporadas base.

   Métodos
   · indice     Índice de crecimiento = real a la fecha ÷ base a la misma fecha. El resto de
                cada temporada base se multiplica por ese índice (una proyección por base).
   · reciente   Igual, pero el índice se calcula solo con las últimas m semanas, para
                reaccionar a un cambio de tendencia reciente.
   · geometrico Crecimiento compuesto como en poblaciones, P = P0·(1+r)^n: r sale de los valores
                «a la misma fecha» de todas las temporadas (de la más antigua a la actual) y se
                aplica al total de la última temporada base.
   · lineal     Igual con crecimiento aritmético: se suma el incremento medio por temporada.
   · historico  Sin ajuste: el resto de la temporada se parece al promedio de las bases. */
(function (RH) {
  'use strict';
  const M = RH.modelo;

  const METODOS = [
    { id: 'indice', nombre: 'Índice de crecimiento (a la fecha)', corto: 'Índice de crecimiento', ayuda: 'Compara lo que llevas contra lo que llevaba cada temporada base a la misma semana y aplica ese índice al resto.' },
    { id: 'reciente', nombre: 'Índice de crecimiento reciente (últimas semanas)', corto: 'Índice reciente', ayuda: 'Como el anterior, pero el índice se calcula solo con las últimas semanas: reacciona más rápido a un cambio de tendencia.' },
    { id: 'geometrico', nombre: 'Crecimiento geométrico (compuesto)', corto: 'Geométrico', ayuda: 'Estilo población: tasa compuesta r entre temporadas, total = último total × (1 + r).' },
    { id: 'lineal', nombre: 'Crecimiento lineal (aritmético)', corto: 'Lineal', ayuda: 'Supone que cada temporada suma una cantidad parecida en vez de un porcentaje parecido.' },
    { id: 'historico', nombre: 'Promedio histórico (sin ajuste)', corto: 'Promedio histórico', ayuda: 'El resto de la temporada se parece al promedio de las bases, sin considerar si vas arriba o abajo.' }
  ];

  const sum = (a, d, h) => { let s = 0; for (let i = d; i <= h; i++) s += a[i - 1] || 0; return s; };   // semanas d..h (1-based)
  const prom = a => a.reduce((x, y) => x + y, 0) / a.length;

  /** Serie semanal 1..H de una temporada (null donde la temporada no tiene cobertura) */
  function semanal(snap, medida, tipos, opts, H) {
    const L = M.ultimaSemana(snap);
    const out = [];
    for (let w = 1; w <= H; w++) {
      if (w > L) { out.push(null); continue; }
      const agg = M.agregado(snap, w, tipos);
      out.push(agg ? medida(agg, opts || {}) : 0);
    }
    return out;
  }

  /**
   * entrada: { cur, bases[], medida:(agg,opts)=>n, tipos:Set|null, optsCur, optsBase(s)=>opts,
   *            k, H, metodo, ventana }
   */
  function calcular(e) {
    const cur = e.cur;
    const bases = e.bases.slice().sort((a, b) => (a.week1 || '').localeCompare(b.week1 || ''));
    const Lc = M.ultimaSemana(cur);
    const k = Math.max(1, Math.min(e.k || Lc, Lc));
    const H = Math.max(k, Math.min(M.MAX_SEMANA, e.H || Math.max(k, ...bases.map(b => M.ultimaSemana(b)))));
    const wc = semanal(cur, e.medida, e.tipos, e.optsCur, H);
    const real = wc.slice(0, k).map(v => v || 0);
    // lo previo a la semana 1 (N/A) se suma como «semana 0»
    const naDe = (snap, o) => { if (!e.incluirNA || !M.tieneNA(snap)) return 0; const a = M.agregado(snap, 0, e.tipos); return a ? e.medida(a, o || {}) : 0; };
    const naC = naDe(cur, e.optsCur);
    const ytd = sum(real, 1, k) + naC;
    const m = Math.max(1, Math.min(e.ventana || 4, k));

    const B = bases.map(b => {
      const w = semanal(b, e.medida, e.tipos, e.optsBase ? e.optsBase(b) : e.optsCur, H);
      const L = M.ultimaSemana(b);
      const naB = naDe(b, e.optsBase ? e.optsBase(b) : e.optsCur);
      return { snap: b, season: b.season, w, L, cubre: L >= k, total: sum(w, 1, H) + naB, ytd: sum(w, 1, k) + naB, naB };
    });
    const util = B.filter(b => b.cubre);
    const notas = [];
    if (bases.length && util.length < bases.length) notas.push('Se omitieron ' + (bases.length - util.length) + ' temporada(s) base que no llegan a la semana ' + k + '.');

    // forecast semanal (semanas k+1..H) a partir de una "ruta" factor × forma de la base
    const ruta = (b, factor) => { const f = []; for (let w = k + 1; w <= H; w++) f.push(factor * (b.w[w - 1] || 0)); return f; };
    const total = f => ytd + f.reduce((x, y) => x + y, 0);

    function metodo(id) {
      const caminos = [];     // {etiqueta, f[]}
      let detalle = '';
      if (id === 'indice' || id === 'reciente' || id === 'historico') {
        util.forEach(b => {
          let g = 1, ok = true;
          if (id === 'indice') { ok = b.ytd > 0; g = ok ? ytd / b.ytd : 0; }
          if (id === 'reciente') {
            const rc = sum(real, k - m + 1, k), rb = sum(b.w, k - m + 1, k);
            ok = rb > 0; g = ok ? rc / rb : 0;
          }
          if (ok) caminos.push({ etiqueta: b.season, g, f: ruta(b, g) });
        });
        if (id !== 'historico' && util.length && !caminos.length) notas.push('Las temporadas base valen 0 en el periodo de referencia: no se puede calcular el índice.');
        if (caminos.length) {
          const gm = prom(caminos.map(c => c.g));
          detalle = id === 'historico' ? 'Sin ajuste de crecimiento.' : 'Índice promedio ' + gm.toFixed(3) + ' (' + (gm >= 1 ? '+' : '') + ((gm - 1) * 100).toFixed(1) + ' %)' + (id === 'reciente' ? ' con las últimas ' + m + ' semanas' : ' a la semana ' + k) + '.';
        }
      } else if (util.length) {
        const ult = util[util.length - 1];
        const Y = util.map(b => b.ytd).concat([ytd]);
        const n = Y.length - 1;
        const resto = ult.total - ult.ytd;
        const traza = (Test, etiqueta) => {
          const T = Math.max(Test, ytd);
          const falta = T - ytd;
          return { etiqueta, f: resto > 0 ? ruta(ult, falta / resto) : Array.from({ length: H - k }, () => falta / Math.max(1, H - k)) };
        };
        if (id === 'geometrico' && Y[0] > 0 && Y[n] >= 0) {
          const r = Math.pow(Y[n] / Y[0], 1 / n) - 1;
          caminos.push(traza(ult.total * (1 + r), 'Tasa compuesta ' + (r * 100).toFixed(1) + ' %'));
          const pasos = []; for (let i = 0; i < n; i++) if (Y[i] > 0) pasos.push(Y[i + 1] / Y[i]);
          if (pasos.length > 1) { caminos.push(traza(ult.total * Math.min(...pasos), 'Tasa mínima histórica')); caminos.push(traza(ult.total * Math.max(...pasos), 'Tasa máxima histórica')); }
          detalle = 'Tasa compuesta r = ' + (r * 100).toFixed(1) + ' % por temporada (' + n + ' periodo' + (n > 1 ? 's' : '') + '); total = ' + ult.season + ' × (1 + r).';
        } else if (id === 'lineal') {
          const d = (Y[n] - Y[0]) / n;
          caminos.push(traza(ult.total + d, 'Incremento medio ' + Math.round(d)));
          const pasos = []; for (let i = 0; i < n; i++) pasos.push(Y[i + 1] - Y[i]);
          if (pasos.length > 1) { caminos.push(traza(ult.total + Math.min(...pasos), 'Incremento mínimo')); caminos.push(traza(ult.total + Math.max(...pasos), 'Incremento máximo')); }
          detalle = 'Incremento medio ' + Math.round(d).toLocaleString('es-MX') + ' por temporada; total = ' + ult.season + ' + incremento.';
        } else if (id === 'geometrico') notas.push('El crecimiento geométrico necesita una base con valor mayor que 0 a la semana ' + k + '.');
      }
      if (!caminos.length) return { id, total: null, low: null, high: null, central: null, caminos: [], detalle, vacio: true };
      const totales = caminos.map(c => total(c.f));
      // central: promedio semanal de las rutas «principales» (en geométrico/lineal solo la primera)
      const principales = (id === 'geometrico' || id === 'lineal') ? [caminos[0]] : caminos;
      const central = principales[0].f.map((_, i) => prom(principales.map(c => c.f[i])));
      const iMin = totales.indexOf(Math.min(...totales)), iMax = totales.indexOf(Math.max(...totales));
      return {
        id, total: total(central), low: totales[iMin], high: totales[iMax],
        central, lowF: caminos[iMin].f, highF: caminos[iMax].f,
        caminos: caminos.map((c, i) => ({ etiqueta: c.etiqueta, total: totales[i] })), detalle
      };
    }

    const todos = METODOS.map(mt => Object.assign({ nombre: mt.corto }, metodo(mt.id)));
    const sel = todos.find(x => x.id === e.metodo) || todos[0];
    const refBase = util.length ? prom(util.map(b => b.total)) : null;
    const nSem = H - k;

    // series acumuladas para graficar (semanas 1..H)
    const acum = (a, ini) => { let s = ini || 0; return a.map(v => v == null ? null : (s += v)); };
    const realAc = acum(real, naC);
    const proyAc = (f) => { let s = ytd; return Array.from({ length: H }, (_, i) => i + 1 < k ? null : i + 1 === k ? ytd : (s += f[i - k])); };
    return {
      k, H, ytd, naC, nSem, real, bases: B, util, notas, metodos: METODOS, todos, sel,
      refBase, crecimiento: sel.total != null && refBase ? sel.total / refBase - 1 : null,
      semanas: Array.from({ length: H }, (_, i) => i + 1),
      series: {
        realAc: realAc.concat(Array(H - k).fill(null)),
        central: sel.central ? proyAc(sel.central) : null,
        low: sel.lowF ? proyAc(sel.lowF) : null,
        high: sel.highF ? proyAc(sel.highF) : null,
        basesAc: B.map(b => ({ season: b.season, v: acum(b.w, b.naB) })),
        semReal: real.concat(Array(H - k).fill(null)),
        semProy: sel.central ? Array(k).fill(null).concat(sel.central) : null
      }
    };
  }

  RH.proy = { METODOS, calcular, semanal };
})(window.RH = window.RH || {});
