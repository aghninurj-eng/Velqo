/*
  Tab Aset: daftar aset tetap dan penyusutan.

  Aset masuk otomatis dari faktur pembelian (Isi faktur: Aset tetap). Penyusutan garis lurus per bulan, mulai bulan setelah
  tanggal perolehan: (harga perolehan - nilai sisa) / umur manfaat dalam bulan. Tombol "Catat penyusutan" membuat satu jurnal
  per bulan (Dr 5700 Beban Penyusutan, Cr 1690 Akumulasi Penyusutan) dan menyimpan akumulasi di tiap aset. Bulan yang sudah
  disusutkan tidak dihitung lagi, jadi aman ditekan berulang.
  Bergantung pada keuangan.js (S, Store, jurnalRows, nextNo, modal, dll.).
*/
(function () {
  'use strict';
  const idx = p => { const [y, m] = p.split('-').map(Number); return y * 12 + m - 1; };
  const addM = (p, n) => { const i = idx(p) + n; return Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0'); };
  const blnNama = p => MONTHS[+p.slice(5) - 1] + ' ' + p.slice(0, 4);
  const lastDay = p => { const [y, m] = p.split('-').map(Number); return p + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); };
  const dasar = a => a.harga - a.nilai_sisa;
  const buku = a => a.harga - a.akum;
  const penuh = a => a.akum >= dasar(a) - 0.5;

  // Rencana penyusutan aset a sampai bulan P (yyyy-mm): [[bulan, jumlah], ...]
  function susutPlan(a, P) {
    const first = addM(a.tanggal.slice(0, 7), 1), start = a.susut_sd ? addM(a.susut_sd, 1) : first;
    const done = a.susut_sd ? idx(a.susut_sd) - idx(first) + 1 : 0, per = Math.round(dasar(a) / a.umur_bulan);
    let rem = Math.round(dasar(a) - a.akum); const out = [];
    for (let m = start; idx(m) <= idx(P) && rem > 0.5; m = addM(m, 1)) {
      const k = done + out.length + 1, amt = k >= a.umur_bulan ? rem : Math.min(per, rem);
      out.push([m, amt]); rem -= amt;
    }
    return out;
  }

  function pAset() {
    if (!Store.asetReady) return `<h2>Aset</h2><div class="note">Fitur aset membutuhkan sheet <b>Aset</b> di Spreadsheet. Perbarui <code>Code.gs</code> di Apps Script (tempel versi terbaru, versi 6), jalankan <code>setup()</code> sekali, lalu <b>Deploy &rarr; Manage deployments &rarr; New version</b>. Setelah itu muat ulang halaman ini.</div>`;
    const q = (st.q.aset || '').toLowerCase();
    const all = S.Aset.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.kode.localeCompare(a.kode));
    const list = all.filter(a => !q || (a.kode + a.nama + akunNama(a.akun)).toLowerCase().includes(q));
    const tot = all.reduce((x, a) => x + a.harga, 0), ak = all.reduce((x, a) => x + a.akum, 0);
    // Cocokkan dengan saldo akun aset tetap di neraca
    const m = sums(null, null), saldoAkun = S.Akun.filter(isAsetAkun).reduce((x, a) => x + saldo(a, m), 0);
    const beda = Math.round(saldoAkun - tot);
    return `<h2>Aset</h2><p class="fin-sub">Daftar aset tetap. Tercatat otomatis dari faktur pembelian dengan isi "Aset tetap"</p>
    <div class="cards"><div class="card"><div class="l">Harga perolehan</div><div class="v">${rp(tot)}</div></div><div class="card"><div class="l">Akumulasi penyusutan</div><div class="v">${rp(ak)}</div></div><div class="card"><div class="l">Nilai buku</div><div class="v ok">${rp(tot - ak)}</div></div></div>
    ${Math.abs(beda) >= 1 ? `<div class="note">Saldo akun aset tetap di Neraca (${rp(saldoAkun)}) berbeda ${rp(beda)} dari total harga perolehan di daftar ini. Biasanya karena aset dibeli lewat jurnal manual atau kas keluar, atau sebelum fitur aset dipakai.</div>` : ''}
    <div class="bar"><button class="pri" id="asbeli">+ Beli Aset</button><button id="assusut">Catat penyusutan</button><span class="sp"></span><input id="q" placeholder="Cari kode / nama aset…" value="${esc(st.q.aset || '')}"></div>
    <div class="panel" style="padding:0">${list.length ? `<table><tr><th>Kode</th><th>Aset</th><th class="hide-sm">Tgl perolehan</th><th class="r">Harga perolehan</th><th class="r hide-sm">Akumulasi</th><th class="r">Nilai buku</th><th class="hide-sm">Status</th></tr>
    ${list.map(a => `<tr class="rowc" data-a="${esc(a.id)}"><td>${esc(a.kode)}</td><td>${esc(a.nama)}${a.jumlah !== 1 ? ' <span class="mut">×' + fq(a.jumlah) + '</span>' : ''}<div class="mut">${esc(akunNama(a.akun))}</div></td><td class="hide-sm">${tgl(a.tanggal)}</td><td class="r">${rp(a.harga)}</td><td class="r hide-sm">${rp(a.akum)}</td><td class="r">${rp(buku(a))}</td><td class="hide-sm"><span class="tag ${penuh(a) ? '' : 'ok'}">${penuh(a) ? 'Habis disusutkan' : a.susut_sd ? 'Disusutkan s/d ' + blnNama(a.susut_sd) : 'Belum disusutkan'}</span></td></tr>`).join('')}</table>`
      : empty('Belum ada aset. Buka tab Pembelian, buat faktur, lalu pilih "Isi faktur: Aset tetap".')}</div>`;
  }

  function bindAset() {
    if (!$('#assusut')) return;
    // Buka form pembelian dengan isi faktur = Aset tetap
    $('#asbeli').onclick = () => { location.hash = '#pembelian'; setTimeout(() => { fakturForm('pembelian'); const md = $('#mode'); if (md && [...md.options].some(o => o.value === 'aset')) { md.value = 'aset'; md.dispatchEvent(new Event('change', { bubbles: true })); } }, 60); };
    $('#assusut').onclick = susutModal;
    $('#q').oninput = e => { st.q.aset = e.target.value; const p = e.target.selectionStart; render(); const el = $('#q'); el.focus(); el.setSelectionRange(p, p); };
    $$('[data-a]').forEach(el => el.onclick = () => asetDetail(el.dataset.a));
  }

  function asetDetail(id) {
    const a = S.Aset.find(x => x.id === id); if (!a) return;
    const per = Math.round(dasar(a) / a.umur_bulan), f = S.Faktur.find(x => x.id === a.faktur_id);
    modal(a.kode + ' · ' + a.nama, `<div class="f" style="margin-bottom:12px">
      <div><div class="mut">Kategori</div>${esc(akunNama(a.akun))}</div><div><div class="mut">Tanggal perolehan</div>${tgl(a.tanggal)}</div>
      <div><div class="mut">Pemasok</div>${esc(a.keterangan) || '-'}</div><div><div class="mut">Jumlah</div>${fq(a.jumlah)}</div></div>
      <table><tr><td>Harga perolehan</td><td class="r">${rp(a.harga)}</td></tr><tr><td>Nilai sisa</td><td class="r">${rp(a.nilai_sisa)}</td></tr>
      <tr><td>Umur manfaat</td><td class="r">${a.umur_bulan} bulan (${(a.umur_bulan / 12).toLocaleString('id-ID', { maximumFractionDigits: 1 })} tahun)</td></tr>
      <tr><td>Penyusutan per bulan</td><td class="r">${rp(per)}</td></tr><tr><td>Akumulasi penyusutan${a.susut_sd ? ' s/d ' + blnNama(a.susut_sd) : ''}</td><td class="r">${rp(a.akum)}</td></tr>
      <tr class="t"><td>Nilai buku</td><td class="r">${rp(buku(a))}</td></tr></table>`,
      `<button data-close>Tutup</button>${f ? '<button class="pri" id="asfk">Lihat faktur ' + esc(f.nomor) + '</button>' : ''}`);
    if ($('#asfk')) $('#asfk').onclick = () => fakturDetail(f.id);
  }

  function susutModal() {
    const now = today().slice(0, 7);
    modal('Catat penyusutan', `<div class="f"><div><label>Sampai bulan</label><input type="month" id="sdbln" value="${now}" max="${now}"></div>
      <div class="mut" style="padding-top:20px">Bulan yang sudah disusutkan dilewati. Aset baru mulai disusutkan bulan berikutnya.</div></div><div id="sdprev" style="margin-top:14px"></div>`,
      `<button data-close>Batal</button><button class="pri" id="sdok" disabled>Catat</button>`);
    const prev = () => {
      const P = $('#sdbln').value; if (!/^\d{4}-\d{2}$/.test(P)) { $('#sdprev').innerHTML = ''; $('#sdok').disabled = true; return null; }
      const plans = S.Aset.map(a => ({ a, p: susutPlan(a, P) })).filter(x => x.p.length), by = new Map();
      plans.forEach(x => x.p.forEach(([m, v]) => { const o = by.get(m) || { n: 0, v: 0 }; o.n++; o.v += v; by.set(m, o); }));
      const months = [...by.keys()].sort(), total = months.reduce((x, m) => x + by.get(m).v, 0);
      $('#sdprev').innerHTML = months.length ? `<table><tr><th>Bulan</th><th class="r">Jumlah aset</th><th class="r">Penyusutan</th></tr>${months.map(m => `<tr><td>${blnNama(m)}</td><td class="r">${by.get(m).n}</td><td class="r">${rp(by.get(m).v)}</td></tr>`).join('')}<tr class="t"><td colspan="2">Total</td><td class="r">${rp(total)}</td></tr></table>`
        : '<div class="mut">Tidak ada penyusutan baru sampai bulan ini.</div>';
      $('#sdok').disabled = !months.length; return { P, plans, months };
    };
    $('#sdbln').onchange = prev; prev();
    $('#sdok').onclick = () => { const r = prev(); if (r && r.months.length) run(() => catatSusut(r), 'Penyusutan dicatat'); };
  }

  async function catatSusut({ plans, months }) {
    if (months.length > 120) throw new Error('Terlalu banyak bulan sekaligus (maksimal 120). Pilih bulan yang lebih awal dulu.');
    const ctx = [], jr = [], upd = [];
    months.forEach(m => {
      const total = plans.reduce((x, y) => x + y.p.filter(z => z[0] === m).reduce((s, z) => s + z[1], 0), 0), tanggal = lastDay(m);
      const rows = jurnalRows({ tanggal, nomor: nextNo('DEP', tanggal, ctx), keterangan: 'Penyusutan aset ' + blnNama(m), sumber: 'DEP', ref: '', lines: [{ kode: AK_SUSUT.kode, debit: total }, { kode: AK_AKUM.kode, kredit: total }] });
      ctx.push(...rows); jr.push(...rows);
    });
    plans.forEach(({ a, p }) => upd.push({ sheet: 'Aset', field: 'id', value: a.id, patch: { akum: a.akum + p.reduce((s, z) => s + z[1], 0), susut_sd: p[p.length - 1][0] } }));
    await Store.appendMany({ Akun: akunBaru([AK_AKUM, AK_SUSUT]), Jurnal: jr }, upd);
  }

  window.pAset = pAset; window.bindAset = bindAset;
  window.VelqoAset = { susutPlan, catatSusut };
  // Skrip ini dimuat setelah keuangan.js; bila halaman Aset dibuka langsung lewat #aset, gambar ulang sekarang.
  if (location.hash === '#aset') render();
})();
