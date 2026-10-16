# Report Hub · Centro de reportes

Aplicación web instalable (PWA) para el equipo: procesa los CSV semanales con los
reportes de siempre y muestra tres dashboards — **TASSEL ONLY**, **GOWNS** y
**HOMESHIP** — que comparan la temporada actual contra la anterior semana a semana.

- Funciona en Chrome, Edge, Safari y Firefox, en computadora y en celular.
- Se instala como app y funciona **sin conexión**.
- Los CSV se procesan en la computadora de cada persona: **ningún archivo se sube a internet**.
- No necesita servidor, base de datos ni compilación: son archivos estáticos.

---

## Qué incluye

| Sección | Qué hace |
|---|---|
| **Panorama general** | Pantalla de inicio: semana actual de la temporada, resumen de cada dashboard con tendencia, última semana completa y actividad reciente. |
| **Dashboards** | KPIs, comparativo semanal (o acumulado), variación vs la temporada anterior, desglose por tipo de asignación, participación, mezcla por tipo, mapa de calor, detalle semanal y una «lectura rápida» con hallazgos automáticos. |
| **Reportes** | `Tassels Only por semana` (antes `CREARR2.html`) y `Homeship menos Tassels Only` (antes `filtro_menos_tassels.html`). Hacen exactamente los mismos cálculos que los originales, arrancan con los mismos valores por defecto, aceptan **CSV o Excel (.xlsx)** y además guardan el resultado en su dashboard. |
| **Tabla del reporte** | Al final de cada dashboard: la misma tabla del HTML (mismas columnas, fila N/A y TOTAL) reconstruida desde la temporada guardada, con su botón para copiar a Excel. Sirve para conciliar celda por celda. |
| **Base de datos** | Temporadas guardadas, Excel vinculado, exportar/importar y base compartida del equipo. |

Los archivos originales se conservan sin cambios en `reportes/originales/`.

### Filtros de los dashboards

- **Comparar** cualquier temporada contra otra (o ver una sola).
- **Periodo**: rango (a la fecha, semanas completas, últimas 4/8/13, temporada completa o personalizado) o **una semana** con flechas para recorrerla.
- **Métrica**: por ejemplo Tassels Only, órdenes totales o % de Tassels Only.
- **Tipo de asignación**: uno, varios o todos.
- La casilla «incluir filas con todo en 0» de los reportes también está como interruptor.

Los totales comparan siempre **las mismas semanas** en ambas temporadas (la tarjeta
de la temporada anterior muestra también su total completo). Si la última semana
todavía estaba en curso cuando se exportó el CSV, se marca con `*`.

**Cómo cuadrar el dashboard con el HTML.** Los KPIs y gráficas cuentan las semanas
1…N. La fila **N/A** del HTML (filas anteriores al lunes de la semana 1 o sin fecha
legible) no pertenece a ninguna semana, por eso no está en las gráficas, pero el
**TOTAL** del HTML sí la incluye. La «Tabla del reporte» muestra la tabla completa,
idéntica a la del HTML. Cada temporada se calcula con la opción «incluir filas con
todo en 0» con la que se procesó; si las dos temporadas difieren aparece un aviso y
el interruptor permite igualarlas. Los filtros duran solo mientras la app está
abierta y el botón «Restablecer filtros» los regresa a su estado inicial.

### Llevar resultados a Excel

- **Exportar a Excel** (botón azul del dashboard): libro con Resumen, Semanal,
  Acumulado, Variación, Por tipo, Participación, Mezcla, Mapa de calor y Datos.
  Las tablas tienen **fórmulas vivas** y las gráficas son **gráficas nativas de Excel** (editables).
- Menú **⋯** de cada gráfica: copiar imagen (se pega en Excel, PowerPoint o correo),
  descargar PNG, copiar los datos o descargar un Excel solo con esa gráfica.
- **PDF**: diseño de impresión limpio, en horizontal.

---

## Uso semanal

