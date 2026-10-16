/* Report Hub · REGISTRO DE DASHBOARDS Y REPORTES
   ─────────────────────────────────────────────────────────────────────────
   Este es el único archivo que hay que tocar para conectar un reporte nuevo.

   • reportes[]   → páginas HTML que procesan un CSV y guardan resultados.
   • dashboards[] → tableros que leen esos resultados y los comparan por temporada.

   Un reporte guarda, por cada semana y cada tipo (ASSIGNMENT TYPE), unos
   "campos" numéricos (por ejemplo { to, ceros, filas }). El dashboard define
   "métricas" a partir de esos campos. Ver la guía en README.md
   (sección «Agregar un reporte nuevo»). */
(function (RH) {
  'use strict';

  const conCeros = (c, o) => (c.to || 0) + (o.incluirCeros ? (c.ceros || 0) : 0);

  RH.registro = {
    app: { nombre: 'Report Hub', version: '1.2.0' },

    dashboards: [
      {
        id: 'tassel-only',
        titulo: 'TASSEL ONLY',
        dataset: 'tassel-only',
        reporte: 'tassel-only',
        estado: 'activo',
        descripcion: 'Órdenes que solo llevan Tassel y/o Mascot Medal, con el resto de las columnas QTY en 0.',
        campos: { to: 'Tassels Only', ceros: 'Filas con todo en 0', filas: 'Órdenes totales' },
        opciones: [
          { id: 'incluirCeros', etiqueta: 'Incluir filas con todo en 0', ayuda: 'Suma también las órdenes con todas las columnas objetivo en 0 (igual que la casilla del reporte).' }
        ],
        metricas: [
          { id: 'tassels', etiqueta: 'Tassels Only', unidad: 'órdenes', num: conCeros },
          { id: 'ordenes', etiqueta: 'Órdenes totales', unidad: 'órdenes', num: c => c.filas || 0 },
          { id: 'share', etiqueta: '% Tassels Only', tipo: 'ratio', descripcion: 'Tassels Only ÷ órdenes totales', num: conCeros, den: c => c.filas || 0 }
        ],
        principal: 'tassels',
        participacion: 'share'
      },
      {
        id: 'gowns',
        titulo: 'GOWNS',
        dataset: 'gowns',
        reporte: 'gowns',
        estado: 'pendiente',   // cambia a 'activo' cuando se conecte el reporte
        descripcion: 'Tablero reservado para el reporte de Gowns. Se activa en cuanto se integre su archivo.',
        campos: {},
        opciones: [],
        metricas: [],
        principal: null
      },
      {
        id: 'homeship',
        titulo: 'HOMESHIP',
        dataset: 'homeship',
        reporte: 'homeship',
        estado: 'activo',
        descripcion: 'Órdenes cuyo SERVICE ORDER TYPE contiene HOMESHIP, descontando las que son Tassels Only.',
        campos: { hs: 'Filas con HOMESHIP', to: 'Tassels Only dentro del filtro', ceros: 'Filas con todo en 0 dentro del filtro' },
        opciones: [
          { id: 'incluirCeros', etiqueta: 'Contar filas con todo en 0 como Tassels Only', ayuda: 'Igual que la casilla del reporte: también se restan las filas con todas las columnas objetivo en 0.' }
        ],
        metricas: [
          { id: 'neto', etiqueta: 'Homeship neto', unidad: 'órdenes', descripcion: 'HOMESHIP menos Tassels Only', num: (c, o) => (c.hs || 0) - conCeros(c, o) },
          { id: 'total', etiqueta: 'Total HOMESHIP', unidad: 'órdenes', num: c => c.hs || 0 },
          { id: 'tassels', etiqueta: 'Tassels Only dentro', unidad: 'órdenes', num: conCeros },
          { id: 'share', etiqueta: '% Tassels Only', tipo: 'ratio', descripcion: 'Tassels Only ÷ total HOMESHIP', num: conCeros, den: c => c.hs || 0 }
        ],
        principal: 'neto',
        participacion: 'share'
      }
    ],

    reportes: [
      {
        id: 'tassel-only',
        titulo: 'Tassels Only por semana',
        archivo: 'reportes/tassel-only.html',
        original: 'reportes/originales/CREARR2.html',
        dashboard: 'tassel-only',
        descripcion: 'Procesa el CSV y cuenta, por semana y tipo de asignación, las órdenes Tassels Only y las órdenes totales.'
      },
      {
        id: 'gowns',
        titulo: 'Gowns',
        archivo: null,          // ← aquí va 'reportes/gowns.html' cuando esté listo
        dashboard: 'gowns',
        estado: 'pendiente',
        descripcion: 'Espacio reservado para el tercer reporte.'
      },
      {
        id: 'homeship',
        titulo: 'Homeship menos Tassels Only',
        archivo: 'reportes/homeship.html',
        original: 'reportes/originales/filtro_menos_tassels.html',
        dashboard: 'homeship',
        descripcion: 'Filtra por palabra (HOMESHIP en SERVICE ORDER TYPE) y descuenta las órdenes Tassels Only.'
      }
    ],

    dashboard(id) { return this.dashboards.find(d => d.id === id); },
    reporte(id) { return this.reportes.find(r => r.id === id); },
    dashboardDeDataset(ds) { return this.dashboards.find(d => d.dataset === ds); }
  };
})(window.RH = window.RH || {});
