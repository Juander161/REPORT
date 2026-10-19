/* Report Hub · modelo de datos: agrega los snapshots por semana, tipo y métrica.
   Convención: una temporada "cubre" las semanas 1..última semana con datos;
   dentro de esa cobertura una semana sin filas vale 0; fuera de ella es null. */
(function (RH) {
  'use strict';
  const u = RH.util;

  // Una temporada nunca pasa de ~53 semanas: semanas mayores vienen de fechas mal
  // capturadas (p. ej. año 2062). Se conservan en los datos y en la "Tabla del reporte",
  // pero no extienden las gráficas ni las comparaciones.
  const MAX_SEMANA = 60;

  function sumarBloque(bloque, tipos) {
    const out = {};
    if (bloque) {
      for (const [t, campos] of Object.entries(bloque)) {
        if (tipos && !tipos.has(t)) continue;
        for (const [k, v] of Object.entries(campos)) out[k] = (out[k] || 0) + (+v || 0);
      }
    }
    return out;
  }

  const M = {
    MAX_SEMANA,
    semanasDe(snap) {
      if (!snap) return [];
      return Object.keys(snap.weeks || {}).map(Number).filter(n => isFinite(n)).sort((a, b) => a - b);
    },
    ultimaSemana(snap) {
      const s = M.semanasDe(snap).filter(w => w <= MAX_SEMANA);
      return s.length ? s[s.length - 1] : 0;
    },
    /** Semanas guardadas fuera de rango (> MAX_SEMANA) */
    semanasFuera(snap) {
      return M.semanasDe(snap).filter(w => w > MAX_SEMANA);
    },

    /**
     * Temporadas de un dataset ordenadas de la más reciente a la más antigua.
     * En datasets con variantes (GOWNS: un producto y una medida por reporte guardado) se
     * filtra por `clave` ('PRODUCTO|sum'|'PRODUCTO|count') y la etiqueta se muestra como la
     * temporada («2026»), aunque el id guardado sea PRODUCTO_2026_sum.
     */
    temporadas(snaps, dataset, clave) {
      let lista = snaps.filter(s => s.dataset === dataset);
      if (clave != null) lista = lista.filter(s => M.claveVar(s) === clave);
      lista = lista.map(s => (s.meta && s.meta.temporada != null) ? Object.assign({}, s, { season: String(s.meta.temporada) }) : s);
      // primero las temporadas vigentes y después sus actualizaciones anteriores (historial)
      return lista.sort((a, b) => (b.week1 || '').localeCompare(a.week1 || '') || (a.historica ? 1 : 0) - (b.historica ? 1 : 0) ||
        (a.historica ? String(((b.meta || {}).procesado) || '').localeCompare(String(((a.meta || {}).procesado) || '')) : String(b.season).localeCompare(String(a.season))));
    },

    /** Versiones archivadas como «temporadas históricas» para poder verlas y compararlas (id = vid) */
    versionesComoSnaps(versiones) {
      const hechos = (versiones || []).filter(v => v && !v.demo).map(v => {
        const base = v.meta && v.meta.temporada != null ? String(v.meta.temporada) : String(v.season);
        return { v, base, corte: M.corte(v) };
      });
      const usados = new Map();
      return hechos.map(({ v, base, corte }) => {
        let etiqueta = base + ' · act. ' + (corte ? u.fmtFecha(corte) : u.fmtFechaHora((v.meta && v.meta.procesado) || v.archivadoEn));
        const n = (usados.get(base + etiqueta) || 0) + 1; usados.set(base + etiqueta, n);
        if (n > 1) etiqueta += ' (' + n + ')';
        return Object.assign({}, v, { id: v.vid, baseId: v.id, historica: true, season: etiqueta, meta: Object.assign({}, v.meta, { temporada: etiqueta, origenVersion: true }) });
      });
    },

    /** Clave de variante de una temporada guardada ('' si el dataset no tiene variantes) */
    claveVar(s) { return s && s.meta && s.meta.producto ? s.meta.producto + '|' + (s.meta.modo || 'sum') : ''; },
    etiquetaVar(clave) {
      const [p, m] = String(clave).split('|');
      return p + (m === 'count' ? ' · órdenes' : ' · cantidades');
    },
    /** Variantes guardadas de un dataset: [{clave, etiqueta, ultima}] (la más reciente primero) */
    variantes(snaps, dataset) {
      const mapa = new Map();
      snaps.filter(s => s.dataset === dataset && M.claveVar(s)).forEach(s => {
        const c = M.claveVar(s), t = (s.meta && s.meta.procesado) || s.updatedAt || '';
        if (!mapa.has(c) || t > mapa.get(c)) mapa.set(c, t);
      });
      return [...mapa].map(([clave, ultima]) => ({ clave, etiqueta: M.etiquetaVar(clave), ultima }))
        .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
    },
    /** Copia del dashboard con la métrica del producto y la medida elegidos */
    dashPara(dash, clave) {
      if (!dash.variantes || !clave) return dash;
      const etiqueta = M.etiquetaVar(clave);
      return Object.assign({}, dash, {
        campos: { v: etiqueta },
        metricas: [{ id: 'valor', etiqueta, unidad: clave.endsWith('|count') ? 'órdenes' : 'unidades', num: c => c.v || 0 }],
        principal: 'valor'
      });
    },

    /** Suma de campos de una semana (o del bloque N/A) filtrando por tipos */
    agregado(snap, semana, tipos) {
      if (!snap) return null;
      // la semana 0 es el bloque N/A: todo lo anterior al lunes de la semana 1 (o sin fecha), sumado
      if (semana === 0) semana = 'N/A';
      if (semana !== 'N/A' && (semana < 1 || semana > M.ultimaSemana(snap))) return null;
      return sumarBloque(semana === 'N/A' ? snap.na : (snap.weeks || {})[semana], tipos);
    },

    /** ¿La temporada tiene datos N/A (previos a la semana 1 o sin fecha)? */
    tieneNA(snap) {
      return !!snap && !!snap.na && Object.values(snap.na).some(c => Object.values(c || {}).some(v => +v));
    },

    /** Medida de las semanas fuera de rango (no se grafican, pero sí están en el TOTAL del HTML) */
    medirFuera(snap, metrica, tipos, opts) {
      if (!snap) return null;
      return M.sumar(M.semanasFuera(snap).map(w => M.medir(metrica, sumarBloque(snap.weeks[w], tipos), opts)), metrica);
    },

    agregadoTipo(snap, semana, tipo) {
      if (!snap || semana < 0 || semana > M.ultimaSemana(snap)) return null;
      const b = (semana === 0 ? (snap.na || {}) : ((snap.weeks || {})[semana] || {}))[tipo];
      return b ? Object.assign({}, b) : {};
    },

    /** {num, den, v}: para métricas de conteo v = num; para proporciones v = num/den */
    medir(metrica, agg, opts) {
      if (!agg) return null;
      const num = metrica.num(agg, opts || {});
      if (metrica.tipo === 'ratio') {
        const den = metrica.den(agg, opts || {});
        return { num, den, v: den ? num / den : null };
      }
      return { num, den: null, v: num };
    },

    sumar(lista, metrica) {
      let num = 0, den = 0, alguno = false;
      for (const m of lista) {
        if (!m) continue;
        alguno = true;
        num += m.num || 0;
        if (m.den != null) den += m.den || 0;
      }
      if (!alguno) return null;
      if (metrica.tipo === 'ratio') return { num, den, v: den ? num / den : null };
      return { num, den: null, v: num };
    },

    serie(snap, metrica, semanas, tipos, opts) {
      return semanas.map(w => M.medir(metrica, M.agregado(snap, w, tipos), opts));
    },

    total(snap, metrica, semanas, tipos, opts) {
      return M.sumar(M.serie(snap, metrica, semanas, tipos, opts), metrica);
    },

    porTipo(snap, metrica, semanas, tipo, opts) {
      return M.sumar(semanas.map(w => M.medir(metrica, M.agregadoTipo(snap, w, tipo), opts)), metrica);
    },

    /** Acumulado progresivo de una serie de medidas */
    acumulada(medidas, metrica) {
      let num = 0, den = 0;
      return medidas.map(m => {
        if (!m) return null;
        num += m.num || 0;
        if (m.den != null) den += m.den || 0;
        return metrica.tipo === 'ratio' ? { num, den, v: den ? num / den : null } : { num, den: null, v: num };
      });
    },

    /** Tipos con datos en las semanas que se grafican (los que solo aparecen en semanas fuera de rango no cuentan) */
    tiposDe(...snaps) {
      const s = new Set();
      for (const snap of snaps) {
        if (!snap) continue;
        const enRango = new Set();
        for (const [w, b] of Object.entries(snap.weeks || {})) if (+w <= MAX_SEMANA) Object.keys(b || {}).forEach(t => enRango.add(t));
        (snap.types || []).forEach(t => { if (enRango.has(t)) s.add(t); });
      }
      return [...s].sort();
    },

    /** Fecha de corte de los datos: cuándo se exportó/procesó el CSV */
    corte(snap) {
      if (!snap || !snap.meta) return null;
      const m = snap.meta;
      const ts = (m.archivo && m.archivo.modificado) || m.procesado;
      if (!ts) return null;
      const d = new Date(ts);
      if (isNaN(d)) return null;
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    /** Semana parcial = la última semana con datos todavía no había terminado al exportar */
    semanaParcial(snap) {
      const ult = M.ultimaSemana(snap);
      const corte = M.corte(snap);
      if (!ult || !corte || !snap.week1) return null;
      const domingo = u.addDays(u.weekMonday(snap.week1, ult), 6);
      return corte < domingo ? { semana: ult, corte } : null;
    },

    /** Semana que corre hoy dentro de una temporada (o null si está fuera) */
    semanaHoy(snap) {
      if (!snap || !snap.week1) return null;
      const w = u.weekOf(snap.week1, u.hoyIso());
      return w >= 1 && w <= 60 ? w : null;
    }
  };

  RH.modelo = M;
})(window.RH = window.RH || {});
