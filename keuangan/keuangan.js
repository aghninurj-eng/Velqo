
/* ============ KONFIGURASI ============
   Bisa diisi di sini, atau lewat halaman Pengaturan (disimpan di browser). */
const CONFIG = { API_URL: '', TOKEN: '' };

/* ============ UTIL ============ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => Number(v) || 0;
const rp = n => (n < 0 ? '(' : '') + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID') + (n < 0 ? ')' : '');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const monthStart = (d = new Date()) => ymd(new Date(d.getFullYear(), d.getMonth(), 1));
const monthEnd = (d = new Date()) => ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
const tgl = s => { if (!s) return '-'; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

/* ============ DATA ============ */
const DEFAULT_COA = [
  ['1100','Kas','Aset','Kas & Bank'],['1200','Bank BCA','Aset','Kas & Bank'],['1300','Piutang Usaha','Aset','Piutang'],
  ['1400','PPN Masukan','Aset','Pajak'],['1500','Persediaan Barang','Aset','Persediaan'],['1600','Peralatan Kantor','Aset','Aset Tetap'],
  ['2100','Hutang Usaha','Kewajiban','Hutang'],['2200','PPN Keluaran','Kewajiban','Pajak'],['2300','Hutang Gaji','Kewajiban','Hutang Lain'],
  ['3100','Modal Pemilik','Ekuitas','Modal'],['3200','Prive','Ekuitas','Modal'],
  ['4100','Pendapatan Penjualan','Pendapatan','Pendapatan'],['4200','Pendapatan Lain-lain','Pendapatan','Pendapatan Lain'],
  ['5100','Harga Pokok Penjualan','Beban','HPP'],['5200','Beban Gaji','Beban','Beban Operasional'],['5300','Beban Sewa','Beban','Beban Operasional'],
  ['5400','Beban Listrik, Air & Internet','Beban','Beban Operasional'],['5500','Beban Perlengkapan','Beban','Beban Operasional'],['5600','Beban Lain-lain','Beban','Beban Lain']
].map(([kode, nama, tipe, kategori]) => ({ kode, nama, tipe, kategori }));
const AK = { piutang: '1300', ppnMasuk: '1400', hutang: '2100', ppnKeluar: '2200', penjualan: '4100', pembelian: '5100', modal: '3100' };
const NUMF = { Jurnal: ['debit', 'kredit'], Faktur: ['subtotal', 'ppn', 'total', 'terbayar'], KasBank: ['jumlah'] };
const TIPE = ['Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'Beban'];
const DEBIT_NORMAL = { Aset: true, Beban: true };

const saved = (() => { try { return JSON.parse(localStorage.getItem('velqo_cfg') || '{}'); } catch { return {}; } })();
const API_URL = saved.url || CONFIG.API_URL, TOKEN = saved.token || CONFIG.TOKEN;
let S = { Akun: [], Jurnal: [], Faktur: [], KasBank: [] };

const Store = {
  live: !!API_URL,
  async post(body) {
    const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, token: TOKEN }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Permintaan gagal');
    return j;
  },
  async loadAll() {
    if (this.live) {
      const r = await fetch(API_URL + (API_URL.includes('?') ? '&' : '?') + 'action=all&token=' + encodeURIComponent(TOKEN));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Gagal memuat data');
      S = j.data;
    } else {
      const raw = localStorage.getItem('velqo_demo');
      if (raw) S = JSON.parse(raw);
      else { S = { Akun: DEFAULT_COA.map(a => ({ ...a })), Jurnal: [], Faktur: [], KasBank: [] }; await seedDemo(); }
    }
    for (const k of ['Akun', 'Jurnal', 'Faktur', 'KasBank']) S[k] = S[k] || [];
    for (const k in NUMF) S[k].forEach(r => NUMF[k].forEach(f => r[f] = num(r[f])));
    S.Jurnal.forEach(j => j.kode_akun = String(j.kode_akun));
    S.Akun.forEach(a => a.kode = String(a.kode));
  },
  save() { if (!this.live) localStorage.setItem('velqo_demo', JSON.stringify(S)); },
  async append(sheet, rows) { if (this.live) await this.post({ action: 'append', sheet, rows }); S[sheet].push(...rows); this.save(); },
  async update(sheet, field, value, patch) {
    if (this.live) await this.post({ action: 'update', sheet, field, value, patch });
    const r = S[sheet].find(x => String(x[field]) === String(value)); if (r) Object.assign(r, patch); this.save();
  },
  async remove(sheet, field, value) {
    if (this.live) await this.post({ action: 'remove', sheet, field, value });
    S[sheet] = S[sheet].filter(x => String(x[field]) !== String(value)); this.save();
  }
};

/* ============ LOGIKA AKUNTANSI ============ */
const akunBy = kode => S.Akun.find(a => a.kode === String(kode));
const akunNama = kode => { const a = akunBy(kode); return a ? a.kode + ' · ' + a.nama : kode; };
const kasAkun = () => S.Akun.filter(a => a.kategori === 'Kas & Bank').sort((a, b) => a.kode.localeCompare(b.kode));

function nextNo(prefix, date) {
  const pre = prefix + '/' + date.slice(0, 7).replace('-', '') + '/';
  let max = 0;
  S.Jurnal.forEach(j => { if (j.nomor.startsWith(pre)) max = Math.max(max, parseInt(j.nomor.slice(pre.length)) || 0); });
  return pre + String(max + 1).padStart(4, '0');
}
async function post({ tanggal, nomor, keterangan, sumber, ref, lines }) {
  const d = lines.reduce((a, l) => a + num(l.debit), 0), k = lines.reduce((a, l) => a + num(l.kredit), 0);
  if (Math.abs(d - k) > 0.005) throw new Error('Jurnal tidak seimbang');
  const rows = lines.filter(l => num(l.debit) || num(l.kredit)).map(l => ({
    id: uid(), tanggal, nomor, keterangan: keterangan || '', kode_akun: String(l.kode),
    debit: num(l.debit), kredit: num(l.kredit), sumber, ref: ref || ''
  }));
  if (!rows.length) throw new Error('Jumlah tidak boleh nol');
  await Store.append('Jurnal', rows);
}
function sums(from, to) {
  const m = {};
  for (const j of S.Jurnal) {
    if ((from && j.tanggal < from) || (to && j.tanggal > to)) continue;
    const o = m[j.kode_akun] || (m[j.kode_akun] = { d: 0, k: 0 });
    o.d += j.debit; o.k += j.kredit;
  }
  return m;
}
function saldo(akun, m) {
  const o = m[akun.kode] || { d: 0, k: 0 };
  return DEBIT_NORMAL[akun.tipe] ? o.d - o.k : o.k - o.d;
}
const byTipe = (t, m) => S.Akun.filter(a => a.tipe === t).sort((a, b) => a.kode.localeCompare(b.kode)).map(a => ({ a, s: saldo(a, m) }));
const labaRugi = (from, to) => {
  const m = sums(from, to);
  const pend = byTipe('Pendapatan', m), beban = byTipe('Beban', m);
  const tp = pend.reduce((x, r) => x + r.s, 0), tb = beban.reduce((x, r) => x + r.s, 0);
  return { pend, beban, tp, tb, laba: tp - tb };
};

