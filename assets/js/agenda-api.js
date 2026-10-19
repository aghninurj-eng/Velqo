/*
  Penyimpanan agenda Velqo.

  Dua mode, dipilih otomatis:
  - Terhubung : API_URL terisi (assets/js/agenda.js atau tombol Pengaturan). Data dibaca dan ditulis
                ke Google Spreadsheet lewat Apps Script (apps-script/agenda/Code.gs).
  - Demo      : API_URL kosong. Data hanya disimpan di browser ini (localStorage).

  Semua fungsi mengembalikan Promise dan melempar Error berpesan bahasa Indonesia bila gagal.
*/
(function () {
  'use strict';

  const BACKEND_VERSI = 1; // samakan dengan VERSI di Code.gs
  const CFG_KEY = 'velqo_agenda_cfg';
  const DEMO_KEY = 'velqo_agenda_demo';
  const base = window.VELQO_AGENDA_CONFIG || {};

  function readJson(k, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || 'null');
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  const saved = readJson(CFG_KEY, {});
  const API_URL = String(saved.url || base.API_URL || '').trim();
  const TOKEN = String(saved.token || '').trim();
  const live = !!API_URL;

  function normalize(o) {
    const s = function (v) { return v == null ? '' : String(v); };
    return {
      id: s(o.id), tanggal: s(o.tanggal), selesai: s(o.selesai), waktu: s(o.waktu), judul: s(o.judul),
      unit: s(o.unit), catatan: s(o.catatan), pembuat: s(o.pembuat)
    };
  }

  function apiError(j, fallback) {
    let m = (j && j.error) || fallback;
    if (/^Token salah/.test(m)) {
      if (!j.v || j.v < BACKEND_VERSI) {
        m += ' — Web App yang aktif masih memakai Code.gs lama. Di Apps Script: Deploy → Manage deployments → ikon pensil → Version: New version → Deploy (URL /exec tetap sama).';
      } else {
        m += ' — token di Pengaturan tidak sama dengan token di Apps Script. Jalankan cekToken() di editor Apps Script untuk melihat sumber dan panjang token.';
      }
    }
    return m;
  }

  async function parse(r) {
    let j;
    try { j = await r.json(); }
    catch (e) { throw new Error('Balasan server tidak dapat dibaca. Pastikan URL Web App berakhiran /exec dan akses Web App diatur "Anyone".'); }
    if (!j.ok) throw new Error(apiError(j, 'Permintaan gagal'));
    return j;
  }

  async function network(fn) {
    try { return await fn(); }
    catch (e) {
      if (e instanceof TypeError) throw new Error('Tidak dapat terhubung ke server agenda. Periksa koneksi internet dan URL Web App.');
      throw e;
    }
  }

  function needConfig(url, token) {
    if (!url) throw new Error('URL Web App belum diisi.');
    if (!token) throw new Error('Token belum diisi. Buka Pengaturan lalu isi token dari admin.');
  }

  async function fetchList(url, token) {
    needConfig(url, token);
    return network(async function () {
      const r = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'action=list&token=' + encodeURIComponent(token));
      return parse(r);
    });
  }

  async function post(body) {
    needConfig(API_URL, TOKEN);
    return network(async function () {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain agar tidak memicu preflight CORS
        body: JSON.stringify(Object.assign({}, body, { token: TOKEN }))
      });
      return parse(r);
    });
  }

  /* ---------- Mode demo ---------- */
  function demoRead() { const a = readJson(DEMO_KEY, []); return Array.isArray(a) ? a.map(normalize) : []; }
  function demoWrite(a) { localStorage.setItem(DEMO_KEY, JSON.stringify(a)); }
  function newId() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  window.VelqoAgendaStore = {
    live: live,

    config: function () {
      return { url: API_URL, token: TOKEN, urlFromFile: !saved.url && !!base.API_URL };
    },
    saveConfig: function (url, token) {
      localStorage.setItem(CFG_KEY, JSON.stringify({ url: String(url || '').trim(), token: String(token || '').trim() }));
    },
    clearConfig: function () {
      localStorage.removeItem(CFG_KEY);
    },
    // Menguji URL + token yang diketik di dialog Pengaturan (belum disimpan). Mengembalikan jumlah kegiatan.
    test: async function (url, token) {
      const j = await fetchList(String(url || '').trim(), String(token || '').trim());
      return { count: (j.data || []).length, outdated: !j.v || j.v < BACKEND_VERSI };
    },

    load: async function () {
      if (!live) return demoRead();
      const j = await fetchList(API_URL, TOKEN);
      return (j.data || []).map(normalize);
    },
    add: async function (item) {
      if (!live) {
        const rec = normalize(Object.assign({}, item, { id: newId() }));
        const all = demoRead(); all.push(rec); demoWrite(all);
        return rec;
      }
      const j = await post({ action: 'add', item: item });
      return normalize(j.item);
    },
    update: async function (id, patch) {
      if (!live) {
        const all = demoRead();
        const i = all.findIndex(function (x) { return x.id === id; });
        if (i < 0) throw new Error('Kegiatan tidak ditemukan.');
        all[i] = normalize(Object.assign({}, all[i], patch, { id: id }));
        demoWrite(all);
        return all[i];
      }
      const j = await post({ action: 'update', id: id, patch: patch });
      return normalize(j.item);
    },
    remove: async function (id) {
      if (!live) { demoWrite(demoRead().filter(function (x) { return x.id !== id; })); return; }
      await post({ action: 'remove', id: id });
    }
  };
})();
