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

  function sheetLabaRugi(wb, from, to) {
    const sh = wb.sheet('Laba Rugi', { cols: [12, 46, 20] }), r = labaRugi(from, to);
    header(sh, 3, 'Laporan Laba Rugi', 'Periode ' + fmtTgl(from) + ' s/d ' + fmtTgl(to));
    sh.row([{ v: 'Kode', s: sty.head }, { v: 'Akun', s: sty.head }, { v: 'Jumlah (Rp)', s: sty.headR }]);
    const p = section(sh, 'Pendapatan', r.pend, 3); sh.blank();
    const b = section(sh, 'Beban', r.beban, 3); sh.blank();
    const laba = p.total - b.total;
    sh.row([{ v: '', s: sty.grand }, { v: laba >= 0 ? 'Laba Bersih' : 'Rugi Bersih', s: sty.grand }, { f: `${p.ref}-${b.ref}`, v: laba, s: sty.grandN }]);
    return { pend: p.total, beban: b.total, laba };
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

  function eksporExcel() {
    if (!window.VelqoXlsx) return toast('Modul Excel belum termuat, muat ulang halaman', true);
    const from = st.from, to = st.to;
    if (!from || !to || from > to) return toast('Periode tidak valid: tanggal "Dari" harus sebelum "Sampai"', true);
    try {
      const wb = new VelqoXlsx.Book();
      const sum0 = wb.sheet('Ringkasan', { cols: [34, 22] });
      const lr = sheetLabaRugi(wb, from, to), nr = sheetNeraca(wb, to);
      sheetSaldo(wb, to); sheetBukuBesar(wb, from, to);
      header(sum0, 2, 'Ringkasan Keuangan', 'Laba rugi ' + fmtTgl(from) + ' s/d ' + fmtTgl(to) + ' · Neraca per ' + fmtTgl(to));
      sum0.row([{ v: 'Laba Rugi', s: sty.head }, { v: 'Rp', s: sty.headR }]);
      [['Pendapatan', lr.pend], ['Beban', lr.beban]].forEach(([t, v]) => sum0.row([{ v: t, s: sty.item }, { v, s: sty.num }]));
      sum0.row([{ v: lr.laba >= 0 ? 'Laba Bersih' : 'Rugi Bersih', s: sty.grand }, { v: lr.laba, s: sty.grandN }]);
      sum0.blank(); sum0.row([{ v: 'Neraca', s: sty.head }, { v: 'Rp', s: sty.headR }]);
      [['Total Aset', nr.aset], ['Total Kewajiban', nr.kew], ['Total Ekuitas', nr.eku]].forEach(([t, v]) => sum0.row([{ v: t, s: sty.item }, { v, s: sty.num }]));
      const kas = S.Akun.filter(a => a.kategori === 'Kas & Bank'), m = sums(null, to), kasTot = kas.reduce((x, a) => x + saldo(a, m), 0);
      sum0.blank(); sum0.row([{ v: 'Posisi kas dan bank', s: sty.head }, { v: 'Rp', s: sty.headR }]);
      kas.sort((x, y) => x.kode.localeCompare(y.kode)).forEach(a => sum0.row([{ v: a.kode + ' · ' + a.nama, s: sty.item }, { v: Math.round(saldo(a, m)), s: sty.num }]));
      sum0.row([{ v: 'Total kas dan bank', s: sty.grand }, { v: Math.round(kasTot), s: sty.grandN }]);
      wb.download('Velqo-Laporan-' + from + '-sd-' + to + '.xlsx');
      toast('File Excel diunduh');
    } catch (e) { console.error(e); toast('Gagal membuat file Excel: ' + (e.message || e), true); }
  }
  window.eksporExcel = eksporExcel;
})();
