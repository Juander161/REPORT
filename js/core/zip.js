/* Report Hub · ZIP mínimo (lectura y escritura) para archivos .xlsx.
   Usa CompressionStream/DecompressionStream del navegador (deflate-raw);
   si no existen, escribe sin compresión (formato igualmente válido). */
(function (RH) {
  'use strict';

  const TABLA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  async function transformar(bytes, stream) {
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(out);
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try { return await transformar(bytes, new CompressionStream('deflate-raw')); } catch (e) { return null; }
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador no puede descomprimir archivos de Excel. Usa Chrome, Edge, Safari o Firefox actualizados.');
    }
    return transformar(bytes, new DecompressionStream('deflate-raw'));
  }

  /** files: [{ name, data: string | Uint8Array }] -> Blob */
  async function crear(files, tipo) {
    const ahora = new Date();
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    const partes = [], central = [];
    let offset = 0;

    for (const f of files) {
      const nombre = enc.encode(f.name);
      const crudo = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(crudo);
      let comp = await deflate(crudo), metodo = 8;
      if (!comp || comp.length >= crudo.length) { comp = crudo; metodo = 0; }

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);          // nombres en UTF-8
      lh.setUint16(8, metodo, true);
      lh.setUint16(10, hora, true);
      lh.setUint16(12, fecha, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, comp.length, true);
      lh.setUint32(22, crudo.length, true);
      lh.setUint16(26, nombre.length, true);
      lh.setUint16(28, 0, true);
      partes.push(new Uint8Array(lh.buffer), nombre, comp);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, metodo, true);
      ch.setUint16(12, hora, true);
      ch.setUint16(14, fecha, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, comp.length, true);
      ch.setUint32(24, crudo.length, true);
      ch.setUint16(28, nombre.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nombre);

      offset += 30 + nombre.length + comp.length;
    }

    const tamCentral = central.reduce((a, b) => a + b.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, files.length, true);
    fin.setUint16(10, files.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, offset, true);

    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: tipo || 'application/zip' });
  }

  /** Abre un ZIP (ArrayBuffer) y permite leer sus entradas */
  function abrir(buffer) {
    const u8 = new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('El archivo no es un libro de Excel (.xlsx) válido.');

    const total = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entradas = new Map();
    for (let i = 0; i < total; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Directorio del archivo dañado.');
      const metodo = dv.getUint16(p + 10, true);
      const tam = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const nombre = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      entradas.set(nombre, { metodo, tam, off });
      p += 46 + nl + xl + cl;
    }

    const buscar = n => {
      if (entradas.has(n)) return entradas.get(n);
      const low = n.toLowerCase();
      for (const [k, v] of entradas) if (k.toLowerCase() === low) return v;
      return null;
    };

    return {
      nombres: [...entradas.keys()],
      tiene: n => !!buscar(n),
      async bytes(n) {
        const e = buscar(n);
        if (!e) return null;
        const inicio = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
        const datos = u8.subarray(inicio, inicio + e.tam);
        if (e.metodo === 0) return datos;
        if (e.metodo === 8) return inflate(datos);
        throw new Error('Método de compresión no soportado (' + e.metodo + ').');
      },
      async texto(n) {
        const b = await this.bytes(n);
        return b ? dec.decode(b) : null;
      }
    };
  }

  RH.zip = { crear, abrir, crc32 };
})(window.RH = window.RH || {});
