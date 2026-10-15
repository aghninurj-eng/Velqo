/**
 * Backend Keuangan - Google Apps Script
 * Tempel seluruh isi file ini di editor Apps Script yang terikat ke Google Spreadsheet,
 * jalankan fungsi setup() sekali, lalu Deploy > Web app.
 */

// GANTI token ini dengan kata sandi acak Anda sendiri. Token yang sama diisi di halaman Pengaturan.
const TOKEN = 'GANTI_TOKEN_RAHASIA';

const SHEETS = {
  Akun:    ['kode', 'nama', 'tipe', 'kategori'],
  Jurnal:  ['id', 'tanggal', 'nomor', 'keterangan', 'kode_akun', 'debit', 'kredit', 'sumber', 'ref'],
  Faktur:  ['id', 'jenis', 'nomor', 'tanggal', 'jatuh_tempo', 'pihak', 'keterangan', 'akun', 'subtotal', 'ppn', 'total', 'terbayar'],
  KasBank: ['id', 'tanggal', 'nomor', 'jenis', 'akun_kas', 'akun_lawan', 'jumlah', 'keterangan'],
};
const NUMERIC = ['debit', 'kredit', 'subtotal', 'ppn', 'total', 'terbayar', 'jumlah'];

const COA = [
  ['1100', 'Kas', 'Aset', 'Kas & Bank'],
  ['1200', 'Bank BCA', 'Aset', 'Kas & Bank'],
  ['1300', 'Piutang Usaha', 'Aset', 'Piutang'],
  ['1400', 'PPN Masukan', 'Aset', 'Pajak'],
  ['1500', 'Persediaan Barang', 'Aset', 'Persediaan'],
  ['1600', 'Peralatan Kantor', 'Aset', 'Aset Tetap'],
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
      rng.setNumberFormat(NUMERIC.indexOf(h) >= 0 ? '#,##0' : '@');
    });
  });
  const akun = ss.getSheetByName('Akun');
  if (akun.getLastRow() < 2) akun.getRange(2, 1, COA.length, 4).setValues(COA);
  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function doGet(e) {
  try {
    if (!authorized_(e.parameter.token)) return json_({ ok: false, error: 'Token salah' });
    if (e.parameter.action === 'all') {
      const data = {};
      Object.keys(SHEETS).forEach(function (n) { data[n] = read_(n); });
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
    if (!authorized_(b.token)) return json_({ ok: false, error: 'Token salah' });
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

function authorized_(t) { return TOKEN !== 'GANTI_TOKEN_RAHASIA' && t === TOKEN; }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
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
