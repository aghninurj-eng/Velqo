/**
 * Backend Agenda Velqo - Google Apps Script
 *
 * Pasang di Spreadsheet BARU khusus agenda (terpisah dari Spreadsheet keuangan, supaya token
 * staf yang mengisi kalender tidak membuka data keuangan):
 *   1. Buat Google Spreadsheet baru, misalnya "Velqo Agenda".
 *   2. Extensions > Apps Script, tempel seluruh isi file ini.
 *   3. Project Settings > Script Properties > Add: nama TOKEN, isi kata sandi acak Anda.
 *   4. Pilih fungsi setup, klik Run (sekali), setujui izin yang diminta.
 *   5. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Salin URL /exec.
 * Langkah lengkap ada di README.md di folder ini.
 */

// Disarankan: isi TOKEN lewat Script Properties (langkah 3) supaya tidak ikut ter-commit ke GitHub.
// Bila properti TOKEN ada, nilainya dipakai dan baris di bawah diabaikan.
const TOKEN = 'GANTI_TOKEN_RAHASIA';

// Naikkan angka ini setiap Code.gs diubah. Halaman beranda memakainya untuk mendeteksi deployment lama.
const VERSI = 1;

const SHEET_NAME = 'Agenda';
const HEADERS = ['id', 'tanggal', 'selesai', 'waktu', 'judul', 'unit', 'catatan', 'pembuat', 'dibuat'];
const UNIT = ['', 'Keuangan', 'Operasional', 'Internal Control']; // '' = Umum
const EDITABLE = ['tanggal', 'selesai', 'waktu', 'judul', 'unit', 'catatan', 'pembuat'];

/** Jalankan SEKALI dari editor: membuat sheet Agenda, header, dan format teks. Data lama tidak dihapus. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
  }
  // Semua kolom dipaksa teks agar "2026-10-28" dan "09:00" tidak diubah Sheets menjadi tanggal/jam,
  // dan isi yang diawali "=" tidak dijalankan sebagai rumus.
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), HEADERS.length).setNumberFormat('@');
  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function doGet(e) {
  try {
    const ae = authError_(e.parameter.token);
    if (ae) return json_({ ok: false, error: ae });
    if (e.parameter.action === 'list') return json_({ ok: true, data: read_() });
    return json_({ ok: true, pesan: 'API Agenda aktif' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const b = JSON.parse(e.postData.contents);
    const ae = authError_(b.token);
    if (ae) return json_({ ok: false, error: ae });
    if (b.action === 'add') return json_({ ok: true, item: append_(b.item || {}) });
    if (b.action === 'update') return json_({ ok: true, item: update_(b.id, b.patch || {}) });
    if (b.action === 'remove') { remove_(b.id); return json_({ ok: true }); }
    return json_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) { /* kunci belum sempat diambil */ }
  }
}

/* ---------- Token ---------- */

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

/** Diagnostik: pilih cekToken > Run, lalu lihat Execution log. Token tidak ditampilkan utuh. */
function cekToken() {
  const prop = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const real = token_();
  const mask = real.length > 2 ? real.charAt(0) + '***' + real.charAt(real.length - 1) : '(terlalu pendek)';
  Logger.log('Versi kode: ' + VERSI);
  Logger.log('Sumber token: ' + (prop ? 'Script Properties (mengalahkan baris TOKEN di kode)' : 'baris TOKEN di kode'));
  Logger.log('Masih bawaan GANTI_TOKEN_RAHASIA: ' + (real === 'GANTI_TOKEN_RAHASIA'));
  Logger.log('Panjang token: ' + real.length + ', tampilan: ' + mask);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(Object.assign({ v: VERSI }, o))).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Sheet ---------- */

function sheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet "' + SHEET_NAME + '" belum ada. Jalankan setup() dulu.');
  return sh;
}

