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
  // Bukti transaksi (v8). File disimpan di folder Google Drive pribadi; sheet ini hanya mencatat metadata dan sidik jari SHA-256.
  // tipe = faktur | kas | jurnal, ref_id = id faktur / id kas / nomor jurnal manual.
  Dokumen:   ['id', 'tipe', 'ref_id', 'kategori', 'nama_file', 'mime', 'ukuran', 'sha256', 'drive_id', 'waktu', 'keterangan'],
  Aset:      ['id', 'kode', 'nama', 'akun', 'tanggal', 'harga', 'nilai_sisa', 'umur_bulan', 'jumlah', 'akum', 'susut_sd', 'faktur_id', 'keterangan'],
};
const CORE = ['Akun', 'Jurnal', 'Faktur', 'KasBank'];
const NUMERIC = ['debit', 'kredit', 'subtotal', 'ppn', 'total', 'terbayar', 'jumlah', 'qty', 'harga', 'nilai', 'stok_min', 'nilai_sisa', 'umur_bulan', 'akum', 'ukuran'];
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
/* ---------- Bukti transaksi (Google Drive) ---------- */
const MAX_DOC = 4 * 1024 * 1024; // 4 MB per file
const DOC_TIPE = ['faktur', 'kas', 'jurnal'];

// Folder induk bukti: Drive Saya > KEUANGAN VELQO 2026 > Bukti Transaksi (nama ada di ROOT_PATH). Bisa dipaksa ke folder lain dengan
// Script Property FOLDER_ROOT = ID folder (bagian akhir URL folder di Drive). Bila folder tidak ditemukan, dibuat folder baru di Drive Saya.
const ROOT_PATH = ['KEUANGAN VELQO 2026', 'Bukti Transaksi'];
function child_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : null; }
function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ROOT');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* folder terhapus: cari lagi */ } }
  let found = null;
  const top = DriveApp.getFoldersByName(ROOT_PATH[0]);
  while (top.hasNext() && !found) { const c = child_(top.next(), ROOT_PATH[1]); if (c) found = c; }
  if (!found) found = DriveApp.createFolder('Velqo - ' + ROOT_PATH[1]);
  props.setProperty('FOLDER_ROOT', found.getId());
  return found;
}
// Subfolder per jenis transaksi (Aset Tetap, Beban, Persediaan, ...). Dipakai bila sudah ada, dibuat bila belum.
function subfolder_(root, name) {
  const n = String(name || 'Lainnya').replace(/[\\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Lainnya';
  return child_(root, n) || root.createFolder(n);
}
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }
// Jenis file ditentukan dari isi file (magic bytes), bukan dari nama atau tipe yang dikirim browser.
function sniff_(b) {
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b.length > 3 && (b[0] & 0xff) === 0xff && (b[1] & 0xff) === 0xd8 && (b[2] & 0xff) === 0xff) return 'image/jpeg';
  if (b.length > 8 && (b[0] & 0xff) === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}
const EXT_ = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function uploadDoc_(b) {
  if (DOC_TIPE.indexOf(b.tipe) < 0) throw new Error('Jenis transaksi tidak dikenal');
  if (!b.ref_id) throw new Error('Transaksi acuan kosong');
  const bytes = Utilities.base64Decode(String(b.data || ''));
  if (!bytes.length) throw new Error('File kosong');
  if (bytes.length > MAX_DOC) throw new Error('File terlalu besar (maksimal 4 MB)');
  const mime = sniff_(bytes);
  if (!mime) throw new Error('Format tidak didukung. Gunakan PDF, JPG, PNG atau WebP.');
  const sha = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
  if (b.sha256 && String(b.sha256).toLowerCase() !== sha) throw new Error('File rusak saat dikirim (sidik jari tidak cocok). Coba unggah ulang.');
  const id = Utilities.getUuid().slice(0, 8);
  // Nama file baku dari aplikasi (mis. 20261105_BILL-202611-0001_Faktur_CV-Maju_01), dibersihkan lagi di sini lalu diberi ekstensi dari isi file.
  const dasar = String(b.nama_baku || b.nama_file || 'bukti').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 90) || 'bukti';
  const dir = subfolder_(folder_(), b.folder);
  let nama = dasar + '.' + EXT_[mime], n = 1;
  while (dir.getFilesByName(nama).hasNext()) { n++; nama = dasar + '_' + n + '.' + EXT_[mime]; } // jangan menimpa file yang sudah ada
  const file = dir.createFile(Utilities.newBlob(bytes, mime, nama));
  const row = { id: id, tipe: b.tipe, ref_id: String(b.ref_id), kategori: String(b.kategori || 'Lainnya').slice(0, 40), nama_file: nama, mime: mime, ukuran: bytes.length, sha256: sha, drive_id: file.getId(), waktu: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'), keterangan: String(b.keterangan || '').slice(0, 200) };
  append_('Dokumen', [row]);
  return { ok: true, doc: row };
}
function docRow_(id) {
  const rows = read_('Dokumen').filter(function (r) { return r.id === String(id); });
  if (!rows.length) throw new Error('Dokumen tidak ditemukan');
  return rows[0];
}
function getDoc_(id) {
  const r = docRow_(id);
  const blob = DriveApp.getFileById(r.drive_id).getBlob();
  return { ok: true, nama_file: r.nama_file, mime: r.mime, data: Utilities.base64Encode(blob.getBytes()) };
}
function delDoc_(id) {
  const r = docRow_(id);
  try { DriveApp.getFileById(r.drive_id).setTrashed(true); } catch (e) { /* file sudah hilang di Drive: tetap hapus catatannya */ }
  remove_('Dokumen', 'id', id);
  return { ok: true };
}

/** Jalankan sekali dari editor setelah menempel Code.gs v8, supaya Google meminta izin akses Drive. */
function izinDrive() { const f = folder_(); Logger.log('Folder bukti: ' + f.getName() + ' ' + f.getUrl()); }

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
    if (b.action === 'upload') return json_(uploadDoc_(b));
    if (b.action === 'getfile') return json_(getDoc_(b.id));
    if (b.action === 'deldoc') return json_(delDoc_(b.id));
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
const VERSI = 9;

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
