/*
  Merender navigasi Velqo ke dalam <div id="velqo-nav"></div>.
  Tidak perlu diedit saat menambah halaman. Edit menu.js saja.

  Folder utama situs dihitung dari lokasi file ini (assets/js/nav.js naik dua tingkat),
  jadi tautan tetap benar di halaman mana pun, di GitHub Pages maupun saat dibuka lokal.
*/
(function () {
  'use strict';

  var script = document.currentScript;
  var root = new URL('../../', script.src);
  var items = window.VELQO_MENU || [];

  function clean(path) { return path.replace(/index\.html$/, ''); }
  var current = clean(location.pathname);
  var rootPath = clean(root.pathname);

  var host = document.getElementById('velqo-nav');
  if (!host) {
    host = document.createElement('div');
    host.id = 'velqo-nav';
    document.body.insertBefore(host, document.body.firstChild);
  }

  var nav = document.createElement('nav');
  nav.className = 'vnav';
  nav.setAttribute('aria-label', 'Menu utama');

  var inner = document.createElement('div');
  inner.className = 'vnav-inner';

  var brand = document.createElement('a');
  brand.className = 'vnav-brand';
  brand.href = root.href + 'index.html';
  brand.textContent = 'Velqo';

  var toggle = document.createElement('button');
  toggle.className = 'vnav-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'vnav-list');
  toggle.textContent = 'Menu';

  var list = document.createElement('ul');
  list.className = 'vnav-list';
  list.id = 'vnav-list';

  items.forEach(function (item) {
    var url = new URL(item.href, root);
    var path = clean(url.pathname);
    var active = path === rootPath ? current === rootPath : current.indexOf(path) === 0;

    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = url.href;
    a.textContent = item.label;
    if (active) a.setAttribute('aria-current', 'page');
    li.appendChild(a);
    list.appendChild(li);
  });

  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  inner.appendChild(brand);
  inner.appendChild(toggle);
  inner.appendChild(list);
  nav.appendChild(inner);
  host.appendChild(nav);
})();
