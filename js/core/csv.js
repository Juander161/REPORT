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
    if (esExcel(file)) return (await RH.excelFilas.encabezados(file, opts)).map(c => String(c).trim().toUpperCase());
    const txt = await file.slice(0, 300000).text();
    const primera = txt.split(/\r?\n/)[0].replace(/^\uFEFF/, '');
    return splitLinea(primera, detectarDelim(primera)).map(c => c.trim().toUpperCase());
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
        hoja: h.hoja, columnasFecha: h.columnasFecha,
        alFila(r) {
          if (!header) { header = r.map(c => String(c).replace(/^\uFEFF/, '').trim().toUpperCase()); if (h.alEncabezado) h.alEncabezado(header); return; }
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
    const emitir = r => {
      if (r.length === 1 && r[0] === '') return;
      if (!header) { header = r.map(c => c.replace(/^\uFEFF/, '').trim().toUpperCase()); if (h.alEncabezado) h.alEncabezado(header); return; }
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

  RH.csv = { splitLinea, detectarDelim, parseFecha, num, semana, encabezados, leer, DIA };
})(window.RH = window.RH || {});
