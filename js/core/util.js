/* Report Hub · utilidades compartidas (app y páginas de reporte).
   Scripts clásicos (sin módulos) para que todo funcione también abriendo los
   archivos directamente. Todo cuelga del espacio de nombres global RH. */
(function (RH) {
  'use strict';

  const LOCALE = 'es-MX';
  const DIA = 86400000;
  const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dfDia = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dfFecha = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dfFechaHora = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const limpiarMes = s => s.replace(/\./g, '');

  const u = {
    LOCALE, DIA,

    // ---------- DOM ----------
    $(sel, root) { return (root || document).querySelector(sel); },
    $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },

    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /** Crea un elemento: el('div', {class:'x', onclick: fn}, 'texto', otroNodo) */
    el(tag, attrs, ...hijos) {
      const n = document.createElement(tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          if (v == null || v === false) continue;
          if (k === 'class') n.className = v;
          else if (k === 'html') n.innerHTML = v;
          else if (k === 'text') n.textContent = v;
          else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
          else if (k === 'dataset') Object.assign(n.dataset, v);
          else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
          else n.setAttribute(k, v === true ? '' : v);
        }
      }
      for (const h of hijos.flat()) {
        if (h == null || h === false) continue;
        n.appendChild(typeof h === 'string' || typeof h === 'number' ? document.createTextNode(String(h)) : h);
      }
      return n;
    },

    // ---------- Números ----------
    fmtInt(n) { return n == null || !isFinite(n) ? '–' : nf0.format(Math.round(n)); },
    fmtDec(n) { return n == null || !isFinite(n) ? '–' : nf1.format(n); },
    fmtCompact(n) {
      if (n == null || !isFinite(n)) return '–';
      const a = Math.abs(n);
      if (a >= 1e6) return nf1.format(n / 1e6).replace(/\.0$/, '') + ' M';
      if (a >= 1e4) return nf0.format(n / 1e3) + ' K';
      if (a >= 1e3) return nf1.format(n / 1e3).replace(/\.0$/, '') + ' K';
      return nf0.format(n);
    },
    fmtPct(r, dig = 1) {
      if (r == null || !isFinite(r)) return '–';
      return (r * 100).toLocaleString(LOCALE, { minimumFractionDigits: dig, maximumFractionDigits: dig }) + ' %';
    },
    fmtSignedInt(n) {
      if (n == null || !isFinite(n)) return '–';
      const r = Math.round(n);
      return (r > 0 ? '+' : r < 0 ? '−' : '') + nf0.format(Math.abs(r));
    },
    fmtSignedDec(n) {
      if (n == null || !isFinite(n)) return '–';
      const r = Math.round(n * 10) / 10;
      return (r > 0 ? '+' : r < 0 ? '−' : '') + nf1.format(Math.abs(r));
    },
    fmtSignedPct(r, dig = 1) {
      if (r == null || !isFinite(r)) return '–';
      const v = r * 100;
      const t = Math.abs(v).toLocaleString(LOCALE, { minimumFractionDigits: dig, maximumFractionDigits: dig });
      return (v > 0.0499 ? '+' : v < -0.0499 ? '−' : '') + t + ' %';
    },
    fmtPp(d) { // diferencia de proporciones en puntos porcentuales
      if (d == null || !isFinite(d)) return '–';
      const v = d * 100;
      const t = Math.abs(v).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return (v > 0.0499 ? '+' : v < -0.0499 ? '−' : '') + t + ' pp';
    },
    /** Variación relativa a/b - 1 (null si no aplica) */
    variacion(a, b) {
      if (a == null || b == null || !isFinite(a) || !isFinite(b) || b === 0) return null;
      return a / b - 1;
    },

    // ---------- Fechas (siempre ISO 'AAAA-MM-DD' en UTC, como los reportes) ----------
    isoToUTC(iso) { return Date.parse(iso + 'T00:00:00Z'); },
    utcToIso(ms) { return new Date(ms).toISOString().slice(0, 10); },
    addDays(iso, n) { return u.utcToIso(u.isoToUTC(iso) + n * DIA); },
    /** Lunes de la semana w (1 = semana inicial) */
    weekMonday(week1Iso, w) { return u.addDays(week1Iso, (w - 1) * 7); },
    /** Semana que contiene una fecha (puede ser < 1) */
    weekOf(week1Iso, fechaIso) {
      const d = Math.floor((u.isoToUTC(fechaIso) - u.isoToUTC(week1Iso)) / DIA);
      return Math.floor(d / 7) + 1;
    },
    /** Lunes en o antes del 1 de julio del año dado: así arrancan las temporadas (p. ej. 2025-06-30) */
    inicioTemporada(anio) {
      const jul1 = Date.UTC(anio, 6, 1);
      const atras = (new Date(jul1).getUTCDay() + 6) % 7;
      return u.utcToIso(jul1 - atras * DIA);
    },
    temporadaActual() {
      const hoy = u.hoyIso(), y = +hoy.slice(0, 4);
      return hoy >= u.inicioTemporada(y) ? y : y - 1;
    },
    hoyIso() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    fmtDia(iso) { return iso ? limpiarMes(dfDia.format(new Date(u.isoToUTC(iso)))) : '–'; },
    fmtFecha(iso) { return iso ? limpiarMes(dfFecha.format(new Date(u.isoToUTC(iso)))) : '–'; },
    fmtFechaHora(ts) {
      if (!ts) return '–';
      const d = new Date(ts);
      return isNaN(d) ? '–' : limpiarMes(dfFechaHora.format(d));
    },
    fmtRango(isoIni, isoFin) {
      if (!isoIni || !isoFin) return '–';
      const a = new Date(u.isoToUTC(isoIni)), b = new Date(u.isoToUTC(isoFin));
      if (a.getUTCFullYear() === b.getUTCFullYear()) return u.fmtDia(isoIni) + ' – ' + u.fmtFecha(isoFin);
      return u.fmtFecha(isoIni) + ' – ' + u.fmtFecha(isoFin);
    },
    fmtTamano(bytes) {
      if (!bytes && bytes !== 0) return '–';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return u.fmtDec(bytes / 1024) + ' KB';
      return u.fmtDec(bytes / 1048576) + ' MB';
    },

    // ---------- Varios ----------
    debounce(fn, ms) {
      let t = null;
      return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
    },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    sum(arr) { let s = 0; for (const v of arr) if (v != null && isFinite(v)) s += v; return s; },
    rango(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; },
    clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },

    lsGet(k, def) {
      try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento no disponible */ } },

    // ---------- Archivos y portapapeles ----------
    descargar(blob, nombre) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    async copiarTexto(texto) {
      try { await navigator.clipboard.writeText(texto); return true; }
      catch (e) {
        const ta = document.createElement('textarea');
        ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
        ta.remove();
        return ok;
      }
    },
    /** Copia como tabla: Excel toma la versión HTML (con formato) y otras apps el TSV */
    async copiarTabla(tsv, html) {
      if (navigator.clipboard && window.ClipboardItem && html) {
        try {
          await navigator.clipboard.write([new ClipboardItem({
            'text/plain': new Blob([tsv], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' })
          })]);
          return true;
        } catch (e) { /* cae al texto plano */ }
      }
      return u.copiarTexto(tsv);
    },
    async copiarImagen(blobOPromesa) {
      if (!navigator.clipboard || !window.ClipboardItem) return false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOPromesa })]);
        return true;
      } catch (e) { return false; }
    },
    nombreArchivo(s) {
      return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'archivo';
    },

    // ---------- Avisos ----------
    toast(msg, opts = {}) {
      let cont = document.getElementById('toasts');
      if (!cont) {
        cont = u.el('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
        document.body.appendChild(cont);
      }
      const tipo = opts.tipo || 'info';
      const t = u.el('div', { class: 'toast toast-' + tipo },
        u.el('span', { class: 'toast-ico', 'aria-hidden': 'true' }, tipo === 'ok' ? '✓' : tipo === 'error' ? '!' : tipo === 'warn' ? '!' : 'i'),
        u.el('div', { class: 'toast-msg' }, msg));
      if (opts.accion) {
        t.appendChild(u.el('button', { class: 'toast-btn', onclick: () => { opts.accion.fn(); cerrar(); } }, opts.accion.texto));
      }
      const x = u.el('button', { class: 'toast-x', 'aria-label': 'Cerrar', onclick: () => cerrar() }, '×');
      t.appendChild(x);
      while (cont.children.length >= 3) cont.firstElementChild.remove();
      cont.appendChild(t);
      requestAnimationFrame(() => t.classList.add('in'));
      let cerrado = false;
      function cerrar() {
        if (cerrado) return; cerrado = true;
        t.classList.remove('in');
        setTimeout(() => t.remove(), 250);
      }
      setTimeout(cerrar, opts.ms || (opts.accion ? 9000 : 4500));
      return cerrar;
    },

    /** Diálogo de confirmación con estilo de la app (devuelve Promise<boolean>) */
    confirmar(titulo, mensaje, opts = {}) {
      return new Promise(res => {
        const dlg = u.el('dialog', { class: 'dlg' },
          u.el('form', { method: 'dialog' },
            u.el('h3', null, titulo),
            u.el('p', null, mensaje),
            u.el('div', { class: 'dlg-actions' },
              u.el('button', { value: 'no', class: 'btn' }, opts.cancelar || 'Cancelar'),
              u.el('button', { value: 'si', class: 'btn ' + (opts.peligro ? 'danger' : 'primary') }, opts.aceptar || 'Aceptar'))));
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => { res(dlg.returnValue === 'si'); dlg.remove(); });
        if (dlg.showModal) dlg.showModal(); else res(window.confirm(titulo + '\n\n' + mensaje));
      });
    }
  };

  RH.util = u;
})(window.RH = window.RH || {});
