/* EnglishUp · Thanh thông tin người dùng dùng chung cho MỌI trang.
   Hiển thị: ⚡ XP · 🔥 streak · avatar + HỌ TÊN đầy đủ + menu (Trang tài khoản / Đăng xuất).
   Tự đọc phiên đăng nhập + hồ sơ; tái sử dụng các id cũ để không phá code sẵn có của từng trang. */
(function () {
  "use strict";
  var SB_URL = "https://fyglubimflzsetcovgqx.supabase.co";
  var SB_KEY = "sb_publishable_3h3EQvxWr0kba8Tyq5RNbQ_driFn_G_";
  var _sb = null;
  var _fullName = "";

  /* ── Tự nạp gói tối ưu điện thoại (mobile.css + mobile-nav.js) ──
     Nhờ vậy mọi trang đã gắn topbar.js đều có ☰ + responsive mà KHÔNG
     phải sửa HTML. Có khoá chống nạp trùng. */
  (function injectMobileAssets() {
    try {
      var head = document.head || document.getElementsByTagName("head")[0];
      if (head && !document.getElementById("eu-mobile-css")) {
        var l = document.createElement("link");
        l.id = "eu-mobile-css"; l.rel = "stylesheet"; l.href = "mobile.css";
        head.appendChild(l);
      }
      if (head && !document.getElementById("eu-mobile-nav-js")) {
        var s = document.createElement("script");
        s.id = "eu-mobile-nav-js"; s.src = "mobile-nav.js";
        head.appendChild(s);
      }
    } catch (e) {}
  })();

  /* ── Ẩn ngay link "Trang chủ" (href .../index.html) để tránh nháy khi tải ──
     Logo sẽ đóng vai trò "về trang chủ". CSS nạp ở <head> trước khi body render. */
  (function injectInstantCSS() {
    try {
      var head = document.head || document.getElementsByTagName("head")[0];
      if (head && !document.getElementById("eu-instant-css")) {
        var st = document.createElement("style");
        st.id = "eu-instant-css";
        st.textContent = '.topbar nav a[href$="index.html"]{display:none!important}'
          + '.topbar nav a[href$="accounts.html"]{display:none!important}';
        head.appendChild(st);
      }
    } catch (e) {}
  })();

  function sb() {
    if (!_sb && window.supabase) {
      _sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { lock: function (_n, _t, fn) { return fn(); } } });
    }
    return _sb;
  }

  function injectCSS() {
    if (document.getElementById("eu-topbar-css")) return;
    var css =
      ".topbar-right{display:flex;align-items:center;gap:10px}" +
      ".eu-badge{display:flex;align-items:center;gap:6px;background:var(--card,#151a25);border:1px solid var(--border,#232d42);border-radius:20px;padding:5px 12px;font-size:13px;font-weight:600;white-space:nowrap}" +
      ".eu-xp{color:var(--a4,#fb923c)}.eu-streak{color:var(--a5,#f472b6)}" +
      ".eu-login{background:var(--accent,#4f8ef7);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}" +
      ".eu-login:hover{opacity:.88}" +
      ".eu-register{display:inline-flex;align-items:center;background:transparent;color:var(--accent,#4f8ef7);border:1px solid var(--accent,#4f8ef7);border-radius:8px;padding:6px 15px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;white-space:nowrap}" +
      ".eu-register:hover{background:rgba(79,142,247,.12)}" +
      ".eu-userwrap{position:relative}" +
      ".eu-chip{display:flex;align-items:center;gap:8px;background:var(--card,#151a25);border:1px solid var(--border,#232d42);border-radius:20px;padding:4px 12px 4px 6px;font-size:13px;cursor:pointer;color:var(--text,#dde3f0)}" +
      ".eu-chip:hover{border-color:var(--border2,#2e3a55)}" +
      ".eu-av{width:26px;height:26px;border-radius:50%;background:var(--accent,#4f8ef7);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}" +
      ".eu-name{font-weight:600;white-space:nowrap}" +
      ".eu-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:200px;background:var(--surface,#0e1018);border:1px solid var(--border2,#2e3a55);border-radius:12px;padding:6px;box-shadow:0 12px 32px rgba(0,0,0,.5);display:none;z-index:500}" +
      ".eu-menu.open{display:block}" +
      ".eu-menu-head{padding:8px 10px 10px;border-bottom:1px solid var(--border,#232d42);margin-bottom:6px}" +
      ".eu-menu-head b{display:block;font-size:13px;color:var(--text,#dde3f0)}.eu-menu-head small{font-size:11px;color:var(--muted,#64748b)}" +
      ".eu-menu a,.eu-menu .eu-logout{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:none;color:var(--text,#dde3f0);font-family:inherit;font-size:13px;padding:9px 10px;border-radius:8px;cursor:pointer;text-decoration:none;box-sizing:border-box}" +
      ".eu-menu a:hover,.eu-menu .eu-logout:hover{background:var(--card,#151a25)}" +
      ".eu-menu .eu-logout{color:var(--danger,#f87171)}";
    var st = document.createElement("style");
    st.id = "eu-topbar-css";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function mount() {
    return document.querySelector(".topbar-right");
  }

  function widgetHTML() {
    return (
      '<div class="eu-badge eu-xp" id="xp-display" style="display:none">⚡ <span id="xp-val">0</span> XP</div>' +
      '<div class="eu-badge eu-streak" id="streak-display" style="display:none">🔥 <span id="streak-val">0</span> ngày</div>' +
      '<button class="eu-login" id="btn-login-top" onclick="__euLogin()">Đăng nhập</button>' +
      '<a class="eu-register" id="btn-register-top" href="register.html">Đăng ký</a>' +
      '<div class="eu-userwrap" id="user-chip" style="display:none">' +
      '  <div class="eu-chip" onclick="__euToggleMenu(event)">' +
      '    <div class="eu-av" id="eu-av">?</div><span class="eu-name" id="eu-name">—</span>' +
      '  </div>' +
      '  <div class="eu-menu" id="eu-menu">' +
      '    <div class="eu-menu-head"><b id="menu-name">—</b><small id="menu-email">—</small></div>' +
      '    <a href="tai-khoan.html">👤 Trang tài khoản</a>' +
      '    <button type="button" class="eu-logout" onclick="__euLogout()">🚪 Đăng xuất</button>' +
      '  </div>' +
      '  <span id="user-av" style="display:none"></span><span id="user-email-display" style="display:none"></span>' +
      '</div>'
    );
  }

  function initials(name, email) {
    var base = (name && name.trim()) ? name.trim() : (email || "").split("@")[0];
    var parts = base.trim().split(/\s+/).map(function (s) { return s[0] || ""; });
    var ini = parts.slice(0, 2).join("").toUpperCase();
    return ini || (email || "?").slice(0, 2).toUpperCase();
  }

  function set(id, fn) { var el = document.getElementById(id); if (el) fn(el); }

  /* Thẻ "Tài khoản" (accounts.html) chỉ dành cho Admin.
     Ẩn với học viên/giáo viên & khách; hiện lại cho Admin. */
  function gateAccountsNav(isAdmin) {
    try {
      var links = document.querySelectorAll('.topbar nav a[href$="accounts.html"]');
      for (var i = 0; i < links.length; i++) {
        if (isAdmin) links[i].style.setProperty("display", "inline-block", "important");
        else links[i].style.setProperty("display", "none", "important");
      }
    } catch (e) {}
  }

  function showLoggedOut() {
    set("btn-login-top", function (e) { e.style.display = ""; });
    set("btn-register-top", function (e) { e.style.display = ""; });
    set("user-chip", function (e) { e.style.display = "none"; });
    set("xp-display", function (e) { e.style.display = "none"; });
    set("streak-display", function (e) { e.style.display = "none"; });
    gateAccountsNav(false);
  }

  function showLoggedIn(user, prof) {
    var email = (prof && prof.email) || user.email || "";
    var name = (prof && prof.full_name) ? prof.full_name : (email.split("@")[0] || "Học viên");
    _fullName = name;
    set("btn-login-top", function (e) { e.style.display = "none"; });
    set("btn-register-top", function (e) { e.style.display = "none"; });
    set("user-chip", function (e) { e.style.display = "flex"; });
    set("eu-av", function (e) { e.textContent = initials(name, email); });
    set("eu-name", function (e) { e.textContent = name; });
    set("menu-name", function (e) { e.textContent = name; });
    set("menu-email", function (e) { e.textContent = email; });
    var xp = (prof && prof.xp != null) ? prof.xp : 0;
    set("xp-val", function (e) { e.textContent = xp; });
    set("xp-display", function (e) { e.style.display = "flex"; });
    var streak = (prof && prof.streak != null) ? prof.streak : 0;
    set("streak-val", function (e) { e.textContent = streak; });
    set("streak-display", function (e) { e.style.display = "flex"; });
  }

  window.__euLogin = function () {
    if (typeof window.openLogin === "function") { try { window.openLogin(); return; } catch (e) {} }
    location.href = "tai-khoan.html";
  };
  window.__euToggleMenu = function (e) {
    if (e) e.stopPropagation();
    var m = document.getElementById("eu-menu");
    if (m) m.classList.toggle("open");
  };
  window.__euLogout = function () {
    if (!confirm("Đăng xuất?")) return;
    var c = sb();
    if (!c) { location.reload(); return; }
    c.auth.signOut().then(function () { location.reload(); }).catch(function () { location.reload(); });
  };
  document.addEventListener("click", function () {
    var m = document.getElementById("eu-menu");
    if (m) m.classList.remove("open");
  });

  function loadAndRender() {
    var c = sb();
    if (!c) return;
    c.auth.getSession().then(function (r) {
      var u = r.data && r.data.session && r.data.session.user;
      if (!u) { showLoggedOut(); return; }
      c.from("user_profiles").select("email,full_name,xp,streak,role").eq("id", u.id).maybeSingle()
        .then(function (res) { showLoggedIn(u, res.data || {}); gateAccountsNav(res.data && res.data.role === "admin"); })
        .catch(function () { showLoggedIn(u, {}); gateAccountsNav(false); });
    }).catch(function () {});
    c.auth.onAuthStateChange(function (_e, sess) {
      var u = sess && sess.user;
      if (!u) { showLoggedOut(); return; }
      c.from("user_profiles").select("email,full_name,xp,streak,role").eq("id", u.id).maybeSingle()
        .then(function (res) { showLoggedIn(u, res.data || {}); gateAccountsNav(res.data && res.data.role === "admin"); })
        .catch(function () { showLoggedIn(u, {}); gateAccountsNav(false); });
    });
  }

  /* Chuẩn hoá header trên MỌI trang: logo → index.html, gỡ link "Trang chủ".
     Gỡ hẳn khỏi DOM để ngăn kéo mobile (đọc nav trực tiếp lúc mở) cũng sạch. */
  function fixHeader() {
    try {
      var bar = document.querySelector(".topbar");
      if (!bar) return;
      var logo = bar.querySelector(".logo");
      if (logo) logo.setAttribute("href", "index.html");
      var nav = bar.querySelector("nav");
      if (nav) {
        var links = nav.querySelectorAll("a");
        for (var i = 0; i < links.length; i++) {
          var a = links[i];
          var href = a.getAttribute("href") || "";
          var txt = (a.textContent || "").trim();
          if (/index\.html$/.test(href) || txt === "Trang chủ") {
            if (a.parentNode) a.parentNode.removeChild(a);
          }
        }
      }
    } catch (e) {}
  }

  /* Lịch lên buổi học giờ NẰM TRONG trang Báo cáo (report.html), không tách
     trang riêng. Vì vậy: (1) gỡ mọi link "Lịch học" cũ khỏi nav; (2) khi đang
     ở report.html thì nạp module report-lessons.js để hiện panel lịch. */
  function setupLessons() {
    try {
      var bar = document.querySelector(".topbar");
      if (bar) {
        var nav = bar.querySelector("nav");
        if (nav) {
          var olds = nav.querySelectorAll('a[href$="lich.html"]');
          for (var i = 0; i < olds.length; i++) { if (olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]); }
        }
      }
      var path = (location.pathname || "").toLowerCase();
      if (/report\.html$/.test(path) && !document.getElementById("eu-report-lessons-js")) {
        var s = document.createElement("script");
        s.id = "eu-report-lessons-js"; s.src = "report-lessons.js";
        (document.head || document.documentElement).appendChild(s);
      }
    } catch (e) {}
  }

  function boot() {
    fixHeader();
    setupLessons();
    var host = mount();
    if (!host) return;
    injectCSS();
    host.innerHTML = widgetHTML();
    loadAndRender();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
