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

## Impor pesanan dari marketplace (tab Penjualan)

Tombol **⬆ Impor dari Marketplace** di tab Penjualan membaca file ekspor pesanan (`.xlsx` atau `.csv`) dari Seller Center dan membuat faktur penjualan sekaligus. File dibaca di browser saja, tidak diunggah ke mana pun.

**Cara pakai**
1. Di Seller Center (Shopee, TikTok Shop, dll.), ekspor pesanan lewat menu Pesanan. Pilih rentang tanggal yang wajar.
2. Klik tombol impor, pilih marketplace, lalu pilih file.
3. **Periksa pemetaan kolom** di bagian "1. Kolom di file". Tebakan otomatis biasanya benar, tapi nama kolom marketplace bisa berubah antar versi, jadi lihat kolom "contoh:" di bawah tiap pilihan. Pilihan pemetaan diingat untuk impor berikutnya.
4. Pilih status pesanan yang diimpor. Otomatis hanya yang **selesai** (Selesai, Completed, Delivered). Batal, retur, belum bayar, dan masih dikirim tidak ikut.
5. Periksa pratinjau, lalu klik **Impor**.

**Yang dibuat**
- Satu No. pesanan = satu faktur penjualan atas nama marketplace, keterangannya `Shopee #<no pesanan> · <pembeli>`, **belum lunas** sampai dana cair. Jatuh tempo mengikuti pengaturan (bawaan 14 hari).
- Nilai penjualan memakai harga **setelah diskon produk**.
- Jika "Cocokkan barang lewat SKU" aktif, SKU di file dicocokkan dengan **Kode produk** di Persediaan: stok berkurang dan HPP dicatat otomatis. SKU yang belum cocok bisa dipetakan manual atau dibuat produk barunya langsung dari pratinjau. Bila dimatikan, hanya pendapatan yang dicatat.
- **Tidak akan dobel**: pesanan yang nomornya sudah pernah diimpor dilewati, jadi aman mengimpor ulang file yang sama atau file yang tumpang tindih.
- Pesanan bertanda "Stok kurang" tidak diimpor. Catat dulu pembelian atau penyesuaian stoknya, lalu impor lagi.
- Jika penyimpanan berhenti di tengah jalan (mis. koneksi putus), pesanan yang sudah masuk tetap aman. Impor ulang file yang sama untuk melanjutkan sisanya.

**Yang belum dicatat otomatis**
- Komisi, biaya layanan, ongkir yang dipotong marketplace, dan voucher penjual. Dana yang cair biasanya lebih kecil dari total faktur; selisihnya dicatat lewat Kas & Bank, Kas Keluar, ke akun beban.
- Perubahan status setelah diimpor (mis. retur setelah pesanan selesai). Faktur yang sudah dibuat tidak diubah otomatis.

**Catatan teknis**
- File Excel `.xls` lama tidak didukung: simpan sebagai `.xlsx` atau `.csv`.
- Jangan membuka lalu menyimpan ulang ekspor lewat Excel bila nomor pesanan sangat panjang (lebih dari 15 digit): Excel memotongnya menjadi `5.77E+17`. Pesanan seperti itu ditolak di pratinjau supaya tidak tertukar.
- Pemetaan SKU manual dan pemetaan kolom disimpan di browser perangkat ini, jadi perlu diulang di perangkat lain.
- Mengimpor ribuan pesanan sekaligus didukung (diuji 3.000 pesanan). Penyimpanan dikirim per 50 pesanan ke Spreadsheet, jadi butuh waktu; pantau teks "Menyimpan ... / ..." di tombol.
- Tombol "Unduh template CSV" di jendela impor menyediakan format paling sederhana bila marketplace tidak menyediakan ekspor yang cocok.

## Aset tetap dan penyusutan

**Beli aset:** di tab **Pembelian**, buat faktur baru dan pilih **Isi faktur: Aset tetap**. Isi nama aset, kategori (Peralatan Kantor, Kendaraan, Komputer & Elektronik, Furnitur & Perlengkapan Tetap), jumlah, harga satuan, umur manfaat dalam bulan, dan nilai sisa. Setiap baris otomatis masuk ke tab **Aset**. Jurnalnya Dr akun aset, Dr PPN Masukan (bila ada), Cr Hutang Usaha. Biaya tambahan seperti ongkir dan instalasi yang dicatat "Tambah ke nilai barang / aset" dibagi proporsional ke harga perolehan tiap aset. Pembayarannya sama seperti pembelian biasa (Bayar di detail faktur), jadi bisa tunai maupun hutang.

