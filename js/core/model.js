/* Report Hub · modelo de datos: agrega los snapshots por semana, tipo y métrica.
   Convención: una temporada "cubre" las semanas 1..última semana con datos;
   dentro de esa cobertura una semana sin filas vale 0; fuera de ella es null. */
(function (RH) {
  'use strict';
  const u = RH.util;

  const M = {
    semanasDe(snap) {
      if (!snap) return [];
      return Object.keys(snap.weeks || {}).map(Number).filter(n => isFinite(n)).sort((a, b) => a - b);
    },
    ultimaSemana(snap) {
      const s = M.semanasDe(snap);
      return s.length ? s[s.length - 1] : 0;
    },

    /** Temporadas de un dataset ordenadas de la más reciente a la más antigua */
    temporadas(snaps, dataset) {
      return snaps.filter(s => s.dataset === dataset)
        .sort((a, b) => (b.week1 || '').localeCompare(a.week1 || '') || String(b.season).localeCompare(String(a.season)));
    },

    /** Suma de campos de una semana (o del bloque N/A) filtrando por tipos */
    agregado(snap, semana, tipos) {
      if (!snap) return null;
      if (semana !== 'N/A' && (semana < 1 || semana > M.ultimaSemana(snap))) return null;
      const bloque = semana === 'N/A' ? snap.na : (snap.weeks || {})[semana];
      const out = {};
      if (bloque) {
        for (const [t, campos] of Object.entries(bloque)) {
          if (tipos && !tipos.has(t)) continue;
          for (const [k, v] of Object.entries(campos)) out[k] = (out[k] || 0) + (+v || 0);
        }
      }
      return out;
    },

    agregadoTipo(snap, semana, tipo) {
      if (!snap || semana < 1 || semana > M.ultimaSemana(snap)) return null;
      const b = ((snap.weeks || {})[semana] || {})[tipo];
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

    tiposDe(...snaps) {
      const s = new Set();
      for (const snap of snaps) if (snap) (snap.types || []).forEach(t => s.add(t));
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
