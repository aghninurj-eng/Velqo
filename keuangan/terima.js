/*
  Penerimaan dana massal dari marketplace (Shopee, TikTok Shop, dll.) di tab Penjualan.

  Alur: pilih file ekspor penghasilan/penyelesaian -> periksa pemetaan kolom -> pratinjau per pesanan -> simpan.
  - Satu baris pesanan di file dicocokkan ke faktur penjualan hasil impor ("<Marketplace> #<No. pesanan>").
  - Tiap pesanan membuat satu jurnal penerimaan (nomor RCV): Dr Kas/Saldo marketplace sebesar dana yang cair,
    Dr beban per kelompok potongan (komisi, layanan, ongkir, voucher, pajak, lain), Cr Piutang sebesar sisa faktur.
    Bila sisa faktur tidak sama dengan pendapatan di file, selisihnya masuk akun "Selisih Penjualan Marketplace".
  - Faktur menjadi lunas (terbayar = total). Pesanan yang fakturnya sudah lunas atau sudah pernah dicatat dilewati, jadi aman diulang.
  - Pendapatan di file = Total Pendapatan / Harga Produk. Dana cair = Total Penghasilan / Jumlah penyelesaian.
    Potongan = pendapatan - dana cair; dirinci dari kolom komponen, sisanya (bila ada) masuk "Beban lain".

  Bergantung pada keuangan.js dan impor.js (pembaca file XLSX/CSV). File dibaca di browser, tidak diunggah ke mana pun.
*/
(function () {
  'use strict';
  const I = () => window.VelqoImpor;
  const MPS = [['shopee', 'Shopee'], ['tiktok', 'TikTok Shop'], ['lain', 'Marketplace lain']];
  const CATS = [
    { k: 'komisi', l: 'Komisi & administrasi', kode: '5610', nama: 'Beban Komisi & Administrasi Marketplace' },
    { k: 'layanan', l: 'Biaya layanan & proses', kode: '5620', nama: 'Beban Layanan Marketplace' },
    { k: 'ongkir', l: 'Ongkos kirim', kode: '5630', nama: 'Beban Ongkos Kirim Marketplace' },
    { k: 'promo', l: 'Voucher, promosi & iklan', kode: '5640', nama: 'Beban Voucher & Promosi Marketplace' },
    { k: 'pajak', l: 'Pajak dipungut (PPh 22 dll.)', kode: '5650', nama: 'Beban Pajak Marketplace' },
    { k: 'lain', l: 'Potongan lain', kode: '5660', nama: 'Beban Potongan Lain Marketplace' },
    { k: 'selisih', l: 'Selisih faktur vs file', kode: '5690', nama: 'Selisih Penjualan Marketplace' }
  ];
  const KAS_BARU = { shopee: ['1210', 'Saldo Shopee'], tiktok: ['1220', 'Saldo TikTok Shop'], lain: ['1290', 'Saldo Marketplace'] };
  const FIELDS = [
    { k: 'nomor', l: 'No. pesanan', req: true, syn: ['nopesanan', 'idpesananpenyesuaian', 'idpesanan', 'nomorpesanan', 'orderid', 'ordernumber'] },
    { k: 'net', l: 'Dana yang cair (neto)', req: true, syn: ['totalpenghasilan', 'jumlahpenyelesaianpembayaran', 'jumlahpenyelesaian', 'settlementamount', 'totalsettlementamount'] },
    { k: 'rev', l: 'Pendapatan sebelum potongan', req: true, syn: ['hargaproduk', 'totalpendapatan', 'totalrevenue'] },
    { k: 'tanggal', l: 'Tanggal dana cair', syn: ['tanggaldanadilepaskan', 'waktupembayaranpesanan', 'tanggalpenyelesaian', 'settlementtime', 'releasedate', 'tanggalpelepasan'] },
    { k: 'jenis', l: 'Jenis baris (opsional)', syn: ['lihatberdasarkan', 'jenistransaksi', 'transactiontype'] }
  ];
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SCI = /^\d+(\.\d+)?e\+?\d+$/i;

  let tm = null;

  /* ---------- Penebak kolom ---------- */
  function headerScore(rows, i) {
    const H = (rows[i] || []).map(I().normH); let sc = 0;
    for (const f of FIELDS) if (f.syn.some(s => H.includes(s) || (s.length >= 12 && H.some(h => h.startsWith(s))))) sc += f.req ? 2 : 1;
    return sc;
  }
  function bestHeader(rows) { let b = -1, bs = 0; for (let i = 0; i < Math.min(rows.length, 12); i++) { const s = headerScore(rows, i); if (s > bs) { bs = s; b = i; } } return bs >= 5 ? b : -1; }
  function pickSheet(sheets) {
    let bi = 0, bs = -1;
    sheets.forEach((s, i) => { const h = bestHeader(s.rows), sc = h < 0 ? 0 : headerScore(s.rows, h) + Math.min(s.rows.length, 50) / 100; if (sc > bs) { bs = sc; bi = i; } });
    return bi;
  }
  function autoMap(headers, saved) {
    const H = headers.map(I().normH), used = new Set(), map = {};
    for (const f of FIELDS) {
      let idx = -1;
      if (saved && saved[f.k]) { const i = H.indexOf(saved[f.k]); if (i >= 0 && !used.has(i)) idx = i; }
      if (idx < 0) for (const s of f.syn) { const i = H.findIndex((h, j) => h === s && !used.has(j)); if (i >= 0) { idx = i; break; } }
      if (idx < 0) for (const s of f.syn) { if (s.length < 12) continue; const i = H.findIndex((h, j) => h.startsWith(s) && !used.has(j)); if (i >= 0) { idx = i; break; } }
      map[f.k] = idx; if (idx >= 0) used.add(idx);
    }
    // Rentang kolom komponen potongan
    const at = s => H.indexOf(s);
    let c1 = -1, c2 = -1;
    if (at('hargaproduk') >= 0) { c1 = at('hargaproduk') + 1; c2 = at('pph22'); if (c2 < 0) { const u = at('usernamepembeli'); c2 = u > 0 ? u - 1 : -1; } }
    else if (at('biayakomisiplatform') >= 0) { c1 = at('biayakomisiplatform'); c2 = at('insurancefee'); if (c2 < 0) { const j = at('jumlahpenyesuaian'); c2 = j > 0 ? j - 1 : -1; } }
    map.c1 = c1; map.c2 = c2;
    return map;
  }
  function detectMp(headers) {
    const H = headers.map(I().normH);
    if (H.includes('lihatberdasarkan') || H.includes('hargaproduk')) return 'shopee';
    if (H.includes('idpesananpenyesuaian') || H.includes('biayakomisiplatform')) return 'tiktok';
    return null;
  }
  // Kelompok potongan dari nama kolom. Urutan penting: yang lebih spesifik dulu.
  function catOf(h) {
    const n = I().normH(h);
    if (/pph|pajak|tax/.test(n)) return 'pajak';
    if (/ongkir|ongkoskirim|kirim|pengiriman|logistik|insurance|subsidi/.test(n)) return 'ongkir';
    if (/komisi|administrasi|afiliasi|ams/.test(n)) return 'komisi';
    if (/voucher|cashback|diskon|koin|promo|iklan|kampanye|campaign/.test(n)) return 'promo';
    if (/biaya|layanan|premi|fee|program/.test(n)) return 'layanan';
    return 'lain';
  }
  // Kolom subtotal yang isinya sudah dihitung dari kolom lain di sebelahnya: dilewati agar tidak terhitung dua kali.
  const isSubtotal = h => { const n = I().normH(h); return n === 'ongkir' || n === 'totalbiaya'; };

  /* ---------- Hitung ---------- */
  const label = () => tm.mp === 'lain' ? (tm.custom.trim() || 'Marketplace') : MPS.find(x => x[0] === tm.mp)[1];
  const rnd = n => Math.round(n);
  const dmyOrder = () => (tm.data && tm.map.tanggal >= 0) ? I().detectOrder(tm.data.map(r => r[tm.map.tanggal])) : 'dmy';

  function compute() {
    const { parseAmt, parseDateStr, blank } = I(), m = tm.map, res = { miss: [], orders: [], counts: { ok: 0, warn: 0, nof: 0, lunas: 0, dup: 0, zero: 0, err: 0, skip: 0 }, tot: { net: 0, fee: 0, rev: 0 }, cat: {} };
    FIELDS.forEach(f => { if (f.req && !(m[f.k] >= 0)) res.miss.push(f.l); });
    if (res.miss.length) return res;
    const lb = label(), order = dmyOrder(), seen = new Set(), keys = new Map();
    S.Faktur.forEach(f => { if (f.jenis === 'penjualan') { const k = String(f.keterangan).split(' · ')[0]; if (!keys.has(k)) keys.set(k, f); } });
    const done = new Set(S.Jurnal.filter(j => j.sumber === 'RCV' && String(j.keterangan).startsWith('Dana ')).map(j => j.keterangan));
    const comps = [];
    if (m.c1 >= 0 && m.c2 >= m.c1) for (let c = m.c1; c <= m.c2; c++) if (tm.headers[c] && !isSubtotal(tm.headers[c])) comps.push([c, catOf(tm.headers[c])]);
    const fixedDate = tm.dateMode === 'one' ? tm.date : '';
    for (const r of tm.data) {
      if (blank(r)) continue;
      const no = String(r[m.nomor] == null ? '' : r[m.nomor]).trim(); if (!no) continue;
      if (m.jenis >= 0) { const j = String(r[m.jenis]).trim().toLowerCase(); if (j && !/^(order|pesanan)$/.test(j)) { res.counts.skip++; continue; } }
      if (seen.has(no)) continue; seen.add(no);
      const net = parseAmt(r[m.net]), rev = parseAmt(r[m.rev]);
      const o = { no, net: rnd(net), rev: rnd(rev), tgl: fixedDate || (m.tanggal >= 0 ? parseDateStr(r[m.tanggal], order) : ''), comp: {}, state: 'ok', msg: '', on: false };
      res.orders.push(o);
      if (SCI.test(no)) { o.state = 'err'; o.msg = 'Nomor pesanan rusak (Excel memotong digit). Ekspor ulang sebagai CSV.'; res.counts.err++; continue; }
      if (isNaN(net) || isNaN(rev)) { o.state = 'err'; o.msg = 'Jumlah tidak terbaca'; res.counts.err++; continue; }
      const f = keys.get(lb + ' #' + no);
      if (!f) { o.state = 'nof'; o.msg = 'Faktur belum ada. Impor pesanan dulu.'; res.counts.nof++; continue; }
      o.f = f; o.sisa = rnd(f.total - f.terbayar);
      if (done.has('Dana ' + lb + ' #' + no)) { o.state = 'dup'; o.msg = 'Dana sudah pernah dicatat'; res.counts.dup++; continue; }
      if (o.sisa <= 0) { o.state = 'lunas'; o.msg = 'Faktur sudah lunas'; res.counts.lunas++; continue; }
      if (o.net <= 0 && o.rev <= 0) { o.state = 'zero'; o.msg = 'Tidak ada dana cair (retur / batal)'; res.counts.zero++; continue; }
      if (o.net < 0 || o.rev < 0 || o.net > o.rev) { o.state = 'err'; o.msg = 'Angka tidak wajar (dana cair lebih besar dari pendapatan atau negatif)'; res.counts.err++; continue; }
      if (!o.tgl) { o.state = 'err'; o.msg = 'Tanggal dana cair tidak terbaca. Pilih "Satu tanggal untuk semua".'; res.counts.err++; continue; }
      // beban per kelompok (positif = biaya, negatif = pengurang biaya)
      const exp = {}; let sum = 0;
      for (const [c, k] of comps) { const v = parseAmt(r[c]); if (!isNaN(v) && v) { exp[k] = (exp[k] || 0) - v; sum -= v; } }
      const fee = o.rev - o.net, rem = rnd(fee - sum);
      if (rem) exp.lain = (exp.lain || 0) + rem;
      for (const k in exp) { exp[k] = rnd(exp[k]); if (!exp[k]) delete exp[k]; }
      o.fee = fee; o.exp = exp; o.sel = o.sisa - o.rev; o.remFlag = Math.abs(rem) > 1 && comps.length > 0;
      if (o.sel) exp.selisih = o.sel;
      const big = Math.abs(o.sel) > Math.max(1000, o.rev * 0.01);
      if (big) { o.state = 'warn'; o.msg = 'Pendapatan di file ' + rp(o.rev) + ' beda dengan sisa faktur ' + rp(o.sisa); res.counts.warn++; }
      else { res.counts.ok++; }
      if (o.state === 'ok') o.msg = o.remFlag ? 'Rincian potongan tidak persis, sisanya ke "Potongan lain"' : (o.sel ? 'Selisih kecil ' + rp(o.sel) : '');
      o.on = tm.sel[no] !== undefined ? tm.sel[no] : o.state === 'ok';
    }
    res.orders.filter(o => o.on && (o.state === 'ok' || o.state === 'warn')).forEach(o => {
      res.tot.net += o.net; res.tot.rev += o.rev; res.tot.fee += o.fee;
      for (const k in o.exp) res.cat[k] = (res.cat[k] || 0) + o.exp[k];
    });
    return res;
  }

  /* ---------- Akun ---------- */
  const catAkun = k => tm.akun[k];
  function akunSelect(name, cur, tipeFilter, saran) {
    const opts = S.Akun.filter(tipeFilter).sort((a, b) => a.kode.localeCompare(b.kode)).map(a => [a.kode, a.kode + ' · ' + a.nama]);
    if (saran && !S.Akun.some(a => a.kode === saran.kode)) opts.unshift([saran.kode, saran.kode + ' · ' + saran.nama + ' (akan dibuat)']);
    return sel(name, opts, cur);
  }
  function defaults() {
    tm.akun = {};
    CATS.forEach(c => { tm.akun[c.k] = c.kode; });
    const s = lsGet('velqo_terimaakun', null);
    if (s) CATS.forEach(c => { if (s[c.k] && S.Akun.some(a => a.kode === s[c.k])) tm.akun[c.k] = s[c.k]; });
    const ex = S.Akun.find(a => a.kategori === 'Kas & Bank' && a.nama.toLowerCase().includes(label().toLowerCase().split(' ')[0]));
    tm.kas = ex ? ex.kode : KAS_BARU[tm.mp][0];
  }
  const lsGet = (k, d) => I().lsGet(k, d), lsSet = (k, v) => I().lsSet(k, v);

  /* ---------- Tampilan ---------- */
  function applySheet() {
    const rows = tm.sheets[tm.si].rows;
    tm.hdr = Math.max(0, bestHeader(rows));
    applyHeader();
  }
  function applyHeader() {
    const rows = tm.sheets[tm.si].rows;
    tm.headers = (rows[tm.hdr] || []).map(x => String(x == null ? '' : x).trim());
    tm.data = rows.slice(tm.hdr + 1);
    tm.map = autoMap(tm.headers, lsGet('velqo_terimamap_' + tm.mp, null));
    tm.sel = {};
  }
  async function loadFile(file) {
    tm.err = '';
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('File terlalu besar (maksimal 25 MB).');
      let sheets;
      if (/\.xlsx$/i.test(file.name)) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum bisa membaca XLSX. Simpan sebagai CSV, atau pakai Chrome/Edge/Safari terbaru.');
        sheets = await I().parseXLSXSheets(await file.arrayBuffer());
      } else if (/\.xls$/i.test(file.name)) throw new Error('Format .xls lama tidak didukung. Simpan sebagai .xlsx atau .csv.');
      else sheets = [{ name: 'CSV', rows: I().parseCSV(await file.text()) }];
      if (!sheets.some(s => s.rows.filter(r => !I().blank(r)).length >= 2)) throw new Error('File kosong atau tidak ada baris data.');
      tm.file = file.name; tm.sheets = sheets; tm.si = pickSheet(sheets); applySheet();
      const d = detectMp(tm.headers); if (d && d !== tm.mp) { tm.mp = d; applyHeader(); defaults(); }
    } catch (e) { tm.err = 'Gagal membaca file: ' + (e.message || e); tm.sheets = null; tm.file = ''; }
    draw();
  }

  const stTag = { ok: ['ok', 'Siap'], warn: ['warn', 'Periksa'], nof: ['bad', 'Tanpa faktur'], lunas: ['', 'Sudah lunas'], dup: ['', 'Sudah dicatat'], zero: ['', 'Dilewati'], err: ['bad', 'Galat'] };

  function draw() {
    const sc = $('#dbody') ? $('#dbody').scrollTop : 0;
    const res = tm.sheets ? compute() : null; tm.res = res;
    const hd = tm.headers || [];
    const colOpts = cur => `<option value="-1">— tidak dipakai —</option>` + hd.map((h, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${I().colName(i)} · ${esc(String(h).slice(0, 46) || '(kosong)')}</option>`).join('');
    const sample = k => { const r = tm.data && tm.data.find(x => !I().blank(x)); const v = r && tm.map[k] >= 0 ? r[tm.map[k]] : ''; return v ? `<div class="mut" style="font-size:12px;margin-top:2px">contoh: ${esc(String(v).slice(0, 40))}</div>` : ''; };
    let h = `<div class="imp"><div class="f">
      <div><label>Marketplace</label>${sel('mp', MPS, tm.mp, 'id="tmmp"')}${tm.mp === 'lain' ? `<input id="tmcustom" placeholder="Nama marketplace (sama dengan di faktur)" value="${esc(tm.custom)}" style="margin-top:6px">` : ''}</div>
      <div><label>File penghasilan / penyelesaian dana (.xlsx atau .csv)</label><input type="file" id="tmf" accept=".xlsx,.csv,.txt,text/csv">${tm.file ? `<div class="mut" style="font-size:12px;margin-top:2px">Terbaca: ${esc(tm.file)}</div>` : ''}</div></div>
      ${tm.err ? `<div class="note" style="margin-top:10px">${esc(tm.err)}</div>` : ''}
      <p class="mut" style="margin:10px 0 0">Shopee: Penghasilan &rarr; Sudah Dilepas &rarr; Unduh laporan. TikTok Shop: Finance &rarr; Pendapatan &rarr; Unduh. Faktur pesanannya harus sudah ada di Penjualan (impor pesanan lebih dulu).</p>`;
    if (tm.sheets) {
      h += `<h3 style="margin:18px 0 8px">1. Kolom di file</h3><div class="f">
        ${tm.sheets.length > 1 ? `<div><label>Lembar kerja</label>${sel('si', tm.sheets.map((s, i) => [i, s.name]), tm.si, 'id="tmsh"')}</div>` : ''}
        <div><label>Baris judul kolom ada di baris ke</label><input type="number" id="tmhdr" min="1" max="${Math.min(tm.sheets[tm.si].rows.length, 50)}" value="${tm.hdr + 1}"></div>
        ${FIELDS.map(f => `<div><label>${f.l}${f.req ? ' *' : ''}</label><select data-map="${f.k}">${colOpts(tm.map[f.k])}</select>${sample(f.k)}</div>`).join('')}
        <div><label>Kolom rincian potongan: dari</label><select data-map="c1">${colOpts(tm.map.c1)}</select></div>
        <div><label>sampai</label><select data-map="c2">${colOpts(tm.map.c2)}</select></div></div>
        <div class="mut" style="font-size:12px;margin-top:6px">Rincian potongan dikelompokkan dari nama kolom. Kalau rincian tidak ada atau tidak persis, selisihnya otomatis masuk "Potongan lain", jadi jurnal tetap seimbang.</div>`;
      if (res && res.miss.length) h += `<div class="note" style="margin-top:12px">Pilih kolom untuk: <b>${res.miss.map(esc).join(', ')}</b>.</div>`;
      if (res && !res.miss.length) {
        const c = res.counts, onN = res.orders.filter(o => o.on && (o.state === 'ok' || o.state === 'warn')).length;
        h += `<h3 style="margin:18px 0 8px">2. Pengaturan</h3><div class="f">
          <div><label>Dana masuk ke akun</label>${akunSelect('kas', tm.kas, a => a.kategori === 'Kas & Bank', { kode: KAS_BARU[tm.mp][0], nama: KAS_BARU[tm.mp][1] })}<div class="mut" style="font-size:12px;margin-top:2px">Pakai akun "Saldo ${esc(label())}" bila dana belum ditarik ke bank, lalu pindahkan lewat Transfer saat penarikan.</div></div>
          <div><label>Tanggal penerimaan</label>${sel('dm', [['file', 'Sesuai tanggal di file'], ['one', 'Satu tanggal untuk semua']], tm.dateMode, 'id="tmdm"')}${tm.dateMode === 'one' ? `<input type="date" id="tmdate" value="${esc(tm.date)}" style="margin-top:6px">` : ''}</div></div>
          <details style="margin-top:10px"><summary style="cursor:pointer">Akun beban untuk tiap kelompok potongan</summary><div class="f" style="margin-top:8px">
          ${CATS.map(k => `<div><label>${k.l}</label>${akunSelect('ak_' + k.k, tm.akun[k.k], a => a.tipe === 'Beban', k)}</div>`).join('')}</div></details>
          <h3 style="margin:18px 0 8px">3. Pratinjau</h3>
          <div class="cards"><div class="card"><div class="l">Pesanan dipilih</div><div class="v ok">${onN}</div></div><div class="card"><div class="l">Dana cair</div><div class="v">${rp(res.tot.net)}</div></div><div class="card"><div class="l">Total potongan</div><div class="v">${rp(res.tot.fee)}</div></div></div>
          ${Object.keys(res.cat).length ? `<table style="margin-top:10px">${CATS.filter(k => res.cat[k.k]).map(k => `<tr><td>${k.l}</td><td class="r">${rp(res.cat[k.k])}</td></tr>`).join('')}</table>` : ''}
          <p class="mut" style="margin:10px 0 6px">Siap ${c.ok}, perlu diperiksa ${c.warn}, tanpa faktur ${c.nof}, sudah lunas/dicatat ${c.lunas + c.dup}, tanpa dana (retur/batal) ${c.zero}, galat ${c.err}${c.skip ? ', baris rincian dilewati ' + c.skip : ''}.</p>
          <div class="bar" style="margin-bottom:6px"><button class="sm" id="tmall">Pilih semua yang bisa</button><button class="sm" id="tmnone">Kosongkan</button></div>
          ${res.orders.length ? `<div style="border:1px solid var(--line);border-radius:6px;max-height:340px;overflow:auto"><table class="pv"><tr class="hd"><th></th><th>No. pesanan</th><th class="hide-sm">Tanggal</th><th class="r">Dana cair</th><th class="r hide-sm">Potongan</th><th class="r hide-sm">Sisa faktur</th><th>Status</th></tr>
          ${res.orders.slice(0, 400).map(o => { const can = o.state === 'ok' || o.state === 'warn', t = stTag[o.state]; return `<tr><td>${can ? `<input type="checkbox" data-o="${esc(o.no)}" ${o.on ? 'checked' : ''}>` : ''}</td><td class="pno">${esc(o.no)}</td><td class="hide-sm">${o.tgl ? tgl(o.tgl) : '-'}</td><td class="r ptot">${rp(o.net)}</td><td class="r hide-sm">${o.fee != null ? rp(o.fee) : '-'}</td><td class="r hide-sm">${o.sisa != null ? rp(o.sisa) : '-'}</td><td class="pst"><span class="tag ${t[0]}">${t[1]}</span> <span class="mut" style="font-size:12px">${esc(o.msg)}</span></td></tr>`; }).join('')}</table></div>${res.orders.length > 400 ? `<div class="mut" style="font-size:12px;margin-top:4px">Menampilkan 400 pertama dari ${res.orders.length}. Simpan, lalu buka file lagi untuk sisanya.</div>` : ''}` : ''}`;
      }
    }
    h += '</div>';
    const ready = res && !res.miss.length && res.orders.some(o => o.on && (o.state === 'ok' || o.state === 'warn'));
    const n = ready ? res.orders.filter(o => o.on && (o.state === 'ok' || o.state === 'warn')).length : 0;
    modal('Penerimaan dana marketplace', h, `<button data-close>Batal</button><button class="pri" id="tmgo" ${ready ? '' : 'disabled'}>Catat penerimaan${n ? ' (' + n + ' pesanan)' : ''}</button>`, true);
    if ($('#dbody')) $('#dbody').scrollTop = sc;
    bind();
  }

  function bind() {
    $('#tmmp').onchange = e => { tm.mp = e.target.value; if (tm.sheets) applyHeader(); defaults(); draw(); };
    if ($('#tmcustom')) $('#tmcustom').onchange = e => { tm.custom = e.target.value; tm.sel = {}; draw(); };
    $('#tmf').onchange = e => { const f = e.target.files[0]; if (f) loadFile(f); };
    if ($('#tmsh')) $('#tmsh').onchange = e => { tm.si = +e.target.value; applySheet(); draw(); };
    if ($('#tmhdr')) $('#tmhdr').onchange = e => { tm.hdr = Math.max(0, (parseInt(e.target.value) || 1) - 1); applyHeader(); draw(); };
    $$('[data-map]').forEach(el => el.onchange = () => { tm.map[el.dataset.map] = +el.value; tm.sel = {}; draw(); });
    if ($('[name=kas]')) $('[name=kas]').onchange = e => { tm.kas = e.target.value; draw(); };
    if ($('#tmdm')) $('#tmdm').onchange = e => { tm.dateMode = e.target.value; tm.sel = {}; draw(); };
    if ($('#tmdate')) $('#tmdate').onchange = e => { tm.date = e.target.value; tm.sel = {}; draw(); };
    CATS.forEach(k => { const el = $('[name=ak_' + k.k + ']'); if (el) el.onchange = e => { tm.akun[k.k] = e.target.value; draw(); }; });
    $$('[data-o]').forEach(el => el.onchange = () => { tm.sel[el.dataset.o] = el.checked; draw(); });
    if ($('#tmall')) $('#tmall').onclick = () => { tm.res.orders.forEach(o => { if (o.state === 'ok' || o.state === 'warn') tm.sel[o.no] = true; }); draw(); };
    if ($('#tmnone')) $('#tmnone').onclick = () => { tm.res.orders.forEach(o => { tm.sel[o.no] = false; }); draw(); };
    if ($('#tmgo')) $('#tmgo').onclick = save;
  }

  /* ---------- Simpan ---------- */
  function buildOrder(o, ctx) {
    const lb = label(), lines = [];
    const add = (kode, v) => { if (!v) return; const l = lines.find(x => x.kode === kode); if (l) { l.debit += v > 0 ? v : 0; l.kredit += v < 0 ? -v : 0; } else lines.push({ kode, debit: v > 0 ? v : 0, kredit: v < 0 ? -v : 0 }); };
    add(tm.kas, o.net);
    for (const k in o.exp) add(tm.akun[k], o.exp[k]);
    lines.push({ kode: AK.piutang, kredit: o.sisa });
    const nomor = nextNo('RCV', o.tgl, ctx);
    const rows = jurnalRows({ tanggal: o.tgl, nomor, keterangan: 'Dana ' + lb + ' #' + o.no, sumber: 'RCV', ref: o.f.id, lines });
    ctx.push(...rows);
    return rows;
  }
  async function save() {
    const res = tm.res; if (!res) return;
    const list = res.orders.filter(o => o.on && (o.state === 'ok' || o.state === 'warn'));
    if (!list.length) return;
    if (!akunBy(tm.kas) && !Object.values(KAS_BARU).some(x => x[0] === tm.kas)) return toast('Pilih akun penerima dana', true);
    const btn = $('#tmgo'); btn.disabled = true;
    // Akun yang dipilih tapi belum ada dibuat dulu (hanya akun saran sistem).
    const newAk = [];
    const need = (kode, nama, tipe, kategori) => { if (!akunBy(kode) && !newAk.some(a => a.kode === kode)) newAk.push({ kode, nama, tipe, kategori }); };
    const kb = Object.values(KAS_BARU).find(x => x[0] === tm.kas); if (kb) need(kb[0], kb[1], 'Aset', 'Kas & Bank');
    const usedCats = new Set(); list.forEach(o => Object.keys(o.exp).forEach(k => usedCats.add(k)));
    usedCats.forEach(k => { const c = CATS.find(x => x.k === k); if (tm.akun[k] === c.kode) need(c.kode, c.nama, 'Beban', 'Beban Lain'); });
    const CH = 40; let done = 0, tot = 0;
    try {
      const ctx = [];
      for (let i = 0; i < list.length; i += CH) {
        const part = list.slice(i, i + CH), jr = [], ups = [];
        part.forEach(o => { jr.push(...buildOrder(o, ctx)); ups.push({ sheet: 'Faktur', field: 'id', value: o.f.id, patch: { terbayar: o.f.total } }); });
        btn.textContent = 'Menyimpan ' + Math.min(i + CH, list.length) + ' / ' + list.length + '…';
        await Store.appendMany({ Akun: i === 0 ? newAk : [], Jurnal: jr }, ups);
        ctx.length = 0; // nomor sudah tercatat di S.Jurnal, jangan dihitung ganda
        done += part.length; tot += part.reduce((a, o) => a + o.net, 0);
      }
    } catch (e) {
      toast('Berhenti di tengah jalan: ' + (e.message || e) + '. ' + done + ' dari ' + list.length + ' pesanan sudah tersimpan; sisanya bisa dicatat lagi dengan file yang sama.', true);
      render(); draw(); return;
    }
    const savedMap = {}; FIELDS.forEach(f => { if (tm.map[f.k] >= 0) savedMap[f.k] = I().normH(tm.headers[tm.map[f.k]]); }); lsSet('velqo_terimamap_' + tm.mp, savedMap);
    lsSet('velqo_terimaakun', tm.akun); st.kas = tm.kas;
    const c = res.counts, lb = label();
    render();
    modal('Penerimaan dicatat', `<div class="cards"><div class="card"><div class="l">Pesanan dilunasi</div><div class="v ok">${done}</div></div><div class="card"><div class="l">Dana cair</div><div class="v">${rp(tot)}</div></div></div>
      <p class="mut" style="margin:10px 0 0">Dilewati: ${c.nof} tanpa faktur, ${c.lunas + c.dup} sudah lunas/dicatat, ${c.zero} tanpa dana, ${c.err} galat.${c.nof ? ' Impor pesanan ' + esc(lb) + ' yang belum ada, lalu ulangi dengan file yang sama.' : ''}</p>`,
      '<button class="pri" data-close>Tutup</button>');
    tm = null;
  }

  function terimaModal() {
    const now = today();
    tm = { mp: 'shopee', custom: '', file: '', sheets: null, si: 0, headers: [], data: [], hdr: 0, map: {}, sel: {}, dateMode: 'file', date: now, akun: {}, kas: '', err: '', res: null };
    defaults(); draw();
  }
  window.terimaModal = terimaModal;
  window.VelqoTerima = { compute: () => compute(), state: () => tm, catOf, autoMap, bestHeader };
})();
