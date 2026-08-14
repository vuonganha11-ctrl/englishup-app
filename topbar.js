/* EnglishUp · Thanh thông tin người dùng dùng chung cho MỌI trang.
   Hiển thị: ⚡ XP · 🔥 streak · avatar + HỌ TÊN đầy đủ + menu (Trang tài khoản / Đăng xuất).
   Tự đọc phiên đăng nhập + hồ sơ; tái sử dụng các id cũ để không phá code sẵn có của từng trang. */
(function () {
  "use strict";
  var SB_URL = "https://fyglubimflzsetcovgqx.supabase.co";
  var SB_KEY = "sb_publishable_3h3EQvxWr0kba8Tyq5RNbQ_driFn_G_";
  var _sb = null;
  var _fullName = "";
  var _hasWidget = false;   /* trang có .topbar-right → topbar.js dựng luôn user bar */

  /* ── Tự nạp gói tối ưu điện thoại (mobile.css + mobile-nav.js) ──
     Nhờ vậy mọi trang đã gắn topbar.js đều có ☰ + responsive mà KHÔNG
     phải sửa HTML. Có khoá chống nạp trùng. */
  (function injectMobileAssets() {
    try {
      var head = document.head || document.getElementsByTagName("head")[0];
      if (head && !document.getElementById("eu-mobile-css")) {
        var l = document.createElement("link");
        l.id = "eu-mobile-css"; l.rel = "stylesheet"; l.href = "mobile.css?v=20260723b";
        head.appendChild(l);
      }
      if (head && !document.getElementById("eu-mobile-nav-js")) {
        var s = document.createElement("script");
        s.id = "eu-mobile-nav-js"; s.src = "mobile-nav.js?v=20260723b";
        head.appendChild(s);
      }
      /* Bộ khoá "Bài tập về nhà" — chỉ tác động lên tài khoản admin đã bật */
      if (head && !document.getElementById("eu-hw-guard-js")) {
        var hg = document.createElement("script");
        hg.id = "eu-hw-guard-js"; hg.src = "hw-guard.js?v=20260807";
        head.appendChild(hg);
      }
      /* Bộ khoá theo GÓI: hết 7 ngày dùng thử / hết hạn gói → chặn toàn trang */
      if (head && !document.getElementById("eu-guard-js")) {
        var eg = document.createElement("script");
        eg.id = "eu-guard-js"; eg.src = "eu-guard.js?v=20260814";
        head.appendChild(eg);
      }
      /* Bộ ghi hành vi 7 ngày đầu (để chốt sale). Tự tắt với người quá 7 ngày,
         với giáo viên/admin, và khi chưa đăng nhập. Không lấy vị trí/IP/thiết bị. */
      if (head && !document.getElementById("eu-track-js")) {
        var tk = document.createElement("script");
        tk.id = "eu-track-js"; tk.src = "eu-track.js?v=20260814";
        head.appendChild(tk);
      }
    } catch (e) {}
  })();

  /* ── Ẩn ngay link "Trang chủ" (href .../index.html) để tránh nháy khi tải ──
     Logo sẽ đóng vai trò "về trang chủ". CSS nạp ở <head> trước khi body render.
     + Giấu tạm thanh nav cũ (7 link hardcode) cho tới khi buildChipNav() dựng lại
       thành 6 chip — tránh nháy 2 kiểu nav. Có hẹn giờ mở lại phòng khi JS lỗi. */
  (function injectInstantCSS() {
    try {
      var head = document.head || document.getElementsByTagName("head")[0];
      if (head && !document.getElementById("eu-instant-css")) {
        var st = document.createElement("style");
        st.id = "eu-instant-css";
        st.textContent = '.topbar nav a[href$="index.html"]{display:none!important}'
          + '.topbar nav a[href$="accounts.html"]{display:none!important}'
          + '.topbar nav:not(.eu-nav),header nav:not(.eu-nav){visibility:hidden}';
        head.appendChild(st);
        setTimeout(function () {   /* failsafe: JS chết vẫn thấy nav cũ */
          var s = document.getElementById("eu-instant-css");
          if (s) s.textContent = s.textContent.replace(
            '.topbar nav:not(.eu-nav),header nav:not(.eu-nav){visibility:hidden}', '');
        }, 2500);
      }
    } catch (e) {}
  })();

  /* ===== THANH ĐIỀU HƯỚNG DẠNG CHIP — 6 chip dùng chung MỌI trang =====
     5 chip chính + chip "⋯ Khác" chứa menu xổ xuống (tuỳ trang, tuỳ quyền).
     2026-08-14: rút về 6 nút theo LUỒNG HỌC (Đầu vào → Giáo trình → Mindmap →
     Luyện tập → Thống kê → Khác). Ba trang gom (dauvao/bando/luyentap) chỉ là
     màn chọn — trang tính năng cũ vẫn chạy nguyên, chỉ không còn nằm trong nav.
     `match` = danh sách trang con; đang ở trang con thì chip cha sáng. */
  var EU_MAIN = [
    { href: "dauvao.html",    icon: "📥", label: "Đầu vào",
      match: ["video.html", "shorts.html"] },
    { href: "giaotrinh.html", icon: "📖", label: "Giáo trình" },
    { href: "bando.html",     icon: "🗺️", label: "Mindmap",
      match: ["mindmap.html", "thongke-am.html"] },
    { href: "luyentap.html",  icon: "🏋️", label: "Luyện tập",
      match: ["flashcard.html", "vocab.html", "game.html", "goquai.html", "tuvunghinh.html"] },
    { href: "report.html",    icon: "📊", label: "Thống kê" }
  ];
  var EU_MORE = [
    { href: "baitap.html",    icon: "📝", label: "Bài tập về nhà" },
    { href: "bangxephang.html", icon: "🏆", label: "Bảng xếp hạng" },
    { href: "gioithieu.html",  icon: "🤝", label: "Giới thiệu bạn bè" },
    { href: "posts.html",     icon: "📰", label: "Thông báo" },
    { href: "nangcap.html",   icon: "⭐", label: "Nâng cấp gói", hideIfPremium: true },
    { href: "tai-khoan.html", icon: "👤", label: "Trang tài khoản" },
    { href: "quyen-rieng-tu.html", icon: "🔐", label: "Quyền riêng tư" },
    { href: "accounts.html",  icon: "👥", label: "Quản lý tài khoản", admin: true },
    { href: "admin-hoahong.html", icon: "💰", label: "Hoa hồng & cộng đồng", admin: true },
    { href: "admin-baitap.html", icon: "🎓", label: "Quản trị bài tập", admin: true },
    { href: "admin-shorts.html", icon: "📱", label: "Quản trị Shorts", admin: true },
    { href: "admin.html",     icon: "🛠️", label: "Trang quản trị",   admin: true }
  ];

  /* Trang con của một chip chính → dùng để bật .active cho chip cha. */
  function chipMatches(it, here) {
    if (it.href === here) return true;
    if (!it.match) return false;
    for (var k = 0; k < it.match.length; k++) if (it.match[k] === here) return true;
    return false;
  }

  function curPage() {
    var p = (location.pathname || "").split("/").pop().toLowerCase();
    return p || "index.html";
  }
  function headerEl() {
    return document.querySelector(".topbar") || document.querySelector("header.top") ||
           document.querySelector("header");
  }

  function buildChipNav() {
    try {
      var bar = headerEl();
      if (!bar) return;
      var nav = bar.querySelector("nav");
      if (!nav || nav.classList.contains("eu-nav")) return;
      var here = curPage();
      var inMore = EU_MORE.some(function (m) { return m.href === here; });

      var h = "";
      for (var i = 0; i < EU_MAIN.length; i++) {
        var it = EU_MAIN[i];
        if (chipMatches(it, here)) inMore = false;   /* đang ở trang con → chip cha sáng, "Khác" tắt */
        h += '<a class="eu-navchip' + (chipMatches(it, here) ? " active" : "") + '" href="' + it.href + '">' +
             '<span class="eu-ni">' + it.icon + "</span>" + it.label + "</a>";
      }
      h += '<span class="eu-morewrap">' +
           '<button type="button" class="eu-navchip eu-morebtn' + (inMore ? " active" : "") +
           '" onclick="__euToggleMore(event)" aria-haspopup="true" aria-expanded="false">' +
           '<span class="eu-ni">⋯</span>Khác</button>' +
           '<span class="eu-moremenu" id="eu-moremenu">';
      for (var j = 0; j < EU_MORE.length; j++) {
        var m = EU_MORE[j];
        var cls = "eu-moreitem" + (m.href === here ? " active" : "") +
                  (m.admin ? " eu-admin-only" : "") + (m.hideIfPremium ? " eu-plan-only" : "");
        h += '<a class="' + cls + '" href="' + m.href + '"' +
             (m.href === "accounts.html" ? ' id="nav-accounts"' : "") + ">" +
             '<span class="eu-ni">' + m.icon + "</span>" + m.label + "</a>";
      }
      h += "</span></span>";

      nav.innerHTML = h;
      nav.classList.add("eu-nav");
      nav.style.visibility = "visible";
      applyNavPerms();
    } catch (e) {}
  }

  /* Bật/tắt mục theo quyền: 2 mục admin + ẩn "Nâng cấp gói" với người đã trả phí */
  function applyNavPerms() {
    try {
      var a = window.EU_ACCESS || {};
      var menu = document.getElementById("eu-moremenu");
      if (!menu) return;
      if (a.role === "admin") menu.classList.add("eu-is-admin");
      else menu.classList.remove("eu-is-admin");
      /* Người đang DÙNG THỬ vẫn phải thấy "Nâng cấp gói" — chỉ ẩn với
         khách đã trả tiền (plus/pro/vip) và giáo viên/admin. */
      var daTraTien = a.ready && a.isPremium && a.plan !== "trial";
      if (daTraTien) menu.classList.add("eu-is-premium");
      else menu.classList.remove("eu-is-premium");
    } catch (e) {}
  }

  window.__euToggleMore = function (e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    var m = document.getElementById("eu-moremenu");
    if (!m) return;
    var open = m.classList.toggle("open");
    var btn = m.parentNode && m.parentNode.querySelector(".eu-morebtn");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  };
  document.addEventListener("click", function () {
    var m = document.getElementById("eu-moremenu");
    if (m) {
      m.classList.remove("open");
      var b = m.parentNode && m.parentNode.querySelector(".eu-morebtn");
      if (b) b.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var m = document.getElementById("eu-moremenu");
      if (m) m.classList.remove("open");
    }
  });

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
      ".eu-menu .eu-logout{color:var(--danger,#f87171)}" +
      /* ── Nav dạng chip ── */
      "nav.eu-nav{display:flex!important;align-items:center;gap:7px;flex-wrap:wrap;visibility:visible!important}" +
      "nav.eu-nav .eu-navchip{display:inline-flex!important;align-items:center;gap:6px;padding:7px 13px;border-radius:999px;" +
        "border:1px solid var(--border,#232d42);background:var(--card,#151a25);color:var(--text,#dde3f0);" +
        "font-size:13px;font-weight:600;font-family:inherit;line-height:1.15;text-decoration:none;white-space:nowrap;" +
        "cursor:pointer;transition:.15s;box-sizing:border-box}" +
      "nav.eu-nav .eu-navchip:hover{border-color:var(--accent,#4f8ef7);color:var(--accent,#4f8ef7);background:var(--card,#151a25)}" +
      "nav.eu-nav .eu-navchip.active{background:var(--accent,#4f8ef7);border-color:var(--accent,#4f8ef7);color:#fff}" +
      "nav.eu-nav .eu-navchip.active:hover{color:#fff}" +
      "nav.eu-nav .eu-ni{font-size:14px;line-height:1}" +
      "nav.eu-nav .eu-morewrap{position:relative;display:inline-flex}" +
      "nav.eu-nav .eu-moremenu{position:absolute;top:calc(100% + 8px);left:0;min-width:216px;display:none;" +
        "background:var(--surface,#0e1018);border:1px solid var(--border2,#2e3a55);border-radius:12px;padding:6px;" +
        "box-shadow:0 12px 32px rgba(0,0,0,.45);z-index:600}" +
      "nav.eu-nav .eu-moremenu.open{display:block}" +
      "nav.eu-nav .eu-moremenu a.eu-moreitem{display:flex!important;align-items:center;gap:9px;padding:9px 10px;" +
        "border-radius:8px;font-size:13px;font-weight:500;color:var(--text,#dde3f0);text-decoration:none;" +
        "white-space:nowrap;background:none;border:none}" +
      "nav.eu-nav .eu-moremenu a.eu-moreitem:hover{background:var(--card,#151a25);color:var(--text,#dde3f0)}" +
      "nav.eu-nav .eu-moremenu a.eu-moreitem.active{color:var(--accent,#4f8ef7);font-weight:700;background:rgba(79,142,247,.12)}" +
      "nav.eu-nav .eu-moremenu a.eu-admin-only{display:none!important}" +
      "nav.eu-nav .eu-moremenu.eu-is-admin a.eu-admin-only{display:flex!important}" +
      "nav.eu-nav .eu-moremenu.eu-is-premium a.eu-plan-only{display:none!important}" +
      "@media(max-width:768px){nav.eu-nav{gap:6px}nav.eu-nav .eu-navchip{padding:6px 11px;font-size:12.5px}" +
        "nav.eu-nav .eu-moremenu{left:auto;right:0}}";
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
      '    <a href="nangcap.html">⭐ Nâng cấp gói</a>' +
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
      var links = document.querySelectorAll('.topbar nav a[href$="accounts.html"], header nav a[href$="accounts.html"]');
      for (var i = 0; i < links.length; i++) {
        /* Link nằm trong menu "⋯ Khác" đã có class .eu-admin-only lo phần ẩn/hiện
           → đừng đặt style inline (sẽ phá layout flex của menu). */
        if (links[i].className.indexOf("eu-moreitem") >= 0) { links[i].style.removeProperty("display"); continue; }
        if (isAdmin) links[i].style.setProperty("display", "inline-block", "important");
        else links[i].style.setProperty("display", "none", "important");
      }
    } catch (e) {}
  }

  function showLoggedOut() {
    if (!_hasWidget) return;   /* trang tự lo phần user bar — chỉ mượn phiên để phân quyền nav */
    set("btn-login-top", function (e) { e.style.display = ""; });
    set("btn-register-top", function (e) { e.style.display = ""; });
    set("user-chip", function (e) { e.style.display = "none"; });
    set("xp-display", function (e) { e.style.display = "none"; });
    set("streak-display", function (e) { e.style.display = "none"; });
    gateAccountsNav(false);
  }

  function showLoggedIn(user, prof) {
    if (!_hasWidget) return;
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

  /* ===== Quyền truy cập dùng chung (window.EU_ACCESS) =====
     isPremium = full quyền: giáo viên/admin, HOẶC gói 'pro', HOẶC 'plus' còn hạn.
     Trang khác đọc window.EU_ACCESS hoặc nghe sự kiện 'eu-access'. */
  window.EU_ACCESS = window.EU_ACCESS || { ready:false, loggedIn:false, role:null, plan:null, planExpiresAt:null, status:null, isStaff:false, isPremium:false };
  function computeAccess(loggedIn, prof) {
    prof = prof || {};
    var role = prof.role || null;
    var plan = prof.plan || (loggedIn ? "free" : null);
    var exp = prof.plan_expires_at ? new Date(prof.plan_expires_at).getTime() : null;
    var isStaff = role === "teacher" || role === "admin";
    /* Gói còn quyền: trial (7 ngày) · plus (1 năm) · pro (2 năm) · vip (vĩnh viễn).
       QUY ƯỚC: plan_expires_at trống = VĨNH VIỄN — nhờ vậy khách mua Pro
       "vĩnh viễn" trước 2026-08-10 vẫn giữ nguyên quyền. */
    var paidPlans = ["trial", "plus", "pro", "vip"];
    var planActive = paidPlans.indexOf(plan) !== -1 && (exp === null || exp > Date.now());
    var isPremium = isStaff || planActive;
    var isTrial = plan === "trial" && planActive;
    var trialLeftMs = (exp === null) ? null : (exp - Date.now());
    return { ready:true, loggedIn:!!loggedIn, role:role, status:prof.status || null, plan:plan, planExpiresAt:prof.plan_expires_at || null, isStaff:isStaff, isPremium:isPremium, isTrial:isTrial, trialLeftMs:trialLeftMs };
  }
  function publishAccess(a) {
    window.EU_ACCESS = a;
    applyNavPerms();
    try { document.dispatchEvent(new CustomEvent("eu-access", { detail:a })); } catch (e) {}
  }
  function setAccess(u, prof) { publishAccess(computeAccess(true, prof)); }
  function clearAccess() { publishAccess(computeAccess(false, {})); }

  /* ===== Mã giới thiệu còn treo =====
     register.html lưu mã vào localStorage phòng khi lúc đăng ký chưa có phiên
     (bật xác nhận email). Lần đăng nhập kế tiếp sẽ gắn nốt, rồi xoá mã đi.
     Bỏ qua im lặng nếu lỗi — không được để chuyện này chặn việc dựng header. */
  function tryAttachRef(c) {
    var code;
    try { code = window.localStorage.getItem("eu_ref"); } catch (e) { return; }
    if (!code) return;
    try {
      c.rpc("attach_referral", { p_code: code }).then(function (res) {
        var d = res && res.data;
        // gắn xong HOẶC chắc chắn không bao giờ gắn được → dọn localStorage
        if (!d || d.ok || d.reason !== "chua_dang_nhap") {
          try { window.localStorage.removeItem("eu_ref"); } catch (e) {}
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function loadAndRender() {
    var c = sb();
    if (!c) return;
    c.auth.getSession().then(function (r) {
      var u = r.data && r.data.session && r.data.session.user;
      if (!u) { clearAccess(); showLoggedOut(); return; }
      tryAttachRef(c);
      c.from("user_profiles").select("email,full_name,xp,streak,role,status,plan,plan_expires_at").eq("id", u.id).maybeSingle()
        .then(function (res) { setAccess(u, res.data || {}); showLoggedIn(u, res.data || {}); gateAccountsNav(res.data && res.data.role === "admin"); })
        .catch(function () { setAccess(u, {}); showLoggedIn(u, {}); gateAccountsNav(false); });
    }).catch(function () {});
    c.auth.onAuthStateChange(function (_e, sess) {
      var u = sess && sess.user;
      if (!u) { clearAccess(); showLoggedOut(); return; }
      tryAttachRef(c);
      c.from("user_profiles").select("email,full_name,xp,streak,role,status,plan,plan_expires_at").eq("id", u.id).maybeSingle()
        .then(function (res) { setAccess(u, res.data || {}); showLoggedIn(u, res.data || {}); gateAccountsNav(res.data && res.data.role === "admin"); })
        .catch(function () { setAccess(u, {}); showLoggedIn(u, {}); gateAccountsNav(false); });
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
    injectCSS();
    fixHeader();
    setupLessons();
    buildChipNav();
    var host = mount();
    if (host) { _hasWidget = true; host.innerHTML = widgetHTML(); }
    /* Vẫn đọc phiên kể cả trang không có .topbar-right — cần biết vai trò
       để bật 2 mục admin trong menu "⋯ Khác". */
    loadAndRender();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
