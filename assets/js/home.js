/*
  Logika halaman beranda: kalender agenda dan pengisi ringkasan.

  Agenda dibaca dari window.VELQO_AGENDA (file assets/js/agenda.js).
  Ringkasan diisi dengan: VelqoHome.setRingkasan('keuangan.utang', 'Rp 1.250.000')
  Nama ('keuangan.utang') harus sama dengan atribut data-ringkasan di index.html.
*/
(function () {
  'use strict';

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  var HARI_PENUH = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var MAX_CHIP = 2;

  /* ---------- Ringkasan ---------- */
  window.VelqoHome = {
    setRingkasan: function (nama, nilai) {
      var els = document.querySelectorAll('[data-ringkasan]');
      for (var i = 0; i < els.length; i++) {
        if (els[i].getAttribute('data-ringkasan') === nama) els[i].textContent = nilai;
      }
    }
  };

  /* ---------- Tanggal ---------- */
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function key(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function dateKey(dt) { return key(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
  function isValid(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function parseKey(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function longDate(k) {
    var dt = parseKey(k);
    return HARI_PENUH[dt.getDay()] + ', ' + dt.getDate() + ' ' + BULAN[dt.getMonth()] + ' ' + dt.getFullYear();
  }
  function shortDate(k) {
    var dt = parseKey(k);
    return dt.getDate() + ' ' + BULAN_PENDEK[dt.getMonth()];
  }

  /* ---------- Data agenda: dikelompokkan per tanggal ---------- */
  var byDay = {};
  (window.VELQO_AGENDA || []).forEach(function (ev) {
    if (!ev || !isValid(ev.tanggal) || !ev.judul) return;
    var start = parseKey(ev.tanggal);
    var end = isValid(ev.selesai) ? parseKey(ev.selesai) : start;
    if (end < start) end = start;
    var d = new Date(start.getTime());
    for (var n = 0; d <= end && n < 366; n++) {
      var k = dateKey(d);
      (byDay[k] = byDay[k] || []).push(ev);
      d.setDate(d.getDate() + 1);
    }
  });
  Object.keys(byDay).forEach(function (k) {
    byDay[k].sort(function (a, b) {
      var ta = a.waktu || '', tb = b.waktu || '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return String(a.judul).localeCompare(String(b.judul), 'id');
    });
  });

  /* ---------- Elemen ---------- */
  var grid = document.getElementById('cal-grid');
  if (!grid) return;
  var titleEl = document.getElementById('cal-title');
  var jumpEl = document.getElementById('cal-jump');
  var agendaTitle = document.getElementById('agenda-title');
  var agendaList = document.getElementById('agenda-list');
  var agendaAll = document.getElementById('agenda-all');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- Keadaan ---------- */
  var now = new Date();
  var todayKey = dateKey(now);
  var viewYear = now.getFullYear();
  var viewMonth = now.getMonth();
  var selected = todayKey;

  /* ---------- Kalender ---------- */
  function renderCalendar() {
    grid.textContent = '';
    titleEl.textContent = BULAN[viewMonth] + ' ' + viewYear;
    jumpEl.value = viewYear + '-' + pad(viewMonth + 1);

    HARI.forEach(function (h) { grid.appendChild(el('div', 'cal-dow', h)); });

    var offset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // pekan mulai Senin
    var days = new Date(viewYear, viewMonth + 1, 0).getDate();
    var cells = Math.ceil((offset + days) / 7) * 7;

    for (var i = 0; i < cells; i++) {
      var day = i - offset + 1;
      if (day < 1 || day > days) {
        var blank = el('div', 'cal-blank');
        blank.setAttribute('aria-hidden', 'true');
        grid.appendChild(blank);
        continue;
      }
      grid.appendChild(buildDay(day));
    }
  }

  function buildDay(day) {
    var k = key(viewYear, viewMonth, day);
    var events = byDay[k] || [];
    var btn = el('button', 'cal-day');
    btn.type = 'button';
    btn.setAttribute('data-key', k);
    btn.setAttribute('aria-pressed', k === selected ? 'true' : 'false');
    if (k === todayKey) btn.setAttribute('aria-current', 'date');
    btn.setAttribute('aria-label', longDate(k) + (events.length ? ', ' + events.length + ' agenda' : ', tidak ada agenda'));

    btn.appendChild(el('span', 'cal-num', day));

    events.slice(0, MAX_CHIP).forEach(function (ev) {
      btn.appendChild(el('span', 'cal-chip', (ev.waktu ? ev.waktu.slice(0, 5) + ' ' : '') + ev.judul));
    });
    if (events.length > MAX_CHIP) btn.appendChild(el('span', 'cal-more', '+' + (events.length - MAX_CHIP) + ' lagi'));

    if (events.length) {
      var dots = el('span', 'cal-dots');
      for (var i = 0; i < Math.min(events.length, 3); i++) dots.appendChild(document.createElement('i'));
      btn.appendChild(dots);
    }

    btn.addEventListener('click', function () {
      selected = k;
      refresh();
    });
    return btn;
  }

  /* ---------- Daftar agenda ---------- */
  function buildItem(ev) {
    var li = el('li', 'agenda-item');
    var time = ev.waktu || 'Sepanjang hari';
    if (ev.selesai && isValid(ev.selesai) && ev.selesai !== ev.tanggal) {
      time = shortDate(ev.tanggal) + ' s.d. ' + shortDate(ev.selesai);
      if (ev.waktu) time += ', ' + ev.waktu;
    }
    li.appendChild(el('div', 'agenda-time', time));

    var body = el('div');
    var name = el('div', 'agenda-name', ev.judul);
    if (ev.unit) name.appendChild(el('span', 'agenda-tag', ev.unit));
    body.appendChild(name);
    if (ev.catatan) body.appendChild(el('div', 'agenda-note', ev.catatan));
    li.appendChild(body);
    return li;
  }

  function buildGroup(k) {
    var group = el('div', 'agenda-group');
    group.appendChild(el('h4', 'agenda-date', longDate(k)));
    var ul = el('ul', 'agenda-items');
    byDay[k].forEach(function (ev) { ul.appendChild(buildItem(ev)); });
    group.appendChild(ul);
    return group;
  }

  function renderAgenda() {
    agendaList.textContent = '';

    if (selected) {
      agendaTitle.textContent = 'Agenda ' + longDate(selected);
      agendaAll.hidden = false;
      if (byDay[selected]) agendaList.appendChild(buildGroup(selected));
      else agendaList.appendChild(el('p', 'agenda-empty', 'Tidak ada agenda pada tanggal ini.'));
      return;
    }

    agendaTitle.textContent = 'Agenda ' + BULAN[viewMonth] + ' ' + viewYear;
    agendaAll.hidden = true;
    var days = new Date(viewYear, viewMonth + 1, 0).getDate();
    var found = 0;
    for (var d = 1; d <= days; d++) {
      var k = key(viewYear, viewMonth, d);
      if (byDay[k]) { agendaList.appendChild(buildGroup(k)); found++; }
    }
    if (!found) agendaList.appendChild(el('p', 'agenda-empty', 'Belum ada agenda terjadwal di bulan ini.'));
  }

  function refresh() {
    renderCalendar();
    renderAgenda();
  }

  /* ---------- Navigasi bulan ---------- */
  function goTo(year, month) {
    var d = new Date(year, month, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    selected = null;
    refresh();
  }

  document.getElementById('cal-prev').addEventListener('click', function () { goTo(viewYear, viewMonth - 1); });
  document.getElementById('cal-next').addEventListener('click', function () { goTo(viewYear, viewMonth + 1); });
  document.getElementById('cal-today').addEventListener('click', function () {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selected = todayKey;
    refresh();
  });
  agendaAll.addEventListener('click', function () {
    selected = null;
    renderCalendar();
    renderAgenda();
  });
  jumpEl.addEventListener('change', function () {
    var m = /^(\d{4})-(\d{2})$/.exec(jumpEl.value);
    if (m) goTo(+m[1], +m[2] - 1);
  });

  refresh();
})();
