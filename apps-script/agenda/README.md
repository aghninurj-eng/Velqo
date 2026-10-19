# Backend Agenda Velqo (Google Apps Script)

Menyimpan kegiatan kalender di beranda ke Google Spreadsheet. Dibuat terpisah dari backend Keuangan, jadi token staf yang mengisi kalender tidak bisa membuka data keuangan.

Tanpa konfigurasi, kalender berjalan dalam **mode demo**: kegiatan hanya tersimpan di browser masing-masing dan tidak terlihat oleh tim.

## Pemasangan (sekali)

1. Buat Google Spreadsheet baru, misalnya **Velqo Agenda**.
2. **Extensions → Apps Script**, hapus isi bawaan, tempel seluruh isi `Code.gs` dari folder ini.
3. **Project Settings → Script Properties → Add script property**: nama `TOKEN`, isi kata sandi acak (bagikan ke staf yang boleh mengisi kalender). Jangan menulis token di `Code.gs` yang di-commit.
4. Pilih fungsi `setup`, klik **Run**, setujui izin. Sheet `Agenda` dibuat otomatis.
5. **Deploy → New deployment → Web app**. *Execute as*: **Me**. *Who has access*: **Anyone**. Klik Deploy, salin URL yang berakhiran `/exec`.
6. Hubungkan ke halaman beranda, pilih salah satu:
   - Isi `API_URL` di `assets/js/agenda.js` lalu commit. Staf cukup mengisi token sekali.
   - Atau tiap staf klik **Pengaturan** di kalender, isi URL dan token, lalu **Simpan & muat ulang**.
7. Di kalender, klik **Pengaturan → Tes koneksi** untuk memastikan berhasil.

## Memperbarui kode

Setelah `Code.gs` diubah: **Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**. URL `/exec` tidak berubah. Jangan membuat "New deployment" karena URL-nya akan berganti.

## Kolom sheet `Agenda`

| Kolom | Isi |
| --- | --- |
| `id` | dibuat otomatis |
| `tanggal` | `TTTT-BB-HH`, tanggal mulai |
| `selesai` | tanggal akhir untuk kegiatan beberapa hari, kosong bila sehari |
| `waktu` | `09:00` atau `09:00 - 11:00`, kosong bila sepanjang hari |
| `judul` | nama kegiatan |
| `unit` | kosong (Umum), `Keuangan`, `Operasional`, atau `Internal Control` |
| `catatan` | keterangan singkat |
| `pembuat` | nama staf yang menginput |
| `dibuat` | waktu input, diisi otomatis |

Kolom diformat teks. Sebaiknya kegiatan diubah lewat kalender, bukan langsung di sheet.

## Catatan keamanan

- Satu token dipakai bersama. Siapa pun yang memegang token dapat menambah, mengubah, dan menghapus kegiatan siapa saja.
- Token tersimpan di browser tiap staf. Bila token bocor atau staf keluar, ganti nilai `TOKEN` di Script Properties lalu bagikan token baru.
- Jalankan `cekToken()` dari editor bila muncul "Token salah" atau "Token belum diatur"; hasilnya ada di Execution log.
