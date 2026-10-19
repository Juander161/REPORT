/* Report Hub · "Tabla del reporte": reconstruye, a partir de una temporada
   guardada, EXACTAMENTE la misma tabla (y el mismo texto para pegar en Excel)
   que muestran los HTML originales: mismas columnas, mismo orden de tipos,
   misma fila N/A y misma fila TOTAL. Sirve para conciliar el dashboard con el
   reporte celda por celda. */
(function (RH) {
  'use strict';
  const DIA = 86400000;

  /** Recrea el Map(semana -> Map(tipo -> campos)) y el Set de tipos del reporte */
  function mapa(snap) {
    const datos = new Map();
    const tipos = new Set();
    // las semanas se insertan en orden numérico; el reporte las ordena igual
    Object.keys(snap.weeks || {}).map(Number).filter(isFinite).sort((a, b) => a - b).forEach(w => {
      const mt = new Map();
      Object.entries(snap.weeks[w]).forEach(([t, c]) => { mt.set(t, c); tipos.add(t); });
      datos.set(w, mt);
    });
    if (snap.na) {
      const mt = new Map();
      Object.entries(snap.na).forEach(([t, c]) => { mt.set(t, c); tipos.add(t); });
      datos.set('N/A', mt);
    }
    return { datos, tipos };
  }

  const SEMANAS_TEMPORADA = 52;
  /** Semanas 1..52 siempre (con ceros si no hay datos) y, si existen, las posteriores con datos */
  function semanasTabla(datos) {
    const hay = [...datos.keys()].filter(k => k !== 'N/A').map(Number);
    const fin = Math.max(SEMANAS_TEMPORADA, ...hay);
    return Array.from({ length: fin }, (_, i) => i + 1);
  }

  function lunesDe(snap, w) {
    const inicio = Date.parse(snap.week1);
    return w === 'N/A' ? '-' : new Date(inicio + (w - 1) * 7 * DIA).toISOString().slice(0, 10);
  }

  // ---- réplica de render() de reportes/originales/CREARR2.html
  function tasselOnly(snap, incluir) {
    const { datos, tipos } = mapa(snap);
    const listaTipos = [...tipos].sort();
    const semanas = semanasTabla(datos);
    if (datos.has('N/A')) semanas.unshift('N/A');   // lo previo a la semana 1 va primero
    const enc = ['Semana', 'Inicio (lunes)'];
    listaTipos.forEach(t => enc.push(t + ' Tassels Only'));
    enc.push('Total Tassels Only', 'Órdenes totales');
    const lineas = [enc];
    const acum = new Array(listaTipos.length + 2).fill(0);
    let totTO = 0, totCeros = 0, totFilas = 0;
    for (const w of semanas) {
      const mt = datos.get(w) || new Map();   // semana sin datos = ceros
      const r = [w === 'N/A' ? 'N/A' : 'Semana ' + w, lunesDe(snap, w)];
      let tot = 0, ord = 0;
      listaTipos.forEach((t, i) => {
        const o = mt.get(t) || { to: 0, ceros: 0, filas: 0 };
        const v = (o.to || 0) + (incluir ? (o.ceros || 0) : 0);
        r.push(v); tot += v; ord += (o.filas || 0);
        acum[i] += v;
        totTO += (o.to || 0); totCeros += (o.ceros || 0); totFilas += (o.filas || 0);
      });
      r.push(tot, ord);
      acum[listaTipos.length] += tot;
      acum[listaTipos.length + 1] += ord;
      lineas.push(r);
    }
    lineas.push(['TOTAL', '', ...acum]);
    return {
      lineas,
      tsv: lineas.map(l => l.join('\t')).join('\n'),
      concilia: 'Con alguna columna objetivo > 0 y las demás en 0: ' + totTO.toLocaleString() +
        ' | Con todo en 0: ' + totCeros.toLocaleString() +
        ' | Suma de ambos (equivale al filtro manual): ' + (totTO + totCeros).toLocaleString() +
        ' | Órdenes totales del archivo: ' + totFilas.toLocaleString()
    };
  }

  // ---- réplica de render() de reportes/originales/filtro_menos_tassels.html
  function homeship(snap, incluir) {
    const { datos, tipos } = mapa(snap);
    const P = (snap.meta && snap.meta.config && snap.meta.config.palabra) || 'HOMESHIP';
    const listaTipos = [...tipos].sort();
    const semanas = semanasTabla(datos);
    if (datos.has('N/A')) semanas.unshift('N/A');   // lo previo a la semana 1 va primero
    const enc = ['Semana', 'Inicio (lunes)'];
    listaTipos.forEach(t => enc.push(t + ' ' + P, t + ' Tassels Only', t + ' Resta'));
    enc.push('Total ' + P, 'Total Tassels Only', 'Total Resta');
    const n = listaTipos.length;
    const acum = new Array(3 * n + 3).fill(0);
    const lineas = [enc];
    let totHS = 0, totTO = 0, totCeros = 0;
    for (const w of semanas) {
      const mt = datos.get(w) || new Map();   // semana sin datos = ceros
      const r = [w === 'N/A' ? 'N/A' : 'Semana ' + w, lunesDe(snap, w)];
      let sHS = 0, sTO = 0;
      listaTipos.forEach((t, i) => {
        const o = mt.get(t) || { hs: 0, to: 0, ceros: 0 };
        const hs = o.hs || 0;
        const to = (o.to || 0) + (incluir ? (o.ceros || 0) : 0);
        const resta = hs - to;
        r.push(hs, to, resta);
        acum[3 * i] += hs; acum[3 * i + 1] += to; acum[3 * i + 2] += resta;
        sHS += hs; sTO += to;
        totHS += hs; totTO += (o.to || 0); totCeros += (o.ceros || 0);
      });
      r.push(sHS, sTO, sHS - sTO);
      acum[3 * n] += sHS; acum[3 * n + 1] += sTO; acum[3 * n + 2] += sHS - sTO;
      lineas.push(r);
    }
    lineas.push(['TOTAL', '', ...acum]);
    const toAplicado = totTO + (incluir ? totCeros : 0);
    return {
      lineas,
      tsv: lineas.map(l => l.join('\t')).join('\n'),
      concilia: 'Filas con ' + P + ': ' + totHS.toLocaleString() +
        ' | Tassels Only dentro del filtro (restadas): ' + toAplicado.toLocaleString() +
        ' | Resta (' + P + ' sin Tassels Only): ' + (totHS - toAplicado).toLocaleString() +
        ' | Filas con todo en 0 dentro del filtro: ' + totCeros.toLocaleString() +
        (incluir ? ' (incluidas en la resta)' : ' (NO incluidas en la resta)')
    };
  }

  // ---- GOWNS: una columna por tipo (GREG, COLL…), valores = cantidades (sum) u órdenes (count)
  function gowns(snap) {
    const { datos, tipos } = mapa(snap);
    const m = snap.meta || {};
    const listaTipos = [...tipos].sort();
    const semanas = semanasTabla(datos);
    if (datos.has('N/A')) semanas.unshift('N/A');
    const etiqueta = (m.producto || 'Producto') + (m.modo === 'count' ? ' · órdenes' : ' · cantidades');
    const enc = ['Semana', 'Inicio (lunes)'];
    listaTipos.forEach(t => enc.push(t + ' ' + etiqueta));
    enc.push('Total ' + etiqueta);
    const lineas = [enc];
    const acum = new Array(listaTipos.length + 1).fill(0);
    let totNA = 0;
    for (const w of semanas) {
      const mt = datos.get(w) || new Map();   // semana sin datos = ceros
      const r = [w === 'N/A' ? 'N/A' : 'Semana ' + w, lunesDe(snap, w)];
      let tot = 0;
      listaTipos.forEach((t, i) => { const v = ((mt.get(t) || {}).v) || 0; r.push(v); tot += v; acum[i] += v; });
      r.push(tot); acum[listaTipos.length] += tot;
      if (w === 'N/A') totNA = tot;
      lineas.push(r);
    }
    lineas.push(['TOTAL', '', ...acum]);
    const total = acum[listaTipos.length];
    return {
      lineas,
      tsv: lineas.map(l => l.join('\t')).join('\n'),
      concilia: etiqueta + ' · total del archivo: ' + total.toLocaleString() + ' | en semanas: ' + (total - totNA).toLocaleString() +
        ' | N/A (antes de la semana 1 o sin fecha válida): ' + totNA.toLocaleString() + (m.tipos && m.tipos.length ? ' | tipos incluidos: ' + m.tipos.join(', ') : '')
    };
  }

  RH.tablas = { SEMANAS_TEMPORADA, 'tassel-only': tasselOnly, homeship, gowns, 'gowns-activas': gowns, mapa };
})(window.RH = window.RH || {});
