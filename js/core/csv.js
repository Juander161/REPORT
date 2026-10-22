/* Report Hub · lector de CSV por streaming para reportes nuevos.
   Es la misma lógica de lectura de los reportes originales (comillas, ; o ,
   fechas M/D/A o D/M/A y semanas como la fórmula de Excel), empaquetada para
   reutilizarla en reportes nuevos sin copiar código. */
(function (RH) {
  'use strict';
  const DIA = 86400000;

  function splitLinea(linea, delim) {
    const out = []; let f = '', q = false;
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i];
      if (q) {
        if (ch === '"') { if (linea[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { out.push(f); f = ''; }
      else f += ch;
    }
    out.push(f);
    return out;
  }

  function detectarDelim(linea) {
    const c = (linea.match(/,/g) || []).length;
    const p = (linea.match(/;/g) || []).length;
    return p > c ? ';' : ',';
  }

  function parseFecha(v, fmt) {
    v = (v || '').trim();
    if (!v) return null;
    let y, mo, d, m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (!m) return null;
      const a = +m[1], b = +m[2];
      y = +m[3]; if (y < 100) y += 2000;
      if (fmt === 'MDY') { mo = a; d = b; } else { d = a; mo = b; }
    }
    return Date.UTC(y, mo - 1, d);
  }

  function num(v) {
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  /** Semana (1, 2, ...) o 'N/A' si la fecha no es válida o es anterior al inicio */
  function semana(valorFecha, inicioMs, fmt) {
    const t = parseFecha(valorFecha, fmt);
    if (t === null) return { semana: 'N/A', motivo: 'sin-fecha' };
    const dias = Math.floor((t - inicioMs) / DIA);
    if (dias < 0) return { semana: 'N/A', motivo: 'antes' };
    return { semana: Math.floor(dias / 7) + 1, motivo: null };
  }

  const esExcel = f => !!(RH.excelFilas && /\.(xlsx|xlsm|xltx|xltm|xls|xlsb)$/i.test((f && f.name) || ''));

  /** Lee solo los encabezados (en mayúsculas). Acepta CSV o Excel (.xlsx) */
  async function encabezados(file, opts) {
    opts = opts || {};
    if (esExcel(file)) return (await RH.excelFilas.encabezados(file, opts)).map(c => String(c).replace(/\s+/g, " ").trim().toUpperCase());
    const filas = await muestra(file, { max: (opts.filaEncabezado || 0) + 1 });
    const f = filas[opts.filaEncabezado || 0] || [];
    return f.map(c => String(c).replace(/^\uFEFF/, '').replace(/\s+/g, " ").trim().toUpperCase());
  }

  /** Índice (entre las filas con contenido) de la fila de encabezado: la primera con muchos textos no numéricos */
  function detectarEncabezado(filas) {
    const txt = f => f.filter(c => { const t = String(c).trim(); return t !== '' && !isFinite(Number(t.replace(/,/g, ''))); }).length;
    const sample = filas.slice(0, 40), cuentas = sample.map(txt);
    const max = Math.max(0, ...cuentas);
    const i = cuentas.findIndex(c => c >= Math.max(2, Math.ceil(max * 0.6)));
    return i < 0 ? 0 : i;
  }
  /** ¿El nombre de la columna parece una cantidad? (QTY, QUANTITY, CANT, UNITS…) */
  const esProductoConocido = nombre => /^(GOWN|TASSEL|CAP|STOLE|HOOD|CORD|MASCOT[ _-]?MEDAL)S?( ASSEMBLY| QTY)?$/i.test(String(nombre).trim());
  const esCantidad = nombre => /(^|[^A-Z])(QTY|QUANTITY|CANT|CANTIDAD|UNITS|UNIDADES|PCS|PIEZAS)([^A-Z]|$)|QTY$/i.test(String(nombre)) || esProductoConocido(nombre);   // productos conocidos: GOWNS, Tassel Assembly…

  /** Primeras filas con contenido (CSV o Excel), como textos, para detectar encabezado y columnas */
  async function muestra(file, opts) {
    opts = opts || {};
    const max = opts.max || 120;
    if (esExcel(file)) return RH.excelFilas.muestra(file, { hoja: opts.hoja, max });
    const txt = (await file.slice(0, 600000).text()).replace(/^\uFEFF/, '');
    const delim = detectarDelim(txt.split('\n')[0]);
    const out = [];
    let field = '', row = [], inQ = false, pend = false;
    const fin = () => { row.push(field); field = ''; if (!(row.length === 1 && row[0] === '')) out.push(row); row = []; };
    for (let i = 0; i < txt.length && out.length < max; i++) {
      const ch = txt[i];
      if (pend) { pend = false; if (ch === '"') { field += '"'; continue; } inQ = false; }
      if (inQ) { if (ch === '"') pend = true; else field += ch; continue; }
      if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n') fin();
      else if (ch !== '\r') field += ch;
    }
    if (out.length < max && (field !== '' || row.length)) fin();
    return out;
  }

  /**
   * Recorre el CSV (o el Excel .xlsx) fila por fila sin cargarlo completo en memoria.
   * h.alEncabezado(header[])  · h.alFila(row[], numeroDeFila)  · h.alProgreso(leidos, total, filas)
   * h.hoja (Excel, opcional) · h.columnasFecha (Excel: columnas cuyos números de serie son fechas)
   */
  async function leer(file, h) {
    if (esExcel(file)) {
      let header = null, filas = 0;
      await RH.excelFilas.leer(file, {
        hoja: h.hoja, columnasFecha: h.columnasFecha, filaEncabezado: h.filaEncabezado || 0,
        alFila(r) {
          if (!header) { header = r.map(c => String(c).replace(/^\uFEFF/, '').replace(/\s+/g, " ").trim().toUpperCase()); if (h.alEncabezado) h.alEncabezado(header); return; }
          filas++;
          h.alFila(r, filas);
        },
        alProgreso(leidos, total) { if (h.alProgreso) h.alProgreso(leidos, total, filas); }
      });
      return { filas, header };
    }
    const reader = file.stream().getReader();
    const dec = new TextDecoder('utf-8');
    let delim = null, field = '', row = [], inQ = false, pend = false, leidos = 0, filas = 0, header = null;
    let saltar = h.filaEncabezado || 0;     // filas con contenido anteriores al encabezado (títulos del reporte)
    const emitir = r => {
      if (r.length === 1 && r[0] === '') return;
      if (!header && saltar > 0) { saltar--; return; }
      if (!header) { header = r.map(c => c.replace(/^\uFEFF/, '').replace(/\s+/g, " ").trim().toUpperCase()); if (h.alEncabezado) h.alEncabezado(header); return; }
      filas++;
      h.alFila(r, filas);
    };
    while (true) {
      const { done, value } = await reader.read();
      const s = done ? '' : dec.decode(value, { stream: true });
      if (!done) leidos += value.length;
      if (delim === null && s) delim = detectarDelim(s.split('\n')[0]);
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (pend) { pend = false; if (ch === '"') { field += '"'; continue; } inQ = false; }
        if (inQ) { if (ch === '"') pend = true; else field += ch; continue; }
        if (ch === '"') inQ = true;
        else if (ch === delim) { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); field = ''; emitir(row); row = []; }
        else if (ch !== '\r') field += ch;
      }
      if (h.alProgreso) h.alProgreso(leidos, file.size, filas);
      if (done) break;
    }
    if (field !== '' || row.length) { row.push(field); emitir(row); }
    return { filas, header };
  }

  RH.csv = { splitLinea, detectarDelim, parseFecha, num, semana, encabezados, muestra, detectarEncabezado, esCantidad, esProductoConocido, leer, DIA };
})(window.RH = window.RH || {});
