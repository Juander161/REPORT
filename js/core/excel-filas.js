/* Report Hub · lector de Excel (.xlsx / .xlsm) fila por fila, por streaming.
   Entrega cada fila como un arreglo de textos, igual que una línea del CSV que
   Excel guardaría de esa hoja, para que los reportes apliquen EXACTAMENTE la
   misma lógica que con un CSV:
   - celdas de texto, números y fórmulas → su texto/valor;
   - en las columnas de fecha indicadas, los números de serie con formato de
     fecha se convierten a 'AAAA-MM-DD[ HH:MM]' (lo que parseFecha entiende sin
     importar el formato Mes/Día o Día/Mes); un número sin formato de fecha se
     deja como número, igual que en el CSV;
   - las celdas vacías se entregan como "" y cada fila trae al menos tantas
     columnas como el encabezado;
   - las filas en blanco ENTRE filas con datos se entregan como filas vacías
     (en el CSV salen como ",,,,"); las del final se omiten.
   No carga la hoja completa en memoria: lee el ZIP por partes, descomprime con
   DecompressionStream y recorre el XML en trozos. */
(function (RH) {
  'use strict';

  const DIA = 86400000;

  // ---------------------------------------------------------------- utilidades
  function esExcel(file) {
    return !!file && /\.(xlsx|xlsm|xltx|xltm)$/i.test(file.name || '');
  }
  function esExcelViejo(file) {
    return !!file && /\.(xls|xlsb)$/i.test(file.name || '');
  }

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function entidades(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e];
    });
  }
  /** Texto de un nodo XML: fin de línea normalizado (como cualquier lector XML), CDATA y entidades */
  function decodificar(s) {
    if (s.indexOf('\r') >= 0) s = s.replace(/\r\n?/g, '\n');
    if (s.indexOf('<![CDATA[') >= 0) {
      let out = '', ult = 0, m;
      const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
      while ((m = re.exec(s))) { out += entidades(s.slice(ult, m.index)) + m[1]; ult = re.lastIndex; }
      s = out + entidades(s.slice(ult));
    } else s = entidades(s);
    // Excel guarda los caracteres de control como _xHHHH_
    if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    return s;
  }

  // <t/> y <t xml:space="preserve"/> son texto vacío: el cierre "/>" se prueba primero
  const RE_T = /<(?:\w+:)?t(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g;
  const RE_RPH = /<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g;
  /** Texto de un <si> o <is>: concatena sus <t> (incluye los de <r>) y omite la fonética <rPh> */
  function textoRico(xml) {
    if (xml.indexOf('rPh') >= 0) xml = xml.replace(RE_RPH, '');
    let s = '';
    RE_T.lastIndex = 0;
    let m;
    while ((m = RE_T.exec(xml))) if (m[1] != null) s += m[1];
    return decodificar(s);
  }

  /** Índice de columna de una referencia como "B12" (-1 si no es válida) */
  function colIdx(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      let c = ref.charCodeAt(i);
      if (c >= 97 && c <= 122) c -= 32;
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  function hhmm(min) {
    return min ? ' ' + String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0') : '';
  }

  function serialAFecha(v, en1904) {
    const n = parseFloat(v);
    if (!isFinite(n) || n <= 0) return v;
    // la hoja redondea al milisegundo antes de mostrar: 45844.99999999999 ya es el día siguiente
    const msTot = Math.round(n * DIA);
    const dias = Math.floor(msTot / DIA), resto = msTot - dias * DIA;
    const ms = en1904 ? (dias - 24107) * DIA : (dias < 61 ? (dias - 25568) * DIA : (dias - 25569) * DIA);
    const d = new Date(ms);
    if (isNaN(d) || d.getUTCFullYear() > 9999) return v;
    // la hora solo se agrega para mostrarla en los listados (parseFecha usa la fecha);
    // como en el formato h:mm, los segundos se truncan
    return d.toISOString().slice(0, 10) + hhmm(Math.floor(resto / 60000));
  }

  /** Celda t="d" (fecha ISO 8601) → mismo formato que serialAFecha */
  function isoAFecha(v) {
    const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
    return m ? m[1] + hhmm(m[2] ? +m[2] * 60 + +m[3] : 0) : v;
  }

  // ---------------------------------------------------------------- ZIP por partes
  async function bytes(file, ini, fin) {
    return new Uint8Array(await file.slice(ini, fin).arrayBuffer());
  }

  const OLE = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

  async function abrirZip(file) {
    const cab = await bytes(file, 0, 8);
    if (cab.length === 8 && OLE.every((b, i) => cab[i] === b)) {
      throw new Error('El libro está protegido con contraseña o es un .xls antiguo: ábrelo en Excel y guárdalo como .xlsx sin contraseña o como CSV UTF-8.');
    }
    const largoCola = Math.min(file.size, 65536 + 22 + 20);
    const cola = await bytes(file, file.size - largoCola, file.size);
    const dv = new DataView(cola.buffer);
    // el fin del directorio (EOCD) se busca desde el final; un comentario del ZIP puede
    // contener la misma firma, así que se prefiere el registro cuyo directorio termina
    // justo donde empieza él (o, en ZIP64, el que va precedido de su localizador)
    const baseCola = file.size - cola.length;
    let eocd = -1, respaldo = -1;
    for (let i = cola.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) !== 0x06054b50) continue;
      const fin = dv.getUint32(i + 12, true) + dv.getUint32(i + 16, true);
      const zip64 = i >= 20 && dv.getUint32(i - 20, true) === 0x07064b50;
      if (fin === baseCola + i || zip64) { eocd = i; break; }
      if (respaldo < 0) respaldo = i;
    }
    if (eocd < 0) eocd = respaldo;
    if (eocd < 0) throw new Error('El archivo no es un libro de Excel .xlsx válido.');
    let total = dv.getUint16(eocd + 10, true);
    let tamCD = dv.getUint32(eocd + 12, true);
    let offCD = dv.getUint32(eocd + 16, true);
    // ZIP64 (libros muy grandes)
    if ((offCD === 0xFFFFFFFF || tamCD === 0xFFFFFFFF || total === 0xFFFF) && eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50) {
      const off64 = Number(dv.getBigUint64(eocd - 20 + 8, true));
      const r = new DataView((await bytes(file, off64, off64 + 56)).buffer);
      if (r.getUint32(0, true) === 0x06064b50) {
        total = Number(r.getBigUint64(32, true));
        tamCD = Number(r.getBigUint64(40, true));
        offCD = Number(r.getBigUint64(48, true));
      }
    }
    const cd = await bytes(file, offCD, offCD + tamCD);
    const cv = new DataView(cd.buffer);
    const dec = new TextDecoder('utf-8');
    const entradas = new Map();
    let p = 0;
    for (let i = 0; i < total && p + 46 <= cd.length; i++) {
      if (cv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = cv.getUint16(p + 10, true);
      let csize = cv.getUint32(p + 20, true);
      let usize = cv.getUint32(p + 24, true);
      const nl = cv.getUint16(p + 28, true), xl = cv.getUint16(p + 30, true), cl = cv.getUint16(p + 32, true);
      let off = cv.getUint32(p + 42, true);
      const nombre = dec.decode(cd.subarray(p + 46, p + 46 + nl));
      // campo extra ZIP64
      let q = p + 46 + nl;
      const finExtra = q + xl;
      while (q + 4 <= finExtra) {
        const id = cv.getUint16(q, true), len = cv.getUint16(q + 2, true);
        if (id === 0x0001) {
          let k = q + 4;
          if (usize === 0xFFFFFFFF) { usize = Number(cv.getBigUint64(k, true)); k += 8; }
          if (csize === 0xFFFFFFFF) { csize = Number(cv.getBigUint64(k, true)); k += 8; }
          if (off === 0xFFFFFFFF) { off = Number(cv.getBigUint64(k, true)); k += 8; }
        }
        q += 4 + len;
      }
      entradas.set(nombre.toLowerCase(), { nombre, metodo, csize, usize, off });
      p += 46 + nl + xl + cl;
    }
    return entradas;
  }

  /** Stream de texto de una entrada del ZIP; contador(n) recibe los bytes comprimidos leídos */
  async function streamTexto(file, e, contador) {
    const lh = new DataView((await bytes(file, e.off, e.off + 30)).buffer);
    if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('El archivo de Excel está dañado.');
    const ini = e.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    let s = file.slice(ini, ini + e.csize).stream();
    if (contador) s = s.pipeThrough(new TransformStream({ transform(ch, c) { contador(ch.byteLength); c.enqueue(ch); } }));
    if (e.metodo === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede leer archivos de Excel. Usa Chrome, Edge, Firefox o Safari actualizados, o guarda el archivo como CSV.');
      s = s.pipeThrough(new DecompressionStream('deflate-raw'));
    } else if (e.metodo !== 0) throw new Error('Compresión no soportada en el archivo de Excel.');
    return s.pipeThrough(new TextDecoderStream('utf-8'));
  }

  async function textoCompleto(file, e) {
    const r = (await streamTexto(file, e)).getReader();
    let s = '';
    for (;;) { const { done, value } = await r.read(); if (done) break; s += value; }
    return s;
  }

  /**
   * Recorre los elementos <tag ...>...</tag> (o <tag/>) de un stream de XML sin
   * cargarlo completo. cb(xmlDelElemento) por cada uno, en orden. Los
   * comentarios <!-- --> se descartan (también si quedan partidos entre trozos).
   */
  async function porElementos(stream, tag, cb) {
    const reader = stream.getReader();
    const abre = new RegExp('<(?:\\w+:)?' + tag + '(?=[\\s>/])', 'g');
    const cierra = new RegExp('</(?:\\w+:)?' + tag + '>', 'g');
    let buf = '';
    let fin = false;
    while (!fin) {
      const { done, value } = await reader.read();
      if (done) fin = true; else buf += value;
      // hasta dónde se puede analizar: antes de un comentario que todavía no se cierra
      if (buf.indexOf('<!--') >= 0) buf = buf.replace(/<!--[\s\S]*?-->/g, '');
      let limite = buf.length;
      const k = buf.indexOf('<!--');
      if (k >= 0) { if (fin) buf = buf.slice(0, k); else limite = k; }
      else if (!fin) {
        // un "<!-" partido al final del trozo se completa con el siguiente
        const j = buf.lastIndexOf('<!');
        if (j >= 0 && j > buf.length - 4) limite = j;
      }
      let pos = 0;
      for (;;) {
        abre.lastIndex = pos;
        const a = abre.exec(buf);
        if (!a || a.index >= limite) { pos = Math.max(pos, Math.min(limite, buf.length - 64)); break; }
        const finTag = buf.indexOf('>', a.index);
        if (finTag < 0 || finTag >= limite) { pos = a.index; break; }
        if (buf[finTag - 1] === '/') { cb(buf.slice(a.index, finTag + 1)); pos = finTag + 1; continue; }
        cierra.lastIndex = finTag;
        const c = cierra.exec(buf);
        if (!c || c.index + c[0].length > limite) { pos = a.index; break; }
        cb(buf.slice(a.index, c.index + c[0].length));
        pos = c.index + c[0].length;
      }
      buf = buf.slice(pos);
    }
  }

  // ---------------------------------------------------------------- libro
  /** Une una ruta relativa de una relación con la carpeta de la parte que la declara */
  function resolverRuta(base, destino) {
    destino = String(destino || '').replace(/\\/g, '/');
    const partes = (destino.startsWith('/') ? destino.slice(1) : (base ? base + '/' : '') + destino).split('/');
    const out = [];
    partes.forEach(p => { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); });
    return out.join('/');
  }
  const carpeta = ruta => ruta.indexOf('/') >= 0 ? ruta.slice(0, ruta.lastIndexOf('/')) : '';

  /** Relaciones de una parte: [{id, tipo, ruta}] (ruta ya resuelta, sin las externas) */
  async function relaciones(file, buscar, parser, parte) {
    const ruta = (carpeta(parte) ? carpeta(parte) + '/' : '') + '_rels/' + parte.slice(parte.lastIndexOf('/') + 1) + '.rels';
    const e = buscar(ruta);
    if (!e) return [];
    const doc = parser.parseFromString(await textoCompleto(file, e), 'application/xml');
    return Array.from(doc.getElementsByTagNameNS('*', 'Relationship'))
      .filter(r => (r.getAttribute('TargetMode') || '').toLowerCase() !== 'external')
      .map(r => ({ id: r.getAttribute('Id'), tipo: r.getAttribute('Type') || '', ruta: resolverRuta(carpeta(parte), r.getAttribute('Target')) }));
  }

  /** Atributo r:id de un <sheet>, con cualquier prefijo (transicional o Strict) */
  function idRelacion(sh) {
    for (const a of Array.from(sh.attributes)) {
      if (a.localName === 'id' && a.namespaceURI && /\/relationships$/.test(a.namespaceURI)) return a.value;
    }
    return sh.getAttribute('r:id');
  }

  async function libro(file) {
    if (esExcelViejo(file)) throw new Error('Los archivos .xls / .xlsb no se pueden leer aquí. En Excel usa «Guardar como» → «Libro de Excel (.xlsx)» o «CSV UTF-8».');
    const ent = await abrirZip(file);
    const buscar = n => ent.get(String(n).toLowerCase());
    const parser = new DOMParser();
    // el libro principal se ubica por _rels/.rels; la ruta usual queda de respaldo
    const raiz = await relaciones(file, buscar, parser, '');
    const doc = raiz.find(r => /\/officeDocument$/.test(r.tipo) && buscar(r.ruta));
    const rutaWb = doc ? doc.ruta : 'xl/workbook.xml';
    const wbE = buscar(rutaWb);
    if (!wbE) throw new Error('El archivo no parece un libro de Excel (.xlsx).');
    const wb = parser.parseFromString(await textoCompleto(file, wbE), 'application/xml');
    const rels = await relaciones(file, buscar, parser, rutaWb);
    const porId = {};
    rels.forEach(r => { porId[r.id] = r; });
    const pr = wb.getElementsByTagNameNS('*', 'workbookPr')[0];
    const d1904 = pr ? /^(1|true)$/i.test(pr.getAttribute('date1904') || '') : false;
    const vista = wb.getElementsByTagNameNS('*', 'workbookView')[0];
    const activa = vista ? parseInt(vista.getAttribute('activeTab') || '0', 10) || 0 : 0;
    // solo hojas de cálculo (las hojas de gráfico no tienen filas)
    const hojas = Array.from(wb.getElementsByTagNameNS('*', 'sheet')).map((sh, i) => {
      const r = porId[idRelacion(sh)];
      const esHoja = r ? /\/worksheet$/.test(r.tipo) : false;
      return {
        nombre: sh.getAttribute('name'), indice: i,
        oculta: (sh.getAttribute('state') || 'visible') !== 'visible',
        ruta: r ? r.ruta : '', entrada: esHoja ? buscar(r.ruta) : null
      };
    }).filter(h => h.entrada);
    if (!hojas.length) throw new Error('El libro de Excel no tiene hojas de cálculo legibles.');
    const ss = rels.find(r => /\/sharedStrings$/.test(r.tipo) && buscar(r.ruta));
    const rutaSs = ss ? ss.ruta : resolverRuta(carpeta(rutaWb), 'sharedStrings.xml');
    const est = rels.find(r => /\/styles$/.test(r.tipo) && buscar(r.ruta));
    const rutaEstilos = est ? est.ruta : resolverRuta(carpeta(rutaWb), 'styles.xml');
    // hoja por defecto: la activa (la que Excel guarda como CSV) si es visible, si no la primera visible
    const act = hojas.find(h => h.indice === activa && !h.oculta);
    const porDefecto = act || hojas.find(h => !h.oculta) || hojas[0];
    return { ent, buscar, hojas, d1904, rutaSs, rutaEstilos, porDefecto };
  }

  async function cadenasCompartidas(file, lib, contador) {
    const e = lib.buscar(lib.rutaSs);
    const ss = [];
    if (!e) return ss;
    await porElementos(await streamTexto(file, e, contador), 'si', xml => ss.push(textoRico(xml)));
    return ss;
  }

  // formatos de número integrados que son fechas u horas (14-22, 45-47 y los de Asia oriental)
  const FECHA_INTEGRADOS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  /** ¿El código de formato muestra una fecha u hora? (sin contar textos entre comillas, escapes ni [colores]) */
  function codigoEsFecha(codigo) {
    const limpio = String(codigo).split(';')[0]
      .replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/[_*]./g, '')
      .replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
    return /[dmyhs]/i.test(limpio) && !/^general$/i.test(limpio.trim());
  }

  /** Por cada estilo de celda (atributo s), si su formato es de fecha; null si el libro no trae estilos */
  async function estilosFecha(file, lib) {
    const e = lib.buscar(lib.rutaEstilos);
    if (!e) return null;
    const doc = new DOMParser().parseFromString(await textoCompleto(file, e), 'application/xml');
    const propios = {};
    Array.from(doc.getElementsByTagNameNS('*', 'numFmt')).forEach(n => { propios[n.getAttribute('numFmtId')] = n.getAttribute('formatCode') || ''; });
    const xfs = doc.getElementsByTagNameNS('*', 'cellXfs')[0];
    if (!xfs) return null;
    return Array.from(xfs.children).filter(x => x.localName === 'xf').map(x => {
      const id = x.getAttribute('numFmtId') || '0';
      return id in propios ? codigoEsFecha(propios[id]) : FECHA_INTEGRADOS.has(parseInt(id, 10));
    });
  }

  function elegirHoja(lib, nombre) {
    if (nombre) { const h = lib.hojas.find(x => x.nombre === nombre); if (h) return h; }
    return lib.porDefecto;
  }

  const RE_C = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  const RE_V = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/;
  const RE_IS = /<(?:\w+:)?is(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?is>/;
  const RE_ROW = /^<(?:\w+:)?row\b([^>]*?)\/?>/;
  // atributos con comillas dobles o simples y espacios opcionales alrededor del "="
  const RE_AT = {};
  ['r', 't', 's'].forEach(n => { RE_AT[n] = new RegExp('(?:^|\\s)' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')'); });
  const attr = (s, n) => { const m = RE_AT[n].exec(s); return m ? (m[1] != null ? m[1] : m[2]) : null; };

  /** Número de fila (1, 2, …) de una <row>, o null si no lo declara */
  function numFila(xml) {
    const m = RE_ROW.exec(xml);
    const r = m ? attr(m[1], 'r') : null;
    const n = r != null ? parseInt(r, 10) : NaN;
    return n > 0 ? n : null;
  }

  /**
   * Convierte el XML de una <row> en arreglo de textos (null si la fila está vacía).
   * ctx: { ss, d1904, fechas: Set de columnas de fecha | null, estilos, cuenta }
   */
  function filaDesdeXml(xml, ctx) {
    const fila = [];
    let siguiente = 0, alguno = false;
    RE_C.lastIndex = 0;
    let m;
    while ((m = RE_C.exec(xml))) {
      const at = m[1] || '', cuerpo = m[2] || '';
      const r = attr(at, 'r');
      let ci = r ? colIdx(r) : siguiente;
      if (ci < 0) ci = siguiente;
      siguiente = ci + 1;
      const t = attr(at, 't');
      const enFecha = !!ctx.fechas && ctx.fechas.has(ci);
      let val = '';
      if (t === 'inlineStr') {
        const is = RE_IS.exec(cuerpo);
        val = is ? textoRico(is[1]) : '';
        if (enFecha && RE_FECHA_TEXTO.test(val)) ctx.cuenta.texto++;
      } else {
        const v = RE_V.exec(cuerpo);
        const crudo = v ? decodificar(v[1]) : '';
        if (t === 's') {
          val = crudo === '' ? '' : (ctx.ss[parseInt(crudo, 10)] ?? '');
          if (enFecha && RE_FECHA_TEXTO.test(val)) ctx.cuenta.texto++;
        } else if (t === 'b') val = crudo === '1' ? 'TRUE' : crudo === '0' ? 'FALSE' : crudo;
        else if (t === 'd') { val = isoAFecha(crudo); if (enFecha && val !== '') ctx.cuenta.serie++; }
        else if (t === 'str' || t === 'e') { val = crudo; if (enFecha && RE_FECHA_TEXTO.test(val)) ctx.cuenta.texto++; }
        else if (crudo !== '' && enFecha && esEstiloFecha(ctx.estilos, attr(at, 's'))) { val = serialAFecha(crudo, ctx.d1904); ctx.cuenta.serie++; }
        else {
          // "0E0" o "1E-3" se muestran en la hoja (y en su CSV) como 0 y 0.001
          val = /[eE]/.test(crudo) && isFinite(crudo) ? String(Number(crudo)) : crudo;
          if (enFecha && val !== '') ctx.cuenta.numero++;
        }
      }
      while (fila.length < ci) fila.push('');
      fila[ci] = val;
      if (val !== '') alguno = true;
    }
    return alguno ? fila : null;
  }

  // fecha escrita como texto con día y mes numéricos (la que depende de Mes/Día o Día/Mes)
  const RE_FECHA_TEXTO = /^\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/;

  // sin estilos (o con un índice desconocido) el número se toma como fecha
  function esEstiloFecha(estilos, s) {
    if (!estilos) return true;
    return estilos[s ? parseInt(s, 10) || 0 : 0] !== false;
  }

  /** Aviso cuando la columna de fecha no se puede leer igual que su CSV */
  function avisoFechas(c) {
    if (c.serie && c.texto) {
      return 'La columna de fecha mezcla ' + c.serie.toLocaleString() + ' fechas de Excel con ' + c.texto.toLocaleString() +
        ' fechas escritas como texto: suele pasar cuando el CSV se abre en Excel con otra configuración regional (Día/Mes) y se guarda como .xlsx, ' +
        'y entonces parte de las fechas queda con día y mes invertidos. Para obtener los números correctos usa el CSV original.';
    }
    if (c.numero) {
      return c.numero.toLocaleString() + ' celdas de la columna de fecha son números sin formato de fecha (en Excel se ven como números): ' +
        'quedan en N/A, igual que en el CSV. Si son fechas, aplícales un formato de fecha en Excel y vuelve a guardar.';
    }
    return null;
  }

  // ---------------------------------------------------------------- API
  /** Hojas de cálculo del libro: [{nombre, oculta, activa}] (activa = la que se lee por defecto) */
  async function hojas(file) {
    const lib = await libro(file);
    return lib.hojas.map(h => ({ nombre: h.nombre, oculta: h.oculta, activa: h === lib.porDefecto }));
  }

  /** Primera fila con datos (el encabezado), como textos sin normalizar */
  async function encabezados(file, opts) {
    opts = opts || {};
    const lib = await libro(file);
    const ss = await cadenasCompartidas(file, lib);
    const hoja = elegirHoja(lib, opts.hoja);
    let enc = null;
    let saltar = opts.filaEncabezado || 0;      // filas con contenido anteriores al encabezado (títulos del reporte)
    const reader = (await streamTexto(file, hoja.entrada)).getReader();
    // basta con leer hasta encontrar la fila del encabezado
    const parar = {};
    try {
      await porElementos(new ReadableStream({
        async pull(c) { const { done, value } = await reader.read(); if (done) c.close(); else c.enqueue(value); }
      }), 'row', xml => {
        if (enc) return;
        const f = filaDesdeXml(xml, { ss, d1904: lib.d1904, fechas: null });
        if (!f) return;
        if (saltar > 0) { saltar--; return; }
        enc = f; throw parar;
      });
    } catch (e) { if (e !== parar) throw e; }
    try { reader.cancel(); } catch (e) { /* nada */ }
    if (!enc) throw new Error('La hoja «' + hoja.nombre + '» no tiene datos.');
    return enc;
  }

  /** Primeras filas con contenido de la hoja (para detectar el encabezado y las columnas), como textos */
  async function muestra(file, opts) {
    opts = opts || {};
    const max = opts.max || 120;
    const lib = await libro(file);
    const ss = await cadenasCompartidas(file, lib);
    const hoja = elegirHoja(lib, opts.hoja);
    const filas = [];
    const reader = (await streamTexto(file, hoja.entrada)).getReader();
    const parar = {};
    try {
      await porElementos(new ReadableStream({
        async pull(c) { const { done, value } = await reader.read(); if (done) c.close(); else c.enqueue(value); }
      }), 'row', xml => {
        const f = filaDesdeXml(xml, { ss, d1904: lib.d1904, fechas: null });
        if (!f) return;
        filas.push(f);
        if (filas.length >= max) throw parar;
      });
    } catch (e) { if (e !== parar) throw e; }
    try { reader.cancel(); } catch (e) { /* nada */ }
    return filas;
  }

  /**
   * Lee todas las filas. opts:
   *  hoja: nombre (por defecto la hoja activa del libro si es visible)
   *  columnasFecha: nombres de columnas de fecha (se comparan en mayúsculas y sin espacios)
   *  alFila(arreglo): se llama con el encabezado y luego con cada fila
   *  alProgreso(bytesLeidos, tamañoArchivo, etapa)
   * Devuelve { hoja, aviso } (aviso: texto si la columna de fecha no se lee igual que en el CSV)
   */
  async function leer(file, opts) {
    opts = opts || {};
    const lib = await libro(file);
    let leidos = 0, ultimoAviso = 0, etapa = 'cadenas';
    const cuenta = n => {
      leidos += n;
      if (opts.alProgreso && leidos - ultimoAviso > 262144) { ultimoAviso = leidos; opts.alProgreso(leidos, file.size, etapa); }
    };
    if (opts.alProgreso) opts.alProgreso(0, file.size, etapa);
    const ss = await cadenasCompartidas(file, lib, cuenta);
    const estilos = await estilosFecha(file, lib);
    const hoja = elegirHoja(lib, opts.hoja);
    const nombresFecha = new Set((opts.columnasFecha || []).map(n => String(n).replace(/\s+/g, " ").trim().toUpperCase()));
    const ctx = { ss, d1904: lib.d1904, fechas: null, estilos, cuenta: { serie: 0, texto: 0, numero: 0 } };
    let fechas = null, ancho = 0;
    let saltar = opts.filaEncabezado || 0;      // filas con contenido anteriores al encabezado (títulos del reporte)
    // filas en blanco vistas desde la última fila con datos: se entregan solo si
    // después aparece otra fila con datos (en el CSV de Excel salen como ",,,,")
    let enBlanco = 0, ultimaFila = 0;
    etapa = 'filas';
    await porElementos(await streamTexto(file, hoja.entrada, cuenta), 'row', xml => {
      const n = numFila(xml) || ultimaFila + 1;
      const fila = filaDesdeXml(xml, ctx);
      if (fechas && n > ultimaFila + 1) enBlanco += n - ultimaFila - 1; // filas que el XML ni siquiera trae
      ultimaFila = Math.max(ultimaFila, n);
      if (!fila) { if (fechas) enBlanco++; return; }
      if (!fechas && saltar > 0) { saltar--; return; }
      if (!fechas) {
        fechas = new Set();
        ancho = fila.length;
        fila.forEach((c, i) => { if (nombresFecha.has(String(c).replace(/^\uFEFF/, '').replace(/\s+/g, " ").trim().toUpperCase())) fechas.add(i); });
        ctx.fechas = fechas;
      } else {
        for (; enBlanco > 0; enBlanco--) opts.alFila(new Array(ancho).fill(''));
        while (fila.length < ancho) fila.push('');
      }
      opts.alFila(fila);
    });
    if (!fechas) throw new Error('La hoja «' + hoja.nombre + '» no tiene datos.');
    if (opts.alProgreso) opts.alProgreso(file.size, file.size, 'listo');
    return { hoja: hoja.nombre, aviso: avisoFechas(ctx.cuenta) };
  }

  RH.excelFilas = { esExcel, esExcelViejo, hojas, encabezados, leer, muestra, serialAFecha };
})(window.RH = window.RH || {});
