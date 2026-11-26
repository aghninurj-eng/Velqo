/*
  Ekspor laporan keuangan ke Excel (.xlsx): Ringkasan, Laba Rugi, Neraca, Neraca Saldo, dan Buku Besar dalam satu file.
  Memakai periode yang sedang dipilih di halaman Laporan. Angka dihitung dari jurnal seperti di layar; baris total berupa rumus Excel.
  Bergantung pada keuangan.js (data dan fungsi laporan) dan xlsx.js (penulis file).
*/
(function () {
  'use strict';
  const GREEN = '1F5F4A', LIGHT = 'E3EFEA', MID = 'CFE5DB', MUTED = '5F6B67';
  const sty = {
    title: { b: true, sz: 16, color: GREEN }, sub: { color: MUTED }, subb: { b: true, sz: 12 },
    head: { b: true, color: 'FFFFFF', bg: GREEN, v: 'center', bottom: 'thin', bc: GREEN },
    headR: { b: true, color: 'FFFFFF', bg: GREEN, h: 'right', bottom: 'thin', bc: GREEN },
    sect: { b: true, color: GREEN, bg: LIGHT },
    item: { indent: 1, bottom: 'hair', bc: 'D5DDD9' }, itemKode: { color: MUTED, bottom: 'hair', bc: 'D5DDD9' },
    num: { nf: 'rp', bottom: 'hair', bc: 'D5DDD9' },
    tot: { b: true, top: 'thin', bc: '6B7A75' }, totN: { b: true, nf: 'rp', top: 'thin', bc: '6B7A75' },
    grand: { b: true, bg: MID, top: 'thin', bottom: 'double', bc: GREEN }, grandN: { b: true, bg: MID, nf: 'rp', top: 'thin', bottom: 'double', bc: GREEN },
    note: { i: true, color: MUTED }
  };
  const fmtTgl = s => { const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
  const sum = (a) => a.reduce((x, r) => x + r.s, 0);

  function header(sh, ncol, judul, periode) {
    sh.row([{ v: 'Velqo', s: sty.title, span: ncol }], { h: 24 });
    sh.row([{ v: judul, s: sty.subb, span: ncol }]);
    sh.row([{ v: periode, s: sty.sub, span: ncol }]);
    sh.row([{ v: 'Dicetak ' + fmtTgl(today()), s: sty.sub, span: ncol }]);
    sh.blank();
  }

  // Daftar akun dengan saldo di bawah judul bagian. Mengembalikan { total, ref } untuk dipakai rumus lain.
  function section(sh, judul, rows, ncol) {
    sh.row([{ v: judul, s: sty.sect, span: ncol }]);
    const list = rows.filter(r => Math.round(r.s));
    const first = sh.n + 1;
    list.forEach(r => sh.row([{ v: r.a.kode, s: sty.itemKode }, { v: r.a.nama, s: sty.item }, { v: Math.round(r.s), s: sty.num }]));
    const total = list.reduce((x, r) => x + Math.round(r.s), 0), last = sh.n;
    const n = sh.row([{ v: '', s: sty.tot }, { v: 'Total ' + judul, s: sty.tot }, list.length ? { f: `SUM(C${first}:C${last})`, v: total, s: sty.totN } : { v: 0, s: sty.totN }]);
    return { total, ref: 'C' + n };
  }

  // Susunan mengikuti format laporan Velqo: Beban Pokok Penjualan terpisah dari Beban Operasional.
  function sheetLabaRugi(wb, from, to) {
    const sh = wb.sheet('Laba Rugi', { cols: [52, 20] }), r = labaRugi(from, to);
    sh.row([{ v: 'LAPORAN LABA RUGI', s: sty.title, span: 2 }], { h: 24 });
    sh.row([{ v: namaUsaha(), s: sty.subb, span: 2 }]);
    sh.blank();
    sh.row([{ v: 'Deskripsi', s: sty.head }, { v: periodeLabel(from, to), s: sty.headR }]);
    const lines = (list) => { const first = sh.n + 1; list.forEach(x => sh.row([{ v: x.nama, s: sty.item }, { v: Math.round(x.s), s: sty.num }])); return [first, sh.n]; };
    const sec = (t) => sh.row([{ v: t, s: sty.sect, span: 2 }]);
    const tot = (t, f, v) => sh.row([{ v: t, s: sty.tot }, { f, v, s: sty.totN }]);
    const R = x => Math.round(x), sm = l => l.reduce((x, y) => x + R(y.s), 0);
    sec('Pendapatan'); const [p1, p2] = lines(r.dp); const jp = sm(r.dp), np = tot('Jumlah Pendapatan', `SUM(B${p1}:B${p2})`, jp);
    sh.blank(); sec('BEBAN POKOK PENJUALAN');
    let jh = 0, nh;
    if (r.hpp.length) { const [h1, h2] = lines(r.hpp); jh = sm(r.hpp); nh = tot('Jumlah Beban Pokok Penjualan', `SUM(B${h1}:B${h2})`, jh); } else nh = tot('Jumlah Beban Pokok Penjualan', '0', 0);
    sh.blank(); const kotor = jp - jh;
    const nk = sh.row([{ v: 'LABA KOTOR', s: sty.grand }, { f: `B${np}-B${nh}`, v: kotor, s: sty.grandN }]);
    sh.blank(); sec('Beban Operasional');
    let jo = 0, no;
    if (r.opr.length) { const [o1, o2] = lines(r.opr); jo = sm(r.opr); no = tot('Jumlah Beban Operasional', `SUM(B${o1}:B${o2})`, jo); } else no = tot('Jumlah Beban Operasional', '0', 0);
    sh.blank(); const laba = kotor - jo;
    sh.row([{ v: laba >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH', s: sty.grand }, { f: `B${nk}-B${no}`, v: laba, s: sty.grandN }]);
    return { pend: jp, hpp: jh, kotor, beban: jh + jo, opr: jo, laba };
  }

  function sheetNeraca(wb, to) {
    const sh = wb.sheet('Neraca', { cols: [12, 46, 20] }), m = sums(null, to);
    const A = byTipe('Aset', m), K = byTipe('Kewajiban', m), E = byTipe('Ekuitas', m), lr = labaRugi(null, to);
    header(sh, 3, 'Neraca', 'Per ' + fmtTgl(to));
    sh.row([{ v: 'Kode', s: sty.head }, { v: 'Akun', s: sty.head }, { v: 'Jumlah (Rp)', s: sty.headR }]);
    const a = section(sh, 'Aset', A, 3); sh.blank();
    const k = section(sh, 'Kewajiban', K, 3); sh.blank();
    // Ekuitas: akun modal + laba (rugi) berjalan
    sh.row([{ v: 'Ekuitas', s: sty.sect, span: 3 }]);
    const el = E.filter(x => Math.round(x.s)), first = sh.n + 1;
    el.forEach(x => sh.row([{ v: x.a.kode, s: sty.itemKode }, { v: x.a.nama, s: sty.item }, { v: Math.round(x.s), s: sty.num }]));
    sh.row([{ v: '', s: sty.itemKode }, { v: 'Laba (rugi) berjalan', s: sty.item }, { v: Math.round(lr.laba), s: sty.num }]);
    const last = sh.n, eTotal = el.reduce((x, y) => x + Math.round(y.s), 0) + Math.round(lr.laba);
    const en = sh.row([{ v: '', s: sty.tot }, { v: 'Total Ekuitas', s: sty.tot }, { f: `SUM(C${first}:C${last})`, v: eTotal, s: sty.totN }]);
    sh.blank();
    const ke = k.total + eTotal;
    const kn = sh.row([{ v: '', s: sty.grand }, { v: 'Total Kewajiban + Ekuitas', s: sty.grand }, { f: `${k.ref}+C${en}`, v: ke, s: sty.grandN }]);
    sh.row([{ v: '', s: sty.grand }, { v: 'Total Aset', s: sty.grand }, { f: a.ref, v: a.total, s: sty.grandN }]);
    sh.blank();
    const diff = a.total - ke;
    sh.row([{ v: 'Selisih (harus 0)', s: sty.note, span: 2 }, { f: `${a.ref}-C${kn}`, v: diff, s: { nf: 'rp', i: true, color: MUTED } }]);
    return { aset: a.total, kew: k.total, eku: eTotal };
  }

  function sheetSaldo(wb, to) {
    const sh = wb.sheet('Neraca Saldo', { cols: [12, 46, 20, 20], freeze: 6 }), m = sums(null, to);
    header(sh, 4, 'Neraca Saldo', 'Per ' + fmtTgl(to));
    sh.row([{ v: 'Kode', s: sty.head }, { v: 'Akun', s: sty.head }, { v: 'Debit (Rp)', s: sty.headR }, { v: 'Kredit (Rp)', s: sty.headR }]);
    const first = sh.n + 1; let td = 0, tk = 0;
    S.Akun.slice().sort((x, y) => x.kode.localeCompare(y.kode)).forEach(a => {
      const o = m[a.kode] || { d: 0, k: 0 }, net = Math.round(o.d - o.k); if (!net) return;
      const d = net > 0 ? net : 0, k = net < 0 ? -net : 0; td += d; tk += k;
      sh.row([{ v: a.kode, s: sty.itemKode }, { v: a.nama, s: sty.item }, { v: d || '', s: sty.num }, { v: k || '', s: sty.num }]);
    });
    const last = sh.n;
    sh.row([{ v: '', s: sty.grand }, { v: 'Total', s: sty.grand }, { f: `SUM(C${first}:C${last})`, v: td, s: sty.grandN }, { f: `SUM(D${first}:D${last})`, v: tk, s: sty.grandN }]);
  }

  function sheetBukuBesar(wb, from, to) {
    const sh = wb.sheet('Buku Besar', { cols: [12, 20, 44, 16, 16, 18], freeze: 6, landscape: true });
    header(sh, 6, 'Buku Besar', 'Periode ' + fmtTgl(from) + ' s/d ' + fmtTgl(to));
    sh.row([{ v: 'Tanggal', s: sty.head }, { v: 'Nomor', s: sty.head }, { v: 'Keterangan', s: sty.head }, { v: 'Debit (Rp)', s: sty.headR }, { v: 'Kredit (Rp)', s: sty.headR }, { v: 'Saldo (Rp)', s: sty.headR }]);
    let n = 0;
    S.Akun.slice().sort((x, y) => x.kode.localeCompare(y.kode)).forEach(a => {
      const dn = DEBIT_NORMAL[a.tipe], sg = j => dn ? j.debit - j.kredit : j.kredit - j.debit;
      const before = S.Jurnal.filter(j => j.kode_akun === a.kode && j.tanggal < from).reduce((x, j) => x + sg(j), 0);
      const mv = S.Jurnal.filter(j => j.kode_akun === a.kode && j.tanggal >= from && j.tanggal <= to).sort((x, y) => x.tanggal.localeCompare(y.tanggal) || x.id.localeCompare(y.id));
      if (!Math.round(before) && !mv.length) return;
      if (n++) sh.blank();
      sh.row([{ v: a.kode + ' · ' + a.nama + '  (' + a.tipe + ')', s: sty.sect, span: 6 }]);
      let run = Math.round(before), prev = sh.row([{ v: '', s: sty.item }, { v: '', s: sty.item }, { v: 'Saldo awal', s: { i: true, indent: 1, bottom: 'hair', bc: 'D5DDD9' } }, { v: '', s: sty.num }, { v: '', s: sty.num }, { v: run, s: sty.num }]);
      const first = prev + 1; let td = 0, tk = 0;
      mv.forEach(j => {
        const rn = sh.n + 1, d = Math.round(j.debit), k = Math.round(j.kredit); run += dn ? d - k : k - d; td += d; tk += k;
        const r = sh.row([{ d: j.tanggal, s: { bottom: 'hair', bc: 'D5DDD9' } }, { v: j.nomor, s: sty.itemKode }, { v: j.keterangan, s: { bottom: 'hair', bc: 'D5DDD9' } }, { v: d || '', s: sty.num }, { v: k || '', s: sty.num },
          { f: `F${prev}` + (dn ? `+D${rn}-E${rn}` : `+E${rn}-D${rn}`), v: run, s: sty.num }]);
        prev = r;
      });
      const last = sh.n;
      sh.row([{ v: '', s: sty.tot }, { v: '', s: sty.tot }, { v: 'Saldo akhir ' + fmtTgl(to), s: sty.tot },
        mv.length ? { f: `SUM(D${first}:D${last})`, v: td, s: sty.totN } : { v: 0, s: sty.totN }, mv.length ? { f: `SUM(E${first}:E${last})`, v: tk, s: sty.totN } : { v: 0, s: sty.totN }, { f: `F${prev}`, v: run, s: sty.totN }]);
    });
    if (!n) sh.row([{ v: 'Tidak ada transaksi pada periode ini.', s: sty.note, span: 6 }]);
  }

  const LAP = [['semua', 'Semua laporan keuangan (satu file, semua lembar)'], ['labarugi', 'Laba Rugi saja'], ['neraca', 'Neraca saja'], ['saldo', 'Neraca Saldo saja'], ['bukubesar', 'Buku Besar saja']];
  const NAMA = { labarugi: 'Laba-Rugi', neraca: 'Neraca', saldo: 'Neraca-Saldo', bukubesar: 'Buku-Besar', semua: 'Laporan' };

  function bangun(mode, from, to) {
    const wb = new VelqoXlsx.Book(), semua = mode === 'semua';
    let lr, nr;
    if (semua) {
      const sum0 = wb.sheet('Ringkasan', { cols: [34, 22] });
      lr = sheetLabaRugi(wb, from, to); nr = sheetNeraca(wb, to); sheetSaldo(wb, to); sheetBukuBesar(wb, from, to);
      header(sum0, 2, 'Ringkasan Keuangan', 'Laba rugi ' + fmtTgl(from) + ' s/d ' + fmtTgl(to) + ' · Neraca per ' + fmtTgl(to));
      sum0.row([{ v: 'Laba Rugi', s: sty.head }, { v: 'Rp', s: sty.headR }]);
      [['Pendapatan', lr.pend], ['Beban Pokok Penjualan', lr.hpp], ['Laba Kotor', lr.kotor], ['Beban Operasional', lr.opr]].forEach(([t, v]) => sum0.row([{ v: t, s: sty.item }, { v, s: sty.num }]));
      sum0.row([{ v: lr.laba >= 0 ? 'Laba Bersih' : 'Rugi Bersih', s: sty.grand }, { v: lr.laba, s: sty.grandN }]);
      sum0.blank(); sum0.row([{ v: 'Neraca', s: sty.head }, { v: 'Rp', s: sty.headR }]);
      [['Total Aset', nr.aset], ['Total Kewajiban', nr.kew], ['Total Ekuitas', nr.eku]].forEach(([t, v]) => sum0.row([{ v: t, s: sty.item }, { v, s: sty.num }]));
      const kas = S.Akun.filter(a => a.kategori === 'Kas & Bank'), m = sums(null, to), kasTot = kas.reduce((x, a) => x + saldo(a, m), 0);
      sum0.blank(); sum0.row([{ v: 'Posisi kas dan bank', s: sty.head }, { v: 'Rp', s: sty.headR }]);
      kas.sort((x, y) => x.kode.localeCompare(y.kode)).forEach(a => sum0.row([{ v: a.kode + ' · ' + a.nama, s: sty.item }, { v: Math.round(saldo(a, m)), s: sty.num }]));
      sum0.row([{ v: 'Total kas dan bank', s: sty.grand }, { v: Math.round(kasTot), s: sty.grandN }]);
    } else if (mode === 'labarugi') sheetLabaRugi(wb, from, to);
    else if (mode === 'neraca') sheetNeraca(wb, to);
    else if (mode === 'saldo') sheetSaldo(wb, to);
    else sheetBukuBesar(wb, from, to);
    return wb;
  }

  function unduh(mode) {
    if (!window.VelqoXlsx) return toast('Modul Excel belum termuat, muat ulang halaman', true);
    const from = st.from, to = st.to;
    if (!from || !to || from > to) return toast('Periode tidak valid: tanggal "Dari" harus sebelum "Sampai"', true);
    try {
      bangun(mode, from, to).download('Velqo-' + NAMA[mode] + '-' + (mode === 'neraca' || mode === 'saldo' ? 'per-' + to : from + '-sd-' + to) + '.xlsx');
      toast('File Excel diunduh');
    } catch (e) { console.error(e); toast('Gagal membuat file Excel: ' + (e.message || e), true); }
  }

  // Tanpa argumen: tampilkan pilihan (semua laporan atau satu laporan). Dengan argumen: langsung unduh.
  function eksporExcel(mode) {
    if (mode) return unduh(mode);
    modal('Unduh Excel', `<form id="xf" class="f"><div class="full"><label>Laporan yang diunduh</label>${LAP.map(([k, t]) => `<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:6px 0"><input type="radio" name="lap" value="${k}" ${k === 'semua' ? 'checked' : ''} style="width:auto"> ${t}</label>`).join('')}</div>
      <div class="full mut">Periode: ${fmtTgl(st.from)} s/d ${fmtTgl(st.to)} (sesuai pilihan di halaman Laporan)</div></form>`,
      '<button data-close>Batal</button><button class="pri" id="xgo">Unduh</button>');
    $('#xgo').onclick = () => { const v = (new FormData($('#xf'))).get('lap') || 'semua'; dlg.close(); unduh(v); };
  }

  /* Persediaan: lembar "Stok" (posisi per produk) dan "Mutasi Stok" (kartu stok semua produk dengan saldo berjalan).
     Dengan produkId, hanya produk itu yang diunduh. */
  function eksporPersediaan(produkId) {
    if (!window.VelqoXlsx) return toast('Modul Excel belum termuat, muat ulang halaman', true);
    try {
      const wb = new VelqoXlsx.Book(), m = stokMap();
      const prods = S.Produk.filter(p => !produkId || p.id === produkId).sort((a, b) => a.kode.localeCompare(b.kode));
      const jenisTag = { beli: 'Pembelian', jual: 'Penjualan', adj: 'Penyesuaian', retur: 'Retur penjualan', rusak: 'Retur rusak' };
      const sh = wb.sheet('Stok', { cols: [14, 40, 10, 12, 18, 18, 14], freeze: 6 });
      header(sh, 7, 'Persediaan' + (produkId && prods[0] ? ' · ' + prods[0].nama : ''), 'Posisi per ' + fmtTgl(today()));
      sh.row([{ v: 'Kode', s: sty.head }, { v: 'Produk', s: sty.head }, { v: 'Satuan', s: sty.head }, { v: 'Stok', s: sty.headR }, { v: 'Harga rata-rata', s: sty.headR }, { v: 'Nilai (Rp)', s: sty.headR }, { v: 'Status', s: sty.head }]);
      const first = sh.n + 1; let tn = 0;
      prods.forEach(p => {
        const o = stokOf(p.id, m), habis = o.qty <= EPS, tipis = !habis && p.stok_min > 0 && o.qty <= p.stok_min, nl = Math.round(o.nilai); tn += nl;
        sh.row([{ v: p.kode, s: sty.itemKode }, { v: p.nama, s: sty.item }, { v: p.satuan, s: sty.item }, { v: +o.qty.toFixed(4), s: { ...sty.num, nf: '#,##0.####' } }, { v: o.qty > EPS ? Math.round(o.avg) : 0, s: sty.num }, { v: nl, s: sty.num }, { v: habis ? 'Habis' : tipis ? 'Menipis' : 'Tersedia', s: sty.item }]);
      });
      const last = sh.n;
      sh.row([{ v: '', s: sty.grand }, { v: 'Total nilai persediaan', s: sty.grand }, { v: '', s: sty.grand }, { v: '', s: sty.grand }, { v: '', s: sty.grand }, prods.length ? { f: `SUM(F${first}:F${last})`, v: tn, s: sty.grandN } : { v: 0, s: sty.grandN }, { v: '', s: sty.grand }]);

      const mv = wb.sheet('Mutasi Stok', { cols: [12, 14, 36, 16, 14, 14, 16, 16, 18], freeze: 6, landscape: true });
      header(mv, 9, 'Mutasi Stok (Kartu Stok)', 'Semua pergerakan stok, dicetak ' + fmtTgl(today()));
      mv.row([{ v: 'Tanggal', s: sty.head }, { v: 'Nomor', s: sty.head }, { v: 'Keterangan', s: sty.head }, { v: 'Jenis', s: sty.head }, { v: 'Masuk', s: sty.headR }, { v: 'Keluar', s: sty.headR }, { v: 'Nilai (Rp)', s: sty.headR }, { v: 'Saldo qty', s: sty.headR }, { v: 'Saldo nilai (Rp)', s: sty.headR }]);
      let n = 0; const qf = { ...sty.num, nf: '#,##0.####' };
      prods.forEach(p => {
        const rows = S.Stok.filter(x => x.produk_id === p.id).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
        if (!rows.length) return;
        if (n++) mv.blank();
        mv.row([{ v: p.kode + ' · ' + p.nama + '  (' + p.satuan + ')', s: sty.sect, span: 9 }]);
        let rqty = 0, rnil = 0;
        rows.forEach(x => {
          rqty = rq(rqty + x.qty); rnil += x.nilai;
          mv.row([{ d: x.tanggal, s: { bottom: 'hair', bc: 'D5DDD9' } }, { v: x.nomor, s: sty.itemKode }, { v: x.keterangan || '', s: sty.item }, { v: jenisTag[x.jenis] || x.jenis, s: sty.item },
            { v: x.qty > 0 ? +x.qty.toFixed(4) : '', s: qf }, { v: x.qty < 0 ? +(-x.qty).toFixed(4) : '', s: qf }, { v: Math.round(x.nilai), s: sty.num }, { v: +rqty.toFixed(4), s: qf }, { v: Math.round(rnil), s: sty.num }]);
        });
      });
      if (!n) mv.row([{ v: 'Belum ada mutasi stok.', s: sty.note, span: 9 }]);
      wb.download('Velqo-Persediaan' + (produkId && prods[0] ? '-' + prods[0].kode : '') + '-' + today() + '.xlsx');
      toast('File Excel diunduh');
    } catch (e) { console.error(e); toast('Gagal membuat file Excel: ' + (e.message || e), true); }
  }

  // Kas & Bank: mutasi rekening yang sedang dipilih, mengikuti filter tanggal dan pencarian di layar, dengan saldo awal.
  function eksporKas() {
    if (!window.VelqoXlsx) return toast('Modul Excel belum termuat, muat ulang halaman', true);
    const a = akunBy(st.kas); if (!a) return toast('Pilih rekening kas/bank dulu', true);
    try {
      const rows = S.Jurnal.filter(j => j.kode_akun === a.kode).sort((x, y) => x.tanggal.localeCompare(y.tanggal) || x.id.localeCompare(y.id));
      const kq = st.kq.trim().toLowerCase(), before = rows.filter(j => st.kf && j.tanggal < st.kf).reduce((x, j) => x + j.debit - j.kredit, 0);
      const sel_ = rows.filter(j => (!st.kf || j.tanggal >= st.kf) && (!st.kt || j.tanggal <= st.kt) && (!kq || (j.nomor + ' ' + j.keterangan + ' ' + (j.sumber || '')).toLowerCase().includes(kq)));
      const wb = new VelqoXlsx.Book(), sh = wb.sheet('Mutasi Kas', { cols: [12, 20, 46, 16, 16, 18], freeze: 6 });
      header(sh, 6, 'Mutasi ' + a.kode + ' · ' + a.nama, (st.kf || st.kt ? 'Periode ' + (st.kf ? fmtTgl(st.kf) : 'awal') + ' s/d ' + (st.kt ? fmtTgl(st.kt) : 'sekarang') : 'Semua periode') + (kq ? ' · pencarian "' + st.kq.trim() + '"' : ''));
      sh.row([{ v: 'Tanggal', s: sty.head }, { v: 'Nomor', s: sty.head }, { v: 'Keterangan', s: sty.head }, { v: 'Masuk (Rp)', s: sty.headR }, { v: 'Keluar (Rp)', s: sty.headR }, { v: 'Saldo (Rp)', s: sty.headR }]);
      let run = Math.round(before), prev;
      if (st.kf && !kq) prev = sh.row([{ v: '', s: sty.item }, { v: '', s: sty.item }, { v: 'Saldo awal', s: { i: true, indent: 1, bottom: 'hair', bc: 'D5DDD9' } }, { v: '', s: sty.num }, { v: '', s: sty.num }, { v: run, s: sty.num }]);
      // Bila disaring kata kunci, saldo berjalan tetap saldo rekening sebenarnya (bukan hanya baris yang cocok).
      const first = sh.n + 1; let td = 0, tk = 0;
      const all = rows.map(j => ({ j, bal: 0 })); let b = 0; all.forEach(r => { b += r.j.debit - r.j.kredit; r.bal = b; });
      const balOf = new Map(all.map(r => [r.j.id, r.bal]));
      sel_.forEach(j => { td += j.debit; tk += j.kredit; sh.row([{ d: j.tanggal, s: { bottom: 'hair', bc: 'D5DDD9' } }, { v: j.nomor, s: sty.itemKode }, { v: j.keterangan, s: { bottom: 'hair', bc: 'D5DDD9' } }, { v: Math.round(j.debit) || '', s: sty.num }, { v: Math.round(j.kredit) || '', s: sty.num }, { v: Math.round(balOf.get(j.id)), s: sty.num }]); });
      const last = sh.n;
      sh.row([{ v: '', s: sty.grand }, { v: '', s: sty.grand }, { v: 'Total', s: sty.grand }, sel_.length ? { f: `SUM(D${first}:D${last})`, v: Math.round(td), s: sty.grandN } : { v: 0, s: sty.grandN }, sel_.length ? { f: `SUM(E${first}:E${last})`, v: Math.round(tk), s: sty.grandN } : { v: 0, s: sty.grandN }, { v: sel_.length ? Math.round(balOf.get(sel_[sel_.length - 1].id)) : run, s: sty.grandN }]);
      void prev;
      wb.download('Velqo-Kas-' + a.kode + '-' + today() + '.xlsx');
      toast('File Excel diunduh');
    } catch (e) { console.error(e); toast('Gagal membuat file Excel: ' + (e.message || e), true); }
  }
  window.eksporPersediaan = eksporPersediaan; window.eksporKas = eksporKas;
  window.eksporExcel = eksporExcel;
})();
