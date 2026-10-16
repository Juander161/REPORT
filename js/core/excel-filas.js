/* Report Hub · lector de Excel (.xlsx / .xlsm) fila por fila, por streaming.
   Entrega cada fila como un arreglo de textos, igual que una línea de CSV, para
   que los reportes apliquen EXACTAMENTE la misma lógica que con un CSV:
   - celdas de texto, números y fórmulas → su texto/valor;
   - en las columnas de fecha indicadas, los números de serie de Excel se
     convierten a 'AAAA-MM-DD' (lo que parseFecha entiende sin importar el
     formato Mes/Día o Día/Mes);
   - las celdas vacías se entregan como "".
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
  function decodificar(s) {
    if (s.indexOf('&') >= 0) {
      s = s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
        if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
        return ENT[e];
      });
    }
    // Excel guarda los caracteres de control como _xHHHH_
    if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    return s;
  }

  const RE_T = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t(?:\s[^>]*)?\/>/g;
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

  function colIdx(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  function serialAFecha(v, en1904) {
    const n = parseFloat(v);
    if (!isFinite(n) || n <= 0) return v;
    const dias = Math.floor(n);
    const ms = en1904 ? (dias - 24107) * DIA : (dias < 61 ? (dias - 25568) * DIA : (dias - 25569) * DIA);
    const d = new Date(ms);
    if (isNaN(d)) return v;
    // la hora solo se agrega para mostrarla en los listados; parseFecha usa la fecha
    const min = Math.round((n - dias) * 1440);
    const hora = min > 0 && min < 1440 ? ' ' + String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0') : '';
    return d.toISOString().slice(0, 10) + hora;
  }

  // ---------------------------------------------------------------- ZIP por partes
  async function bytes(file, ini, fin) {
    return new Uint8Array(await file.slice(ini, fin).arrayBuffer());
  }

  async function abrirZip(file) {
    const largoCola = Math.min(file.size, 65536 + 22 + 20);
    const cola = await bytes(file, file.size - largoCola, file.size);
    const dv = new DataView(cola.buffer);
    let eocd = -1;
    for (let i = cola.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
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
   * cargarlo completo. cb(xmlDelElemento) por cada uno, en orden.
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
      let pos = 0;
      for (;;) {
        abre.lastIndex = pos;
        const a = abre.exec(buf);
        if (!a) { pos = Math.max(pos, buf.length - 64); break; }
        const finTag = buf.indexOf('>', a.index);
        if (finTag < 0) { pos = a.index; break; }
        if (buf[finTag - 1] === '/') { cb(buf.slice(a.index, finTag + 1)); pos = finTag + 1; continue; }
        cierra.lastIndex = finTag;
        const c = cierra.exec(buf);
        if (!c) { pos = a.index; break; }
        cb(buf.slice(a.index, c.index + c[0].length));
        pos = c.index + c[0].length;
      }
      buf = buf.slice(pos);
    }
  }

  // ---------------------------------------------------------------- libro
  async function libro(file) {
    if (esExcelViejo(file)) throw new Error('Los archivos .xls / .xlsb no se pueden leer aquí. En Excel usa «Guardar como» → «Libro de Excel (.xlsx)» o «CSV UTF-8».');
    const ent = await abrirZip(file);
    const buscar = n => ent.get(n.toLowerCase());
    const wbE = buscar('xl/workbook.xml');
    if (!wbE) throw new Error('El archivo no parece un libro de Excel (.xlsx).');
    const parser = new DOMParser();
    const wb = parser.parseFromString(await textoCompleto(file, wbE), 'application/xml');
    const relE = buscar('xl/_rels/workbook.xml.rels');
    const rels = {};
    if (relE) {
      const rd = parser.parseFromString(await textoCompleto(file, relE), 'application/xml');
      Array.from(rd.getElementsByTagNameNS('*', 'Relationship')).forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    }
    const pr = wb.getElementsByTagNameNS('*', 'workbookPr')[0];
    const d1904 = pr ? /^(1|true)$/i.test(pr.getAttribute('date1904') || '') : false;
    const hojas = Array.from(wb.getElementsByTagNameNS('*', 'sheet')).map(sh => {
      const rid = sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id');
      let destino = rels[rid] || '';
      let ruta = destino.startsWith('/') ? destino.slice(1) : 'xl/' + destino;
      ruta = ruta.replace(/[^/]+\/\.\.\//g, '');
      return { nombre: sh.getAttribute('name'), oculta: (sh.getAttribute('state') || 'visible') !== 'visible', ruta, entrada: buscar(ruta) };
    }).filter(h => h.entrada);
    if (!hojas.length) throw new Error('El libro de Excel no tiene hojas de cálculo legibles.');
    return { ent, buscar, hojas, d1904 };
  }

  async function cadenasCompartidas(file, lib, contador) {
    const e = lib.buscar('xl/sharedStrings.xml');
    const ss = [];
    if (!e) return ss;
    await porElementos(await streamTexto(file, e, contador), 'si', xml => ss.push(textoRico(xml)));
    return ss;
  }

  function elegirHoja(lib, nombre) {
    if (nombre) { const h = lib.hojas.find(x => x.nombre === nombre); if (h) return h; }
    return lib.hojas.find(h => !h.oculta) || lib.hojas[0];
  }

  const RE_C = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  const RE_V = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/;
  const RE_IS = /<(?:\w+:)?is(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?is>/;
  const attr = (s, n) => { const m = new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(s); return m ? m[1] : null; };

  /** Convierte el XML de una <row> en arreglo de textos (null si la fila está vacía) */
  function filaDesdeXml(xml, ss, fechas, d1904) {
    const fila = [];
    let siguiente = 0, alguno = false;
    RE_C.lastIndex = 0;
    let m;
    while ((m = RE_C.exec(xml))) {
      const at = m[1] || '', cuerpo = m[2] || '';
      const r = attr(at, 'r');
      const ci = r ? colIdx(r) : siguiente;
      siguiente = ci + 1;
      const t = attr(at, 't');
      let val = '';
      if (t === 'inlineStr') {
        const is = RE_IS.exec(cuerpo);
        val = is ? textoRico(is[1]) : '';
      } else {
        const v = RE_V.exec(cuerpo);
        const crudo = v ? decodificar(v[1]) : '';
        if (t === 's') val = crudo === '' ? '' : (ss[parseInt(crudo, 10)] ?? '');
        else if (t === 'b') val = crudo === '1' ? 'TRUE' : crudo === '0' ? 'FALSE' : crudo;
        else if (t === 'str' || t === 'e' || t === 'd') val = crudo;
        else val = (crudo !== '' && fechas && fechas.has(ci)) ? serialAFecha(crudo, d1904) : crudo;
      }
      while (fila.length < ci) fila.push('');
      fila[ci] = val;
      if (val !== '') alguno = true;
    }
    return alguno ? fila : null;
  }

  // ---------------------------------------------------------------- API
  /** Hojas del libro: [{nombre, oculta}] */
  async function hojas(file) {
    const lib = await libro(file);
    return lib.hojas.map(h => ({ nombre: h.nombre, oculta: h.oculta }));
  }

  /** Primera fila con datos (el encabezado), como textos sin normalizar */
  async function encabezados(file, opts) {
    opts = opts || {};
    const lib = await libro(file);
    const ss = await cadenasCompartidas(file, lib);
    const hoja = elegirHoja(lib, opts.hoja);
    let enc = null;
    const reader = (await streamTexto(file, hoja.entrada)).getReader();
    // basta con leer hasta encontrar la primera fila con contenido
    const parar = {};
    try {
      await porElementos(new ReadableStream({
        async pull(c) { const { done, value } = await reader.read(); if (done) c.close(); else c.enqueue(value); }
      }), 'row', xml => {
        if (enc) return;
        const f = filaDesdeXml(xml, ss, null, lib.d1904);
        if (f) { enc = f; throw parar; }
      });
    } catch (e) { if (e !== parar) throw e; }
    try { reader.cancel(); } catch (e) { /* nada */ }
    return enc || [];
  }

  /**
   * Lee todas las filas. opts:
   *  hoja: nombre (por defecto la primera visible)
   *  columnasFecha: nombres de columnas de fecha (se comparan en mayúsculas y sin espacios)
   *  alFila(arreglo): se llama con el encabezado y luego con cada fila
   *  alProgreso(bytesLeidos, tamañoArchivo, etapa)
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
    const hoja = elegirHoja(lib, opts.hoja);
    const nombresFecha = new Set((opts.columnasFecha || []).map(n => String(n).trim().toUpperCase()));
    let fechas = null;
    etapa = 'filas';
    await porElementos(await streamTexto(file, hoja.entrada, cuenta), 'row', xml => {
      const fila = filaDesdeXml(xml, ss, fechas, lib.d1904);
      if (!fila) return;
      if (!fechas) {
        fechas = new Set();
        fila.forEach((c, i) => { if (nombresFecha.has(String(c).replace(/^\uFEFF/, '').trim().toUpperCase())) fechas.add(i); });
      }
      opts.alFila(fila);
    });
    if (opts.alProgreso) opts.alProgreso(file.size, file.size, 'listo');
    return { hoja: hoja.nombre };
  }

  RH.excelFilas = { esExcel, esExcelViejo, hojas, encabezados, leer, serialAFecha };
})(window.RH = window.RH || {});
