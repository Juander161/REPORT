/* Report Hub · Guía de uso (contenido estático). */
(function (RH) {
  'use strict';
  const el = RH.util.el;

  const HTML = `
  <header class="page-head"><div class="ph-l">
    <div class="eyebrow">Ayuda</div>
    <h1 class="ph-t">Guía de uso</h1>
    <p class="ph-sub">Todo lo necesario para actualizar los tableros, comparar temporadas y compartir resultados.</p>
  </div></header>

  <div class="grid">
    <section class="card span-6 guide">
      <h3 class="card-t">1 · Actualizar los datos cada semana</h3>
      <ol>
        <li>Exporta el archivo de órdenes como siempre: <strong>CSV o Excel (.xlsx)</strong>.</li>
        <li>Abre <strong>Reportes</strong> en el menú y elige el reporte (por ejemplo «Tassels Only por semana»).</li>
        <li>Selecciona el archivo (si es un Excel con varias hojas, se propone la hoja activa; puedes elegir otra), revisa el <strong>lunes de la semana 1</strong> — arranca igual que en el HTML original — y la <strong>temporada</strong> (por ejemplo, 2026).</li>
        <li>Pulsa <strong>Procesar</strong>: obtienes la misma tabla de siempre, que puedes copiar a Excel.</li>
        <li>Pulsa <strong>Guardar en el dashboard</strong>. Si ya existía esa temporada se reemplaza por la versión nueva.</li>
      </ol>
      <p class="muted">La temporada del año pasado se procesa <strong>una sola vez</strong>: queda guardada y no hay que volver a cargarla. Si aparece un aviso amarillo al procesar, revisa el lunes de inicio: casi siempre es de otra temporada. Con Excel las fechas se leen por su valor, así que no dependen del formato Mes/Día o Día/Mes.</p>
    </section>

    <section class="card span-6 guide">
      <h3 class="card-t">2 · Analizar en los dashboards</h3>
      <ul>
        <li><strong>Comparar:</strong> elige la temporada actual y contra cuál compararla.</li>
        <li><strong>Periodo:</strong> «Rango» (a la fecha, últimas 4/8/13 semanas, temporada completa o personalizado) o «Una semana» con flechas para recorrerlas.</li>
        <li><strong>Métrica:</strong> cambia entre conteos y porcentajes (por ejemplo, % de Tassels Only sobre el total).</li>
        <li><strong>Tipo de asignación:</strong> filtra uno o varios tipos; todas las gráficas y KPIs se recalculan.</li>
        <li>Los totales comparan siempre <strong>las mismas semanas</strong> en ambas temporadas. Una semana marcada con <strong>*</strong> todavía estaba en curso cuando se exportó el CSV.</li>
        <li><strong>Cuadrar con el HTML:</strong> las gráficas suman las semanas 1…N; la fila <strong>N/A</strong> (filas antes del lunes de inicio o sin fecha) solo está en el TOTAL. La sección <strong>«Tabla del reporte»</strong>, al final del dashboard, muestra la tabla idéntica a la del HTML y se copia igual a Excel.</li>
        <li>Los filtros duran mientras la app está abierta; «Restablecer filtros» los regresa al inicio.</li>
      </ul>
    </section>

    <section class="card span-6 guide">
      <h3 class="card-t">3 · Llevar gráficas y tablas a Excel</h3>
      <ul>
        <li><strong>Exportar a Excel</strong> (botón azul del dashboard): libro con resumen, tablas con fórmulas vivas y <strong>gráficas nativas de Excel</strong> que puedes editar.</li>
        <li>Menú <strong>⋯</strong> de cada gráfica: copiar imagen (pegar en Excel, PowerPoint o correo), descargar PNG, copiar los datos o descargar un Excel solo con esa gráfica.</li>
        <li><strong>PDF:</strong> el botón PDF abre la impresión con un diseño limpio para guardar o imprimir.</li>
      </ul>
    </section>

    <section class="card span-6 guide">
      <h3 class="card-t">4 · Excel como base de datos</h3>
      <ul>
        <li>Todo se guarda en esta computadora automáticamente.</li>
        <li><strong>Excel vinculado</strong> (Chrome o Edge): la app escribe en un <code>REPORT_DB.xlsx</code> y lo revisa cada 20 segundos. Ponlo en OneDrive/SharePoint/Teams y el equipo comparte la base; los cambios de otra persona llegan cuando OneDrive sincroniza el archivo (no al instante como un servidor).</li>
        <li><strong>Base compartida:</strong> publicando <code>data/REPORT_DB.xlsx</code> junto a la app, cada persona recibe esas temporadas al abrirla.</li>
        <li>La hoja «Datos» está en formato largo: ideal para tablas dinámicas.</li>
      </ul>
    </section>

    <section class="card span-6 guide">
      <h3 class="card-t">5 · Instalar como aplicación</h3>
      <ul>
        <li><strong>Computadora (Chrome/Edge):</strong> botón «Instalar app» del menú lateral, o el ícono de instalar en la barra de direcciones.</li>
        <li><strong>Android:</strong> menú del navegador → «Instalar aplicación».</li>
        <li><strong>iPhone/iPad:</strong> Safari → Compartir → «Agregar a pantalla de inicio».</li>
        <li>Una vez instalada funciona sin conexión; al publicarse una versión nueva verás un aviso para actualizar.</li>
      </ul>
    </section>

    <section class="card span-6 guide">
      <h3 class="card-t">6 · Agregar un reporte nuevo</h3>
      <ol>
        <li>Copia <code>reportes/plantilla.html</code> con un nombre nuevo (por ejemplo <code>reportes/gowns.html</code>) y escribe la lógica en la sección marcada.</li>
        <li>En <code>js/registry.js</code> agrega el reporte en <code>reportes</code> y, si alimenta un tablero, su dashboard con campos y métricas.</li>
        <li>Agrega el archivo a la lista de <code>sw.js</code> para que funcione sin conexión.</li>
      </ol>
      <p class="muted">El detalle paso a paso está en el README del repositorio.</p>
    </section>

    <section class="card span-6 guide">
      <h3 class="card-t">7 · Proyección de temporada</h3>
      <ol>
        <li>Abre <strong>Proyección de temporada</strong> en el menú. Elige el reporte, <strong>qué proyectar</strong> (una métrica o cualquier campo guardado), los <strong>tipos</strong> y las <strong>temporadas base</strong>.</li>
        <li>La <strong>semana de corte</strong> es hasta dónde llega lo real (por defecto, la última semana completa). El resto se estima.</li>
        <li>Elige el <strong>método</strong>: índice de crecimiento (el más usado), índice reciente, crecimiento geométrico (como en poblaciones), lineal o promedio histórico. La tabla inferior los compara lado a lado.</li>
        <li>El <strong>rango</strong> va del escenario más bajo al más alto según cada temporada base. Con pocas temporadas es orientativo.</li>
      </ol>
      <p class="muted">Sirve con cualquier reporte registrado: si agregas uno nuevo (por ejemplo GOWNS), aparece aquí solo.</p>
    </section>

    <section class="card span-6 guide" id="privacidad">
      <h3 class="card-t">8 · Privacidad y seguridad</h3>
      <ul>
        <li><strong>Cero terceros:</strong> no usa Bootstrap ni ningún CDN, no carga fuentes ni imágenes de internet, no llama a APIs y no tiene analítica ni rastreadores. Las gráficas, íconos y estilos vienen incluidos en la aplicación y funciona sin conexión.</li>
        <li>Los archivos CSV/Excel se procesan en tu equipo; <strong>nada se sube ni se envía</strong>. Una política de seguridad (CSP) impide al navegador conectarse a cualquier sitio no autorizado.</li>
        <li>La <strong>única conexión posible</strong> es de lectura hacia tu propio SharePoint/Teams (<code>*.sharepoint.com</code>) y solo si pegas un enlace en «Base de datos».</li>
        <li>Los datos se guardan <strong>solo en este navegador</strong> (IndexedDB) y en el Excel <code>REPORT_DB.xlsx</code> si decides vincularlo.</li>
        <li><strong>Quién puede ver los datos</strong> se controla con los permisos del archivo <code>REPORT_DB.xlsx</code> en OneDrive/Teams (los administras tú). La aplicación no pide ni guarda contraseñas.</li>
        <li>Para compartir sin enlaces públicos: pon la carpeta de la aplicación y el Excel en un sitio de Teams/OneDrive con acceso solo para tu equipo y usa «Vincular Excel» desde la carpeta sincronizada.</li>
      </ul>
    </section>
  </div>`;

  function montar(cont) {
    cont.replaceChildren(el('div', { class: 'ayuda-view', html: HTML }));
    const grid = cont.querySelector('.grid');
    if (grid && RH.info) grid.appendChild(RH.info.tarjetaGlosario());
    return { actualizar() {}, retematizar() {} };
  }

  RH.ayuda = { montar };
})(window.RH = window.RH || {});