function rowObj_(r) {
  const tz = Session.getScriptTimeZone();
  const o = {};
  HEADERS.forEach(function (h, i) {
    let v = r[i];
    if (v instanceof Date) {
      if (h === 'waktu') v = Utilities.formatDate(v, tz, 'HH:mm');
      else if (h === 'dibuat') v = Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm');
      else v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    }
    o[h] = v == null ? '' : String(v);
  });
  return o;
}

function read_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .filter(function (r) { return r[0] !== '' || r[4] !== ''; })
    .map(rowObj_)
    .sort(function (a, b) {
      if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
      return a.waktu < b.waktu ? -1 : a.waktu > b.waktu ? 1 : 0;
    });
}

function newId_(sh) {
  const last = sh.getLastRow();
  const used = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { used[String(r[0])] = true; });
  let id = '';
  for (let i = 0; i < 5 && (!id || used[id]); i++) id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  if (used[id]) id = Utilities.getUuid().replace(/-/g, ''); // cadangan: UUID penuh, hampir mustahil bentrok
  return id;
}

function append_(input) {
  const c = clean_(input);
  const sh = sheet_();
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), row - sh.getMaxRows());
  c.id = newId_(sh);
  c.dibuat = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const rng = sh.getRange(row, 1, 1, HEADERS.length);
  rng.setNumberFormat('@'); // format teks diatur sebelum nilai ditulis
  rng.setValues([HEADERS.map(function (h) { return c[h]; })]);
  return c;
}

function update_(id, patch) {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) throw new Error('Kegiatan tidak ditemukan');
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(id)) continue;
    const row = i + 2;
    const cur = rowObj_(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
    EDITABLE.forEach(function (k) { if (patch[k] !== undefined) cur[k] = patch[k]; });
    const c = clean_(cur);
    c.id = cur.id;
    c.dibuat = cur.dibuat;
    const rng = sh.getRange(row, 2, 1, EDITABLE.length); // kolom 2..8 = EDITABLE, id dan dibuat tidak diubah
    rng.setNumberFormat('@');
    rng.setValues([EDITABLE.map(function (k) { return c[k]; })]);
    return c;
  }
  throw new Error('Kegiatan tidak ditemukan');
}

function remove_(id) {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) sh.deleteRow(i + 2);
  }
}

/* ---------- Validasi ---------- */

function validDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = s.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
}

// Merapikan dan memeriksa data kegiatan; melempar Error berpesan jelas bila ada yang tidak sah.
function clean_(o) {
  const t = function (v) { return String(v == null ? '' : v).trim(); };
  const c = {
    tanggal: t(o.tanggal), selesai: t(o.selesai), waktu: t(o.waktu), judul: t(o.judul),
    unit: t(o.unit), catatan: t(o.catatan), pembuat: t(o.pembuat)
  };
  if (!c.judul) throw new Error('Nama kegiatan wajib diisi');
  if (c.judul.length > 120) throw new Error('Nama kegiatan maksimal 120 karakter');
  if (!validDate_(c.tanggal)) throw new Error('Tanggal tidak valid (format TTTT-BB-HH)');
  if (c.selesai) {
    if (!validDate_(c.selesai)) throw new Error('Tanggal selesai tidak valid');
    if (c.selesai < c.tanggal) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai');
    if (c.selesai === c.tanggal) c.selesai = '';
  }
  if (c.waktu && !/^([01]\d|2[0-3]):[0-5]\d( - ([01]\d|2[0-3]):[0-5]\d)?$/.test(c.waktu)) {
    throw new Error('Format waktu tidak valid (contoh 09:00 atau 09:00 - 11:00)');
  }
  if (UNIT.indexOf(c.unit) < 0) throw new Error('Unit tidak dikenal');
  if (c.catatan.length > 500) throw new Error('Catatan maksimal 500 karakter');
  if (c.pembuat.length > 60) throw new Error('Nama penginput maksimal 60 karakter');
  return c;
}