1. Abre **Reportes → Tassels Only por semana** (o Homeship).
2. Elige el **CSV o el Excel (.xlsx)**; si el libro tiene varias hojas, elige la hoja.
   Revisa el **lunes de la semana 1**: arranca en el mismo valor que el HTML original
   (2025-06-30); cámbialo para otra temporada o usa uno de los botones de
   «Temporadas ya guardadas». La **temporada** se toma del año de ese lunes.
3. **Procesar** → aparece la tabla de siempre (con su botón para copiar a Excel). Si
   muchas filas quedan antes del lunes de inicio o hay semanas imposibles, aparece un
   aviso: casi siempre significa que el lunes de inicio no corresponde al archivo.
4. **Guardar en el dashboard**. Si la temporada ya existía, se reemplaza por la nueva
   versión. Si cambias algo después de procesar, hay que volver a procesar.

En archivos de Excel las celdas se leen por su **valor**, no por el texto que muestran:
las fechas reales no dependen del formato Mes/Día o Día/Mes (ese selector solo aplica a
fechas escritas como texto) y una cantidad 0.4 con formato «0» cuenta como 0.4. Se lee
la **hoja activa** del libro (la misma que Excel guarda como CSV) salvo que elijas otra.
Las filas en blanco entre datos cuentan igual que en el CSV (van a N/A como «sin fecha
válida»); las del final de la hoja se ignoran. Los .xls antiguos y los libros con
contraseña se deben guardar como .xlsx sin contraseña o como CSV.

La temporada del año pasado se procesa **una sola vez**: queda guardada y ya no hay
que volver a cargarla. En «Temporadas ya guardadas» puedes hacer clic en una para
rellenar su temporada y su lunes de inicio.

---

## Excel como base de datos

Todo se guarda automáticamente en el navegador de cada computadora (IndexedDB).
Además hay tres formas de usar un Excel como base:

1. **Exportar / importar** (cualquier navegador): *Base de datos → Descargar base en Excel*
   genera `REPORT_DB.xlsx` con las hojas `Temporadas`, `Datos` (formato largo, ideal
   para tablas dinámicas) y `Campos`. Se importa con *Importar desde Excel*.
2. **Excel vinculado** (Chrome o Edge en computadora): *Crear Excel nuevo* o
   *Vincular un Excel existente*. La app lo lee al abrir, lo revisa cada 20 segundos
   mientras está abierta y lo reescribe cada vez que se guarda una temporada. Si el
   archivo está en una carpeta de **OneDrive, SharePoint o Teams**, todo el equipo
   comparte la misma base. Si alguien edita un valor en el Excel, la app lo toma en la
   siguiente sincronización. Por cada temporada gana la versión más reciente; los
   borrados quedan registrados en la hoja `Borrados`, así que si dos personas guardan
   al mismo tiempo no se pierde la temporada de ninguna.
3. **Base compartida publicada**: si existe `data/REPORT_DB.xlsx` junto a la app,
   cada persona recibe esas temporadas automáticamente al abrirla (ver `data/LEEME.md`).

---

## Usarla desde una carpeta compartida de OneDrive

Funciona: copia la carpeta del proyecto a OneDrive/SharePoint y cada persona abre
`index.html` con Chrome o Edge. Ten en cuenta:

- Abierta como archivo **no es instalable ni funciona sin conexión** (eso requiere
  publicarla en un sitio `https://`, ver abajo); todo lo demás funciona igual.
- OneDrive comparte **los archivos**, no la memoria de cada navegador: cada persona
  guarda sus temporadas en su propia computadora. Para compartirlas, vincula en
  *Base de datos* el mismo `REPORT_DB.xlsx` dentro de esa carpeta (cada persona lo
  vincula una vez).
- Los cambios de otra persona **no llegan al instante como con un servidor**: llegan
  cuando OneDrive sincroniza el archivo (normalmente segundos o pocos minutos) y la app
  lo detecta (revisa cada 20 s). Si alguien tiene el Excel abierto en Excel, la app
  espera y reintenta.

