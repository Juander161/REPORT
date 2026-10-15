/* Report Hub · datos de demostración (claramente marcados como DEMO).
   Sirven para recorrer los dashboards antes de cargar los CSV reales; se
   eliminan solos en cuanto se guarda una temporada real del mismo dataset. */
(function (RH) {
  'use strict';
  const u = RH.util;

  function azar(semilla) {
    let a = semilla >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const inicioTemporada = u.inicioTemporada;
  const temporadaActual = u.temporadaActual;

  const TIPOS = [['ESCUELA', 0.54], ['WEB', 0.26], ['REPOSICIÓN', 0.12], ['ESPECIAL', 0.08]];
  const curva = w => 0.22 + 0.95 * Math.exp(-Math.pow((w - 37) / 6.5, 2)) + 0.38 * Math.exp(-Math.pow((w - 11) / 4.5, 2)) + 0.12 * Math.exp(-Math.pow((w - 47) / 3, 2));

  function generar() {
    const yAct = temporadaActual();
    const temporadas = [
      { anio: yAct - 1, factor: 1, semanas: 52, semilla: 11 },
      { anio: yAct, factor: 1.07, semanas: null, semilla: 29 }
    ];
    const ahora = new Date().toISOString();
    const snaps = [];
    for (const t of temporadas) {
      const week1 = inicioTemporada(t.anio);
      const ultima = t.semanas || u.clamp(u.weekOf(week1, u.hoyIso()), 1, 52);
      const parcial = !t.semanas;
      for (const ds of ['tassel-only', 'homeship']) {
        const rnd = azar(t.semilla + (ds === 'homeship' ? 100 : 0));
        const weeks = {};
        for (let w = 1; w <= ultima; w++) {
          const frac = parcial && w === ultima ? (((new Date().getDay() + 6) % 7) + 1) / 7 : 1;
          const bloque = {};
          TIPOS.forEach(([tipo, peso], k) => {
            const ruido = 0.86 + rnd() * 0.28;
            const tendencia = 1 + (k === 1 ? 0.06 : 0) * (t.anio - (yAct - 1));
            if (ds === 'tassel-only') {
              const to = Math.round(2600 * curva(w) * peso * t.factor * ruido * tendencia * frac);
              const share = 0.19 + 0.08 * Math.exp(-Math.pow((w - 37) / 8, 2)) + (rnd() - 0.5) * 0.02;
              bloque[tipo] = { to, ceros: Math.round(to * 0.018 * rnd()), filas: Math.round(to / share) };
            } else {
              const hs = Math.round(1500 * (0.35 + 0.65 * curva(w)) * peso * t.factor * ruido * tendencia * frac);
              const to = Math.round(hs * (0.09 + 0.05 * rnd()));
              bloque[tipo] = { hs, to, ceros: Math.round(hs * 0.006 * rnd()) };
            }
          });
          weeks[w] = bloque;
        }
        snaps.push({
          id: RH.store.idDe(ds, String(t.anio)), dataset: ds, season: String(t.anio), week1,
          types: TIPOS.map(x => x[0]).sort(), weeks, na: null, demo: true, updatedAt: ahora,
          meta: {
            origen: 'demo', reporte: ds, procesado: ahora,
            archivo: { nombre: 'demostracion_' + ds + '_' + t.anio + '.csv', tam: 0, modificado: parcial ? Date.now() : Date.parse(u.addDays(week1, 7 * 52) + 'T12:00:00Z') },
            filas: null, config: { incluirCeros: false, palabra: ds === 'homeship' ? 'HOMESHIP' : undefined }
          }
        });
      }
    }
    return snaps;
  }

  async function cargar() {
    const existentes = await RH.store.snapshots();
    const reales = new Set(existentes.filter(s => !s.demo).map(s => s.dataset));
    const nuevos = generar().filter(s => !reales.has(s.dataset));
    if (!nuevos.length) { u.toast('Ya tienes datos reales en todos los dashboards; la demostración no es necesaria.', { tipo: 'info' }); return 0; }
    await RH.store.guardar(nuevos, { origen: 'demo' });
    return nuevos.length;
  }

  async function quitar() {
    const demo = (await RH.store.snapshots()).filter(s => s.demo).map(s => s.id);
    if (demo.length) await RH.store.borrar(demo, { origen: 'demo' });
    return demo.length;
  }

  RH.demo = { generar, cargar, quitar, inicioTemporada, temporadaActual };
})(window.RH = window.RH || {});
