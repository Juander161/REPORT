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

## GOWNS (cantidades u órdenes por producto)

`reportes/gowns.html` es dinámico: eliges la **columna de fecha** (semanas), la **columna de tipo**
con los **tipos a incluir** (por defecto `GREG, COLL`), los **productos** (cualquier columna de
cantidad) y las **medidas**: *cantidades* (suma) u *órdenes* (filas con cantidad > 0). Por cada
producto y medida se guarda un reporte `PRODUCTO_temporada_sum` o `PRODUCTO_temporada_count`
(p. ej. `GOWN_2026_sum`); el dashboard GOWNS tiene el filtro «Producto y medida» y el resto
(comparativo, proyección, Excel, base compartida) funciona igual que en los otros reportes.
Se comprobó contra un cálculo independiente (4 vistas, con N/A, tipos en minúsculas y cantidades
con coma). Para otro reporte con productos distintos basta con elegir otras columnas.

**52 semanas y N/A:** en todos los reportes la tabla muestra siempre las semanas 1–52 (con ceros
si no hay datos; si hubiera fechas posteriores, aparecen después). Todo lo anterior al lunes de la
semana 1 (por ejemplo enero o febrero, salteado) o sin fecha se suma en **una sola fila N/A**
(«semana 0»), antes de la semana 1; el TOTAL queda al final. En los dashboards, el panorama y la
proyección el N/A se incluye como semana 0 en los totales y comparativos (interruptor «Incluir
N/A»). La temporada se sugiere por el año en que termina (empieza 29/6/2026 → «2027»).
Estos son los únicos cambios de presentación respecto a los HTML originales; los conteos no cambian.

## GOWNS ACTIVAS (dos archivos)

`reportes/gowns-activas.html` toma dos archivos de órdenes activas (A1 y A2). Primero identifica
las **órdenes únicas** por su número (se normaliza: `100001`, `100001.0` y `100,001` son la misma;
una orden en ambos archivos, o repetida en uno, cuenta una vez, y tú eliges de qué archivo se
toman sus datos). Después hace lo mismo que GOWNS: por producto, cantidades (suma) y/u órdenes
(órdenes únicas con cantidad > 0) por semana y tipo, con las 52 semanas y el N/A antes de la
semana 1. Todo es seleccionable por archivo: columna de número de orden, de fecha y de tipo,
formato de fecha, y la columna de cada producto (que puede llamarse distinto en A1 y A2). Los
nombres de tipo se detectan y se agrupan en GREG, COLL u otros grupos que definas (o se
ignoran). Se guarda un reporte por producto y medida en el dashboard **GOWNS ACTIVAS**.
Equivale a tu proceso manual: `UNIQUE(VSTACK(A1; A2))` + `IFERROR(XLOOKUP(A1), XLOOKUP(A2))`
(si una orden está en ambos, se toman los datos de A1; se puede cambiar a A2). Las filas sin número
de orden se excluyen (en Excel tampoco se encuentran). Al procesar aparece un panel de **auditoría**:
conteos comparables con tu hoja, sumas por producto de todas las órdenes y de las agrupadas por tipo
(y cuánto viene de A1 y de A2), descarga del detalle (una fila por orden única, como tu hoja con los
valores traídos) y una comparación contra tu lista de números de orden. La casilla «OTROS» cuenta los
tipos sin grupo para poder cuadrar contra el total de todas las órdenes. Comprobado contra un cálculo
independiente con CSV y con Excel (5 000 órdenes únicas, 1 200 repetidas entre archivos).

## TASSELS ONLY y HOMESHIP con dos archivos

`reportes/dos-archivos.html` (menú Reportes → «Tassels Only (2 archivos)» y «Homeship (2 archivos)»)
aplica la misma lógica de órdenes únicas de GOWNS ACTIVAS: se cargan A1 y A2, se identifica cada orden
una sola vez por su número (si está en los dos, se usan los datos del archivo elegido) y después se
aplica exactamente la lógica del reporte de un archivo (Tassels Only: objetivo > 0 y las demás en 0;
Homeship: filtro por palabra menos Tassels Only). Por archivo se eligen las columnas de orden, fecha,
tipo y filtro, y para cada columna QTY cuál es en A1 y en A2. Guarda en el mismo dashboard y trae el
panel de auditoría. Comprobado contra un cálculo independiente (4 000 órdenes únicas, 900 repetidas).

## Compartir los datos con todo el equipo (solo archivos, sin links)

Pensado para cuando no se pueden usar links ni servidores:

1. La carpeta de la app se comparte como carpeta (red, Teams/OneDrive sincronizada, USB o un .zip).
2. Quien actualiza los datos entra a **Base de datos → Publicar para el equipo → Elegir carpeta de la
   app** (Chrome o Edge, una sola vez). A partir de ahí, cada vez que guarda una temporada la app
   escribe sola `data/REPORT_DB.xlsx` y `data/base-compartida.js`. En otros navegadores:
   «Descargar archivos de publicación» y copiarlos a `data/`.
3. Las demás personas abren `index.html` desde esa carpeta. La app carga `data/base-compartida.js`
   (un archivo .js con la base dentro, que funciona incluso abriendo la carpeta directamente, sin
   servidor ni red) al abrir y cada minuto mientras está abierta, y combina las temporadas con las que
   ya tenga esa computadora (gana la versión más reciente de cada temporada; lo borrado también se
   propaga). No hay que enviarles nada.