**¿Y SQLite?** No cambia lo anterior: SQLite en el navegador sería otra copia local
por persona y, puesto como archivo en OneDrive, OneDrive lo sincroniza por archivo
completo (sin bloqueos entre computadoras), con riesgo de copias en conflicto o de
dañar la base. Para ver cambios al instante, como un servidor, hace falta un servidor
o una base en la nube: por ejemplo un servicio pequeño (Node + SQLite/PostgreSQL) en
un equipo de la empresa, o una lista de SharePoint vía Microsoft Graph. La app ya
separa los datos (`js/core/store.js`), así que se puede conectar a cualquiera de esas
opciones sin rehacer los dashboards.

## Publicar para el equipo (GitHub Pages)

1. Fusiona esta rama en `main`.
2. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)`.
3. En unos minutos queda en `https://<usuario>.github.io/<repositorio>/`. Comparte
   esa liga; cada persona puede instalarla con el botón **Instalar app**.

> **Privacidad:** si el repositorio es público, el sitio también lo es. Los CSV nunca
> salen de cada computadora, pero lo que pongas en `data/REPORT_DB.xlsx` sí queda
> publicado. Para un sitio privado usa un repositorio privado con un plan que lo
> permita, o cualquier hosting interno (es una carpeta estática: IIS, SharePoint,
> un servidor de archivos con HTTPS, etc.).

Para probar en una computadora sin publicar: `npx http-server .` y abrir
`http://localhost:8080`. (También abre con doble clic en `index.html`, pero sin
modo sin conexión ni base compartida.)

### Al publicar cambios

Sube el número de `VERSION` en `sw.js` (por ejemplo `report-hub-v1.0.1`). Así cada
persona ve el aviso «Nueva versión disponible» y actualiza con un clic.

---

## Agregar un reporte nuevo

Ejemplo: el reporte de **Gowns** (el tablero GOWNS ya está reservado).

1. **Página del reporte.** Copia `reportes/plantilla.html` como `reportes/gowns.html`.
   En la sección `EDITA AQUÍ` define:
   ```js
   const DATASET = 'gowns';            // nombre interno de los datos
   const CAMPOS = ['con', 'filas'];     // números que se guardan por semana y tipo
   function contarFila(row, idx, c) {   // qué suma cada fila del CSV
     c.filas++;
     if (RH.csv.num(row[idx.valor]) > 0) c.con++;
   }
   ```
   Si ya tienes un HTML propio, basta con incluir `js/core/util.js`, `js/core/store.js`,
   `js/registry.js` y `js/puente.js`, y llamar a `RH.puente.panelGuardar(...)` como en
   `reportes/tassel-only.html`.

2. **Registro.** En `js/registry.js`:
   ```js
   // en reportes[]
   { id: 'gowns', titulo: 'Gowns', archivo: 'reportes/gowns.html', dashboard: 'gowns', descripcion: '...' }

   // en dashboards[] (el de GOWNS): estado 'activo', campos y métricas
   {
     id: 'gowns', titulo: 'GOWNS', dataset: 'gowns', reporte: 'gowns', estado: 'activo',
     campos: { con: 'Órdenes con gown', filas: 'Órdenes totales' },
     opciones: [],
     metricas: [
       { id: 'gowns', etiqueta: 'Gowns', num: c => c.con },
       { id: 'ordenes', etiqueta: 'Órdenes totales', num: c => c.filas },
       { id: 'share', etiqueta: '% Gowns', tipo: 'ratio', num: c => c.con, den: c => c.filas }
     ],
     principal: 'gowns', participacion: 'share'
   }
   ```
   Un reporte que no alimenta ningún tablero se registra con `dashboard: null`.

3. **Sin conexión.** Agrega `'reportes/gowns.html'` a la lista `ARCHIVOS` de `sw.js`
   y sube `VERSION`.

