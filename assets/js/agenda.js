/*
  KONFIGURASI AGENDA VELQO

  API_URL : alamat Web App Apps Script agenda (berakhiran /exec).
            Boleh diisi di sini supaya staf tidak perlu mengetik URL. URL saja tidak cukup untuk
            membaca atau mengubah data, karena setiap permintaan tetap membutuhkan token.
            Kosongkan untuk memakai mode demo (kegiatan hanya tersimpan di browser masing-masing).

  TOKEN   : JANGAN ditulis di file ini (repositori ini ikut terpublikasi). Setiap staf mengisinya
            sekali lewat tombol "Pengaturan" di kalender beranda; tersimpan di browser perangkatnya.

  Cara memasang backend: lihat apps-script/agenda/README.md
*/
window.VELQO_AGENDA_CONFIG = {
  API_URL: ''
};
