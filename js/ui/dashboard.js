/* Report Hub · vista de dashboard (genérica: la configura RH.registro).
   Compara dos temporadas semana a semana, con filtros de periodo (rango o una
   semana), métrica, tipo de asignación y opciones del reporte. */
(function (RH) {
  'use strict';
  const u = RH.util, M = RH.modelo, G = RH.graf, el = u.el;

  const PRESETS = [
    ['fecha', 'A la fecha'], ['completas', 'Semanas completas'], ['u4', 'Últimas 4 semanas'], ['u8', 'Últimas 8 semanas'],
    ['u13', 'Últimas 13 semanas'], ['todo', 'Temporada completa'], ['custom', 'Personalizado']
  ];
  const MAX_TIPOS_COLOR = 7;

  const ESTADO_INICIAL = {
    cur: null, prev: null, metrica: null, modo: 'rango', preset: 'fecha', desde: 1, hasta: 1,
    semana: null, tiposExcluidos: [], opciones: {}, vista: 'semanal', varModo: 'abs', calor: 'cur', mezclaPct: false, tablaTemp: 'cur'
  };
  // Los filtros duran solo mientras la app está abierta (sessionStorage): al abrirla de nuevo
  // todo arranca igual que los reportes, sin filtros "escondidos" de otra sesión.
  function estadoDe(id) {
    try { localStorage.removeItem('rh-dash-' + id); } catch (e) { /* versiones anteriores lo guardaban aquí */ }
    let guardado = {};
    try { guardado = JSON.parse(sessionStorage.getItem('rh-dash-' + id) || '{}') || {}; } catch (e) { guardado = {}; }
    return Object.assign({}, ESTADO_INICIAL, guardado);
  }
  function filtrosActivos(e) {
    return e.cur || e.prev || (e.preset && e.preset !== 'fecha') || e.modo === 'semana' || (e.tiposExcluidos && e.tiposExcluidos.length) ||
      Object.keys(e.opciones || {}).length;
  }

  // =====================================================================================
  // MODELO DE LA VISTA
  // =====================================================================================
  function calcular(dash, snaps, e) {
    const temporadas = M.temporadas(snaps, dash.dataset);
    if (!temporadas.length) return { vacio: true, temporadas };

    const cur = temporadas.find(s => s.id === e.cur) || temporadas[0];
    let prev = null;
    if (e.prev !== 'none') {
      prev = temporadas.find(s => s.id === e.prev && s.id !== cur.id) ||
        temporadas.find(s => s.id !== cur.id && (s.week1 || '') < (cur.week1 || '')) || null;
    }
    const metrica = dash.metricas.find(m => m.id === e.metrica) || dash.metricas.find(m => m.id === dash.principal) || dash.metricas[0];
    const principal = dash.metricas.find(m => m.id === dash.principal) || dash.metricas[0];
    const metricaConteo = metrica.tipo === 'ratio' ? principal : metrica;
    // cada temporada se calcula con las opciones con que se procesó (igual que su HTML),
    // salvo que el usuario fuerce una opción en el dashboard (entonces aplica a ambas)
    const override = {};
    (dash.opciones || []).forEach(o => { if (e.opciones && o.id in e.opciones) override[o.id] = !!e.opciones[o.id]; });
    const optsDe = s => {
      const o = {};
      (dash.opciones || []).forEach(op => { o[op.id] = op.id in override ? override[op.id] : !!(s && s.meta && s.meta.config && s.meta.config[op.id]); });
      return o;
    };
    const opts = optsDe(cur), optsPrev = prev ? optsDe(prev) : null;
    const opcionesDistintas = !!prev && (dash.opciones || []).filter(op => opts[op.id] !== optsPrev[op.id]);

    const tiposTodos = M.tiposDe(cur, prev);
    // se guardan los tipos EXCLUIDOS: un tipo nuevo que aparezca en un CSV posterior entra solo
    let tiposSel = null;
    const excl = (Array.isArray(e.tiposExcluidos) ? e.tiposExcluidos : []).filter(t => tiposTodos.includes(t));
    if (excl.length && excl.length < tiposTodos.length) tiposSel = new Set(tiposTodos.filter(t => !excl.includes(t)));

    const ultCur = M.ultimaSemana(cur), ultPrev = M.ultimaSemana(prev);
    const maxW = Math.max(ultCur, ultPrev, 1);
    const parcial = M.semanaParcial(cur);
    const completa = parcial ? parcial.semana - 1 : ultCur;

    let desde, hasta;
    const fin = Math.max(ultCur, 1);
    switch (e.preset) {
      case 'u4': hasta = fin; desde = Math.max(1, hasta - 3); break;
      case 'u8': hasta = fin; desde = Math.max(1, hasta - 7); break;
      case 'u13': hasta = fin; desde = Math.max(1, hasta - 12); break;
      case 'todo': desde = 1; hasta = maxW; break;
      case 'completas': desde = 1; hasta = Math.max(1, completa); break;
      case 'custom':
        desde = u.clamp(+e.desde || 1, 1, maxW);
        hasta = u.clamp(+e.hasta || maxW, desde, maxW);
        break;
      default: desde = 1; hasta = fin;
    }
    const semana = (e.semana >= 1 && e.semana <= maxW) ? +e.semana : Math.max(1, completa >= 1 ? completa : ultCur);
    const modo = e.modo === 'semana' ? 'semana' : 'rango';
    const selec = modo === 'semana' ? [semana] : u.rango(desde, hasta);
    const contexto = modo === 'semana' ? u.rango(1, maxW) : selec;
    const resaltar = modo === 'semana' ? semana - 1 : null;
    const semK = selec.filter(w => w <= ultCur && (!prev || w <= ultPrev));
    const fmtM = metrica.tipo === 'ratio' ? 'pct' : 'int';

    // etiquetas
    const esParcial = w => !!parcial && w === parcial.semana;
    const lunes = (s, w) => s && s.week1 ? u.weekMonday(s.week1, w) : null;
    const categorias = contexto.map(w => 'S' + w + (esParcial(w) ? '*' : ''));
    const categoriasLargas = contexto.map(w => 'Semana ' + w + (esParcial(w) ? ' (parcial)' : ''));
    const notas = contexto.map(w => [cur, prev].filter(Boolean).map(s => s.season + ': ' + u.fmtRango(lunes(s, w), u.addDays(lunes(s, w), 6))).join(' · '));
    const nombreCur = 'Temporada ' + cur.season;
    const nombrePrev = prev ? 'Temporada ' + prev.season : null;
    const periodo = modo === 'semana'
      ? 'Semana ' + semana + ' · ' + u.fmtRango(lunes(cur, semana), u.addDays(lunes(cur, semana), 6))
      : 'Semanas ' + desde + (hasta !== desde ? '–' + hasta : '') + ' · ' + u.fmtRango(lunes(cur, desde), u.addDays(lunes(cur, hasta), 6));
    const comparando = prev ? cur.season + ' vs ' + prev.season : cur.season;
    const filtroTipos = tiposSel ? (tiposSel.size === 1 ? [...tiposSel][0] : tiposSel.size + ' tipos') : 'Todos los tipos';

    // series
    const mCur = M.serie(cur, metrica, contexto, tiposSel, opts);
    const mPrev = prev ? M.serie(prev, metrica, contexto, tiposSel, optsPrev) : null;
    const v = arr => arr.map(m => m ? m.v : null);
    const vCur = v(mCur), vPrev = mPrev ? v(mPrev) : null;
    const desdeCtx = modo === 'semana' ? 1 : desde;
    const acCur = v(M.acumulada(mCur, metrica)), acPrev = mPrev ? v(M.acumulada(mPrev, metrica)) : null;

    const totCur = M.total(cur, metrica, prev ? semK : selec.filter(w => w <= ultCur), tiposSel, opts);
    const totPrev = prev ? M.total(prev, metrica, semK, tiposSel, optsPrev) : null;
    const totPrevCompleta = prev ? M.total(prev, metrica, u.rango(1, Math.max(ultPrev, 1)), tiposSel, optsPrev) : null;

    // ---------------- specs de gráficas
    const base = { categorias, categoriasLargas, notas, ejeX: 'Semana', resaltar };
    const subt = dash.titulo + ' · ' + periodo + ' · ' + comparando + (tiposSel ? ' · ' + filtroTipos : '');
    const acumulado = e.vista === 'acumulado';
    const specSemanal = Object.assign({}, base, {
      id: 'semanal', tipo: acumulado ? 'line' : 'col',
      titulo: (acumulado ? 'Acumulado' : 'Comparativo semanal') + ' · ' + metrica.etiqueta,
      subtitulo: subt + (acumulado && desdeCtx > 1 ? ' · acumulado desde la semana ' + desdeCtx : ''),
      formato: fmtM, delta: !!prev,
      series: [
        prev && { nombre: nombrePrev, valores: acumulado ? acPrev : vPrev, rol: 'prev' },
        { nombre: nombreCur, valores: acumulado ? acCur : vCur, rol: 'cur', area: acumulado }
      ].filter(Boolean),
      archivo: dash.titulo + (acumulado ? '_acumulado' : '_comparativo_semanal')
    });

    let specVar = null;
    if (prev) {
      const pctMode = e.varModo === 'pct' && fmtM !== 'pct';
      const dVals = contexto.map((w, i) => {
        const a = vPrev[i], b = vCur[i];
        if (a == null || b == null) return null;
        if (fmtM === 'pct') return b - a;
        return pctMode ? u.variacion(b, a) : b - a;
      });
      specVar = Object.assign({}, base, {
        id: 'variacion', tipo: 'diverging',
        titulo: 'Variación vs ' + prev.season + ' · ' + metrica.etiqueta + (fmtM === 'pct' ? ' (puntos porcentuales)' : pctMode ? ' (%)' : ''),
        subtitulo: subt, formato: fmtM === 'pct' ? 'pp' : pctMode ? 'dPct' : 'dInt',
        series: [{ nombre: 'Variación ' + cur.season + ' vs ' + prev.season, valores: dVals, rol: 'cur' }],
        total: !pctMode, archivo: dash.titulo + '_variacion'
      });
    }

    // por tipo (sobre las semanas comparables de la selección)
    const semTipo = prev ? semK : selec.filter(w => w <= ultCur);
    const rankTipos = tiposTodos.map(t => ({ t, v: (M.porTipo(cur, metricaConteo, M.semanasDe(cur), t, opts) || {}).v || 0 }))
      .sort((a, b) => b.v - a.v).map(x => x.t);
    const colorTipo = t => { const i = rankTipos.indexOf(t); return i >= 0 && i < MAX_TIPOS_COLOR ? i : -1; };
    const tiposVisibles = tiposTodos.filter(t => !tiposSel || tiposSel.has(t));
    const filasTipo = tiposVisibles.map(t => ({
      tipo: t,
      cur: M.porTipo(cur, metrica, semTipo, t, opts),
      prev: prev ? M.porTipo(prev, metrica, semTipo, t, optsPrev) : null
    })).sort((a, b) => ((b.cur && b.cur.v) || 0) - ((a.cur && a.cur.v) || 0));
    const specTipo = {
      id: 'tipos', tipo: 'barH',
      titulo: 'Por tipo de asignación · ' + metrica.etiqueta,
      subtitulo: dash.titulo + ' · ' + (modo === 'semana' ? 'Semana ' + semana : 'Semanas ' + rangoTxt(semTipo)) + ' · ' + comparando,
      categorias: filasTipo.map(f => f.tipo), categoriasLargas: filasTipo.map(f => f.tipo), ejeX: 'Tipo de asignación',
      formato: fmtM, delta: !!prev,
      series: [
        prev && { nombre: nombrePrev, valores: filasTipo.map(f => f.prev ? f.prev.v : null), rol: 'prev' },
        { nombre: nombreCur, valores: filasTipo.map(f => f.cur ? f.cur.v : null), rol: 'cur' }
      ].filter(Boolean),
      archivo: dash.titulo + '_por_tipo'
    };

    // participación (o volumen si la métrica elegida ya es la proporción)
    let specPart = null;
    const mPart = dash.metricas.find(m => m.id === (metrica.id === dash.participacion ? dash.principal : dash.participacion));
    if (mPart) {
      const fP = mPart.tipo === 'ratio' ? 'pct' : 'int';
      specPart = Object.assign({}, base, {
        id: 'participacion', tipo: mPart.tipo === 'ratio' ? 'line' : 'col',
        titulo: (mPart.tipo === 'ratio' ? 'Participación · ' : 'Volumen · ') + mPart.etiqueta,
        subtitulo: (mPart.descripcion ? mPart.descripcion + ' · ' : '') + periodo + ' · ' + comparando,
        formato: fP, delta: !!prev,
        series: [
          prev && { nombre: nombrePrev, valores: v(M.serie(prev, mPart, contexto, tiposSel, optsPrev)), rol: 'prev' },
          { nombre: nombreCur, valores: v(M.serie(cur, mPart, contexto, tiposSel, opts)), rol: 'cur' }
        ].filter(Boolean),
        archivo: dash.titulo + '_participacion'
      });
    }

    // mezcla por tipo (temporada actual)
    const topMezcla = rankTipos.filter(t => !tiposSel || tiposSel.has(t));
    const principales = topMezcla.slice(0, MAX_TIPOS_COLOR);
    const resto = topMezcla.slice(MAX_TIPOS_COLOR);
    const serieTipo = t => contexto.map(w => { const m = M.medir(metricaConteo, M.agregadoTipo(cur, w, t), opts); return m ? m.v : null; });
    let seriesMezcla = principales.map(t => ({ nombre: t, valores: serieTipo(t), rol: 'cat', cat: colorTipo(t) }));
    if (resto.length) {
      const sumas = contexto.map((w, i) => { let s = null; resto.forEach(t => { const x = serieTipo(t)[i]; if (x != null) s = (s || 0) + x; }); return s; });
      seriesMezcla.push({ nombre: 'Otros (' + resto.length + ')', valores: sumas, rol: 'otros' });
    }
    if (e.mezclaPct) {
      const tot = contexto.map((w, i) => u.sum(seriesMezcla.map(s => s.valores[i])));
      seriesMezcla = seriesMezcla.map(s => Object.assign({}, s, { valores: s.valores.map((x, i) => x == null || !tot[i] ? null : x / tot[i]) }));
    }
    const specMezcla = Object.assign({}, base, {
      id: 'mezcla', tipo: 'colStacked',
      titulo: 'Mezcla por tipo · ' + metricaConteo.etiqueta + ' · ' + cur.season + (e.mezclaPct ? ' (% del total semanal)' : ''),
      subtitulo: dash.titulo + ' · ' + periodo,
      formato: e.mezclaPct ? 'pct' : 'int', series: seriesMezcla, total: !e.mezclaPct,
      archivo: dash.titulo + '_mezcla_por_tipo'
    });

    // mapa de calor (tipos × semanas)
    const calorTipos = tiposVisibles.slice().sort((a, b) => rankTipos.indexOf(a) - rankTipos.indexOf(b));
    const matriz = s => { const o = optsDe(s); return calorTipos.map(t => contexto.map(w => { const m = M.medir(metrica, M.agregadoTipo(s, w, t), o); return m ? m.v : null; })); };
    const calor = {
      tipos: calorTipos, semanas: contexto, categorias, categoriasLargas,
      cur: matriz(cur), prev: prev ? matriz(prev) : null,
      totCur: vCur, totPrev: vPrev, formato: fmtM
    };

    const vm = {
      dash, temporadas, cur, prev, metrica, metricaConteo, principal, opts, optsPrev, optsDe, override, opcionesDistintas, totPrevCompleta, tiposTodos, tiposSel, filtroTipos,
      ultCur, ultPrev, maxW, parcial, completa, modo, desde, hasta, semana, selec, contexto, semK, resaltar,
      periodo, comparando, nombreCur, nombrePrev, fmtM, vCur, vPrev, acCur, acPrev, totCur, totPrev,
      filasTipo, rankTipos, colorTipo,
      specs: { semanal: specSemanal, variacion: specVar, tipos: specTipo, participacion: specPart, mezcla: specMezcla },
      calor
    };
    const naM = metrica.tipo !== 'ratio' && cur.na ? M.medir(metrica, M.agregado(cur, 'N/A', tiposSel), opts) : null;
    vm.naCur = naM && naM.v ? naM.v : 0;
    vm.fueraCur = M.semanasFuera(cur).length;
    vm.kpis = kpis(vm);
    vm.hallazgos = hallazgos(vm);
    vm.detalle = detalle(vm);
    return vm;
  }

  function rangoTxt(ws) {
    if (!ws.length) return '–';
    return ws[0] === ws[ws.length - 1] ? String(ws[0]) : ws[0] + '–' + ws[ws.length - 1];
  }

  function delta(a, b, fmt) {
    if (a == null || b == null) return null;
    if (fmt === 'pct') { const d = a - b; return { texto: u.fmtPp(d), signo: Math.sign(Math.round(d * 1000)) }; }
    const p = u.variacion(a, b);
    const d = a - b;
    // diferencias pequeñas con decimales (p. ej. promedios) se muestran con un decimal
    const dTxt = Math.abs(d) < 10 && Math.round(d) !== d ? u.fmtSignedDec(d) : u.fmtSignedInt(d);
    return { texto: p == null ? dTxt : u.fmtSignedPct(p), sub: p == null ? null : dTxt, signo: Math.abs(d) < 1e-9 ? 0 : Math.sign(d) };
  }

  // =====================================================================================
  // KPIs
  // =====================================================================================
  function kpis(vm) {
    const { cur, prev, metrica, fmtM, opts, optsPrev, tiposSel, dash } = vm;
    const out = [];
    const mPart = dash.participacion && metrica.id !== dash.participacion ? dash.metricas.find(m => m.id === dash.participacion) : null;

    if (vm.modo === 'rango') {
      const vc = vm.totCur ? vm.totCur.v : null, vp = vm.totPrev ? vm.totPrev.v : null;
      out.push({
        hero: true, etiqueta: metrica.etiqueta + ' · ' + cur.season, valor: vc, formato: fmtM,
        delta: prev ? delta(vc, vp, fmtM) : null,
        nota: (prev ? 'vs ' + prev.season + ' en las mismas ' + vm.semK.length + ' semana' + (vm.semK.length === 1 ? '' : 's') + ' (' + rangoTxt(vm.semK) + ')' : vm.periodo) +
          (vm.parcial && vm.selec.includes(vm.parcial.semana) ? ' · incluye S' + vm.parcial.semana + ' en curso' : '') +
          (vm.naCur ? ' · sin contar la fila N/A (' + G.fmtValor(vm.naCur, fmtM) + '; ver «Tabla del reporte»)' : '')
      });
      if (prev) {
        const comp = vm.totPrevCompleta && vm.totPrevCompleta.v;
        const masSemanas = vm.ultPrev > (vm.semK.length ? vm.semK[vm.semK.length - 1] : 0);
        out.push({ etiqueta: 'Temporada ' + prev.season + ' · mismas semanas', valor: vp, formato: fmtM,
          nota: 'Mismo periodo · semanas ' + rangoTxt(vm.semK) + (masSemanas && comp != null ? ' · temporada completa (S1–S' + vm.ultPrev + '): ' + G.fmtValor(comp, fmtM) : '') });
      }

      const semCur = (prev ? vm.semK : vm.selec.filter(w => w <= vm.ultCur));
      if (metrica.tipo !== 'ratio' && semCur.length) {
        const avgC = vc / semCur.length, avgP = prev && vp != null ? vp / semCur.length : null;
        out.push({ etiqueta: 'Promedio semanal', valor: avgC, formato: 'int', delta: prev ? delta(avgC, avgP, 'int') : null, nota: prev ? prev.season + ': ' + u.fmtInt(avgP) + ' por semana' : semCur.length + ' semanas' });
      }

      // semana más alta de la temporada actual dentro del periodo
      let mejor = null;
      vm.contexto.forEach((w, i) => { if (w <= vm.ultCur && vm.vCur[i] != null && (!mejor || vm.vCur[i] > mejor.v)) mejor = { w, v: vm.vCur[i] }; });
      if (mejor) out.push({ etiqueta: 'Semana más alta · ' + cur.season, valorTexto: 'S' + mejor.w, nota: G.fmtValor(mejor.v, fmtM) + ' · ' + u.fmtFecha(u.weekMonday(cur.week1, mejor.w)) });

      if (mPart) {
        const sC = M.total(cur, mPart, semCur, tiposSel, opts), sP = prev ? M.total(prev, mPart, vm.semK, tiposSel, optsPrev) : null;
        out.push({ etiqueta: mPart.etiqueta, valor: sC ? sC.v : null, formato: 'pct', delta: prev ? delta(sC && sC.v, sP && sP.v, 'pct') : null, nota: mPart.descripcion || '' });
      }

      // proyección de cierre según la curva de la temporada anterior
      if (prev && metrica.tipo !== 'ratio' && vm.completa >= 4 && vm.ultPrev > vm.completa) {
        const ws = u.rango(1, vm.completa);
        const ytdC = M.total(cur, metrica, ws, tiposSel, opts), ytdP = M.total(prev, metrica, ws, tiposSel, optsPrev);
        const totP = M.total(prev, metrica, u.rango(1, vm.ultPrev), tiposSel, optsPrev);
        if (ytdC && ytdP && totP && ytdP.v > 0) {
          const proy = ytdC.v * totP.v / ytdP.v;
          out.push({
            etiqueta: 'Proyección de cierre ' + cur.season, valor: proy, formato: 'int', aprox: true,
            delta: delta(proy, totP.v, 'int'),
            nota: 'Si sigue la curva de ' + prev.season + ' (cierre ' + u.fmtInt(totP.v) + ')',
            ayuda: 'Acumulado de ' + cur.season + ' a la semana ' + vm.completa + ' × (total de ' + prev.season + ' ÷ su acumulado a la misma semana). Solo usa semanas completas.'
          });
        }
      }
    } else {
      const w = vm.semana, i = w - 1;
      const vc = vm.vCur[i], vp = vm.vPrev ? vm.vPrev[i] : null;
      out.push({
        hero: true, etiqueta: metrica.etiqueta + ' · Semana ' + w, valor: vc, formato: fmtM,
        delta: prev ? delta(vc, vp, fmtM) : null,
        nota: (prev ? 'vs semana ' + w + ' de ' + prev.season + ' · ' : '') + u.fmtRango(u.weekMonday(cur.week1, w), u.addDays(u.weekMonday(cur.week1, w), 6)) + (vm.parcial && vm.parcial.semana === w ? ' · semana en curso' : '')
      });
      if (prev) out.push({ etiqueta: 'Semana ' + w + ' · ' + prev.season, valor: vp, formato: fmtM, nota: u.fmtRango(u.weekMonday(prev.week1, w), u.addDays(u.weekMonday(prev.week1, w), 6)) });
      if (w > 1) {
        const ant = vm.vCur[i - 1];
        out.push({ etiqueta: 'vs semana anterior (S' + (w - 1) + ')', valor: ant, formato: fmtM, delta: delta(vc, ant, fmtM), nota: 'Cambio semana contra semana en ' + cur.season });
      }
      if (vc != null) {
        const valores = vm.vCur.slice(0, vm.ultCur).filter(x => x != null);
        const pos = valores.filter(x => x > vc).length + 1;
        out.push({ etiqueta: 'Posición en la temporada', valorTexto: '#' + pos, nota: 'de ' + valores.length + ' semanas con datos en ' + cur.season });
      }
      if (mPart) {
        const sC = M.medir(mPart, M.agregado(cur, w, tiposSel), opts), sP = prev ? M.medir(mPart, M.agregado(prev, w, tiposSel), optsPrev) : null;
        out.push({ etiqueta: mPart.etiqueta, valor: sC ? sC.v : null, formato: 'pct', delta: prev ? delta(sC && sC.v, sP && sP.v, 'pct') : null, nota: mPart.descripcion || '' });
      }
      const ac = vm.acCur[i], ap = vm.acPrev ? vm.acPrev[i] : null;
      out.push({ etiqueta: 'Acumulado a la semana ' + w, valor: ac, formato: fmtM, delta: prev ? delta(ac, ap, fmtM) : null, nota: prev ? prev.season + ': ' + G.fmtValor(ap, fmtM) : 'Temporada ' + cur.season });
    }
    return out;
  }

  // =====================================================================================
  // HALLAZGOS (lectura automática en lenguaje natural)
  // =====================================================================================
  function hallazgos(vm) {
    const { cur, prev, metrica, fmtM } = vm;
    const out = [];
    const f = x => G.fmtValor(x, fmtM);
    const B = t => ({ b: t });
    if (vm.modo === 'rango') {
      const vc = vm.totCur && vm.totCur.v, vp = vm.totPrev && vm.totPrev.v;
      if (prev && vc != null && vp != null) {
        const d = delta(vc, vp, fmtM);
        out.push({ ico: d.signo > 0 ? 'up' : d.signo < 0 ? 'down' : 'flat', partes: [cur.season + ' registra ', B(f(vc)), ' en ' + metrica.etiqueta + ' (semanas ' + rangoTxt(vm.semK) + '), ', B(d.texto), ' frente a ' + prev.season + ' (' + f(vp) + ').'] });
      } else if (vc != null) {
        out.push({ ico: 'info', partes: [cur.season + ' registra ', B(f(vc)), ' en ' + metrica.etiqueta + ' durante ' + vm.periodo.split(' · ')[0].toLowerCase() + '.'] });
      }
      if (prev) {
        let arriba = 0, total = 0;
        vm.contexto.forEach((w, i) => { if (vm.vCur[i] != null && vm.vPrev[i] != null && !(vm.parcial && vm.parcial.semana === w)) { total++; if (vm.vCur[i] > vm.vPrev[i]) arriba++; } });
        if (total >= 2) out.push({ ico: arriba * 2 >= total ? 'up' : 'down', partes: [B(arriba + ' de ' + total), ' semanas completas superaron a ' + prev.season + '.'] });
      }
      let mejor = null;
      vm.contexto.forEach((w, i) => { if (vm.vCur[i] != null && (!mejor || vm.vCur[i] > mejor.v)) mejor = { w, v: vm.vCur[i] }; });
      if (mejor && vm.contexto.length > 1) out.push({ ico: 'star', partes: ['La semana más alta fue la ', B('S' + mejor.w), ' (' + u.fmtFecha(u.weekMonday(cur.week1, mejor.w)) + ') con ', B(f(mejor.v)), '.'] });
      // impulso: últimas 4 semanas completas vs 4 anteriores
      const comp = vm.contexto.filter(w => w <= vm.completa);
      if (metrica.tipo !== 'ratio' && comp.length >= 8) {
        const ult = comp.slice(-4), ant = comp.slice(-8, -4);
        const sU = (M.total(cur, metrica, ult, vm.tiposSel, vm.opts) || {}).v, sA = (M.total(cur, metrica, ant, vm.tiposSel, vm.opts) || {}).v;
        const p = u.variacion(sU, sA);
        if (p != null) out.push({ ico: p >= 0 ? 'up' : 'down', partes: ['Tendencia: las últimas 4 semanas completas (S' + ult[0] + '–S' + ult[3] + ') van ', B(u.fmtSignedPct(p)), ' contra las 4 anteriores.'] });
      }
    } else {
      const i = vm.semana - 1, vc = vm.vCur[i], vp = vm.vPrev ? vm.vPrev[i] : null;
      if (vc != null && prev && vp != null) {
        const d = delta(vc, vp, fmtM);
        out.push({ ico: d.signo > 0 ? 'up' : d.signo < 0 ? 'down' : 'flat', partes: ['En la semana ' + vm.semana + ', ' + cur.season + ' tuvo ', B(f(vc)), ' (' + d.texto + ' vs ' + prev.season + ').'] });
      } else if (vc != null) out.push({ ico: 'info', partes: ['En la semana ' + vm.semana + ', ' + cur.season + ' tuvo ', B(f(vc)), '.'] });
      else out.push({ ico: 'warn', partes: ['La temporada ' + cur.season + ' todavía no tiene datos de la semana ' + vm.semana + '.'] });
      const ac = vm.acCur[i], ap = vm.acPrev ? vm.acPrev[i] : null;
      if (ac != null && ap != null) {
        const d = delta(ac, ap, fmtM);
        out.push({ ico: d.signo > 0 ? 'up' : d.signo < 0 ? 'down' : 'flat', partes: ['Acumulado a la semana ' + vm.semana + ': ', B(f(ac)), ', ', B(d.texto), ' contra ' + prev.season + '.'] });
      }
    }
    // tipos: el que más pesa y el que más cambió
    const filas = vm.filasTipo.filter(r => r.cur && r.cur.v != null);
    if (filas.length > 1 && metrica.tipo !== 'ratio') {
      const tot = u.sum(filas.map(r => r.cur.v));
      const top = filas[0];
      if (tot > 0) out.push({ ico: 'info', partes: [B(top.tipo), ' concentra el ', B(u.fmtPct(top.cur.v / tot)), ' del periodo.'] });
      if (prev) {
        const cambios = filas.filter(r => r.prev && r.prev.v >= 20).map(r => ({ t: r.tipo, p: u.variacion(r.cur.v, r.prev.v) })).filter(x => x.p != null);
        if (cambios.length > 1) {
          cambios.sort((a, b) => Math.abs(b.p) - Math.abs(a.p));
          const c = cambios[0];
          out.push({ ico: c.p >= 0 ? 'up' : 'down', partes: ['Mayor cambio por tipo: ', B(c.t), ' (' + u.fmtSignedPct(c.p) + ' vs ' + prev.season + ').'] });
        }
      }
    }
    if (vm.parcial) out.push({ ico: 'warn', partes: ['La semana ' + vm.parcial.semana + ' está en curso (datos al ' + u.fmtFecha(vm.parcial.corte) + '); aparece marcada con * y no cuenta para tendencias ni proyección.'] });
    if (!prev) out.push({ ico: 'info', partes: ['Agrega otra temporada (por ejemplo, la del año pasado) para ver comparativos.'] });
    return out;
  }

  // =====================================================================================
  // DETALLE SEMANAL (tabla)
  // =====================================================================================
  function detalle(vm) {
    const { cur, prev, fmtM, contexto } = vm;
    const filas = contexto.map((w, i) => {
      const a = vm.vPrev ? vm.vPrev[i] : null, b = vm.vCur[i];
      const aa = vm.acPrev ? vm.acPrev[i] : null, ab = vm.acCur[i];
      return {
        w,
        lunesCur: cur.week1 ? u.weekMonday(cur.week1, w) : null,
        lunesPrev: prev && prev.week1 ? u.weekMonday(prev.week1, w) : null,
        prev: a, cur: b,
        d: a != null && b != null ? b - a : null,
        p: fmtM === 'pct' ? null : u.variacion(b, a),
        acPrev: aa, acCur: ab,
        pAc: fmtM === 'pct' ? (aa != null && ab != null ? ab - aa : null) : u.variacion(ab, aa),
        parcial: !!(vm.parcial && vm.parcial.semana === w)
      };
    });
    return filas;
  }

  // =====================================================================================
  // EXPORTAR DASHBOARD COMPLETO A EXCEL
  // =====================================================================================
  async function exportarExcel(vm) {
    const X = RH.xlsx, C = X.col;
    const { dash, cur, prev, metrica, fmtM } = vm;
    const wb = X.libro({ titulo: dash.titulo + ' · Dashboard' });

    // --- Resumen
    const R = wb.hoja('Resumen', { grid: false, tab: 'C9A227' });
    R.ancho([3, 34, 22, 22, 50]);
    R.fila([null, dash.titulo + ' · Dashboard'], { estilo: 'titulo', alto: 30 });
    R.fila([null, dash.descripcion], { estilo: 'sub' });
    R.fila([null, 'Generado con Report Hub el ' + u.fmtFechaHora(Date.now())], { estilo: 'nota' });
    R.vacia();
    R.fila([null, 'Filtros aplicados'], { estilo: 'seccion' });
    [['Comparación', prev ? 'Temporada ' + cur.season + ' vs Temporada ' + prev.season : 'Temporada ' + cur.season],
      ['Periodo', vm.periodo], ['Métrica', metrica.etiqueta + (metrica.descripcion ? ' (' + metrica.descripcion + ')' : '')],
      ['Tipos de asignación', vm.tiposSel ? [...vm.tiposSel].join(', ') : 'Todos'],
      ...(dash.opciones || []).map(o => [o.etiqueta, cur.season + ': ' + (vm.opts[o.id] ? 'Sí' : 'No') + (prev ? ' · ' + prev.season + ': ' + (vm.optsPrev[o.id] ? 'Sí' : 'No') : '')])
    ].forEach(([k, v]) => R.fila([null, { v: k, s: 'kpiLabel' }, { v: v, s: 'normal' }]));
    R.vacia();
    R.fila([null, 'Indicadores'], { estilo: 'seccion' });
    R.fila([null, 'Indicador', 'Valor', 'Variación', 'Nota'], { estilo: 'headerL', alto: 22 });
    vm.kpis.forEach(k => {
      const est = k.formato === 'pct' ? 'pct' : 'int';
      R.fila([null, { v: k.etiqueta, s: 'texto' },
        k.valorTexto ? { v: k.valorTexto, s: 'texto' } : { v: k.valor == null ? null : k.valor, s: est },
        { v: k.delta ? k.delta.texto + (k.delta.sub ? ' (' + k.delta.sub + ')' : '') : '', s: 'texto' },
        { v: k.nota || '', s: 'texto' }]);
    });
    R.vacia();
    R.fila([null, 'Hallazgos'], { estilo: 'seccion' });
    vm.hallazgos.forEach(h => R.fila([null, { v: '• ' + h.partes.map(p => typeof p === 'string' ? p : p.b).join(''), s: 'normal' }]));
    R.vacia();
    R.fila([null, 'Hojas: Semanal · Acumulado · Variación · Por tipo · Participación · Mezcla · Mapa de calor · Datos. Las gráficas son nativas de Excel y se pueden editar.'], { estilo: 'nota' });

    // --- Semanal (tabla con fórmulas vivas + gráfica)
    const S = wb.hoja('Semanal', { grid: false, tab: '1F3A5F' });
    S.fila([vm.specs.semanal.titulo.replace('Acumulado', 'Comparativo semanal')], { estilo: 'titulo', alto: 26 });
    S.fila([dash.titulo + ' · ' + vm.periodo + ' · ' + vm.comparando], { estilo: 'sub' });
    S.fila(['Fórmulas vivas: puedes cambiar un valor y se recalculan variaciones y acumulados.'], { estilo: 'nota' });
    S.vacia();
    const r0 = S.siguiente;
    const pct = fmtM === 'pct';
    const cab = ['Semana', 'Lunes ' + cur.season, prev ? 'Lunes ' + prev.season : null, prev ? vm.nombrePrev : null, vm.nombreCur,
      prev ? (pct ? 'Variación (pp)' : 'Variación') : null, prev && !pct ? 'Variación %' : null,
      prev ? 'Acumulado ' + prev.season : null, 'Acumulado ' + cur.season, prev ? (pct ? 'Var. acumulada (pp)' : 'Var. acumulada %') : null].filter(x => x !== null);
    S.fila(cab, { estilo: 'header', alto: 32 });
    const ci = n => cab.indexOf(n);
    const cP = prev ? ci(vm.nombrePrev) : -1, cC = ci(vm.nombreCur);
    const cAP = prev ? ci('Acumulado ' + prev.season) : -1, cAC = ci('Acumulado ' + cur.season);
    const est = pct ? 'pct' : 'int';
    vm.detalle.forEach((d, i) => {
      const r = r0 + 1 + i, xr = r + 1;
      const fila = [{ v: 'Semana ' + d.w + (d.parcial ? ' (parcial)' : ''), s: 'texto' }, { v: d.lunesCur || '', s: 'texto' }];
      if (prev) fila.push({ v: d.lunesPrev || '', s: 'texto' }, { v: d.prev, s: est });
      fila.push({ v: d.cur, s: est });
      const ambos = d.prev != null && d.cur != null;
      if (prev) {
        if (pct) fila.push(ambos ? { v: (d.cur - d.prev) * 100, f: '(' + C(cC) + xr + '-' + C(cP) + xr + ')*100', s: 'pp' } : { v: null, s: 'pp' });
        else {
          fila.push(ambos ? { v: d.d, f: C(cC) + xr + '-' + C(cP) + xr, s: 'dInt' } : { v: null, s: 'dInt' });
          fila.push(ambos ? { v: d.p == null ? '' : d.p, f: 'IF(' + C(cP) + xr + '=0,"",' + C(cC) + xr + '/' + C(cP) + xr + '-1)', s: 'dPct' } : { v: null, s: 'dPct' });
        }
      }
      const acum = (col, valCol, val) => {
        if (val == null) return { v: null, s: est };
        if (pct) return { v: val, s: est };
        return i === 0 ? { v: val, f: C(valCol) + xr, s: est } : { v: val, f: C(col) + (xr - 1) + '+' + C(valCol) + xr, s: est };
      };
      if (prev) fila.push(acum(cAP, cP, d.acPrev));
      fila.push(acum(cAC, cC, d.acCur));
      if (prev) {
        const ok = d.acPrev != null && d.acCur != null;
        if (pct) fila.push(ok ? { v: (d.acCur - d.acPrev) * 100, f: '(' + C(cAC) + xr + '-' + C(cAP) + xr + ')*100', s: 'pp' } : { v: null, s: 'pp' });
        else fila.push(ok ? { v: d.pAc == null ? '' : d.pAc, f: 'IF(' + C(cAP) + xr + '=0,"",' + C(cAC) + xr + '/' + C(cAP) + xr + '-1)', s: 'dPct' } : { v: null, s: 'dPct' });
      }
      S.fila(fila);
    });
    const d1 = r0 + 1, d2 = r0 + vm.detalle.length;
    if (!pct && vm.detalle.length > 1) {
      const rt = d2 + 1, xr = rt + 1;
      const fila = [{ v: 'Total semanas mostradas (sin N/A)', s: 'totTexto' }, { v: '', s: 'totTexto' }];
      if (prev) fila.push({ v: '', s: 'totTexto' }, { v: u.sum(vm.detalle.map(d => d.prev)), f: 'SUM(' + C(cP) + (d1 + 1) + ':' + C(cP) + (d2 + 1) + ')', s: 'totInt' });
      fila.push({ v: u.sum(vm.detalle.map(d => d.cur)), f: 'SUM(' + C(cC) + (d1 + 1) + ':' + C(cC) + (d2 + 1) + ')', s: 'totInt' });
      if (prev) {
        const cD = ci('Variación');
        const rD = C(cD) + (d1 + 1) + ':' + C(cD) + (d2 + 1), rP = C(cP) + (d1 + 1) + ':' + C(cP) + (d2 + 1);
        const sD = u.sum(vm.detalle.map(d => d.d));
        const sP = u.sum(vm.detalle.filter(d => d.d != null).map(d => d.prev));
        fila.push({ v: sD, f: 'SUM(' + rD + ')', s: 'totDInt' });
        fila.push({ v: sP ? sD / sP : '', f: 'IFERROR(' + C(cD) + xr + '/SUMIFS(' + rP + ',' + rD + ',"<>"),"")', s: 'totDPct' }, { v: '', s: 'totTexto' }, { v: '', s: 'totTexto' }, { v: '', s: 'totTexto' });
      } else fila.push({ v: '', s: 'totTexto' });
      S.fila(fila);
    }
    S.ancho(cab.map((c, i) => i === 0 ? 20 : Math.max(13, Math.min(22, String(c).length + 3))));
    S.congelar(r0 + 1, 1);
    const hx = c => c.replace('#', '').toUpperCase();
    S.grafica({
      tipo: 'col', titulo: 'Comparativo semanal · ' + metrica.etiqueta,
      categorias: vm.detalle.map(d => 'Semana ' + d.w + (d.parcial ? ' (parcial)' : '')),
      cat: { c: 0, r1: d1, r2: d2 },
      series: [
        prev && { nombre: vm.nombrePrev, nombreRef: { c: cP, r: r0 }, c: cP, r1: d1, r2: d2, color: hx(G.EXPORTAR.prev), valores: vm.detalle.map(d => d.prev) },
        { nombre: vm.nombreCur, nombreRef: { c: cC, r: r0 }, c: cC, r1: d1, r2: d2, color: hx(G.EXPORTAR.cur), valores: vm.detalle.map(d => d.cur) }
      ].filter(Boolean),
      formatoEje: pct ? '0%' : '#,##0', formatoCache: pct ? '0.0%' : '#,##0',
      ancla: { c: 0, r: d2 + 3, w: Math.max(9, cab.length), h: 20 }
    });

    // --- hojas a partir de los specs (cada una con su gráfica nativa)
    const acSpec = Object.assign({}, vm.specs.semanal, {
      tipo: 'line', titulo: 'Acumulado · ' + metrica.etiqueta, resaltar: null,
      series: [vm.prev && { nombre: vm.nombrePrev, valores: vm.acPrev, rol: 'prev' }, { nombre: vm.nombreCur, valores: vm.acCur, rol: 'cur' }].filter(Boolean)
    });
    G.hojaExcel(wb, acSpec, 'Acumulado');
    if (vm.specs.variacion) G.hojaExcel(wb, Object.assign({}, vm.specs.variacion, { resaltar: null }), 'Variación');
    G.hojaExcel(wb, vm.specs.tipos, 'Por tipo');
    if (vm.specs.participacion) G.hojaExcel(wb, Object.assign({}, vm.specs.participacion, { resaltar: null }), 'Participación');
    G.hojaExcel(wb, Object.assign({}, vm.specs.mezcla, { resaltar: null }), 'Mezcla');

    // --- mapa de calor con escala de color
    const H = wb.hoja('Mapa de calor', { grid: false, tab: '1F6FD1' });
    H.fila(['Mapa de calor · ' + metrica.etiqueta + ' por tipo y semana'], { estilo: 'titulo', alto: 26 });
    H.fila([dash.titulo + ' · ' + vm.periodo], { estilo: 'sub' });
    H.vacia();
    const bloques = [[vm.nombreCur, vm.calor.cur, vm.calor.totCur], vm.prev ? [vm.nombrePrev, vm.calor.prev, vm.calor.totPrev] : null].filter(Boolean);
    bloques.forEach(([nombre, mat, tot]) => {
      H.fila([nombre], { estilo: 'seccion' });
      const rc = H.fila(['Tipo', ...vm.calor.semanas.map(w => 'S' + w)], { estilo: 'header', alto: 20 });
      vm.calor.tipos.forEach((t, k) => H.fila([{ v: t, s: 'texto' }, ...mat[k].map(x => ({ v: x, s: pct ? 'pct' : 'int' }))]));
      const rt = H.fila([{ v: 'Total', s: 'totTexto' }, ...tot.map(x => ({ v: x, s: pct ? 'totPct' : 'totInt' }))]);
      if (vm.calor.tipos.length && vm.calor.semanas.length) H.escala(rc + 1, 1, rt - 1, vm.calor.semanas.length, 'F3F7FC', '1F6FD1');
      H.vacia();
    });
    H.ancho([26, ...vm.calor.semanas.map(() => pct ? 8 : 9)]);
    H.congelar(0, 1);

    // --- tabla idéntica a la del HTML de cada temporada (con fila N/A y TOTAL)
    const fnTabla = RH.tablas && RH.tablas[dash.dataset];
    if (fnTabla) {
      [cur, prev].filter(Boolean).forEach(snap => {
        const t = fnTabla(snap, !!vm.optsDe(snap).incluirCeros);
        const T = wb.hoja('Reporte ' + snap.season, { grid: false, tab: 'C9A227' });
        T.fila(['Tabla del reporte · temporada ' + snap.season + ' (idéntica a la del HTML)'], { estilo: 'titulo', alto: 26 });
        T.fila(['Lunes de la semana 1: ' + u.fmtFecha(snap.week1) + ' · Incluir filas con todo en 0: ' + (vm.optsDe(snap).incluirCeros ? 'Sí' : 'No') + (snap.meta && snap.meta.archivo ? ' · Archivo: ' + snap.meta.archivo.nombre : '')], { estilo: 'sub' });
        T.fila([t.concilia], { estilo: 'nota' });
        T.vacia();
        const [encT, ...filasT] = t.lineas;
        T.fila(encT, { estilo: 'header', alto: 34 });
        filasT.forEach((f, k) => {
          const tot = k === filasT.length - 1;
          T.fila(f.map((c, i) => i < 2 ? { v: c, s: tot ? 'totTexto' : 'texto' } : { v: c, s: tot ? 'totInt' : 'int' }));
        });
        T.ancho([14, 14, ...encT.slice(2).map(h => Math.max(12, Math.min(26, String(h).length + 2)))]);
        T.congelar(5, 2);
      });
    }

    // --- datos crudos (pivotables)
    const D = wb.hoja('Datos', { tab: '7F93B0' });
    const campos = Object.keys(dash.campos || {});
    D.fila(['Temporada', 'Semana', 'Lunes', 'Tipo', ...campos.map(c => dash.campos[c])], { estilo: 'header', alto: 30 });
    [cur, prev].filter(Boolean).forEach(s => {
      M.semanasDe(s).forEach(w => {
        const b = s.weeks[w] || {};
        Object.keys(b).sort().forEach(t => {
          D.fila([{ v: String(s.season), s: 'texto' }, { v: w, s: 'int' }, { v: u.weekMonday(s.week1, w), s: 'texto' }, { v: t, s: 'texto' }, ...campos.map(c => ({ v: +(b[t][c] || 0), s: 'int' }))]);
        });
      });
    });
    D.ancho([12, 9, 12, 28, ...campos.map(() => 18)]);
    D.congelar(1, 0);

    const blob = await wb.blob();
    u.descargar(blob, u.nombreArchivo(dash.titulo + '_dashboard_' + u.hoyIso()) + '.xlsx');
    u.toast('Dashboard exportado a Excel: ' + wb.hojas.length + ' hojas con tablas, fórmulas y gráficas nativas.', { tipo: 'ok' });
  }

  // =====================================================================================
  // INTERFAZ
  // =====================================================================================
  function icono(nombre) {
    const P = {
      menu: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
      excel: '<path d="M4 4h10l6 6v10a0 0 0 0 1 0 0H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 11l4 6M12 11l-4 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 14h10v6H7z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
      upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
      chev: '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      izq: '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      der: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    };
    const s = el('span', { class: 'ico', 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">' + (P[nombre] || '') + '</svg>';
    return s;
  }

  /** Menú desplegable simple */
  function menu(boton, items) {
    boton.addEventListener('click', ev => {
      ev.stopPropagation();
      cerrarMenus();
      const m = el('div', { class: 'menu', role: 'menu' });
      items.filter(Boolean).forEach(it => {
        if (it === '-') { m.appendChild(el('div', { class: 'menu-sep' })); return; }
        m.appendChild(el('button', { class: 'menu-i', role: 'menuitem', type: 'button', onclick: () => { cerrarMenus(); it.fn(); } }, it.texto));
      });
      document.body.appendChild(m);
      const r = boton.getBoundingClientRect();
      const w = m.offsetWidth;
      m.style.top = (r.bottom + window.scrollY + 6) + 'px';
      m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
      const primero = m.querySelector('button'); if (primero) primero.focus();
    });
  }
  function cerrarMenus() { u.$$('.menu').forEach(m => m.remove()); }
  document.addEventListener('click', cerrarMenus);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarMenus(); });
  window.addEventListener('resize', cerrarMenus);

  function segmentado(opciones, valor, onCambio, etiqueta) {
    const g = el('div', { class: 'seg', role: 'group', 'aria-label': etiqueta || '' });
    opciones.forEach(([v, t]) => {
      g.appendChild(el('button', { type: 'button', class: v === valor ? 'on' : '', 'aria-pressed': String(v === valor), onclick: () => onCambio(v) }, t));
    });
    return g;
  }

  function tarjeta(cfg) {
    const t = el('section', { class: 'card viz span-' + (cfg.span || 12), id: 'card-' + cfg.id });
    const titulo = el('h3', { class: 'card-t' }, cfg.titulo || '');
    const sub = el('p', { class: 'card-s' });
    const controles = el('div', { class: 'card-ctrl' });
    const btnMenu = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Opciones de exportación' }, icono('menu'));
    const cab = el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, titulo, sub), el('div', { class: 'card-hr' }, controles, btnMenu));
    const leyenda = el('div', { class: 'legend' });
    const cuerpo = el('div', { class: 'chart-box' + (cfg.alto ? ' h-' + cfg.alto : '') });
    const tablaCaja = el('div', { class: 'table-view', hidden: true });
    t.append(cab, leyenda, cuerpo, tablaCaja);
    const obj = { el: t, titulo, sub, controles, leyenda, cuerpo, tablaCaja, h: null, spec: null, verTabla: false, btnMenu };
    obj.poner = spec => {
      obj.spec = spec;
      if (!spec) { t.hidden = true; return; }
      t.hidden = false;
      titulo.textContent = spec.titulo;
      sub.textContent = spec.subtitulo || '';
      if (!obj.h) obj.h = G.crear(cuerpo, spec, leyenda);
      else obj.h.actualizar(spec);
      if (obj.verTabla) tablaCaja.replaceChildren(G.tablaDom(spec));
    };
    obj.alternarTabla = () => {
      obj.verTabla = !obj.verTabla;
      cuerpo.hidden = obj.verTabla;
      tablaCaja.hidden = !obj.verTabla;
      if (obj.verTabla && obj.spec) tablaCaja.replaceChildren(G.tablaDom(obj.spec));
    };
    menu(btnMenu, [
      { texto: 'Copiar imagen (pegar en Excel / PowerPoint)', fn: () => obj.spec && G.copiarImagen(obj.spec) },
      { texto: 'Descargar imagen PNG', fn: () => obj.spec && G.descargarPng(obj.spec) },
      '-',
      { texto: 'Copiar datos para Excel', fn: () => obj.spec && G.copiarDatos(obj.spec) },
      { texto: 'Descargar Excel con gráfica editable', fn: () => obj.spec && G.descargarExcel(obj.spec) },
      '-',
      { texto: 'Ver / ocultar tabla de datos', fn: () => obj.alternarTabla() }
    ]);
    return obj;
  }

  function montar(cont, dash) {
    let e = estadoDe(dash.id);
    let snaps = [];
    let vm = null;
    const guardar = () => { try { sessionStorage.setItem('rh-dash-' + dash.id, JSON.stringify(e)); } catch (err) { /* sin almacenamiento */ } };

    const raiz = el('div', { class: 'dash' });
    cont.replaceChildren(raiz);

    // ---------- encabezado
    const sub = el('p', { class: 'ph-sub' }, dash.descripcion);
    const frescura = el('div', { class: 'ph-meta' });
    const btnActualizar = el('a', { class: 'btn', href: '#/reporte/' + dash.reporte }, icono('upload'), 'Actualizar datos');
    const btnExcel = el('button', { class: 'btn primary', type: 'button' }, icono('excel'), 'Exportar a Excel');
    const btnPrint = el('button', { class: 'btn ghost', type: 'button', title: 'Imprimir o guardar como PDF' }, icono('print'), 'PDF');
    raiz.appendChild(el('header', { class: 'page-head' },
      el('div', { class: 'ph-l' }, el('div', { class: 'eyebrow' }, 'Dashboard'), el('h1', { class: 'ph-t' }, dash.titulo), sub, frescura),
      el('div', { class: 'ph-r' }, btnActualizar, btnExcel, btnPrint)));
    btnExcel.addEventListener('click', async () => {
      if (!vm || vm.vacio) return;
      btnExcel.disabled = true;
      try { await exportarExcel(vm); } catch (err) { console.error(err); u.toast('No se pudo exportar: ' + err.message, { tipo: 'error' }); }
      btnExcel.disabled = false;
    });
    btnPrint.addEventListener('click', () => window.print());

    const avisoDemo = el('div', { class: 'banner banner-demo', hidden: true },
      el('strong', null, 'DEMOSTRACIÓN · '), 'Estás viendo datos ficticios. Procesa el reporte real y la demostración se retira sola.');
    raiz.appendChild(avisoDemo);

    // ---------- vacío
    const vacio = el('div', { class: 'empty', hidden: true });
    raiz.appendChild(vacio);

    // ---------- filtros
    const filtros = el('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filtros del dashboard' });
    const resumenFiltro = el('div', { class: 'filters-sum' });
    raiz.appendChild(el('div', { class: 'filters-wrap' }, filtros, resumenFiltro));

    // ---------- KPIs
    const kpiCaja = el('div', { class: 'kpis' });
    raiz.appendChild(kpiCaja);

    // ---------- rejilla
    const grid = el('div', { class: 'grid' });
    raiz.appendChild(grid);
    const cSemanal = tarjeta({ id: 'semanal', span: 8, alto: 'l' });
    const cHall = el('section', { class: 'card span-4 insights' }, el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Lectura rápida'), el('p', { class: 'card-s' }, 'Hallazgos calculados automáticamente'))));
    const hallLista = el('ul', { class: 'ins-list' });
    cHall.appendChild(hallLista);
    const cVar = tarjeta({ id: 'variacion', span: 6 });
    const cTipo = tarjeta({ id: 'tipos', span: 6 });
    const cPart = tarjeta({ id: 'participacion', span: 6 });
    const cMezcla = tarjeta({ id: 'mezcla', span: 6 });
    const cCalor = el('section', { class: 'card span-12 heat-card' });
    const cDet = el('section', { class: 'card span-12 table-card' });
    const cRep = el('section', { class: 'card span-12 table-card rep-card', id: 'card-tabla-reporte' });
    grid.append(cSemanal.el, cHall, cVar.el, cTipo.el, cPart.el, cMezcla.el, cCalor, cDet, cRep);

    // controles dentro de tarjetas
    function ponerControles() {
      cSemanal.controles.replaceChildren(segmentado([['semanal', 'Semanal'], ['acumulado', 'Acumulado']], e.vista, v => { e.vista = v; cambio(); }, 'Vista'));
      if (vm && vm.fmtM !== 'pct') cVar.controles.replaceChildren(segmentado([['abs', 'Δ'], ['pct', 'Δ %']], e.varModo, v => { e.varModo = v; cambio(); }, 'Unidad de variación'));
      else cVar.controles.replaceChildren();
      cMezcla.controles.replaceChildren(segmentado([['abs', 'Volumen'], ['pct', '% del total']], e.mezclaPct ? 'pct' : 'abs', v => { e.mezclaPct = v === 'pct'; cambio(); }, 'Unidad de mezcla'));
    }

    function cambio() { guardar(); render(); }

    // ---------- filtros: construcción
    function pintarFiltros() {
      filtros.replaceChildren();
      const temps = vm.temporadas;
      const optTemp = (s, sel) => el('option', { value: s.id, selected: s.id === sel }, s.season + (s.demo ? ' (demo)' : ''));
      const selCur = el('select', { 'aria-label': 'Temporada actual' }, temps.map(s => optTemp(s, vm.cur.id)));
      selCur.addEventListener('change', () => { e.cur = selCur.value; if (e.prev === selCur.value) e.prev = null; cambio(); });
      const selPrev = el('select', { 'aria-label': 'Temporada de comparación' },
        temps.filter(s => s.id !== vm.cur.id).map(s => optTemp(s, vm.prev && vm.prev.id)),
        el('option', { value: 'none', selected: !vm.prev }, 'Sin comparar'));
      selPrev.addEventListener('change', () => { e.prev = selPrev.value; cambio(); });
      filtros.appendChild(el('div', { class: 'f-g' }, el('span', { class: 'f-l' }, 'Comparar'), el('div', { class: 'f-row' }, selCur, el('span', { class: 'f-vs' }, 'vs'), selPrev)));

      filtros.appendChild(el('div', { class: 'f-g' }, el('span', { class: 'f-l' }, 'Métrica'),
        segmentado(dash.metricas.map(m => [m.id, m.etiqueta]), vm.metrica.id, v => { e.metrica = v; cambio(); }, 'Métrica')));

      const periodo = el('div', { class: 'f-row' });
      periodo.appendChild(segmentado([['rango', 'Rango'], ['semana', 'Una semana']], vm.modo, v => { e.modo = v; cambio(); }, 'Tipo de periodo'));
      const opcSemana = w => {
        const l = vm.cur.week1 ? u.fmtDia(u.weekMonday(vm.cur.week1, w)) : '';
        return 'S' + w + (l ? ' · ' + l : '') + (vm.parcial && vm.parcial.semana === w ? ' *' : '') + (w > vm.ultCur ? ' (sin datos ' + vm.cur.season + ')' : '');
      };
      if (vm.modo === 'rango') {
        const selPreset = el('select', { 'aria-label': 'Periodo predefinido' }, PRESETS.map(([k, t]) => el('option', { value: k, selected: k === (e.preset || 'fecha') }, t)));
        selPreset.addEventListener('change', () => { e.preset = selPreset.value; if (e.preset === 'custom') { e.desde = vm.desde; e.hasta = vm.hasta; } cambio(); });
        const selD = el('select', { 'aria-label': 'Desde la semana' }, u.rango(1, vm.maxW).map(w => el('option', { value: w, selected: w === vm.desde }, opcSemana(w))));
        const selH = el('select', { 'aria-label': 'Hasta la semana' }, u.rango(1, vm.maxW).map(w => el('option', { value: w, selected: w === vm.hasta }, opcSemana(w))));
        selD.addEventListener('change', () => { e.preset = 'custom'; e.desde = +selD.value; e.hasta = Math.max(+selD.value, vm.hasta); cambio(); });
        selH.addEventListener('change', () => { e.preset = 'custom'; e.hasta = +selH.value; e.desde = Math.min(vm.desde, +selH.value); cambio(); });
        periodo.append(selPreset, el('span', { class: 'f-vs' }, 'de'), selD, el('span', { class: 'f-vs' }, 'a'), selH);
      } else {
        const selS = el('select', { 'aria-label': 'Semana' }, u.rango(1, vm.maxW).map(w => el('option', { value: w, selected: w === vm.semana }, opcSemana(w))));
        selS.addEventListener('change', () => { e.semana = +selS.value; cambio(); });
        const ant = el('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Semana anterior', disabled: vm.semana <= 1 }, icono('izq'));
        const sig = el('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Semana siguiente', disabled: vm.semana >= vm.maxW }, icono('der'));
        ant.addEventListener('click', () => { e.semana = Math.max(1, vm.semana - 1); cambio(); });
        sig.addEventListener('click', () => { e.semana = Math.min(vm.maxW, vm.semana + 1); cambio(); });
        periodo.append(ant, selS, sig);
      }
      filtros.appendChild(el('div', { class: 'f-g' }, el('span', { class: 'f-l' }, 'Periodo'), periodo));

      // tipos (multiselección)
      if (vm.tiposTodos.length > 1) {
        const btnTipos = el('button', { class: 'select-btn', type: 'button', 'aria-haspopup': 'true' }, vm.filtroTipos, icono('chev'));
        btnTipos.addEventListener('click', ev => {
          ev.stopPropagation();
          cerrarMenus();
          const m = el('div', { class: 'menu menu-check', role: 'menu', onclick: ev2 => ev2.stopPropagation() });
          const sel = new Set(vm.tiposSel ? [...vm.tiposSel] : vm.tiposTodos);
          const aplicar = () => { e.tiposExcluidos = vm.tiposTodos.filter(t => !sel.has(t)); cambio(); };
          m.appendChild(el('div', { class: 'menu-tools' },
            el('button', { type: 'button', onclick: () => { vm.tiposTodos.forEach(t => sel.add(t)); u.$$('input', m).forEach(i => { i.checked = true; }); aplicar(); } }, 'Todos'),
            el('button', { type: 'button', onclick: () => { sel.clear(); sel.add(vm.rankTipos[0] || vm.tiposTodos[0]); u.$$('input', m).forEach(i => { i.checked = sel.has(i.value); }); aplicar(); } }, 'Solo el principal')));
          vm.tiposTodos.forEach(t => {
            const cb = el('input', { type: 'checkbox', value: t, checked: sel.has(t) });
            cb.addEventListener('change', () => { if (cb.checked) sel.add(t); else if (sel.size > 1) sel.delete(t); else cb.checked = true; aplicar(); });
            m.appendChild(el('label', { class: 'menu-c' }, cb, el('span', null, t)));
          });
          document.body.appendChild(m);
          const r = btnTipos.getBoundingClientRect();
          m.style.top = (r.bottom + window.scrollY + 6) + 'px';
          m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
        });
        filtros.appendChild(el('div', { class: 'f-g' }, el('span', { class: 'f-l' }, 'Tipo de asignación'), btnTipos));
      }

      (dash.opciones || []).forEach(o => {
        const cb = el('input', { type: 'checkbox', role: 'switch', checked: !!vm.opts[o.id] });
        cb.addEventListener('change', () => { e.opciones = Object.assign({}, e.opciones, { [o.id]: cb.checked }); cambio(); });
        filtros.appendChild(el('div', { class: 'f-g' }, el('span', { class: 'f-l' }, 'Opciones'), el('label', { class: 'switch', title: o.ayuda || '' }, cb, el('span', { class: 'sw' }), el('span', null, o.etiqueta))));
      });

      const btnReset = filtrosActivos(e) ? el('button', { class: 'chip chip-btn', type: 'button', title: 'Volver a los filtros iniciales' }, '↺ Restablecer filtros') : null;
      if (btnReset) btnReset.addEventListener('click', () => { e = Object.assign({}, ESTADO_INICIAL, { vista: e.vista, calor: e.calor, varModo: e.varModo, mezclaPct: e.mezclaPct }); cambio(); });
      const avisoOpc = (vm.opcionesDistintas || []).map(o => el('span', { class: 'chip chip-warn', title: 'Cada temporada se calcula con la opción con que se procesó, igual que su HTML. Usa el interruptor para igualarlas.' },
        '«' + o.etiqueta + '»: ' + vm.cur.season + ' = ' + (vm.opts[o.id] ? 'Sí' : 'No') + ', ' + vm.prev.season + ' = ' + (vm.optsPrev[o.id] ? 'Sí' : 'No')));
      const forzadas = (dash.opciones || []).filter(o => o.id in vm.override).map(o => el('span', { class: 'chip chip-warn' }, '«' + o.etiqueta + '» forzado a ' + (vm.override[o.id] ? 'Sí' : 'No') + ' en ambas temporadas'));
      resumenFiltro.replaceChildren(...[
        el('span', { class: 'chip' }, vm.periodo),
        el('span', { class: 'chip' }, vm.comparando),
        vm.tiposSel ? el('span', { class: 'chip' }, vm.filtroTipos) : null,
        ...avisoOpc, ...forzadas,
        vm.fueraCur ? el('span', { class: 'chip chip-warn', title: 'Hay filas con fechas que caen en semanas mayores a ' + M.MAX_SEMANA + ' (probablemente un año mal capturado). No se grafican; aparecen en la «Tabla del reporte».' }, vm.fueraCur + ' semana(s) fuera de rango en ' + vm.cur.season) : null,
        btnReset,
        vm.parcial ? el('span', { class: 'chip chip-warn', title: 'La última semana con datos todavía no termina' }, '* S' + vm.parcial.semana + ' parcial · datos al ' + u.fmtFecha(vm.parcial.corte)) : null].filter(Boolean));
    }

    // ---------- KPIs
    function pintarKpis() {
      kpiCaja.replaceChildren(...vm.kpis.map(k => {
        const valor = k.valorTexto != null ? k.valorTexto : (k.aprox ? '≈ ' : '') + G.fmtValor(k.valor, k.formato);
        const d = k.delta;
        return el('div', { class: 'kpi' + (k.hero ? ' kpi-hero' : ''), title: k.ayuda || '' },
          el('div', { class: 'kpi-l' }, k.etiqueta),
          el('div', { class: 'kpi-v' }, valor),
          d ? el('div', { class: 'kpi-d ' + (d.signo > 0 ? 'up' : d.signo < 0 ? 'down' : 'flat') },
            el('span', { class: 'kpi-arrow', 'aria-hidden': 'true' }, d.signo > 0 ? '▲' : d.signo < 0 ? '▼' : '■'),
            el('span', null, d.texto), d.sub ? el('span', { class: 'kpi-ds' }, d.sub) : null) : null,
          k.nota ? el('div', { class: 'kpi-n' }, k.nota) : null);
      }));
    }

    function pintarHallazgos() {
      hallLista.replaceChildren(...vm.hallazgos.map(h => el('li', { class: 'ins ins-' + h.ico },
        el('span', { class: 'ins-i', 'aria-hidden': 'true' }, { up: '▲', down: '▼', flat: '■', star: '★', warn: '!', info: 'i' }[h.ico] || '•'),
        el('span', null, ...h.partes.map(p => typeof p === 'string' ? p : el('strong', null, p.b))))));
    }

    // ---------- mapa de calor
    function pintarCalor() {
      const c = vm.calor;
      const modoCalor = (e.calor === 'prev' && vm.prev) ? 'prev' : (e.calor === 'delta' && vm.prev) ? 'delta' : 'cur';
      const opciones = [['cur', vm.cur.season]].concat(vm.prev ? [['prev', vm.prev.season], ['delta', 'Variación']] : []);
      const ctrl = segmentado(opciones, modoCalor, v => { e.calor = v; cambio(); }, 'Datos del mapa');
      const btnCopiar = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Opciones de exportación' }, icono('menu'));
      const titulo = 'Mapa de calor · ' + vm.metrica.etiqueta + ' por tipo y semana';
      cCalor.replaceChildren(el('header', { class: 'card-h' },
        el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, titulo), el('p', { class: 'card-s' }, (modoCalor === 'delta' ? 'Variación ' + vm.comparando : 'Temporada ' + (modoCalor === 'prev' ? vm.prev.season : vm.cur.season)) + ' · ' + vm.periodo)),
        el('div', { class: 'card-hr' }, ctrl, btnCopiar)));

      const mat = modoCalor === 'cur' ? c.cur : modoCalor === 'prev' ? c.prev
        : c.cur.map((fila, k) => fila.map((x, i) => x != null && c.prev[k][i] != null ? (vm.fmtM === 'pct' ? x - c.prev[k][i] : x - c.prev[k][i]) : null));
      const tot = modoCalor === 'cur' ? c.totCur : modoCalor === 'prev' ? c.totPrev
        : c.totCur.map((x, i) => x != null && c.totPrev[i] != null ? x - c.totPrev[i] : null);
      const fmtCelda = modoCalor === 'delta' ? (vm.fmtM === 'pct' ? 'pp' : 'dInt') : vm.fmtM;
      let max = 0;
      mat.forEach(f => f.forEach(x => { if (x != null) max = Math.max(max, Math.abs(x)); }));
      const mostrarNumeros = c.semanas.length <= 18;
      const tabla = el('table', { class: 'heat' + (mostrarNumeros ? '' : ' compact') });
      tabla.appendChild(el('thead', null, el('tr', null, el('th', { class: 'h-tipo' }, 'Tipo'),
        c.semanas.map((w, i) => el('th', { class: vm.resaltar === i ? 'hl' : '', title: c.categoriasLargas[i] }, c.categorias[i])))));
      const tb = el('tbody');
      c.tipos.forEach((t, k) => {
        const tr = el('tr', null, el('th', { class: 'h-tipo', scope: 'row', title: t }, t));
        mat[k].forEach((x, i) => {
          const td = el('td', { class: vm.resaltar === i ? 'hl' : '' });
          if (x != null) {
            const r = max ? Math.abs(x) / max : 0;
            const nivel = Math.min(6, Math.round(r * 6));
            td.dataset.n = nivel;
            if (modoCalor === 'delta') td.classList.add(x > 0 ? 'pos' : x < 0 ? 'neg' : 'cero');
            if (mostrarNumeros) td.textContent = G.fmtValor(x, fmtCelda).replace(' %', '%').replace(' pp', '');
            td.title = t + ' · ' + c.categoriasLargas[i] + ': ' + G.fmtValor(x, fmtCelda);
          } else td.classList.add('nd');
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      const trT = el('tr', { class: 'tot' }, el('th', { class: 'h-tipo', scope: 'row' }, 'Total'));
      tot.forEach((x, i) => trT.appendChild(el('td', { class: vm.resaltar === i ? 'hl' : '', title: 'Total · ' + c.categoriasLargas[i] + ': ' + G.fmtValor(x, fmtCelda) }, mostrarNumeros && x != null ? G.fmtValor(x, fmtCelda).replace(' %', '%').replace(' pp', '') : '')));
      tb.appendChild(trT);
      tabla.appendChild(tb);
      const escala = el('div', { class: 'heat-scale' },
        el('span', null, modoCalor === 'delta' ? 'Disminución' : 'Menor'),
        el('span', { class: 'heat-ramp ' + (modoCalor === 'delta' ? 'div' : 'seq') }),
        el('span', null, modoCalor === 'delta' ? 'Aumento' : 'Mayor'),
        mostrarNumeros ? null : el('span', { class: 'muted' }, ' · pasa el cursor sobre una celda para ver su valor'));
      cCalor.append(el('div', { class: 'heat-wrap' }, tabla), escala);

      const specCalor = {
        titulo, subtitulo: vm.periodo, ejeX: 'Tipo', categorias: c.tipos.concat(['Total']), categoriasLargas: c.tipos.concat(['Total']),
        formato: fmtCelda, tipo: 'colStacked',
        series: c.semanas.map((w, i) => ({ nombre: 'S' + w, valores: mat.map(f => f[i]).concat([tot[i]]) })),
        archivo: vm.dash.titulo + '_mapa_de_calor'
      };
      menu(btnCopiar, [
        { texto: 'Copiar datos para Excel', fn: () => G.copiarDatos(specCalor) },
        { texto: 'Exportar dashboard completo a Excel', fn: () => btnExcel.click() }
      ]);
    }

    // ---------- tabla de detalle
    function pintarDetalle() {
      const prev = vm.prev, pct = vm.fmtM === 'pct';
      const f = x => G.fmtValor(x, vm.fmtM);
      const cab = ['Semana', 'Lunes ' + vm.cur.season].concat(prev ? ['Lunes ' + prev.season, prev.season, vm.cur.season, pct ? 'Δ pp' : 'Δ', pct ? null : 'Δ %', 'Acum. ' + prev.season, 'Acum. ' + vm.cur.season, pct ? 'Δ acum. pp' : 'Δ acum. %'] : [vm.cur.season, 'Acum. ' + vm.cur.season]).filter(Boolean);
      const t = el('table', { class: 'tbl tbl-det' });
      t.appendChild(el('thead', null, el('tr', null, cab.map((c, i) => el('th', { class: i > 1 ? 'num' : '' }, c)))));
      const tb = el('tbody');
      const tsv = [cab.join('\t')];
      const dCls = x => x == null ? '' : x > 0 ? 'up' : x < 0 ? 'down' : 'flat';
      vm.detalle.forEach((d, i) => {
        const celdas = [['Semana ' + d.w + (d.parcial ? ' *' : ''), ''], [u.fmtFecha(d.lunesCur), '']];
        const crudo = ['Semana ' + d.w + (d.parcial ? ' (parcial)' : ''), d.lunesCur || ''];
        if (prev) {
          celdas.push([u.fmtFecha(d.lunesPrev), ''], [f(d.prev), 'num'], [f(d.cur), 'num strong'],
            [pct ? u.fmtPp(d.d) : u.fmtSignedInt(d.d), 'num ' + dCls(d.d)]);
          crudo.push(d.lunesPrev || '', num(d.prev), num(d.cur), pct ? num(d.d == null ? null : d.d * 100, 1) : num(d.d));
          if (!pct) { celdas.push([u.fmtSignedPct(d.p), 'num ' + dCls(d.p)]); crudo.push(d.p == null ? '' : (Math.round(d.p * 1000) / 10) + '%'); }
          celdas.push([f(d.acPrev), 'num'], [f(d.acCur), 'num'], [pct ? u.fmtPp(d.pAc) : u.fmtSignedPct(d.pAc), 'num ' + dCls(d.pAc)]);
          crudo.push(num(d.acPrev), num(d.acCur), d.pAc == null ? '' : pct ? num(d.pAc * 100, 1) : (Math.round(d.pAc * 1000) / 10) + '%');
        } else {
          celdas.push([f(d.cur), 'num strong'], [f(d.acCur), 'num']);
          crudo.push(num(d.cur), num(d.acCur));
        }
        tsv.push(crudo.join('\t'));
        tb.appendChild(el('tr', { class: (vm.resaltar === i ? 'hl' : '') + (d.cur == null ? ' nd' : '') }, celdas.map(([x, cls]) => el('td', { class: cls }, x))));
      });
      if (!pct && vm.modo === 'rango' && vm.detalle.length > 1) {
        const comp = vm.detalle.filter(d => d.cur != null && (!prev || d.prev != null));
        const sP = u.sum(comp.map(d => d.prev)), sC = u.sum(comp.map(d => d.cur));
        const tr = el('tr', { class: 'tot' }, el('td', null, 'Total comparable'), el('td', null, ''));
        if (prev) tr.append(el('td', null, ''), el('td', { class: 'num' }, f(sP)), el('td', { class: 'num' }, f(sC)), el('td', { class: 'num ' + dCls(sC - sP) }, u.fmtSignedInt(sC - sP)), el('td', { class: 'num ' + dCls(sC - sP) }, u.fmtSignedPct(u.variacion(sC, sP))), el('td', null, ''), el('td', null, ''), el('td', null, ''));
        else tr.append(el('td', { class: 'num' }, f(sC)), el('td', null, ''));
        tb.appendChild(tr);
      }
      t.appendChild(tb);
      function num(x, dec) { return x == null ? '' : String(dec ? Math.round(x * 10) / 10 : Math.round(x * 10000) / 10000); }

      const btnCopiar = el('button', { class: 'btn sm', type: 'button' }, 'Copiar tabla');
      btnCopiar.addEventListener('click', async () => {
        const ok = await u.copiarTabla(tsv.join('\n'), '<table>' + t.innerHTML + '</table>');
        u.toast(ok ? 'Tabla copiada. Pégala en Excel con Ctrl+V.' : 'No se pudo copiar.', { tipo: ok ? 'ok' : 'error' });
      });
      const btnX = el('button', { class: 'btn sm', type: 'button' }, 'Excel');
      btnX.addEventListener('click', () => btnExcel.click());
      cDet.replaceChildren(el('header', { class: 'card-h' },
        el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Detalle semanal · ' + vm.metrica.etiqueta), el('p', { class: 'card-s' }, vm.periodo + ' · ' + vm.comparando + (vm.tiposSel ? ' · ' + vm.filtroTipos : ''))),
        el('div', { class: 'card-hr' }, btnCopiar, btnX)),
        el('div', { class: 'table-wrap' }, t));
    }

    // ---------- frescura de datos
    function pintarFrescura() {
      const cur = vm.cur;
      const m = cur.meta || {};
      const partes = [];
      partes.push(el('span', { class: 'dot ' + (cur.demo ? 'dot-demo' : 'dot-ok') }));
      partes.push(el('span', null, 'Temporada ' + cur.season + ': ' + (cur.demo ? 'datos de demostración' : 'actualizada ' + u.fmtFechaHora(m.procesado || cur.updatedAt))));
      if (m.archivo && m.archivo.nombre && !cur.demo) partes.push(el('span', { class: 'muted' }, ' · ' + m.archivo.nombre));
      if (vm.prev) partes.push(el('span', { class: 'muted' }, ' · Comparada con ' + vm.prev.season + (vm.prev.meta && vm.prev.meta.origen === 'compartida' ? ' (base compartida)' : '')));
      frescura.replaceChildren(...partes);
      if (dash.id === 'homeship' && cur.meta && cur.meta.config && cur.meta.config.palabra && cur.meta.config.palabra !== 'HOMESHIP') {
        sub.textContent = dash.descripcion + ' (Ojo: esta temporada se procesó con la palabra «' + cur.meta.config.palabra + '»).';
      } else sub.textContent = dash.descripcion;
    }

    // ---------- estados vacíos
    function pintarVacio() {
      const pendiente = dash.estado === 'pendiente';
      const rep = RH.registro.reporte(dash.reporte);
      vacio.replaceChildren(...[
        el('div', { class: 'empty-art', 'aria-hidden': 'true', html: '<svg viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="46" width="14" height="28" rx="3" fill="currentColor" opacity=".25"/><rect x="28" y="34" width="14" height="40" rx="3" fill="currentColor" opacity=".4"/><rect x="50" y="22" width="14" height="52" rx="3" fill="currentColor" opacity=".55"/><rect x="72" y="30" width="14" height="44" rx="3" fill="currentColor" opacity=".7"/><rect x="94" y="12" width="14" height="62" rx="3" fill="currentColor"/></svg>' }),
        el('h2', null, pendiente ? 'El reporte de ' + dash.titulo + ' está por integrarse' : 'Aún no hay datos para ' + dash.titulo),
        pendiente
          ? el('p', null, 'Este tablero ya está reservado y tiene listo todo el análisis (comparativo entre temporadas, rangos de semanas, exportación a Excel). En cuanto se agregue el archivo del reporte de Gowns aparecerá aquí y en el menú «Reportes».')
          : el('p', null, 'Procesa el CSV con el reporte «' + (rep ? rep.titulo : '') + '» y pulsa «Guardar en el dashboard». Hazlo una vez con el archivo del año pasado y otra con el de este año: quedan guardados en esta computadora (y, si quieres, en un Excel compartido) para no volver a cargarlos.'),
        pendiente ? null : el('ol', { class: 'steps' },
          el('li', null, el('strong', null, 'Temporada anterior: '), 'elige el CSV del año pasado y su lunes de la semana 1.'),
          el('li', null, el('strong', null, 'Temporada actual: '), 'repite con el CSV de este año; actualízalo cada vez que exportes datos nuevos.'),
          el('li', null, el('strong', null, 'Compara: '), 'rangos de semanas, una semana puntual, tipos de asignación y exporta a Excel.')),
        el('div', { class: 'empty-actions' },
          !pendiente && rep && rep.archivo ? el('a', { class: 'btn primary', href: '#/reporte/' + rep.id }, icono('upload'), 'Ir al reporte') : null,
          !pendiente ? el('button', { class: 'btn', type: 'button', onclick: async () => { const n = await RH.demo.cargar(); if (n) u.toast('Datos de demostración cargados.', { tipo: 'ok' }); } }, 'Ver con datos de demostración') : null,
          el('a', { class: 'btn ghost', href: '#/datos' }, 'Importar base desde Excel'))].filter(Boolean));
    }

    // ---------- render principal
    function render() {
      vm = calcular(dash, snaps, e);
      const hayDatos = !vm.vacio && dash.estado !== 'pendiente';
      vacio.hidden = hayDatos;
      [filtros.parentElement, kpiCaja, grid].forEach(n => { n.hidden = !hayDatos; });
      btnExcel.hidden = btnPrint.hidden = !hayDatos;
      btnActualizar.hidden = dash.estado === 'pendiente';
      if (!hayDatos) { pintarVacio(); frescura.replaceChildren(); avisoDemo.hidden = true; return; }
      avisoDemo.hidden = !(vm.cur.demo || (vm.prev && vm.prev.demo));
      pintarFrescura();
      pintarFiltros();
      ponerControles();
      pintarKpis();
      pintarHallazgos();
      cSemanal.poner(vm.specs.semanal);
      cVar.poner(vm.specs.variacion);
      cTipo.poner(vm.specs.tipos);
      cTipo.cuerpo.style.height = Math.max(240, 70 + vm.specs.tipos.categorias.length * (vm.prev ? 44 : 30)) + 'px';
      if (cTipo.h && cTipo.h.chart) cTipo.h.chart.resize();
      cPart.poner(vm.specs.participacion);
      cMezcla.poner(vm.specs.mezcla);
      pintarCalor();
      pintarDetalle();
      pintarTablaReporte();
    }

    // ---------- tabla idéntica a la del HTML del reporte (conciliación)
    function pintarTablaReporte() {
      const fn = RH.tablas && RH.tablas[dash.dataset];
      if (!fn) { cRep.hidden = true; return; }
      cRep.hidden = false;
      const usarPrev = e.tablaTemp === 'prev' && vm.prev;
      const snap = usarPrev ? vm.prev : vm.cur;
      const incluir = !!vm.optsDe(snap).incluirCeros;
      const t = fn(snap, incluir);
      const opciones = [['cur', vm.cur.season]].concat(vm.prev ? [['prev', vm.prev.season]] : []);
      const ctrl = segmentado(opciones, usarPrev ? 'prev' : 'cur', v => { e.tablaTemp = v; cambio(); }, 'Temporada de la tabla');
      const btnCopiar = el('button', { class: 'btn sm primary', type: 'button' }, 'Copiar tabla (para pegar en Excel)');
      btnCopiar.addEventListener('click', async () => {
        const ok = await u.copiarTexto(t.tsv);
        u.toast(ok ? 'Tabla copiada: es el mismo texto que copia el botón del reporte. Pégala en Excel con Ctrl+V.' : 'No se pudo copiar.', { tipo: ok ? 'ok' : 'error' });
      });
      const m = snap.meta || {};
      const rep = RH.registro.reporte(dash.reporte);
      const tabla = el('table', { class: 'tbl tbl-rep' });
      const [enc, ...filas] = t.lineas;
      tabla.appendChild(el('thead', null, el('tr', null, enc.map((h, i) => el('th', { class: i > 1 ? 'num' : '' }, h)))));
      const tb = el('tbody');
      filas.forEach((f, k) => {
        const total = k === filas.length - 1;
        tb.appendChild(el('tr', { class: total ? 'tot' : f[0] === 'N/A' ? 'na' : '' }, f.map((c, i) => el('td', { class: i > 1 ? 'num' : '' }, i > 1 ? u.fmtInt(c) : String(c)))));
      });
      tabla.appendChild(tb);
      cRep.replaceChildren(
        el('header', { class: 'card-h' },
          el('div', { class: 'card-hl' },
            el('h3', { class: 'card-t' }, 'Tabla del reporte · temporada ' + snap.season),
            el('p', { class: 'card-s' }, 'Idéntica a la tabla del HTML «' + (rep ? rep.titulo : '') + '» para el mismo archivo: mismas columnas, fila N/A y TOTAL (todo el archivo, sin filtros de periodo ni de tipo).')),
          el('div', { class: 'card-hr' }, ctrl, btnCopiar)),
        el('p', { class: 'rep-meta' },
          'Lunes de la semana 1: ', el('strong', null, u.fmtFecha(snap.week1)),
          ' · «Incluir filas con todo en 0»: ', el('strong', null, incluir ? 'Sí' : 'No'),
          m.archivo && m.archivo.nombre ? ' · Archivo: ' + m.archivo.nombre + (m.archivo.hoja ? ' (hoja ' + m.archivo.hoja + ')' : '') : '',
          m.procesado ? ' · Procesado: ' + u.fmtFechaHora(m.procesado) : '',
          snap.demo ? ' · DATOS DE DEMOSTRACIÓN' : ''),
        el('p', { class: 'rep-concilia' }, t.concilia),
        el('div', { class: 'table-wrap' }, tabla));
    }

    return {
      actualizar(lista) { snaps = lista; render(); },
      retematizar() { [cSemanal, cVar, cTipo, cPart, cMezcla].forEach(c => c.h && c.h.retematizar()); },
      get vm() { return vm; }
    };
  }

  RH.dashboard = { montar, calcular, exportarExcel, icono, menu, segmentado };
})(window.RH = window.RH || {});
