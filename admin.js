// Trysee owner dashboard. Contains no credentials: the sign-in is the normal Trysee (Supabase) email+password login,
// and the SERVER decides who is an admin (it answers 404 to everyone else). All API text is inserted with textContent.
(function () {
  "use strict";

  var SB = "https://kgxklwpqcropiprelklc.supabase.co";
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtneGtsd3BxY3JvcGlwcmVsa2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzAwMjIsImV4cCI6MjEwNjQ0NjAyMn0.KD49csjq0IGgfXYxmXhg-CtNVEHNsSZ6JirTjz2H8vc";
  var API = SB + "/functions/v1/trysee";
  var STORE_KEY = "trysee-admin-auth";
  // Sample data only when opened from disk (file:) with ?demo=1. Inert on https.
  var DEMO = location.protocol === "file:" && /[?&]demo=1\b/.test(location.search);
  var TABS = [["overview", "Overview"], ["revenue", "Revenue"], ["usage", "Usage & cost"], ["growth", "Growth"], ["users", "Users"], ["safety", "Safety"], ["admin", "Admin"]];
  var COL = { plum: "#8b2a5f", blue: "#2a6496", amber: "#b8650a", green: "#1b7a43", red: "#b3261e" };

  var $ = function (id) { return document.getElementById(id); };
  var session = null, D = null, days = 30, curTab = "overview", loadId = 0;
  var userState = { email: "", data: null, msg: null };
  var logData = null, payPrefill = "";
  var pending = [];

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i] != null) parent.appendChild(arguments[i]); return parent; }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } }
  function n0(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
  function num(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
  function inr(n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
  function usd(n) { return "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
  function pct(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + "%"; }
  function compact(v) {
    var a = Math.abs(v), s = v < 0 ? "-" : "";
    function f(x, u) { return s + (Math.round(x * 10) / 10) + u; }
    if (a >= 1e7) return f(a / 1e7, " Cr");
    if (a >= 1e5) return f(a / 1e5, " L");
    if (a >= 1e3) return f(a / 1e3, "K");
    return s + (Math.round(a * 10) / 10);
  }
  function inrC(v) { return "₹" + compact(v); }
  function toDate(at) {
    if (at == null || at === "") return null;
    var d = new Date(typeof at === "number" && at < 1e12 ? at * 1000 : at);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(at) { var d = toDate(at); return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"; }
  function fmtDT(at) { var d = toDate(at); return d ? d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"; }
  function dayLabel(s) { var p = String(s).split("-"); if (p.length < 3) return String(s); return Number(p[2]) + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(p[1]) - 1]; }
  function safeObj(o) { return o && typeof o === "object" ? o : {}; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function metaText(m) {
    if (m == null || m === "") return "";
    var t = typeof m === "string" ? m : JSON.stringify(m);
    return t.length > 140 ? t.slice(0, 140) + "…" : t;
  }
  var KIND = {
    PHOTO: "Photo try-on", LIVE: "Live try-on", PURCHASE: "Purchase", FREE_GRANT: "Welcome credit", REFUND: "Refund", PROMO: "Promo code",
    REFERRAL_BONUS: "Referral bonus", REFERRAL_REWARD: "Referral reward", ADJUST: "Admin adjustment", MIGRATION: "Migration", MERGE_IN: "Merged in", MERGE_OUT: "Merged out"
  };
  function kind(k) { return KIND[k] || String(k || ""); }

  // ---------- session / auth ----------
  function readSession() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      return s && s.access_token && s.refresh_token && s.user && s.user.id ? s : null;
    } catch (e) { return null; }
  }
  function saveSession(s) { session = s; try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* in-memory only */ } }
  function clearSession() { session = null; try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
  function sessionFromAuth(j) {
    var exp = j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600));
    return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: exp, user: { id: j.user && j.user.id, email: j.user && j.user.email } };
  }
  function authError(j) {
    var m = String((j && (j.msg || j.error_description || j.message || j.error)) || "");
    return /not confirmed/i.test(m) ? "Email not confirmed yet."
      : /invalid login/i.test(m) ? "Wrong email or password."
      : /rate limit|too many|seconds/i.test(m) ? "Too many attempts. Wait a minute and try again."
      : m || "Something went wrong. Please try again.";
  }
  function authCall(path, body) {
    return fetch(SB + path, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY }, body: JSON.stringify(body) })
      .catch(function () { var e = new Error("Can't reach Trysee right now. Check your connection."); e.offline = true; throw e; })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(authError(j)); e.status = r.status; throw e; }
          return j;
        });
      });
  }
  var refreshing = null;
  function refresh() {
    if (!refreshing) {
      refreshing = authCall("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })
        .then(function (j) { saveSession(sessionFromAuth(j)); return true; })
        .catch(function (e) { if (!e.offline && e.status >= 400 && e.status < 500) clearSession(); return false; })
        .then(function (ok) { refreshing = null; return ok; });
    }
    return refreshing;
  }
  function freshToken() {
    if (DEMO) return Promise.resolve("demo");
    if (!session) return Promise.resolve(null);
    if (session.expires_at - Math.floor(Date.now() / 1000) < 60) return refresh().then(function () { return session && session.access_token; });
    return Promise.resolve(session.access_token);
  }

  // ---------- API ----------
  function api(path, body, retried) {
    if (DEMO) return demoApi(path, body || {});
    return freshToken().then(function (token) {
      if (!token) { var e = new Error("Please sign in."); e.status = 401; throw e; }
      return fetch(API + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "X-Trysee-Tz": tz() },
        body: JSON.stringify(body || {})
      }).catch(function () { var e = new Error("Can't reach Trysee right now. Check your connection."); e.offline = true; throw e; })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.status === 401 && !retried && session) {
              return refresh().then(function (ok) { if (ok) return api(path, body, true); throw apiErr(r, j); });
            }
            if (!r.ok) throw apiErr(r, j);
            return j;
          });
        });
    });
  }
  function apiErr(r, j) {
    var e = new Error((j && (j.error || j.message)) || "Request failed (" + r.status + ").");
    e.status = r.status;
    return e;
  }
  // Common failure routing. Returns true when it has taken over the screen.
  function routeError(e) {
    if (e && e.status === 401) { signedOut("Your session expired. Please sign in again.", "err"); return true; }
    if (e && (e.status === 404 || e.status === 403)) { showDenied(); return true; }
    return false;
  }

  // ---------- views ----------
  function show(which) {
    $("loading").hidden = which !== "loading";
    $("auth").hidden = which !== "auth";
    $("denied").hidden = which !== "denied";
    $("app").hidden = which !== "app";
    $("bar").hidden = which !== "app";
  }
  function authMsg(t, k) { var m = $("authMsg"); m.textContent = t || ""; m.className = "msg" + (k ? " " + k : ""); }
  function signedOut(msg, kindc) {
    clearSession(); D = null; logData = null; userState = { email: "", data: null, msg: null };
    show("auth"); authMsg(msg, kindc);
    $("panels").textContent = "";
  }
  function showDenied() { D = null; $("panels").textContent = ""; show("denied"); }
  function flash(text, err) {
    var f = $("flash");
    f.textContent = text || ""; f.hidden = !text; f.className = "flash" + (err ? " err" : "");
  }

  // ---------- confirm step (in page, no confirm()) ----------
  var confirmResolve = null, lastFocus = null;
  function ask(text, okLabel) {
    return new Promise(function (res) {
      confirmResolve = res; lastFocus = document.activeElement;
      $("confirmText").textContent = text;
      $("confirmYes").textContent = okLabel || "Confirm";
      $("confirmBox").hidden = false;
      $("confirmNo").focus();
    });
  }
  function closeConfirm(v) {
    $("confirmBox").hidden = true;
    var r = confirmResolve; confirmResolve = null;
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* ignore */ }
    if (r) r(v);
  }
  function bindConfirm() {
    $("confirmYes").addEventListener("click", function () { closeConfirm(true); });
    $("confirmNo").addEventListener("click", function () { closeConfirm(false); });
    $("confirmBox").addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); closeConfirm(false); }
      else if (e.key === "Tab") {
        var a = $("confirmYes"), b = $("confirmNo");
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    });
  }
  // Runs an admin action after the in-page confirm. msgEl shows the server's success/error text.
  function act(body, question, msgEl, after, okLabel) {
    return ask(question, okLabel).then(function (yes) {
      if (!yes) return false;
      if (msgEl) { msgEl.textContent = "Working…"; msgEl.className = "msg"; }
      return api("/api/admin/action", body).then(function (j) {
        var m = (j && j.message) || "Done.";
        if (msgEl) { msgEl.textContent = m; msgEl.className = "msg ok"; }
        flash(m, false);
        if (after) after(j);
        return true;
      }).catch(function (e) {
        if (routeError(e)) return false;
        if (msgEl) { msgEl.textContent = e.message; msgEl.className = "msg err"; }
        flash(e.message, true);
        return false;
      });
    });
  }

  // ---------- DOM builders ----------
  function card(title, hint) {
    var c = el("section", "card");
    if (title) c.appendChild(el("h2", null, title));
    if (hint) c.appendChild(el("p", "hint", hint));
    return c;
  }
  function kpi(label, value, caption, tone) {
    var k = el("div", "kpi" + (tone ? " " + tone : ""));
    add(k, el("div", "l", label), el("div", "v", value), el("div", "c", caption || ""));
    return k;
  }
  function kpiGrid(list) { var g = el("div", "grid kpis"); list.forEach(function (x) { g.appendChild(kpi(x[0], x[1], x[2], x[3])); }); return g; }
  function empty(text) { return el("p", "empty", text || "No data in this range yet."); }
  // headers: [label, numeric?]; rows: arrays of string | number | Node; opts.hl(rowIdx) highlights
  function table(headers, rows, opts) {
    opts = opts || {};
    if (!rows.length) return empty(opts.empty);
    var w = el("div", "tw"), t = el("table"), th = el("thead"), hr = el("tr");
    headers.forEach(function (h) { var c = el("th", h[1] ? "n" : "", h[0]); c.scope = "col"; hr.appendChild(c); });
    th.appendChild(hr); t.appendChild(th);
    var tb = el("tbody");
    rows.forEach(function (r, i) {
      var tr = el("tr", opts.hl && opts.hl(i) ? "hl" : "");
      r.forEach(function (v, j) {
        var td = el("td", (headers[j] && headers[j][1] ? "n " : "") + (headers[j] && headers[j][2] ? "wrap" : ""));
        if (v instanceof Node) td.appendChild(v); else td.textContent = v == null || v === "" ? "-" : String(v);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); w.appendChild(t);
    return w;
  }
  function hbars(items, fmt) { // items: [{label, value, sub}]
    var box = el("div", "hbars"), max = 0;
    items.forEach(function (i) { if (i.value > max) max = i.value; });
    items.forEach(function (i) {
      var h = el("div", "hb"), top = el("div", "top");
      add(top, el("span", null, i.label), el("b", null, fmt ? fmt(i.value) : n0(i.value)));
      var tr = el("div", "tr"), fl = el("div", "fl");
      fl.style.width = (max > 0 ? Math.max(0, i.value / max * 100) : 0) + "%";
      tr.appendChild(fl);
      add(h, top, tr);
      if (i.sub) h.appendChild(el("div", "sub", i.sub));
      box.appendChild(h);
    });
    return box;
  }
  function chip(text, tone) { return el("span", "chip" + (tone ? " " + tone : ""), text); }
  function btn(text, cls, fn) { var b = el("button", "btn small " + (cls || ""), text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function field(label, attrs) {
    var l = el("label"), i = el(attrs.tag || "input");
    delete attrs.tag;
    Object.keys(attrs).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    l.appendChild(document.createTextNode(label)); l.appendChild(i);
    return l;
  }
  function val(form, name) { var f = form.elements[name]; return f ? f.value.trim() : ""; }

  // ---------- SVG charts (dependency free) ----------
  function S(tag, attrs, text) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
  }
  function tipShow(html, x, y) {
    var t = $("tip"); t.textContent = "";
    html.forEach(function (r) { var d = el("div"); if (r.color) { var i = el("i"); i.style.background = r.color; d.appendChild(i); } d.appendChild(document.createTextNode(r.text)); if (r.head) d.className = "hd"; t.appendChild(d); });
    t.hidden = false;
    var w = t.offsetWidth, h = t.offsetHeight;
    var left = x + 14; if (left + w > window.innerWidth - 6) left = x - w - 14;
    var top = y - h - 10; if (top < 6) top = y + 14;
    t.style.left = Math.max(6, left) + "px"; t.style.top = top + "px";
  }
  function tipHide() { $("tip").hidden = true; }

  // opts: {title, type:'line'|'bars'|'stack', labels:[], series:[{name,color,values:[]}], fmt, axisFmt, height}
  function chart(opts) {
    var wrap = el("div", "chart");
    pending.push(function () { drawChart(wrap, opts); });
    return wrap;
  }
  function drawChart(wrap, o) {
    wrap.textContent = "";
    var W = Math.max(240, wrap.clientWidth || 600), H = o.height || 210;
    var m = { l: 46, r: 10, t: 10, b: 24 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    var n = o.labels.length, fmt = o.fmt || n0, axf = o.axisFmt || compact;
    var stack = o.type === "stack", bars = o.type === "bars" || stack;
    var totals = o.labels.map(function (_, i) {
      if (stack) return o.series.reduce(function (a, s) { return a + (Number(s.values[i]) || 0); }, 0);
      return o.series.reduce(function (a, s) { return Math.max(a, Number(s.values[i]) || 0); }, 0);
    });
    var rawMax = totals.reduce(function (a, b) { return Math.max(a, b); }, 0);
    var allZero = rawMax <= 0, ymax = niceMax(rawMax);
    var Y = function (v) { return m.t + ph - (v / ymax) * ph; };
    var band = n > 0 ? pw / n : pw;
    var X = function (i) { return bars ? m.l + band * (i + 0.5) : (n === 1 ? m.l + pw / 2 : m.l + pw * i / (n - 1)); };

    var summary = (o.title || "Chart") + ", " + n + " days. " + o.series.map(function (s) {
      var tot = s.values.reduce(function (a, b) { return a + (Number(b) || 0); }, 0), pk = 0, pi = 0;
      s.values.forEach(function (v, i) { if ((Number(v) || 0) > pk) { pk = Number(v) || 0; pi = i; } });
      return s.name + ": total " + (o.sum ? fmt(tot) : fmt(tot)) + (pk > 0 ? ", peak " + fmt(pk) + " on " + dayLabel(o.labels[pi]) : "");
    }).join("; ") + ".";
    var svg = S("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": summary, width: W, height: H });
    svg.appendChild(S("title", {}, summary));

    for (var g = 0; g <= 4; g++) {
      var v = ymax * g / 4, y = Y(v);
      svg.appendChild(S("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, "class": g === 0 ? "ax" : "gd" }));
      svg.appendChild(S("text", { x: m.l - 6, y: y + 4, "text-anchor": "end" }, axf(v)));
    }
    var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 70))));
    for (var i = 0; i < n; i += every) svg.appendChild(S("text", { x: X(i), y: H - 6, "text-anchor": n === 1 ? "middle" : (i === 0 ? "start" : "middle") }, dayLabel(o.labels[i])));

    if (bars) {
      var bw = Math.max(1, Math.min(28, band * 0.72));
      for (var b = 0; b < n; b++) {
        var base = 0;
        o.series.forEach(function (s, si) {
          var vv = Number(s.values[b]) || 0;
          if (vv <= 0) return;
          var y0 = Y(stack ? base + vv : vv), hh = Math.max(1, (stack ? Y(base) : Y(0)) - y0);
          svg.appendChild(S("rect", { x: X(b) - (stack ? bw / 2 : bw / (2 * o.series.length) * (o.series.length - 2 * si)), y: y0, width: stack ? bw : bw / o.series.length, height: hh, fill: s.color, rx: bw > 6 ? 2 : 0 }));
          if (stack) base += vv;
        });
      }
    } else {
      o.series.forEach(function (s) {
        var pts = s.values.map(function (v, i) { return [X(i), Y(Number(v) || 0)]; });
        if (pts.length > 1) svg.appendChild(S("polyline", { points: pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "), fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
        if (pts.length === 1 || pts.length <= 31) pts.forEach(function (p) { svg.appendChild(S("circle", { cx: p[0], cy: p[1], r: pts.length === 1 ? 4 : 2.2, fill: s.color })); });
      });
    }
    if (allZero) svg.appendChild(S("text", { x: m.l + pw / 2, y: m.t + ph / 2, "text-anchor": "middle", "class": "nodata" }, "No data in this range yet"));

    var guide = S("line", { y1: m.t, y2: m.t + ph, stroke: "#8b2a5f", "stroke-opacity": ".5", visibility: "hidden" });
    svg.appendChild(guide);
    var hit = S("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent" });
    function at(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (W / r.width);
      var idx = bars ? Math.floor((x - m.l) / band) : (n === 1 ? 0 : Math.round((x - m.l) / (pw / (n - 1))));
      idx = Math.max(0, Math.min(n - 1, idx));
      guide.setAttribute("x1", X(idx)); guide.setAttribute("x2", X(idx)); guide.setAttribute("visibility", "visible");
      var rows = [{ text: dayLabel(o.labels[idx]), head: true }];
      o.series.forEach(function (s) { rows.push({ color: s.color, text: s.name + ": " + fmt(Number(s.values[idx]) || 0) }); });
      tipShow(rows, ev.clientX, ev.clientY);
    }
    hit.addEventListener("pointermove", at); hit.addEventListener("pointerdown", at);
    hit.addEventListener("pointerleave", function () { guide.setAttribute("visibility", "hidden"); tipHide(); });
    svg.appendChild(hit);
    wrap.appendChild(svg);
    if (o.series.length > 1 || o.legend) {
      var lg = el("div", "legend");
      o.series.forEach(function (s) { var sp = el("span"), i2 = el("i"); i2.style.background = s.color; add(sp, i2, document.createTextNode(s.name)); lg.appendChild(sp); });
      wrap.appendChild(lg);
    }
  }
  function drawCharts() { var p = pending; pending = []; p.forEach(function (f) { f(); }); }

  // ---------- tab renderers ----------
  function skeleton(p) {
    p.textContent = "";
    var g = el("div", "grid kpis");
    for (var i = 0; i < 8; i++) { var s = el("div", "sk"); s.style.height = "84px"; g.appendChild(s); }
    p.appendChild(g);
    var c = el("div", "sk"); c.style.height = "230px"; p.appendChild(c);
    p.setAttribute("aria-busy", "true");
  }
  function labelsOf(s) { return arr(s).map(function (x) { return x.day; }); }
  function col(s, k) { return arr(s).map(function (x) { return Number(x[k]) || 0; }); }

  var R = {};
  R.overview = function (p, d) {
    var t = safeObj(d.totals), au = safeObj(d.activeUsers), rv = safeObj(d.revenue), us = safeObj(d.usage), co = safeObj(d.cost), fn = safeObj(d.funnel);
    var rng = d.days + " days";
    p.appendChild(kpiGrid([
      ["Revenue", inr(rv.rangeInr), "Last " + rng + ". All time " + inr(rv.totalInr)],
      ["Orders", n0(rv.orders), n0(rv.payingUsers) + " paying users"],
      ["New accounts", n0(arr(d.series).reduce(function (a, x) { return a + (Number(x.signups) || 0); }, 0)), n0(t.accounts) + " accounts in total"],
      ["Active users", n0(au.dau) + " / " + n0(au.wau) + " / " + n0(au.mau), "Today / 7 days / 30 days"],
      ["Credits outstanding", n0(t.creditsOutstanding), "Unspent credits held by users"],
      ["Est. gross profit", inr(co.estGrossProfitInr), "Margin " + pct(co.estMarginPct) + " (estimate)", Number(co.estGrossProfitInr) < 0 ? "bad" : "good"],
      ["Photo try-ons", n0(us.photos), "In the last " + rng],
      ["Live sessions", n0(us.liveSessions), ((us.liveSeconds || 0) >= 60 ? n0(Math.round((us.liveSeconds || 0) / 60)) + " min" : n0(us.liveSeconds || 0) + " seconds") + " of live time"]
    ]));
    var L = labelsOf(d.series);
    var g = el("div", "grid two");
    var c1 = card("Revenue per day", "In rupees, before GST."); c1.appendChild(chart({ title: "Revenue per day", type: "bars", labels: L, series: [{ name: "Revenue", color: COL.plum, values: col(d.series, "revenueInr") }], fmt: inr, axisFmt: inrC }));
    var c2 = card("Sign-ups per day"); c2.appendChild(chart({ title: "Sign-ups per day", type: "bars", labels: L, series: [{ name: "Sign-ups", color: COL.blue, values: col(d.series, "signups") }] }));
    var c3 = card("Usage per day", "Photo vs live try-ons."); c3.appendChild(chart({ title: "Usage per day", type: "stack", labels: L, series: [{ name: "Photo", color: COL.plum, values: col(d.series, "photos") }, { name: "Live", color: COL.amber, values: col(d.series, "live") }] }));
    var c4 = card("Daily active users"); c4.appendChild(chart({ title: "Daily active users", type: "line", labels: L, series: [{ name: "DAU", color: COL.green, values: col(d.series, "dau") }] }));
    add(g, c1, c2, c3, c4); p.appendChild(g);

    var g2 = el("div", "grid two");
    var cf = card("Funnel", "All time. Percent is of installs; step rate is from the previous stage.");
    var steps = [["Installs", fn.installs], ["Accounts", fn.accounts], ["Tried on", fn.triedOn], ["Purchased", fn.purchased]];
    cf.appendChild(hbars(steps.map(function (s, i) {
      var base = Number(fn.installs) || 0, v = Number(s[1]) || 0, prev = i ? Number(steps[i === 3 ? 1 : i - 1][1]) || 0 : 0; // buyers are compared with accounts: a purchase doesn't need a try-on first
      return { label: s[0], value: v, sub: i === 0 ? "" : (base ? pct(v / base * 100) + " of installs" : "-") + (prev ? " · " + pct(v / prev * 100) + (i === 3 ? " of accounts" : " of previous step") : "") };
    })));
    var cr = card("Recent activity");
    var rec = arr(d.recent);
    if (!rec.length) cr.appendChild(empty("No activity yet."));
    else {
      var ul = el("ul", "act");
      rec.slice(0, 15).forEach(function (r) {
        var li = el("li"), l = el("span", null, kind(r.kind) + " · " + (r.email || "-"));
        l.appendChild(el("span", "d", fmtDT(r.at)));
        var dl = Number(r.delta) || 0;
        add(li, l, el("span", dl < 0 ? "neg" : "pos", (dl > 0 ? "+" : dl < 0 ? "−" : "") + Math.abs(dl)));
        ul.appendChild(li);
      });
      cr.appendChild(ul);
    }
    add(g2, cf, cr); p.appendChild(g2);
    if (d.note) p.appendChild(el("p", "note", d.note));
  };

  R.revenue = function (p, d) {
    var rv = safeObj(d.revenue), L = labelsOf(d.series);
    p.appendChild(kpiGrid([
      ["Revenue, selected range", inr(rv.rangeInr), "Last " + d.days + " days"],
      ["Revenue, all time", inr(rv.totalInr), "Since launch"],
      ["Revenue, last 7 days", inr(rv.last7Inr), ""],
      ["Orders", n0(rv.orders), n0(rv.payingUsers) + " paying users"],
      ["Average order", inr(rv.avgOrderInr), "Revenue / orders"],
      ["ARPU", inr(rv.arpuInr), "Range revenue / all accounts"],
      ["Conversion", pct(rv.conversionPct), "Accounts that bought"],
      ["Repeat buyers", n0(rv.repeatBuyers), "Bought more than once"]
    ]));
    var c = card("Revenue per day"); c.appendChild(chart({ title: "Revenue per day", type: "bars", labels: L, series: [{ name: "Revenue", color: COL.plum, values: col(d.series, "revenueInr") }], fmt: inr, axisFmt: inrC })); p.appendChild(c);
    var g = el("div", "grid two");
    var packs = arr(rv.byPack), tp = card("Revenue by pack");
    tp.appendChild(table([["Pack"], ["Orders", 1], ["Revenue", 1]], packs.map(function (x) { return [(x.name || x.sku || "-"), n0(x.orders), inr(x.revenueInr)]; })));
    var bp = card("Share of revenue");
    if (packs.length) bp.appendChild(hbars(packs.map(function (x) { return { label: x.name || x.sku, value: Number(x.revenueInr) || 0, sub: n0(x.orders) + " orders" }; }), inr)); else bp.appendChild(empty());
    add(g, tp, bp); p.appendChild(g);
    var nt = "Amounts are the gross price paid and do not deduct GST. Test-mode payments, if any exist, are included. Payment fees are estimated on the Usage & cost tab.";
    if (Number(rv.otherCurrencyOrders) > 0) nt += " " + n0(rv.otherCurrencyOrders) + " order(s) in another currency are not counted in the rupee totals.";
    p.appendChild(el("p", "note", nt));
  };

  R.usage = function (p, d) {
    var us = safeObj(d.usage), co = safeObj(d.cost), as = safeObj(co.assumptions), L = labelsOf(d.series), rv = safeObj(d.revenue);
    p.appendChild(kpiGrid([
      ["Photo generations", n0(us.photos), "Last " + d.days + " days"],
      ["Live sessions", n0(us.liveSessions), n0(us.liveSeconds) + " seconds in total"],
      ["Uploads", n0(us.uploads), "Photos uploaded"],
      ["Outfit-builder results", n0(us.layered), "Layered try-ons"],
      ["Refunds", n0(us.refunds), "Credits returned after failures"],
      ["Avg credits / active user", num(us.avgCreditsPerActiveUser), ""],
      ["Est. Decart cost", inr(co.estDecartInr), usd(co.estDecartUsd) + " (estimate)"],
      ["Est. payment fees", inr(co.estFeesInr), "Estimate"],
      ["Est. gross profit", inr(co.estGrossProfitInr), "Margin " + pct(co.estMarginPct), Number(co.estGrossProfitInr) < 0 ? "bad" : "good"],
      ["Live share of cost", pct(co.liveSharePct), "Rest is photo generation"]
    ]));
    var g = el("div", "grid two");
    var c1 = card("Revenue vs est. cost per day", "Estimated Decart cost, before payment fees.");
    c1.appendChild(chart({ title: "Revenue vs estimated cost per day", type: "line", labels: L, series: [{ name: "Revenue", color: COL.plum, values: col(d.series, "revenueInr") }, { name: "Est. cost", color: COL.amber, values: col(d.series, "estCostInr") }], fmt: inr, axisFmt: inrC }));
    var c2 = card("Usage per day"); c2.appendChild(chart({ title: "Usage per day", type: "stack", labels: L, series: [{ name: "Photo", color: COL.plum, values: col(d.series, "photos") }, { name: "Live", color: COL.amber, values: col(d.series, "live") }] }));
    add(g, c1, c2); p.appendChild(g);
    var g2 = el("div", "grid two");
    var ca = card("Assumptions used", "Check these against your Decart plan.");
    ca.appendChild(table([["Assumption"], ["Value", 1]], [
      ["Live try-on cost per second", usd(as.liveUsdPerSecond)], ["Photo generation cost each", usd(as.imageUsd)], ["USD to INR", num(as.usdInr)], ["Payment fee", pct(as.feePct)]
    ]));
    ca.appendChild(el("p", "note", "These are estimates from our own records, not Decart's invoice. Compare with the actual Decart bill before relying on the margin."));
    var cu = card("Top users", "By credits spent in the selected range.");
    cu.appendChild(table([["Email", 0, 1], ["Photos", 1], ["Live", 1], ["Credits", 1], ["Paid", 1]], arr(d.topUsers).map(function (u) { return [u.email, n0(u.photos), n0(u.live), n0(u.creditsSpent), inr(u.purchasedInr)]; })));
    add(g2, ca, cu); p.appendChild(g2);
    void rv;
  };

  R.growth = function (p, d) {
    var gr = safeObj(d.growth), rf = safeObj(gr.referrals), t = safeObj(d.totals), pr = arr(gr.promos), cr = arr(gr.creators);
    p.appendChild(kpiGrid([
      ["Invited", n0(rf.invited), "Referral invitations"], ["Qualified", n0(rf.qualified), "Made a first try-on"], ["Rewarded", n0(rf.rewarded), "Reward credited"],
      ["Credits paid", n0(rf.creditsPaid), "Referral credits given"], ["Attributed sign-ups", n0(gr.attributedSignups), "Via creator links"], ["Minimum payout", inr(gr.minPayoutInr), "Creator payouts"]
    ]));
    var g = el("div", "grid two");
    var cf = card("Referral funnel");
    cf.appendChild(hbars([{ label: "Invited", value: Number(rf.invited) || 0 }, { label: "Qualified", value: Number(rf.qualified) || 0 }, { label: "Rewarded", value: Number(rf.rewarded) || 0 }]));
    var ct = card("Top referrers");
    ct.appendChild(table([["Email", 0, 1], ["Invited", 1], ["Qualified", 1], ["Rewarded", 1]], arr(gr.topReferrers).map(function (x) { return [x.email, n0(x.invited), n0(x.qualified), n0(x.rewarded)]; }), { empty: "No referrals yet." }));
    add(g, cf, ct); p.appendChild(g);

    var cp = card("Promo codes");
    cp.appendChild(table([["Code"], ["Credits", 1], ["Uses / limit", 1], ["Expires"], ["Status"], ["Note", 0, 1], [""]], pr.map(function (x) {
      var off = el("span");
      if (x.active) off.appendChild(btn("Disable", "ghost", function () { act({ type: "promo-off", code: x.code }, "Disable promo code " + x.code + "?", null, reloadAll, "Disable"); }));
      return [x.code, n0(x.credits), n0(x.uses) + " / " + (x.maxUses ? n0(x.maxUses) : "∞"), x.expires ? fmtDate(x.expires) : "Never", chip(x.active ? "Active" : "Off", x.active ? "ok" : ""), x.note, off];
    }), { empty: "No promo codes yet. Create one on the Admin tab." }));
    p.appendChild(cp);

    var cc = card("Creators", "Payable now is highlighted: earned, approved and not yet paid, at or above the minimum payout.");
    cc.appendChild(table([["Code"], ["Name"], ["Sign-ups", 1], ["Orders", 1], ["Earned", 1], ["Pending", 1], ["Paid", 1], ["Payable", 1], ["Payout details", 0, 1], [""]], cr.map(function (x) {
      var cell = el("span");
      if (Number(x.payableInr) > 0) cell.appendChild(btn("Mark paid", "", function () { payPrefill = x.code; renderTab("growth"); var f = $("payCode"); if (f) { f.scrollIntoView({ block: "center" }); $("payRef").focus(); } }));
      return [x.code + (x.active ? "" : " (off)"), x.name, n0(x.signups), n0(x.orders), inr(x.earnedInr), inr(x.pendingInr), inr(x.paidInr), inr(x.payableInr), x.payoutDetails, cell];
    }), { hl: function (i) { return Number(cr[i].payableInr) > 0; }, empty: "No creators yet." }));
    p.appendChild(cc);

    var cm = card("Mark a payout as paid", "Record the payment you already made. Use the reference from your bank/UPI.");
    var f = el("form"); f.noValidate = true;
    var grid = el("div", "fgrid");
    var lc = field("Creator code", { name: "code", id: "payCode", maxlength: "40", required: "required", autocomplete: "off" });
    lc.querySelector("input").value = payPrefill;
    add(grid, lc, field("Reference", { name: "reference", id: "payRef", maxlength: "120", required: "required", autocomplete: "off", placeholder: "UPI ref / txn id" }), field("Method (optional)", { name: "method", maxlength: "40", placeholder: "UPI" }));
    var msg = el("p", "msg", ""); msg.setAttribute("role", "status");
    var go = el("button", "btn small", "Mark paid"); go.type = "submit";
    add(f, grid, el("div", "row"), msg); f.lastChild.previousSibling.appendChild(go);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = val(f, "code"), ref = val(f, "reference"), body = { type: "payout-mark", code: code, reference: ref };
      if (!code || !ref) { msg.textContent = "Enter the creator code and a payment reference."; msg.className = "msg err"; return; }
      if (val(f, "method")) body.method = val(f, "method");
      act(body, "Mark payout for " + code + " as paid (ref " + ref + ")?", msg, function () { payPrefill = ""; f.reset(); reloadAll(); });
    });
    cm.appendChild(f); p.appendChild(cm);
    void t;
  };

  R.safety = function (p, d) {
    var s = safeObj(d.safety), bk = safeObj(s.byKind);
    p.appendChild(kpiGrid([
      ["Blocked, 7 days", n0(s.blocks7d), "Requests the safety check refused"], ["Blocked, 30 days", n0(s.blocks30d), ""],
      ["Locked now", n0(s.lockedNow), "Temporarily locked accounts"], ["Banned", n0(s.banned), "Accounts banned"], ["Consent", pct(s.consentedPct), "Accounts that accepted the consent"]
    ]));
    var g = el("div", "grid two");
    var ck = card("Blocks by kind", "Last 30 days.");
    ck.appendChild(hbars([{ label: "Blocked item", value: Number(bk.blocked_item) || 0 }, { label: "Blocked person", value: Number(bk.blocked_person) || 0 }]));
    var cr = card("Top block reasons");
    cr.appendChild(table([["Reason", 0, 1], ["Count", 1]], arr(s.topReasons).map(function (x) { return [x.reason, n0(x.count)]; }), { empty: "No blocked requests." }));
    add(g, ck, cr); p.appendChild(g);
  };

  function infoRow(k, v) { var d = el("div"); add(d, el("span", null, k), v instanceof Node ? v : document.createTextNode(v == null || v === "" ? "-" : String(v))); return d; }
  R.users = function (p) {
    var c = card("Find a user", "Search by exact email.");
    var f = el("form", "inline"); f.noValidate = true;
    var i = el("input"); i.type = "email"; i.id = "userQ"; i.name = "q"; i.placeholder = "name@example.com"; i.maxLength = 120; i.autocomplete = "off"; i.value = userState.email; i.setAttribute("aria-label", "User email");
    var b = el("button", "btn small", "Search"); b.type = "submit";
    add(f, i, b);
    f.addEventListener("submit", function (e) { e.preventDefault(); var q = i.value.trim(); if (q) lookup(q); });
    c.appendChild(f);
    var m = el("p", "msg", userState.msg ? userState.msg.t : ""); if (userState.msg) m.className = "msg " + userState.msg.k;
    c.appendChild(m);
    p.appendChild(c);
    var u = userState.data;
    if (!u) return;
    if (!u.found) { p.appendChild(el("p", "empty", "No user found for " + userState.email + ".")); return; }
    var pc = card(u.name ? u.name + " (" + u.email + ")" : u.email);
    var chips = el("div");
    chips.appendChild(chip(u.banned ? "Banned" : "Not banned", u.banned ? "bad" : "ok"));
    chips.appendChild(chip(u.consented ? "Consented" : "No consent", u.consented ? "ok" : "warn"));
    chips.appendChild(chip(u.account ? "Account" : "Anonymous", ""));
    pc.appendChild(chips);
    var kv = el("div", "kv");
    add(kv, infoRow("Credits", n0(u.credits)), infoRow("Created", fmtDate(u.created)), infoRow("Last active", fmtDT(u.lastActive)), infoRow("Referral code", u.referralCode), infoRow("Invited by", u.invitedBy), infoRow("Creator code", u.creatorCode), infoRow("User id", u.id));
    pc.appendChild(kv);

    var gf = el("form"); gf.noValidate = true;
    var gg = el("div", "fgrid");
    add(gg, field("Grant credits (1-1000)", { name: "credits", type: "number", min: "1", max: "1000", step: "1", required: "required" }), field("Note (shown in audit log)", { name: "note", maxlength: "200", required: "required" }));
    var gm = el("p", "msg"); gm.setAttribute("role", "status");
    var gr = el("div", "row"), gbtn = el("button", "btn small", "Grant credits"); gbtn.type = "submit";
    gr.appendChild(gbtn);
    gr.appendChild(btn(u.banned ? "Unban user" : "Ban user", u.banned ? "ghost" : "danger", function () {
      act({ type: u.banned ? "unban" : "ban", email: u.email }, (u.banned ? "Unban " : "Ban ") + u.email + "?", gm, function () { lookup(u.email, true); }, u.banned ? "Unban" : "Ban");
    }));
    add(gf, gg, gr, gm);
    gf.addEventListener("submit", function (e) {
      e.preventDefault();
      var cr = parseInt(val(gf, "credits"), 10), note = val(gf, "note");
      if (!(cr >= 1 && cr <= 1000)) { gm.textContent = "Credits must be between 1 and 1000."; gm.className = "msg err"; return; }
      if (!note) { gm.textContent = "Add a short note."; gm.className = "msg err"; return; }
      act({ type: "grant", email: u.email, credits: cr, note: note }, "Grant " + cr + " credit" + (cr === 1 ? "" : "s") + " to " + u.email + "?", gm, function () { lookup(u.email, true); });
    });
    pc.appendChild(el("h3", null, "Actions")); pc.appendChild(gf);
    p.appendChild(pc);

    var co = card("Orders");
    co.appendChild(table([["Date"], ["Pack"], ["Price", 1], ["Status"], ["Order id", 0, 1], [""]], arr(u.orders).map(function (o) {
      var v = el("span");
      if (o.orderId) v.appendChild(btn("Void commission", "ghost", function () {
        act({ type: "commission-void", orderId: o.orderId }, "Void the creator commission for order " + o.orderId + "?", null, reloadAll, "Void");
      }));
      return [fmtDT(o.at), o.label || o.sku, inr(o.priceInr), o.status, o.orderId, v];
    }), { empty: "No orders." }));
    p.appendChild(co);
    var cl = card("Credit ledger", "50 newest entries.");
    cl.appendChild(table([["Date"], ["Type"], ["Change", 1], ["Balance", 1], ["Detail", 0, 1]], arr(u.ledger).map(function (r) {
      var dl = Number(r.delta) || 0, s = el("span", dl < 0 ? "neg" : "pos", (dl > 0 ? "+" : dl < 0 ? "−" : "") + Math.abs(dl));
      return [fmtDT(r.at), kind(r.kind), s, n0(r.balanceAfter), metaText(r.meta)];
    }), { empty: "No ledger entries." }));
    p.appendChild(cl);
    var cs = card("Safety events", "20 newest.");
    cs.appendChild(table([["Date"], ["Kind"], ["Detail", 0, 1]], arr(u.safety).map(function (r) { return [fmtDT(r.at), r.kind, metaText(r.detail)]; }), { empty: "No safety events." }));
    p.appendChild(cs);
  };

  function formCard(title, hint, fields, submitLabel, onSubmit) {
    var c = card(title, hint), f = el("form"); f.noValidate = true;
    var g = el("div", "fgrid"); fields.forEach(function (x) { g.appendChild(x); });
    var msg = el("p", "msg"); msg.setAttribute("role", "status");
    var row = el("div", "row"), b = el("button", "btn small", submitLabel); b.type = "submit"; row.appendChild(b);
    add(f, g, row, msg);
    f.addEventListener("submit", function (e) { e.preventDefault(); onSubmit(f, msg); });
    c.appendChild(f);
    return c;
  }
  function bad(msg, t) { msg.textContent = t; msg.className = "msg err"; }
  R.admin = function (p) {
    var g = el("div", "grid two");
    g.appendChild(formCard("Create promo code", "Gives credits once per account.", [
      field("Code", { name: "code", maxlength: "40", required: "required", autocomplete: "off" }),
      field("Credits (1-1000)", { name: "credits", type: "number", min: "1", max: "1000", required: "required" }),
      field("Max uses (optional)", { name: "maxUses", type: "number", min: "1" }),
      field("Expires (optional)", { name: "expires", type: "date" }),
      field("Note (optional)", { name: "note", maxlength: "200" })
    ], "Create promo", function (f, msg) {
      var code = val(f, "code"), cr = parseInt(val(f, "credits"), 10);
      if (!code) return bad(msg, "Enter a code.");
      if (!(cr >= 1 && cr <= 1000)) return bad(msg, "Credits must be between 1 and 1000.");
      var body = { type: "promo-create", code: code, credits: cr };
      if (val(f, "maxUses")) body.maxUses = parseInt(val(f, "maxUses"), 10);
      if (val(f, "expires")) body.expires = val(f, "expires");
      if (val(f, "note")) body.note = val(f, "note");
      act(body, "Create promo code " + code + " worth " + cr + " credits" + (body.maxUses ? ", limited to " + body.maxUses + " uses" : "") + (body.expires ? ", expiring " + body.expires : "") + "?", msg, function () { f.reset(); reloadAll(); }, "Create");
    }));
    g.appendChild(formCard("Add creator", "Creates a creator link and commission rate.", [
      field("Code", { name: "code", maxlength: "40", required: "required", autocomplete: "off" }),
      field("Name", { name: "name", maxlength: "80", required: "required" }),
      field("Account email", { name: "email", type: "email", maxlength: "120", required: "required" }),
      field("Commission % (1-50)", { name: "ratePercent", type: "number", min: "1", max: "50", step: "0.5", required: "required" }),
      field("Payout details (optional)", { name: "payoutDetails", maxlength: "200", placeholder: "UPI id or bank" }),
      field("Wallet email (optional)", { name: "walletEmail", type: "email", maxlength: "120" })
    ], "Add creator", function (f, msg) {
      var code = val(f, "code"), name = val(f, "name"), email = val(f, "email"), rate = parseFloat(val(f, "ratePercent"));
      if (!code || !name || !email) return bad(msg, "Code, name and email are required.");
      if (!(rate >= 1 && rate <= 50)) return bad(msg, "Commission must be between 1 and 50 percent.");
      var body = { type: "creator-add", code: code, name: name, email: email, ratePercent: rate };
      if (val(f, "payoutDetails")) body.payoutDetails = val(f, "payoutDetails");
      if (val(f, "walletEmail")) body.walletEmail = val(f, "walletEmail");
      act(body, "Add " + name + " (" + email + ") as creator " + code + " at " + rate + "% commission?", msg, function () { f.reset(); reloadAll(); }, "Add creator");
    }));
    p.appendChild(g);
    p.appendChild(formCard("Void a commission", "Use when an order was refunded or charged back. You can also void from a user's order list.", [
      field("Order id", { name: "orderId", maxlength: "120", required: "required", autocomplete: "off" })
    ], "Void commission", function (f, msg) {
      var id = val(f, "orderId");
      if (!id) return bad(msg, "Enter an order id.");
      act({ type: "commission-void", orderId: id }, "Void the creator commission for order " + id + "?", msg, function () { f.reset(); reloadAll(); }, "Void");
    }));
    var lc = card("Admin audit log", "Newest 50 admin actions.");
    var rb = btn("Reload log", "ghost", function () { loadLog(true); });
    lc.appendChild(rb);
    var holder = el("div"); holder.id = "logHolder"; lc.appendChild(holder);
    p.appendChild(lc);
    paintLog();
    if (!logData) loadLog();
  };
  function paintLog() {
    var h = $("logHolder"); if (!h) return;
    h.textContent = "";
    if (logData === "error") { h.appendChild(el("p", "empty", "The log could not be loaded.")); return; }
    if (!logData) { var s = el("div", "sk"); s.style.height = "120px"; h.appendChild(s); return; }
    h.appendChild(table([["When"], ["Admin", 0, 1], ["Action"], ["Detail", 0, 1]], logData.map(function (r) { return [fmtDT(r.at), r.admin, r.action, metaText(r.detail)]; }), { empty: "No admin actions yet." }));
  }
  function loadLog(force) {
    if (force) { logData = null; paintLog(); }
    api("/api/admin/log", {}).then(function (j) { logData = arr(j && j.log); paintLog(); })
      .catch(function (e) { if (routeError(e)) return; logData = "error"; paintLog(); });
  }
  function lookup(email, quiet) {
    userState.email = email; if (!quiet) userState.msg = { t: "Searching…", k: "" };
    renderTab("users");
    api("/api/admin/user", { email: email }).then(function (j) { userState.data = j; userState.msg = null; renderTab("users"); })
      .catch(function (e) { if (routeError(e)) return; userState.data = null; userState.msg = { t: e.message, k: "err" }; renderTab("users"); });
  }

  // ---------- tabs ----------
  function buildTabs() {
    var nav = $("tabs"), panels = $("panels");
    nav.textContent = ""; panels.textContent = "";
    TABS.forEach(function (t) {
      var b = el("button", null, t[1]); b.type = "button"; b.id = "tab-" + t[0]; b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "p-" + t[0]);
      b.addEventListener("click", function () { selectTab(t[0], true); });
      nav.appendChild(b);
      var p = el("div"); p.id = "p-" + t[0]; p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", "tab-" + t[0]); p.tabIndex = -1; p.hidden = true;
      panels.appendChild(p);
    });
    nav.addEventListener("keydown", function (e) {
      var i = TABS.findIndex(function (t) { return t[0] === curTab; }), k = e.key, ni = -1;
      if (k === "ArrowRight") ni = (i + 1) % TABS.length; else if (k === "ArrowLeft") ni = (i + TABS.length - 1) % TABS.length;
      else if (k === "Home") ni = 0; else if (k === "End") ni = TABS.length - 1;
      if (ni >= 0) { e.preventDefault(); selectTab(TABS[ni][0], true); }
    });
  }
  function selectTab(name, focus) {
    curTab = name;
    TABS.forEach(function (t) {
      var on = t[0] === name, b = $("tab-" + t[0]);
      b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; $("p-" + t[0]).hidden = !on;
    });
    if (focus) $("tab-" + name).focus();
    try { history.replaceState(null, "", "#" + name); } catch (e) { /* file: urls may refuse */ }
    renderTab(name);
  }
  var NEEDS_OVERVIEW = { overview: 1, revenue: 1, usage: 1, growth: 1, safety: 1 };
  function renderTab(name) {
    var p = $("p-" + name); if (!p) return;
    pending = []; tipHide();
    var scrollY = window.scrollY;
    if (NEEDS_OVERVIEW[name] && !D) { if (!p.firstChild || p.getAttribute("aria-busy") !== "true") skeleton(p); return; }
    p.textContent = ""; p.removeAttribute("aria-busy");
    R[name](p, D);
    drawCharts();
    window.scrollTo(0, scrollY);
  }

  // ---------- loading ----------
  function setUpdated() { $("updated").textContent = "Updated " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  function reloadAll() { loadOverview(); if (curTab === "users" && userState.email) lookup(userState.email, true); if (curTab === "admin") loadLog(true); }
  function loadOverview() {
    var my = ++loadId;
    $("errbar").hidden = true;
    D = null; renderTab(curTab);
    return api("/api/admin/overview", { days: days }).then(function (j) {
      if (my !== loadId) return;
      D = j || {}; D.days = D.days || days; setUpdated(); renderTab(curTab);
    }).catch(function (e) {
      if (my !== loadId || routeError(e)) return;
      $("errmsg").textContent = e.message || "Couldn't load the dashboard.";
      $("errbar").hidden = false;
      NEEDS_OVERVIEW[curTab] && ($("p-" + curTab).textContent = "");
    });
  }
  function start() {
    if (!DEMO && !session) { show("auth"); return Promise.resolve(); }
    show("loading");
    $("whoEmail").textContent = session ? session.user.email || "" : "demo@example.com";
    return api("/api/admin/me", {}).then(function (j) {
      if (!j || j.admin !== true) return showDenied();
      if (j.email) $("whoEmail").textContent = j.email;
      show("app"); buildTabs();
      var want = (/[?&]tab=([a-z]+)/.exec(location.search) || [])[1] || (location.hash || "").slice(1);
      selectTab(TABS.some(function (t) { return t[0] === want; }) ? want : "overview", false);
      var dq = DEMO && /[?&]q=([^&]+)/.exec(location.search);
      if (dq) lookup(decodeURIComponent(dq[1]), true);
      return loadOverview();
    }).catch(function (e) {
      if (routeError(e)) return;
      show("auth"); authMsg(e.message || "Couldn't reach Trysee.", "err");
    });
  }

  // ---------- demo data ----------
  function demoApi(path, body) {
    var out;
    if (path === "/api/admin/me") out = { admin: true, email: "owner@trysee.app" };
    else if (path === "/api/admin/overview") out = demoOverview(body.days || 30);
    else if (path === "/api/admin/user") out = /nobody/i.test(body.email || "") ? { found: false } : demoUser(body.email);
    else if (path === "/api/admin/action") out = { ok: true, message: "Demo: " + body.type + " accepted (nothing was changed)." };
    else if (path === "/api/admin/log") {
      var now = Date.now();
      out = { log: [{ at: now - 3e5, admin: "owner@trysee.app", action: "grant", detail: "5 credits to priya@example.com: support apology" }, { at: now - 9e6, admin: "owner@trysee.app", action: "promo-create", detail: "LAUNCH50, 5 credits, 100 uses" }, { at: now - 9e7, admin: "owner@trysee.app", action: "payout-mark", detail: "STYLEWITHRIYA 1,240 via UPI, ref 4821990" }] };
    } else out = {};
    return new Promise(function (res) { setTimeout(function () { res(out); }, 120); });
  }
  function demoOverview(nd) {
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var series = [], base = new Date(), tot = { rev: 0, ord: 0, su: 0, ph: 0, lv: 0, cost: 0, sec: 0 };
    for (var i = nd - 1; i >= 0; i--) {
      var dt = new Date(base.getTime() - i * 86400000), ramp = 0.6 + 0.8 * (nd - i) / nd;
      var orders = Math.round(rnd() * 4 * ramp), su = Math.round((8 + rnd() * 14) * ramp), ph = Math.round((40 + rnd() * 60) * ramp), lv = Math.round((6 + rnd() * 14) * ramp);
      var rev = orders * (99 + Math.round(rnd() * 4) * 100), cost = ph * 3.4 * 0.0 + (ph * 0.04 + lv * 15 * 0.02) * 88;
      series.push({ day: dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" + dt.getDate()).slice(-2), signups: su, installs: su * 3, orders: orders, revenueInr: rev, photos: ph, live: lv, refunds: Math.round(rnd() * 2), dau: Math.round(30 + rnd() * 40 * ramp), estCostInr: Math.round(cost * 100) / 100 });
      tot.rev += rev; tot.ord += orders; tot.su += su; tot.ph += ph; tot.lv += lv; tot.cost += cost;
    }
    var fees = tot.rev * 0.0236, gp = tot.rev - tot.cost - fees, now = Date.now();
    return {
      generatedAt: now, days: nd, currency: "INR", note: "Demo data. Not real.",
      totals: { accounts: 612, anonymousInstalls: 1228, creditsOutstanding: 3184, creditsIssuedAll: { FREE_GRANT: 612, PURCHASE: 4120, PROMO: 380, REFERRAL_BONUS: 90, REFERRAL_REWARD: 180, ADJUST: 25, MIGRATION: 0, MERGE_IN: 14 }, creditsSpentAll: { PHOTO: 1630, LIVE: 1005 }, refundsAll: 38 },
      activeUsers: { dau: 54, wau: 188, mau: 402 },
      funnel: { installs: 1840, accounts: 612, triedOn: 388, purchased: 74 },
      revenue: { totalInr: 48210, rangeInr: tot.rev, last7Inr: 4850, orders: tot.ord, payingUsers: Math.max(1, Math.round(tot.ord * 0.8)), repeatBuyers: 12, avgOrderInr: tot.ord ? tot.rev / tot.ord : 0, arpuInr: tot.rev / 612, conversionPct: 12.1, byPack: [{ sku: "p", name: "Popular", orders: Math.round(tot.ord * 0.45), revenueInr: Math.round(tot.rev * 0.4) }, { sku: "s", name: "Starter", orders: Math.round(tot.ord * 0.3), revenueInr: Math.round(tot.rev * 0.13) }, { sku: "v", name: "Value", orders: Math.round(tot.ord * 0.18), revenueInr: Math.round(tot.rev * 0.27) }, { sku: "w", name: "Power", orders: Math.round(tot.ord * 0.07), revenueInr: Math.round(tot.rev * 0.2) }], otherCurrencyOrders: 1 },
      usage: { photos: tot.ph, liveSessions: tot.lv, liveSeconds: tot.lv * 15, refunds: 11, uploads: Math.round(tot.ph * 0.7), layered: Math.round(tot.ph * 0.12), avgCreditsPerActiveUser: 3.4 },
      cost: { estDecartUsd: Math.round(tot.cost / 88 * 100) / 100, estDecartInr: Math.round(tot.cost), estFeesInr: Math.round(fees), estGrossProfitInr: Math.round(gp), estMarginPct: tot.rev ? gp / tot.rev * 100 : 0, liveSharePct: 58, assumptions: { liveUsdPerSecond: 0.02, imageUsd: 0.04, usdInr: 88, feePct: 2.36 } },
      series: series,
      growth: {
        referrals: { invited: 96, qualified: 51, rewarded: 44, creditsPaid: 270 },
        topReferrers: [{ email: "aarav@example.com", invited: 14, qualified: 9, rewarded: 8 }, { email: "meera@example.com", invited: 9, qualified: 5, rewarded: 5 }, { email: "karan@example.com", invited: 6, qualified: 2, rewarded: 2 }],
        promos: [{ code: "LAUNCH50", credits: 5, uses: 61, maxUses: 100, expires: "2026-12-31", active: true, note: "Launch week" }, { code: "BLOGGER", credits: 3, uses: 12, maxUses: 0, expires: null, active: true, note: "" }, { code: "OLDONE", credits: 2, uses: 40, maxUses: 40, expires: "2026-06-30", active: false, note: "Sold out" }],
        creators: [{ code: "STYLEWITHRIYA", name: "Riya S", active: true, signups: 142, orders: 21, earnedInr: 3120, pendingInr: 640, paidInr: 1240, payableInr: 1240, payoutDetails: "riya@upi" }, { code: "THRIFTKING", name: "Dev P", active: true, signups: 38, orders: 4, earnedInr: 410, pendingInr: 410, paidInr: 0, payableInr: 0, payoutDetails: "" }],
        attributedSignups: 180, minPayoutInr: 500
      },
      safety: { blocks7d: 9, blocks30d: 41, byKind: { blocked_item: 28, blocked_person: 13 }, topReasons: [{ reason: "Nudity or sexual content", count: 19 }, { reason: "Person detected in garment photo", count: 13 }, { reason: "Unsupported item", count: 9 }], lockedNow: 2, banned: 3, consentedPct: 96.4 },
      topUsers: [{ email: "aarav@example.com", photos: 84, live: 12, creditsSpent: 132, purchasedInr: 748 }, { email: "priya@example.com", photos: 60, live: 9, creditsSpent: 96, purchasedInr: 499 }, { email: "meera@example.com", photos: 41, live: 3, creditsSpent: 53, purchasedInr: 249 }],
      recent: [{ at: now - 6e4, kind: "PHOTO", delta: -1, email: "aarav@example.com" }, { at: now - 3e5, kind: "PURCHASE", delta: 20, email: "priya@example.com" }, { at: now - 9e5, kind: "LIVE", delta: -4, email: "meera@example.com" }, { at: now - 18e5, kind: "FREE_GRANT", delta: 1, email: "new.user@example.com" }, { at: now - 36e5, kind: "REFERRAL_REWARD", delta: 2, email: "karan@example.com" }, { at: now - 72e5, kind: "PROMO", delta: 5, email: "sam@example.com" }]
    };
  }
  function demoUser(email) {
    var now = Date.now(), led = [], kinds = [["PHOTO", -1], ["LIVE", -4], ["PURCHASE", 20], ["PROMO", 5], ["FREE_GRANT", 1], ["REFERRAL_REWARD", 2]], bal = 17;
    for (var i = 0; i < 50; i++) { var k = kinds[i % kinds.length]; led.push({ at: now - i * 7e6, kind: k[0], delta: k[1], balanceAfter: bal, meta: i % 6 === 2 ? { orderId: "order_demo" + i, sku: "p" } : "" }); bal -= k[1]; }
    return { found: true, id: "5b0f2c1e-demo-user-id", email: email, name: "Priya", account: true, credits: 17, created: now - 40 * 864e5, lastActive: now - 36e5, banned: false, consented: true, referralCode: "PRIYA7", invitedBy: "aarav@example.com", creatorCode: "",
      orders: [{ sku: "p", label: "Popular pack", priceInr: 249, at: now - 5 * 864e5, status: "paid", orderId: "order_demo1" }, { sku: "s", label: "Starter pack", priceInr: 99, at: now - 40 * 864e5, status: "paid", orderId: "order_demo0" }],
      ledger: led, safety: [{ at: now - 2 * 864e5, kind: "blocked_item", detail: "Unsupported item (swimwear)" }, { at: now - 9 * 864e5, kind: "blocked_person", detail: "Person detected in garment photo" }] };
  }

  // ---------- init ----------
  function init() {
    if (DEMO) { var m = /[?&]days=(\d+)/.exec(location.search); if (m && [7, 30, 90, 365].indexOf(+m[1]) >= 0) { days = +m[1]; $("range").value = String(days); } }
    bindConfirm();
    $("formIn").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("inEmail").value.trim(), pass = $("inPass").value;
      if (!email || !pass) return authMsg("Enter your email and password.", "err");
      $("inGo").disabled = true; $("inGo").textContent = "Signing in…"; authMsg("");
      authCall("/auth/v1/token?grant_type=password", { email: email, password: pass })
        .then(function (j) { saveSession(sessionFromAuth(j)); $("inPass").value = ""; return start(); })
        .catch(function (err) { authMsg(err.message, "err"); })
        .then(function () { $("inGo").disabled = false; $("inGo").textContent = "Sign in"; });
    });
    function out() {
      var tok = session && session.access_token;
      if (tok && !DEMO) fetch(SB + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + tok } }).catch(function () {});
      signedOut("You're signed out.", "ok");
    }
    $("signOut").addEventListener("click", out); $("deniedOut").addEventListener("click", out);
    $("range").addEventListener("change", function () { days = parseInt($("range").value, 10) || 30; loadOverview(); });
    $("refresh").addEventListener("click", reloadAll);
    $("retry").addEventListener("click", loadOverview);
    var rt = null, lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (window.innerWidth !== lastW) { lastW = window.innerWidth; if (D && NEEDS_OVERVIEW[curTab] && !$("app").hidden) renderTab(curTab); } }, 150);
    });
    session = readSession();
    show("loading");
    start();
  }
  init();
})();
