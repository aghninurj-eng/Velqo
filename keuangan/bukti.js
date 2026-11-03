/*
  Bukti transaksi: unggah, lihat, verifikasi dan hapus dokumen (foto/PDF) untuk faktur, kas dan jurnal manual.

  Penyimpanan: Google Drive (folder pribadi) lewat Apps Script (Code.gs versi 8); metadata + sidik jari SHA-256 di sheet Dokumen.
  Mode demo menyimpan file di IndexedDB peramban. Foto dikecilkan dulu di peramban (maks. 1600 px) agar cepat dan hemat ruang.
  Sidik jari dihitung saat unggah, diperiksa ulang oleh server, dan dicocokkan lagi setiap kali dokumen dibuka,
  sehingga bukti yang diganti atau rusak ketahuan.
  Bergantung pada keuangan.js.
*/
(function () {
  'use strict';
  const MAX = 4 * 1024 * 1024;
  const KAT = {
    faktur: ['Faktur / invoice', 'Bukti pembayaran', 'Surat jalan / resi', 'Tangkapan layar marketplace', 'Lainnya'],
    kas: ['Bukti transfer', 'Nota / kwitansi', 'Mutasi rekening', 'Lainnya'],
    jurnal: ['Dokumen pendukung', 'Lainnya']
  };
  const needDoc = () => { if (Store.live && Store.ver < 8) throw new Error('Unggah bukti butuh Code.gs versi 8. Tempel Code.gs terbaru di Apps Script, jalankan setup() dan izinDrive(), lalu Deploy → Manage deployments → New version.'); };
  const docsOf = (tipe, ref) => (S.Dokumen || []).filter(d => d.tipe === tipe && String(d.ref_id) === String(ref));
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  /* ---------- Penyimpanan lokal untuk mode demo ---------- */
  const idb = () => new Promise((res, rej) => { const q = indexedDB.open('velqo_demo_files', 1); q.onupgradeneeded = () => q.result.createObjectStore('f'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const idbPut = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const idbGet = async k => { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction('f').objectStore('f').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
  const idbDel = async k => { const db = await idb(); return new Promise(res => { const t = db.transaction('f', 'readwrite'); t.objectStore('f').delete(k); t.oncomplete = res; }); };

  /* ---------- Berkas ---------- */
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  async function sha256(bytes) {
    if (!(crypto && crypto.subtle)) throw new Error('Peramban tidak mendukung SHA-256 (buka lewat https)');
    return hex(await crypto.subtle.digest('SHA-256', bytes));
  }
  const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  function sniff(u) {
    const a = i => u[i];
    if (u.length > 4 && a(0) === 0x25 && a(1) === 0x50 && a(2) === 0x44 && a(3) === 0x46) return 'application/pdf';
    if (u.length > 3 && a(0) === 0xff && a(1) === 0xd8 && a(2) === 0xff) return 'image/jpeg';
    if (u.length > 8 && a(0) === 0x89 && a(1) === 0x50 && a(2) === 0x4e && a(3) === 0x47) return 'image/png';
    if (u.length > 12 && a(0) === 0x52 && a(1) === 0x49 && a(2) === 0x46 && a(3) === 0x46 && a(8) === 0x57 && a(9) === 0x45 && a(10) === 0x42 && a(11) === 0x50) return 'image/webp';
    return '';
  }
  // Foto dikecilkan ke JPEG (maks. 1600 px sisi terpanjang); PDF dipakai apa adanya.
  async function siapkan(file) {
    let u = new Uint8Array(await file.arrayBuffer());
    let mime = sniff(u);
    if (!mime) throw new Error('Format tidak didukung. Gunakan PDF, JPG, PNG atau WebP.');
    let nama = file.name || 'bukti';
    if (mime !== 'application/pdf') {
      try {
        const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
        if (blob && (blob.size < u.length || k < 1)) { u = new Uint8Array(await blob.arrayBuffer()); mime = 'image/jpeg'; nama = nama.replace(/\.\w+$/, '') + '.jpg'; }
      } catch (e) { /* gambar tidak bisa didekode ulang: pakai file asli */ }
    }
    if (u.length > MAX) throw new Error('File terlalu besar (' + kb(u.length) + '). Maksimal 4 MB.');
    return { u, mime, nama };
  }

  /* ---------- Operasi ---------- */
  async function unggah(tipe, ref, file, kategori, ket) {
    needDoc();
    const { u, mime, nama } = await siapkan(file), sha = await sha256(u);
    let doc;
    if (Store.live) {
      const j = await Store.post({ action: 'upload', tipe, ref_id: String(ref), kategori, nama_file: nama, sha256: sha, keterangan: ket, data: toB64(u) });
      doc = j.doc; doc.ukuran = num(doc.ukuran);
    } else {
      doc = { id: uid(), tipe, ref_id: String(ref), kategori, nama_file: nama, mime, ukuran: u.length, sha256: sha, drive_id: '', waktu: new Date().toISOString().slice(0, 19).replace('T', ' '), keterangan: ket };
      await idbPut(doc.id, u);
    }
    S.Dokumen.push(doc); Store.save();
    await catat('unggah bukti', ref_nomor(tipe, ref), kategori + ': ' + nama + ' (' + kb(doc.ukuran) + ')');
    return doc;
  }
  async function ambil(d) {
    let u;
    if (Store.live) { needDoc(); const j = await Store.post({ action: 'getfile', id: d.id }); u = fromB64(j.data); }
    else { u = await idbGet(d.id); if (!u) throw new Error('File demo tidak ditemukan di peramban ini'); }
    return { u, utuh: (await sha256(u)) === d.sha256 };
  }
  async function hapusDok(d) {
    needDoc();
    if (Store.live) await Store.post({ action: 'deldoc', id: d.id }); else await idbDel(d.id);
    S.Dokumen = S.Dokumen.filter(x => x.id !== d.id); Store.save();
    await catat('hapus bukti', ref_nomor(d.tipe, d.ref_id), d.kategori + ': ' + d.nama_file);
  }
  function ref_nomor(tipe, ref) {
    if (tipe === 'faktur') { const f = S.Faktur.find(x => x.id === ref); return f ? f.nomor : ref; }
    if (tipe === 'kas') { const k = S.KasBank.find(x => x.id === ref); return k ? k.nomor : ref; }
    return ref;
  }
  // Transaksi yang punya bukti tidak boleh dihapus diam-diam: bukti dihapus lebih dulu (dan tercatat di Log).
  function cekBuktiHapus(tipe, ref) {
    const n = docsOf(tipe, ref).length;
    if (n) throw new Error('Transaksi ini punya ' + n + ' dokumen bukti. Hapus dokumennya dulu (tombol 📎 Bukti), lalu hapus transaksi.');
  }

  /* ---------- Tampilan ---------- */
  function panelHtml(tipe, ref) {
    const L = docsOf(tipe, ref).sort((a, b) => b.waktu.localeCompare(a.waktu));
    return `<div id="bkt" class="bkt" style="margin-top:14px"><h3 style="margin:0 0 6px">📎 Bukti transaksi ${L.length ? '(' + L.length + ')' : ''}</h3>
      ${L.length ? `<table>${L.map(d => `<tr><td>${esc(d.kategori)}<div class="mut" style="font-size:12px">${esc(d.nama_file)} · ${kb(d.ukuran)} · ${esc(d.waktu.slice(0, 10).split('-').reverse().join('/'))}${d.keterangan ? ' · ' + esc(d.keterangan) : ''}</div></td>
        <td class="r pay-act"><button class="sm" data-bv="${esc(d.id)}">Lihat</button> <button class="sm dan" data-bd="${esc(d.id)}">Hapus</button></td></tr>`).join('')}</table>` : '<div class="mut">Belum ada bukti. Unggah foto nota, bukti transfer, atau PDF.</div>'}
      <div class="f" style="margin-top:8px"><div><label>Jenis bukti</label><select id="bk-kat">${KAT[tipe].map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div><label>Catatan (opsional)</label><input id="bk-ket" maxlength="150" placeholder="mis. nomor referensi bank"></div>
      <div class="full"><label>File (foto atau PDF, maks. 4 MB)</label><input type="file" id="bk-file" accept="image/*,application/pdf"></div>
      <div class="full"><button class="pri" id="bk-up" type="button">Unggah bukti</button> <span class="mut" id="bk-msg"></span></div></div></div>`;
  }
  let bz = false;
  function bindPanel(tipe, ref) {
    const root = $('#bkt'); if (!root) return;
    const again = () => { root.outerHTML = panelHtml(tipe, ref); bindPanel(tipe, ref); refreshBadges(); };
    const msg = t => { const m = $('#bk-msg'); if (m) m.textContent = t || ''; };
    $('#bk-up').onclick = async () => {
      if (bz) return; const fl = $('#bk-file').files[0]; if (!fl) return toast('Pilih file dulu', true);
      bz = true; $('#bk-up').disabled = true; msg('Mengunggah…');
      try { await unggah(tipe, ref, fl, $('#bk-kat').value, $('#bk-ket').value.trim()); toast('Bukti tersimpan'); bz = false; again(); }
      catch (e) { bz = false; toast(e.message || String(e), true); $('#bk-up').disabled = false; msg(''); }
    };
    $$('[data-bv]', root).forEach(b => b.onclick = async () => {
      const d = S.Dokumen.find(x => x.id === b.dataset.bv); if (!d || bz) return;
      const w = window.open('', '_blank'); bz = true; b.disabled = true;
      try {
        const { u, utuh } = await ambil(d);
        const url = URL.createObjectURL(new Blob([u], { type: d.mime }));
        if (w) w.location.href = url; else window.open(url, '_blank');
        toast(utuh ? 'Keaslian terverifikasi: isi file sama dengan saat diunggah' : 'PERINGATAN: isi file berbeda dari saat diunggah (sidik jari tidak cocok)', !utuh);
      } catch (e) { if (w) w.close(); toast(e.message || String(e), true); }
      finally { bz = false; b.disabled = false; }
    });
    $$('[data-bd]', root).forEach(b => b.onclick = async () => {
      const d = S.Dokumen.find(x => x.id === b.dataset.bd); if (!d || bz) return;
      if (!confirm('Hapus bukti "' + d.nama_file + '"? File di Google Drive juga dipindah ke tempat sampah.')) return;
      bz = true; b.disabled = true;
      try { await hapusDok(d); toast('Bukti dihapus'); bz = false; again(); }
      catch (e) { bz = false; b.disabled = false; toast(e.message || String(e), true); }
    });
  }
  // Dialog khusus bukti untuk baris kas / jurnal
  function buktiModal(tipe, ref, judul) { modal('Bukti ' + judul, panelHtml(tipe, ref), '<button data-close>Tutup</button>'); bindPanel(tipe, ref); }
  const badge = (tipe, ref) => { const n = docsOf(tipe, ref).length; return n ? `<span class="tag" title="${n} dokumen bukti">📎${n}</span>` : ''; };
  // Lencana 📎 di daftar ikut diperbarui: segera bila tidak ada dialog, atau saat dialog ditutup.
  function refreshBadges() { if (!dlg.open) render(); else dlg.addEventListener('close', () => render(), { once: true }); }

  Object.assign(window, { docsOf, buktiPanel: panelHtml, bindBukti: bindPanel, buktiModal, buktiBadge: badge, cekBuktiHapus });
})();
