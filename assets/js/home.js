/*
  Logika halaman beranda: kalender agenda (lihat, tambah, ubah, hapus, cetak) dan pengisi ringkasan.

  Data agenda dibaca dan ditulis lewat window.VelqoAgendaStore (assets/js/agenda-api.js).
  Ringkasan diisi dengan: VelqoHome.setRingkasan('keuangan.utang', 'Rp 1.250.000')
  Nama ('keuangan.utang') harus sama dengan atribut data-ringkasan di index.html.
*/
(function () {
  'use strict';

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const HARI_SENIN = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const HARI_PENUH = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']; // urutan getDay()
  const MAX_CHIP = 2;
  const NAMA_KEY = 'velqo_agenda_nama';

  /* ---------- Ringkasan ---------- */
  window.VelqoHome = {
    setRingkasan: function (nama, nilai) {
      const els = document.querySelectorAll('[data-ringkasan]');
      for (let i = 0; i < els.length; i++) {
        if (els[i].getAttribute('data-ringkasan') === nama) els[i].textContent = nilai;
      }
    }
  };

  const store = window.VelqoAgendaStore;
  const grid = document.getElementById('cal-grid');
  if (!grid || !store) return;

  const $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- Tanggal ---------- */
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function key(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function dateKey(dt) { return key(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
  function isValid(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function parseKey(s) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function longDate(k) {
    const dt = parseKey(k);
    return HARI_PENUH[dt.getDay()] + ', ' + dt.getDate() + ' ' + BULAN[dt.getMonth()] + ' ' + dt.getFullYear();
  }
  function shortDate(k) {
    const dt = parseKey(k);
    return dt.getDate() + ' ' + BULAN_PENDEK[dt.getMonth()];
  }
  function isRange(ev) { return isValid(ev.selesai) && ev.selesai > ev.tanggal; }
  // "20–22 Okt" bila satu bulan, "30 Okt – 2 Nov" bila melewati pergantian bulan.
  function rangeLabel(ev) {
    const a = parseKey(ev.tanggal), b = parseKey(ev.selesai);
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return a.getDate() + '–' + b.getDate() + ' ' + BULAN_PENDEK[a.getMonth()];
    }
    return shortDate(ev.tanggal) + ' – ' + shortDate(ev.selesai);
  }
  function compareEv(a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    const ta = a.waktu || '', tb = b.waktu || '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.judul).localeCompare(String(b.judul), 'id');
  }

  /* ---------- Keadaan ---------- */
  const now = new Date();
  const todayKey = dateKey(now);
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  let selected = todayKey;
  let items = [];
  let byDay = {};
  const status = { loading: true, error: '' };
  let editing = null; // kegiatan yang sedang diubah di formulir, null bila tambah baru

  function setItems(list) {
    items = list;
    byDay = {};
    items.forEach(function (ev) {
      if (!ev || !isValid(ev.tanggal) || !ev.judul) return;
      const start = parseKey(ev.tanggal);
      const end = isRange(ev) ? parseKey(ev.selesai) : start;
      const d = new Date(start.getTime());
      for (let n = 0; d <= end && n < 366; n++) {
        const k = dateKey(d);
        (byDay[k] = byDay[k] || []).push(ev);
        d.setDate(d.getDate() + 1);
      }
    });
    Object.keys(byDay).forEach(function (k) { byDay[k].sort(compareEv); });
  }

  /* ---------- Pemberitahuan singkat ---------- */
  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('ag-toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 6000 : 3000);
  }

  /* ---------- Kalender ---------- */
  function renderCalendar() {
    grid.textContent = '';
    $('cal-title').textContent = BULAN[viewMonth] + ' ' + viewYear;
    $('cal-jump').value = viewYear + '-' + pad(viewMonth + 1);

    HARI.forEach(function (h) { grid.appendChild(el('div', 'cal-dow', h)); });

    const offset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // pekan mulai Senin
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = Math.ceil((offset + days) / 7) * 7;

    for (let i = 0; i < cells; i++) {
      const day = i - offset + 1;
      if (day < 1 || day > days) {
        const blank = el('div', 'cal-blank');
        blank.setAttribute('aria-hidden', 'true');
        grid.appendChild(blank);
        continue;
      }
      grid.appendChild(buildDay(day));
    }
  }

  function buildDay(day) {
    const k = key(viewYear, viewMonth, day);
    const events = byDay[k] || [];
    const btn = el('button', 'cal-day');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', k === selected ? 'true' : 'false');
    if (k === todayKey) btn.setAttribute('aria-current', 'date');
    btn.setAttribute('aria-label', longDate(k) + (events.length ? ', ' + events.length + ' agenda' : ', tidak ada agenda'));

    btn.appendChild(el('span', 'cal-num', day));

    events.slice(0, MAX_CHIP).forEach(function (ev) {
      btn.appendChild(el('span', 'cal-chip', (ev.waktu ? ev.waktu.slice(0, 5) + ' ' : '') + ev.judul));
    });
    if (events.length > MAX_CHIP) btn.appendChild(el('span', 'cal-more', '+' + (events.length - MAX_CHIP) + ' lagi'));

    if (events.length) {
      const dots = el('span', 'cal-dots');
      for (let i = 0; i < Math.min(events.length, 3); i++) dots.appendChild(document.createElement('i'));
      btn.appendChild(dots);
    }

    btn.addEventListener('click', function () {
      selected = k;
      renderAll();
    });
    return btn;
  }

  /* ---------- Daftar agenda ---------- */
  function buildItem(ev) {
    const li = el('li', 'agenda-item');
    let time = ev.waktu || 'Sepanjang hari';
    if (isRange(ev)) {
      time = rangeLabel(ev);
      if (ev.waktu) time += ', ' + ev.waktu;
    }
    li.appendChild(el('div', 'agenda-time', time));

    const body = el('div');
    const name = el('div', 'agenda-name', ev.judul);
    if (ev.unit) name.appendChild(el('span', 'agenda-tag', ev.unit));
    body.appendChild(name);
    if (ev.catatan) body.appendChild(el('div', 'agenda-note', ev.catatan));
    if (ev.pembuat) body.appendChild(el('div', 'agenda-by', 'Diinput oleh ' + ev.pembuat));
    li.appendChild(body);

    const edit = el('button', 'btn btn-sm', 'Ubah');
    edit.type = 'button';
    edit.setAttribute('aria-label', 'Ubah kegiatan: ' + ev.judul);
    edit.addEventListener('click', function () { openForm(ev); });
    li.appendChild(edit);
    return li;
  }

  function buildGroup(k) {
    const group = el('div', 'agenda-group');
    group.appendChild(el('h4', 'agenda-date', longDate(k)));
    const ul = el('ul', 'agenda-items');
    byDay[k].forEach(function (ev) { ul.appendChild(buildItem(ev)); });
    group.appendChild(ul);
    return group;
  }

  function renderAgenda() {
    const list = $('agenda-list');
    list.textContent = '';

    if (selected) {
      $('agenda-title').textContent = 'Agenda ' + longDate(selected);
      $('agenda-all').hidden = false;
    } else {
      $('agenda-title').textContent = 'Agenda ' + BULAN[viewMonth] + ' ' + viewYear;
      $('agenda-all').hidden = true;
    }

    if (status.loading) { list.appendChild(el('p', 'agenda-empty', 'Memuat agenda…')); return; }
    if (status.error) {
      const box = el('div', 'agenda-error');
      box.appendChild(el('p', null, 'Gagal memuat agenda: ' + status.error));
      const row = el('div', 'row');
      const retry = el('button', 'btn', 'Coba lagi');
      retry.type = 'button';
      retry.addEventListener('click', loadItems);
      const cfg = el('button', 'btn', 'Buka Pengaturan');
      cfg.type = 'button';
      cfg.addEventListener('click', openSettings);
      row.appendChild(retry);
      row.appendChild(cfg);
      box.appendChild(row);
      list.appendChild(box);
      return;
    }

    if (selected) {
      if (byDay[selected]) list.appendChild(buildGroup(selected));
      else list.appendChild(el('p', 'agenda-empty', 'Tidak ada agenda pada tanggal ini.'));
      return;
    }

    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    let found = 0;
    for (let d = 1; d <= days; d++) {
      const k = key(viewYear, viewMonth, d);
      if (byDay[k]) { list.appendChild(buildGroup(k)); found++; }
    }
    if (!found) list.appendChild(el('p', 'agenda-empty', 'Belum ada agenda terjadwal di bulan ini.'));
  }

  /* ---------- Tampilan cetak ---------- */
  function renderPrint() {
    const box = $('cal-print');
    box.textContent = '';

    const head = el('div', 'print-head');
    head.appendChild(el('h2', null, 'Kalender Agenda Velqo'));
    head.appendChild(el('p', null, BULAN[viewMonth] + ' ' + viewYear));
    box.appendChild(head);

    const table = el('table', 'print-cal');
    const hr = document.createElement('tr');
    HARI_SENIN.forEach(function (h) { hr.appendChild(el('th', null, h)); });
    const thead = document.createElement('thead');
    thead.appendChild(hr);
    table.appendChild(thead);

    const offset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = Math.ceil((offset + days) / 7) * 7;
    const tbody = document.createElement('tbody');
    let tr = null;
    for (let i = 0; i < cells; i++) {
      if (i % 7 === 0) { tr = document.createElement('tr'); tbody.appendChild(tr); }
      const day = i - offset + 1;
      const td = document.createElement('td');
      if (day < 1 || day > days) {
        td.className = 'out';
      } else {
        td.appendChild(el('div', 'pn', day));
        (byDay[key(viewYear, viewMonth, day)] || []).forEach(function (ev) {
          const line = el('div', 'pe');
          if (ev.waktu) line.appendChild(el('span', 'pt', ev.waktu.slice(0, 5) + ' '));
          line.appendChild(document.createTextNode(ev.judul));
          td.appendChild(line);
        });
      }
      tr.appendChild(td);
    }
    table.appendChild(tbody);
    box.appendChild(table);

    // Daftar rincian: tiap kegiatan sekali, termasuk catatan dan penginput.
    const monthStart = key(viewYear, viewMonth, 1);
    const monthEnd = key(viewYear, viewMonth, days);
    const inMonth = items.filter(function (ev) {
      return isValid(ev.tanggal) && ev.judul && ev.tanggal <= monthEnd && (isRange(ev) ? ev.selesai : ev.tanggal) >= monthStart;
    }).sort(compareEv);

    const list = el('div', 'print-list' + (inMonth.length ? ' break' : ''));
    list.appendChild(el('h3', null, 'Daftar kegiatan'));
    if (!inMonth.length) {
      list.appendChild(el('p', 'print-empty', 'Tidak ada kegiatan terjadwal pada bulan ini.'));
    } else {
      const rows = el('table', 'print-rows');
      const h = document.createElement('tr');
      ['Tanggal', 'Waktu', 'Kegiatan', 'Catatan', 'Diinput oleh'].forEach(function (t) { h.appendChild(el('th', null, t)); });
      const th = document.createElement('thead');
      th.appendChild(h);
      rows.appendChild(th);
      const rb = document.createElement('tbody');
      inMonth.forEach(function (ev) {
        const r = document.createElement('tr');
        const dt = parseKey(ev.tanggal);
        r.appendChild(el('td', null, isRange(ev)
          ? rangeLabel(ev)
          : HARI[(dt.getDay() + 6) % 7] + ', ' + shortDate(ev.tanggal)));
        r.appendChild(el('td', null, ev.waktu || 'Sepanjang hari'));
        const what = el('td', null, ev.judul);
        if (ev.unit) what.appendChild(el('div', 'tag', ev.unit));
        r.appendChild(what);
        r.appendChild(el('td', null, ev.catatan));
        r.appendChild(el('td', null, ev.pembuat));
        rb.appendChild(r);
      });
      rows.appendChild(rb);
      list.appendChild(rows);
    }
    box.appendChild(list);

    box.appendChild(el('p', 'print-foot'));
    stampPrint();
  }

  // Menulis waktu cetak; dipanggil juga tepat sebelum mencetak supaya jamnya akurat.
  function stampPrint() {
    const foot = document.querySelector('#cal-print .print-foot');
    if (!foot) return;
    const d = new Date();
    foot.textContent = 'Dicetak pada ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function renderAll() {
    renderCalendar();
    renderAgenda();
    renderPrint();
  }

  /* ---------- Muat data ---------- */
  async function loadItems() {
    status.loading = true;
    status.error = '';
    setItems([]);
    renderAll();
    try {
      setItems(await store.load());
    } catch (e) {
      status.error = (e && e.message) || String(e);
    }
    status.loading = false;
    renderAll();
  }

  /* ---------- Navigasi bulan ---------- */
  function goTo(year, month) {
    const d = new Date(year, month, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    selected = null;
    renderAll();
  }

  $('cal-prev').addEventListener('click', function () { goTo(viewYear, viewMonth - 1); });
  $('cal-next').addEventListener('click', function () { goTo(viewYear, viewMonth + 1); });
  $('cal-today').addEventListener('click', function () {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selected = todayKey;
    renderAll();
  });
  $('agenda-all').addEventListener('click', function () {
    selected = null;
    renderAll();
  });
  $('cal-jump').addEventListener('change', function () {
    const m = /^(\d{4})-(\d{2})$/.exec($('cal-jump').value);
    if (m) goTo(+m[1], +m[2] - 1);
  });

  /* ---------- Dialog ---------- */
  function openDialog(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function closeDialog(d) { if (d.close) d.close(); else d.removeAttribute('open'); }

  /* ---------- Formulir kegiatan ---------- */
  const form = $('ag-form');
  const dlg = $('ag-dialog');
  const errBox = $('ag-dlg-error');
  const saveBtn = $('ag-save');
  const delBtn = $('ag-delete');
  let delArmed = false;
  let delTimer = null;

  function resetDelete() {
    delArmed = false;
    clearTimeout(delTimer);
    delBtn.textContent = 'Hapus';
  }
  function showFormError(msg, field) {
    errBox.textContent = msg;
    errBox.hidden = false;
    if (field && form.elements[field]) form.elements[field].focus();
  }
  function setBusy(busy) {
    saveBtn.disabled = busy;
    delBtn.disabled = busy;
    saveBtn.textContent = busy ? 'Menyimpan…' : 'Simpan';
  }
  function defaultDate() {
    if (selected) return selected;
    if (viewYear === now.getFullYear() && viewMonth === now.getMonth()) return todayKey;
    return key(viewYear, viewMonth, 1);
  }
  function rememberedName() { try { return localStorage.getItem(NAMA_KEY) || ''; } catch (e) { return ''; } }

  function openForm(ev) {
    editing = ev || null;
    form.reset();
    resetDelete();
    setBusy(false);
    errBox.hidden = true;
    $('ag-dlg-title').textContent = editing ? 'Ubah kegiatan' : 'Tambah kegiatan';
    delBtn.hidden = !editing;
    if (editing) {
      const t = /^(\d{2}:\d{2})(?: - (\d{2}:\d{2}))?$/.exec(editing.waktu || '');
      form.elements.judul.value = editing.judul;
      form.elements.tanggal.value = editing.tanggal;
      form.elements.selesai.value = editing.selesai || '';
      form.elements.mulai.value = t ? t[1] : '';
      form.elements.akhir.value = t && t[2] ? t[2] : '';
      form.elements.unit.value = editing.unit || '';
      form.elements.catatan.value = editing.catatan || '';
      form.elements.pembuat.value = editing.pembuat || '';
    } else {
      form.elements.tanggal.value = defaultDate();
      form.elements.pembuat.value = rememberedName();
    }
    openDialog(dlg);
    form.elements.judul.focus();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errBox.hidden = true;
    const f = form.elements;
    const judul = f.judul.value.trim();
    const tanggal = f.tanggal.value;
    const selesai = f.selesai.value;
    const mulai = f.mulai.value;
    const akhir = f.akhir.value;

    if (!judul) return showFormError('Nama kegiatan wajib diisi.', 'judul');
    if (!isValid(tanggal)) return showFormError('Tanggal wajib diisi.', 'tanggal');
    if (selesai && selesai < tanggal) return showFormError('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'selesai');
    if (akhir && !mulai) return showFormError('Isi jam mulai terlebih dahulu.', 'mulai');
    if (mulai && akhir && akhir <= mulai) return showFormError('Jam selesai harus setelah jam mulai.', 'akhir');

    const payload = {
      judul: judul,
      tanggal: tanggal,
      selesai: selesai && selesai !== tanggal ? selesai : '',
      waktu: mulai ? (akhir ? mulai + ' - ' + akhir : mulai) : '',
      unit: f.unit.value,
      catatan: f.catatan.value.trim(),
      pembuat: f.pembuat.value.trim()
    };

    setBusy(true);
    try {
      let saved;
      if (editing) {
        saved = await store.update(editing.id, payload);
        setItems(items.map(function (x) { return x.id === saved.id ? saved : x; }));
      } else {
        saved = await store.add(payload);
        setItems(items.concat([saved]));
      }
      try { localStorage.setItem(NAMA_KEY, payload.pembuat); } catch (x) { /* penyimpanan browser dimatikan */ }
      const wasEdit = !!editing;
      editing = null;
      closeDialog(dlg);
      const d = parseKey(saved.tanggal);
      viewYear = d.getFullYear();
      viewMonth = d.getMonth();
      selected = saved.tanggal;
      renderAll();
      toast(wasEdit ? 'Perubahan disimpan' : 'Kegiatan ditambahkan');
    } catch (err) {
      showFormError((err && err.message) || 'Gagal menyimpan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  });

  delBtn.addEventListener('click', async function () {
    if (!editing) return;
    if (!delArmed) { // klik pertama hanya meminta konfirmasi
      delArmed = true;
      delBtn.textContent = 'Klik lagi untuk menghapus';
      delTimer = setTimeout(resetDelete, 4000);
      return;
    }
    resetDelete();
    setBusy(true);
    try {
      const id = editing.id;
      await store.remove(id);
      setItems(items.filter(function (x) { return x.id !== id; }));
      editing = null;
      closeDialog(dlg);
      renderAll();
      toast('Kegiatan dihapus');
    } catch (err) {
      showFormError((err && err.message) || 'Gagal menghapus. Coba lagi.');
    } finally {
      setBusy(false);
    }
  });

  $('ag-add').addEventListener('click', function () { openForm(null); });
  $('ag-cancel').addEventListener('click', function () { closeDialog(dlg); });
  $('ag-dlg-x').addEventListener('click', function () { closeDialog(dlg); });
  dlg.addEventListener('close', resetDelete);

  /* ---------- Pengaturan sambungan ---------- */
  const cfgDlg = $('ag-cfg-dialog');
  const cfgForm = $('ag-cfg-form');
  const cfgMsg = $('ag-cfg-msg');

  function cfgSay(text, kind) {
    cfgMsg.textContent = text;
    cfgMsg.className = 'dlg-msg ' + kind;
    cfgMsg.hidden = false;
  }
  function openSettings() {
    const c = store.config();
    cfgForm.elements.url.value = c.url;
    cfgForm.elements.token.value = c.token;
    cfgMsg.hidden = true;
    $('ag-cfg-off').hidden = !store.live;
    openDialog(cfgDlg);
  }

  $('ag-settings').addEventListener('click', openSettings);
  $('ag-cfg-x').addEventListener('click', function () { closeDialog(cfgDlg); });
  cfgForm.addEventListener('submit', function (e) {
    e.preventDefault();
    store.saveConfig(cfgForm.elements.url.value, cfgForm.elements.token.value);
    location.reload();
  });
  $('ag-cfg-off').addEventListener('click', function () {
    store.clearConfig();
    location.reload();
  });
  $('ag-cfg-test').addEventListener('click', async function () {
    const btn = $('ag-cfg-test');
    btn.disabled = true;
    cfgSay('Menguji koneksi…', '');
    try {
      const r = await store.test(cfgForm.elements.url.value, cfgForm.elements.token.value);
      cfgSay('Koneksi berhasil: ' + r.count + ' kegiatan terbaca.' + (r.outdated ? ' Code.gs di Apps Script versi lama; perbarui agar fitur terbaru aktif.' : ''), 'ok');
    } catch (err) {
      cfgSay((err && err.message) || 'Gagal terhubung.', 'err');
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- Cetak PDF ---------- */
  let origTitle = null;
  window.addEventListener('beforeprint', function () {
    if (origTitle === null) origTitle = document.title;
    document.title = 'Kalender Agenda Velqo - ' + BULAN[viewMonth] + ' ' + viewYear; // jadi nama file PDF yang disarankan
    stampPrint();
  });
  window.addEventListener('afterprint', function () {
    if (origTitle !== null) { document.title = origTitle; origTitle = null; }
  });
  $('ag-print').addEventListener('click', function () { window.print(); });

  /* ---------- Mulai ---------- */
  const mode = $('ag-mode');
  mode.textContent = store.live ? 'Terhubung ke Spreadsheet' : 'Mode demo';
  mode.classList.toggle('live', store.live);
  $('ag-demo-note').hidden = store.live;

  loadItems();
})();