async function createFaktur({ jenis, tanggal, jatuh_tempo, pihak, keterangan, akun, subtotal, ppn }) {
  const sales = jenis === 'penjualan';
  const nomor = nextNo(sales ? 'INV' : 'BILL', tanggal);
  const ppnAmt = ppn ? Math.round(subtotal * 0.11) : 0, total = subtotal + ppnAmt;
  const f = { id: uid(), jenis, nomor, tanggal, jatuh_tempo, pihak, keterangan, akun, subtotal, ppn: ppnAmt, total, terbayar: 0 };
  const lines = sales
    ? [{ kode: AK.piutang, debit: total }, { kode: akun, kredit: subtotal }, { kode: AK.ppnKeluar, kredit: ppnAmt }]
    : [{ kode: akun, debit: subtotal }, { kode: AK.ppnMasuk, debit: ppnAmt }, { kode: AK.hutang, kredit: total }];
  await Store.append('Faktur', [f]);
  await post({ tanggal, nomor, keterangan: (sales ? 'Penjualan ke ' : 'Pembelian dari ') + pihak + (keterangan ? ' - ' + keterangan : ''), sumber: sales ? 'INV' : 'BILL', ref: f.id, lines });
  return f;
}
async function payFaktur(f, { tanggal, akun_kas, jumlah }) {
  const sales = f.jenis === 'penjualan';
  if (jumlah <= 0 || jumlah > f.total - f.terbayar + 0.005) throw new Error('Jumlah melebihi sisa tagihan');
  const nomor = nextNo(sales ? 'RCV' : 'PAY', tanggal);
  const lines = sales
    ? [{ kode: akun_kas, debit: jumlah }, { kode: AK.piutang, kredit: jumlah }]
    : [{ kode: AK.hutang, debit: jumlah }, { kode: akun_kas, kredit: jumlah }];
  await post({ tanggal, nomor, keterangan: (sales ? 'Penerimaan ' : 'Pembayaran ') + f.nomor + ' - ' + f.pihak, sumber: sales ? 'RCV' : 'PAY', ref: f.id, lines });
  await Store.update('Faktur', 'id', f.id, { terbayar: f.terbayar + jumlah });
}
async function createKas({ jenis, tanggal, akun_kas, akun_lawan, jumlah, keterangan }) {
  if (akun_kas === akun_lawan) throw new Error('Akun asal dan lawan tidak boleh sama');
  const nomor = nextNo({ masuk: 'KM', keluar: 'KK', transfer: 'TF' }[jenis], tanggal);
  const k = { id: uid(), tanggal, nomor, jenis, akun_kas, akun_lawan, jumlah, keterangan };
  const lines = jenis === 'masuk'
    ? [{ kode: akun_kas, debit: jumlah }, { kode: akun_lawan, kredit: jumlah }]
    : [{ kode: akun_lawan, debit: jumlah }, { kode: akun_kas, kredit: jumlah }];
  await Store.append('KasBank', [k]);
  await post({ tanggal, nomor, keterangan, sumber: { masuk: 'KM', keluar: 'KK', transfer: 'TF' }[jenis], ref: k.id, lines });
}
function fakturStatus(f) {
  const sisa = f.total - f.terbayar;
  if (sisa <= 0.005) return ['Lunas', 'ok'];
  if (f.jatuh_tempo && f.jatuh_tempo < today()) return ['Jatuh tempo', 'bad'];
  return [f.terbayar > 0 ? 'Sebagian' : 'Belum lunas', 'warn'];
}

async function seedDemo() {
  // Tanggal demo tidak boleh melewati hari ini; hari dibatasi 1-28 agar aman di semua bulan.
  const d = (m, day) => { const x = new Date(), t = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() - m); x.setDate(Math.min(Math.max(day, 1), 28, m === 0 ? t : 28)); return ymd(x); };
  await post({ tanggal: d(5, 1), nomor: 'JU/DEMO/0001', keterangan: 'Setoran modal awal', sumber: 'JU', lines: [{ kode: '1100', debit: 20000000 }, { kode: '1200', debit: 60000000 }, { kode: '3100', kredit: 80000000 }] });
  const sample = [[4, 5, 12000000, 'Toko Maju Jaya'], [3, 9, 15500000, 'CV Sinar Terang'], [2, 12, 18000000, 'Toko Maju Jaya'], [1, 8, 21000000, 'PT Bintang Mulia'], [0, 2, 9000000, 'CV Sinar Terang']];
  for (const [m, day, amt, pihak] of sample) {
    const f = await createFaktur({ jenis: 'penjualan', tanggal: d(m, day), jatuh_tempo: d(m, day + 14 > 28 ? 28 : day + 14), pihak, keterangan: 'Penjualan produk', akun: AK.penjualan, subtotal: amt, ppn: false });
    if (m >= 1) await payFaktur(f, { tanggal: d(m, Math.min(day + 10, 28)), akun_kas: '1200', jumlah: f.total });
  }
  for (const [m, day, amt, pihak] of [[4, 7, 5000000, 'Supplier Bahan'], [2, 6, 7000000, 'Supplier Bahan'], [0, 3, 4000000, 'Supplier Bahan']])
    await createFaktur({ jenis: 'pembelian', tanggal: d(m, day), jatuh_tempo: d(m, 25), pihak, keterangan: 'Pembelian bahan', akun: AK.pembelian, subtotal: amt, ppn: false });
  for (let m = 4; m >= 0; m--) {
    await createKas({ jenis: 'keluar', tanggal: d(m, 25), akun_kas: '1200', akun_lawan: '5200', jumlah: 6000000, keterangan: 'Gaji karyawan' });
    await createKas({ jenis: 'keluar', tanggal: d(m, 26), akun_kas: '1100', akun_lawan: '5300', jumlah: 2500000, keterangan: 'Sewa tempat usaha' });
  }
}

