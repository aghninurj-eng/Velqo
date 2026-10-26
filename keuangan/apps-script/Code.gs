/**
 * Backend Keuangan - Google Apps Script
 * Tempel seluruh isi file ini di editor Apps Script yang terikat ke Google Spreadsheet,
 * jalankan fungsi setup() sekali, lalu Deploy > Web app.
 */

// GANTI token ini dengan kata sandi acak Anda sendiri. Token yang sama diisi di halaman Pengaturan.
// Alternatif yang lebih aman: simpan di Project Settings > Script Properties dengan nama TOKEN.
// Jika properti itu ada, nilainya dipakai dan baris di bawah diabaikan, sehingga token tidak
// perlu ditulis di kode (dan tidak ikut ter-commit ke GitHub).
const TOKEN = 'GANTI_TOKEN_RAHASIA';

const SHEETS = {
  Akun:      ['kode', 'nama', 'tipe', 'kategori'],
  Jurnal:    ['id', 'tanggal', 'nomor', 'keterangan', 'kode_akun', 'debit', 'kredit', 'sumber', 'ref'],
  Faktur:    ['id', 'jenis', 'nomor', 'tanggal', 'jatuh_tempo', 'pihak', 'keterangan', 'akun', 'subtotal', 'ppn', 'total', 'terbayar'],
  KasBank:   ['id', 'tanggal', 'nomor', 'jenis', 'akun_kas', 'akun_lawan', 'jumlah', 'keterangan'],
  // Persediaan: master produk, rincian barang per faktur, dan buku mutasi stok (qty/nilai bertanda: masuk +, keluar -).
  Produk:    ['id', 'kode', 'nama', 'satuan', 'stok_min'],
  FakturItem:['id', 'faktur_id', 'produk_id', 'qty', 'harga', 'subtotal'],
  // Biaya tambahan faktur pembelian (ongkir, admin, dll). akun = 1500 bila ditambahkan ke nilai persediaan, atau kode akun beban.
  FakturBiaya:['id', 'faktur_id', 'nama', 'jumlah', 'akun'],
  Stok:      ['id', 'tanggal', 'nomor', 'produk_id', 'jenis', 'qty', 'harga', 'nilai', 'keterangan', 'ref'],
  // Daftar aset tetap. harga = harga perolehan total (sudah termasuk biaya yang ditambahkan), akum = akumulasi penyusutan,
  // susut_sd = bulan terakhir yang sudah disusutkan (yyyy-mm), faktur_id = faktur pembelian asalnya.
  // Jejak perubahan: setiap edit atau hapus transaksi dari aplikasi mencatat satu baris di sini.
  Log:       ['id', 'waktu', 'aksi', 'nomor', 'detail'],
  Aset:      ['id', 'kode', 'nama', 'akun', 'tanggal', 'harga', 'nilai_sisa', 'umur_bulan', 'jumlah', 'akum', 'susut_sd', 'faktur_id', 'keterangan'],
};
const CORE = ['Akun', 'Jurnal', 'Faktur', 'KasBank'];
const NUMERIC = ['debit', 'kredit', 'subtotal', 'ppn', 'total', 'terbayar', 'jumlah', 'qty', 'harga', 'nilai', 'stok_min', 'nilai_sisa', 'umur_bulan', 'akum'];
const DECIMAL = ['qty', 'harga', 'stok_min'];

