/* Report Hub · ayuda contextual: botón ⓘ en cada gráfica y definiciones de términos.
   - RH.info.boton(clave)   → botón ⓘ que abre una explicación (clic, cursor o teclado).
   - RH.info.termino(txt,k) → texto subrayado con su definición.
   - Cualquier "pp" o "N/A" que aparezca en pantalla se subraya solo y muestra su definición.
   Todo el texto está aquí: editarlo no requiere tocar el resto de la aplicación. */
(function (RH) {
  'use strict';
  const u = RH.util, el = u.el;

  // ------------------------------------------------------------ glosario
  const GLOSARIO = {
    pp: { t: 'pp · puntos porcentuales', d: 'Es la diferencia entre dos porcentajes. Si la participación pasó de 20 % a 23 %, subió 3 pp (no 3 %). Se usa para comparar proporciones; para cantidades se usa el cambio en % normal.' },
    'N/A': { t: 'N/A · fuera de temporada', d: 'Filas del archivo cuya fecha es anterior al lunes de la semana 1 o que no tienen una fecha legible. No pertenecen a ninguna semana: no se grafican, pero sí cuentan en el TOTAL del reporte HTML.' },
    semana: { t: 'Semana (S1, S2…)', d: 'La semana 1 empieza el lunes que se captura al procesar el archivo. Cada semana va de lunes a domingo y se numera desde ahí.' },
    parcial: { t: 'Semana parcial', d: 'La última semana con datos todavía no había terminado cuando se exportó el archivo, así que su cifra es menor a la final. Por eso no se compara contra semanas completas.' },
    acumulado: { t: 'Acumulado', d: 'Suma progresiva: cada punto es lo que llevas desde la semana 1 hasta esa semana.' },
    variacion: { t: 'Variación (Δ y Δ %)', d: 'Δ es la diferencia en cantidad contra la temporada de comparación; Δ % es esa diferencia dividida entre la cantidad de comparación. +10 % significa 10 % más que el año anterior en la misma semana.' },
    participacion: { t: 'Participación (%)', d: 'Qué parte del total representa una categoría. Por ejemplo, % Tassels Only = Tassels Only ÷ órdenes totales. Sus cambios se miden en pp.' },
    mismas: { t: 'Misma semana / mismas semanas', d: 'La comparación siempre es contra las mismas semanas de la otra temporada (S1–S16 contra S1–S16), no contra su total completo.' },
    calor: { t: 'Mapa de calor', d: 'Tabla de colores: cada celda es un tipo en una semana; entre más intenso el color, mayor el valor. Sirve para ver de un vistazo dónde se concentra el volumen.' },
    comparable: { t: 'Total comparable', d: 'Suma solo de las semanas que tienen dato en las dos temporadas, para que la comparación sea justa.' },
    fuera: { t: 'Semanas fuera de rango', d: 'Fechas muy lejanas a la temporada (por ejemplo, un año mal capturado). Se conservan en los datos pero no se grafican.' },
    ceros: { t: 'Filas con todo en 0', d: 'Órdenes en las que todas las columnas objetivo valen 0. La opción «Incluir filas con todo en 0» decide si se cuentan; cada temporada usa la opción con la que se procesó.' },
    indice: { t: 'Índice de crecimiento', d: 'Cociente entre lo que llevas esta temporada y lo que llevaba la anterior a la misma semana (por ejemplo 1.10 = 10 % más). Se aplica al resto de la temporada anterior para proyectar el cierre.' },
    geometrico: { t: 'Crecimiento geométrico (compuesto)', d: 'La misma idea del crecimiento de poblaciones: P = P₀·(1 + r)ⁿ. La tasa r es la raíz n-ésima del cociente entre el último y el primer valor, menos 1. Supone que cada temporada crece un % parecido.' },
    lineal: { t: 'Crecimiento lineal (aritmético)', d: 'Supone que cada temporada suma una cantidad parecida (no un % parecido): incremento medio = (último − primero) ÷ número de periodos.' },
    rango: { t: 'Rango de proyección', d: 'Va del escenario más bajo al más alto que resulta de usar cada temporada base (o cada tasa histórica) por separado. Entre más ancho, más incertidumbre.' }
  };

  // ------------------------------------------------------------ explicaciones por gráfica
  const GRAFICAS = {
    semanal: {
      que: 'Compara semana por semana la temporada elegida contra la de comparación. En «Acumulado» muestra lo que se lleva sumado desde la semana 1.',
      como: 'Cada barra (o punto) es una semana. Pasa el cursor para ver las dos cifras y su diferencia. La franja resaltada es la semana seleccionada; los asteriscos marcan semanas parciales.',
      terminos: ['mismas', 'acumulado', 'parcial']
    },
    variacion: {
      que: 'Muestra cuánto subió o bajó cada semana frente a la temporada de comparación.',
      como: 'Barras azules arriba del cero = más que la temporada anterior; rojas abajo = menos. Δ está en cantidad y Δ % en porcentaje. Si la métrica es una proporción, la diferencia se mide en pp.',
      terminos: ['variacion', 'pp']
    },
    tipos: {
      que: 'Ordena los tipos de asignación por volumen en el periodo elegido y los compara entre temporadas.',
      como: 'Cada fila es un tipo; la barra gris es la temporada de comparación y la azul la actual. Úsalo para saber qué tipos explican el cambio total.',
      terminos: ['mismas']
    },
    participacion: {
      que: 'Evolución semanal del porcentaje que representa la categoría dentro del total (por ejemplo, Tassels Only entre órdenes totales).',
      como: 'Una línea sube cuando la categoría gana peso, aunque el volumen total cambie. Las diferencias entre líneas se leen en pp, no en %.',
      terminos: ['participacion', 'pp']
    },
    mezcla: {
      que: 'Descompone cada semana en los tipos que la forman.',
      como: 'En «Volumen» la altura total de la barra es la cantidad de la semana; en «% del total» todas llegan al 100 % y se ve cómo cambia la composición. Los tipos menores se agrupan en «Otros».',
      terminos: ['participacion']
    },
    calor: {
      que: 'Cruza tipos (filas) y semanas (columnas) en una tabla de colores.',
      como: 'Color más intenso = valor más alto. En «Variación» el color indica si subió o bajó contra la temporada de comparación. La última fila y columna son totales.',
      terminos: ['calor', 'variacion']
    },
    detalle: {
      que: 'Los números exactos detrás de las gráficas, semana por semana.',
      como: 'La fila de total solo suma semanas que existen en las dos temporadas («Total comparable»). Puedes copiarla a Excel o descargar el libro con fórmulas.',
      terminos: ['comparable', 'parcial']
    },
    'tabla-reporte': {
      que: 'La misma tabla que genera el reporte HTML para ese archivo, reconstruida desde lo guardado.',
      como: 'Sirve para conciliar: debe coincidir celda por celda con el reporte. Incluye la fila N/A y el TOTAL de todo el archivo (sin filtros de periodo ni de tipo).',
      terminos: ['N/A', 'fuera', 'ceros']
    },
    'proy-acumulado': {
      que: 'Lleva la temporada actual hasta su cierre estimado, comparándola con las temporadas base.',
      como: 'La línea sólida es lo real; la punteada, la proyección; las punteadas delgadas son el escenario mínimo y máximo. Si la línea real va por encima de las bases, vas adelantado.',
      terminos: ['acumulado', 'rango', 'indice']
    },
    'proy-semanal': {
      que: 'Barras por semana: lo real hasta la semana de corte y lo proyectado después.',
      como: 'Las barras claras son estimaciones. La proyección reparte el resto de la temporada con la forma (estacionalidad) de las temporadas base.',
      terminos: ['indice', 'semana']
    }
  };

  // ------------------------------------------------------------ ventana emergente
  let pop = null, anclaPop = null, cierre = null;
  function asegurarPop() {
    if (pop) return pop;
    pop = el('div', { class: 'info-pop', role: 'tooltip', id: 'rhInfoPop', hidden: true });
    document.body.appendChild(pop);
    document.addEventListener('click', ev => { if (anclaPop && !anclaPop.contains(ev.target) && !pop.contains(ev.target)) cerrar(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrar(); });
    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', () => { if (anclaPop) colocar(anclaPop); }, { passive: true });
    return pop;
  }
  function colocar(ancla) {
    const r = ancla.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8 && r.top - h - 8 > 8) y = r.top - h - 8;
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }
  function abrir(ancla, contenido) {
    asegurarPop();
    clearTimeout(cierre);
    pop.replaceChildren(...[].concat(contenido));
    pop.hidden = false;
    anclaPop = ancla;
    ancla.setAttribute('aria-describedby', 'rhInfoPop');
    colocar(ancla);
  }
  function cerrar() {
    if (!pop) return;
    pop.hidden = true;
    if (anclaPop) anclaPop.removeAttribute('aria-describedby');
    anclaPop = null;
  }
  function cerrarPronto() { clearTimeout(cierre); cierre = setTimeout(cerrar, 180); }

  function bloqueTermino(k) {
    const g = GLOSARIO[k];
    return g ? el('div', { class: 'ip-term' }, el('strong', null, g.t), el('span', null, g.d)) : null;
  }

  function contenidoGrafica(clave) {
    const a = GRAFICAS[clave];
    if (!a) return null;
    return [
      el('div', { class: 'ip-h' }, 'Qué muestra'), el('p', null, a.que),
      el('div', { class: 'ip-h' }, 'Cómo leerla'), el('p', null, a.como),
      ...(a.terminos || []).map(bloqueTermino).filter(Boolean)
    ];
  }

  /** Botón ⓘ para una gráfica (clave de GRAFICAS) o con contenido propio {que, como, terminos} */
  function boton(clave, propio) {
    const a = propio || GRAFICAS[clave];
    if (propio) GRAFICAS['_' + clave] = propio;
    const k = propio ? '_' + clave : clave;
    const b = el('button', { class: 'icon-btn info-btn', type: 'button', 'aria-label': 'Qué muestra esta gráfica y cómo leerla', title: 'Qué muestra y cómo leerla' }, 'i');
    if (!a) b.hidden = true;
    const mostrar = () => abrir(b, contenidoGrafica(k));
    b.addEventListener('click', ev => { ev.stopPropagation(); if (anclaPop === b && !pop.hidden) cerrar(); else mostrar(); });
    b.addEventListener('mouseenter', mostrar);
    b.addEventListener('focus', mostrar);
    b.addEventListener('mouseleave', cerrarPronto);
    b.addEventListener('blur', cerrarPronto);
    return b;
  }

  /** Texto subrayado con la definición de un término del glosario */
  function termino(texto, clave) {
    const g = GLOSARIO[clave || texto];
    const s = el('span', { class: 'term', tabindex: '0', 'data-term': clave || texto }, texto);
    if (!g) return s;
    const mostrar = () => abrir(s, bloqueTermino(clave || texto));
    s.addEventListener('mouseenter', mostrar);
    s.addEventListener('focus', mostrar);
    s.addEventListener('click', ev => { ev.stopPropagation(); mostrar(); });
    s.addEventListener('mouseleave', cerrarPronto);
    s.addEventListener('blur', cerrarPronto);
    return s;
  }

  // ------------------------------------------------------------ subrayado automático de términos
  const RE_TERM = /(^|[^\p{L}\p{N}_])(pp|N\/A)(?![\p{L}\p{N}_])/u;
  const OMITIR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CANVAS', 'CODE', 'BUTTON', 'IFRAME']);
  function enriquecer(raiz) {
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!RE_TERM.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        for (let p = n.parentElement; p && p !== raiz.parentElement; p = p.parentElement) {
          if (OMITIR.has(p.tagName) || p.classList.contains('term') || p.classList.contains('info-pop') || p.classList.contains('no-term')) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodos = [];
    while (w.nextNode()) nodos.push(w.currentNode);
    nodos.forEach(n => {
      const frag = document.createDocumentFragment();
      let resto = n.nodeValue, m;
      while ((m = RE_TERM.exec(resto))) {
        const ini = m.index + m[1].length;
        frag.appendChild(document.createTextNode(resto.slice(0, ini)));
        frag.appendChild(termino(m[2]));
        resto = resto.slice(ini + m[2].length);
      }
      frag.appendChild(document.createTextNode(resto));
      n.parentNode.replaceChild(frag, n);
    });
  }

  let pendiente = false;
  function observar(raiz) {
    const pasar = () => { pendiente = false; try { enriquecer(raiz); } catch (e) { console.error(e); } };
    new MutationObserver(() => { if (!pendiente) { pendiente = true; requestAnimationFrame(pasar); } })
      .observe(raiz, { childList: true, subtree: true, characterData: true });
    pasar();
  }

  /** Tarjeta de glosario completa (guía de uso) */
  function tarjetaGlosario() {
    return el('section', { class: 'card span-12 guide glosario' },
      el('h3', { class: 'card-t' }, 'Glosario'),
      el('dl', null, ...Object.keys(GLOSARIO).flatMap(k => [el('dt', { class: 'no-term' }, GLOSARIO[k].t), el('dd', null, GLOSARIO[k].d)])));
  }

  RH.info = { GLOSARIO, GRAFICAS, boton, termino, observar, enriquecer, tarjetaGlosario };
})(window.RH = window.RH || {});
