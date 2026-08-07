/* EnglishUp · Khoá trang khi học viên còn BÀI TẬP VỀ NHÀ chưa đạt.
   Nạp tự động qua topbar.js; riêng video.html (không có topbar.js) thì gắn thẻ <script> trực tiếp.

   Nguyên tắc:
   - Chỉ tác động lên tài khoản được admin BẬT (hw_student_settings.enabled = true).
   - Chỉ khoá đúng những trang admin đã chọn cho học viên đó (lock_pages).
   - Lỗi mạng / chưa đăng nhập / admin, giáo viên → MỞ (fail-open), không bao giờ khoá nhầm.
*/
(function () {
  "use strict";
  if (window.__EU_HW_GUARD__) return;
  window.__EU_HW_GUARD__ = true;

  var SB_URL = "https://fyglubimflzsetcovgqx.supabase.co";
  var SB_KEY = "sb_publishable_3h3EQvxWr0kba8Tyq5RNbQ_driFn_G_";
  var SUBJ = { toan:"🔢", ly:"🧲", hoa:"⚗️", sinh:"🧬", van:"📖", anh:"🔤", su:"🏛️", dia:"🌏", tin:"💻", khac:"📚" };

  function here() {
    var p = (location.pathname || "").split("/").pop().toLowerCase();
    return p || "index.html";
  }
  /* Không bao giờ tự khoá chính trang bài tập */
  if (here() === "baitap.html" || here() === "admin-baitap.html") return;

  var _c = null;
  function client() {
    if (_c) return _c;
    if (!window.supabase || !window.supabase.createClient) return null;
    try { _c = window.supabase.createClient(SB_URL, SB_KEY, { auth: { lock: function (n, t, fn) { return fn(); } } }); }
    catch (e) { return null; }
    return _c;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c];
    });
  }
  function fmt(s) {
    if (!s) return "không hạn";
    try {
      return new Date(s).toLocaleString("vi-VN",
        { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
    } catch (e) { return "—"; }
  }

  function css() {
    if (document.getElementById("eu-hw-css")) return;
    var st = document.createElement("style");
    st.id = "eu-hw-css";
    st.textContent =
      "#eu-hw-lock{position:fixed;inset:0;z-index:2147483000;background:rgba(8,9,13,.965);" +
        "backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;" +
        "justify-content:center;padding:24px 16px;overflow:auto;font-family:'Inter',system-ui,sans-serif;color:#dde3f0}" +
      "#eu-hw-lock .bx{background:#151a25;border:1px solid #2e3a55;border-radius:18px;max-width:560px;width:100%;" +
        "padding:28px 26px;box-shadow:0 24px 70px rgba(0,0,0,.6)}" +
      "#eu-hw-lock .ic{font-size:44px;text-align:center;line-height:1}" +
      "#eu-hw-lock h2{font-size:21px;font-weight:800;text-align:center;margin:12px 0 6px;letter-spacing:-.4px}" +
      "#eu-hw-lock p{font-size:14px;color:#94a3b8;text-align:center;line-height:1.65;margin:0 0 16px}" +
      "#eu-hw-lock .li{background:#1b2133;border:1px solid #232d42;border-radius:11px;padding:11px 14px;" +
        "margin-bottom:8px;display:flex;gap:11px;align-items:center}" +
      "#eu-hw-lock .li .e{font-size:19px;flex:0 0 auto}" +
      "#eu-hw-lock .li .t{font-weight:600;font-size:14px;flex:1;min-width:0}" +
      "#eu-hw-lock .li .d{display:block;font-size:11.5px;color:#64748b;margin-top:2px;font-weight:400;line-height:1.45}" +
      "#eu-hw-lock .li .s{font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px;white-space:nowrap;" +
        "background:rgba(251,146,60,.16);color:#fb923c}" +
      "#eu-hw-lock .li .s.w{background:rgba(167,139,250,.18);color:#a78bfa}" +
      "#eu-hw-lock .btns{display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap}" +
      "#eu-hw-lock a.b{font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:11px 22px;" +
        "background:#4f8ef7;color:#fff;border:1px solid #4f8ef7}" +
      "#eu-hw-lock a.b.g{background:transparent;color:#94a3b8;border-color:#2e3a55}" +
      "#eu-hw-lock a.b:hover{filter:brightness(1.12)}" +
      "body.eu-hw-locked{overflow:hidden!important}";
    (document.head || document.documentElement).appendChild(st);
  }

  function lockScreen(pending) {
    css();
    /* dừng mọi âm thanh/video đang chạy */
    try {
      document.querySelectorAll("video,audio").forEach(function (m) { try { m.pause(); } catch (e) {} });
      document.querySelectorAll("iframe").forEach(function (f) {
        try { f.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', "*"); } catch (e) {}
      });
    } catch (e) {}

    var list = (pending || []).slice(0, 6).map(function (p) {
      var wait = p.status === "submitted";
      return '<div class="li"><span class="e">' + (SUBJ[p.subject] || "📚") + "</span>" +
        '<span class="t">' + esc(p.title) +
        '<span class="d">Điểm sàn ' + esc(p.pass_score) +
        (p.best_score != null ? " · điểm cao nhất của bạn " + esc(p.best_score) : "") +
        " · hạn " + fmt(p.due_at) + "</span></span>" +
        '<span class="s' + (wait ? " w" : "") + '">' + (wait ? "Chờ chấm" : "Chưa đạt") + "</span></div>";
    }).join("");
    var more = (pending || []).length > 6 ? '<p style="margin:6px 0 0">…và ' + ((pending || []).length - 6) + " bài khác</p>" : "";

    var d = document.createElement("div");
    d.id = "eu-hw-lock";
    d.innerHTML =
      '<div class="bx"><div class="ic">🔒</div>' +
      "<h2>Làm xong bài tập đã nhé!</h2>" +
      "<p>Phần này đang tạm khoá. Bạn cần đạt điểm sàn của các bài tập dưới đây thì mới mở lại được.</p>" +
      list + more +
      '<div class="btns"><a class="b" href="baitap.html">📝 Làm bài tập ngay</a>' +
      '<a class="b g" href="report.html">Về trang chính</a></div></div>';
    (document.body || document.documentElement).appendChild(d);
    try { document.body.classList.add("eu-hw-locked"); } catch (e) {}
  }

  function run() {
    var c = client();
    if (!c) return;                       /* chưa có supabase-js → mở, không khoá nhầm */
    c.auth.getSession().then(function (r) {
      if (!(r && r.data && r.data.session)) return;   /* chưa đăng nhập → trang tự lo */
      return c.rpc("hw_gate").then(function (res) {
        var g = res && res.data;
        if (!g || !g.enabled || !g.blocked) return;
        var pages = g.lock_pages || [];
        if (pages.indexOf(here()) < 0) return;        /* trang này không nằm trong danh sách khoá */
        if (document.body) lockScreen(g.pending || []);
        else document.addEventListener("DOMContentLoaded", function () { lockScreen(g.pending || []); });
      });
    }).catch(function () {});              /* mọi lỗi → fail-open */
  }

  /* Chờ supabase-js sẵn sàng (tối đa ~8 giây) */
  (function wait(n) {
    if (window.supabase && window.supabase.createClient) { run(); return; }
    if (n > 40) return;
    setTimeout(function () { wait(n + 1); }, 200);
  })(0);
})();
