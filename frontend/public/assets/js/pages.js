/* ==========================================================================
   PanditConnect — per-page controllers, keyed by <body data-page="...">
   ========================================================================== */

(function () {
  'use strict';

  var $ = PC.$, $$ = PC.$$;
  PC.pages = {};

  function set(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }
  function on(sel, ev, fn) { var el = $(sel); if (el) el.addEventListener(ev, fn); }

  /* ==================================================================== HOME */
  PC.pages.home = function () {
    set('statStrip', PC.stats.map(function (s) {
      return '<div class="stat"><span class="stat-ico">' + PC.icon(s.icon, { size: 44 }) + '</span>' +
        '<span class="stat-text"><span class="stat-num" data-count="' + s.num + '">0</span>' +
        '<span class="stat-label">' + s.label + '</span></span></div>';
    }).join(''));

    /* how it works */
    var steps = [
      { icon: 'search', h: 'Search a temple or service', p: 'Browse 200+ temples by city, or start from the ritual you need. Filter by language, rating and experience.' },
      { icon: 'users', h: 'Compare pandit profiles', p: 'Read verified reviews, watch the 60-second video intro, check Vedic qualifications and gotra tradition.' },
      { icon: 'whatsapp', h: 'Contact directly — no middleman', p: 'Call or WhatsApp pandit ji yourself. You settle the date, vidhi and dakshina together. We take nothing.' },
    ];
    set('steps', steps.map(function (s, i) {
      return '<article class="card step reveal" style="transition-delay:' + (i * 90) + 'ms">' +
        '<span class="step-n">0' + (i + 1) + '</span>' +
        '<div class="step-ico">' + PC.icon(s.icon, { size: 30 }) + '</div>' +
        '<h3>' + s.h + '</h3><p>' + s.p + '</p></article>';
    }).join(''));

    /* featured pandits — top rated, two rows */
    var top = PC.pandits.slice().sort(function (a, b) { return b.rating - a.rating || b.reviews - a.reviews; }).slice(0, 8);
    set('featuredPandits', top.map(function (p) { return '<div class="reveal">' + PC.panditCard(p) + '</div>'; }).join(''));

    /* popular temples */
    var pop = PC.temples.slice().sort(function (a, b) { return b.reviews - a.reviews; }).slice(0, 6);
    set('popularTemples', pop.map(function (t) { return '<div class="reveal">' + PC.templeCard(t) + '</div>'; }).join(''));

    /* popular services */
    var svcPop = PC.services.slice().sort(function (a, b) { return b.pandits - a.pandits; }).slice(0, 8);
    set('popularServices', svcPop.map(function (s) { return '<div class="reveal">' + PC.serviceCard(s) + '</div>'; }).join(''));

    /* testimonials */
    set('testimonials', PC.reviews.slice(0, 3).map(function (r) {
      return '<article class="card quote reveal">' + PC.stars(r.rating, 18) +
        '<p>' + PC.esc(r.text) + '</p>' +
        '<div class="row"><span class="avatar-ring avatar-ring--sm" style="width:44px;height:44px">' +
        '<img src="assets/img/pandit-placeholder.svg" alt=""></span>' +
        '<span><strong style="font-family:var(--font-head);font-size:.95rem">' + PC.esc(r.name) + '</strong>' +
        '<span class="muted" style="display:block;font-size:.82rem">' + PC.esc(r.city) + ' · ' + PC.esc(r.service) + '</span></span></div>' +
        '</article>';
    }).join(''));

    /* festival strip */
    set('festStrip', PC.festivals.map(function (f) {
      return '<article class="fest-card"><span class="fest-date">' + f.label + '</span>' +
        '<h4>' + PC.esc(f.name) + '</h4><p class="muted" style="font-size:.84rem">' + PC.esc(f.note) + '</p></article>';
    }).join(''));

    PC.initFavs();
  };

  /* ============================================================ DIRECTORIES */
  function paginate(items, page, per) {
    var pages = Math.max(1, Math.ceil(items.length / per));
    page = Math.min(Math.max(1, page), pages);
    return { page: page, pages: pages, slice: items.slice((page - 1) * per, page * per) };
  }

  function pagerHTML(page, pages) {
    if (pages < 2) return '';
    var out = '<button data-pg="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + ' aria-label="Previous page">' + PC.icon('chevron-left', { size: 18 }) + '</button>';
    for (var i = 1; i <= pages; i++) {
      out += '<button data-pg="' + i + '"' + (i === page ? ' class="is-active" aria-current="page"' : '') + '>' + i + '</button>';
    }
    out += '<button data-pg="' + (page + 1) + '"' + (page === pages ? ' disabled' : '') + ' aria-label="Next page">' + PC.icon('chevron-right', { size: 18 }) + '</button>';
    return out;
  }

  function checkboxes(name, values, counts) {
    return values.map(function (v) {
      return '<label class="check"><input type="checkbox" name="' + name + '" value="' + PC.esc(v) + '">' +
        '<span>' + PC.esc(v) + '</span>' +
        (counts && counts[v] != null ? '<span class="check-count">(' + counts[v] + ')</span>' : '') + '</label>';
    }).join('');
  }

  function countBy(list, key) {
    return list.reduce(function (acc, it) { acc[it[key]] = (acc[it[key]] || 0) + 1; return acc; }, {});
  }

  function readChecks(name) {
    return $$('input[name="' + name + '"]:checked').map(function (i) { return i.value; });
  }

  /* ----------------------------------------------------------- temples list */
  PC.pages.temples = function () {
    var state = { q: PC.param('q'), city: PC.param('city'), page: 1, sort: 'rating' };

    var cityCounts = countBy(PC.temples, 'city');
    var stateCounts = countBy(PC.temples, 'state');
    var svcList = ['griha-pravesh', 'havan-yagna', 'rudrabhishek', 'wedding', 'durga-path', 'pitru-dosh', 'katha-bhagwat', 'aarti-seva'];

    set('filters',
      '<div class="row-between"><h3 style="font-size:1.16rem">' + PC.icon('sliders', { size: 19 }) + ' Filters</h3>' +
      '<button class="filter-clear" id="clearF">Clear all</button></div>' +
      '<div class="filter-group" style="margin-top:18px"><h4>City</h4>' + checkboxes('city', PC.cities.filter(function (c) { return cityCounts[c]; }), cityCounts) + '</div>' +
      '<div class="filter-group"><h4>State</h4>' + checkboxes('state', PC.states.filter(function (s) { return stateCounts[s]; }), stateCounts) + '</div>' +
      '<div class="filter-group"><h4>Service Type</h4>' + checkboxes('service', svcList.map(PC.serviceName)) + '</div>' +
      '<div class="filter-group"><h4>Rating</h4>' +
      [4.8, 4.7, 4.6, 4.0].map(function (r) {
        var n = PC.temples.filter(function (t) { return t.rating >= r; }).length;
        return '<label class="check"><input type="radio" name="rating" value="' + r + '" style="border-radius:50%">' +
          PC.stars(r) + '<span class="check-count">(' + n + ')</span></label>';
      }).join('') + '</div>');

    if (state.city) {
      var box = $('input[name="city"][value="' + state.city + '"]');
      if (box) box.checked = true;
    }
    if (state.q) $('#tSearch').value = state.q;

    function apply() {
      var cities = readChecks('city'), states = readChecks('state'), svcs = readChecks('service');
      var minR = ($('input[name="rating"]:checked') || {}).value;
      var q = state.q.toLowerCase();

      var list = PC.temples.filter(function (t) {
        if (q && (t.name + ' ' + t.city + ' ' + t.state + ' ' + t.deity).toLowerCase().indexOf(q) < 0) return false;
        if (cities.length && cities.indexOf(t.city) < 0) return false;
        if (states.length && states.indexOf(t.state) < 0) return false;
        if (minR && t.rating < parseFloat(minR)) return false;
        if (svcs.length) {
          var names = t.services.map(PC.serviceName);
          if (!svcs.some(function (s) { return names.indexOf(s) > -1; })) return false;
        }
        return true;
      });

      list.sort(function (a, b) {
        if (state.sort === 'pandits') return b.pandits - a.pandits;
        if (state.sort === 'name') return a.name.localeCompare(b.name);
        if (state.sort === 'reviews') return b.reviews - a.reviews;
        return b.rating - a.rating;
      });

      var pg = paginate(list, state.page, 9);
      state.page = pg.page;

      set('resultCount', '<strong>' + list.length + '</strong> temple' + (list.length === 1 ? '' : 's') + ' found');
      set('templeGrid', pg.slice.length ? pg.slice.map(PC.templeCard).join('')
        : PC.emptyState('Try removing a filter, or search a different city.'));
      set('pager', pagerHTML(pg.page, pg.pages));
      PC.initFavs($('#templeGrid'));
      $$('#pager button[data-pg]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.page = parseInt(b.dataset.pg, 10);
          apply();
          $('#gridTop').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    $$('#filters input').forEach(function (i) {
      i.addEventListener('change', function () { state.page = 1; apply(); });
    });
    on('#clearF', 'click', function () {
      $$('#filters input').forEach(function (i) { i.checked = false; });
      state.q = ''; $('#tSearch').value = ''; state.page = 1; apply();
    });
    on('#templeSearchForm', 'submit', function (e) {
      e.preventDefault();
      state.q = $('#tSearch').value.trim();
      var c = $('#tCity').value;
      $$('input[name="city"]').forEach(function (i) { i.checked = c ? i.value === c : false; });
      state.page = 1; apply();
    });
    on('#tSort', 'change', function (e) { state.sort = e.target.value; state.page = 1; apply(); });

    $('#tCity').innerHTML = '<option value="">Select City</option>' +
      PC.cities.filter(function (c) { return cityCounts[c]; }).map(function (c) {
        return '<option value="' + c + '"' + (c === state.city ? ' selected' : '') + '>' + c + '</option>';
      }).join('');

    apply();
  };

  /* ----------------------------------------------------------- pandits list */
  PC.pages.pandits = function () {
    var state = { q: PC.param('q'), page: 1, sort: 'rating' };
    var preSvc = PC.param('service');
    var cityCounts = countBy(PC.pandits, 'city');

    var svcUsed = PC.services.filter(function (s) { return PC.panditsForService(s.id).length; });

    set('filters',
      '<div class="row-between"><h3 style="font-size:1.16rem">' + PC.icon('sliders', { size: 19 }) + ' Filters</h3>' +
      '<button class="filter-clear" id="clearF">Clear all</button></div>' +
      '<div class="filter-group" style="margin-top:18px"><h4>City</h4>' + checkboxes('city', PC.cities.filter(function (c) { return cityCounts[c]; }), cityCounts) + '</div>' +
      '<div class="filter-group"><h4>Service</h4><div style="max-height:230px;overflow-y:auto;padding-right:4px">' +
      svcUsed.map(function (s) {
        return '<label class="check"><input type="checkbox" name="service" value="' + s.id + '"' + (s.id === preSvc ? ' checked' : '') + '>' +
          '<span>' + PC.esc(s.name) + '</span><span class="check-count">(' + PC.panditsForService(s.id).length + ')</span></label>';
      }).join('') + '</div></div>' +
      '<div class="filter-group"><h4>Language</h4><div style="max-height:200px;overflow-y:auto">' +
      checkboxes('lang', PC.languages.filter(function (l) {
        return PC.pandits.some(function (p) { return p.langs.indexOf(l) > -1; });
      })) + '</div></div>' +
      '<div class="filter-group"><h4>Experience</h4>' +
      [20, 15, 10, 5].map(function (y) {
        var n = PC.pandits.filter(function (p) { return p.exp >= y; }).length;
        return '<label class="check"><input type="radio" name="exp" value="' + y + '" style="border-radius:50%">' +
          '<span>' + y + '+ years</span><span class="check-count">(' + n + ')</span></label>';
      }).join('') + '</div>' +
      '<div class="filter-group"><h4>Rating</h4>' +
      [4.8, 4.7, 4.5].map(function (r) {
        var n = PC.pandits.filter(function (p) { return p.rating >= r; }).length;
        return '<label class="check"><input type="radio" name="rating" value="' + r + '" style="border-radius:50%">' +
          PC.stars(r) + '<span class="check-count">(' + n + ')</span></label>';
      }).join('') + '</div>' +
      '<div class="filter-group"><label class="check"><input type="checkbox" name="verified" value="1" checked>' +
      '<span>Verified only</span></label></div>');

    if (state.q) $('#pSearch').value = state.q;

    function apply() {
      var cities = readChecks('city'), svcs = readChecks('service'), langs = readChecks('lang');
      var minExp = ($('input[name="exp"]:checked') || {}).value;
      var minR = ($('input[name="rating"]:checked') || {}).value;
      var onlyVerified = $('input[name="verified"]').checked;
      var q = state.q.toLowerCase();

      var list = PC.pandits.filter(function (p) {
        if (q) {
          var hay = (p.name + ' ' + p.city + ' ' + p.state + ' ' + p.langs.join(' ') + ' ' +
            p.services.map(PC.serviceName).join(' ')).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        if (cities.length && cities.indexOf(p.city) < 0) return false;
        if (svcs.length && !svcs.some(function (s) { return p.services.indexOf(s) > -1; })) return false;
        if (langs.length && !langs.some(function (l) { return p.langs.indexOf(l) > -1; })) return false;
        if (minExp && p.exp < parseInt(minExp, 10)) return false;
        if (minR && p.rating < parseFloat(minR)) return false;
        if (onlyVerified && !p.verified) return false;
        return true;
      });

      list.sort(function (a, b) {
        if (state.sort === 'exp') return b.exp - a.exp;
        if (state.sort === 'reviews') return b.reviews - a.reviews;
        if (state.sort === 'name') return a.name.localeCompare(b.name);
        return b.rating - a.rating;
      });

      var pg = paginate(list, state.page, 8);
      state.page = pg.page;
      set('resultCount', '<strong>' + list.length + '</strong> pandit' + (list.length === 1 ? '' : 's') + ' available');
      set('panditGrid', pg.slice.length ? pg.slice.map(PC.panditCard).join('')
        : PC.emptyState('No pandit matched all filters. Try widening the language or service filter.'));
      set('pager', pagerHTML(pg.page, pg.pages));
      $$('#pager button[data-pg]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.page = parseInt(b.dataset.pg, 10); apply();
          $('#gridTop').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    $$('#filters input').forEach(function (i) { i.addEventListener('change', function () { state.page = 1; apply(); }); });
    on('#clearF', 'click', function () {
      $$('#filters input').forEach(function (i) { i.checked = i.name === 'verified'; });
      state.q = ''; $('#pSearch').value = ''; state.page = 1; apply();
    });
    on('#panditSearchForm', 'submit', function (e) {
      e.preventDefault(); state.q = $('#pSearch').value.trim(); state.page = 1; apply();
    });
    on('#pSort', 'change', function (e) { state.sort = e.target.value; state.page = 1; apply(); });

    apply();
  };

  /* --------------------------------------------------------- temple detail */
  PC.pages['temple-detail'] = function () {
    var t = PC.temple(PC.param('id')) || PC.temples[0];
    document.title = t.name + ' — PanditConnect';

    set('banner',
      // wide banner crop: fall back to the detailed hero artwork, not the card thumbnail
      '<img src="' + t.img + '" alt="' + PC.esc(t.name) + '"' + PC.fallbackAttr('hero') + '>' +
      '<div class="shell">' +
      '<div class="banner-card"><h1>' + PC.esc(t.name) + '</h1>' +
      '<div class="row"><span class="meta-line">' + PC.icon('map-pin', { size: 16 }) + PC.esc(t.city + ', ' + t.state) + '</span>' +
      '<span class="divider-v"></span>' + PC.ratingRow(t.rating, t.reviews) +
      '<span class="divider-v"></span><span class="badge-gold">' + PC.icon('user', { size: 13 }) + t.pandits + ' Pandits</span>' +
      '</div></div></div>');

    /* --- Overview --- */
    var pandits = PC.panditsAtTemple(t.id);
    set('overviewPandits',
      '<div class="row-between" style="margin-bottom:18px"><h2 style="font-size:1.5rem">Available Pandits</h2>' +
      '<a href="#pandits" class="row" data-goto-tab="pandits" style="color:var(--gold-deep);font-weight:600;font-size:.92rem">All ' +
      PC.icon('chevron-right', { size: 16 }) + '</a></div>' +
      '<div class="scroll-x">' + pandits.map(PC.panditCard).join('') + '</div>');

    set('templeAbout',
      '<h2 style="font-size:1.5rem;margin-bottom:12px">About the temple</h2>' +
      '<p style="color:#4d4a45">' + PC.esc(t.about) + '</p>' +
      '<div class="grid g-2" style="margin-top:22px;gap:16px">' +
      [['clock', 'Darshan timings', t.timings], ['temple', 'Presiding deity', t.deity],
        ['calendar', 'Established', t.est], ['map-pin', 'Location', t.city + ', ' + t.state]]
        .map(function (r) {
          return '<div class="pg-item"><div class="k">' + r[1] + '</div><div class="v">' + PC.esc(r[2]) + '</div></div>';
        }).join('') + '</div>' +
      '<h3 style="margin-top:26px;font-size:1.2rem">Highlights & special sevas</h3>' +
      '<ul class="dot-list" style="margin-top:10px">' + t.highlights.map(function (h) {
        return '<li>' + PC.esc(h) + '</li>';
      }).join('') + '</ul>');

    /* --- Pandits tab --- */
    set('panditsPanel', '<div class="grid g-2">' + pandits.map(PC.panditCard).join('') + '</div>');

    /* --- Services tab --- */
    set('servicesPanel',
      '<p class="muted" style="margin-bottom:22px">Rituals regularly performed at ' + PC.esc(t.name) + '. Tap any service to see the samagri list and the pandits who offer it.</p>' +
      '<div class="grid g-4">' + t.services.map(function (id) {
        var s = PC.service(id); return s ? PC.serviceCard(s) : '';
      }).join('') + '</div>');

    /* --- Reviews tab --- */
    var revs = PC.reviews.slice(0, 4);
    set('reviewsPanel',
      '<div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:24px">' +
      '<div class="card card-pad card--cream text-c" style="min-width:190px">' +
      '<div style="font-family:var(--font-head);font-size:2.6rem;font-weight:800;line-height:1">' + t.rating.toFixed(1) + '</div>' +
      PC.stars(t.rating, 20) + '<p class="muted" style="margin-top:6px">' + t.reviews + ' devotee reviews</p></div>' +
      '<div class="stack" style="flex:1;min-width:240px;gap:8px">' +
      [5, 4, 3, 2, 1].map(function (n, i) {
        var pct = [76, 17, 4, 2, 1][i];
        return '<div class="row" style="gap:12px"><span class="muted" style="width:34px">' + n + ' ★</span>' +
          '<span style="flex:1;height:8px;border-radius:4px;background:var(--cream-deep);overflow:hidden">' +
          '<span style="display:block;height:100%;width:' + pct + '%;background:var(--gold-grad)"></span></span>' +
          '<span class="muted" style="width:38px;text-align:right">' + pct + '%</span></div>';
      }).join('') + '</div></div>' +
      '<div class="grid g-2">' + revs.map(PC.reviewCard).join('') + '</div>' +
      '<button class="btn btn-outline" style="margin-top:22px" id="writeReview">' + PC.icon('edit', { size: 17 }) + ' Write a review</button>');

    on('#writeReview', 'click', function () {
      PC.modal('<h3 style="font-size:1.4rem">Write a review</h3>' +
        '<p class="muted" style="margin-top:6px">Only devotees who have had a ceremony performed can post — we verify before publishing.</p>' +
        '<form data-demo-form="Review submitted for verification. Dhanyavaad!" style="margin-top:18px">' +
        '<div class="field-group"><label class="label" for="rvName">Your name</label><input class="input" id="rvName" required></div>' +
        '<div class="field-group"><label class="label" for="rvText">Your experience</label><textarea class="textarea" id="rvText" required></textarea></div>' +
        '<button class="btn btn-gold btn-block" type="submit">Submit review</button></form>');
      var f = $('#pcModal form');
      f.addEventListener('submit', function (e) { e.preventDefault(); PC.closeModal(); PC.toast('Review submitted for verification. Dhanyavaad!'); });
    });

    /* --- Location tab --- */
    var mapQ = encodeURIComponent(t.name + ', ' + t.city + ', ' + t.state);
    set('locationPanel',
      '<div class="grid g-2" style="align-items:start">' +
      '<div><h3 style="font-size:1.24rem;margin-bottom:10px">How to reach</h3>' +
      '<ul class="dot-list"><li>Nearest railway station: ' + PC.esc(t.city) + ' Junction</li>' +
      '<li>Auto and e-rickshaw available from the station to the temple gate</li>' +
      '<li>Shoe stands and cloakroom near the main entrance</li>' +
      '<li>Arrive 40 minutes before aarti on weekends and festival days</li></ul>' +
      '<div class="row" style="gap:10px;margin-top:20px;flex-wrap:wrap">' +
      '<a class="btn btn-gold" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + mapQ + '">' +
      PC.icon('map-pin', { size: 17 }) + ' Open in Google Maps</a>' +
      '<a class="btn btn-outline" href="temple-map.html">' + PC.icon('map', { size: 17 }) + ' See all temples</a></div></div>' +
      '<div class="card" style="padding:0;overflow:hidden">' +
      '<div style="aspect-ratio:4/3;background:var(--ivory);display:grid;place-items:center;text-align:center;padding:24px">' +
      '<div>' + PC.icon('map', { size: 54 }) + '<p style="font-family:var(--font-head);font-weight:600;margin-top:10px">' + PC.esc(t.name) + '</p>' +
      '<p class="muted">' + t.lat.toFixed(4) + '° N, ' + t.lng.toFixed(4) + '° E</p>' +
      '<p class="muted" style="font-size:.8rem;margin-top:10px">Add your Google Maps API key in <code>temple-detail.html</code> to embed the live map here.</p></div>' +
      '</div></div></div>');

    /* nearby temples */
    var nearby = PC.temples.filter(function (x) { return x.id !== t.id && (x.state === t.state || x.deity === t.deity); }).slice(0, 3);
    if (!nearby.length) nearby = PC.temples.filter(function (x) { return x.id !== t.id; }).slice(0, 3);
    set('nearby', nearby.map(PC.templeCard).join(''));

    /* inquiry sidebar */
    set('inquiryBox',
      '<img src="assets/img/mandala.svg" class="watermark watermark--br" alt="" style="width:150px">' +
      '<h3>Inquiry</h3>' +
      '<form id="inqForm">' +
      '<div class="field-group"><label class="label" for="iqName">Your name</label><input class="input" id="iqName" required placeholder="Your name"></div>' +
      '<div class="field-group"><label class="label" for="iqPhone">Phone number</label><input class="input" id="iqPhone" type="tel" required placeholder="Phone number"></div>' +
      '<div class="field-group"><label class="label" for="iqSvc">Select your service</label><select class="select" id="iqSvc">' +
      t.services.map(function (id) { return '<option value="' + id + '">' + PC.esc(PC.serviceName(id)) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field-group"><label class="label" for="iqDate">Date picker</label><input class="input" id="iqDate" type="date"></div>' +
      '<button class="btn btn-gold btn-block" type="submit" style="margin-top:18px">' + PC.icon('send', { size: 17 }) + ' Send Inquiry</button>' +
      '<p class="form-note">Free to send. No commission — you deal with pandit ji directly.</p></form>');

    on('#inqForm', 'submit', function (e) {
      e.preventDefault();
      var payload = { name: $('#iqName').value, phone: $('#iqPhone').value, service: $('#iqSvc').value, date: $('#iqDate').value };
      var done = function () {
        PC.toast('Inquiry sent to ' + t.pandits + ' pandits at this temple.');
        $('#inqForm').reset();
      };
      if (PC.api) PC.api.templeInquiry(t.id, payload).then(done, done);
      else done();
    });

    PC.initTabs();
    PC.initFavs();
    $$('[data-goto-tab]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var tab = $('.tab[data-tab="' + a.dataset.gotoTab + '"]');
        if (tab) { tab.click(); tab.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
    });
  };

  /* -------------------------------------------------------- pandit profile */
  PC.pages['pandit-profile'] = function () {
    var p = PC.pandit(PC.param('id')) || PC.pandits[0];
    document.title = p.name + ' — PanditConnect';

    set('profileId',
      '<img src="assets/img/mandala.svg" class="mandala-bg" alt="">' +
      '<div class="avatar-ring avatar-ring--lg"><img src="' + p.img + '" alt="' + PC.esc(p.name) + '"' + PC.fallbackAttr('pandit') + '></div>' +
      '<h1>' + PC.esc(p.name) + ' ' + (p.verified ? '<span class="verified-dot" title="Verified pandit">' + PC.icon('verified', { size: 28 }) + '</span>' : '') + '</h1>' +
      '<div class="row" style="justify-content:center;margin-top:10px">' + PC.stars(p.rating, 21) +
      '<span class="rating-num" style="font-size:1.05rem">(' + p.rating.toFixed(1) + '/5)</span>' +
      '<span class="muted">' + p.reviews + ' reviews</span></div>' +
      '<div class="row" style="justify-content:center;margin-top:14px;flex-wrap:wrap">' +
      '<span class="meta-line">' + PC.icon('map-pin', { size: 17 }) + PC.esc(p.city + ', ' + p.state) + '</span>' +
      '<span class="tag">' + p.exp + '+ Years Experience</span></div>' +
      '<div class="row" style="justify-content:center;margin-top:22px;gap:10px;flex-wrap:wrap">' +
      '<a class="btn-icon" href="' + PC.waLink(p) + '" target="_blank" rel="noopener" aria-label="WhatsApp ' + PC.esc(p.name) + '">' + PC.icon('whatsapp', { size: 22 }) + '</a>' +
      '<a class="btn btn-gold btn-lg" href="' + PC.telLink(p) + '">' + PC.icon('phone', { size: 19 }) + ' Call Now</a>' +
      '<button class="btn btn-outline btn-lg" id="msgBtn">Send Message</button></div>' +
      '<p class="muted" style="margin-top:14px;font-size:.84rem">' + PC.icon('shield-check', { size: 14 }) +
      ' Verified profile · You contact pandit ji directly — we charge no commission</p>');

    on('#msgBtn', 'click', function () {
      PC.enquiryModal({ panditId: p.id, subtitle: 'Your message goes straight to ' + p.name + '. No middleman, no booking fee.', service: p.services[0] });
    });

    set('svcOffered',
      '<h3>Services Offered</h3><div class="tag-row" style="justify-content:flex-start">' +
      p.services.map(function (s) {
        return '<a class="tag" href="service-detail.html?id=' + s + '">' + PC.esc(PC.serviceName(s)) + '</a>';
      }).join('') + '</div>');

    set('assocTemples',
      '<h3>Associated Temples</h3><ul class="dot-list">' +
      p.temples.map(function (id) {
        var t = PC.temple(id);
        return t ? '<li><a href="temple-detail.html?id=' + t.id + '">' + PC.esc(t.name) + '</a></li>' : '';
      }).join('') + '</ul>');

    set('credentials',
      '<h3>Qualifications & Verification</h3>' +
      '<div class="grid g-2" style="gap:14px;margin-top:6px">' +
      [['award', 'Vedic education', p.edu], ['book-open', 'Gotra / tradition', p.gotra],
        ['globe', 'Languages spoken', p.langs.join(', ')], ['briefcase', 'Experience', p.exp + ' years']]
        .map(function (r) {
          return '<div class="pg-item"><div class="k">' + r[1] + '</div><div class="v" style="font-size:.98rem">' + PC.esc(r[2]) + '</div></div>';
        }).join('') + '</div>' +
      '<div class="usp-band" style="margin-top:18px;padding:18px 20px">' +
      '<div class="row" style="gap:14px;flex-wrap:wrap">' +
      ['Documents verified', 'Video KYC completed', 'Certificate checked', 'Temple confirmed'].map(function (v) {
        return '<span class="meta-line" style="font-weight:500;color:var(--text)">' + PC.icon('check-circle', { size: 16 }) + v + '</span>';
      }).join('') + '</div></div>');

    set('aboutPandit', '<h3>About ' + PC.esc(p.name.replace('Pandit ', 'Pandit ji — ')) + '</h3><p style="color:#4d4a45">' + PC.esc(p.about) + '</p>');

    set('videoIntro',
      '<h3>60-second video introduction</h3>' +
      '<div class="video-ph" style="margin-top:12px" id="videoPh" role="button" tabindex="0" aria-label="Play video introduction">' +
      '<span class="play">' + PC.icon('play', { size: 26, fill: true }) + '</span>' +
      '<span>Video intro by ' + PC.esc(p.name) + '</span></div>');
    on('#videoPh', 'click', function () { PC.toast('Video intros go live once the pandit uploads from the dashboard.'); });

    /* availability — next 14 days, deterministic per pandit */
    var days = [], today = new Date();
    for (var i = 0; i < 14; i++) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      var seed = (d.getDate() * 7 + p.name.length * 3 + d.getMonth()) % 10;
      days.push({ d: d, free: seed > 2 });
    }
    set('availability',
      '<h3>Availability — next 14 days</h3>' +
      '<div class="grid" style="grid-template-columns:repeat(7,1fr);gap:8px;margin-top:14px">' +
      days.map(function (x) {
        return '<div class="cal-d" style="' + (x.free ? '' : 'opacity:.42;background:var(--cream-deep)') + '" title="' +
          (x.free ? 'Available' : 'Booked') + '">' +
          '<strong style="font-size:.95rem">' + x.d.getDate() + '</strong>' +
          '<span style="font-size:.62rem;color:' + (x.free ? 'var(--success)' : 'var(--text-2)') + '">' +
          (x.free ? 'Free' : 'Busy') + '</span></div>';
      }).join('') + '</div>' +
      '<p class="form-note">Indicative only — always confirm the date on call or WhatsApp.</p>');

    set('reviewsList',
      '<h3>Reviews</h3><div class="scroll-x" style="margin-top:14px">' +
      PC.reviews.map(PC.reviewCard).join('') + '</div>');

    /* QR + share */
    set('qrShare',
      '<h3>Share this profile</h3>' +
      '<div class="row" style="gap:18px;margin-top:14px;flex-wrap:wrap;align-items:flex-start">' +
      '<div class="qr-box">' + qrSvg(p.id) + '<p class="muted" style="font-size:.76rem;margin-top:8px">Scan for profile</p></div>' +
      '<div class="stack" style="gap:10px;flex:1;min-width:200px">' +
      '<button class="btn btn-outline" id="copyLink">' + PC.icon('share', { size: 17 }) + ' Copy profile link</button>' +
      '<a class="btn btn-outline" href="' + PC.waLink(p) + '" target="_blank" rel="noopener">' + PC.icon('whatsapp', { size: 17 }) + ' Share on WhatsApp</a>' +
      '<p class="muted" style="font-size:.82rem">Every pandit gets a printable QR code — paste it at the temple counter so devotees can find the profile offline.</p>' +
      '</div></div>');

    on('#copyLink', 'click', function () {
      var url = location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { PC.toast('Profile link copied'); });
      else PC.toast(url);
    });

    /* similar pandits */
    var similar = PC.pandits.filter(function (x) {
      return x.id !== p.id && (x.city === p.city || x.services.some(function (s) { return p.services.indexOf(s) > -1; }));
    }).slice(0, 4);
    set('similarPandits', similar.map(PC.panditCard).join(''));
  };

  /* deterministic decorative QR-style block (not a scannable code) */
  function qrSvg(seedStr) {
    var seed = 0;
    for (var i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 100000;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    var n = 21, cell = 148 / n, out = '';
    function finder(ox, oy) {
      out += '<rect x="' + ox * cell + '" y="' + oy * cell + '" width="' + 7 * cell + '" height="' + 7 * cell + '" fill="#2d2d2d"/>';
      out += '<rect x="' + (ox + 1) * cell + '" y="' + (oy + 1) * cell + '" width="' + 5 * cell + '" height="' + 5 * cell + '" fill="#fff"/>';
      out += '<rect x="' + (ox + 2) * cell + '" y="' + (oy + 2) * cell + '" width="' + 3 * cell + '" height="' + 3 * cell + '" fill="#d4a017"/>';
    }
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
        if (inFinder) continue;
        if (rnd() > .52) out += '<rect x="' + x * cell + '" y="' + y * cell + '" width="' + cell + '" height="' + cell + '" fill="#2d2d2d"/>';
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    return '<svg viewBox="0 0 148 148" role="img" aria-label="Profile QR code"><rect width="148" height="148" fill="#fff"/>' + out + '</svg>';
  }

  /* -------------------------------------------------------------- services */
  PC.pages.services = function () {
    var cats = [{ id: 'all', label: 'All Services' }, { id: 'daily', label: 'Daily Pooja' },
      { id: 'life', label: 'Life Events' }, { id: 'festival', label: 'Festivals' }, { id: 'shanti', label: 'Shanti / Remedy' }];
    var active = PC.param('cat') || 'all';

    set('catBar', cats.map(function (c) {
      return '<button class="pill' + (c.id === active ? ' is-active' : '') + '" data-cat="' + c.id + '">' + c.label + '</button>';
    }).join(''));

    function render(cat, q) {
      var list = PC.services.filter(function (s) {
        if (cat !== 'all' && s.cat !== cat) return false;
        if (q && (s.name + ' ' + s.tag + ' ' + s.desc).toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
        return true;
      });
      set('svcGrid', list.length ? list.map(PC.serviceCard).join('')
        : PC.emptyState('No service matched. Try the AI Pooja Guide if you are unsure what you need.'));
      set('svcCount', '<strong>' + list.length + '</strong> of ' + PC.services.length + ' services');
    }

    $$('#catBar .pill').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#catBar .pill').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        active = b.dataset.cat;
        render(active, $('#svcSearch').value.trim());
      });
    });
    on('#svcSearchForm', 'submit', function (e) { e.preventDefault(); render(active, $('#svcSearch').value.trim()); });
    on('#svcSearch', 'input', function (e) { render(active, e.target.value.trim()); });

    render(active, '');
  };

  /* -------------------------------------------------------- service detail */
  PC.pages['service-detail'] = function () {
    var s = PC.service(PC.param('id')) || PC.services[0];
    document.title = s.name + ' — PanditConnect';

    var pandits = PC.panditsForService(s.id);
    var temples = PC.templesForService(s.id);

    set('svcHead',
      '<div class="svc-ico" style="width:74px;height:74px;margin:0 auto 16px">' + PC.icon(s.icon, { size: 74 }) + '</div>' +
      '<h1 class="section-title" style="font-size:clamp(1.9rem,3.6vw,2.8rem)">' + PC.esc(s.name) + '</h1>' +
      PC.ornament() +
      '<p class="section-sub">' + PC.esc(s.desc) + '</p>' +
      '<div class="row" style="justify-content:center;gap:12px;margin-top:20px;flex-wrap:wrap">' +
      '<span class="tag tag--soft">' + PC.icon('clock', { size: 14 }) + ' ' + PC.esc(s.dur) + '</span>' +
      '<span class="tag tag--soft">' + PC.icon('users', { size: 14 }) + ' ' + s.pandits + ' pandits offer this</span>' +
      '<span class="tag tag--soft">' + PC.icon('temple', { size: 14 }) + ' ' + temples.length + ' listed temples</span></div>');

    set('samagri',
      '<h2 style="font-size:1.4rem">Required Samagri</h2>' +
      '<p class="muted" style="margin:8px 0 16px">Standard list — confirm with pandit ji who arranges what. Many pandits bring the full kit for a small extra amount.</p>' +
      '<ul class="dot-list" style="columns:2;column-gap:30px">' +
      s.samagri.map(function (x) { return '<li>' + PC.esc(x) + '</li>'; }).join('') + '</ul>' +
      '<button class="btn btn-outline btn-sm" id="printSamagri" style="margin-top:18px">' +
      PC.icon('download', { size: 16 }) + ' Print / save this list</button>');
    on('#printSamagri', 'click', function () { window.print(); });

    set('muhuratBox',
      '<h3>Best muhurat for ' + PC.esc(s.name) + '</h3>' +
      PC.panchang.auspicious.slice(0, 4).map(function (m) {
        return '<div class="muhurat-row"><span>' + m.k + '</span><span class="time-chip">' + m.v + '</span></div>';
      }).join('') +
      '<div class="muhurat-row"><span>Avoid — Rahu Kaal</span><span class="time-chip time-chip--bad">' + PC.panchang.inauspicious[0].v + '</span></div>' +
      '<a class="btn btn-gold btn-block" href="panchang.html" style="margin-top:18px">' +
      PC.icon('calendar', { size: 17 }) + ' Open full Panchang</a>' +
      '<p class="form-note">Timings shown for today. A pandit ji will calculate the exact muhurat from your city and sankalp.</p>');

    set('svcPandits',
      pandits.length
        ? '<div class="grid g-2">' + pandits.slice(0, 8).map(PC.panditCard).join('') + '</div>' +
        (pandits.length > 8 ? '<div class="text-c" style="margin-top:26px"><a class="btn btn-outline" href="pandits.html?service=' + s.id + '">See all ' + pandits.length + ' pandits</a></div>' : '')
        : PC.emptyState('No pandit has listed this service yet. Try the directory or send an enquiry.'));

    set('svcTemples', temples.length
      ? '<div class="grid g-3">' + temples.slice(0, 6).map(PC.templeCard).join('') + '</div>'
      : '<p class="muted">This ritual is usually performed at home rather than at a temple.</p>');
    PC.initFavs($('#svcTemples'));

    var related = PC.services.filter(function (x) { return x.id !== s.id && x.cat === s.cat; }).slice(0, 4);
    set('relatedSvc', related.map(PC.serviceCard).join(''));

    on('#svcEnquire', 'click', function () { PC.enquiryModal({ service: s.id }); });
  };

  /* -------------------------------------------------------------- panchang */
  PC.pages.panchang = function () {
    var pg = PC.panchang;
    var today = new Date();
    var fmt = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    set('pgDate', fmt);

    set('pgCore', [
      ['Tithi', pg.tithi], ['Nakshatra', pg.nakshatra], ['Yoga', pg.yoga], ['Karana', pg.karana],
      ['Paksha', pg.paksha], ['Vaar', pg.vaar], ['Masa', pg.masa], ['Ritu', pg.ritu],
      ['Vikram Samvat', pg.vikram], ['Shaka Samvat', pg.shaka],
    ].map(function (r) {
      return '<div class="pg-item"><div class="k">' + r[0] + '</div><div class="v">' + PC.esc(r[1]) + '</div></div>';
    }).join(''));

    set('pgSun', [
      ['sun', 'Sunrise', pg.sunrise], ['moon', 'Sunset', pg.sunset],
      ['moon', 'Moonrise', pg.moonrise], ['moon', 'Moonset', pg.moonset],
    ].map(function (r) {
      return '<div class="pg-item"><div class="k">' + PC.icon(r[0], { size: 13 }) + ' ' + r[1] + '</div><div class="v">' + r[2] + '</div></div>';
    }).join(''));

    set('pgGood', pg.auspicious.map(function (m) {
      return '<div class="muhurat-row"><span>' + m.k + '</span><span class="time-chip">' + m.v + '</span></div>';
    }).join(''));
    set('pgBad', pg.inauspicious.map(function (m) {
      return '<div class="muhurat-row"><span>' + m.k + '</span><span class="time-chip time-chip--bad">' + m.v + '</span></div>';
    }).join(''));

    /* month calendar with festival dots */
    var cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    function renderCal() {
      var y = cursor.getFullYear(), m = cursor.getMonth();
      var first = new Date(y, m, 1).getDay();
      var dim = new Date(y, m + 1, 0).getDate();
      var prevDim = new Date(y, m, 0).getDate();
      set('calMonth', cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));

      var cells = '';
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (d) { cells += '<div class="cal-h">' + d + '</div>'; });
      for (var i = first - 1; i >= 0; i--) cells += '<div class="cal-d is-out">' + (prevDim - i) + '</div>';
      for (var d = 1; d <= dim; d++) {
        var iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        var fest = PC.festivals.filter(function (f) { return f.date === iso; })[0];
        var isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
        cells += '<div class="cal-d' + (isToday ? ' is-today' : '') + '"' +
          (fest ? ' title="' + PC.esc(fest.name) + '"' : '') + ' data-day="' + d + '">' + d +
          (fest ? '<span class="fest-dot"></span>' : '') + '</div>';
      }
      var tail = (7 - ((first + dim) % 7)) % 7;
      for (var k = 1; k <= tail; k++) cells += '<div class="cal-d is-out">' + k + '</div>';
      set('cal', cells);

      var monthFests = PC.festivals.filter(function (f) {
        var fd = new Date(f.date); return fd.getMonth() === m && fd.getFullYear() === y;
      });
      set('calFests', monthFests.length
        ? monthFests.map(function (f) {
          return '<div class="muhurat-row"><span><strong style="font-family:var(--font-head)">' + PC.esc(f.name) + '</strong>' +
            '<span class="muted" style="display:block;font-size:.82rem">' + PC.esc(f.note) + '</span></span>' +
            '<span class="time-chip">' + f.label + '</span></div>';
        }).join('')
        : '<p class="muted">No major festival listed this month.</p>');
    }
    on('#calPrev', 'click', function () { cursor.setMonth(cursor.getMonth() - 1); renderCal(); });
    on('#calNext', 'click', function () { cursor.setMonth(cursor.getMonth() + 1); renderCal(); });
    renderCal();

    /* muhurat finder */
    var svcSel = $('#mfService');
    svcSel.innerHTML = PC.services.map(function (s) { return '<option value="' + s.id + '">' + PC.esc(s.name) + '</option>'; }).join('');
    $('#mfCity').innerHTML = PC.cities.map(function (c) { return '<option>' + c + '</option>'; }).join('');

    on('#muhuratForm', 'submit', function (e) {
      e.preventDefault();
      var s = PC.service(svcSel.value);
      var when = $('#mfDate').value;
      var city = $('#mfCity').value;
      var slots = PC.panchang.auspicious.slice(0, 3);
      set('mfResult',
        '<div class="card card-pad card--cream" style="margin-top:22px">' +
        '<h3 style="font-size:1.16rem">Shubh muhurat for ' + PC.esc(s.name) + '</h3>' +
        '<p class="muted" style="margin:6px 0 14px">' + (when ? new Date(when).toDateString() : 'Today') + ' · ' + PC.esc(city) + ' · duration ' + PC.esc(s.dur) + '</p>' +
        slots.map(function (m) {
          return '<div class="muhurat-row"><span>' + m.k + '</span><span class="time-chip">' + m.v + '</span></div>';
        }).join('') +
        '<div class="muhurat-row"><span>Avoid — Rahu Kaal</span><span class="time-chip time-chip--bad">' + PC.panchang.inauspicious[0].v + '</span></div>' +
        '<a class="btn btn-gold" style="margin-top:18px" href="pandits.html?service=' + s.id + '">' +
        PC.icon('users', { size: 17 }) + ' Find pandits for ' + PC.esc(s.name) + '</a>' +
        '<p class="form-note">Indicative timings. A jyotish-trained pandit ji will refine this against your janm kundali and exact location.</p>' +
        '</div>');
      $('#mfResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  /* ------------------------------------------------------------- temple map
     Real lat/lng projected into the SVG box, so markers and the (approximate)
     outline share one coordinate system.
  --------------------------------------------------------------------------- */
  var INDIA_OUTLINE = [
    [34.5, 74.0], [35.5, 77.0], [34.0, 78.5], [32.5, 79.2], [30.4, 81.0], [28.5, 84.0],
    [27.0, 88.0], [27.3, 89.5], [26.8, 92.0], [27.8, 95.5], [27.0, 97.3], [25.5, 95.0],
    [24.0, 94.5], [23.0, 93.4], [22.0, 92.6], [23.5, 91.0], [25.2, 89.8], [26.5, 88.2],
    [25.0, 88.0], [23.0, 88.8], [21.5, 87.0], [19.8, 85.8], [17.7, 83.3], [16.0, 81.5],
    [13.1, 80.3], [11.0, 79.8], [9.3, 79.0], [8.1, 77.5], [9.0, 76.5], [11.5, 75.7],
    [13.5, 74.7], [15.5, 73.8], [18.9, 72.8], [21.5, 72.6], [20.9, 70.3], [22.3, 69.0],
    [23.0, 68.2], [23.9, 68.6], [24.4, 71.0], [26.0, 70.1], [28.0, 70.6], [29.5, 73.5],
    [32.0, 74.5],
  ];

  PC.pages.map = function () {
    var W = 620, H = 700, PAD = 20;
    var LAT0 = 37.2, LAT1 = 7.6, LNG0 = 67.6, LNG1 = 97.8;
    function proj(lat, lng) {
      return [
        PAD + (lng - LNG0) / (LNG1 - LNG0) * (W - PAD * 2),
        PAD + (LAT0 - lat) / (LAT0 - LAT1) * (H - PAD * 2),
      ];
    }

    var path = INDIA_OUTLINE.map(function (pt, i) {
      var xy = proj(pt[0], pt[1]);
      return (i ? 'L' : 'M') + xy[0].toFixed(1) + ' ' + xy[1].toFixed(1);
    }).join(' ') + ' Z';

    var stateSel = $('#mapState');
    stateSel.innerHTML = '<option value="">All states</option>' +
      PC.states.filter(function (s) { return PC.temples.some(function (t) { return t.state === s; }); })
        .map(function (s) { return '<option>' + s + '</option>'; }).join('');
    var svcSel = $('#mapService');
    svcSel.innerHTML = '<option value="">All services</option>' +
      PC.services.filter(function (s) { return PC.templesForService(s.id).length; })
        .map(function (s) { return '<option value="' + s.id + '">' + PC.esc(s.name) + '</option>'; }).join('');

    function render() {
      var st = stateSel.value, sv = svcSel.value;
      var list = PC.temples.filter(function (t) {
        if (st && t.state !== st) return false;
        if (sv && t.services.indexOf(sv) < 0) return false;
        return true;
      });

      var markers = list.map(function (t) {
        var xy = proj(t.lat, t.lng);
        return '<g class="marker" data-id="' + t.id + '" transform="translate(' + xy[0].toFixed(1) + ',' + xy[1].toFixed(1) + ')" ' +
          'role="button" tabindex="0" aria-label="' + PC.esc(t.name) + '">' +
          '<circle class="pin" r="7"/><circle class="pip" r="2.6"/></g>';
      }).join('');

      set('mapSvgHost',
        '<svg class="map-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Map of listed temples across India">' +
        '<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">' +
        '<path d="M40 0H0v40" fill="none" stroke="#e8d5b7" stroke-width=".6"/></pattern></defs>' +
        '<rect width="' + W + '" height="' + H + '" fill="url(#grid)" opacity=".5"/>' +
        '<path class="land" d="' + path + '"/>' + markers + '</svg>');

      set('mapList', list.map(function (t) {
        return '<div class="map-item" data-jump="' + t.id + '" role="button" tabindex="0" aria-label="Show ' + PC.esc(t.name) + ' on the map">' +
          '<strong>' + PC.esc(t.name) + '</strong>' +
          '<span class="meta-line" style="margin-top:4px">' + PC.icon('map-pin', { size: 14 }) + PC.esc(t.city + ', ' + t.state) + '</span>' +
          '<span class="row" style="margin-top:6px">' + PC.ratingCompact(t.rating) +
          '<span class="badge-gold">' + t.pandits + ' pandits</span></span></div>';
      }).join(''));
      set('mapCount', '<strong>' + list.length + '</strong> temples on the map');

      function openPop(id, ev) {
        var t = PC.temple(id);
        var pop = $('#mapPop');
        pop.innerHTML = '<strong style="font-family:var(--font-head);font-size:1rem">' + PC.esc(t.name) + '</strong>' +
          '<span class="meta-line" style="margin-top:5px">' + PC.icon('map-pin', { size: 14 }) + PC.esc(t.city + ', ' + t.state) + '</span>' +
          '<span class="row" style="margin-top:8px">' + PC.ratingRow(t.rating) + '</span>' +
          '<span class="badge-gold" style="margin-top:8px">' + t.pandits + ' pandits available</span>' +
          '<a class="btn btn-gold btn-sm btn-block" style="margin-top:12px" href="temple-detail.html?id=' + t.id + '">Explore temple</a>';
        var wrap = $('#mapWrap').getBoundingClientRect();
        var mk = $('.marker[data-id="' + id + '"]').getBoundingClientRect();
        var left = Math.min(Math.max(8, mk.left - wrap.left - 125), wrap.width - 258);
        var top = mk.top - wrap.top + 22;
        pop.style.left = left + 'px';
        pop.style.top = Math.min(top, wrap.height - 210) + 'px';
        pop.classList.add('is-open');
        $$('.marker').forEach(function (m) { m.classList.toggle('is-active', m.dataset.id === id); });
        if (ev) ev.stopPropagation();
      }

      $$('.marker').forEach(function (m) {
        m.addEventListener('click', function (e) { openPop(m.dataset.id, e); });
        m.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPop(m.dataset.id); } });
      });
      $$('[data-jump]').forEach(function (b) {
        b.addEventListener('click', function () { openPop(b.dataset.jump); });
        b.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPop(b.dataset.jump); }
        });
      });
    }

    /* bound once — render() replaces its children, not the wrapper itself */
    $('#mapWrap').addEventListener('click', function (e) {
      if (!e.target.closest('.marker') && !e.target.closest('.map-pop')) {
        $('#mapPop').classList.remove('is-open');
        $$('.marker').forEach(function (m) { m.classList.remove('is-active'); });
      }
    });

    stateSel.addEventListener('change', render);
    svcSel.addEventListener('change', render);
    render();
  };

  /* --------------------------------------------------------- AI recommender */
  PC.pages.ai = function () {
    var log = $('#chatLog');

    function bubble(cls, html) {
      var b = document.createElement('div');
      b.className = 'bubble bubble--' + cls;
      b.innerHTML = html;
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    }

    function typing() {
      return bubble('ai', '<span class="typing"><i></i><i></i><i></i></span>');
    }

    function recommend(text) {
      var q = text.toLowerCase();
      var hits = PC.recommendRules.filter(function (r) {
        return r.keys.some(function (k) { return q.indexOf(k) > -1; });
      });
      if (!hits.length) {
        return '<h4>Let me narrow it down</h4><p>I could not match that to a specific ritual yet. Tell me a little more — is it about a <strong>new home</strong>, a <strong>marriage</strong>, <strong>health</strong>, <strong>business</strong>, a <strong>child\'s ceremony</strong>, <strong>ancestors</strong>, or <strong>planetary trouble</strong>?</p>' +
          '<p style="margin-top:10px">Or browse the <a href="services.html" style="color:var(--gold-deep);font-weight:600">full service list</a>.</p>';
      }
      var svcIds = [];
      hits.forEach(function (h) { h.svc.forEach(function (s) { if (svcIds.indexOf(s) < 0) svcIds.push(s); }); });
      svcIds = svcIds.slice(0, 4);

      var out = '<h4>Suggested for your situation</h4>' +
        '<p style="margin-bottom:12px">' + PC.esc(hits[0].why) + '</p>' +
        '<div class="stack" style="gap:10px">' +
        svcIds.map(function (id) {
          var s = PC.service(id);
          return '<a href="service-detail.html?id=' + id + '" style="display:flex;gap:12px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--ivory)">' +
            '<span style="color:var(--gold);flex:none">' + PC.icon(s.icon, { size: 26 }) + '</span>' +
            '<span><strong style="font-family:var(--font-head);font-size:.95rem">' + PC.esc(s.name) + '</strong>' +
            '<span class="muted" style="display:block;font-size:.82rem">' + PC.esc(s.tag) + ' · ' + PC.esc(s.dur) + '</span></span>' +
            '<span style="margin-left:auto;color:var(--gold)">' + PC.icon('chevron-right', { size: 18 }) + '</span></a>';
        }).join('') + '</div>';

      var top = PC.panditsForService(svcIds[0]).slice(0, 2);
      if (top.length) {
        out += '<p style="margin:14px 0 8px"><strong>Pandits who perform this:</strong></p><div class="stack" style="gap:8px">' +
          top.map(function (p) {
            return '<span class="row" style="gap:10px"><span class="avatar-ring" style="width:38px;height:38px;padding:2px">' +
              '<img src="' + p.img + '" alt=""' + PC.fallbackAttr('pandit') + '></span>' +
              '<a href="pandit-profile.html?id=' + p.id + '" style="font-weight:600;font-size:.92rem;color:var(--gold-deep)">' + PC.esc(p.name) + '</a>' +
              '<span class="muted" style="font-size:.82rem">' + p.city + ' · ' + p.exp + 'y</span></span>';
          }).join('') + '</div>';
      }
      out += '<p class="muted" style="margin-top:14px;font-size:.82rem">' + PC.icon('info', { size: 13 }) +
        ' A suggestion, not a verdict. A pandit ji will confirm what your situation actually calls for.</p>';
      return out;
    }

    function ask(text) {
      if (!text.trim()) return;
      bubble('me', PC.esc(text));
      var t = typing();
      setTimeout(function () {
        t.innerHTML = recommend(text);
        log.scrollTop = log.scrollHeight;
      }, 620);
    }

    bubble('ai', '<h4>Namaste 🙏</h4><p>Tell me what is going on and I will suggest which pooja or havan is traditionally recommended — in your own words, Hindi or English.</p>' +
      '<p class="muted" style="margin-top:8px;font-size:.84rem">For example: <em>"naya flat liya hai, kya karna chahiye?"</em></p>');

    var prompts = ['Naya ghar liya hai', 'Shaadi ki taiyari hai', 'Ghar mein bimari chal rahi hai',
      'Business mein rukavat hai', 'Bachche ka mundan karana hai', 'Pitaji ka shradh karna hai',
      'Kundali mein Shani dosh hai', 'Navratri ki puja karani hai'];
    set('chatChips', prompts.map(function (p) { return '<button class="chip" type="button">' + p + '</button>'; }).join(''));
    $$('#chatChips .chip').forEach(function (c) {
      c.addEventListener('click', function () { ask(c.textContent); });
    });

    on('#chatForm', 'submit', function (e) {
      e.preventDefault();
      var inp = $('#chatInput');
      ask(inp.value);
      inp.value = '';
    });
  };

  /* ------------------------------------------------------------------ blog */
  PC.pages.blog = function () {
    var cats = ['All'].concat(PC.posts.map(function (p) { return p.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
    var active = 'All';

    set('blogCats', cats.map(function (c) {
      return '<button class="pill' + (c === active ? ' is-active' : '') + '" data-cat="' + c + '">' + c + '</button>';
    }).join(''));

    function card(p, featured) {
      return '<article class="card card--hover' + (featured ? '' : '') + '">' +
        '<div class="post-thumb"><img src="assets/img/lotus.svg" class="watermark" alt="">' +
        '<span class="post-cat">' + PC.esc(p.cat) + '</span></div>' +
        '<div class="card-body">' +
        '<h3 class="card-title" style="font-size:' + (featured ? '1.3rem' : '1.08rem') + '"><a href="#">' + PC.esc(p.title) + '</a></h3>' +
        '<p class="muted" style="margin-top:8px">' + PC.esc(p.excerpt) + '</p>' +
        '<div class="card-foot"><span class="muted">' + p.date + ' · ' + p.read + ' read</span>' +
        '<a href="#" class="row" style="color:var(--gold-deep);font-weight:600;font-size:.88rem">Read ' + PC.icon('arrow-right', { size: 16 }) + '</a></div>' +
        '</div></article>';
    }

    function render(cat, q) {
      var list = PC.posts.filter(function (p) {
        if (cat !== 'All' && p.cat !== cat) return false;
        if (q && (p.title + ' ' + p.excerpt).toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
        return true;
      });
      set('featuredPost', list.length ? card(list[0], true) : '');
      set('blogGrid', list.length > 1 ? list.slice(1).map(function (p) { return card(p); }).join('')
        : (list.length ? '' : PC.emptyState('No article matched that search.')));
    }

    $$('#blogCats .pill').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#blogCats .pill').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active'); active = b.dataset.cat;
        render(active, $('#blogSearch').value.trim());
      });
    });
    on('#blogSearch', 'input', function (e) { render(active, e.target.value.trim()); });
    on('#blogSearchForm', 'submit', function (e) { e.preventDefault(); });
    render(active, '');
  };

  /* ------------------------------------------------------------- dashboard */
  PC.pages.dashboard = function () {
    var me = PC.pandit('ramesh-sharma');
    var sections = [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'profile', label: 'My Profile', icon: 'user' },
      { id: 'services', label: 'Services & Availability', icon: 'diya' },
      { id: 'reviews', label: 'Reviews', icon: 'star' },
      { id: 'analytics', label: 'Analytics', icon: 'bar-chart' },
      { id: 'plan', label: 'Subscription', icon: 'credit-card' },
    ];

    set('dashNav', sections.map(function (s, i) {
      return '<button data-sec="' + s.id + '"' + (i === 0 ? ' class="is-active"' : '') + '>' +
        PC.icon(s.icon, { size: 18 }) + s.label + '</button>';
    }).join(''));

    /* --- overview --- */
    var kpis = [
      { k: 'Profile views (30d)', v: '2,418', d: '+18% vs last month', icon: 'eye' },
      { k: 'Contact clicks', v: '386', d: '+11%', icon: 'phone' },
      { k: 'WhatsApp opens', v: '241', d: '+24%', icon: 'whatsapp' },
      { k: 'Avg. rating', v: me.rating.toFixed(1), d: me.reviews + ' reviews', icon: 'star' },
    ];
    var months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    var views = [58, 72, 64, 88, 96, 100];

    set('secOverview',
      '<div class="row-between" style="margin-bottom:20px"><div>' +
      '<h2 style="font-size:1.5rem">Namaste, ' + PC.esc(me.name) + '</h2>' +
      '<p class="muted">' + me.tier + ' plan · profile ' + (me.verified ? 'verified' : 'pending verification') + '</p></div>' +
      '<a class="btn btn-outline btn-sm" href="pandit-profile.html?id=' + me.id + '">' + PC.icon('eye', { size: 16 }) + ' View public profile</a></div>' +
      '<div class="grid g-4" style="gap:16px">' + kpis.map(function (k) {
        return '<div class="card kpi"><div class="row-between"><span class="k">' + k.k + '</span>' +
          '<span style="color:var(--gold)">' + PC.icon(k.icon, { size: 18 }) + '</span></div>' +
          '<div class="v">' + k.v + '</div><div class="d">' + k.d + '</div></div>';
      }).join('') + '</div>' +
      '<div class="grid g-2" style="margin-top:26px;align-items:start">' +
      '<div class="card card-pad"><h3 style="font-size:1.16rem">Profile views — last 6 months</h3>' +
      '<div class="bars">' + months.map(function (m, i) {
        return '<div><span class="bar" style="height:' + views[i] + '%"></span><span class="lbl">' + m + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="card card-pad"><h3 style="font-size:1.16rem">Recent inquiries</h3>' +
      '<div class="table-wrap" style="margin-top:14px;border:0"><table class="tbl">' +
      '<thead><tr><th>Devotee</th><th>Service</th><th>City</th></tr></thead><tbody>' +
      [['Ankit Verma', 'Griha Pravesh', 'Lucknow'], ['Sneha Rao', 'Rudrabhishek', 'Varanasi'],
        ['Imran Sheikh', 'Vastu Shanti', 'Kanpur'], ['Meera Joshi', 'Mahamrityunjay', 'Delhi']]
        .map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>');

    /* --- profile --- */
    set('secProfile',
      '<h2 style="font-size:1.5rem;margin-bottom:6px">My Profile</h2>' +
      '<p class="muted" style="margin-bottom:22px">This is what devotees see. Keep it accurate — verification re-checks every six months.</p>' +
      '<form class="card card-pad" data-demo-form="Profile saved.">' +
      '<div class="grid g-2" style="gap:16px">' +
      '<div><label class="label" for="dpName">Full name</label><input class="input" id="dpName" value="' + PC.esc(me.name) + '"></div>' +
      '<div><label class="label" for="dpPhone">Contact number</label><input class="input" id="dpPhone" value="' + me.phone + '"></div>' +
      '<div><label class="label" for="dpCity">City</label><input class="input" id="dpCity" value="' + me.city + '"></div>' +
      '<div><label class="label" for="dpExp">Years of experience</label><input class="input" id="dpExp" type="number" value="' + me.exp + '"></div>' +
      '<div><label class="label" for="dpEdu">Vedic education</label><input class="input" id="dpEdu" value="' + PC.esc(me.edu) + '"></div>' +
      '<div><label class="label" for="dpGotra">Gotra / tradition</label><input class="input" id="dpGotra" value="' + me.gotra + '"></div>' +
      '</div>' +
      '<div style="margin-top:16px"><label class="label" for="dpAbout">About you</label>' +
      '<textarea class="textarea" id="dpAbout">' + PC.esc(me.about) + '</textarea></div>' +
      '<div style="margin-top:16px"><label class="label">Languages spoken</label><div class="row wrap" style="gap:8px">' +
      PC.languages.map(function (l) {
        var on = me.langs.indexOf(l) > -1;
        return '<label class="check" style="padding:0"><input type="checkbox"' + (on ? ' checked' : '') + '><span>' + l + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="row" style="gap:12px;margin-top:22px;flex-wrap:wrap">' +
      '<button class="btn btn-gold" type="submit">' + PC.icon('check', { size: 17 }) + ' Save changes</button>' +
      '<button class="btn btn-outline" type="button" id="uploadVideo">' + PC.icon('video', { size: 17 }) + ' Upload video intro</button>' +
      '</div></form>');

    /* --- services --- */
    set('secServices',
      '<h2 style="font-size:1.5rem;margin-bottom:6px">Services & Availability</h2>' +
      '<p class="muted" style="margin-bottom:22px">Tick every ritual you perform. Free tier allows 3 — upgrade for unlimited.</p>' +
      '<div class="card card-pad"><div class="grid g-3" style="gap:6px">' +
      PC.services.map(function (s) {
        var on = me.services.indexOf(s.id) > -1;
        return '<label class="check"><input type="checkbox"' + (on ? ' checked' : '') + '><span>' + PC.esc(s.name) + '</span></label>';
      }).join('') + '</div>' +
      '<button class="btn btn-gold" style="margin-top:20px" id="saveSvc">' + PC.icon('check', { size: 17 }) + ' Save services</button></div>' +
      '<div class="card card-pad" style="margin-top:20px"><h3 style="font-size:1.16rem">Block dates you are unavailable</h3>' +
      '<div class="row" style="gap:12px;margin-top:14px;flex-wrap:wrap">' +
      '<input class="input" type="date" style="max-width:200px"><input class="input" type="date" style="max-width:200px">' +
      '<button class="btn btn-outline" id="blockDates">Block range</button></div></div>');

    /* --- reviews --- */
    set('secReviews',
      '<h2 style="font-size:1.5rem;margin-bottom:6px">Reviews</h2>' +
      '<p class="muted" style="margin-bottom:22px">Respond publicly — devotees read replies as closely as reviews.</p>' +
      PC.reviews.slice(0, 4).map(function (r) {
        return '<div class="card card-pad" style="margin-bottom:14px">' +
          '<div class="row-between"><span>' + PC.stars(r.rating) + ' <strong style="font-family:var(--font-head);margin-left:8px">' + PC.esc(r.name) + '</strong>' +
          '<span class="muted"> · ' + PC.esc(r.city) + '</span></span>' +
          '<span class="tag tag--soft">' + PC.esc(r.service) + '</span></div>' +
          '<p style="margin-top:10px;color:#4d4a45">' + PC.esc(r.text) + '</p>' +
          '<button class="btn btn-outline btn-sm" style="margin-top:12px" data-reply>' + PC.icon('message-circle', { size: 15 }) + ' Reply</button></div>';
      }).join(''));

    /* --- analytics --- */
    var topSvc = me.services.map(function (s, i) { return { name: PC.serviceName(s), pct: [42, 24, 16, 11, 7][i] || 5 }; });
    set('secAnalytics',
      '<h2 style="font-size:1.5rem;margin-bottom:6px">Analytics</h2>' +
      '<p class="muted" style="margin-bottom:22px">Gold and Diamond plans include this dashboard.</p>' +
      '<div class="grid g-2" style="align-items:start">' +
      '<div class="card card-pad"><h3 style="font-size:1.16rem">Which services get enquiries</h3>' +
      '<div class="stack" style="gap:12px;margin-top:16px">' + topSvc.map(function (s) {
        return '<div><div class="row-between" style="margin-bottom:5px"><span style="font-size:.9rem">' + PC.esc(s.name) + '</span>' +
          '<span class="muted">' + s.pct + '%</span></div>' +
          '<span style="display:block;height:9px;border-radius:5px;background:var(--cream-deep);overflow:hidden">' +
          '<span style="display:block;height:100%;width:' + s.pct + '%;background:var(--gold-grad)"></span></span></div>';
      }).join('') + '</div></div>' +
      '<div class="card card-pad"><h3 style="font-size:1.16rem">Where devotees come from</h3>' +
      '<div class="table-wrap" style="margin-top:14px;border:0"><table class="tbl">' +
      '<thead><tr><th>City</th><th>Views</th><th>Contacts</th></tr></thead><tbody>' +
      [['Varanasi', '842', '148'], ['Delhi NCR', '512', '76'], ['Lucknow', '388', '54'],
        ['Mumbai', '301', '41'], ['Overseas', '186', '32']]
        .map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>');

    /* --- plan --- */
    set('secPlan',
      '<h2 style="font-size:1.5rem;margin-bottom:6px">Subscription</h2>' +
      '<p class="muted" style="margin-bottom:22px">Your listing is free forever. Paid tiers only buy visibility — never a cut of your dakshina.</p>' +
      '<div class="grid g-4" style="gap:16px">' + PC.plans.map(function (pl) {
        var current = pl.name === me.tier;
        return '<div class="card plan-card' + (current ? ' is-current' : '') + '">' +
          (pl.popular ? '<span class="badge-gold" style="margin-bottom:10px">Most popular</span>' : '') +
          '<h3 style="font-size:1.2rem">' + pl.name + '</h3>' +
          '<div class="plan-price">' + pl.price + '<span>' + pl.per + '</span></div>' +
          '<ul class="dot-list" style="text-align:left;margin:16px 0">' +
          pl.feats.map(function (f) { return '<li style="font-size:.88rem">' + f + '</li>'; }).join('') + '</ul>' +
          '<button class="btn ' + (current ? 'btn-ghost' : 'btn-gold') + ' btn-block btn-sm"' + (current ? ' disabled' : '') + '>' +
          (current ? 'Current plan' : pl.cta) + '</button></div>';
      }).join('') + '</div>');

    /* section switching */
    function show(id) {
      $$('#dashNav button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.sec === id); });
      $$('[data-section]').forEach(function (s) { s.style.display = s.dataset.section === id ? '' : 'none'; });
    }
    $$('#dashNav button').forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.sec); });
    });
    show('overview');

    on('#uploadVideo', 'click', function () { PC.toast('Video upload opens on Silver plan and above.'); });
    on('#saveSvc', 'click', function () { PC.toast('Services updated.'); });
    on('#blockDates', 'click', function () { PC.toast('Dates blocked — you will not appear as available.'); });
    $$('[data-reply]').forEach(function (b) {
      b.addEventListener('click', function () {
        PC.modal('<h3 style="font-size:1.3rem">Reply publicly</h3>' +
          '<textarea class="textarea" style="margin-top:14px" placeholder="Dhanyavaad..."></textarea>' +
          '<button class="btn btn-gold btn-block" style="margin-top:14px" id="sendReply">Post reply</button>');
        $('#sendReply').addEventListener('click', function () { PC.closeModal(); PC.toast('Reply posted.'); });
      });
    });
  };

  /* ----------------------------------------------------------------- about */
  PC.pages.about = function () {
    var steps = [
      { icon: 'inbox', h: 'Document check', p: 'Government ID, address proof and the pandit ji\'s temple association letter are collected and cross-checked.' },
      { icon: 'video', h: 'Video KYC call', p: 'A live call confirms the person matches the documents and that they actually perform the rituals they list.' },
      { icon: 'temple', h: 'Temple confirmation', p: 'We contact the temple office or trust directly to confirm the association before the listing goes live.' },
      { icon: 'award', h: 'Certificate verification', p: 'Vedic education certificates — Shastri, Acharya, Ghanapaathi — are verified with the issuing institution.' },
      { icon: 'star', h: 'Review integrity audit', p: 'Reviews are re-audited every six months. Paid or planted reviews mean permanent removal from the platform.' },
    ];
    set('verifySteps', steps.map(function (s, i) {
      return '<article class="card step reveal"><span class="step-n">0' + (i + 1) + '</span>' +
        '<div class="step-ico">' + PC.icon(s.icon, { size: 30 }) + '</div><h3>' + s.h + '</h3><p>' + s.p + '</p></article>';
    }).join(''));

    var diff = [
      ['Direct WhatsApp / call contact', 'Middleman booking flow'],
      ['Temple directory with map', 'No temple focus at all'],
      ['Rich profiles with video intro', 'Basic text-only profiles'],
      ['AI Pooja Recommender', 'No guidance — you guess'],
      ['Panchang & muhurat built in', 'You search elsewhere'],
      ['12+ Indian languages', 'English and Hindi only'],
      ['Pandit keeps 100% of dakshina', '20–30% platform commission'],
      ['Free basic listing, forever', 'Paid listing only'],
    ];
    set('diffTable',
      '<div class="table-wrap"><table class="tbl">' +
      '<thead><tr><th>PanditConnect</th><th>Typical booking platform</th></tr></thead><tbody>' +
      diff.map(function (r) {
        return '<tr><td><span class="meta-line" style="color:var(--text)">' + PC.icon('check-circle', { size: 16 }) + PC.esc(r[0]) + '</span></td>' +
          '<td class="muted">' + PC.esc(r[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div>');

    set('aboutStats', PC.stats.map(function (s) {
      return '<div class="card card-pad text-c"><span style="color:var(--gold)">' + PC.icon(s.icon, { size: 40 }) + '</span>' +
        '<div class="stat-num" data-count="' + s.num + '" style="margin-top:10px">0</div>' +
        '<div class="stat-label">' + s.label + '</div></div>';
    }).join(''));
  };

  /* --------------------------------------------------------------- contact */
  PC.pages.contact = function () {
    set('faqList', PC.faqs.map(function (f, i) {
      return '<div class="acc-item' + (i === 0 ? ' is-open' : '') + '">' +
        '<button class="acc-q" aria-expanded="' + (i === 0) + '"><span>' + PC.esc(f.q) + '</span>' + PC.icon('chevron-down') + '</button>' +
        '<div class="acc-a"><p>' + PC.esc(f.a) + '</p></div></div>';
    }).join(''));
    PC.initAccordion($('#faqList'));

    var subj = $('#ctSubject');
    subj.innerHTML = ['General question', 'I am a pandit — how do I list?', 'Temple partnership',
      'Report a profile or review', 'Media / press', 'Something else']
      .map(function (o) { return '<option>' + o + '</option>'; }).join('');

    on('#contactForm', 'submit', function (e) {
      e.preventDefault();
      var form = $('#contactForm');
      var payload = {
        name: $('#ctName').value, email: $('#ctMail').value, phone: $('#ctPhone').value,
        subject: $('#ctSubject').value, message: $('#ctMsg').value,
      };
      var done = function () { PC.toast('Message received. We reply within one working day.'); form.reset(); };
      if (PC.api) PC.api.contact(payload).then(done, done);
      else done();
    });
  };

  /* fallback attr alias used by inline templates above */
  PC.fallbackAttr = PC.fallback;
})();
