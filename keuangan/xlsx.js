/*
  Penulis file Excel (.xlsx) minimal tanpa pustaka luar: beberapa lembar, gaya sel (huruf, warna isi, garis, format angka),
  lebar kolom, sel gabungan, rumus dengan nilai tersimpan, panel beku, dan pengaturan cetak.

  Pemakaian:
    const wb = new VelqoXlsx.Book();
    const sh = wb.sheet('Nama', { cols: [12, 40, 18], freeze: 4, landscape: true });
    sh.row([ { v: 'Judul', s: { b: true, sz: 14 }, span: 3 } ]);
    sh.row([ 'teks', 123, { f: 'SUM(C2:C3)', v: 456, s: { nf: 'rp' } } ]);
    wb.download('laporan.xlsx');
  Sel: nilai biasa (teks/angka) atau { v, s, f, span }. `s` = gaya: b, i, sz, color, bg, nf, h (left|center|right), wrap, indent,
  top/bottom ('thin'|'medium'|'double'). Tanggal: { d: 'yyyy-mm-dd' } (disimpan sebagai tanggal Excel).
*/
(function () {
  'use strict';
  const NF = { rp: '#,##0;[Red](#,##0);"-"', int: '#,##0', tgl: 'dd/mm/yyyy', txt: '@' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colL = i => { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const serial = ymd => { const [y, m, d] = ymd.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); };

  /* ---------- ZIP (tanpa kompresi) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    for (const [name, text] of files) {
      const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      cd.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const csz = cd.reduce((a, p) => a + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- Gaya ---------- */
  class Styles {
    constructor() {
      this.fonts = ['<font><sz val="11"/><color rgb="FF1F2A27"/><name val="Calibri"/><family val="2"/></font>'];
      this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
      this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
      this.nfs = []; this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; this.cache = new Map();
    }
    idx(list, xml) { let i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; }
    get(s) {
      if (!s) return 0;
      const key = JSON.stringify(s); if (this.cache.has(key)) return this.cache.get(key);
      const col = c => 'FF' + String(c).replace('#', '').toUpperCase();
      const font = this.idx(this.fonts, `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}<sz val="${s.sz || 11}"/><color rgb="${col(s.color || '1F2A27')}"/><name val="Calibri"/><family val="2"/></font>`);
      const fill = s.bg ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${col(s.bg)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const side = (n, v, c) => v ? `<${n} style="${v}"><color rgb="${col(c || '9AA5A1')}"/></${n}>` : `<${n}/>`;
      const border = this.idx(this.borders, `<border>${side('left', s.left, s.bc)}${side('right', s.right, s.bc)}${side('top', s.top, s.bc)}${side('bottom', s.bottom, s.bc)}<diagonal/></border>`);
      let nf = 0;
      if (s.nf) { const code = NF[s.nf] || s.nf; let i = this.nfs.indexOf(code); if (i < 0) { this.nfs.push(code); i = this.nfs.length - 1; } nf = 164 + i; }
      const al = (s.h || s.v || s.wrap || s.indent) ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''} vertical="${s.v || 'center'}"${s.wrap ? ' wrapText="1"' : ''}${s.indent ? ` indent="${s.indent}"` : ''}/>` : '<alignment vertical="center"/>';
      const xf = `<xf numFmtId="${nf}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1">${al}</xf>`;
      this.xfs.push(xf); const id = this.xfs.length - 1; this.cache.set(key, id); return id;
    }
    xml() {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        (this.nfs.length ? `<numFmts count="${this.nfs.length}">${this.nfs.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(c)}"/>`).join('')}</numFmts>` : '') +
        `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    }
  }

  /* ---------- Lembar ---------- */
  class Sheet {
    constructor(book, name, opt) { this.book = book; this.name = name; this.opt = opt || {}; this.rows = []; this.merges = []; }
    // Tambah satu baris. cells = array sel; opt.h = tinggi baris. Mengembalikan nomor baris (mulai 1).
    row(cells, opt) { this.rows.push({ cells: cells || [], h: opt && opt.h }); return this.rows.length; }
    blank(n = 1) { for (let i = 0; i < n; i++) this.row([]); }
    get n() { return this.rows.length; }
    xml() {
      this.merges = []; const o = this.opt, st = this.book.styles; let maxC = (o.cols || []).length;
      const rows = this.rows.map((r, ri) => {
        let col = 0; const cs = [];
        for (const raw of r.cells) {
          const c = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : { v: raw };
          let s = c.s; if (c.d) s = Object.assign({ nf: 'tgl', h: 'left' }, s);
          const sid = st.get(s), ref = colL(col) + (ri + 1);
          if (c.f != null) cs.push(`<c r="${ref}" s="${sid}"><f>${esc(c.f)}</f>${typeof c.v === 'number' ? `<v>${c.v}</v>` : ''}</c>`);
          else if (c.d) cs.push(`<c r="${ref}" s="${sid}"><v>${serial(c.d)}</v></c>`);
          else if (typeof c.v === 'number' && isFinite(c.v)) cs.push(`<c r="${ref}" s="${sid}"><v>${c.v}</v></c>`);
          else if (c.v == null || c.v === '') cs.push(`<c r="${ref}" s="${sid}"/>`);
          else cs.push(`<c r="${ref}" s="${sid}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`);
          const span = c.span || 1;
          if (span > 1) { this.merges.push(`${ref}:${colL(col + span - 1)}${ri + 1}`); for (let k = 1; k < span; k++) cs.push(`<c r="${colL(col + k)}${ri + 1}" s="${sid}"/>`); }
          col += span;
        }
        maxC = Math.max(maxC, col);
        return `<row r="${ri + 1}"${r.h ? ` ht="${r.h}" customHeight="1"` : ''}>${cs.join('')}</row>`;
      }).join('');
      const fr = o.freeze ? `<pane ySplit="${o.freeze}" topLeftCell="A${o.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${o.freeze + 1}" sqref="A${o.freeze + 1}"/>` : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
        `<dimension ref="A1:${colL(Math.max(maxC, 1) - 1)}${Math.max(this.rows.length, 1)}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"${this.book.sheets[0] === this ? ' tabSelected="1"' : ''}>${fr}</sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="18"/>${o.cols ? `<cols>${o.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}` +
        `<sheetData>${rows}</sheetData>${this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}` +
        `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${o.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
        `<headerFooter><oddFooter>&amp;L&amp;A&amp;RHalaman &amp;P dari &amp;N</oddFooter></headerFooter></worksheet>`;
    }
  }

  class Book {
    constructor() { this.sheets = []; this.styles = new Styles(); }
    sheet(name, opt) { const s = new Sheet(this, String(name).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31), opt); this.sheets.push(s); return s; }
    blob() {
      const ws = this.sheets.map(s => s.xml()), n = this.sheets.length; // gaya dikumpulkan saat lembar dirender, jadi styles.xml terakhir
      const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const files = [
        ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ws.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
        ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
        ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${rel}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${this.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
        ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ws.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
        ['xl/styles.xml', this.styles.xml()],
        ...ws.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x])
      ];
      return zip(files);
    }
    download(name) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(this.blob()); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  }
  window.VelqoXlsx = { Book, colL, serial };
})();