Límites: al abrir como carpeta (`file://`) no hay instalación ni modo sin conexión de PWA (se necesita
http/https); en Chrome/Edge el permiso de escritura de la carpeta puede pedirse otra vez al reabrir el
navegador («Publicar ahora»). La sincronización de OneDrive/Teams puede tardar en llegar a los demás.

## Actualizaciones semanales y comparación entre ellas

Cada semana se procesa el reporte nuevo con la **misma etiqueta de temporada** (por ejemplo 2027): la
temporada se reemplaza y los dashboards muestran lo más reciente. La versión que se reemplaza se
conserva en el **historial de actualizaciones** (Base de datos), fechada con el corte del archivo. En el
dashboard, «Temporada actual» y «Comparar» incluyen esas actualizaciones («2027 · actual», «2027 · act.
12 oct 2026»): se puede intercalar entre ellas y compararlas para ver qué cambió entre una semana y la
siguiente (los datos de semanas pasadas cambian). El historial va en el Excel de la base
(hojas `Versiones` y `DatosVersiones`) y se comparte con el resto del equipo. Borrar una temporada
borra también su historial.

## Operación en equipo con una carpeta compartida

La carpeta completa de la app se coloca en un lugar compartido y todos abren **`index.html`** (doble
clic, Chrome o Edge). Ver `LEEME-EQUIPO.txt` para las indicaciones al equipo. Quien actualiza (la
persona responsable o, si falta, cualquiera del equipo) usa *Base de datos → Publicar para el equipo →
Elegir carpeta de la app*; la app combina lo que ya cargó de la carpeta con lo nuevo, así que no se
pierde nada aunque cambie quien publica. El panorama general se personaliza (⚙ Personalizar: tarjetas,
orden y secciones, guardado en cada navegador) y la barra lateral se pliega y se puede contraer a
íconos.

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

- **Cero terceros:** no hay Bootstrap ni CDN, fuentes, APIs ni analítica externos
  (la librería de gráficas va incluida en `vendor/`). Además, una política de seguridad
  (Content-Security-Policy) en `index.html` y en cada página de reporte impide al navegador
  hacer conexiones hacia afuera; se verificó que `fetch`, WebSocket e imágenes externas quedan
  bloqueados y que en un recorrido completo no sale ninguna petición fuera del propio sitio.
- Los datos viven en el navegador de cada persona (IndexedDB) y en el Excel que se vincule.
- **Única conexión posible:** *Base de datos → Abrir Excel desde un enlace* lee (solo lectura)
  un `REPORT_DB.xlsx` de `*.sharepoint.com` (Teams/OneDrive de empresa). Es el único dominio
  externo que permite la política de seguridad (`connect-src` en `index.html`; si tu tenant usa
  otro dominio, se agrega ahí). Los permisos los administras en Teams/OneDrive.
  Limitación: SharePoint normalmente no deja que otra página lea sus archivos (CORS) ni sin
  sesión iniciada; si el navegador lo bloquea, la app lo explica y la alternativa fiable es
  sincronizar la carpeta y usar «Vincular Excel» (ver la sección de OneDrive).

### Fidelidad con los reportes originales

Las páginas de `reportes/` conservan la misma lógica de lectura y conteo que los
originales y arrancan con los mismos valores por defecto (no recuerdan valores de
sesiones anteriores). Se verificó con CSV de prueba (comillas, saltos de línea dentro
de celdas, filas sin fecha, tipos vacíos, valores con comas) y con los mismos datos en
Excel (.xlsx), que la tabla copiada a Excel, los totales y el detalle sean idénticos a
los de `reportes/originales/`, con y sin la casilla de «filas con todo en 0», tanto
fijando la configuración como dejando los valores por defecto. También se verificó
que la «Tabla del reporte» del dashboard, reconstruida desde lo guardado, sea idéntica.


## Comparativo SY (Shipped + Open)

`reportes/comparativo-sy.html` replica el reporte «Imported Date comparison SY26 vs SY27»: Shipments Report (enviadas) + Open Orders Report (abiertas), órdenes únicas por número, College / Scholastic por semana (52 + «Previous Season» = N/A), temporada anterior tomada de lo guardado, totales, acumulados, deltas YOY y gráfica. Se copia a Excel o se descarga como .xlsx con fórmulas y gráfica nativa. Se guarda en el dashboard COMPARATIVO SY; la temporada guardada pasa a ser la «anterior» del año siguiente.

En los reportes de 2 archivos, la fila del encabezado se detecta sola (títulos arriba del reporte) y se puede corregir; las columnas de cantidad se reconocen por QTY, QUANTITY, CANT, UNITS… y se pueden agregar otras a mano.

### Tassels Only / Homeship con 2 archivos: mismas reglas que el reporte manual
Columna de orden por defecto `ORACLE ORDER NUMBER`; las órdenes repetidas **entre** archivos se descartan (A1 manda) y las repetidas dentro de un mismo archivo solo si se marca la casilla; las filas sin número se cuentan; el tipo se agrupa en COLL / GREG (College si contiene COLLEGE o es C o COLL). Verificado contra `homeship_dos_archivos_3.html` con los mismos archivos: totales idénticos.
