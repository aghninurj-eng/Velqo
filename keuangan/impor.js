/*
  Impor pesanan marketplace (Shopee, TikTok Shop, dll.) ke tab Penjualan.

  Alur: pilih file ekspor (.xlsx / .csv) -> periksa pemetaan kolom -> pilih status pesanan -> pratinjau -> impor.
  - Satu No. pesanan = satu faktur penjualan, pelanggan = nama marketplace, status piutang sampai dana cair.
  - Keterangan faktur diawali "<Marketplace> #<No. pesanan>"; itu yang dipakai untuk mencegah impor ganda.
  - SKU dicocokkan ke Kode produk di Persediaan (stok berkurang, HPP otomatis), atau dimatikan agar hanya mencatat pendapatan.
  - Nama kolom tiap marketplace bisa berubah, jadi pemetaan kolom ditebak otomatis lalu SELALU bisa diperiksa dan diubah.

  Bergantung pada keuangan.js (S, Store, buildFaktur, modal, toast, dll.). File dibaca di browser, tidak diunggah ke mana pun.
*/
(function () {
  'use strict';

  const MPS = [['shopee', 'Shopee'], ['tiktok', 'TikTok Shop'], ['lain', 'Marketplace lain']];
  const pad2 = n => String(n).padStart(2, '0');
  const normH = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const colName = i => { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penyimpanan tidak tersedia */ } };

  /* Kolom yang dicari. `syn` = nama kolom yang dikenali (huruf kecil tanpa spasi/tanda baca). Urutan = prioritas. */
  const FIELDS = [
    { k: 'nomor', l: 'No. pesanan', req: true, syn: ['nopesanan', 'nomorpesanan', 'orderid', 'ordernumber', 'orderno', 'idpesanan', 'noorder', 'nomororder'] },
    { k: 'tanggal', l: 'Tanggal pesanan', req: true, syn: ['waktupesanandibuat', 'tanggalpesanan', 'waktupesanan', 'ordercreationdate', 'ordercreatedtime', 'createdtime', 'createtime', 'orderdate', 'tanggalorder', 'tanggal', 'waktupembayarandilakukan', 'paidtime'] },
    { k: 'status', l: 'Status pesanan', syn: ['statuspesanan', 'orderstatus', 'status'] },
    { k: 'pembeli', l: 'Pembeli (opsional)', syn: ['usernamepembeli', 'buyerusername', 'namapembeli', 'buyername', 'namapenerima', 'recipient', 'pembeli'] },
    { k: 'sku', l: 'SKU (dicocokkan dengan Kode produk)', syn: ['nomorreferensisku', 'sellersku', 'skuvariasi', 'skupenjual', 'sku'] },
    { k: 'sku2', l: 'SKU cadangan (dipakai bila SKU kosong)', syn: ['skuinduk', 'parentsku'] },
    { k: 'nama', l: 'Nama produk (opsional)', syn: ['namaproduk', 'productname', 'itemname', 'namabarang'] },
    { k: 'qty', l: 'Jumlah', req: true, syn: ['jumlah', 'quantity', 'qty', 'kuantitas', 'jumlahbarang'] },
    { k: 'harga', l: 'Harga satuan (setelah diskon)', syn: ['hargasetelahdiskon', 'hargasatuan', 'skuunitpriceafterdiscount', 'unitprice', 'harga', 'price'] },
    { k: 'subtotal', l: 'Subtotal baris setelah diskon (opsional, diutamakan bila ada)', syn: ['skusubtotalafterdiscount', 'subtotalafterdiscount', 'subtotalsetelahdiskon'] }
  ];

  /* ---------- Pembaca file ---------- */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const head = text.split(/\r?\n/).slice(0, 5).join('\n');
    let delim = ',', best = -1;
    for (const d of [',', ';', '\t']) {
      let c = 0, q = false;
      for (const ch of head) { if (ch === '"') q = !q; else if (!q && ch === d) c++; }
      if (c > best) { best = c; delim = d; }
    }
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return trimTail(rows);
  }
  const blank = r => !r || r.every(c => String(c == null ? '' : c).trim() === '');
  function trimTail(rows) { while (rows.length && blank(rows[rows.length - 1])) rows.pop(); return rows; }

  async function inflateRaw(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Bukan file XLSX yang valid.');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true),
        xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      files[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, off };
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: Object.keys(files),
      async read(name) {
        const f = files[name]; if (!f) return null;
        if (f.csize === 0xFFFFFFFF) throw new Error('File XLSX terlalu besar (ZIP64). Simpan sebagai CSV.');
        const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
        const data = u8.subarray(start, start + f.csize);
        if (f.method === 0) return new TextDecoder().decode(data);
        if (f.method === 8) return new TextDecoder().decode(await inflateRaw(data));
        throw new Error('Kompresi XLSX tidak didukung. Simpan sebagai CSV.');
      }
    };
  }
  const xml = t => new DOMParser().parseFromString(t, 'application/xml');
  // Semua lembar kerja: [{ name, rows }]. Lembar pertama dipakai impor pesanan, lembar lain dipakai penerimaan dana.
  async function parseXLSXSheets(buf) {
    const z = await unzip(buf), list = [];
    try {
      const wb = xml(await z.read('xl/workbook.xml')), rels = xml(await z.read('xl/_rels/workbook.xml.rels')), tg = {};
      for (const r of rels.getElementsByTagName('Relationship')) { const t = r.getAttribute('Target'); tg[r.getAttribute('Id')] = t.startsWith('/') ? t.slice(1) : 'xl/' + t; }
      for (const sh of wb.getElementsByTagName('sheet')) {
        const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        if (tg[rid] && z.names.includes(tg[rid])) list.push({ name: sh.getAttribute('name'), path: tg[rid] });
      }
    } catch { /* pakai cadangan di bawah */ }
    if (!list.length) z.names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort().forEach((n, i) => list.push({ name: 'Lembar ' + (i + 1), path: n }));
    if (!list.length) throw new Error('Lembar kerja tidak ditemukan di file XLSX.');
    const ss = [];
    const ssText = await z.read('xl/sharedStrings.xml');
    if (ssText) for (const si of xml(ssText).getElementsByTagName('si')) {
      let t = ''; for (const n of si.getElementsByTagName('t')) if (n.parentNode.nodeName !== 'rPh') t += n.textContent;
      ss.push(t);
    }
    const out = [];
    for (const it of list) {
      const sheet = xml(await z.read(it.path)), rows = [];
      for (const row of sheet.getElementsByTagName('row')) {
        const ri = (parseInt(row.getAttribute('r')) || rows.length + 1) - 1, cells = [];
        let ci = 0;
        for (const c of row.getElementsByTagName('c')) {
          const ref = c.getAttribute('r'), m = ref && /^([A-Z]+)/.exec(ref);
          if (m) { let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; ci = n - 1; }
          const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
          let val = '';
          if (t === 's') val = v ? (ss[parseInt(v.textContent)] || '') : '';
          else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map(x => x.textContent).join('');
          else val = v ? v.textContent : '';
          cells[ci] = val; ci++;
        }
        rows[ri] = Array.from(cells, x => x == null ? '' : x);
      }
      out.push({ name: it.name, rows: trimTail(Array.from(rows, r => r || [])) });
    }
    return out;
  }
  async function parseXLSX(buf) { return (await parseXLSXSheets(buf))[0].rows; }

  /* ---------- Pengurai nilai ---------- */
  function parseAmt(s) {
    if (typeof s === 'number') return s;
    s = String(s == null ? '' : s).trim(); if (!s) return NaN;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[^\d.,]/g, ''); if (!/\d/.test(s)) return NaN;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) { const dec = lc > ld ? ',' : '.', th = dec === ',' ? '.' : ','; s = s.split(th).join('').replace(dec, '.'); }
    else if (lc >= 0 || ld >= 0) {
      const sep = lc >= 0 ? ',' : '.', parts = s.split(sep);
      if (parts.length > 2) s = parts.join('');
      else if (parts[1].length === 3 && parts[0] !== '0' && parts[0] !== '') s = parts.join('');
      else s = parts.join('.');
    }
    const v = parseFloat(s); return isNaN(v) ? NaN : (neg ? -v : v);
  }
  function mkDate(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    const dt = new Date(Date.UTC(y, mo - 1, d)); if (dt.getUTCMonth() !== mo - 1) return '';
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }
  function parseDateStr(s, order) {
    s = String(s == null ? '' : s).trim(); if (!s) return '';
    let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s);
    if (m) return mkDate(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(s);
    if (m) return order === 'mdy' ? mkDate(+m[3], +m[1], +m[2]) : mkDate(+m[3], +m[2], +m[1]);
    if (/^\d+(\.\d+)?$/.test(s)) { const v = Math.floor(parseFloat(s)); if (v > 20000 && v < 80000) return new Date((v - 25569) * 86400000).toISOString().slice(0, 10); }
    return '';
  }
  // Tanggal "05/10/2026" bisa 5 Okt atau 10 Mei. Periksa seluruh kolom: angka >12 membuktikan urutannya.
  function detectOrder(vals) {
    let dmy = false, mdy = false;
    for (const s of vals) { const m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.]\d{4}/.exec(String(s || '').trim()); if (!m) continue; if (+m[1] > 12) dmy = true; if (+m[2] > 12) mdy = true; }
    if (dmy && !mdy) return 'dmy'; if (mdy && !dmy) return 'mdy'; return dmy && mdy ? 'dmy' : 'ambig';
  }
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

  /* ---------- Pemetaan kolom ---------- */
  function detectHeader(rows) {
    let best = 0, bs = 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const H = rows[i].map(normH); let sc = 0;
      for (const f of FIELDS) if (f.syn.some(s => H.includes(s))) sc++;
      if (sc > bs) { bs = sc; best = i; }
    }
    return bs >= 2 ? best : 0;
  }
  function autoMap(headers, saved) {
    const H = headers.map(normH), used = new Set(), map = {};
    for (const f of FIELDS) {
      let idx = -1;
      if (saved && saved[f.k]) { const i = H.indexOf(saved[f.k]); if (i >= 0 && !used.has(i)) idx = i; }
      if (idx < 0) for (const s of f.syn) { const i = H.findIndex((h, j) => h === s && !used.has(j)); if (i >= 0) { idx = i; break; } }
      if (idx < 0) for (const s of f.syn) { if (s.length < 8) continue; const i = H.findIndex((h, j) => h.includes(s) && !used.has(j)); if (i >= 0) { idx = i; break; } }
      map[f.k] = idx; if (idx >= 0) used.add(idx);
    }
    return map;
  }
  // Pesanan berstatus selesai diimpor otomatis; batal, retur, belum bayar, dan masih dikirim tidak.
  const NO_STATUS = '(tanpa status)';
  const defaultOn = s => !/batal|cancel|return|refund|kembali|gagal|unpaid|belum/i.test(s) && /(^|[^a-z])(selesai|completed?|delivered|diterima|done)([^a-z]|$)/i.test(s);

  /* ---------- Status impor ---------- */
  let imp = null;
  const mpLabel = () => imp.mp === 'lain' ? (imp.custom.trim() || 'Marketplace') : MPS.find(x => x[0] === imp.mp)[1];
  const skuMap = () => lsGet('velqo_skumap', {});
  function resolveSku(sku) {
    if (!sku) return null;
    const k = sku.trim().toLowerCase();
    const p = S.Produk.find(x => String(x.kode).trim().toLowerCase() === k);
    if (p) return p.id;
    const id = skuMap()[imp.mp + '|' + k];
    return id && produkBy(id) ? id : null;
  }

  function compute() {
    const m = imp.map, data = imp.data, label = mpLabel();
    const get = (r, k) => m[k] >= 0 ? String(r[m[k]] == null ? '' : r[m[k]]).trim() : '';
    const res = { orders: [], counts: { ok: 0, dup: 0, sku: 0, stok: 0, err: 0, tgl: 0 }, skippedStatus: new Map(), skuIssues: new Map(), statuses: new Map(), miss: [], totalOk: 0, dateAmbig: false };
    FIELDS.forEach(f => { if (f.req && m[f.k] < 0) res.miss.push(f.l); });
    if (m.harga < 0 && m.subtotal < 0) res.miss.push('Harga satuan atau Subtotal baris');
    if (res.miss.length) return res;

    const fmt = imp.dateFmt === 'auto' ? detectOrder(data.map(r => get(r, 'tanggal'))) : imp.dateFmt;
    res.dateAmbig = fmt === 'ambig';
    const order = fmt === 'mdy' ? 'mdy' : 'dmy';

    const groups = new Map();
    for (const r of data) { const no = get(r, 'nomor'); if (!no) continue; if (!groups.has(no)) groups.set(no, []); groups.get(no).push(r); }
    groups.forEach(g => { const s = get(g[0], 'status') || NO_STATUS; res.statuses.set(s, (res.statuses.get(s) || 0) + 1); });
    res.statuses.forEach((c, s) => { if (!(s in imp.statusOn)) imp.statusOn[s] = s === NO_STATUS ? true : defaultOn(s); });

    const SCI = /^\d+(\.\d+)?e\+?\d+$/i; // "5.77E+17": Excel memotong digit ID panjang yang disimpan sebagai angka
    const keys = new Set(S.Faktur.map(f => String(f.keterangan).split(' · ')[0]));
    const ctx = { Jurnal: [], Stok: [], sm: stokMap() };
    const cand = [];
    groups.forEach((g, no) => {
      const st0 = get(g[0], 'status') || NO_STATUS;
      if (!imp.statusOn[st0]) { res.skippedStatus.set(st0, (res.skippedStatus.get(st0) || 0) + 1); return; }
      const o = { no, status: st0, pembeli: get(g[0], 'pembeli').replace(/ · /g, ' '), tanggal: parseDateStr(get(g[0], 'tanggal'), order), items: [], total: 0, state: 'ok', msg: '' };
      res.orders.push(o);
      let bad = '';
      for (const r of g) {
        const sku = get(r, 'sku') || get(r, 'sku2'), qty = parseAmt(get(r, 'qty'));
        const sub = m.subtotal >= 0 ? parseAmt(get(r, 'subtotal')) : NaN, hrg = m.harga >= 0 ? parseAmt(get(r, 'harga')) : NaN;
        if (!(qty > 0)) { bad = bad || 'Jumlah tidak valid'; continue; }
        const line = !isNaN(sub) ? Math.round(sub) : !isNaN(hrg) ? Math.round(qty * hrg) : NaN;
        if (isNaN(line) || line < 0) { bad = bad || 'Harga tidak terbaca'; continue; }
        o.items.push({ sku, nama: get(r, 'nama'), qty: rq(qty), line, harga: line / qty });
        o.total += line;
      }
      if (SCI.test(no)) { o.state = 'err'; o.msg = 'Nomor pesanan rusak (' + no + '): Excel memotong digit ID yang panjang. Ekspor ulang sebagai CSV, atau ubah format kolom nomor pesanan menjadi Teks.'; res.counts.err++; res.sci = true; return; }
      if (keys.has(label + ' #' + no)) { o.state = 'dup'; res.counts.dup++; return; }
      if (!o.tanggal) { o.state = 'tgl'; o.msg = 'Tanggal "' + get(g[0], 'tanggal') + '" tidak terbaca'; res.counts.tgl++; return; }
      if (bad || !o.items.length) { o.state = 'err'; o.msg = bad || 'Tidak ada baris barang'; res.counts.err++; return; }
      if (imp.matchStock) {
        const miss = [];
        o.items.forEach(i => {
          i.pid = resolveSku(i.sku);
          if (!i.pid) { miss.push(i.sku || '(SKU kosong)'); if (i.sku) { const k = i.sku.toLowerCase(), e = res.skuIssues.get(k) || { sku: i.sku, nama: i.nama, n: 0 }; e.n++; res.skuIssues.set(k, e); } }
        });
        if (miss.length) { o.state = 'sku'; o.msg = 'SKU belum cocok: ' + [...new Set(miss)].join(', '); res.counts.sku++; return; }
      }
      cand.push(o);
    });

    cand.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.no.localeCompare(b.no));
    for (const o of cand) {
      const base = { jenis: 'penjualan', tanggal: o.tanggal, jatuh_tempo: addDays(o.tanggal, imp.days), pihak: label, keterangan: label + ' #' + o.no + (o.pembeli ? ' · ' + o.pembeli : ''), ppn: false };
      try {
        const b = buildFaktur(imp.matchStock
          ? { ...base, items: o.items.map(i => ({ produk_id: i.pid, qty: i.qty, harga: i.harga, subtotal: i.line })) }
          : { ...base, akun: AK.penjualan, subtotal: o.total }, ctx);
        o.bundle = b.rows; o.nomor = b.f.nomor; res.counts.ok++; res.totalOk += b.f.total;
      } catch (e) {
        o.state = /tidak cukup/.test(e.message) ? 'stok' : 'err'; o.msg = e.message; res.counts[o.state]++;
      }
    }
    return res;
  }

  /* ---------- Tampilan ---------- */
  const STATE = { ok: ['ok', 'Siap diimpor'], dup: ['', 'Sudah diimpor'], stok: ['bad', 'Stok kurang'], sku: ['warn', 'SKU belum cocok'], tgl: ['bad', 'Tanggal tidak valid'], err: ['bad', 'Galat'] };
  const RANK = { err: 0, tgl: 0, stok: 1, sku: 2, dup: 3, ok: 4 };

  function draw() {
    const sc = $('#dbody') ? $('#dbody').scrollTop : 0;
    const res = imp.all ? compute() : null; imp.res = res;
    const hdrs = imp.headers || [];
    const colOpts = (cur) => `<option value="-1">— tidak dipakai —</option>` + hdrs.map((h, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${colName(i)} · ${esc(String(h).slice(0, 48) || '(kosong)')}</option>`).join('');
    const sample = k => { const r = imp.data && imp.data.find(x => !blank(x)); const v = r && imp.map[k] >= 0 ? r[imp.map[k]] : ''; return v ? `<div class="mut" style="font-size:12px;margin-top:2px">contoh: ${esc(String(v).slice(0, 40))}</div>` : ''; };
    let h = `<div class="imp"><div class="f">
      <div><label>Marketplace</label>${sel('mp', MPS.map(([k, n]) => [k, n]), imp.mp, 'id="impmp"')}${imp.mp === 'lain' ? `<input id="impcustom" placeholder="Nama marketplace" value="${esc(imp.custom)}" style="margin-top:6px">` : ''}</div>
      <div><label>File ekspor pesanan (.xlsx atau .csv)</label><input type="file" id="impf" accept=".xlsx,.csv,.txt,text/csv">${imp.file ? `<div class="mut" style="font-size:12px;margin-top:2px">Terbaca: ${esc(imp.file)} (${imp.all ? imp.all.filter(r => !blank(r)).length : 0} baris berisi)</div>` : ''}</div></div>
      ${imp.err ? `<div class="note" style="margin-top:10px">${esc(imp.err)}</div>` : ''}
      <p class="mut" style="margin:10px 0 0">Ambil file dari Seller Center marketplace (menu Pesanan, lalu Ekspor). File dibaca di browser ini saja. Belum punya file? <a href="#" id="imptpl">Unduh template CSV</a> yang bisa diisi manual.</p>`;
    if (imp.all) {
      h += `<h3 style="margin:18px 0 8px">1. Kolom di file</h3>
      <div class="f"><div><label>Baris judul kolom ada di baris ke</label><input type="number" id="imphdr" min="1" max="${Math.min(imp.all.length, 50)}" value="${imp.hdr + 1}"></div>
      <div class="mut" style="padding-top:20px">Terdeteksi otomatis. Periksa contoh isinya di bawah setiap pilihan.${imp.descRows ? ` ${imp.descRows} baris penjelasan kolom di bawah judul dilewati.` : ''}</div>
      ${FIELDS.map(f => `<div><label>${f.l}${f.req ? ' *' : ''}</label><select data-map="${f.k}">${colOpts(imp.map[f.k])}</select>${sample(f.k)}</div>`).join('')}</div>`;
      if (res && res.miss.length) h += `<div class="note" style="margin-top:12px">Pilih kolom untuk: <b>${res.miss.map(esc).join(', ')}</b>.</div>`;
      if (res && !res.miss.length) {
        h += `<h3 style="margin:18px 0 8px">2. Status pesanan yang diimpor</h3><div class="stl" style="display:flex;flex-wrap:wrap;gap:6px 18px">
          ${[...res.statuses.entries()].map(([s, c]) => `<label class="chk" style="margin:0"><input type="checkbox" data-st="${esc(s)}" ${imp.statusOn[s] ? 'checked' : ''}> <span>${esc(s)} <span class="mut">(${c})</span></span></label>`).join('')}</div>
          <div class="mut" style="font-size:12px;margin-top:4px">Biasanya hanya pesanan yang sudah selesai. Pesanan yang statusnya nanti berubah bisa diimpor belakangan, nomor pesanan yang sama tidak akan dobel.</div>
        <h3 style="margin:18px 0 8px">3. Pengaturan</h3><div class="f">
          <div><label>Jatuh tempo (hari setelah tanggal pesanan)</label><input type="number" id="impdays" min="0" max="365" value="${imp.days}"></div>
          <div><label>Format tanggal di file</label>${sel('datefmt', [['auto', 'Otomatis'], ['dmy', 'Hari/Bulan/Tahun'], ['mdy', 'Bulan/Hari/Tahun']], imp.dateFmt, 'id="impdate"')}</div>
          <div class="full chk"><input type="checkbox" id="impstock" ${imp.matchStock ? 'checked' : ''} ${Store.invReady ? '' : 'disabled'}><label for="impstock" style="margin:0;font-size:14px;color:var(--ink)">Cocokkan barang ke menu Persediaan lewat SKU (stok berkurang, HPP otomatis)</label></div>
          ${Store.invReady ? '' : '<div class="full mut">Fitur persediaan belum aktif di Spreadsheet (Code.gs lama), jadi hanya pendapatan yang dicatat.</div>'}</div>
        ${res.dateAmbig ? '<div class="note" style="margin-top:10px">Format tanggal di file ambigu (semua tanggal bisa dibaca hari/bulan atau bulan/hari). Diasumsikan Hari/Bulan/Tahun, periksa kolom tanggal di pratinjau atau ubah formatnya di atas.</div>' : ''}`;
        if (imp.matchStock && res.skuIssues.size) {
          const opts = [['', '— pilih produk —'], ...S.Produk.slice().sort((a, b) => String(a.kode).localeCompare(String(b.kode))).map(p => [p.id, p.kode + ' · ' + p.nama])];
          h += `<h3 style="margin:18px 0 8px">SKU yang belum ada di Persediaan</h3><p class="mut" style="margin:0 0 8px">Cocokkan ke produk yang sudah ada, atau buat produk baru dengan Kode = SKU. Produk baru berstok 0, jadi catat dulu pembelian atau penyesuaian stoknya, lalu impor lagi.</p>
          <div style="overflow-x:auto"><table><tr><th>SKU</th><th class="hide-sm">Contoh nama di file</th><th class="r">Pesanan</th><th>Cocokkan ke</th><th></th></tr>
          ${[...res.skuIssues.values()].map(e => `<tr><td>${esc(e.sku)}</td><td class="mut hide-sm">${esc(e.nama)}</td><td class="r">${e.n}</td><td>${sel('p', opts, '', `data-sku="${esc(e.sku)}"`)}</td><td><button type="button" class="sm" data-newp="${esc(e.sku)}" data-nm="${esc(e.nama)}">+ Buat produk</button></td></tr>`).join('')}</table></div>`;
        }
        const c = res.counts, skip = [...res.skippedStatus.values()].reduce((a, b) => a + b, 0);
        const rows = res.orders.slice().sort((a, b) => RANK[a.state] - RANK[b.state] || a.tanggal.localeCompare(b.tanggal)).slice(0, 150);
        h += `<h3 style="margin:18px 0 8px">4. Pratinjau</h3>
        <div class="cards" style="margin-bottom:10px"><div class="card"><div class="l">Siap diimpor</div><div class="v ok">${c.ok}</div></div><div class="card"><div class="l">Total penjualan</div><div class="v">${rp(res.totalOk)}</div></div>
        <div class="card"><div class="l">Perlu diperbaiki</div><div class="v ${c.sku + c.stok + c.err + c.tgl ? 'bad' : ''}">${c.sku + c.stok + c.err + c.tgl}</div></div>
        <div class="card"><div class="l">Dilewati (sudah diimpor / status)</div><div class="v">${c.dup} / ${skip}</div></div></div>
        ${res.sci ? '<div class="note" style="margin-bottom:10px">Nomor pesanan di file terbaca dalam notasi ilmiah (mis. 5.77E+17), artinya digitnya sudah terpotong di Excel dan beberapa pesanan bisa tertukar. Pesanan itu tidak diimpor. Ekspor ulang langsung dari marketplace dalam format CSV, atau jangan simpan ulang file lewat Excel.</div>' : ''}
        ${c.stok ? '<div class="note" style="margin-bottom:10px">Pesanan bertanda "Stok kurang" tidak diimpor. Catat dulu pembelian atau penyesuaian stok produknya (tanggalnya sebelum pesanan), lalu impor lagi: yang sudah masuk tidak akan dobel.</div>' : ''}
        ${rows.length ? `<div class="panel" style="padding:0"><table class="pv"><tr class="hd"><th class="hide-sm">Tanggal</th><th>No. pesanan</th><th class="hide-sm">Pembeli</th><th class="r hide-sm">Barang</th><th class="r">Total</th><th>Status</th></tr>
        ${rows.map(o => { const [cl, tx] = STATE[o.state]; return `<tr><td class="hide-sm">${o.tanggal ? tgl(o.tanggal) : '-'}</td><td class="pno">${esc(o.no)}<div class="mut show-sm" style="font-size:12px">${o.tanggal ? tgl(o.tanggal) : '-'}${o.pembeli ? ' · ' + esc(o.pembeli) : ''}</div></td><td class="hide-sm">${esc(o.pembeli) || '<span class="mut">-</span>'}</td><td class="r hide-sm">${o.items.length}</td><td class="r ptot">${rp(o.total)}</td><td class="pst"><span class="tag ${cl}">${tx}</span>${o.msg ? `<div class="mut" style="font-size:12px">${esc(o.msg)}</div>` : ''}</td></tr>`; }).join('')}</table></div>
        ${res.orders.length > rows.length ? `<div class="mut" style="margin-top:6px">Menampilkan ${rows.length} dari ${res.orders.length} pesanan (yang bermasalah ditampilkan lebih dulu).</div>` : ''}` : empty('Tidak ada pesanan yang cocok dengan status terpilih.')}`;
      }
    }
    h += '</div>';
    const n = res ? res.counts.ok : 0;
    modal('Impor Pesanan Marketplace', h,
      `<button data-close>Batal</button><button class="pri" id="impgo" ${n ? '' : 'disabled'}>Impor ${n} pesanan</button>`, true);
    $('#dbody').scrollTop = sc;
    bind();
  }

  function bind() {
    $('#impmp').onchange = e => { imp.mp = e.target.value; if (imp.all) { imp.map = autoMap(imp.headers, lsGet('velqo_impmap_' + imp.mp, null)); } draw(); };
    if ($('#impcustom')) $('#impcustom').onchange = e => { imp.custom = e.target.value; draw(); };
    $('#impf').onchange = e => { if (e.target.files[0]) loadFile(e.target.files[0]); };
    $('#imptpl').onclick = e => {
      e.preventDefault();
      const csv = 'No. Pesanan,Tanggal,Status,Pembeli,SKU,Nama Produk,Jumlah,Harga Satuan\nORD-0001,2026-10-20,Selesai,budi123,P-001,Produk Contoh A,2,55000\nORD-0001,2026-10-20,Selesai,budi123,P-002,Produk Contoh B,1,85000\n';
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'template-impor-pesanan.csv'; a.click();
    };
    if (!imp.all) return;
    $('#imphdr').onchange = e => { imp.hdr = Math.max(0, Math.min(imp.all.length - 1, (parseInt(e.target.value) || 1) - 1)); applyHeader(); draw(); };
    $$('[data-map]').forEach(el => el.onchange = () => { imp.map[el.dataset.map] = parseInt(el.value); draw(); });
    $$('[data-st]').forEach(el => el.onchange = () => { imp.statusOn[el.dataset.st] = el.checked; draw(); });
    if ($('#impdays')) $('#impdays').onchange = e => { imp.days = Math.max(0, parseInt(e.target.value) || 0); draw(); };
    if ($('#impdate')) $('#impdate').onchange = e => { imp.dateFmt = e.target.value; draw(); };
    if ($('#impstock')) $('#impstock').onchange = e => { imp.matchStock = e.target.checked; draw(); };
    $$('[data-sku]').forEach(el => el.onchange = () => { if (!el.value) return; const mm = skuMap(); mm[imp.mp + '|' + el.dataset.sku.toLowerCase()] = el.value; lsSet('velqo_skumap', mm); draw(); });
    $$('[data-newp]').forEach(el => el.onclick = async () => {
      const sku = el.dataset.newp;
      if (S.Produk.some(x => String(x.kode).toLowerCase() === sku.toLowerCase())) return draw();
      try { await Store.append('Produk', [{ id: uid(), kode: sku, nama: el.dataset.nm || sku, satuan: 'pcs', stok_min: 0 }]); toast('Produk ' + sku + ' dibuat (stok 0)'); }
      catch (e) { toast(e.message, true); }
      draw();
    });
    if ($('#impgo')) $('#impgo').onclick = doImport;
  }

  function applyHeader() {
    imp.headers = imp.all[imp.hdr].map(x => String(x == null ? '' : x).trim());
    let data = imp.all.slice(imp.hdr + 1);
    imp.map = autoMap(imp.headers, lsGet('velqo_impmap_' + imp.mp, null));
    // Sebagian ekspor (mis. TikTok Shop) menyisipkan baris penjelasan kolom tepat di bawah judul. Baris awal yang jumlahnya
    // bukan angka DAN tanggalnya tidak terbaca jelas bukan pesanan, jadi dibuang (paling banyak 3 baris, dan diberitahukan).
    const qi = imp.map.qty, di = imp.map.tanggal; let n = 0;
    if (qi >= 0 && di >= 0) while (n < 3 && data[n] && !blank(data[n]) && !(parseAmt(data[n][qi]) > 0) && !parseDateStr(data[n][di], 'dmy')) n++;
    imp.descRows = n; imp.data = data.slice(n);
    imp.statusOn = {};
  }

  async function loadFile(file) {
    imp.err = '';
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('File terlalu besar (maksimal 25 MB). Ekspor per rentang tanggal yang lebih pendek.');
      let rows;
      if (/\.xlsx$/i.test(file.name)) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum bisa membaca XLSX. Simpan file sebagai CSV, atau pakai Chrome/Edge/Safari terbaru.');
        rows = await parseXLSX(await file.arrayBuffer());
      } else if (/\.xls$/i.test(file.name)) throw new Error('Format .xls lama tidak didukung. Buka di Excel, lalu simpan sebagai .xlsx atau .csv.');
      else rows = parseCSV(await file.text());
      if (rows.filter(r => !blank(r)).length < 2) throw new Error('File kosong atau tidak ada baris data.');
      imp.file = file.name; imp.all = rows; imp.hdr = detectHeader(rows); applyHeader();
    } catch (e) {
      imp.err = 'Gagal membaca file: ' + (e.message || e); imp.all = null; imp.file = '';
    }
    draw();
  }

  async function doImport() {
    const res = imp.res; if (!res || !res.counts.ok) return;
    const list = res.orders.filter(o => o.state === 'ok' && o.bundle);
    const btn = $('#impgo'); btn.disabled = true;
    const CH = 50; let done = 0, total = 0;
    try {
      for (let i = 0; i < list.length; i += CH) {
        const part = list.slice(i, i + CH), merged = { Faktur: [], FakturItem: [], FakturBiaya: [], Stok: [], Jurnal: [] };
        part.forEach(o => { for (const k in merged) merged[k].push(...(o.bundle[k] || [])); });
        btn.textContent = 'Menyimpan ' + Math.min(i + CH, list.length) + ' / ' + list.length + '…';
        await Store.appendMany(merged);
        done += part.length; total += part.reduce((a, o) => a + o.bundle.Faktur[0].total, 0);
      }
    } catch (e) {
      toast('Berhenti di tengah jalan: ' + (e.message || e) + '. ' + done + ' dari ' + list.length + ' pesanan sudah tersimpan; sisanya bisa diimpor lagi.', true);
      render(); draw(); return;
    }
    const saveMap = {}; FIELDS.forEach(f => { if (imp.map[f.k] >= 0) saveMap[f.k] = normH(imp.headers[imp.map[f.k]]); }); lsSet('velqo_impmap_' + imp.mp, saveMap);
    const c = res.counts, skip = [...res.skippedStatus.values()].reduce((a, b) => a + b, 0), label = mpLabel();
    render();
    modal('Impor selesai', `<div class="cards"><div class="card"><div class="l">Pesanan diimpor</div><div class="v ok">${done}</div></div><div class="card"><div class="l">Total penjualan</div><div class="v">${rp(total)}</div></div></div>
      <p class="mut" style="margin:10px 0 0">Dilewati: ${c.dup} sudah pernah diimpor, ${skip} karena status, ${c.sku} SKU belum cocok, ${c.stok} stok kurang, ${c.err + c.tgl} galat data.</p>
      <p style="margin:12px 0 0">Setiap pesanan tercatat sebagai faktur penjualan <b>belum lunas</b> atas nama <b>${esc(label)}</b>. Saat dana cair, buka fakturnya lalu klik <b>Terima pembayaran</b>. Potongan komisi dan biaya layanan marketplace belum dicatat otomatis; catat selisihnya lewat Kas &amp; Bank &rarr; Kas Keluar ke akun beban.</p>`,
      '<button class="pri" data-close>Tutup</button>');
    imp = null;
  }

  function imporModal() {
    imp = { mp: 'shopee', custom: '', file: '', all: null, headers: [], data: [], hdr: 0, map: {}, statusOn: {}, days: 14, dateFmt: 'auto', matchStock: Store.invReady && S.Produk.length > 0, err: '', res: null };
    draw();
  }

  window.imporModal = imporModal;
  window.VelqoImpor = { parseCSV, parseXLSX, parseXLSXSheets, normH, colName, blank, addDays, lsGet, lsSet, parseAmt, parseDateStr, detectOrder, autoMap, detectHeader, defaultOn, FIELDS, state: () => imp };
})();
