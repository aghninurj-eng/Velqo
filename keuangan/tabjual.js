/*
  Tab Penjualan dengan tiga tampilan terpisah: Penjualan (faktur), Pembayaran (penerimaan faktur penjualan), dan Retur.
  Pembayaran dan retur dibaca dari Jurnal (sumber RCV dan RTR), jadi selalu sama dengan buku besar. Klik baris untuk membuka faktur terkait.
  Filter tanggal berlaku di ketiga tampilan. Bergantung pada keuangan.js dan retur.js.
*/
(function () {
  'use strict';
  const VIEWS = [['faktur', 'Penjualan'], ['bayar', 'Pembayaran'], ['retur', 'Retur']];
  const sum = (a, f) => a.reduce((x, r) => x + f(r), 0);
  const view = () => (VIEWS.some(v => v[0] === st.sv) ? st.sv : 'faktur');
  const inRange = d => (!st.sfrom || d >= st.sfrom) && (!st.sto || d <= st.sto);
  const isKas = k => { const a = akunBy(k); return !!a && a.kategori === 'Kas & Bank'; };
  const sales = () => S.Faktur.filter(f => f.jenis === 'penjualan');

  function tabs() {
    return `<div class="tabs" style="margin:0 0 10px">${VIEWS.map(([k, t]) => `<button data-sv="${k}" class="${view() === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="bar" style="margin-bottom:10px"><label class="mut">Dari <input type="date" id="sfrom" value="${esc(st.sfrom || '')}"></label><label class="mut">Sampai <input type="date" id="sto" value="${esc(st.sto || '')}"></label>${st.sfrom || st.sto ? '<button class="sm" id="sreset">Semua tanggal</button>' : ''}</div>`;
  }

  // Satu baris per penerimaan (nomor RCV): dana yang masuk, potongan marketplace, dan tagihan yang dilunasi.
  function payRows() {
    const fk = new Map(sales().map(f => [f.id, f])), m = new Map();
    S.Jurnal.filter(j => j.sumber === 'RCV' && fk.has(j.ref)).forEach(j => { const k = j.ref + '|' + j.nomor; if (!m.has(k)) m.set(k, []); m.get(k).push(j); });
    return [...m.values()].map(rows => {
      const f = fk.get(rows[0].ref), kas = rows.filter(j => isKas(j.kode_akun));
      return { f, nomor: rows[0].nomor, tanggal: rows[0].tanggal, ket: rows[0].keterangan, akun: kas.length ? akunNama(kas[0].kode_akun) : '', diterima: sum(kas, j => j.debit - j.kredit), melunasi: sum(rows.filter(j => j.kode_akun === AK.piutang), j => j.kredit), potongan: sum(rows.filter(j => !isKas(j.kode_akun) && j.kode_akun !== AK.piutang), j => j.debit - j.kredit) };
    }).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.nomor.localeCompare(a.nomor));
  }
  function retRows() {
    const out = [];
    sales().forEach(f => returGroups(f.id).forEach(g => out.push({ f, ...g, total: g.R + g.ppn })));
    return out.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.nomor.localeCompare(a.nomor));
  }
  const match = (r, q) => !q || (r.f.pihak + r.f.nomor + r.f.keterangan + r.nomor + (r.ket || '')).toLowerCase().includes(q);
  const who = r => `${esc(r.f.nomor)} ${sampelBadge(r.f)}<div class="mut">${esc(r.f.pihak)}${r.f.keterangan ? ' · ' + esc(String(r.f.keterangan).split(' · ')[0]) : ''}</div>`;

  function head(extra) {
    return `<h2>Penjualan</h2><p class="fin-sub">Faktur penjualan, pembayaran yang diterima, dan retur</p>${tabs()}${extra}`;
  }
  function pageBayar() {
    const q = (st.q.bayar || '').toLowerCase(), all = payRows(), L = all.filter(r => inRange(r.tanggal) && match(r, q));
    const cards = `<div class="cards"><div class="card"><div class="l">Jumlah penerimaan</div><div class="v">${L.length}</div></div><div class="card"><div class="l">Total dana diterima</div><div class="v">${rp(sum(L, r => r.diterima))}</div></div><div class="card"><div class="l">Potongan marketplace</div><div class="v">${rp(sum(L, r => r.potongan))}</div></div></div>`;
    return head(cards + `<div class="bar"><button id="trm">⬇ Terima Dana Marketplace</button><span class="sp"></span><input id="q" placeholder="Cari nomor / pelanggan…" value="${esc(st.q.bayar || '')}"></div>
      <div class="panel" style="padding:0">${L.length ? `<table><tr><th>Tanggal</th><th>No. penerimaan</th><th>Faktur / pelanggan</th><th class="hide-sm">Diterima di</th><th class="r">Diterima</th><th class="r hide-sm">Potongan</th><th class="r hide-sm">Melunasi</th></tr>
      ${L.map(r => `<tr class="rowc" data-f="${esc(r.f.id)}"><td>${tgl(r.tanggal)}</td><td>${esc(r.nomor)}</td><td>${who(r)}</td><td class="hide-sm">${esc(r.akun)}</td><td class="r">${rp(r.diterima)}</td><td class="r hide-sm">${rp(r.potongan)}</td><td class="r hide-sm">${rp(r.melunasi)}</td></tr>`).join('')}
      <tr class="t"><td colspan="4">Total</td><td class="r">${rp(sum(L, r => r.diterima))}</td><td class="r hide-sm">${rp(sum(L, r => r.potongan))}</td><td class="r hide-sm">${rp(sum(L, r => r.melunasi))}</td></tr></table>` : empty(all.length ? 'Tidak ada penerimaan di filter ini' : 'Belum ada pembayaran yang diterima')}</div>`);
  }
  function pageRetur() {
    const q = (st.q.retur || '').toLowerCase(), all = retRows(), L = all.filter(r => inRange(r.tanggal) && match(r, q));
    const cards = `<div class="cards"><div class="card"><div class="l">Jumlah retur</div><div class="v">${L.length}</div></div><div class="card"><div class="l">Total nilai retur</div><div class="v">${rp(sum(L, r => r.total))}</div></div><div class="card"><div class="l">Dana dikembalikan</div><div class="v">${rp(sum(L, r => r.kas))}</div></div></div>`;
    const brg = r => r.stok.filter(s => s.jenis === 'retur').map(s => esc(produkNama(s.produk_id)) + ' ×' + fq(s.qty) + (r.stok.some(x => x.jenis === 'rusak' && x.produk_id === s.produk_id) ? ' (rusak)' : '')).join(', ');
    return head(cards + `<div class="bar"><span class="mut">Retur dicatat dari detail faktur penjualan (tombol Retur).</span><span class="sp"></span><input id="q" placeholder="Cari nomor / pelanggan…" value="${esc(st.q.retur || '')}"></div>
      <div class="panel" style="padding:0">${L.length ? `<table><tr><th>Tanggal</th><th>No. retur</th><th>Faktur / pelanggan</th><th class="hide-sm">Barang</th><th class="r">Nilai retur</th><th class="r hide-sm">Kurangi tagihan</th><th class="r hide-sm">Refund</th></tr>
      ${L.map(r => `<tr class="rowc" data-f="${esc(r.f.id)}"><td>${tgl(r.tanggal)}</td><td>${esc(r.nomor)}</td><td>${who(r)}</td><td class="hide-sm">${brg(r) || '<span class="mut">tanpa barang</span>'}<div class="mut">${esc(String(r.ket || '').split(' - ').slice(2).join(' - '))}</div></td><td class="r">${rp(r.total)}</td><td class="r hide-sm">${rp(r.piutang)}</td><td class="r hide-sm">${rp(r.kas)}</td></tr>`).join('')}
      <tr class="t"><td colspan="4">Total</td><td class="r">${rp(sum(L, r => r.total))}</td><td class="r hide-sm">${rp(sum(L, r => r.piutang))}</td><td class="r hide-sm">${rp(sum(L, r => r.kas))}</td></tr></table>` : empty(all.length ? 'Tidak ada retur di filter ini' : 'Belum ada retur')}</div>`);
  }
  const page = () => (view() === 'bayar' ? pageBayar() : view() === 'retur' ? pageRetur() : null);

  // Dipanggil bindFaktur('penjualan'): pasang tab dan filter; true bila tampilannya bukan daftar faktur (sisanya dipasang di sini).
  function bind() {
    $$('[data-sv]').forEach(el => el.onclick = () => { st.sv = el.dataset.sv; render(); });
    if ($('#sfrom')) $('#sfrom').onchange = e => { st.sfrom = e.target.value; render(); };
    if ($('#sto')) $('#sto').onchange = e => { st.sto = e.target.value; render(); };
    if ($('#sreset')) $('#sreset').onclick = () => { st.sfrom = ''; st.sto = ''; render(); };
    if (view() === 'faktur') return false;
    const key = view();
    if ($('#trm')) $('#trm').onclick = () => (window.terimaModal ? window.terimaModal() : toast('Modul penerimaan belum termuat, muat ulang halaman', true));
    if ($('#q')) $('#q').oninput = e => { st.q[key] = e.target.value; const p = e.target.selectionStart; render(); const el = $('#q'); el.focus(); el.setSelectionRange(p, p); };
    $$('[data-f]').forEach(el => el.onclick = () => fakturDetail(el.dataset.f));
    return true;
  }

  Object.assign(window, { salesTabs: tabs, salesPage: page, bindSalesTabs: bind, salesInRange: inRange });
})();
