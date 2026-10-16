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

## Memperbarui Apps Script (wajib setelah fitur persediaan)

Fitur persediaan menambah tiga sheet (`Produk`, `FakturItem`, `Stok`) dan satu aksi baru di backend.

1. Buka Apps Script spreadsheet-mu, tempel isi `apps-script/Code.gs` yang baru menggantikan isi lama.
2. Token: file ini berisi `TOKEN = 'GANTI_TOKEN_RAHASIA'`. Pilih salah satu:
   - isi ulang nilai `TOKEN` di editor (jangan di-commit ke GitHub), atau
   - lebih aman: **Project Settings → Script Properties → Add script property**, nama `TOKEN`, isi token rahasiamu. Bila properti ini ada, nilainya dipakai dan baris `TOKEN` di kode diabaikan.
3. Pilih fungsi `setup` lalu **Run**. Data lama tidak terhapus; hanya sheet yang belum ada yang dibuat.
4. **Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**. URL Web App tidak berubah.
5. Muat ulang halaman Keuangan. Selama langkah ini belum dilakukan, tab Persediaan menampilkan petunjuk pembaruan dan faktur tetap bisa dibuat dengan subtotal manual.

## Data demo

Mode demo menyimpan data di browser. Bila sebelumnya sudah membuka mode demo, buka **Pengaturan → Reset data demo** agar produk contoh muncul.