/* ============ UI DASAR ============ */
const dlg = $('#dlg');
$('#dx').onclick = () => dlg.close();
function modal(title, body, foot = '', wide = false) {
  $('#dt').textContent = title; $('#dbody').innerHTML = body; $('#dfoot').innerHTML = foot;
  dlg.classList.toggle('wide', wide);
  $$('[data-close]', dlg).forEach(b => b.onclick = () => dlg.close());
  if (!dlg.open) dlg.showModal();
}
function toast(msg, err) {
  const el = document.createElement('div'); el.textContent = msg; if (err) el.className = 'err';
  $('#fin-toast').appendChild(el); setTimeout(() => el.remove(), err ? 6000 : 2600);
}
async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); dlg.open && dlg.close(); render(); }
  catch (e) { toast(e.message || String(e), true); }
}
const sel = (name, opts, val, attr = '') => `<select name="${name}" ${attr}>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
const akunOpts = (filter = () => true) => S.Akun.filter(filter).sort((a, b) => a.kode.localeCompare(b.kode)).map(a => [a.kode, a.kode + ' · ' + a.nama]);
const empty = t => `<div class="empty">${t}</div>`;

/* ============ HALAMAN ============ */
const st = { q: {}, kas: null, tab: 'labarugi', from: monthStart(), to: monthEnd(), bb: '', jsrc: '' };

function pDashboard() {
  const m = sums(null, null), mb = sums(monthStart(), monthEnd());
  const kas = kasAkun().reduce((x, a) => x + saldo(a, m), 0);
  const piu = S.Faktur.filter(f => f.jenis === 'penjualan').reduce((x, f) => x + f.total - f.terbayar, 0);
  const hut = S.Faktur.filter(f => f.jenis === 'pembelian').reduce((x, f) => x + f.total - f.terbayar, 0);
  const lr = labaRugi(monthStart(), monthEnd());
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const r = labaRugi(monthStart(d), monthEnd(d)); months.push({ l: MONTHS[d.getMonth()], p: r.tp, b: r.tb }); }
  const mx = Math.max(1, ...months.flatMap(x => [x.p, x.b])), W = 520, H = 190, bw = 22, gap = (W - 40) / 6;
  const bars = months.map((x, i) => {
    const x0 = 40 + i * gap + 8, hp = x.p / mx * (H - 40), hb = x.b / mx * (H - 40);
    return `<rect x="${x0}" y="${H - 24 - hp}" width="${bw}" height="${hp}" rx="3" style="fill:var(--accent)"><title>Pendapatan ${x.l}: ${rp(x.p)}</title></rect>
      <rect x="${x0 + bw + 4}" y="${H - 24 - hb}" width="${bw}" height="${hb}" rx="3" style="fill:var(--beban)"><title>Beban ${x.l}: ${rp(x.b)}</title></rect>
      <text x="${x0 + bw}" y="${H - 8}" text-anchor="middle" font-size="11" >${x.l}</text>`;
  }).join('');
  const due = S.Faktur.filter(f => f.total - f.terbayar > 0.005).sort((a, b) => (a.jatuh_tempo || '').localeCompare(b.jatuh_tempo || '')).slice(0, 7);
  const recent = [...new Map(S.Jurnal.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).map(j => [j.nomor, j])).values()].slice(0, 7);
  return `<h2>Ringkasan</h2><p class="fin-sub">Ringkasan keuangan Velqo — ${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}</p>
  <div class="cards">
    <a class="card click" href="#kasbank" style="text-decoration:none;color:inherit"><div class="l">Saldo Kas &amp; Bank</div><div class="v">${rp(kas)}</div></a>
    <a class="card click" href="#penjualan" style="text-decoration:none;color:inherit"><div class="l">Piutang Usaha</div><div class="v">${rp(piu)}</div></a>
    <a class="card click" href="#pembelian" style="text-decoration:none;color:inherit"><div class="l">Hutang Usaha</div><div class="v">${rp(hut)}</div></a>
    <div class="card"><div class="l">Laba bulan ini</div><div class="v ${lr.laba < 0 ? 'bad' : 'ok'}">${rp(lr.laba)}</div></div>
  </div>
  <div class="grid2">
    <div class="panel"><h3>Pendapatan vs Beban (6 bulan)</h3>
      <div class="legend"><span style="--c:var(--accent)">Pendapatan</span><span style="--c:var(--beban)">Beban</span></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Grafik pendapatan dan beban enam bulan terakhir"><line x1="40" y1="${H - 24}" x2="${W}" y2="${H - 24}"/>${bars}</svg></div>
    <div class="panel"><h3>Tagihan belum lunas</h3>${due.length ? `<table>${due.map(f => { const [t, c] = fakturStatus(f); return `<tr><td>${esc(f.pihak)}<div class="mut">${f.jenis === 'penjualan' ? 'Piutang' : 'Hutang'} · ${esc(f.nomor)}</div></td><td class="r">${rp(f.total - f.terbayar)}<div><span class="tag ${c}">${t}</span> <span class="mut">${tgl(f.jatuh_tempo)}</span></div></td></tr>`; }).join('')}</table>` : empty('Tidak ada tagihan terbuka')}</div>
  </div>
  <div class="panel"><h3>Transaksi terbaru</h3>${recent.length ? `<table><tr><th>Tanggal</th><th>Nomor</th><th>Keterangan</th><th>Jenis</th></tr>${recent.map(j => `<tr><td>${tgl(j.tanggal)}</td><td>${esc(j.nomor)}</td><td>${esc(j.keterangan)}</td><td><span class="tag">${esc(j.sumber)}</span></td></tr>`).join('')}</table>` : empty('Belum ada transaksi')}</div>`;
}

function pKasBank() {
  const ak = kasAkun(); if (!st.kas || !akunBy(st.kas)) st.kas = ak[0] && ak[0].kode;
  const m = sums(null, null);
  const cards = ak.map(a => `<div class="card click ${a.kode === st.kas ? 'sel' : ''}" data-kas="${a.kode}"><div class="l">${esc(a.kode)} · ${esc(a.nama)}</div><div class="v">${rp(saldo(a, m))}</div></div>`).join('');
  const rows = S.Jurnal.filter(j => j.kode_akun === st.kas).sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id.localeCompare(b.id));
  let run = 0; const withBal = rows.map(j => ({ j, bal: run += j.debit - j.kredit })).reverse();
  return `<h2>Kas &amp; Bank</h2><p class="fin-sub">Mutasi per rekening, otomatis dari jurnal (termasuk pembayaran faktur)</p>
  <div class="bar"><button class="pri" data-k="masuk">+ Kas Masuk</button><button class="pri" data-k="keluar">+ Kas Keluar</button><button data-k="transfer">⇄ Transfer</button></div>
  <div class="cards">${cards || empty('Belum ada akun dengan kategori "Kas & Bank"')}</div>
  <div class="panel"><h3>Mutasi ${st.kas ? esc(akunNama(st.kas)) : ''}</h3>${withBal.length ? `<table><tr><th>Tanggal</th><th>Nomor</th><th>Keterangan</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo</th><th></th></tr>
  ${withBal.map(({ j, bal }) => `<tr><td>${tgl(j.tanggal)}</td><td>${esc(j.nomor)}</td><td>${esc(j.keterangan)}</td><td class="r ok">${j.debit ? rp(j.debit) : ''}</td><td class="r bad">${j.kredit ? rp(j.kredit) : ''}</td><td class="r">${rp(bal)}</td><td>${['KM', 'KK', 'TF'].includes(j.sumber) ? `<button class="sm dan" data-delk="${esc(j.ref)}">Hapus</button>` : ''}</td></tr>`).join('')}</table>` : empty('Belum ada mutasi')}</div>`;
}
function bindKasBank() {
  $$('[data-kas]').forEach(el => el.onclick = () => { st.kas = el.dataset.kas; render(); });
  $$('[data-k]').forEach(el => el.onclick = () => kasForm(el.dataset.k));
  $$('[data-delk]').forEach(el => el.onclick = () => { if (confirm('Hapus transaksi kas ini beserta jurnalnya?')) run(async () => { await Store.remove('Jurnal', 'ref', el.dataset.delk); await Store.remove('KasBank', 'id', el.dataset.delk); }, 'Transaksi dihapus'); });
}
function kasForm(jenis) {
  const t = { masuk: 'Kas Masuk', keluar: 'Kas Keluar', transfer: 'Transfer Antar Kas/Bank' }[jenis];
  const lawan = jenis === 'transfer' ? akunOpts(a => a.kategori === 'Kas & Bank') : akunOpts(a => a.kategori !== 'Kas & Bank');
  modal(t, `<form id="kf" class="f">
    <div><label>Tanggal</label><input type="date" name="tanggal" value="${today()}" required></div>
    <div><label>${jenis === 'transfer' ? 'Dari rekening' : 'Rekening kas/bank'}</label>${sel('akun_kas', akunOpts(a => a.kategori === 'Kas & Bank'), st.kas)}</div>
    <div class="full"><label>${jenis === 'masuk' ? 'Sumber (akun lawan)' : jenis === 'keluar' ? 'Digunakan untuk (akun lawan)' : 'Ke rekening'}</label>${sel('akun_lawan', lawan, jenis === 'masuk' ? '4200' : jenis === 'keluar' ? '5600' : '')}</div>
    <div><label>Jumlah (Rp)</label><input type="number" name="jumlah" min="1" step="any" required></div>
    <div><label>Keterangan</label><input name="keterangan" required></div></form>`,
    `<button data-close>Batal</button><button class="pri" id="ok">Simpan</button>`);
  $('#ok').onclick = () => { const f = $('#kf'); if (!f.reportValidity()) return; const v = Object.fromEntries(new FormData(f)); run(() => createKas({ jenis, ...v, jumlah: num(v.jumlah) }), 'Transaksi tersimpan'); };
}

function pFaktur(jenis) {
  const sales = jenis === 'penjualan', q = (st.q[jenis] || '').toLowerCase();
  const all = S.Faktur.filter(f => f.jenis === jenis);
  const list = all.filter(f => !q || (f.pihak + f.nomor + f.keterangan).toLowerCase().includes(q)).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.nomor.localeCompare(a.nomor));
  const open = all.reduce((x, f) => x + f.total - f.terbayar, 0);
  const od = all.filter(f => fakturStatus(f)[0] === 'Jatuh tempo').reduce((x, f) => x + f.total - f.terbayar, 0);
  const tot = all.filter(f => f.tanggal >= monthStart() && f.tanggal <= monthEnd()).reduce((x, f) => x + f.total, 0);
  return `<h2>${sales ? 'Penjualan' : 'Pembelian'}</h2><p class="fin-sub">${sales ? 'Faktur penjualan dan penerimaan pembayaran (piutang)' : 'Faktur pembelian dan pembayaran ke pemasok (hutang)'}</p>
  <div class="cards"><div class="card"><div class="l">Total bulan ini</div><div class="v">${rp(tot)}</div></div><div class="card"><div class="l">${sales ? 'Belum diterima' : 'Belum dibayar'}</div><div class="v">${rp(open)}</div></div><div class="card"><div class="l">Jatuh tempo</div><div class="v ${od ? 'bad' : ''}">${rp(od)}</div></div></div>
  <div class="bar"><button class="pri" id="addf">+ Faktur ${sales ? 'Penjualan' : 'Pembelian'}</button><span class="sp"></span><input id="q" placeholder="Cari nomor / ${sales ? 'pelanggan' : 'pemasok'}…" value="${esc(st.q[jenis] || '')}"></div>
  <div class="panel" style="padding:0">${list.length ? `<table><tr><th>Tanggal</th><th>Nomor</th><th>${sales ? 'Pelanggan' : 'Pemasok'}</th><th>Jatuh tempo</th><th class="r">Total</th><th class="r">Sisa</th><th>Status</th></tr>
  ${list.map(f => { const [t, c] = fakturStatus(f); return `<tr class="rowc" data-f="${f.id}"><td>${tgl(f.tanggal)}</td><td>${esc(f.nomor)}</td><td>${esc(f.pihak)}<div class="mut">${esc(f.keterangan)}</div></td><td>${tgl(f.jatuh_tempo)}</td><td class="r">${rp(f.total)}</td><td class="r">${rp(f.total - f.terbayar)}</td><td><span class="tag ${c}">${t}</span></td></tr>`; }).join('')}</table>` : empty('Belum ada faktur')}</div>`;
}
function bindFaktur(jenis) {
  $('#addf').onclick = () => fakturForm(jenis);
  $('#q').oninput = e => { st.q[jenis] = e.target.value; const p = e.target.selectionStart; render(); const el = $('#q'); el.focus(); el.setSelectionRange(p, p); };
  $$('[data-f]').forEach(el => el.onclick = () => fakturDetail(el.dataset.f));
}
function fakturForm(jenis) {
  const sales = jenis === 'penjualan';
  const due = new Date(); due.setDate(due.getDate() + 14);
  modal('Faktur ' + (sales ? 'Penjualan' : 'Pembelian'), `<form id="ff" class="f">
    <div><label>Tanggal</label><input type="date" name="tanggal" value="${today()}" required></div>
    <div><label>Jatuh tempo</label><input type="date" name="jatuh_tempo" value="${ymd(due)}" required></div>
    <div class="full"><label>${sales ? 'Pelanggan' : 'Pemasok'}</label><input name="pihak" required></div>
    <div class="full"><label>Keterangan</label><input name="keterangan"></div>
    <div class="full"><label>${sales ? 'Akun pendapatan' : 'Akun pembelian / beban'}</label>${sel('akun', akunOpts(a => sales ? a.tipe === 'Pendapatan' : a.tipe === 'Beban' || a.kategori === 'Persediaan'), sales ? AK.penjualan : AK.pembelian)}</div>
    <div><label>Subtotal (Rp)</label><input type="number" name="subtotal" min="1" step="any" required></div>
    <div class="chk" style="padding-top:18px"><input type="checkbox" name="ppn" id="ppn"><label for="ppn" style="margin:0;font-size:13px;color:var(--tx)">Kenakan PPN 11%</label></div>
    <div class="full mut" id="tot"></div></form>`,
    `<button data-close>Batal</button><button class="pri" id="ok">Simpan</button>`);
  const upd = () => { const f = $('#ff'); const s = num(f.elements.subtotal.value), p = f.elements.ppn.checked ? Math.round(s * .11) : 0; $('#tot').textContent = 'Total: ' + rp(s + p) + (p ? ' (PPN ' + rp(p) + ')' : ''); };
  $('#ff').oninput = upd; upd();
  $('#ok').onclick = () => { const f = $('#ff'); if (!f.reportValidity()) return; const v = Object.fromEntries(new FormData(f)); run(() => createFaktur({ jenis, tanggal: v.tanggal, jatuh_tempo: v.jatuh_tempo, pihak: v.pihak.trim(), keterangan: v.keterangan.trim(), akun: v.akun, subtotal: num(v.subtotal), ppn: !!v.ppn }), 'Faktur tersimpan'); };
}
function fakturDetail(id) {
  const f = S.Faktur.find(x => x.id === id); if (!f) return;
  const sales = f.jenis === 'penjualan', sisa = f.total - f.terbayar, [t, c] = fakturStatus(f);
  const pays = S.Jurnal.filter(j => j.ref === f.id && (j.sumber === 'RCV' || j.sumber === 'PAY') && ![AK.piutang, AK.hutang].includes(j.kode_akun));
  modal(f.nomor, `<div class="f" style="margin-bottom:12px">
    <div><div class="mut">${sales ? 'Pelanggan' : 'Pemasok'}</div>${esc(f.pihak)}</div><div><div class="mut">Status</div><span class="tag ${c}">${t}</span></div>
    <div><div class="mut">Tanggal / Jatuh tempo</div>${tgl(f.tanggal)} / ${tgl(f.jatuh_tempo)}</div><div><div class="mut">Keterangan</div>${esc(f.keterangan) || '-'}</div></div>
    <table><tr><td>Subtotal</td><td class="r">${rp(f.subtotal)}</td></tr><tr><td>PPN</td><td class="r">${rp(f.ppn)}</td></tr><tr class="t"><td>Total</td><td class="r">${rp(f.total)}</td></tr><tr><td>${sales ? 'Diterima' : 'Dibayar'}</td><td class="r">${rp(f.terbayar)}</td></tr><tr class="t"><td>Sisa</td><td class="r">${rp(sisa)}</td></tr></table>
    <h3 style="margin:14px 0 6px">Riwayat ${sales ? 'penerimaan' : 'pembayaran'}</h3>${pays.length ? `<table>${pays.map(j => `<tr><td>${tgl(j.tanggal)}</td><td>${esc(j.nomor)}</td><td>${esc(akunNama(j.kode_akun))}</td><td class="r">${rp(j.debit + j.kredit)}</td></tr>`).join('')}</table>` : '<div class="mut">Belum ada</div>'}`,
    `${f.terbayar === 0 ? '<button class="dan" id="del" style="margin-right:auto">Hapus faktur</button>' : ''}<button data-close>Tutup</button>${sisa > 0.005 ? `<button class="pri" id="pay">${sales ? 'Terima pembayaran' : 'Bayar'}</button>` : ''}`);
  if ($('#del')) $('#del').onclick = () => { if (confirm('Hapus faktur ' + f.nomor + ' beserta jurnalnya?')) run(async () => { await Store.remove('Jurnal', 'ref', f.id); await Store.remove('Faktur', 'id', f.id); }, 'Faktur dihapus'); };
  if ($('#pay')) $('#pay').onclick = () => {
    modal((sales ? 'Terima pembayaran ' : 'Bayar ') + f.nomor, `<form id="pf" class="f">
      <div><label>Tanggal</label><input type="date" name="tanggal" value="${today()}" required></div>
      <div><label>${sales ? 'Masuk ke' : 'Dibayar dari'}</label>${sel('akun_kas', akunOpts(a => a.kategori === 'Kas & Bank'), st.kas)}</div>
      <div class="full"><label>Jumlah (sisa ${rp(sisa)})</label><input type="number" name="jumlah" min="1" max="${sisa}" step="any" value="${sisa}" required></div></form>`,
      `<button data-close>Batal</button><button class="pri" id="ok">Simpan</button>`);
    $('#ok').onclick = () => { const fm = $('#pf'); if (!fm.reportValidity()) return; const v = Object.fromEntries(new FormData(fm)); run(() => payFaktur(f, { tanggal: v.tanggal, akun_kas: v.akun_kas, jumlah: num(v.jumlah) }), 'Pembayaran tersimpan'); };
  };
}

function pAkun() {
  const q = (st.q.akun || '').toLowerCase(), m = sums(null, null);
  const list = S.Akun.filter(a => !q || (a.kode + a.nama + a.tipe + a.kategori).toLowerCase().includes(q)).sort((a, b) => a.kode.localeCompare(b.kode));
  return `<h2>Daftar Akun</h2><p class="fin-sub">Bagan akun (Chart of Accounts) beserta saldo berjalan</p>
  <div class="bar"><button class="pri" id="adda">+ Akun Baru</button><span class="sp"></span><input id="q" placeholder="Cari akun…" value="${esc(st.q.akun || '')}"></div>
  <div class="panel" style="padding:0">${list.length ? `<table><tr><th>Kode</th><th>Nama akun</th><th>Tipe</th><th>Kategori</th><th class="r">Saldo</th><th></th></tr>
  ${list.map(a => `<tr><td>${esc(a.kode)}</td><td>${esc(a.nama)}</td><td>${esc(a.tipe)}</td><td class="mut">${esc(a.kategori)}</td><td class="r">${rp(saldo(a, m))}</td><td class="r"><button class="sm" data-ea="${esc(a.kode)}">Ubah</button> <button class="sm dan" data-da="${esc(a.kode)}">Hapus</button></td></tr>`).join('')}</table>` : empty('Akun tidak ditemukan')}</div>`;
}
function bindAkun() {
  $('#adda').onclick = () => akunForm();
  $('#q').oninput = e => { st.q.akun = e.target.value; const p = e.target.selectionStart; render(); const el = $('#q'); el.focus(); el.setSelectionRange(p, p); };
  $$('[data-ea]').forEach(el => el.onclick = () => akunForm(akunBy(el.dataset.ea)));
  $$('[data-da]').forEach(el => el.onclick = () => {
    const k = el.dataset.da;
    if (S.Jurnal.some(j => j.kode_akun === k)) return toast('Akun sudah dipakai di jurnal, tidak bisa dihapus', true);
    if (Object.values(AK).includes(k)) return toast('Akun ini dipakai otomatis oleh sistem', true);
    if (confirm('Hapus akun ' + k + '?')) run(() => Store.remove('Akun', 'kode', k), 'Akun dihapus');
  });
}
function akunForm(a) {
  modal(a ? 'Ubah Akun' : 'Akun Baru', `<form id="af" class="f">
    <div><label>Kode</label><input name="kode" value="${a ? esc(a.kode) : ''}" ${a ? 'readonly' : ''} pattern="[0-9A-Za-z.\\-]+" required></div>
    <div><label>Tipe</label>${sel('tipe', TIPE.map(t => [t, t]), a ? a.tipe : 'Aset')}</div>
    <div class="full"><label>Nama akun</label><input name="nama" value="${a ? esc(a.nama) : ''}" required></div>
    <div class="full"><label>Kategori (gunakan "Kas &amp; Bank" agar muncul di menu Kas &amp; Bank)</label><input name="kategori" value="${a ? esc(a.kategori) : ''}" list="kat"><datalist id="kat">${[...new Set(S.Akun.map(x => x.kategori))].map(k => `<option value="${esc(k)}">`).join('')}</datalist></div></form>`,
    `<button data-close>Batal</button><button class="pri" id="ok">Simpan</button>`);
  $('#ok').onclick = () => {
    const f = $('#af'); if (!f.reportValidity()) return; const v = Object.fromEntries(new FormData(f)); v.kode = v.kode.trim(); v.nama = v.nama.trim(); v.kategori = v.kategori.trim();
    if (a) run(() => Store.update('Akun', 'kode', a.kode, { nama: v.nama, tipe: v.tipe, kategori: v.kategori }), 'Akun diperbarui');
    else { if (akunBy(v.kode)) return toast('Kode akun sudah ada', true); run(() => Store.append('Akun', [{ kode: v.kode, nama: v.nama, tipe: v.tipe, kategori: v.kategori }]), 'Akun ditambahkan'); }
  };
}

function pJurnal() {
  const q = (st.q.jurnal || '').toLowerCase();
  const groups = new Map();
  S.Jurnal.forEach(j => { if (!groups.has(j.nomor)) groups.set(j.nomor, []); groups.get(j.nomor).push(j); });
  let docs = [...groups.values()].filter(g => (!st.jsrc || g[0].sumber === st.jsrc) && (!q || (g[0].nomor + g[0].keterangan).toLowerCase().includes(q)))
    .sort((a, b) => b[0].tanggal.localeCompare(a[0].tanggal) || b[0].nomor.localeCompare(a[0].nomor));
  const total = docs.length; docs = docs.slice(0, 80);
  const src = [...new Set(S.Jurnal.map(j => j.sumber))].sort();
  return `<h2>Jurnal Umum</h2><p class="fin-sub">Semua entri jurnal, termasuk yang dibuat otomatis dari transaksi</p>
  <div class="bar"><button class="pri" id="addj">+ Jurnal Manual</button><span class="sp"></span>
  <select id="jsrc"><option value="">Semua jenis</option>${src.map(s => `<option ${s === st.jsrc ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
  <input id="q" placeholder="Cari nomor / keterangan…" value="${esc(st.q.jurnal || '')}"></div>
  <div class="panel" style="padding:0">${docs.length ? `<table><tr><th>Akun</th><th>Keterangan</th><th class="r">Debit</th><th class="r">Kredit</th><th></th></tr>
  ${docs.map(g => `<tr class="h"><td colspan="4">${tgl(g[0].tanggal)} · ${esc(g[0].nomor)} <span class="tag">${esc(g[0].sumber)}</span></td><td class="r">${g[0].sumber === 'JU' ? `<button class="sm dan" data-dj="${esc(g[0].nomor)}">Hapus</button>` : ''}</td></tr>
  ${g.map(j => `<tr><td style="padding-left:22px">${esc(akunNama(j.kode_akun))}</td><td class="mut">${esc(j.keterangan)}</td><td class="r">${j.debit ? rp(j.debit) : ''}</td><td class="r">${j.kredit ? rp(j.kredit) : ''}</td><td></td></tr>`).join('')}`).join('')}</table>${total > 80 ? `<div class="empty">Menampilkan 80 dari ${total} jurnal. Gunakan pencarian untuk mempersempit.</div>` : ''}` : empty('Belum ada jurnal')}</div>`;
}
function bindJurnal() {
  $('#addj').onclick = jurnalForm;
  $('#jsrc').onchange = e => { st.jsrc = e.target.value; render(); };
  $('#q').oninput = e => { st.q.jurnal = e.target.value; const p = e.target.selectionStart; render(); const el = $('#q'); el.focus(); el.setSelectionRange(p, p); };
  $$('[data-dj]').forEach(el => el.onclick = () => { if (confirm('Hapus jurnal ' + el.dataset.dj + '?')) run(() => Store.remove('Jurnal', 'nomor', el.dataset.dj), 'Jurnal dihapus'); });
}
function jurnalForm() {
  const opts = akunOpts();
  const line = () => `<tr><td>${sel('kode', opts, '', 'style="min-width:200px"')}</td><td><input type="number" name="debit" min="0" step="any" class="r"></td><td><input type="number" name="kredit" min="0" step="any" class="r"></td><td><button type="button" class="sm" data-rm>×</button></td></tr>`;
  modal('Jurnal Manual', `<div class="f" style="margin-bottom:12px"><div><label>Tanggal</label><input type="date" id="jt" value="${today()}"></div><div><label>Keterangan</label><input id="jk" placeholder="mis. Penyesuaian beban"></div></div>
    <table id="jl"><tr><th>Akun</th><th class="r">Debit</th><th class="r">Kredit</th><th></th></tr>${line()}${line()}</table>
    <div class="bar" style="margin-top:10px"><button type="button" id="jadd">+ Baris</button><span class="sp"></span><span id="jsum"></span></div>`,
    `<button data-close>Batal</button><button class="pri" id="ok" disabled>Simpan</button>`, true);
  const read = () => $$('#jl tr').slice(1).map(tr => ({ kode: $('[name=kode]', tr).value, debit: num($('[name=debit]', tr).value), kredit: num($('[name=kredit]', tr).value) })).filter(l => l.debit || l.kredit);
  const upd = () => { const L = read(), d = L.reduce((x, l) => x + l.debit, 0), k = L.reduce((x, l) => x + l.kredit, 0), okb = L.length >= 2 && d > 0 && Math.abs(d - k) < 0.005;
    $('#jsum').innerHTML = `Debit ${rp(d)} · Kredit ${rp(k)} · <b class="${okb ? 'ok' : 'bad'}">${okb ? 'Seimbang' : 'Selisih ' + rp(d - k)}</b>`; $('#ok').disabled = !okb; };
  $('#jl').oninput = upd;
  $('#jl').onclick = e => { if (e.target.dataset.rm !== undefined && $$('#jl tr').length > 3) { e.target.closest('tr').remove(); upd(); } };
  $('#jadd').onclick = () => { $('#jl').insertAdjacentHTML('beforeend', line()); };
  upd();
  $('#ok').onclick = () => { const tg = $('#jt').value; if (!tg) return toast('Tanggal wajib diisi', true); const ket = $('#jk').value.trim() || 'Jurnal manual';
    run(() => post({ tanggal: tg, nomor: nextNo('JU', tg), keterangan: ket, sumber: 'JU', lines: read() }), 'Jurnal tersimpan'); };
}

function pLaporan() {
  const tabs = [['labarugi', 'Laba Rugi'], ['neraca', 'Neraca'], ['saldo', 'Neraca Saldo'], ['bukubesar', 'Buku Besar']];
  const needFrom = st.tab !== 'neraca' && st.tab !== 'saldo';
  let body = '';
  if (st.tab === 'labarugi') {
    const r = labaRugi(st.from, st.to), sec = (t, rows, tot) => `<tr class="h"><td colspan="2">${t}</td></tr>${rows.filter(x => x.s).map(x => `<tr><td style="padding-left:22px">${esc(x.a.kode)} · ${esc(x.a.nama)}</td><td class="r">${rp(x.s)}</td></tr>`).join('')}<tr class="t"><td>Total ${t}</td><td class="r">${rp(tot)}</td></tr>`;
    body = `<table id="rep"><tr><th colspan="2">Laba Rugi ${tgl(st.from)} s/d ${tgl(st.to)}</th></tr>${sec('Pendapatan', r.pend, r.tp)}${sec('Beban', r.beban, r.tb)}<tr class="t"><td>${r.laba >= 0 ? 'Laba' : 'Rugi'} Bersih</td><td class="r ${r.laba < 0 ? 'bad' : 'ok'}">${rp(r.laba)}</td></tr></table>`;
  } else if (st.tab === 'neraca') {
    const m = sums(null, st.to), A = byTipe('Aset', m), K = byTipe('Kewajiban', m), E = byTipe('Ekuitas', m), lr = labaRugi(null, st.to);
    const ta = A.reduce((x, r) => x + r.s, 0), tk = K.reduce((x, r) => x + r.s, 0), te = E.reduce((x, r) => x + r.s, 0) + lr.laba;
    const sec = (t, rows) => `<tr class="h"><td colspan="2">${t}</td></tr>${rows.filter(x => x.s).map(x => `<tr><td style="padding-left:22px">${esc(x.a.kode)} · ${esc(x.a.nama)}</td><td class="r">${rp(x.s)}</td></tr>`).join('')}`;
    body = `<table id="rep"><tr><th colspan="2">Neraca per ${tgl(st.to)}</th></tr>${sec('Aset', A)}<tr class="t"><td>Total Aset</td><td class="r">${rp(ta)}</td></tr>${sec('Kewajiban', K)}<tr class="t"><td>Total Kewajiban</td><td class="r">${rp(tk)}</td></tr>${sec('Ekuitas', E)}<tr><td style="padding-left:22px">Laba (rugi) berjalan</td><td class="r">${rp(lr.laba)}</td></tr><tr class="t"><td>Total Ekuitas</td><td class="r">${rp(te)}</td></tr><tr class="t"><td>Total Kewajiban + Ekuitas</td><td class="r">${rp(tk + te)}</td></tr></table>
    <p class="${Math.abs(ta - tk - te) < 0.5 ? 'ok' : 'bad'}">${Math.abs(ta - tk - te) < 0.5 ? '✓ Neraca seimbang' : '✗ Neraca tidak seimbang, selisih ' + rp(ta - tk - te)}</p>`;
  } else if (st.tab === 'saldo') {
    const m = sums(null, st.to); let td = 0, tk = 0;
    const rows = S.Akun.slice().sort((a, b) => a.kode.localeCompare(b.kode)).map(a => { const o = m[a.kode] || { d: 0, k: 0 }, net = o.d - o.k; if (!net) return ''; const d = net > 0 ? net : 0, k = net < 0 ? -net : 0; td += d; tk += k; return `<tr><td>${esc(a.kode)}</td><td>${esc(a.nama)}</td><td class="r">${d ? rp(d) : ''}</td><td class="r">${k ? rp(k) : ''}</td></tr>`; }).join('');
    body = `<table id="rep"><tr><th>Kode</th><th>Akun</th><th class="r">Debit</th><th class="r">Kredit</th></tr>${rows}<tr class="t"><td colspan="2">Total per ${tgl(st.to)}</td><td class="r">${rp(td)}</td><td class="r">${rp(tk)}</td></tr></table>`;
  } else {
    if (!st.bb || !akunBy(st.bb)) st.bb = (S.Akun[0] || {}).kode || '';
    const a = akunBy(st.bb);
    if (a) {
      const dn = DEBIT_NORMAL[a.tipe], mo = sums(null, null);
      const before = S.Jurnal.filter(j => j.kode_akun === a.kode && j.tanggal < st.from).reduce((x, j) => x + (dn ? j.debit - j.kredit : j.kredit - j.debit), 0);
      let run = before;
      const rows = S.Jurnal.filter(j => j.kode_akun === a.kode && j.tanggal >= st.from && j.tanggal <= st.to).sort((x, y) => x.tanggal.localeCompare(y.tanggal) || x.id.localeCompare(y.id))
        .map(j => { run += dn ? j.debit - j.kredit : j.kredit - j.debit; return `<tr><td>${tgl(j.tanggal)}</td><td>${esc(j.nomor)}</td><td>${esc(j.keterangan)}</td><td class="r">${j.debit ? rp(j.debit) : ''}</td><td class="r">${j.kredit ? rp(j.kredit) : ''}</td><td class="r">${rp(run)}</td></tr>`; }).join('');
      body = `<table id="rep"><tr><th>Tanggal</th><th>Nomor</th><th>Keterangan</th><th class="r">Debit</th><th class="r">Kredit</th><th class="r">Saldo</th></tr><tr class="h"><td colspan="5">Saldo awal ${tgl(st.from)}</td><td class="r">${rp(before)}</td></tr>${rows}<tr class="t"><td colspan="5">Saldo akhir ${tgl(st.to)}</td><td class="r">${rp(run)}</td></tr></table>`;
    } else body = empty('Belum ada akun');
  }
  return `<h2>Laporan</h2><p class="fin-sub">Dihitung langsung dari jurnal</p>
  <div class="tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
  <div class="bar">${st.tab === 'bukubesar' ? sel('bb', akunOpts(), st.bb, 'id="bb" style="width:auto"') : ''}
  ${needFrom ? `<label class="mut">Dari <input type="date" id="rf" value="${st.from}"></label>` : ''}<label class="mut">${needFrom ? 'Sampai' : 'Per tanggal'} <input type="date" id="rt" value="${st.to}"></label>
  <span class="sp"></span><button id="csv">Unduh CSV</button><button id="prn">Cetak</button></div>
  <div class="panel" style="padding:0">${body}</div>`;
}
function bindLaporan() {
  $$('[data-tab]').forEach(el => el.onclick = () => { st.tab = el.dataset.tab; render(); });
  if ($('#rf')) $('#rf').onchange = e => { st.from = e.target.value; render(); };
  $('#rt').onchange = e => { st.to = e.target.value; render(); };
  if ($('#bb')) $('#bb').onchange = e => { st.bb = e.target.value; render(); };
  $('#prn').onclick = () => window.print();
  $('#csv').onclick = () => {
    const t = $('#rep'); if (!t) return;
    const csv = $$('tr', t).map(tr => $$('th,td', tr).map(c => '"' + c.textContent.replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'laporan-' + st.tab + '.csv'; a.click();
  };
}

function pPengaturan() {
  return `<h2>Pengaturan</h2><p class="fin-sub">Sambungan database Google Spreadsheet</p>
  <div class="panel"><h3>Mode saat ini: ${Store.live ? 'Google Spreadsheet' : 'Demo (data hanya di browser ini)'}</h3>
  ${Store.live ? '' : '<div class="note">Anda sedang memakai data contoh yang tersimpan di browser. Isi URL Web App dan token di bawah untuk memakai Google Spreadsheet.</div>'}
  <form id="cf" class="f"><div class="full"><label>URL Web App Apps Script (berakhiran /exec)</label><input name="url" value="${esc(saved.url || CONFIG.API_URL)}" placeholder="https://script.google.com/macros/s/…/exec"></div>
  <div class="full"><label>Token (sama dengan TOKEN di Code.gs)</label><input name="token" type="password" value="${esc(saved.token || CONFIG.TOKEN)}" autocomplete="off"></div></form>
  <div class="bar" style="margin-top:12px"><button class="pri" id="svc">Simpan &amp; muat ulang</button><button id="tst">Tes koneksi</button>${Store.live ? '<button id="off">Kembali ke mode demo</button>' : '<button class="dan" id="rst">Reset data demo</button>'}</div></div>
  <div class="panel"><h3>Catatan keamanan</h3><p class="mut" style="margin:0">Token disimpan di browser perangkat ini dan dikirim ke Apps Script pada setiap permintaan. Jangan menaruh token asli di file yang dipublikasikan ke repositori GitHub publik; isi lewat halaman ini saja.</p></div>`;
}
function bindPengaturan() {
  const get = () => Object.fromEntries(new FormData($('#cf')));
  $('#svc').onclick = () => { const v = get(); localStorage.setItem('velqo_cfg', JSON.stringify({ url: v.url.trim(), token: v.token.trim() })); location.reload(); };
  $('#tst').onclick = async () => { const v = get(); try { const r = await fetch(v.url.trim() + '?action=all&token=' + encodeURIComponent(v.token.trim())); const j = await r.json(); j.ok ? toast('Koneksi berhasil: ' + j.data.Akun.length + ' akun terbaca') : toast(j.error, true); } catch (e) { toast('Gagal terhubung: ' + e.message, true); } };
  if ($('#off')) $('#off').onclick = () => { localStorage.removeItem('velqo_cfg'); location.reload(); };
  if ($('#rst')) $('#rst').onclick = () => { if (confirm('Hapus semua data demo?')) { localStorage.removeItem('velqo_demo'); location.reload(); } };
}

/* ============ ROUTER ============ */
const pages = {
  dashboard: [pDashboard, () => {}],
  kasbank: [pKasBank, bindKasBank],
  penjualan: [() => pFaktur('penjualan'), () => bindFaktur('penjualan')],
  pembelian: [() => pFaktur('pembelian'), () => bindFaktur('pembelian')],
  akun: [pAkun, bindAkun],
  jurnal: [pJurnal, bindJurnal],
  laporan: [pLaporan, bindLaporan],
  pengaturan: [pPengaturan, bindPengaturan]
};
let ready = false;
function render() {
  const r = (location.hash || '#dashboard').slice(1);
  const key = pages[r] ? r : 'dashboard';
  $$('.fin-tabs a').forEach(a => {
    if (a.dataset.r === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (!ready && key !== 'pengaturan') return;
  try { $('#fin-view').innerHTML = pages[key][0](); pages[key][1](); }
  catch (e) { $('#fin-view').innerHTML = `<div class="note">Terjadi kesalahan menampilkan halaman: ${esc(e.message)}</div>`; console.error(e); }
}
window.addEventListener('hashchange', render);
(async function boot() {
  const tag = $('#modeTag'); tag.textContent = Store.live ? 'Terhubung ke Spreadsheet' : 'Mode demo'; tag.classList.toggle('live', Store.live);
  try { await Store.loadAll(); ready = true; }
  catch (e) {
    $('#fin-view').innerHTML = `<h2>Gagal memuat data</h2><div class="note">${esc(e.message)}<br>Periksa URL Web App dan token di tab <a href="#pengaturan">Pengaturan</a>, dan pastikan fungsi <code>setup()</code> sudah dijalankan.</div>`;
    return;
  }
  render();
})();