const COA = [
  ['1100', 'Kas', 'Aset', 'Kas & Bank'],
  ['1200', 'Bank BCA', 'Aset', 'Kas & Bank'],
  ['1300', 'Piutang Usaha', 'Aset', 'Piutang'],
  ['1400', 'PPN Masukan', 'Aset', 'Pajak'],
  ['1500', 'Persediaan Barang', 'Aset', 'Persediaan'],
  ['1600', 'Peralatan Kantor', 'Aset', 'Aset Tetap'],
  ['1610', 'Kendaraan', 'Aset', 'Aset Tetap'],
  ['1620', 'Komputer & Elektronik', 'Aset', 'Aset Tetap'],
  ['1630', 'Furnitur & Perlengkapan Tetap', 'Aset', 'Aset Tetap'],
  ['1690', 'Akumulasi Penyusutan', 'Aset', 'Akumulasi Penyusutan'],
  ['2100', 'Hutang Usaha', 'Kewajiban', 'Hutang'],
  ['2200', 'PPN Keluaran', 'Kewajiban', 'Pajak'],
  ['2300', 'Hutang Gaji', 'Kewajiban', 'Hutang Lain'],
  ['3100', 'Modal Pemilik', 'Ekuitas', 'Modal'],
  ['3200', 'Prive', 'Ekuitas', 'Modal'],
  ['4100', 'Pendapatan Penjualan', 'Pendapatan', 'Pendapatan'],
  ['4200', 'Pendapatan Lain-lain', 'Pendapatan', 'Pendapatan Lain'],
  ['5100', 'Harga Pokok Penjualan', 'Beban', 'HPP'],
  ['5200', 'Beban Gaji', 'Beban', 'Beban Operasional'],
  ['5300', 'Beban Sewa', 'Beban', 'Beban Operasional'],
  ['5400', 'Beban Listrik, Air & Internet', 'Beban', 'Beban Operasional'],
  ['5500', 'Beban Perlengkapan', 'Beban', 'Beban Operasional'],
  ['5600', 'Beban Lain-lain', 'Beban', 'Beban Lain'],
  ['5700', 'Beban Penyusutan', 'Beban', 'Beban Operasional'],
];

/** Jalankan SEKALI dari editor: membuat sheet, header, format teks, dan daftar akun awal. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    const headers = SHEETS[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eef7');
      sh.setFrozenRows(1);
    }
    // Kolom non-angka dipaksa teks agar "1100", "2026-10-15", "INV/202610/0001" tidak diubah Sheets.
    headers.forEach(function (h, i) {
      const rng = sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1);
      rng.setNumberFormat(NUMERIC.indexOf(h) >= 0 ? (DECIMAL.indexOf(h) >= 0 ? '#,##0.####' : '#,##0') : '@');
    });
  });
  const akun = ss.getSheetByName('Akun');
  if (akun.getLastRow() < 2) akun.getRange(2, 1, COA.length, 4).setValues(COA);
  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function doGet(e) {
  try {
    const ae = authError_(e.parameter.token);
    if (ae) return json_({ ok: false, error: ae });
    if (e.parameter.action === 'all') {
      const data = {};
      Object.keys(SHEETS).forEach(function (n) {
        // Sheet tambahan (persediaan, aset, log) boleh belum ada: dilewati supaya aplikasi tetap jalan dan menawarkan pembaruan.
        try { data[n] = read_(n); } catch (err) { if (CORE.indexOf(n) >= 0) throw err; }
      });
      return json_({ ok: true, data: data });
    }
    return json_({ ok: true, pesan: 'API Keuangan aktif' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const b = JSON.parse(e.postData.contents);
    const ae = authError_(b.token);
    if (ae) return json_({ ok: false, error: ae });
    if (b.action === 'multi') {
      // Beberapa sheet sekaligus dalam satu kunci, supaya faktur + item + stok + jurnal tersimpan bersama.
      const ops = b.ops || [];
      for (let i = 0; i < ops.length; i++) if (!SHEETS[ops[i].sheet]) return json_({ ok: false, error: 'Sheet tidak dikenal: ' + ops[i].sheet });
      // Pembaruan baris (mis. kolom terbayar di Faktur) ikut satu permintaan. Semua kunci diperiksa dulu sebelum ada yang ditulis.
      const ups = b.updates || [];
      for (let i = 0; i < ups.length; i++) if (!SHEETS[ups[i].sheet]) return json_({ ok: false, error: 'Sheet tidak dikenal: ' + ups[i].sheet });
      const plan = ups.map(function (u) { return { u: u, row: findRow_(u.sheet, u.field, u.value) }; });
      plan.forEach(function (x) { if (x.row < 0) throw new Error('Data tidak ditemukan: ' + x.u.sheet + ' ' + x.u.value); });
      // Penghapusan baris (mis. mengganti transaksi yang diedit) dijalankan lebih dulu, lalu tambah baris, lalu pembaruan.
      const rms = b.removes || [];
      for (let i = 0; i < rms.length; i++) if (!SHEETS[rms[i].sheet]) return json_({ ok: false, error: 'Sheet tidak dikenal: ' + rms[i].sheet });
      rms.forEach(function (r) { remove_(r.sheet, r.field, r.value); });
      ops.forEach(function (op) { append_(op.sheet, op.rows); });
      plan.forEach(function (x) { update_(x.u.sheet, x.u.field, x.u.value, x.u.patch); });
      return json_({ ok: true });
    }
    if (!SHEETS[b.sheet]) return json_({ ok: false, error: 'Sheet tidak dikenal' });
    if (b.action === 'append') append_(b.sheet, b.rows);
    else if (b.action === 'update') update_(b.sheet, b.field, b.value, b.patch);
    else if (b.action === 'remove') remove_(b.sheet, b.field, b.value);
    else return json_({ ok: false, error: 'Aksi tidak dikenal' });
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Naikkan angka ini setiap Code.gs diubah; halaman Keuangan memakainya untuk mendiagnosis deployment yang belum diperbarui.
const VERSI = 7;

function token_() {
  const p = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return String(p || TOKEN).trim(); // spasi/baris baru yang ikut tersalin diabaikan
}

// Mengembalikan pesan galat, atau null bila token benar.
function authError_(t) {
  const real = token_();
  if (!real || real === 'GANTI_TOKEN_RAHASIA') return 'Token belum diatur di Apps Script (masih GANTI_TOKEN_RAHASIA)';
  if (String(t || '').trim() !== real) return 'Token salah';
  return null;
}

/** Diagnostik: jalankan dari editor (pilih cekToken > Run), lalu lihat Execution log. Tidak menampilkan token utuh. */
function cekToken() {
  const prop = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const real = token_();
  const mask = real.length > 2 ? real.charAt(0) + '***' + real.charAt(real.length - 1) : '(terlalu pendek)';
  Logger.log('Versi kode: ' + VERSI);
  Logger.log('Sumber token: ' + (prop ? 'Script Properties (mengalahkan baris TOKEN di kode)' : 'baris TOKEN di kode'));
  Logger.log('Masih bawaan GANTI_TOKEN_RAHASIA: ' + (real === 'GANTI_TOKEN_RAHASIA'));
  Logger.log('Panjang token: ' + real.length + ', tampilan: ' + mask);
  if (prop && prop !== prop.trim()) Logger.log('Catatan: nilai properti punya spasi di awal/akhir (sudah diabaikan otomatis).');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(Object.assign({ v: VERSI }, o))).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" belum ada. Jalankan setup() dulu.');
  return sh;
}

