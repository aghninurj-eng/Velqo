# Keuangan Velqo

Halaman keuangan (Ringkasan, Kas & Bank, Penjualan, Pembelian, Persediaan, Daftar Akun, Jurnal Umum, Laporan). Data disimpan di Google Spreadsheet lewat Apps Script (`apps-script/Code.gs`). Tanpa konfigurasi, halaman berjalan dalam mode demo dengan data contoh di browser.

## Persediaan

- **Produk**: kode, nama, satuan, stok minimum. Dikelola di tab Persediaan.
- **Pembelian**: pilih "Barang persediaan", isi produk, qty, dan harga satuan. Stok bertambah dan jurnal otomatis `Dr 1500 Persediaan`. PPN masukan dicatat terpisah dan tidak masuk nilai stok.
- **Penjualan**: pilih "Barang persediaan". Stok berkurang dan HPP dihitung otomatis pada harga rata-rata, dengan jurnal `Dr 5100 HPP / Cr 1500 Persediaan`. Penjualan ditolak bila stok tidak cukup.
- **Nilai stok** memakai rata-rata bergerak. Total nilai di tab Persediaan selalu dicocokkan dengan saldo akun 1500 di Neraca.
- **Penyesuaian stok**: saldo awal, koreksi hasil opname, dan barang rusak/hilang/dipakai.
- Faktur atau penyesuaian yang barangnya sudah terpakai transaksi lain tidak bisa dihapus (stok akan minus).
- Pilihan "Tanpa produk" tetap tersedia untuk jasa dan transaksi lain.

## Biaya tambahan pembelian (ongkir, admin, dll.)

Di form Pembelian, klik **+ Biaya** untuk menambah baris biaya (nama, jumlah, dicatat sebagai). Biaya ditagihkan di faktur yang sama, jadi menambah total dan hutang ke pemasok.

- **Tambah ke nilai barang** (cocok untuk ongkir, asuransi, bongkar muat): ikut nilai persediaan, dibagi proporsional ke nilai tiap produk di faktur itu, sehingga harga rata-rata produk sudah memuat biaya angkut. Jurnal `Dr 1500 Persediaan`. Pada faktur "Tanpa produk", biaya ini ditambahkan ke akun faktur.
- **Beban: (pilih akun)** (cocok untuk biaya admin): dicatat langsung sebagai beban pada akun yang dipilih, misalnya 5600 Beban Lain-lain, tidak masuk nilai stok.
- PPN 11% dihitung dari subtotal barang saja, tanpa biaya.
- Biaya yang dibayar terpisah ke pihak lain (mis. ke kurir, bukan lewat pemasok) dicatat lewat **Kas & Bank → Kas Keluar**.
- Rincian biaya tampil di detail faktur dan ikut terhapus bersama fakturnya.
- Daftar rincian per baris disimpan di sheet `FakturBiaya` (Code.gs versi 4). Jika Apps Script belum diperbarui, biaya tetap tercatat benar di total faktur, stok, dan jurnal (nama biaya ada di keterangan jurnal); hanya daftar rincian di detail faktur yang belum tersedia.

## Memperbarui Apps Script (wajib setelah fitur persediaan)

Fitur persediaan menambah tiga sheet (`Produk`, `FakturItem`, `Stok`) dan satu aksi baru di backend. Biaya tambahan menambah satu sheet lagi (`FakturBiaya`, Code.gs versi 4), jadi pembaruan di bawah juga wajib untuk fitur biaya.

1. Buka Apps Script spreadsheet-mu, tempel isi `apps-script/Code.gs` yang baru menggantikan isi lama.
2. Token: file ini berisi `TOKEN = 'GANTI_TOKEN_RAHASIA'`. Pilih salah satu:
   - isi ulang nilai `TOKEN` di editor (jangan di-commit ke GitHub), atau
   - lebih aman: **Project Settings → Script Properties → Add script property**, nama `TOKEN`, isi token rahasiamu. Bila properti ini ada, nilainya dipakai dan baris `TOKEN` di kode diabaikan.
3. Pilih fungsi `setup` lalu **Run**. Data lama tidak terhapus; hanya sheet yang belum ada yang dibuat.
4. **Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**. URL Web App tidak berubah.
5. Muat ulang halaman Keuangan. Selama langkah ini belum dilakukan, tab Persediaan menampilkan petunjuk pembaruan dan faktur tetap bisa dibuat dengan subtotal manual.

## Data demo

Mode demo menyimpan data di browser. Bila sebelumnya sudah membuka mode demo, buka **Pengaturan → Reset data demo** agar produk contoh muncul.

## Jika muncul "Token salah" atau "Token belum diatur"

Halaman Pengaturan kini menjelaskan penyebabnya:

- **"Web App yang aktif masih memakai Code.gs lama"**: deployment belum diperbarui. Pakai Deploy → Manage deployments → ikon pensil → Version: New version → Deploy. Jangan membuat "New deployment" karena URL-nya berubah.
- **"Token di Pengaturan tidak sama dengan token di Apps Script"**: jalankan `cekToken()` dari editor Apps Script (pilih fungsi, Run, lalu lihat Execution log). Log menampilkan versi kode, apakah token dibaca dari Script Properties atau dari kode, dan panjang token. Script Properties selalu mengalahkan baris `TOKEN` di kode.
- **"Token belum diatur di Apps Script"**: `TOKEN` masih bernilai `GANTI_TOKEN_RAHASIA` dan Script Properties kosong.

Spasi atau baris baru di awal dan akhir token diabaikan otomatis.

## Tampilan tidak berubah setelah pembaruan

Jika halaman di GitHub Pages terlihat masih versi lama setelah penggabungan, browser kemungkinan memakai cache. Tekan `Ctrl+Shift+R` (di HP: tutup tab lalu buka lagi). Setiap mengubah `keuangan.js` atau `keuangan.css`, naikkan angka `?v=` di `keuangan/index.html` agar cache otomatis diperbarui.
