# Base compartida del equipo

Si en esta carpeta existe **`REPORT_DB.xlsx`**, la app lo descarga al abrirse y
agrega sus temporadas a cada computadora (por ejemplo, la temporada del año
pasado, para que nadie tenga que volver a procesar ese CSV).

Cómo generarlo:

1. En la app, procesa y guarda las temporadas que quieras compartir.
2. Ve a **Base de datos → Descargar base en Excel**.
3. Sube el archivo descargado aquí con el nombre exacto `data/REPORT_DB.xlsx`.

> Ojo: todo lo que esté en esta carpeta queda visible para cualquiera que pueda
> ver el sitio publicado. Son conteos semanales agregados (no hay datos de
> clientes), pero publícalo solo si el sitio es de acceso restringido o si esos
> totales pueden ser públicos.

## Compartir solo con archivos

La app también publica aquí **`base-compartida.js`** (la misma base, lista para leerse al abrir la app
desde una carpeta, sin servidor). Lo genera la app: *Base de datos → Publicar para el equipo*. No lo
edites a mano.
