/*
  Pesanan sampel / affiliate.

  Pesanan marketplace yang barangnya dikirim gratis (sampel untuk affiliate) dan pembeli hanya membayar ongkir bukan penjualan.
  Dicatat sebagai "faktur sampel" bernomor SMP/YYYYMM/NNNN, total Rp 0, tanpa piutang:
    Dr 5750 Beban Sampel & Affiliate, Cr 1500 Persediaan  (sebesar modal rata-rata barang; bukan HPP, jadi laba kotor penjualan tidak terdistorsi)
  Dana ongkir dari marketplace dicatat saat Terima Dana Marketplace (terima.js): Dr Saldo marketplace, Cr Beban Ongkos Kirim (atau sebaliknya
  bila dana cair negatif), jadi nomor pesanan tetap terlacak dan tidak dobel.
  Cara masuknya: otomatis saat impor pesanan (nilai barang di bawah batas), manual lewat tombol "Pesanan sampel", atau mengubah faktur
  penjualan yang sudah masuk lewat "Jadikan sampel".
  Bergantung pada keuangan.js.
*/
(function () {
  'use strict';
  const MPS = [['Shopee', 'Shopee'], ['TikTok Shop', 'TikTok Shop'], ['', 'Marketplace lain']];
  const sum = (a, f) => a.reduce((x, r) => x + f(r), 0);
  const bdl = () => { try { return JSON.parse(localStorage.getItem('velqo_bundel') || '{}') || {}; } catch (e) { return {}; } };
  // Akun beban untuk sampel: pilihan sendiri (mis. Beban Sampel, Affiliate, Sponsor). Pilihan terakhir diingat di peramban.
  const akunSampelOpts = () => { const l = S.Akun.filter(a => a.tipe === 'Beban').sort((a, b) => a.kode.localeCompare(b.kode)).map(a => [a.kode, a.kode + ' · ' + a.nama]); if (!S.Akun.some(a => a.kode === AK.sampel)) l.unshift([AK.sampel, AK.sampel + ' · ' + AK_SAMPEL.nama + ' (akan dibuat)']); return l; };
  const akunSampelDef = () => { let v = ''; try { v = localStorage.getItem('velqo_akunsampel') || ''; } catch (e) { /* tanpa penyimpanan */ } return akunSampelOpts().some(o => o[0] === v) ? v : AK.sampel; };
  const akunSampelSimpan = k => { try { localStorage.setItem('velqo_akunsampel', k); } catch (e) { /* tanpa penyimpanan */ } };
  const akunSampelDari = f => { const j = S.Jurnal.find(x => x.ref === f.id && x.sumber === 'SMP' && x.debit > 0); return j ? j.kode_akun : AK.sampel; };
  const modalSampel = f => -sum(S.Stok.filter(s => s.ref === f.id && s.jenis === 'jual'), s => s.nilai);
  const hasRetur = f => S.Jurnal.some(j => j.ref === f.id && j.sumber === 'RTR');

  const sampelBadge = f => isSampel(f) ? '<span class="tag" title="Sampel / affiliate, bukan penjualan">🎁 sampel</span>' : '';
  const sampelNote = f => isSampel(f) ? `<div class="note" style="margin:12px 0 0">🎁 Pesanan sampel / affiliate: barang keluar tanpa penjualan. Modal barang ${rp(modalSampel(f))} dicatat sebagai <b>${esc(akunNama(akunSampelDari(f)))}</b>, bukan HPP. Dana dari marketplace (biasanya hanya ongkir) dicatat lewat <b>Terima Dana Marketplace</b>. ${S.Jurnal.some(x => x.ref === f.id && x.sumber === 'SMP') ? '<button class="sm" id="smpak">Ganti akun beban</button>' : ''}</div>` : '';
  const sampelBtn = f => (!isSampel(f) && Store.invReady && f.terbayar === 0 && !hasRetur(f) && S.FakturItem.some(i => i.faktur_id === f.id)) ? '<button id="smp" title="Ubah faktur ini menjadi pesanan sampel (bukan penjualan)">Jadikan sampel</button>' : '';
  function bindSampel(f) {
    if ($('#smp')) $('#smp').onclick = () => modal('Jadikan sampel: ' + f.nomor, `<p style="margin:0 0 10px">Pendapatan ${rp(f.total)} dibatalkan dan tagihannya dihapus. Modal barang dicatat sebagai beban (bukan HPP) dan nomor faktur berganti menjadi SMP/….</p>
      <div class="f"><div class="full"><label>Bebankan ke akun</label>${sel('akun', akunSampelOpts(), akunSampelDef())}</div></div>`, `<button data-close>Batal</button><button class="pri" id="ok">Jadikan sampel</button>`) || ($('#ok').onclick = () => { const k = $('[name=akun]').value; akunSampelSimpan(k); run(() => jadikanSampel(f, k), 'Faktur diubah menjadi pesanan sampel'); });
    if ($('#smpak')) $('#smpak').onclick = () => modal('Ganti akun beban: ' + f.nomor, `<div class="f"><div class="full"><label>Bebankan ke akun</label>${sel('akun', akunSampelOpts(), akunSampelDari(f))}</div></div>`, `<button data-close>Batal</button><button class="pri" id="ok">Simpan</button>`) || ($('#ok').onclick = () => { const k = $('[name=akun]').value; akunSampelSimpan(k); run(() => gantiAkunSampel(f, k), 'Akun beban diganti'); });
  }

  async function gantiAkunSampel(f, kode) {
    const j = S.Jurnal.find(x => x.ref === f.id && x.sumber === 'SMP' && x.debit > 0); if (!j) throw new Error('Faktur ini tidak punya jurnal beban sampel (modal barang Rp 0)');
    if (kode !== AK.sampel && !(akunBy(kode) && akunBy(kode).tipe === 'Beban')) throw new Error('Pilih akun bertipe Beban');
    const baru = kode === AK.sampel ? akunBaru([AK_SAMPEL]) : [];
    if (baru.length) await Store.append('Akun', baru);
    const lama = akunNama(j.kode_akun);
    await Store.update('Jurnal', 'id', j.id, { kode_akun: kode });
    await catat('ganti akun sampel', f.nomor, lama + ' → ' + (akunBy(kode) ? akunNama(kode) : AK_SAMPEL.nama));
  }
  async function jadikanSampel(f, akun) {
    if (Store.live && Store.ver < 7) throw new Error('Butuh Code.gs versi 7 atau lebih baru (lihat Pengaturan).');
    f = S.Faktur.find(x => x.id === f.id) || f;
    if (f.jenis !== 'penjualan' || isSampel(f)) throw new Error('Hanya faktur penjualan biasa yang bisa dijadikan sampel');
    if (f.terbayar > 0.005) throw new Error('Faktur sudah ada pembayaran. Hapus pembayarannya dulu.');
    if (hasRetur(f)) throw new Error('Faktur ini punya retur. Hapus returnya dulu.');
    const its = S.FakturItem.filter(i => i.faktur_id === f.id); if (!its.length) throw new Error('Faktur tanpa daftar barang tidak bisa dijadikan sampel');
    const sm = stokMap(S.Stok.filter(s => s.ref !== f.id));
    const { f: nf, rows } = buildFaktur({ jenis: 'penjualan', sampel: true, tanggal: f.tanggal, jatuh_tempo: f.jatuh_tempo, pihak: f.pihak, keterangan: f.keterangan, items: its.map(i => ({ produk_id: i.produk_id, qty: i.qty })), akunSampel: akun, ganti: { id: f.id, nomor: nextNo('SMP', f.tanggal) } }, { Jurnal: [], Stok: [], sm });
    const rm = (sheet, field, value) => ({ sheet, field, value });
    const removes = [rm('Jurnal', 'ref', f.id), rm('Faktur', 'id', f.id), rm('FakturItem', 'faktur_id', f.id), rm('Stok', 'ref', f.id)];
    const lg = logRow('jadikan sampel', nf.nomor, f.nomor + ' ' + f.pihak + ' ' + rp(f.total) + ' → sampel'); if (lg) rows.Log = [lg];
    await Store.appendMany(rows, [], removes);
  }

  /* ---------- Catat manual ---------- */
  function sampelForm() {
    if (!Store.invReady || !S.Produk.length) return toast('Pesanan sampel butuh daftar produk di Persediaan (stok dikurangi dari sana).', true);
    const B = Object.values(bdl()).filter(b => b && b.items && b.items.length);
    const opts = [['', '— pilih produk —'], ...S.Produk.slice().sort((a, b) => String(a.kode).localeCompare(String(b.kode))).map(p => ['p:' + p.id, p.kode + ' · ' + p.nama]), ...B.map(b => ['b:' + b.sku.toLowerCase(), 'Bundel · ' + b.sku])];
    const row = () => `<tr class="sr"><td>${sel('pr', opts, '')}</td><td class="r"><input type="number" name="qty" min="0" step="any" value="1" style="width:80px" class="r"></td><td><button type="button" class="sm" data-x>×</button></td></tr>`;
    modal('Pesanan sampel / affiliate', `<form id="sf" class="f">
      <div class="full mut" style="margin:0 0 4px">Untuk pesanan yang barangnya dikirim gratis ke affiliate dan pembeli hanya membayar ongkir. Barang keluar dari stok dan modalnya dicatat sebagai Beban Sampel & Affiliate, bukan penjualan.</div>
      <div><label>Marketplace</label>${sel('mp', MPS, 'Shopee', 'id="smp-mp"')}<input id="smp-cu" name="custom" placeholder="Nama marketplace" style="margin-top:6px;display:none"></div>
      <div><label>No. pesanan</label><input name="no" required placeholder="persis seperti di marketplace"></div>
      <div><label>Tanggal</label><input type="date" name="tanggal" value="${today()}" required></div>
      <div><label>Penerima / affiliate (opsional)</label><input name="penerima" maxlength="60"></div>
      <div><label>No. resi (opsional)</label><input name="resi" maxlength="40"></div>
      <div class="full"><label>Bebankan ke akun</label>${sel('akun', akunSampelOpts(), akunSampelDef())}</div>
      <div class="full" style="overflow-x:auto"><table id="smp-t"><tr><th>Barang</th><th class="r">Jumlah</th><th></th></tr>${row()}</table><button type="button" class="sm" id="smp-add" style="margin-top:6px">+ Barang</button></div></form>`,
      `<button data-close>Batal</button><button class="pri" id="ok">Catat sampel</button>`);
    const t = $('#smp-t');
    $('#smp-add').onclick = () => t.insertAdjacentHTML('beforeend', row());
    t.onclick = e => { if (e.target.matches('[data-x]') && $$('.sr', t).length > 1) e.target.closest('tr').remove(); };
    $('#smp-mp').onchange = e => { $('#smp-cu').style.display = e.target.value ? 'none' : 'block'; };
    $('#ok').onclick = () => {
      const fm = $('#sf'); if (!fm.reportValidity()) return; const v = Object.fromEntries(new FormData(fm));
      const label = v.mp || (v.custom || '').trim() || 'Marketplace';
      const items = [];
      for (const tr of $$('.sr', t)) {
        const pr = $('[name=pr]', tr).value, qty = num($('[name=qty]', tr).value); if (!pr || !(qty > 0)) continue;
        if (pr.startsWith('p:')) items.push({ produk_id: pr.slice(2), qty });
        else { const b = bdl()[pr.slice(2)]; (b ? b.items : []).forEach(c => items.push({ produk_id: c.pid, qty: rq(qty * c.qty) })); }
      }
      if (!items.length) return toast('Pilih barang dan jumlahnya', true);
      akunSampelSimpan(v.akun); run(() => buatSampel({ akun: v.akun, label, no: v.no.trim(), tanggal: v.tanggal, penerima: (v.penerima || '').trim(), resi: (v.resi || '').trim(), items }), 'Pesanan sampel tercatat');
    };
  }
  async function buatSampel({ akun, label, no, tanggal, penerima, resi, items }) {
    const key = label + ' #' + no;
    if (S.Faktur.some(f => f.jenis === 'penjualan' && String(f.keterangan).split(' · ')[0] === key)) throw new Error('Pesanan ' + key + ' sudah tercatat. Buka fakturnya dan pakai "Jadikan sampel" bila perlu.');
    await createFaktur({ jenis: 'penjualan', sampel: true, akunSampel: akun, tanggal, jatuh_tempo: tanggal, pihak: label, keterangan: key + (penerima ? ' · ' + penerima : '') + (resi ? ' · Resi ' + resi : ''), items });
  }

  Object.assign(window, { akunSampelOpts, akunSampelDef, akunSampelSimpan, gantiAkunSampel, sampelBadge, sampelNote, sampelBtn, bindSampel, jadikanSampel, sampelForm, buatSampel });
})();
