/*
  DATA AGENDA VELQO
  Edit file ini untuk menambah, mengubah, atau menghapus agenda. Kalender di beranda membacanya otomatis.

  tanggal : wajib, format 'TTTT-BB-HH', contoh '2026-10-28'
  judul   : wajib, nama agenda
  waktu   : opsional, contoh '09:00' atau '09:00 - 11:00'
  selesai : opsional, tanggal akhir untuk agenda beberapa hari, contoh '2026-10-30'
  unit    : opsional, 'Keuangan', 'Operasional', 'Internal Control', atau kosong untuk umum
  catatan : opsional, keterangan singkat

  Contoh (hapus tanda komentar untuk mencoba):
  { tanggal: '2026-10-28', waktu: '09:00', judul: 'Rapat evaluasi bulanan', unit: 'Operasional', catatan: 'Ruang rapat utama' },

  Nanti jika agenda dipindah ke database, cukup isi window.VELQO_AGENDA dari database;
  kalender di home.js tidak perlu diubah.
*/
window.VELQO_AGENDA = [
];
