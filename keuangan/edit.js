/*
  Edit transaksi.

  Prinsip: transaksi yang salah diganti utuh. Baris lama (transaksi, jurnal, stok, aset) dihapus dan baris baru dibuat dalam SATU
  permintaan ke Apps Script (Code.gs versi 7: multi + removes), jadi tidak pernah ada kondisi setengah jadi. Jurnal baru dibuat dari
  nol dengan aturan akuntansi yang sama seperti transaksi baru, jadi laporan selalu konsisten.
  Setiap edit atau hapus tercatat di sheet Log (waktu, aksi, nomor, ringkasan).

  Yang bisa diedit: faktur (belum ada pembayaran), pembayaran/penerimaan faktur, kas masuk/keluar/transfer, jurnal manual.
  Aturan penjaga: stok tidak boleh minus, aset yang sudah disusutkan tidak bisa diganti, faktur berbayar harus dihapus
  pembayarannya dulu.
  Bergantung pada keuangan.js.
*/
(function () {
  'use strict';
  const needEdit = () => { if (Store.live && Store.ver < 7) throw new Error('Mengedit transaksi butuh Code.gs versi 7, sedangkan Web App yang aktif ' + (Store.ver ? 'versi ' + Store.ver : 'versi lama') + '. Di Apps Script: Deploy → Manage deployments → ikon pensil → Version: New version → Deploy (URL /exec harus tetap yang sama dengan di Pengaturan), lalu muat ulang halaman dengan Ctrl+Shift+R.'); };
  const sameMonth = (a, b) => a.slice(0, 7) === b.slice(0, 7);
  const rm = (sheet, field, value) => ({ sheet, field, value });
  const withLog = (map, aksi, nomor, detail) => { const l = logRow(aksi, nomor, detail); if (l) map.Log = [l]; return map; };

  /* ---------- Kas masuk / keluar / transfer ---------- */
  async function gantiKas(k, { tanggal, akun_kas, akun_lawan, jumlah, keterangan }) {
    needEdit();
    k = S.KasBank.find(x => x.id === k.id) || k;
    if (akun_kas === akun_lawan) throw new Error('Akun asal dan lawan tidak boleh sama');
    if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari nol');
    const pre = { masuk: 'KM', keluar: 'KK', transfer: 'TF' }[k.jenis];
    const nomor = sameMonth(k.tanggal, tanggal) ? k.nomor : nextNo(pre, tanggal);
    const row = { id: k.id, tanggal, nomor, jenis: k.jenis, akun_kas, akun_lawan, jumlah, keterangan };
    const lines = k.jenis === 'masuk' ? [{ kode: akun_kas, debit: jumlah }, { kode: akun_lawan, kredit: jumlah }] : [{ kode: akun_lawan, debit: jumlah }, { kode: akun_kas, kredit: jumlah }];
    const jr = jurnalRows({ tanggal, nomor, keterangan, sumber: pre, ref: k.id, lines });
    const map = withLog({ KasBank: [row], Jurnal: jr }, 'edit kas', nomor, `${k.keterangan} ${rp(k.jumlah)} → ${keterangan} ${rp(jumlah)}; ${k.tanggal} → ${tanggal}`);
    await Store.appendMany(map, [], [rm('Jurnal', 'ref', k.id), rm('KasBank', 'id', k.id)]);
  }

  /* ---------- Jurnal manual (JU) ---------- */
  async function gantiJurnal(old, { tanggal, keterangan, lines }) {
    needEdit();
    const nomorLama = old[0].nomor, cur = S.Jurnal.filter(j => j.nomor === nomorLama);
    if (!cur.length || cur[0].sumber !== 'JU') throw new Error('Hanya jurnal manual yang bisa diedit di sini');
    const nomor = sameMonth(cur[0].tanggal, tanggal) ? nomorLama : nextNo('JU', tanggal);
    const jr = jurnalRows({ tanggal, nomor, keterangan, sumber: 'JU', lines });
    const map = withLog({ Jurnal: jr }, 'edit jurnal', nomor, `${cur[0].keterangan} ${rp(cur.reduce((a, j) => a + j.debit, 0))} → ${keterangan} ${rp(jr.reduce((a, j) => a + j.debit, 0))}`);
    await Store.appendMany(map, [], [rm('Jurnal', 'nomor', nomorLama)]);
  }

  /* ---------- Pembayaran / penerimaan faktur ---------- */
  const payRowsOf = (f, nomor) => S.Jurnal.filter(j => j.ref === f.id && (j.sumber === 'RCV' || j.sumber === 'PAY') && j.nomor === nomor);
  // Bagian yang melunasi faktur = baris piutang (kredit) atau hutang (debit); baris lain adalah kas, potongan, atau selisih.
  const applied = (f, rows) => rows.filter(j => j.kode_akun === (f.jenis === 'penjualan' ? AK.piutang : AK.hutang)).reduce((a, j) => a + (f.jenis === 'penjualan' ? j.kredit : j.debit), 0);

  async function hapusBayar(f, nomor) {
    needEdit();
    f = S.Faktur.find(x => x.id === f.id) || f;
    const rows = payRowsOf(f, nomor); if (!rows.length) throw new Error('Pembayaran tidak ditemukan');
    const a = applied(f, rows), terbayar = Math.max(0, Math.round(f.terbayar - a));
    const map = withLog({}, 'hapus pembayaran', nomor, `${f.nomor} ${rp(a)}; terbayar ${rp(f.terbayar)} → ${rp(terbayar)}`);
    await Store.appendMany(map, [{ sheet: 'Faktur', field: 'id', value: f.id, patch: { terbayar } }], rows.map(j => rm('Jurnal', 'id', j.id)));
  }

  function bayarEditForm(f, nomor) {
    const rows = payRowsOf(f, nomor), sales = f.jenis === 'penjualan';
    const kas = rows.find(j => { const a = akunBy(j.kode_akun); return a && a.kategori === 'Kas & Bank'; });
    if (rows.length !== 2 || !kas) return toast('Penerimaan massal marketplace tidak bisa diedit. Hapus lalu catat ulang dari Terima Dana Marketplace.', true);
    const a = applied(f, rows), maks = f.total - (f.terbayar - a);
    modal('Edit ' + (sales ? 'penerimaan ' : 'pembayaran ') + nomor, `<form id="pf" class="f">
      <div><label>Tanggal</label><input type="date" name="tanggal" value="${kas.tanggal}" required></div>
      <div><label>${sales ? 'Masuk ke' : 'Dibayar dari'}</label>${sel('akun_kas', akunOpts(x => x.kategori === 'Kas & Bank'), kas.kode_akun)}</div>
      <div class="full"><label>Jumlah (maksimal ${rp(maks)})</label><input type="number" name="jumlah" min="1" max="${maks}" step="any" value="${a}" required></div></form>`,
      `<button data-close>Batal</button><button class="pri" id="ok">Simpan</button>`);
    $('#ok').onclick = () => { const fm = $('#pf'); if (!fm.reportValidity()) return; const v = Object.fromEntries(new FormData(fm)); run(() => gantiBayar(f, nomor, { tanggal: v.tanggal, akun_kas: v.akun_kas, jumlah: num(v.jumlah) }), 'Pembayaran diperbarui'); };
  }
  async function gantiBayar(f, nomor, { tanggal, akun_kas, jumlah }) {
    needEdit();
    f = S.Faktur.find(x => x.id === f.id) || f;
    const old = payRowsOf(f, nomor), sales = f.jenis === 'penjualan';
    if (old.length !== 2) throw new Error('Hanya pembayaran sederhana yang bisa diedit');
    const a = applied(f, old), maks = f.total - (f.terbayar - a);
    if (jumlah <= 0 || jumlah > maks + 0.005) throw new Error('Jumlah melebihi sisa tagihan (maksimal ' + rp(maks) + ')');
    const nn = sameMonth(old[0].tanggal, tanggal) ? nomor : nextNo(sales ? 'RCV' : 'PAY', tanggal);
    const lines = sales ? [{ kode: akun_kas, debit: jumlah }, { kode: AK.piutang, kredit: jumlah }] : [{ kode: AK.hutang, debit: jumlah }, { kode: akun_kas, kredit: jumlah }];
    const jr = jurnalRows({ tanggal, nomor: nn, keterangan: old[0].keterangan, sumber: sales ? 'RCV' : 'PAY', ref: f.id, lines });
    const terbayar = Math.round(f.terbayar - a + jumlah);
    const map = withLog({ Jurnal: jr }, 'edit pembayaran', nn, `${f.nomor} ${rp(a)} → ${rp(jumlah)}; ${old[0].tanggal} → ${tanggal}`);
    await Store.appendMany(map, [{ sheet: 'Faktur', field: 'id', value: f.id, patch: { terbayar } }], old.map(j => rm('Jurnal', 'id', j.id)));
  }

  /* ---------- Faktur ---------- */
  async function gantiFaktur(f, args) {
    needEdit();
    f = S.Faktur.find(x => x.id === f.id) || f;
    if (f.terbayar > 0.005) throw new Error('Faktur sudah ada pembayaran. Hapus pembayarannya dulu, lalu edit faktur.');
    if (S.Aset.some(a => a.faktur_id === f.id && (a.akum > 0 || a.susut_sd))) throw new Error('Aset dari faktur ini sudah disusutkan, faktur tidak bisa diedit');
    const sales = f.jenis === 'penjualan', oldAset = S.Aset.filter(a => a.faktur_id === f.id).sort((a, b) => a.kode.localeCompare(b.kode));
    const sm = stokMap(S.Stok.filter(s => s.ref !== f.id));
    const nomor = sameMonth(f.tanggal, args.tanggal) ? f.nomor : nextNo(sales ? 'INV' : 'BILL', args.tanggal);
    const { f: nf, rows } = buildFaktur({ ...args, jenis: f.jenis, ganti: { id: f.id, nomor } }, { Jurnal: [], Stok: [], sm });
    // Stok akhir tidak boleh minus (mis. pembelian dikurangi padahal barangnya sudah terjual)
    const after = stokMap(S.Stok.filter(s => s.ref !== f.id).concat(rows.Stok));
    for (const pid in after) if (after[pid].qty < -EPS) throw new Error('Perubahan ini membuat stok ' + produkNama(pid) + ' minus karena barangnya sudah terpakai transaksi lain.');
    // Kode aset lama dipertahankan menurut urutan baris
    (rows.Aset || []).forEach((r, i) => { if (oldAset[i]) r.kode = oldAset[i].kode; });
    const removes = [rm('Jurnal', 'ref', f.id), rm('Faktur', 'id', f.id)];
    if (Store.invReady) removes.push(rm('FakturItem', 'faktur_id', f.id), rm('Stok', 'ref', f.id));
    if (Store.biayaReady) removes.push(rm('FakturBiaya', 'faktur_id', f.id));
    if (Store.asetReady) removes.push(rm('Aset', 'faktur_id', f.id));
    withLog(rows, 'edit faktur', nomor, `${f.pihak} ${rp(f.total)} → ${nf.pihak} ${rp(nf.total)}; ${f.tanggal} → ${nf.tanggal}`);
    await Store.appendMany(rows, [], removes);
  }

  Object.assign(window, { gantiKas, gantiJurnal, gantiFaktur, hapusBayar, bayarEditForm });
})();
