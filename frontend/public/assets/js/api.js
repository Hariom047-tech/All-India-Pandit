/* ==========================================================================
   PanditConnect — thin backend API client.
   Browsing (temple/pandit/service lists) still reads the embedded data.js —
   that is deliberate: instant, offline-capable rendering with zero loading
   states (see docs/ARCHITECTURE.md). Only WRITE actions (an enquiry, a
   contact message, a newsletter signup) go over the network, and every call
   here fails soft: if the backend is not running (e.g. this file was opened
   directly instead of via `docker compose up`), the caller falls back to the
   old local-only confirmation so the page never breaks.
   ========================================================================== */

(function () {
  'use strict';

  // Same-origin '/api' works once nginx (or any reverse proxy) fronts the
  // backend at that path — see docker/nginx/default.conf. Override by setting
  // window.PC_API_BASE before this script loads if the API lives elsewhere.
  var BASE = window.PC_API_BASE || '/api';

  function request(path, opts) {
    opts = opts || {};
    var controller = ('AbortController' in window) ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 6000) : null;

    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok) throw new Error((json && json.error) || ('Request failed: ' + res.status));
        return json;
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  window.PC = window.PC || {};
  window.PC.api = {
    contact: function (payload) { return request('/contact', { method: 'POST', body: payload }); },
    subscribe: function (email) { return request('/newsletter', { method: 'POST', body: { email: email } }); },
    templeInquiry: function (templeId, payload) { return request('/temples/' + templeId + '/inquiry', { method: 'POST', body: payload }); },
    panditEnquiry: function (panditId, payload) { return request('/pandits/' + panditId + '/enquiry', { method: 'POST', body: payload }); },
    recommend: function (text) { return request('/recommend', { method: 'POST', body: { text: text } }); },
  };
})();
