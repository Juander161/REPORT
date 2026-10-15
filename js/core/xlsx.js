/* Report Hub · lectura y escritura de libros de Excel (.xlsx) sin dependencias.
   La escritura incluye estilos, fórmulas vivas y GRÁFICAS NATIVAS de Excel
   (editables), de modo que lo exportado se puede seguir trabajando en Excel. */
(function (RH) {
  'use strict';

  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function x(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  }

  function col(i) { // 0 -> A
    let s = ''; i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function ref(c, r) { return col(c) + (r + 1); }

  // ---------------------------------------------------------------- estilos
  const ESTILOS = {
    normal: 0, header: 1, int: 2, pct: 3, totInt: 4, titulo: 5, texto: 6, nota: 7, dInt: 8, dPct: 9,
    totPct: 10, kpi: 11, sub: 12, totTexto: 13, totDInt: 14, totDPct: 15, kpiPct: 16, dec: 17, pp: 18,
    totPp: 19, kpiDelta: 20, kpiDeltaInt: 21, totDec: 22, headerL: 23, kpiDec: 24, kpiLabel: 25, seccion: 26
  };

  const STYLES_XML = XML +
    '<styleSheet xmlns="' + NS_MAIN + '">' +
    '<numFmts count="6">' +
    '<numFmt numFmtId="164" formatCode="#,##0"/>' +
    '<numFmt numFmtId="165" formatCode="0.0%"/>' +
    '<numFmt numFmtId="166" formatCode="+#,##0;-#,##0;0"/>' +
    '<numFmt numFmtId="167" formatCode="+0.0%;-0.0%;0.0%"/>' +
    '<numFmt numFmtId="168" formatCode="#,##0.0"/>' +
    '<numFmt numFmtId="169" formatCode="+0.0&quot; pp&quot;;-0.0&quot; pp&quot;;0.0&quot; pp&quot;"/>' +
    '</numFmts>' +
    '<fonts count="9">' +
    '<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>' +            // 0
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +       // 1
    '<font><b/><sz val="11"/><color rgb="FF0F2A4A"/><name val="Calibri"/><family val="2"/></font>' +       // 2
    '<font><b/><sz val="16"/><color rgb="FF0F2A4A"/><name val="Calibri"/><family val="2"/></font>' +       // 3
    '<font><i/><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>' +        // 4
    '<font><sz val="10"/><color rgb="FF4B5563"/><name val="Calibri"/><family val="2"/></font>' +           // 5
    '<font><b/><sz val="18"/><color rgb="FF0F2A4A"/><name val="Calibri"/><family val="2"/></font>' +       // 6
    '<font><b/><sz val="11"/><color rgb="FF1F6FD1"/><name val="Calibri"/><family val="2"/></font>' +       // 7
    '<font><b/><sz val="12"/><color rgb="FF0F2A4A"/><name val="Calibri"/><family val="2"/></font>' +       // 8
    '</fonts>' +
    '<fills count="5">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0F2A4A"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F7"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF6F8FB"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="4">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>' +
    '<border><left/><right/><top style="thin"><color rgb="FF94A3B8"/></top><bottom style="thin"><color rgb="FF94A3B8"/></bottom><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="medium"><color rgb="FFC9A227"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="27">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                                             // 0 normal
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 1 header
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                       // 2 int
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                       // 3 pct
    '<xf numFmtId="164" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 4 totInt
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                // 5 titulo
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +                                               // 6 texto
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                // 7 nota
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                       // 8 dInt
    '<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                       // 9 dPct
    '<xf numFmtId="165" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 10 totPct
    '<xf numFmtId="164" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // 11 kpi
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                // 12 sub
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +                   // 13 totTexto
    '<xf numFmtId="166" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 14 totDInt
    '<xf numFmtId="167" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 15 totDPct
    '<xf numFmtId="165" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // 16 kpiPct
    '<xf numFmtId="168" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                       // 17 dec
    '<xf numFmtId="169" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                       // 18 pp
    '<xf numFmtId="169" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 19 totPp
    '<xf numFmtId="167" fontId="7" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // 20 kpiDelta
    '<xf numFmtId="166" fontId="7" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // 21 kpiDeltaInt
    '<xf numFmtId="168" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 22 totDec
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' + // 23 headerL
    '<xf numFmtId="168" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // 24 kpiDec
    '<xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +                                 // 25 kpiLabel
    '<xf numFmtId="0" fontId="8" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1"/>' +                                // 26 seccion
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
    '</styleSheet>';

  // ---------------------------------------------------------------- hoja
  function nuevaHoja(nombre, opts) {
    const h = {
      nombre: limpiarNombre(nombre),
      filas: [],          // [{celdas:[...], alto}]
      anchos: [],
      combinadas: [],
      escalas: [],
      graficas: [],
      congeladas: null,
      grid: opts && opts.grid === false ? false : true,
      tab: opts && opts.tab,

      /** Agrega una fila; devuelve su índice (base 0) */
      fila(celdas, o) {
        o = o || {};
        const fila = { celdas: (celdas || []).map((c, i) => normalizar(c, o.estilos ? o.estilos[i] : o.estilo)), alto: o.alto };
        h.filas.push(fila);
        return h.filas.length - 1;
      },
      vacia(n) { for (let i = 0; i < (n || 1); i++) h.filas.push({ celdas: [] }); return h.filas.length - 1; },
      celda(r, c, valor, estilo) {
        while (h.filas.length <= r) h.filas.push({ celdas: [] });
        h.filas[r].celdas[c] = normalizar(valor, estilo);
      },
      ancho(lista) { h.anchos = lista; return h; },
      combinar(r1, c1, r2, c2) { h.combinadas.push(ref(c1, r1) + ':' + ref(c2, r2)); return h; },
      congelar(filas, cols) { h.congeladas = { filas: filas || 0, cols: cols || 0 }; return h; },
      /** Escala de color (formato condicional) sobre un rango; colores 'RRGGBB' */
      escala(r1, c1, r2, c2, min, max, medio) { h.escalas.push({ ref: ref(c1, r1) + ':' + ref(c2, r2), min, max, medio }); return h; },
      /** g: { tipo:'col'|'bar'|'line'|'colStacked'|'colDiverging', titulo, categorias[], cat:{c,r1,r2},
              series:[{nombre, nombreRef:{c,r}, c, r1, r2, color:'RRGGBB', valores[]}],
              formatoEje, formatoCache, ancla:{c,r,w,h} } */
      grafica(g) { h.graficas.push(g); return h; },
      get siguiente() { return h.filas.length; }
    };
    return h;
  }

  function limpiarNombre(n) {
    return String(n).replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 31).trim() || 'Hoja';
  }

  function normalizar(c, estiloFila) {
    if (c == null || c === '') return null;
    if (typeof c === 'object' && !(c instanceof Date)) {
      return { v: c.v, f: c.f, s: c.s || estiloFila };
    }
    return { v: c, s: estiloFila };
  }

  function estiloDe(cel) {
    if (cel.s != null) return typeof cel.s === 'number' ? cel.s : (ESTILOS[cel.s] != null ? ESTILOS[cel.s] : 0);
    return typeof cel.v === 'number' ? ESTILOS.int : ESTILOS.normal;
  }

  function hojaXml(h, si, primera, drawing) {
    let maxC = 0;
    h.filas.forEach(f => { maxC = Math.max(maxC, f.celdas.length); });
    const dim = h.filas.length ? 'A1:' + ref(Math.max(0, maxC - 1), h.filas.length - 1) : 'A1';

    let vista = '<sheetView workbookViewId="0"' + (primera ? ' tabSelected="1"' : '') + (h.grid ? '' : ' showGridLines="0"') + ' zoomScaleNormal="100">';
    if (h.congeladas && (h.congeladas.filas || h.congeladas.cols)) {
      const { filas, cols } = h.congeladas;
      const tl = ref(cols, filas);
      const panel = filas && cols ? 'bottomRight' : filas ? 'bottomLeft' : 'topRight';
      vista += '<pane' + (cols ? ' xSplit="' + cols + '"' : '') + (filas ? ' ySplit="' + filas + '"' : '') +
        ' topLeftCell="' + tl + '" activePane="' + panel + '" state="frozen"/>' +
        '<selection pane="' + panel + '" activeCell="' + tl + '" sqref="' + tl + '"/>';
    }
    vista += '</sheetView>';

    let s = XML + '<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '">';
    if (h.tab) s += '<sheetPr><tabColor rgb="FF' + h.tab + '"/></sheetPr>';
    s += '<dimension ref="' + dim + '"/><sheetViews>' + vista + '</sheetViews>';
    s += '<sheetFormatPr defaultRowHeight="15"/>';
    if (h.anchos.length) {
      s += '<cols>' + h.anchos.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
    }
    s += '<sheetData>';
    h.filas.forEach((f, r) => {
      const celdas = [];
      f.celdas.forEach((cel, c) => {
        if (!cel) return;
        const st = estiloDe(cel);
        const rr = ref(c, r);
        const v = cel.v;
        if (cel.f) {
          const esTexto = typeof v === 'string';
          celdas.push('<c r="' + rr + '" s="' + st + '"' + (esTexto ? ' t="str"' : '') + '><f>' + x(cel.f) + '</f>' +
            (v == null || (typeof v === 'number' && !isFinite(v)) ? '' : '<v>' + x(v) + '</v>') + '</c>');
        } else if (typeof v === 'number') {
          if (!isFinite(v)) return;
          celdas.push('<c r="' + rr + '" s="' + st + '"><v>' + v + '</v></c>');
        } else if (typeof v === 'boolean') {
          celdas.push('<c r="' + rr + '" s="' + st + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>');
        } else if (v == null || v === '') {
          celdas.push('<c r="' + rr + '" s="' + st + '"/>');
        } else {
          celdas.push('<c r="' + rr + '" s="' + st + '" t="s"><v>' + si(String(v)) + '</v></c>');
        }
      });
      if (!celdas.length && !f.alto) return;
      s += '<row r="' + (r + 1) + '"' + (f.alto ? ' ht="' + f.alto + '" customHeight="1"' : '') + '>' + celdas.join('') + '</row>';
    });
    s += '</sheetData>';
    if (h.combinadas.length) s += '<mergeCells count="' + h.combinadas.length + '">' + h.combinadas.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';
    h.escalas.forEach((e, i) => {
      const cfvo = e.medio ? '<cfvo type="min"/><cfvo type="num" val="0"/><cfvo type="max"/>' : '<cfvo type="min"/><cfvo type="max"/>';
      const colores = (e.medio ? [e.min, e.medio, e.max] : [e.min, e.max]).map(c => '<color rgb="FF' + c + '"/>').join('');
      s += '<conditionalFormatting sqref="' + e.ref + '"><cfRule type="colorScale" priority="' + (i + 1) + '"><colorScale>' + cfvo + colores + '</colorScale></cfRule></conditionalFormatting>';
    });
    s += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
    s += '<pageSetup orientation="landscape"/>';
    s += drawing || '';
    s += '</worksheet>';
    return s;
  }

  // ---------------------------------------------------------------- gráficas nativas
  function graficaXml(g, hoja) {
    const q = "'" + hoja.replace(/'/g, "''") + "'";
    const abs = (c, r) => '$' + col(c) + '$' + (r + 1);
    const rango = (c, r1, r2) => q + '!' + abs(c, r1) + ':' + abs(c, r2);
    const celda = (c, r) => q + '!' + abs(c, r);
    const strCache = arr => '<c:strCache><c:ptCount val="' + arr.length + '"/>' +
      arr.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + x(v) + '</c:v></c:pt>').join('') + '</c:strCache>';
    const numCache = arr => '<c:numCache><c:formatCode>' + x(g.formatoCache || 'General') + '</c:formatCode><c:ptCount val="' + arr.length + '"/>' +
      arr.map((v, i) => (v == null || !isFinite(v)) ? '' : '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>').join('') + '</c:numCache>';
    const txPr = (sz, color) => '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + sz + '"><a:solidFill><a:srgbClr val="' + (color || '595959') + '"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>';

    const linea = g.tipo === 'line';
    const horizontal = g.tipo === 'bar';
    const series = g.series.map((s, i) => {
      const tx = '<c:tx><c:strRef><c:f>' + x(celda(s.nombreRef.c, s.nombreRef.r)) + '</c:f>' + strCache([s.nombre]) + '</c:strRef></c:tx>';
      const sp = linea
        ? '<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="' + s.color + '"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>'
        : '<c:spPr><a:solidFill><a:srgbClr val="' + s.color + '"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>';
      const cat = '<c:cat><c:strRef><c:f>' + x(rango(g.cat.c, g.cat.r1, g.cat.r2)) + '</c:f>' + strCache(g.categorias) + '</c:strRef></c:cat>';
      const val = '<c:val><c:numRef><c:f>' + x(rango(s.c, s.r1, s.r2)) + '</c:f>' + numCache(s.valores) + '</c:numRef></c:val>';
      return '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/>' + tx + sp + cat + val + (linea ? '<c:smooth val="0"/>' : '') + '</c:ser>';
    }).join('');

    const ejes = '<c:axId val="510000001"/><c:axId val="510000002"/>';
    let plot;
    if (linea) {
      plot = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + series + '<c:marker val="1"/>' + ejes + '</c:lineChart>';
    } else {
      const apilada = g.tipo === 'colStacked';
      const solapada = apilada || g.tipo === 'colDiverging';
      plot = '<c:barChart><c:barDir val="' + (horizontal ? 'bar' : 'col') + '"/><c:grouping val="' + (apilada ? 'stacked' : 'clustered') + '"/><c:varyColors val="0"/>' +
        series + '<c:gapWidth val="' + (g.gap || 60) + '"/><c:overlap val="' + (solapada ? 100 : -5) + '"/>' + ejes + '</c:barChart>';
    }

    const catAx = '<c:catAx><c:axId val="510000001"/><c:scaling><c:orientation val="' + (horizontal ? 'maxMin' : 'minMax') + '"/></c:scaling><c:delete val="0"/>' +
      '<c:axPos val="' + (horizontal ? 'l' : 'b') + '"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/>' +
      '<c:tickLblPos val="low"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="BFC5CE"/></a:solidFill></a:ln></c:spPr>' + txPr(900) +
      '<c:crossAx val="510000002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>';
    const valAx = '<c:valAx><c:axId val="510000002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>' +
      '<c:axPos val="' + (horizontal ? 'b' : 'l') + '"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
      '<c:numFmt formatCode="' + x(g.formatoEje || '#,##0') + '" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
      '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' + txPr(900) +
      '<c:crossAx val="510000001"/><c:crosses val="' + (horizontal ? 'max' : 'autoZero') + '"/><c:crossBetween val="between"/></c:valAx>';

    const titulo = '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"><a:solidFill><a:srgbClr val="0F2A4A"/></a:solidFill></a:defRPr></a:pPr>' +
      '<a:r><a:rPr lang="es-MX" sz="1300" b="1"><a:solidFill><a:srgbClr val="0F2A4A"/></a:solidFill></a:rPr><a:t>' + x(g.titulo) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>';
    const leyenda = g.series.length > 1 ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/>' + txPr(900, '404040') + '</c:legend>' : '';

    return XML +
      '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '">' +
      '<c:date1904 val="0"/><c:lang val="es-MX"/><c:roundedCorners val="0"/>' +
      '<c:chart>' + titulo + '<c:plotArea><c:layout/>' + plot + catAx + valAx + '</c:plotArea>' + leyenda +
      '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
      '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr>' +
      '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>' +
      '</c:chartSpace>';
  }

  function anclaXml(a, id, rid, nombre) {
    return '<xdr:twoCellAnchor editAs="oneCell">' +
      '<xdr:from><xdr:col>' + a.c + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + a.r + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:to><xdr:col>' + (a.c + a.w) + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + (a.r + a.h) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + id + '" name="' + x(nombre || ('Gráfico ' + id)) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
      '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
      '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="' + NS_R + '" r:id="' + rid + '"/>' +
      '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
  }

  function relsXml(lista) {
    return XML + '<Relationships xmlns="' + NS_PKG_R + '">' + lista.join('') + '</Relationships>';
  }
  function rel(id, tipo, destino) {
    return '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + tipo + '" Target="' + destino + '"/>';
  }

  // ---------------------------------------------------------------- libro
  function libro(opts) {
    opts = opts || {};
    const hojas = [];
    return {
      hoja(nombre, o) {
        let base = limpiarNombre(nombre), n = base, k = 2;
        while (hojas.some(h => h.nombre.toLowerCase() === n.toLowerCase())) n = base.slice(0, 28) + ' ' + (k++);
        const h = nuevaHoja(n, o);
        hojas.push(h);
        return h;
      },
      get hojas() { return hojas; },
      async blob() {
        if (!hojas.length) this.hoja('Hoja1');
        const archivos = [];
        const sst = new Map(), lista = [];
        const si = s => { if (!sst.has(s)) { sst.set(s, lista.length); lista.push(s); } return sst.get(s); };
        const overrides = [];
        let nGraf = 0, nDib = 0;

        hojas.forEach((h, i) => {
          const n = i + 1;
          let dibujo = '';
          if (h.graficas.length) {
            nDib++;
            const anclas = [], drels = [];
            h.graficas.forEach((g, k) => {
              nGraf++;
              archivos.push({ name: 'xl/charts/chart' + nGraf + '.xml', data: graficaXml(g, h.nombre) });
              overrides.push('<Override PartName="/xl/charts/chart' + nGraf + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>');
              drels.push(rel('rId' + (k + 1), 'chart', '../charts/chart' + nGraf + '.xml'));
              anclas.push(anclaXml(g.ancla, k + 2, 'rId' + (k + 1), g.titulo));
            });
            archivos.push({
              name: 'xl/drawings/drawing' + nDib + '.xml',
              data: XML + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + anclas.join('') + '</xdr:wsDr>'
            });
            archivos.push({ name: 'xl/drawings/_rels/drawing' + nDib + '.xml.rels', data: relsXml(drels) });
            overrides.push('<Override PartName="/xl/drawings/drawing' + nDib + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');
            archivos.push({ name: 'xl/worksheets/_rels/sheet' + n + '.xml.rels', data: relsXml([rel('rId1', 'drawing', '../drawings/drawing' + nDib + '.xml')]) });
            dibujo = '<drawing r:id="rId1"/>';
          }
          archivos.push({ name: 'xl/worksheets/sheet' + n + '.xml', data: hojaXml(h, si, i === 0, dibujo) });
          overrides.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
        });

        const wb = XML + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '">' +
          '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="0"/></bookViews><sheets>' +
          hojas.map((h, i) => '<sheet name="' + x(h.nombre) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
          '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
        const wbRels = relsXml([
          ...hojas.map((h, i) => rel('rId' + (i + 1), 'worksheet', 'worksheets/sheet' + (i + 1) + '.xml')),
          rel('rId' + (hojas.length + 1), 'styles', 'styles.xml'),
          rel('rId' + (hojas.length + 2), 'sharedStrings', 'sharedStrings.xml')
        ]);
        const sstXml = XML + '<sst xmlns="' + NS_MAIN + '" count="' + lista.length + '" uniqueCount="' + lista.length + '">' +
          lista.map(s => '<si><t xml:space="preserve">' + x(s) + '</t></si>').join('') + '</sst>';
        const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const core = XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
          '<dc:title>' + x(opts.titulo || 'Report Hub') + '</dc:title><dc:creator>Report Hub</dc:creator>' +
          '<dcterms:created xsi:type="dcterms:W3CDTF">' + ahora + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + ahora + '</dcterms:modified></cp:coreProperties>';
        const app = XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Report Hub</Application></Properties>';
        const tipos = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
          '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
          overrides.join('') + '</Types>';
        const raiz = relsXml([
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
          '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        ]);

        const todos = [
          { name: '[Content_Types].xml', data: tipos },
          { name: '_rels/.rels', data: raiz },
          { name: 'docProps/core.xml', data: core },
          { name: 'docProps/app.xml', data: app },
          { name: 'xl/workbook.xml', data: wb },
          { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
          { name: 'xl/styles.xml', data: STYLES_XML },
          { name: 'xl/sharedStrings.xml', data: sstXml },
          ...archivos
        ];
        return RH.zip.crear(todos, MIME);
      }
    };
  }

  // ---------------------------------------------------------------- lectura
  function parsear(txt) {
    const doc = new DOMParser().parseFromString(txt, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido dentro del archivo de Excel.');
    return doc;
  }
  const porTag = (n, tag) => Array.from(n.getElementsByTagNameNS('*', tag));
  const hijo = (n, tag) => { for (const c of n.children) if (c.localName === tag) return c; return null; };

  function textoSi(si) {
    // concatena <t> directos o dentro de <r>, ignorando la fonética <rPh>
    let s = '';
    for (const c of si.children) {
      if (c.localName === 't') s += c.textContent;
      else if (c.localName === 'r') { const t = hijo(c, 't'); if (t) s += t.textContent; }
    }
    return s;
  }

  function colIdx(letras) {
    let n = 0;
    for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  }

  async function leer(buffer) {
    const z = RH.zip.abrir(buffer);
    const wbTxt = await z.texto('xl/workbook.xml');
    if (!wbTxt) throw new Error('El archivo no parece un libro de Excel (.xlsx).');
    const wb = parsear(wbTxt);
    const relTxt = await z.texto('xl/_rels/workbook.xml.rels');
    const rels = {};
    if (relTxt) porTag(parsear(relTxt), 'Relationship').forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });

    const ss = [];
    const ssTxt = await z.texto('xl/sharedStrings.xml');
    if (ssTxt) porTag(parsear(ssTxt), 'si').forEach(si => ss.push(textoSi(si)));

    const hojas = {}, nombres = [];
    for (const sh of porTag(wb, 'sheet')) {
      const nombre = sh.getAttribute('name');
      const rid = sh.getAttributeNS(NS_R, 'id') || sh.getAttribute('r:id');
      let destino = rels[rid];
      if (!destino) continue;
      let ruta = destino.startsWith('/') ? destino.slice(1) : 'xl/' + destino;
      ruta = ruta.replace(/[^/]+\/\.\.\//g, '');
      const txt = await z.texto(ruta);
      if (!txt) continue;
      hojas[nombre] = leerHoja(parsear(txt), ss);
      nombres.push(nombre);
    }
    return { nombres, hojas };
  }

  function leerHoja(doc, ss) {
    const filas = [];
    let rAuto = 0;
    for (const row of porTag(doc, 'row')) {
      const rAttr = row.getAttribute('r');
      const r = rAttr ? parseInt(rAttr, 10) - 1 : rAuto;
      rAuto = r + 1;
      const fila = [];
      let cAuto = 0;
      for (const c of row.children) {
        if (c.localName !== 'c') continue;
        const ra = c.getAttribute('r');
        const ci = ra ? colIdx(ra.replace(/\d+/g, '')) : cAuto;
        cAuto = ci + 1;
        const t = c.getAttribute('t');
        const vN = hijo(c, 'v');
        let val = null;
        if (t === 's') val = vN ? (ss[parseInt(vN.textContent, 10)] ?? '') : '';
        else if (t === 'inlineStr') { const is = hijo(c, 'is'); val = is ? textoSi(is) : ''; }
        else if (t === 'b') val = vN ? vN.textContent === '1' : null;
        else if (t === 'str' || t === 'e') val = vN ? vN.textContent : '';
        else if (vN) { const n = parseFloat(vN.textContent); val = isNaN(n) ? vN.textContent : n; }
        fila[ci] = val;
      }
      filas[r] = fila;
    }
    for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
    return filas;
  }

  RH.xlsx = { libro, leer, col, ref, ESTILOS, MIME };
})(window.RH = window.RH || {});
