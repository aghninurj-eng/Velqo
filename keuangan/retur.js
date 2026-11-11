/*
  Retur penjualan.

  Retur dicatat sebagai transaksi sendiri (nomor RTR/YYYYMM/NNNN) yang menempel pada faktur penjualan, tanpa sheet baru:
    Dr 4150 Retur Penjualan (pengurang pendapatan) + Dr 2200 PPN Keluar (sebanding)
    Cr 1300 Piutang  (sebesar sisa tagihan faktur; faktur ikut berkurang tagihannya)
    Cr Kas/Bank      (sisanya, bila pelanggan sudah membayar: uang dikembalikan)
  Barang yang kembali ke stok: Dr 1500 Persediaan, Cr 5100 HPP sebesar modal saat barang dijual (nilai asli, bukan harga rata-rata sekarang).
  Barang rusak: tidak ada jurnal modal, jadi HPP tetap sebagai kerugian; di Stok tercatat masuk lalu keluar (jenis retur dan rusak) agar jumlah yang sudah diretur terlacak.
  Retur bisa dihapus (jurnal, stok dan tagihan dikembalikan); mengubah retur = hapus lalu catat ulang.
  Bergantung pada keuangan.js.
*/
(function () {
  'use strict';
  const KR = '4150', AK_RETUR = { kode: KR, nama: 'Retur Penjualan', tipe: 'Pendapatan', kategori: 'Pendapatan' };
  const isKas = k => { const a = akunBy(k); return !!a && a.kategori === 'Kas & Bank'; };
  const sum = (a, f) => a.reduce((x, r) => x + f(r), 0);
  const needRetur = () => { if (Store.live && Store.ver < 7) throw new Error('Menghapus retur butuh Code.gs versi 7 atau lebih baru.'); };

  function returGroups(fid) {
    const m = new Map();
    S.Jurnal.filter(j => j.ref === fid && j.sumber === 'RTR').forEach(j => { if (!m.has(j.nomor)) m.set(j.nomor, []); m.get(j.nomor).push(j); });
    return [...m.entries()].map(([nomor, rows]) => {
      const d = k => sum(rows.filter(j => j.kode_akun === k), j => j.debit), c = k => sum(rows.filter(j => j.kode_akun === k), j => j.kredit);
      return { nomor, tanggal: rows[0].tanggal, ket: rows[0].keterangan, R: d(KR), ppn: d(AK.ppnKeluar), piutang: c(AK.piutang), kas: sum(rows.filter(j => isKas(j.kode_akun)), j => j.kredit), stok: S.Stok.filter(s => s.ref === fid && s.nomor === nomor) };
    }).sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.nomor.localeCompare(b.nomor));
  }
  const returKredit = f => sum(returGroups(f.id), g => g.piutang);          // bagian retur yang mengurangi tagihan
  const returBadge = fid => S.Jurnal.some(j => j.ref === fid && j.sumber === 'RTR') ? '<span class="tag warn" title="Ada retur">↩ retur</span>' : '';
  const returRow = f => { const k = returKredit(f); return k > 0.005 ? `<tr><td>Retur (mengurangi tagihan)</td><td class="r">- ${rp(k)}</td></tr>` : ''; };

  // Hitung nilai retur: pendapatan yang dibalik dan modal barang (HPP) menurut harga jual / modal saat faktur dibuat.
  function hitung(f, picks, nominal) {
    const its = S.FakturItem.filter(i => i.faktur_id === f.id), out = { lines: [], R: 0 };
    if (!its.length) {
      const sudah = sum(returGroups(f.id), g => g.R), maks = f.subtotal - sudah;
      if (!(nominal > 0)) return out;
      if (nominal > maks + 0.5) throw new Error('Nilai retur melebihi sisa yang bisa diretur (' + rp(maks) + ')');
      out.R = Math.round(nominal); return out;
    }
    for (const p of picks) {
      if (!(p.qty > 0)) continue;
      const rows = its.filter(i => i.produk_id === p.pid), sold = rq(sum(rows, i => i.qty)), val = sum(rows, i => i.subtotal);
      const rt = S.Stok.filter(s => s.ref === f.id && s.jenis === 'retur' && s.produk_id === p.pid);
      const sisa = rq(sold - sum(rt, s => s.qty));
      if (p.qty > sisa + EPS) throw new Error('Retur ' + produkNama(p.pid) + ' melebihi sisa yang bisa diretur (' + fq(sisa) + ')');
      const jual = S.Stok.filter(s => s.ref === f.id && s.jenis === 'jual' && s.produk_id === p.pid), cq = -sum(jual, s => s.qty), cn = -sum(jual, s => s.nilai);
      const hpp = p.qty >= sisa - EPS ? cn - sum(rt, s => s.nilai) : Math.round(p.qty * cn / cq);
      const rev = Math.round(p.qty * val / sold);
      out.lines.push({ pid: p.pid, qty: rq(p.qty), kondisi: p.kondisi, rev, hpp });
      out.R += rev;
    }
    return out;
  }
  function pecah(f, h) { // pendapatan dibalik + PPN sebanding, lalu dibagi ke piutang dan refund kas
    const ppn = f.subtotal > 0 ? Math.round(h.R * f.ppn / f.subtotal) : 0, total = h.R + ppn;
    const piutang = Math.min(total, Math.max(0, f.total - f.terbayar));
    return { ppn, total, piutang, refund: total - piutang };
  }

  async function buatRetur(f, { tanggal, alasan, picks, nominal, akun_kas }) {
    f = S.Faktur.find(x => x.id === f.id) || f;
    if (f.jenis !== 'penjualan') throw new Error('Retur hanya untuk faktur penjualan');
    if (tanggal < f.tanggal) throw new Error('Tanggal retur tidak boleh sebelum tanggal faktur (' + tgl(f.tanggal) + ')');
    const h = hitung(f, picks, nominal);
    if (!(h.R > 0)) throw new Error('Isi jumlah barang yang diretur' + (S.FakturItem.some(i => i.faktur_id === f.id) ? '' : ' atau nilai retur'));
    const x = pecah(f, h);
    if (x.refund > 0.005 && !akun_kas) throw new Error('Pilih rekening kas/bank untuk pengembalian dana ' + rp(x.refund));
    const nomor = nextNo('RTR', tanggal), restock = sum(h.lines.filter(l => l.kondisi === 'stok'), l => l.hpp);
    const lines = [{ kode: KR, debit: h.R }, { kode: AK.ppnKeluar, debit: x.ppn }, { kode: AK.piutang, kredit: x.piutang }, { kode: akun_kas, kredit: x.refund }, { kode: AK.persediaan, debit: restock }, { kode: AK.pembelian, kredit: restock }].filter(l => num(l.debit) > 0 || num(l.kredit) > 0);
    const jr = jurnalRows({ tanggal, nomor, keterangan: 'Retur penjualan ' + f.nomor + ' - ' + f.pihak + (alasan ? ' - ' + alasan : ''), sumber: 'RTR', ref: f.id, lines });
    const stok = [];
    h.lines.forEach(l => {
      const harga = Math.round(l.hpp / l.qty * 100) / 100;
      stok.push({ id: uid(), tanggal, nomor, produk_id: l.pid, jenis: 'retur', qty: l.qty, harga, nilai: l.hpp, keterangan: 'Retur dari ' + f.pihak + (l.kondisi === 'rusak' ? ' (rusak)' : ''), ref: f.id });
      if (l.kondisi === 'rusak') stok.push({ id: uid(), tanggal, nomor, produk_id: l.pid, jenis: 'rusak', qty: -l.qty, harga, nilai: -l.hpp, keterangan: 'Retur rusak, tidak masuk stok jual', ref: f.id });
    });
    const map = { Akun: akunBaru([AK_RETUR]), Jurnal: jr, Stok: stok };
    const lg = logRow('retur penjualan', nomor, f.nomor + ' ' + f.pihak + ' ' + rp(x.total) + (alasan ? ' (' + alasan + ')' : '')); if (lg) map.Log = [lg];
    await Store.appendMany(map, [{ sheet: 'Faktur', field: 'id', value: f.id, patch: { terbayar: f.terbayar + x.piutang } }]);
  }

  async function hapusRetur(f, nomor) {
    needRetur();
    f = S.Faktur.find(x => x.id === f.id) || f;
    const g = returGroups(f.id).find(x => x.nomor === nomor); if (!g) throw new Error('Retur tidak ditemukan');
    const after = stokMap(S.Stok.filter(s => !(s.ref === f.id && s.nomor === nomor)));
    for (const pid in after) if (after[pid].qty < -EPS) throw new Error('Retur tidak bisa dihapus: stok ' + produkNama(pid) + ' akan minus karena barang hasil retur sudah terjual lagi.');
    const map = {}; const lg = logRow('hapus retur', nomor, f.nomor + ' ' + rp(g.R + g.ppn)); if (lg) map.Log = [lg];
    const removes = [{ sheet: 'Jurnal', field: 'nomor', value: nomor }]; if (g.stok.length) removes.push({ sheet: 'Stok', field: 'nomor', value: nomor });
    await Store.appendMany(map, [{ sheet: 'Faktur', field: 'id', value: f.id, patch: { terbayar: Math.max(0, Math.round(f.terbayar - g.piutang)) } }], removes);
  }

  /* ---------- Tampilan ---------- */
  function returSection(f) {
    const G = returGroups(f.id); if (!G.length) return '';
    return `<h3 style="margin:14px 0 6px">Retur</h3><table>${G.map(g => `<tr><td>${tgl(g.tanggal)}<div class="mut" style="font-size:12px">${esc(g.nomor)}${g.stok.filter(s => s.jenis === 'retur').length ? ' · ' + g.stok.filter(s => s.jenis === 'retur').map(s => esc(produkNama(s.produk_id)) + ' ×' + fq(s.qty) + (g.stok.some(r => r.jenis === 'rusak' && r.produk_id === s.produk_id) ? ' (rusak)' : '')).join(', ') : ''}</div></td>
      <td class="r">${rp(g.R + g.ppn)}<div class="mut" style="font-size:12px">${g.piutang > 0 ? 'kurangi tagihan ' + rp(g.piutang) : ''}${g.piutang > 0 && g.kas > 0 ? ' · ' : ''}${g.kas > 0 ? 'refund ' + rp(g.kas) : ''}</div></td>
      <td class="r pay-act"><button class="sm dan" data-rd="${esc(g.nomor)}">Hapus</button></td></tr>`).join('')}</table>`;
  }
  function bindRetur(f) {
    $$('[data-rd]').forEach(el => el.onclick = () => { if (confirm('Hapus retur ' + el.dataset.rd + '? Pendapatan, stok, dan tagihan faktur kembali seperti sebelum retur.')) run(() => hapusRetur(f, el.dataset.rd), 'Retur dihapus'); });
    if ($('#rtr')) $('#rtr').onclick = () => returForm(f);
  }

  function returForm(f) {
    f = S.Faktur.find(x => x.id === f.id) || f;
    const its = S.FakturItem.filter(i => i.faktur_id === f.id), pids = [...new Set(its.map(i => i.produk_id))];
    if (f.terbayar === 0 && f.total === 0) return toast('Faktur kosong', true);
    const rows = pids.map(pid => {
      const sold = rq(sum(its.filter(i => i.produk_id === pid), i => i.qty)), done = rq(sum(S.Stok.filter(s => s.ref === f.id && s.jenis === 'retur' && s.produk_id === pid), s => s.qty)), p = produkBy(pid);
      return { pid, sold, done, sisa: rq(sold - done), sat: p ? p.satuan : '' };
    });
    const sisaNom = f.subtotal - sum(returGroups(f.id), g => g.R);
    const body = `<form id="rf" class="f">
      <div><label>Tanggal retur</label><input type="date" name="tanggal" value="${today()}" min="${f.tanggal}" required></div>
      <div><label>Alasan (opsional)</label><input name="alasan" maxlength="100" placeholder="mis. barang cacat, salah kirim"></div>
      ${rows.length ? `<div class="full" style="overflow-x:auto"><table><tr><th>Produk</th><th class="r">Terjual</th><th class="r hide-sm">Sudah diretur</th><th class="r">Retur</th><th>Kondisi</th></tr>
        ${rows.map(r => `<tr><td>${esc(produkNama(r.pid))}</td><td class="r">${fq(r.sold)} ${esc(r.sat)}</td><td class="r hide-sm">${fq(r.done)}</td>
          <td class="r"><input type="number" min="0" max="${r.sisa}" step="any" value="0" data-q="${esc(r.pid)}" style="width:80px" class="r" ${r.sisa <= EPS ? 'disabled' : ''}></td>
          <td>${sel('k', [['stok', 'Kembali ke stok'], ['rusak', 'Rusak (tidak dijual lagi)']], 'stok', `data-k="${esc(r.pid)}"`)}</td></tr>`).join('')}</table></div>`
      : `<div class="full"><label>Nilai retur sebelum PPN (maksimal ${rp(sisaNom)})</label><input type="number" name="nominal" min="0" max="${sisaNom}" step="any" value="0"><div class="mut" style="font-size:12px">Faktur ini tanpa daftar barang, jadi stok tidak berubah.</div></div>`}
      <div class="full"><label>Rekening untuk pengembalian dana (dipakai bila pelanggan sudah membayar)</label>${sel('akun_kas', akunOpts(a => a.kategori === 'Kas & Bank'), st.kas)}</div>
      <div class="full" id="rtprev"></div></form>`;
    modal('Retur ' + f.nomor, body, `<button data-close>Batal</button><button class="pri" id="ok">Catat retur</button>`);
    const read = () => {
      const v = Object.fromEntries(new FormData($('#rf')));
      return { tanggal: v.tanggal, alasan: (v.alasan || '').trim(), akun_kas: v.akun_kas, nominal: num(v.nominal), picks: $$('[data-q]').map(el => ({ pid: el.dataset.q, qty: num(el.value), kondisi: ($(`[data-k="${el.dataset.q}"]`) || {}).value || 'stok' })) };
    };
    const prev = () => {
      const a = read(), box = $('#rtprev'); let h;
      try { h = hitung(f, a.picks, a.nominal); } catch (e) { box.innerHTML = `<div class="note">${esc(e.message)}</div>`; return; }
      if (!(h.R > 0)) { box.innerHTML = '<div class="mut">Isi jumlah retur untuk melihat dampaknya.</div>'; return; }
      const x = pecah(f, h), rs = sum(h.lines.filter(l => l.kondisi === 'stok'), l => l.hpp);
      box.innerHTML = `<table><tr><td>Pendapatan dibalik</td><td class="r">${rp(h.R)}</td></tr>${x.ppn ? `<tr><td>PPN dibalik</td><td class="r">${rp(x.ppn)}</td></tr>` : ''}<tr class="t"><td>Total retur</td><td class="r">${rp(x.total)}</td></tr>
        <tr><td>Mengurangi tagihan faktur</td><td class="r">${rp(x.piutang)}</td></tr><tr><td>Dana dikembalikan ke pelanggan</td><td class="r">${rp(x.refund)}</td></tr>${rs ? `<tr><td class="mut">Modal barang kembali ke stok</td><td class="r mut">${rp(rs)}</td></tr>` : ''}</table>`;
    };
    $('#rf').oninput = prev; $('#rf').onchange = prev; prev();
    $('#ok').onclick = () => { if (!$('#rf').reportValidity()) return; const a = read(); run(() => buatRetur(f, a), 'Retur tercatat'); };
  }

  Object.assign(window, { returGroups, returKredit, returBadge, returRow, returSection, bindRetur, returForm, buatRetur, hapusRetur });
})();
