/* ==========================================================================
   PanditConnect — shell, helpers and shared components
   Every page includes data.js then app.js then pages.js.
   ========================================================================== */

(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  PC.$ = $; PC.$$ = $$;

  /* ------------------------------------------------------------- helpers */
  PC.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  PC.param = function (key) {
    return new URLSearchParams(location.search).get(key) || '';
  };

  PC.fallback = function (kind) {
    var src = kind === 'pandit' ? 'assets/img/pandit-placeholder.svg'
      : kind === 'hero' ? 'assets/img/hero-temple.svg'
        : 'assets/img/temple-placeholder.svg';
    return ' onerror="this.onerror=null;this.src=\'' + src + '\'"';
  };

  PC.temple = function (id) { return PC.temples.filter(function (t) { return t.id === id; })[0]; };
  PC.pandit = function (id) { return PC.pandits.filter(function (p) { return p.id === id; })[0]; };
  PC.service = function (id) { return PC.services.filter(function (s) { return s.id === id; })[0]; };
  PC.serviceName = function (id) { var s = PC.service(id); return s ? s.name : id; };

  PC.panditsAtTemple = function (templeId) {
    return PC.pandits.filter(function (p) { return p.temples.indexOf(templeId) > -1; });
  };
  PC.panditsForService = function (svcId) {
    return PC.pandits.filter(function (p) { return p.services.indexOf(svcId) > -1; });
  };
  PC.templesForService = function (svcId) {
    return PC.temples.filter(function (t) { return t.services.indexOf(svcId) > -1; });
  };

  /* star row — supports halves */
  PC.stars = function (rating, size) {
    var out = '', full = Math.floor(rating), half = rating - full >= 0.4;
    for (var i = 0; i < 5; i++) {
      var on = i < full, isHalf = !on && i === full && half;
      out += '<span style="opacity:' + (on ? 1 : isHalf ? .55 : .26) + '">' + PC.icon('star', { fill: true, size: size || 15 }) + '</span>';
    }
    return '<span class="stars"' + (size ? ' style="gap:2px"' : '') + '>' + out + '</span>';
  };

  PC.ratingRow = function (rating, reviews) {
    return '<span class="row" style="gap:7px">' + PC.stars(rating) +
      '<span class="rating-num">' + rating.toFixed(1) + '</span>' +
      (reviews ? '<span class="muted">(' + reviews + ')</span>' : '') + '</span>';
  };

  /* number-then-stars, as in the listing mockup — fits beside a card button */
  PC.ratingCompact = function (rating) {
    return '<span class="row" style="gap:6px"><span class="rating-num">' + rating.toFixed(1) + '</span>' +
      PC.stars(rating) + '</span>';
  };

  /* contact links — the whole point of the platform: direct, no middleman */
  PC.waLink = function (p, ctx) {
    var msg = 'Namaste ' + p.name + ', I found your profile on PanditConnect.' +
      (ctx ? ' I would like to enquire about ' + ctx + '.' : ' I would like to enquire about a puja.');
    return 'https://wa.me/' + p.phone.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(msg);
  };
  PC.telLink = function (p) { return 'tel:' + p.phone; };

  /* ---------------------------------------------------------------- toast */
  PC.toast = function (msg) {
    var host = $('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = PC.icon('check-circle', { size: 18 }) + '<span>' + PC.esc(msg) + '</span>';
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s'; t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 320);
    }, 3200);
  };

  /* ---------------------------------------------------------------- shell */
  var NAV = [
    { href: 'index.html', label: 'Home', page: 'home', icon: 'home' },
    { href: 'temples.html', label: 'Temples', page: 'temples', icon: 'temple' },
    { href: 'pandits.html', label: 'Pandits', page: 'pandits', icon: 'users' },
    { href: 'services.html', label: 'Services', page: 'services', icon: 'diya' },
    { href: 'panchang.html', label: 'Panchang', page: 'panchang', icon: 'calendar' },
    { href: 'blog.html', label: 'Blog', page: 'blog', icon: 'newspaper' },
  ];
  var NAV_EXTRA = [
    { href: 'temple-map.html', label: 'Temple Map', page: 'map', icon: 'map' },
    { href: 'ai-recommender.html', label: 'AI Pooja Guide', page: 'ai', icon: 'sparkles' },
    { href: 'dashboard.html', label: 'Pandit Dashboard', page: 'dashboard', icon: 'layout-dashboard' },
    { href: 'about.html', label: 'About Us', page: 'about', icon: 'info' },
    { href: 'contact.html', label: 'Contact', page: 'contact', icon: 'mail' },
  ];
  var BOTTOM = [
    { href: 'index.html', label: 'Home', page: 'home', icon: 'diya' },
    { href: 'temples.html', label: 'Temples', page: 'temples', icon: 'temple' },
    { href: 'services.html', label: 'Search', page: 'services', icon: 'search' },
    { href: 'pandits.html', label: 'Pandits', page: 'pandits', icon: 'users' },
    { href: 'dashboard.html', label: 'Profile', page: 'dashboard', icon: 'user' },
  ];

  function brand(size) {
    return '<a class="brand" href="index.html" aria-label="PanditConnect home">' +
      '<img src="assets/img/logo.svg" alt="" width="40" height="40">' +
      '<span class="brand-name"' + (size ? ' style="font-size:' + size + '"' : '') + '>Pandit<span>Connect</span></span></a>';
  }

  function mountHeader(page) {
    var host = $('#site-header');
    if (!host) return;
    var links = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.page === page ? ' class="is-active" aria-current="page"' : '') + '>' + n.label + '</a>';
    }).join('');

    host.className = 'site-header';
    host.innerHTML =
      '<div class="shell header-inner">' + brand() +
      '<nav class="main-nav" aria-label="Main">' + links + '</nav>' +
      '<div class="header-cta">' +
      '<a class="btn btn-outline btn-sm" href="dashboard.html">' + PC.icon('user', { size: 17 }) + ' Profile/Login</a>' +
      '<button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="drawer">' +
      PC.icon('menu') + '</button></div></div>';

    var drawerLinks = NAV.concat(NAV_EXTRA).map(function (n) {
      return '<a href="' + n.href + '"' + (n.page === page ? ' class="is-active"' : '') + '>' +
        PC.icon(n.icon, { size: 19 }) + n.label + '</a>';
    }).join('');

    var d = document.createElement('div');
    d.innerHTML =
      '<div class="scrim" id="scrim"></div>' +
      '<aside class="drawer" id="drawer" aria-label="Menu" aria-hidden="true">' +
      '<div class="row-between">' + brand('1.2rem') +
      '<button class="nav-toggle" id="drawerClose" aria-label="Close menu" style="display:flex">' + PC.icon('x') + '</button></div>' +
      '<nav class="drawer-links">' + drawerLinks + '</nav>' +
      '<a class="btn btn-gold btn-block" href="ai-recommender.html" style="margin-top:22px">' +
      PC.icon('sparkles', { size: 18 }) + ' Which pooja do I need?</a>' +
      '</aside>' +
      '<nav class="bottom-nav" aria-label="Quick navigation"><ul>' +
      BOTTOM.map(function (n) {
        return '<li><a href="' + n.href + '"' + (n.page === page ? ' class="is-active"' : '') + '>' +
          PC.icon(n.icon, { size: 22 }) + '<span>' + n.label + '</span></a></li>';
      }).join('') + '</ul></nav>';
    while (d.firstChild) document.body.appendChild(d.firstChild);

    var drawer = $('#drawer'), scrim = $('#scrim'), toggle = $('#navToggle');
    function setDrawer(open) {
      drawer.classList.toggle('is-open', open);
      scrim.classList.toggle('is-open', open);
      drawer.setAttribute('aria-hidden', String(!open));
      toggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) drawer.querySelector('a').focus();
    }
    toggle.addEventListener('click', function () { setDrawer(true); });
    $('#drawerClose').addEventListener('click', function () { setDrawer(false); toggle.focus(); });
    scrim.addEventListener('click', function () { setDrawer(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setDrawer(false); });
  }

  function mountFooter() {
    var host = $('#site-footer');
    if (!host) return;
    var socials = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['twitter', 'X'], ['linkedin', 'LinkedIn']]
      .map(function (s) {
        return '<a href="#" aria-label="' + s[1] + '" title="' + s[1] + '">' + PC.icon(s[0], { size: 18 }) + '</a>';
      }).join('');

    host.className = 'site-footer';
    host.innerHTML =
      '<div class="shell footer-top">' +
      '<div class="footer-col">' + brand('1.3rem') +
      '<p class="muted" style="margin-top:14px;max-width:330px">Sacred Connections, Trusted Pandits. We are a directory, not a booking agent — you contact pandit ji directly and keep the relationship yours.</p>' +
      '<div class="socials">' + socials + '</div></div>' +

      '<div class="footer-col"><h4>Explore</h4>' +
      ['temples.html|Temple Directory', 'pandits.html|Pandit Directory', 'services.html|All Services',
        'temple-map.html|Temple Map', 'panchang.html|Panchang & Muhurat', 'ai-recommender.html|AI Pooja Guide']
        .map(function (l) { var p = l.split('|'); return '<a href="' + p[0] + '">' + p[1] + '</a>'; }).join('') + '</div>' +

      '<div class="footer-col"><h4>Company</h4>' +
      ['about.html|About Us', 'blog.html|Spiritual Blog', 'contact.html|Contact', 'dashboard.html|Pandit Dashboard',
        'contact.html#faq|FAQ', 'about.html#verify|Verification Process']
        .map(function (l) { var p = l.split('|'); return '<a href="' + p[0] + '">' + p[1] + '</a>'; }).join('') + '</div>' +

      '<div class="footer-col"><h4>Weekly Panchang Mail</h4>' +
      '<p class="muted">Festival dates and shubh muhurat, every Monday.</p>' +
      '<form class="stack" style="gap:10px;margin-top:12px" data-newsletter>' +
      '<label class="sr-only" for="nlMail">Email address</label>' +
      '<input class="input" id="nlMail" type="email" required placeholder="you@email.com">' +
      '<button class="btn btn-gold" type="submit">' + PC.icon('send', { size: 17 }) + ' Subscribe</button>' +
      '</form>' +
      '<ul style="margin-top:16px"><li>' + PC.icon('phone', { size: 14 }) + ' +91 90000 00000</li>' +
      '<li>' + PC.icon('mail', { size: 14 }) + ' namaste@panditconnect.in</li></ul></div>' +
      '</div>' +

      '<div class="shell footer-bottom">' +
      '<span>© 2026 PanditConnect. Made with devotion in Bharat.</span>' +
      '<span class="row" style="gap:18px"><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Sitemap</a></span>' +
      '</div>';

    var form = $('[data-newsletter]', host);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('#nlMail', form).value;
      var done = function () { PC.toast('Subscribed — panchang mail every Monday.'); form.reset(); };
      if (PC.api) PC.api.subscribe(email).then(done, done); // soft-fail: still confirm if backend is offline
      else done();
    });
  }

  /* ------------------------------------------------------------ components */
  PC.templeCard = function (t) {
    return '<article class="card card--hover">' +
      '<div class="thumb"><img src="' + t.img + '" alt="' + PC.esc(t.name) + '" loading="lazy"' + PC.fallback('temple') + '>' +
      '<span class="thumb-badge badge-gold">' + PC.icon('user', { size: 13 }) + t.pandits + ' Pandits Available</span>' +
      '<button class="thumb-fav" data-fav="' + t.id + '" aria-label="Save ' + PC.esc(t.name) + '">' + PC.icon('heart', { size: 17 }) + '</button></div>' +
      '<div class="card-body">' +
      '<h3 class="card-title"><a href="temple-detail.html?id=' + t.id + '">' + PC.esc(t.name) + '</a></h3>' +
      '<p class="meta-line">' + PC.icon('map-pin', { size: 15 }) + PC.esc(t.city + ', ' + t.state) + '</p>' +
      '<p class="meta-line" style="margin-top:4px">' + PC.icon('clock', { size: 15 }) + PC.esc(t.timings) + '</p>' +
      '<div class="card-foot">' + PC.ratingCompact(t.rating) +
      '<a class="btn btn-outline btn-sm" href="temple-detail.html?id=' + t.id + '">View Pandits</a></div>' +
      '</div></article>';
  };

  PC.panditCard = function (p) {
    var tierColors = { Diamond: '#7c3aed', Gold: '#d4a017', Silver: '#6b7280' };
    var tierColor = tierColors[p.tier] || '#d4a017';
    return '<article class="card card--hover pandit-card-v2">' +
      '<div class="pc2-photo-wrap">' +
      '<img class="pc2-photo" src="' + p.img + '" alt="' + PC.esc(p.name) + '" loading="lazy"' + PC.fallback('pandit') + '>' +
      '<span class="pc2-tier" style="--tier-color:' + tierColor + '">' + PC.esc(p.tier) + '</span>' +
      (p.verified ? '<span class="pc2-verified" title="Verified pandit">' + PC.icon('verified', { size: 22 }) + '</span>' : '') +
      '</div>' +
      '<div class="pc2-body">' +
      '<h3 class="pc2-name"><a href="pandit-profile.html?id=' + p.id + '">' + PC.esc(p.name) + '</a></h3>' +
      '<div class="pc2-rating">' + PC.stars(p.rating) +
      '<span class="rating-num">' + p.rating.toFixed(1) + '</span>' +
      '<span class="muted">(' + p.reviews + ')</span></div>' +
      '<div class="pc2-meta">' +
      '<span>' + PC.icon('map-pin', { size: 14 }) + ' ' + PC.esc(p.city) + '</span>' +
      '<span>' + PC.icon('briefcase', { size: 14 }) + ' ' + p.exp + ' yrs</span>' +
      '<span>' + PC.icon('globe', { size: 14 }) + ' ' + PC.esc(p.langs.slice(0, 2).join(', ')) + '</span>' +
      '</div>' +
      '<div class="pc2-tags">' + p.services.slice(0, 3).map(function (s) {
        return '<span class="tag tag--soft">' + PC.esc(PC.serviceName(s)) + '</span>';
      }).join('') + '</div>' +
      '<div class="pc2-actions">' +
      '<a class="btn btn-gold btn-sm" href="' + PC.telLink(p) + '">' + PC.icon('phone', { size: 15 }) + ' Call</a>' +
      '<a class="btn btn-wa btn-sm" href="' + PC.waLink(p) + '" target="_blank" rel="noopener">' + PC.icon('whatsapp', { size: 15 }) + ' WhatsApp</a>' +
      '<a class="btn btn-outline btn-sm" href="pandit-profile.html?id=' + p.id + '">Profile</a>' +
      '</div></div></article>';
  };

  PC.serviceCard = function (s) {
    return '<article class="card card--hover svc-card">' +
      '<div class="svc-ico">' + PC.icon(s.icon, { size: 56 }) + '</div>' +
      '<h3>' + PC.esc(s.name) + '</h3>' +
      '<p>' + PC.esc(s.tag) + '</p>' +
      '<a class="btn btn-gold btn-block btn-sm" href="service-detail.html?id=' + s.id + '">Find Pandits</a>' +
      '<p class="muted row" style="margin-top:10px;font-size:.8rem;gap:6px;justify-content:center">' +
      PC.icon('clock', { size: 13 }) + '<span>' + PC.esc(s.dur) + ' · ' + s.pandits + ' pandits</span></p>' +
      '</article>';
  };

  PC.reviewCard = function (r) {
    return '<div class="review">' + PC.stars(r.rating) +
      '<p>' + PC.esc(r.text) + '</p>' +
      '<p class="review-meta">' + PC.esc(r.name) + ' · ' + PC.esc(r.city) + (r.service ? ' · ' + PC.esc(r.service) : '') + '</p></div>';
  };

  PC.emptyState = function (msg) {
    return '<div class="empty">' + PC.icon('search', { size: 56 }) +
      '<h3 style="margin-bottom:6px">Nothing matched</h3><p>' + PC.esc(msg) + '</p></div>';
  };

  PC.ornament = function (left) {
    return '<svg class="ornament' + (left ? ' ornament--left' : '') + '" viewBox="0 0 190 16" aria-hidden="true">' +
      '<path d="M6 8h64M120 8h64"/><path d="M84 8l11-6 11 6-11 6z"/><path d="M76 8l4-3v6zM114 8l-4-3v6z"/></svg>';
  };

  /* -------------------------------------------------------- interactions */
  function initReveal() {
    var els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* Page controllers render markup, then boot() re-runs these helpers.
     Each is guarded so an element is never bound twice — a double-bound
     toggle would fire twice and land back on its original state. */
  PC.initTabs = function (root) {
    root = root || document;
    $$('.tabs', root).forEach(function (bar) {
      if (bar.dataset.bound) return;
      bar.dataset.bound = '1';
      var tabs = $$('.tab', bar);
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          var target = tab.dataset.tab;
          tabs.forEach(function (t) { t.classList.toggle('is-active', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
          $$('.tab-panel').forEach(function (p) { p.classList.toggle('is-active', p.id === 'panel-' + target); });
          if (history.replaceState) history.replaceState(null, '', '#' + target);
        });
      });
    });
  };

  PC.initAccordion = function (root) {
    $$('.acc-q', root || document).forEach(function (q) {
      if (q.dataset.bound) return;
      q.dataset.bound = '1';
      q.addEventListener('click', function () {
        var item = q.closest('.acc-item');
        var open = item.classList.contains('is-open');
        $$('.acc-item', item.parentElement).forEach(function (i) { i.classList.remove('is-open'); i.querySelector('.acc-q').setAttribute('aria-expanded', 'false'); });
        if (!open) { item.classList.add('is-open'); q.setAttribute('aria-expanded', 'true'); }
      });
    });
  };

  PC.initFavs = function (root) {
    $$('[data-fav]', root || document).forEach(function (b) {
      if (b.dataset.bound) return;
      b.dataset.bound = '1';
      b.addEventListener('click', function () {
        b.classList.toggle('is-on');
        PC.toast(b.classList.contains('is-on') ? 'Saved to your list' : 'Removed from your list');
      });
    });
  };

  /* generic modal */
  PC.modal = function (html) {
    var m = $('#pcModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'pcModal'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      document.body.appendChild(m);
      m.addEventListener('click', function (e) { if (e.target === m) PC.closeModal(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') PC.closeModal(); });
    }
    m.innerHTML = '<div class="modal-box" style="position:relative">' +
      '<button class="modal-x" aria-label="Close">' + PC.icon('x') + '</button>' + html + '</div>';
    m.querySelector('.modal-x').addEventListener('click', PC.closeModal);
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var f = m.querySelector('input,select,textarea,button.btn');
    if (f) f.focus();
    return m;
  };
  PC.closeModal = function () {
    var m = $('#pcModal');
    if (m) { m.classList.remove('is-open'); document.body.style.overflow = ''; }
  };

  /* enquiry modal used by temple detail, profile and service-detail pages.
     opts.panditId / opts.templeId route the enquiry to that profile's own
     backend endpoint; without either, it falls back to the general contact
     inbox so a service-page enquiry (no single pandit chosen yet) still goes
     somewhere real. */
  PC.enquiryModal = function (opts) {
    opts = opts || {};
    var svcOpts = PC.services.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === opts.service ? ' selected' : '') + '>' + PC.esc(s.name) + '</option>';
    }).join('');
    var m = PC.modal(
      '<h3 style="font-size:1.4rem">Send an enquiry</h3>' +
      '<p class="muted" style="margin-top:6px">' + PC.esc(opts.subtitle || 'We pass your message on. All further discussion happens directly between you and pandit ji.') + '</p>' +
      '<form style="margin-top:18px" id="enqForm">' +
      '<div class="field-group"><label class="label" for="eqName">Your name</label><input class="input" id="eqName" required placeholder="Your name"></div>' +
      '<div class="field-group"><label class="label" for="eqPhone">Phone number</label><input class="input" id="eqPhone" type="tel" required pattern="[0-9+ ]{10,15}" placeholder="+91 90000 00000"></div>' +
      '<div class="field-group"><label class="label" for="eqSvc">Select your service</label><select class="select" id="eqSvc">' + svcOpts + '</select></div>' +
      '<div class="field-group"><label class="label" for="eqDate">Preferred date</label><input class="input" id="eqDate" type="date"></div>' +
      '<div class="field-group"><label class="label" for="eqMsg">Message (optional)</label><textarea class="textarea" id="eqMsg" style="min-height:88px" placeholder="Anything pandit ji should know — city, language, family tradition."></textarea></div>' +
      '<button class="btn btn-gold btn-block" type="submit" style="margin-top:16px">' + PC.icon('send', { size: 17 }) + ' Send Inquiry</button>' +
      '<p class="form-note">No commission, no booking fee. We never charge you for connecting.</p>' +
      '</form>');
    m.querySelector('#enqForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var payload = {
        name: $('#eqName', m).value,
        phone: $('#eqPhone', m).value,
        service: $('#eqSvc', m).value,
        date: $('#eqDate', m).value,
        message: $('#eqMsg', m).value,
      };
      var done = function () {
        PC.closeModal();
        PC.toast('Inquiry sent — pandit ji will contact you directly.');
      };
      var promise = !PC.api ? null
        : opts.panditId ? PC.api.panditEnquiry(opts.panditId, payload)
        : opts.templeId ? PC.api.templeInquiry(opts.templeId, payload)
        : PC.api.contact({ name: payload.name, email: payload.phone + '@enquiry.panditconnect.in', phone: payload.phone, subject: 'Service enquiry: ' + PC.serviceName(payload.service), message: payload.message || '(no message)' });
      if (promise) promise.then(done, done); // soft-fail: still confirm if the backend is offline
      else done();
    });
  };

  /* count-up on stat numbers */
  function initCountUp() {
    var els = $$('[data-count]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target, raw = el.dataset.count;
        var target = parseInt(raw.replace(/[^0-9]/g, ''), 10);
        var suffix = raw.replace(/[0-9,]/g, '');
        if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = raw; return; }
        var start = performance.now(), dur = 1100;
        (function step(now) {
          var t = Math.min(1, (now - start) / dur);
          var v = Math.floor(target * (1 - Math.pow(1 - t, 3)));
          el.textContent = v.toLocaleString('en-IN') + suffix;
          if (t < 1) requestAnimationFrame(step); else el.textContent = raw;
        })(start);
      });
    }, { threshold: .4 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* forms marked data-demo-form just acknowledge — no backend yet */
  function initDemoForms() {
    $$('form[data-demo-form]').forEach(function (f) {
      if (f.dataset.bound) return;
      f.dataset.bound = '1';
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        PC.toast(f.dataset.demoForm || 'Sent — we will get back to you.');
        f.reset();
      });
    });
  }

  /* ----------------------------------------------------------------- boot */
  PC.boot = function () {
    if (PC._booted) return;          // page controllers append; never run them twice
    PC._booted = true;
    var page = document.body.dataset.page || '';
    mountHeader(page);
    mountFooter();
    if (PC.pages && PC.pages[page]) {
      try { PC.pages[page](); } catch (err) { console.error('[PanditConnect] page init failed:', err); }
    }
    initReveal();
    initCountUp();
    initDemoForms();
    PC.initTabs();
    PC.initAccordion();
    PC.initFavs();
  };

  document.addEventListener('DOMContentLoaded', PC.boot);
})();
