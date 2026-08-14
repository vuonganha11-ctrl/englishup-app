/* ============================================================
   eu-guard.js — KHOÁ TOÀN CỤC THEO GÓI (EnglishUp)
   Nạp tự động bởi topbar.js, không cần gắn vào từng trang.

   LUẬT:
     - Giáo viên / admin        -> luôn mở
     - trial / plus / pro / vip -> mở nếu plan_expires_at trống (vĩnh viễn)
                                   hoặc còn hạn
     - hết hạn, hoặc plan='free' -> KHOÁ, chỉ vào được các trang trong
                                    EU_OPEN_PAGES (trang chủ, nâng cấp,
                                    tài khoản, đăng ký)
     - CHƯA đăng nhập           -> KHÔNG khoá (để form đăng nhập của
                                    từng trang còn dùng được)
     - Chưa biết trạng thái     -> KHÔNG khoá (fail-open, tránh nháy
                                    màn hình và tránh khoá nhầm khi
                                    mạng chập chờn)
   ============================================================ */
(function () {
  "use strict";
  if (window.__EU_GUARD__) return;
  window.__EU_GUARD__ = true;

  /* Trang luôn mở, kể cả khi tài khoản đã hết hạn */
  var EU_OPEN_PAGES = [
    "",                 // truy cập gốc englishup.xyz/
    "index.html",
    "nangcap.html",
    "tai-khoan.html",
    "register.html",
    "quyen-rieng-tu.html"
  ];

  var here = (location.pathname.split("/").pop() || "").toLowerCase();
  var isOpenPage = EU_OPEN_PAGES.indexOf(here) !== -1;
  /* Trang quản trị tự có guard riêng, và staff thì luôn mở */
  var isAdminPage = here.indexOf("admin") === 0;

  /* ---------- tính quyền ---------- */
  function accessOf(a) {
    if (!a || !a.ready) return null;                 // chưa biết
    if (!a.loggedIn) return "anon";
    if (a.isStaff) return "open";
    var plan = a.plan || "free";
    if (plan === "free") return "locked";
    if (["trial", "plus", "pro", "vip"].indexOf(plan) === -1) return "locked";
    var exp = a.planExpiresAt ? new Date(a.planExpiresAt).getTime() : null;
    if (exp === null) return "open";                 // trống = vĩnh viễn
    return exp > Date.now() ? "open" : "locked";
  }

  function msLeft(a) {
    if (!a || !a.planExpiresAt) return null;
    return new Date(a.planExpiresAt).getTime() - Date.now();
  }

  function humanLeft(ms) {
    if (ms == null || ms <= 0) return "đã hết hạn";
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    if (h >= 48) {
      var d = Math.floor(h / 24), hr = h % 24;
      return hr ? (d + " ngày " + hr + " giờ") : (d + " ngày");
    }
    if (h >= 1) return h + " giờ " + m + " phút";
    return m + " phút";
  }

  /* ---------- CSS ---------- */
  function injectCss() {
    if (document.getElementById("eu-guard-css")) return;
    var s = document.createElement("style");
    s.id = "eu-guard-css";
    s.textContent = [
      "#eu-lock-wrap{position:fixed;inset:0;z-index:2147483000;display:flex;",
      "align-items:center;justify-content:center;padding:20px;overflow:auto;",
      "background:rgba(4,6,12,.93);backdrop-filter:blur(6px);",
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
      "#eu-lock-card{max-width:520px;width:100%;background:#0e1018;",
      "border:1px solid #2e3a55;border-radius:18px;padding:34px 28px;",
      "text-align:center;color:#dde3f0;box-shadow:0 24px 60px rgba(0,0,0,.6)}",
      "#eu-lock-card h2{margin:14px 0 8px;font-size:21px;line-height:1.35}",
      "#eu-lock-card p{color:#94a3b8;font-size:14.5px;line-height:1.65;margin:0 0 18px}",
      "#eu-lock-plans{display:grid;gap:9px;margin:0 0 20px;text-align:left}",
      "#eu-lock-plans div{background:#151926;border:1px solid #26304a;border-radius:10px;",
      "padding:10px 13px;font-size:13.5px;display:flex;justify-content:space-between;gap:10px}",
      "#eu-lock-plans b{color:#dde3f0;white-space:nowrap}",
      "#eu-lock-plans span{color:#8fa0bd}",
      ".eu-lock-btn{display:inline-block;background:#4f8ef7;color:#fff;padding:12px 24px;",
      "border-radius:10px;font-weight:700;text-decoration:none;font-size:15px}",
      ".eu-lock-alt{display:block;margin-top:14px;color:#64748b;font-size:13px;text-decoration:none}",
      ".eu-lock-alt:hover{color:#94a3b8}",
      "body.eu-locked{overflow:hidden !important}",
      "#eu-trial-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147482000;",
      "background:linear-gradient(90deg,#4f8ef7,#7c5cf7);color:#fff;",
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:13.5px;",
      "padding:9px 14px;display:flex;align-items:center;justify-content:center;gap:14px;",
      "flex-wrap:wrap;box-shadow:0 -4px 18px rgba(0,0,0,.35)}",
      "#eu-trial-bar a{background:#fff;color:#2743a3;padding:5px 14px;border-radius:7px;",
      "font-weight:700;text-decoration:none;white-space:nowrap}",
      "#eu-trial-bar button{background:none;border:none;color:rgba(255,255,255,.75);",
      "font-size:18px;cursor:pointer;line-height:1;padding:0 2px}",
      "@media(max-width:520px){#eu-lock-card{padding:26px 18px}#eu-trial-bar{font-size:12.5px}}"
    ].join("");
    document.head.appendChild(s);
  }

  /* ---------- màn khoá ---------- */
  function showLock(a) {
    if (document.getElementById("eu-lock-wrap")) return;
    injectCss();
    var wasTrial = (a && a.plan === "trial");
    var tieu_de = wasTrial
      ? "Bản dùng thử 7 ngày đã kết thúc"
      : "Gói học của bạn đã hết hạn";
    var mo_ta = wasTrial
      ? "Cảm ơn bạn đã trải nghiệm EnglishUp. Để học tiếp toàn bộ từ vựng, video, giáo trình, flashcard và các trò chơi, bạn hãy chọn một gói bên dưới."
      : "Hãy gia hạn để mở lại toàn bộ nội dung. Tiến độ học của bạn vẫn được giữ nguyên.";

    var w = document.createElement("div");
    w.id = "eu-lock-wrap";
    w.innerHTML =
      '<div id="eu-lock-card">' +
        '<div style="font-size:54px;line-height:1">🔒</div>' +
        "<h2>" + tieu_de + "</h2>" +
        "<p>" + mo_ta + "</p>" +
        '<div id="eu-lock-plans">' +
          "<div><b>Plus — 2.388.000đ</b><span>Mở toàn bộ 1 năm</span></div>" +
          "<div><b>Pro — 3.790.000đ</b><span>Mở toàn bộ 2 năm</span></div>" +
          "<div><b>VIP — 5.678.999đ</b><span>Mở toàn bộ vĩnh viễn</span></div>" +
        "</div>" +
        '<a class="eu-lock-btn" href="nangcap.html">⭐ Chọn gói &amp; nâng cấp</a>' +
        '<a class="eu-lock-alt" href="index.html">← Về trang chủ</a>' +
      "</div>";
    document.body.appendChild(w);
    document.body.classList.add("eu-locked");

    /* dừng mọi âm thanh / video đang chạy dưới lớp khoá */
    try {
      document.querySelectorAll("audio,video").forEach(function (m) {
        try { m.pause(); } catch (e) {}
      });
      document.querySelectorAll("iframe").forEach(function (f) {
        try { f.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', "*"); } catch (e) {}
      });
    } catch (e) {}
  }

  /* ---------- dải nhắc còn bao lâu (khi đang dùng thử / gần hết hạn) ---------- */
  var barTimer = null;
  function showTrialBar(a) {
    var ms = msLeft(a);
    if (ms == null) { hideTrialBar(); return; }          // vĩnh viễn
    var isTrial = a.plan === "trial";
    var sapHet = ms < 7 * 24 * 3600000;                  // còn dưới 7 ngày
    if (!isTrial && !sapHet) { hideTrialBar(); return; }
    if (sessionStorage.getItem("eu_trial_bar_off") === "1") return;

    injectCss();
    var bar = document.getElementById("eu-trial-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "eu-trial-bar";
      bar.innerHTML =
        '<span id="eu-tb-text"></span>' +
        '<a href="nangcap.html">Nâng cấp ngay</a>' +
        '<button type="button" title="Ẩn" id="eu-tb-x">×</button>';
      document.body.appendChild(bar);
      document.getElementById("eu-tb-x").addEventListener("click", function () {
        sessionStorage.setItem("eu_trial_bar_off", "1");
        hideTrialBar();
      });
    }
    function paint() {
      var left = msLeft(a);
      if (left == null) return;
      if (left <= 0) { location.reload(); return; }
      document.getElementById("eu-tb-text").textContent =
        (isTrial ? "⏳ Bản dùng thử còn " : "⏳ Gói của bạn còn ") + humanLeft(left);
    }
    paint();
    if (barTimer) clearInterval(barTimer);
    barTimer = setInterval(paint, 30000);
  }
  function hideTrialBar() {
    var b = document.getElementById("eu-trial-bar");
    if (b) b.remove();
    if (barTimer) { clearInterval(barTimer); barTimer = null; }
  }

  /* ---------- áp dụng ---------- */
  var expiryTimer = null;
  function apply() {
    var a = window.EU_ACCESS;
    var st = accessOf(a);
    if (st === null) return;                 // chưa biết -> chưa làm gì

    if (st === "locked" && !isOpenPage && !isAdminPage) {
      hideTrialBar();
      showLock(a);
      return;
    }

    if (st === "open" && !isOpenPage) {
      showTrialBar(a);
      /* hết hạn ngay giữa lúc đang học -> khoá luôn, không phải tải lại */
      var ms = msLeft(a);
      if (expiryTimer) clearTimeout(expiryTimer);
      if (ms != null && ms > 0 && ms < 26 * 3600000) {
        expiryTimer = setTimeout(function () {
          if (accessOf(window.EU_ACCESS) === "locked") { hideTrialBar(); showLock(window.EU_ACCESS); }
        }, ms + 1500);
      }
    }
  }

  document.addEventListener("eu-access", apply);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
  /* phòng khi sự kiện eu-access bắn trước lúc file này nạp xong */
  setTimeout(apply, 1200);
  setTimeout(apply, 4000);

  /* cho trang khác gọi lại nếu cần */
  window.euGuardRefresh = apply;
  window.euGuardStatus = function () { return accessOf(window.EU_ACCESS); };
})();
