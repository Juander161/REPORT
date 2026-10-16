/* Report Hub · Base de datos: temporadas guardadas, Excel vinculado,
   exportar/importar, base compartida del equipo y datos de demostración. */
(function (RH) {
  'use strict';
  const u = RH.util, M = RH.modelo, el = u.el;

  function montar(cont) {
    const raiz = el('div', { class: 'datos-view' });
    cont.replaceChildren(raiz);
    let snaps = [];

    const btn = (texto, fn, cls, extra) => {
      const b = el('button', Object.assign({ class: 'btn ' + (cls || ''), type: 'button' }, extra || {}), texto);
      b.addEventListener('click', async () => {
        b.disabled = true;
        try { await fn(); } catch (e) { if (e && e.name !== 'AbortError') { console.error(e); u.toast(e.message || String(e), { tipo: 'error' }); } }
        b.disabled = false;
      });
      return b;
    };

    async function render() {
      const reg = RH.registro;
      const v = RH.dbx.vinculo;
      const comp = await RH.store.ajuste('compartida', null);
      const persist = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
      let uso = null;
      try { if (navigator.storage && navigator.storage.estimate) uso = await navigator.storage.estimate(); } catch (e) { uso = null; }

      const head = el('header', { class: 'page-head' }, el('div', { class: 'ph-l' },
        el('div', { class: 'eyebrow' }, 'Datos'),
        el('h1', { class: 'ph-t' }, 'Base de datos'),
        el('p', { class: 'ph-sub' }, 'Las temporadas procesadas se guardan en esta computadora para no volver a cargarlas. Usa un Excel como base para respaldarlas o compartirlas con el equipo.')));

      // ---------- Excel vinculado
      let estadoTxt, estadoCls = 'pill-off';
      switch (v.estado) {
        case 'ok': estadoTxt = 'Sincronizado'; estadoCls = 'pill-ok'; break;
        case 'sincronizando': estadoTxt = 'Sincronizando…'; estadoCls = 'pill-demo'; break;
        case 'permiso': estadoTxt = 'Requiere permiso'; estadoCls = 'pill-pend'; break;
        case 'error': estadoTxt = 'Error'; estadoCls = 'pill-err'; break;
        case 'no-soportado': estadoTxt = 'No disponible'; break;
        default: estadoTxt = 'Sin vincular';
      }
      const accionesV = el('div', { class: 'card-actions' });
      if (v.estado === 'no-soportado') {
        accionesV.appendChild(el('p', { class: 'muted small' }, 'Este navegador no permite escribir archivos locales. Usa Chrome o Edge en una computadora, o las opciones de exportar e importar.'));
      } else if (!v.nombre) {
        accionesV.append(
          btn('Crear Excel nuevo', async () => { const r = await RH.dbx.vincular('nuevo'); reportar(r); }, 'primary'),
          btn('Vincular un Excel existente', async () => { const r = await RH.dbx.vincular('abrir'); reportar(r); }));
      } else {
        accionesV.append(
          btn(v.estado === 'permiso' ? 'Reconectar' : 'Sincronizar ahora', async () => { const r = await RH.dbx.sincronizar({ interactivo: true }); reportar(r); }, 'primary'),
          btn('Desvincular', async () => { await RH.dbx.desvincular(); u.toast('Excel desvinculado. Tus datos siguen en esta computadora.'); }, 'ghost'));
      }
      const cardV = el('section', { class: 'card span-4 db-card' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Excel vinculado'), el('p', { class: 'card-s' }, 'Sincronización automática')), el('span', { class: 'pill ' + estadoCls }, estadoTxt)),
        el('p', null, 'La app lee el archivo al abrir, lo revisa cada 20 segundos mientras está abierta y lo reescribe cada vez que guardas una temporada. Guárdalo en una carpeta de ', el('strong', null, 'OneDrive, SharePoint o Teams'), ' para que todo el equipo comparta la misma base: los cambios de otra persona llegan en cuanto OneDrive sincroniza el archivo (normalmente segundos o pocos minutos).'),
        v.nombre ? el('div', { class: 'file-chip' }, el('span', { class: 'fc-ico', 'aria-hidden': 'true' }, 'X'), el('div', null, el('strong', null, v.nombre), el('div', { class: 'muted small' }, v.ultimo ? 'Última sincronización: ' + u.fmtFechaHora(v.ultimo) : 'Pendiente de sincronizar'))) : null,
        v.error ? el('p', { class: 'error-text' }, v.error) : null,
        accionesV);

      // ---------- Exportar / importar
      const input = el('input', { type: 'file', accept: '.xlsx', hidden: true });
      input.addEventListener('change', async () => {
        const f = input.files[0];
        input.value = '';
        if (!f) return;
        try {
          const r = await RH.dbx.importar(f);
          u.toast('Importado: ' + r.nuevos + ' nueva(s), ' + r.actualizados + ' actualizada(s)' + (r.borrados ? ', ' + r.borrados + ' eliminada(s)' : '') + (r.iguales ? ', ' + r.iguales + ' sin cambios (la versión local es igual o más reciente)' : '') + '.', { tipo: 'ok', ms: 7000 });
        } catch (e) { u.toast(e.message, { tipo: 'error' }); }
      });
      const cardX = el('section', { class: 'card span-4 db-card' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Exportar e importar'), el('p', { class: 'card-s' }, 'Funciona en cualquier navegador'))),
        el('p', null, 'Descarga toda la base como ', el('code', null, RH.dbx.NOMBRE), ' (hojas Temporadas y Datos, lista para tablas dinámicas) o importa una base que te compartieron.'),
        el('div', { class: 'card-actions' }, btn('Descargar base en Excel', () => RH.dbx.exportar(), 'primary'), btn('Importar desde Excel', () => input.click()), input));

      // ---------- base compartida
      const cardC = el('section', { class: 'card span-4 db-card' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Base compartida del equipo'), el('p', { class: 'card-s' }, 'Se carga sola al abrir la app')),
          el('span', { class: 'pill ' + (comp && comp.estado === 'ok' ? 'pill-ok' : comp && comp.estado === 'error' ? 'pill-err' : 'pill-off') }, comp && comp.estado === 'ok' ? 'Publicada' : comp && comp.estado === 'error' ? 'Error' : 'No publicada')),
        el('p', null, 'Si se publica ', el('code', null, RH.dbx.RUTA_COMPARTIDA), ' junto con la app, cada persona recibe esas temporadas (por ejemplo, la del año pasado) sin cargar ningún CSV.'),
        comp && comp.estado === 'ok' ? el('p', { class: 'muted small' }, (comp.temporadas || []).length + ' temporada(s) · revisada ' + u.fmtFechaHora(comp.revisado)) : null,
        comp && comp.estado === 'error' ? el('p', { class: 'error-text' }, comp.error) : null,
        el('details', { class: 'howto' }, el('summary', null, '¿Cómo se publica?'),
          el('ol', null,
            el('li', null, 'Procesa las temporadas que quieras compartir (p. ej., la del año pasado).'),
            el('li', null, 'Pulsa «Descargar base en Excel».'),
            el('li', null, 'Sube el archivo al repositorio como ', el('code', null, 'data/REPORT_DB.xlsx'), ' (o pídeselo a quien administra la app).'))),
        el('div', { class: 'card-actions' }, btn('Buscar actualización', async () => {
          const r = await RH.dbx.cargarCompartida();
          if (r.estado === 'ok') u.toast('Base compartida: ' + r.nuevos + ' nueva(s), ' + r.actualizados + ' actualizada(s).', { tipo: 'ok' });
          else if (r.estado === 'ausente') u.toast('Todavía no hay una base compartida publicada.', { tipo: 'info' });
          else if (r.estado === 'sin-conexion') u.toast('Sin conexión: no se pudo revisar la base compartida.', { tipo: 'warn' });
          else u.toast('Error al leer la base compartida: ' + r.error, { tipo: 'error' });
          render();
        })));

      // ---------- enlace al Excel en Teams / SharePoint
      const enlace = await RH.store.ajuste('enlaceBase', null);
      const inUrl = el('input', { type: 'url', class: 'inp-url', placeholder: 'https://su-empresa.sharepoint.com/…/REPORT_DB.xlsx', value: enlace && enlace.url ? enlace.url : '', 'aria-label': 'Enlace al Excel' });
      const cardE = el('section', { class: 'card span-12 db-card' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Abrir Excel desde un enlace (Teams / SharePoint)'), el('p', { class: 'card-s' }, 'Lectura solamente · solo dominios *.sharepoint.com o este mismo sitio')),
          el('span', { class: 'pill ' + (enlace && enlace.estado === 'ok' ? 'pill-ok' : enlace && enlace.estado === 'error' ? 'pill-err' : 'pill-off') }, enlace && enlace.estado === 'ok' ? 'Conectado' : enlace && enlace.estado === 'error' ? 'Error' : 'Sin enlace')),
        el('p', null, 'Pega el enlace del ', el('code', null, RH.dbx.NOMBRE), '. Los permisos los administras en Teams/OneDrive; la aplicación solo lee el archivo y no envía ningún dato.'),
        inUrl,
        enlace && enlace.estado === 'ok' ? el('p', { class: 'muted small' }, (enlace.temporadas || []).length + ' temporada(s) · revisado ' + u.fmtFechaHora(enlace.revisado)) : null,
        enlace && enlace.estado === 'error' ? el('p', { class: 'error-text' }, enlace.error) : null,
        el('div', { class: 'card-actions' },
          btn('Leer del enlace', async () => {
            const r = await RH.dbx.cargarEnlace(inUrl.value);
            if (r.estado === 'ok') u.toast('Enlace leído: ' + r.nuevos + ' nueva(s), ' + r.actualizados + ' actualizada(s).', { tipo: 'ok' });
            else u.toast(r.error, { tipo: 'error', ms: 9000 });
            render();
          }, 'primary'),
          enlace ? btn('Quitar enlace', async () => { await RH.dbx.olvidarEnlace(); render(); }) : null));

      // ---------- temporadas
      const tabla = el('table', { class: 'tbl tbl-db' });
      tabla.appendChild(el('thead', null, el('tr', null, ['Dashboard', 'Temporada', 'Lunes semana 1', 'Semanas', 'Tipos', 'Archivo de origen', 'Filas leídas', 'Procesado', 'Origen', ''].map((h, i) => el('th', { class: [3, 4, 6].includes(i) ? 'num' : '' }, h)))));
      const tb = el('tbody');
      const orden = snaps.slice().sort((a, b) => a.dataset.localeCompare(b.dataset) || (b.week1 || '').localeCompare(a.week1 || ''));
      if (!orden.length) tb.appendChild(el('tr', null, el('td', { colspan: 10, class: 'muted center' }, 'Todavía no hay temporadas guardadas.')));
      orden.forEach(s => {
        const d = reg.dashboardDeDataset(s.dataset);
        const m = s.meta || {};
        const origen = { compartida: 'Base compartida', excel: 'Excel', demo: 'Demostración', sync: 'Excel' }[m.origen] || 'Esta computadora';
        const borrar = el('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Eliminar temporada ' + s.season, title: 'Eliminar' }, '×');
        borrar.addEventListener('click', async () => {
          const ok = await u.confirmar('Eliminar temporada', '¿Eliminar la temporada ' + s.season + ' de ' + (d ? d.titulo : s.dataset) + '? Podrás volver a generarla procesando el CSV o importando el Excel.', { aceptar: 'Eliminar', peligro: true });
          if (!ok) return;
          await RH.store.borrar(s.id);
          u.toast('Temporada eliminada.', { tipo: 'ok' });
        });
        tb.appendChild(el('tr', { class: s.demo ? 'row-demo' : '' },
          el('td', null, el('strong', null, d ? d.titulo : s.dataset)),
          el('td', null, s.season, s.demo ? el('span', { class: 'pill pill-demo xs' }, 'demo') : null),
          el('td', null, u.fmtFecha(s.week1)),
          el('td', { class: 'num' }, String(M.ultimaSemana(s))),
          el('td', { class: 'num', title: (s.types || []).join(', ') }, String((s.types || []).length)),
          el('td', { class: 'ellipsis', title: (m.archivo && m.archivo.nombre) || '' }, (m.archivo && m.archivo.nombre) || '–'),
          el('td', { class: 'num' }, m.filas != null ? u.fmtInt(m.filas) : '–'),
          el('td', null, u.fmtFechaHora(m.procesado || s.updatedAt)),
          el('td', null, origen),
          el('td', { class: 'num' }, borrar)));
      });
      tabla.appendChild(tb);
      const cardT = el('section', { class: 'card span-12' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Temporadas guardadas'), el('p', { class: 'card-s' }, 'Una fila por reporte procesado y temporada. Al volver a procesar la misma temporada se reemplaza.'))),
        el('div', { class: 'table-wrap' }, tabla));

      // ---------- demo y almacenamiento
      const hayDemo = snaps.some(s => s.demo);
      const cardD = el('section', { class: 'card span-6 db-card' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Demostración'), el('p', { class: 'card-s' }, 'Datos ficticios para conocer los tableros'))),
        el('p', null, 'Se marcan como DEMO, no se exportan a Excel y se retiran solos al guardar datos reales del mismo dashboard.'),
        el('div', { class: 'card-actions' },
          btn('Cargar demostración', async () => { const n = await RH.demo.cargar(); if (n) u.toast('Demostración cargada.', { tipo: 'ok' }); }, hayDemo ? '' : 'primary'),
          hayDemo ? btn('Quitar demostración', async () => { const n = await RH.demo.quitar(); u.toast(n + ' temporada(s) de demostración eliminadas.', { tipo: 'ok' }); }) : null));
      const cardS = el('section', { class: 'card span-6 db-card' },
        el('header', { class: 'card-h' }, el('div', { class: 'card-hl' }, el('h3', { class: 'card-t' }, 'Almacenamiento en esta computadora'), el('p', { class: 'card-s' }, 'IndexedDB del navegador'))),
        el('ul', { class: 'db-stat' },
          el('li', null, el('span', null, 'Protección contra borrado automático'), el('strong', null, persist ? '✓ Activada' : 'No garantizada')),
          uso ? el('li', null, el('span', null, 'Espacio usado por la app'), el('strong', null, u.fmtTamano(uso.usage))) : null),
        el('p', { class: 'muted small' }, 'Si borras los datos de navegación se pierde la copia local; por eso conviene vincular o exportar el Excel.'),
        persist ? null : el('div', { class: 'card-actions' }, btn('Activar protección', async () => { const ok = await RH.store.persistente(); u.toast(ok ? 'Protección activada.' : 'El navegador no la concedió (se concede automáticamente al instalar la app).', { tipo: ok ? 'ok' : 'warn' }); render(); })));

      raiz.replaceChildren(head, el('div', { class: 'grid' }, cardV, cardX, cardC, cardE, cardT, cardD, cardS));
    }

    function reportar(r) {
      if (!r) return;
      if (r.estado === 'ok') u.toast('Excel sincronizado' + (r.importados ? ' · ' + r.importados + ' temporada(s) traídas del archivo' : '') + (r.escrito ? ' · archivo actualizado' : '') + '.', { tipo: 'ok' });
      else if (r.estado === 'permiso') u.toast('Se necesita permiso para usar el archivo.', { tipo: 'warn' });
      else if (r.estado === 'error') u.toast(r.error, { tipo: 'error', ms: 8000 });
    }

    window.addEventListener('rh-vinculo', () => { if (raiz.isConnected) render(); });
    return { actualizar(lista) { snaps = lista; render(); }, retematizar() {} };
  }

  RH.datos = { montar };
})(window.RH = window.RH || {});