**Tab Aset:** daftar aset beserta harga perolehan, akumulasi penyusutan, dan nilai buku. Klik baris untuk melihat rincian dan faktur asalnya.

**Penyusutan:** garis lurus per bulan, (harga perolehan - nilai sisa) / umur bulan, mulai **bulan setelah** tanggal perolehan. Klik **Catat penyusutan**, pilih sampai bulan berapa, periksa pratinjau, lalu catat. Dibuat satu jurnal per bulan (Dr 5700 Beban Penyusutan, Cr 1690 Akumulasi Penyusutan). Bulan yang sudah dicatat dilewati, jadi aman diulang. Faktur pembelian aset yang sudah disusutkan tidak bisa dihapus.

Akun 1610, 1620, 1630, 1690, dan 5700 dibuat otomatis saat pertama dipakai bila belum ada. Fitur ini butuh **Code.gs versi 6** (sheet baru `Aset`): tempel Code.gs, jalankan `setup()`, lalu Deploy, Manage deployments, New version.

Belum tercakup: penjualan atau pelepasan aset, dan aset yang sudah dimiliki sebelum memakai aplikasi ini (saldo awal). Selisih antara saldo akun aset tetap di Neraca dan daftar aset ditampilkan sebagai catatan di tab Aset.

## Unduh laporan ke Excel

Di halaman **Laporan**, pilih periode lalu klik **Unduh Excel**. Satu file `.xlsx` berisi lima lembar: Ringkasan, Laba Rugi, Neraca, Neraca Saldo, dan Buku Besar (semua akun yang bergerak, lengkap dengan saldo awal dan saldo akhir). Tampilannya sudah diformat: judul dan periode, header berwarna, angka berformat ribuan, baris total berupa rumus Excel, panel judul yang membeku, dan siap cetak A4. File dibuat di browser tanpa pustaka luar (`xlsx.js` dan `ekspor.js`).

## Catatan impor pesanan

- Baris tanpa SKU dengan nilai Rp 0 (barang gratis/hadiah di pesanan Shopee) dilewati, tidak membuat pesanan gagal.
- No. resi (No. Resi Shopee, Tracking ID TikTok) dicatat di keterangan faktur: `Shopee #<no pesanan> · <pembeli> · Resi <no resi>`.
- Faktur memakai Harga Setelah Diskon (Shopee) atau SKU Subtotal After Discount (TikTok). Harga awal tidak disimpan terpisah.
- File XLSX TikTok yang menomori semua baris "1" kini terbaca benar.

## Penerimaan dana massal marketplace

Di tab **Penjualan** klik **⬇ Terima Dana Marketplace**, lalu pilih file penghasilan dari Seller Center (Shopee: Penghasilan, Sudah Dilepas; TikTok Shop: Finance, Pendapatan). Format `.xlsx` dan `.csv` dibaca di browser, lembar kerja dan kolom dikenali otomatis dan bisa diubah.

- Tiap baris dicocokkan ke faktur hasil impor pesanan lewat nomor pesanan. Faktur harus sudah ada; pesanan tanpa faktur dilewati dan bisa dicatat setelah diimpor.
- Tiap pesanan membuat satu jurnal: Dr Kas/Saldo marketplace sebesar dana cair, Dr beban per kelompok potongan (komisi, layanan, ongkir, voucher/iklan, pajak, lain), Cr Piutang sebesar sisa faktur. Faktur menjadi lunas.
- Bila pendapatan di file berbeda dari faktur, selisih masuk akun "Selisih Penjualan Marketplace". Selisih besar ditandai **Periksa** dan tidak dipilih otomatis.
- Pesanan retur/batal tanpa dana dan faktur yang sudah lunas dilewati. File yang sama aman diunggah ulang, tidak akan dobel.
- Akun yang disarankan (1210 Saldo Shopee, 1220 Saldo TikTok Shop, 5610 sampai 5690) dibuat otomatis saat disimpan bila belum ada. Akun bisa diganti di pengaturan sebelum disimpan.
- Disimpan per 40 pesanan. Perlu **Code.gs versi 5** agar faktur dan jurnal tersimpan bersamaan. Dengan versi lama tetap jalan tapi lebih lambat dan tidak seatomik itu. Perbarui seperti biasa: tempel Code.gs, lalu Deploy, Manage deployments, New version.

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