Todo lo demás (menú, panorama, filtros, KPIs, gráficas, mapa de calor, exportación a
Excel, base de datos y sincronización) se activa solo.

---

## Estructura

```
index.html               aplicación (menú, rutas)
manifest.webmanifest     datos de instalación de la PWA
sw.js                    service worker (sin conexión y actualizaciones)
css/                     tokens de diseño (claro/oscuro) y estilos
js/registry.js           ← registro de reportes y dashboards
js/app.js                arranque, navegación, tema, PWA
js/puente.js             conexión reporte ⇄ dashboard (guardar temporada)
js/core/                 util, almacenamiento (IndexedDB), CSV, lector de Excel por
                         streaming (excel-filas.js), tabla del reporte (tablas.js), modelo,
                         ZIP + XLSX (lectura/escritura con gráficas nativas),
                         Excel como base de datos, datos de demostración
js/ui/                   gráficas, dashboard, panorama, base de datos, guía
reportes/                páginas de reporte, plantilla y originales
vendor/                  Chart.js 4.5.1 (MIT), incluido para funcionar sin conexión
data/                    base compartida opcional (REPORT_DB.xlsx)
icons/                   íconos de la app
```

## Proyección de temporada

La vista **Proyección de temporada** estima el cierre de la temporada actual con las
anteriores. Es dinámica: eliges el reporte (cualquier dashboard registrado), qué proyectar
(una métrica o cualquier campo guardado), los tipos, las temporadas base, la semana de corte
y el método. Métodos: índice de crecimiento (real a la fecha ÷ base a la misma fecha, aplicado
al resto), índice reciente (últimas *m* semanas), crecimiento geométrico (P = P₀·(1+r)ⁿ, como
en poblaciones), lineal y promedio histórico. La tabla inferior compara todos; el rango va del
escenario más bajo al más alto según cada base. Con una sola temporada base es orientativo.
El cálculo está en `js/core/proyeccion.js` y la vista en `js/ui/proyeccion.js`.

## Ayuda en pantalla

Cada gráfica tiene un botón **ⓘ** (cursor, clic o teclado) que explica qué muestra y cómo
leerla; términos como **pp** o **N/A** se subrayan solos y muestran su definición. Todos los
textos están en `js/ui/info.js` y el glosario también aparece en la Guía de uso.

## Privacidad y seguridad

- La aplicación **no se conecta a nada**: no hay servicios externos, CDN, fuentes ni analítica
  (la librería de gráficas va incluida en `vendor/`). Además, una política de seguridad
  (Content-Security-Policy) en `index.html` y en cada página de reporte impide al navegador
  hacer conexiones hacia afuera; se verificó que `fetch`, WebSocket e imágenes externas quedan
  bloqueados y que en un recorrido completo no sale ninguna petición fuera del propio sitio.
- Los datos viven en el navegador de cada persona (IndexedDB) y en el Excel que se vincule.
- **Permisos:** se administran en el archivo `REPORT_DB.xlsx` de Teams/OneDrive. No se usan
  enlaces con descarga automática porque eso exigiría conectarse a Microsoft e iniciar sesión
  desde la aplicación; en su lugar, se sincroniza la carpeta de OneDrive/Teams en cada equipo
  y se usa «Vincular Excel» (ver la sección de OneDrive).

### Fidelidad con los reportes originales

Las páginas de `reportes/` conservan la misma lógica de lectura y conteo que los
originales y arrancan con los mismos valores por defecto (no recuerdan valores de
sesiones anteriores). Se verificó con CSV de prueba (comillas, saltos de línea dentro
de celdas, filas sin fecha, tipos vacíos, valores con comas) y con los mismos datos en
Excel (.xlsx), que la tabla copiada a Excel, los totales y el detalle sean idénticos a
los de `reportes/originales/`, con y sin la casilla de «filas con todo en 0», tanto
fijando la configuración como dejando los valores por defecto. También se verificó
que la «Tabla del reporte» del dashboard, reconstruida desde lo guardado, sea idéntica.
