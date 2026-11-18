/*
  Halaman Operasional: rencana kegiatan, tugas, dan catatan rapat dalam satu garis waktu.

  Penyimpanan: Store di bawah memakai localStorage (data hanya ada di browser ini).
  Untuk dipakai bersama tim, ganti isi Store.load/Store.save dengan panggilan ke Apps Script
  (pola yang sama seperti assets/js/agenda-api.js). Bagian lain file ini tidak perlu diubah.

  Bentuk satu entri:
  { id, jenis: 'rencana' | 'tugas' | 'rapat', judul, tanggal 'TTTT-BB-HH', selesai, waktu 'HH:MM',
    orang (penanggung jawab / peserta), catatan, done (tugas), doneAt (tanggal tugas diselesaikan) }
*/
(function () {
  'use strict';

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const JENIS = { rencana: 'Rencana kegiatan', tugas: 'Tugas', rapat: 'Catatan rapat' };
  const LABEL = {
    rencana: { tanggal: 'Tanggal mulai *', orang: 'Penanggung jawab', catatan: 'Catatan' },
    tugas: { tanggal: 'Tenggat *', orang: 'Penanggung jawab', catatan: 'Catatan' },
    rapat: { tanggal: 'Tanggal rapat *', orang: 'Peserta', catatan: 'Hasil rapat dan keputusan' }
  };

  /* ---------- Penyimpanan ---------- */
  const KEY = 'velqo_operasional';
  const Store = {
    load() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } },
    save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
  };

  /* ---------- Util ---------- */
  const $ = id => document.getElementById(id);
  const pad = n => (n < 10 ? '0' : '') + n;
  const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const todayKey = () => key(new Date());
  const shortDate = k => { const d = parse(k); return d.getDate() + ' ' + BLN[d.getMonth()]; };
  const fullDate = k => { const d = parse(k); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear(); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const newId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  let items = Store.load();
  let filter = 'semua';
  let editing = null;

  const isDone = x => x.jenis === 'tugas' && !!x.done;
  const isLate = x => x.jenis === 'tugas' && !x.done && x.tanggal < todayKey();
  const cmp = (a, b) => a.tanggal.localeCompare(b.tanggal) || (a.waktu || '').localeCompare(b.waktu || '') || a.judul.localeCompare(b.judul, 'id');

  /* ---------- Tampilan ---------- */
  function renderSummary() {
    const t = todayKey(), box = $('ops-summary');
    box.textContent = '';
    const open = items.filter(x => x.jenis === 'tugas' && !x.done).length;
    const late = items.filter(isLate).length;
    const plan = items.filter(x => x.jenis === 'rencana' && (x.selesai || x.tanggal) >= t).length;
    const meet = items.filter(x => x.jenis === 'rapat').length;
    [['Tugas belum selesai', open, ''], ['Terlambat', late, late ? 'bad' : ''], ['Rencana mendatang', plan, ''], ['Catatan rapat', meet, '']].forEach(r => {
      const d = el('div', r[2]); d.appendChild(el('b', null, r[1])); d.appendChild(el('span', null, r[0])); box.appendChild(d);
    });
  }

  function buildItem(x) {
    const li = el('li', 'tl-item t-' + x.jenis + (isDone(x) ? ' done' : ''));
    li.appendChild(el('span', 'tl-mark')).setAttribute('aria-hidden', 'true');
    const card = el('div', 'tl-card');

    let when = x.selesai && x.selesai > x.tanggal ? shortDate(x.tanggal) + ' – ' + fullDate(x.selesai) : fullDate(x.tanggal);
    if (x.waktu) when += ', ' + x.waktu;
    card.appendChild(el('div', 'tl-when', (x.jenis === 'tugas' ? 'Tenggat ' : '') + when));
    card.appendChild(el('h3', 'tl-title', x.judul));
    card.appendChild(el('span', 'tl-kind', JENIS[x.jenis]));
    if (x.orang) card.appendChild(el('div', 'tl-meta', (x.jenis === 'rapat' ? 'Peserta: ' : 'Penanggung jawab: ') + x.orang));
    if (x.catatan) card.appendChild(el('p', 'tl-text', x.catatan));

    const foot = el('div', 'tl-foot');
    if (x.jenis === 'tugas') {
      const lb = el('label', 'tl-check'), cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!x.done;
      cb.addEventListener('change', function () { toggleDone(x.id, cb.checked); });
      lb.appendChild(cb);
      lb.appendChild(el('span', null, x.done ? 'Selesai' + (x.doneAt ? ' ' + shortDate(x.doneAt) : '') : 'Tandai selesai'));
      foot.appendChild(lb);
      if (isLate(x)) foot.appendChild(el('span', 'tl-late', 'Terlambat ' + daysBetween(x.tanggal, todayKey()) + ' hari'));
    }
    foot.appendChild(el('span', 'spacer'));
    const edit = el('button', 'btn btn-sm', 'Ubah');
    edit.type = 'button';
    edit.setAttribute('aria-label', 'Ubah: ' + x.judul);
    edit.addEventListener('click', function () { openForm(x); });
    foot.appendChild(edit);
    card.appendChild(foot);
    li.appendChild(card);
    return li;
  }

  function render() {
    renderSummary();
    const ol = $('timeline'), t = todayKey();
    ol.textContent = '';
    const list = items.filter(x => filter === 'semua' || x.jenis === filter).sort(cmp);

    if (!list.length) {
      const msg = items.length ? 'Tidak ada entri pada jenis ini.' : 'Belum ada entri. Klik “Tambah” untuk mencatat rencana, tugas, atau hasil rapat pertama.';
      ol.appendChild(el('li', 'tl-empty', msg));
      return;
    }

    let month = '', todayDone = false;
    const putToday = () => {
      const li = el('li', 'tl-today'); li.appendChild(el('span', null, 'Hari ini, ' + fullDate(t)));
      ol.appendChild(li); todayDone = true;
    };
    list.forEach(x => {
      if (!todayDone && x.tanggal >= t) {
        if (x.tanggal.slice(0, 7) !== month) { month = x.tanggal.slice(0, 7); const d = parse(x.tanggal); ol.appendChild(el('li', 'tl-month', BULAN[d.getMonth()] + ' ' + d.getFullYear())); }
        putToday();
      }
      const m = x.tanggal.slice(0, 7);
      if (m !== month) { month = m; const d = parse(x.tanggal); ol.appendChild(el('li', 'tl-month', BULAN[d.getMonth()] + ' ' + d.getFullYear())); }
      ol.appendChild(buildItem(x));
    });
    if (!todayDone) putToday();

    const now = ol.querySelector('.tl-today');
    if (now && !window.__opsScrolled) { window.__opsScrolled = true; if (list.length > 6) now.scrollIntoView({ block: 'center' }); }
  }

  /* ---------- Aksi ---------- */
  function persist() {
    if (!Store.save(items)) alert('Data tidak dapat disimpan: penyimpanan browser dimatikan atau penuh.');
    render();
  }
  function toggleDone(id, done) {
    items = items.map(x => x.id === id ? Object.assign({}, x, { done: done, doneAt: done ? todayKey() : '' }) : x);
    persist();
  }

  /* ---------- Formulir ---------- */
  const dlg = $('ops-dialog'), form = $('ops-form'), err = $('ops-error'), del = $('ops-del');
  let delArmed = false, delTimer = null;

  function resetDel() { delArmed = false; clearTimeout(delTimer); del.textContent = 'Hapus'; }
  function syncLabels() {
    const j = form.elements.jenis.value, l = LABEL[j];
    $('l-tanggal').textContent = l.tanggal; $('l-orang').textContent = l.orang; $('l-catatan').textContent = l.catatan;
    $('w-selesai').hidden = j !== 'rencana';
    $('w-waktu').hidden = j === 'tugas';
  }
  function openForm(x) {
    editing = x || null;
    form.reset(); resetDel(); err.hidden = true;
    $('ops-dlg-title').textContent = editing ? 'Ubah entri' : 'Tambah entri';
    del.hidden = !editing;
    const f = form.elements;
    if (editing) {
      f.jenis.value = editing.jenis; f.judul.value = editing.judul; f.tanggal.value = editing.tanggal;
      f.selesai.value = editing.selesai || ''; f.waktu.value = editing.waktu || '';
      f.orang.value = editing.orang || ''; f.catatan.value = editing.catatan || '';
    } else {
      f.jenis.value = filter === 'semua' ? 'rencana' : filter;
      f.tanggal.value = todayKey();
    }
    syncLabels();
    dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
    f.judul.focus();
  }
  function closeForm() { dlg.close ? dlg.close() : dlg.removeAttribute('open'); }
  function fail(msg, field) { err.textContent = msg; err.hidden = false; if (field) form.elements[field].focus(); }

  form.elements.jenis.addEventListener('change', syncLabels);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const f = form.elements, jenis = f.jenis.value, judul = f.judul.value.trim(), tanggal = f.tanggal.value, selesai = jenis === 'rencana' ? f.selesai.value : '';
    if (!judul) return fail('Judul wajib diisi.', 'judul');
    if (!tanggal) return fail('Tanggal wajib diisi.', 'tanggal');
    if (selesai && selesai < tanggal) return fail('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'selesai');
    const rec = {
      jenis: jenis, judul: judul, tanggal: tanggal, selesai: selesai && selesai !== tanggal ? selesai : '',
      waktu: jenis === 'tugas' ? '' : f.waktu.value, orang: f.orang.value.trim(), catatan: f.catatan.value.trim()
    };
    if (editing) {
      const keep = jenis === 'tugas' ? { done: !!editing.done, doneAt: editing.doneAt || '' } : {};
      items = items.map(x => x.id === editing.id ? Object.assign({ id: x.id }, rec, keep) : x);
    } else {
      items.push(Object.assign({ id: newId() }, rec, jenis === 'tugas' ? { done: false, doneAt: '' } : {}));
    }
    closeForm(); persist();
  });

  del.addEventListener('click', function () {
    if (!editing) return;
    if (!delArmed) { delArmed = true; del.textContent = 'Klik lagi untuk menghapus'; delTimer = setTimeout(resetDel, 4000); return; }
    const id = editing.id; resetDel();
    items = items.filter(x => x.id !== id);
    closeForm(); persist();
  });

  $('ops-add').addEventListener('click', function () { openForm(null); });
  $('ops-cancel').addEventListener('click', closeForm);
  $('ops-x').addEventListener('click', closeForm);
  dlg.addEventListener('close', resetDel);

  document.querySelectorAll('.ops-filter button').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.dataset.f;
      document.querySelectorAll('.ops-filter button').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      render();
    });
  });

  render();
})();