function read_(name) {
  const sh = sheet_(name);
  const headers = SHEETS[name];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, last - 1, headers.length).getValues()
    .filter(function (r) { return r[0] !== '' || r[1] !== ''; })
    .map(function (r) {
      const o = {};
      headers.forEach(function (h, i) {
        let v = r[i];
        if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        o[h] = NUMERIC.indexOf(h) >= 0 ? Number(v) || 0 : String(v);
      });
      return o;
    });
}

function append_(name, rows) {
  if (!rows || !rows.length) return;
  const sh = sheet_(name);
  const headers = SHEETS[name];
  const start = sh.getLastRow() + 1;
  const need = start + rows.length - 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  const values = rows.map(function (r) {
    return headers.map(function (h) { return r[h] === undefined ? '' : r[h]; });
  });
  sh.getRange(start, 1, values.length, headers.length).setValues(values);
}

function findRow_(name, field, value) {
  const sh = sheet_(name), col = SHEETS[name].indexOf(field), last = sh.getLastRow();
  if (col < 0 || last < 2) return -1;
  const keys = sh.getRange(2, col + 1, last - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) if (String(keys[i][0]) === String(value)) return i + 2;
  return -1;
}

function update_(name, field, value, patch) {
  const sh = sheet_(name);
  const headers = SHEETS[name];
  const col = headers.indexOf(field);
  const last = sh.getLastRow();
  if (col < 0 || last < 2) throw new Error('Data tidak ditemukan');
  const keys = sh.getRange(2, col + 1, last - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(value)) {
      Object.keys(patch).forEach(function (k) {
        const c = headers.indexOf(k);
        if (c >= 0) sh.getRange(i + 2, c + 1).setValue(patch[k]);
      });
      return;
    }
  }
  throw new Error('Data tidak ditemukan');
}

function remove_(name, field, value) {
  const sh = sheet_(name);
  const col = SHEETS[name].indexOf(field);
  const last = sh.getLastRow();
  if (col < 0 || last < 2) return;
  const keys = sh.getRange(2, col + 1, last - 1, 1).getValues();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (String(keys[i][0]) === String(value)) sh.deleteRow(i + 2);
  }
}
