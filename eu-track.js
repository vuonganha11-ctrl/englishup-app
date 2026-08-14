/* ============================================================
   eu-track.js — GHI HÀNH VI 7 NGÀY ĐẦU (EnglishUp)
   Nạp tự động bởi topbar.js, KHÔNG cần gắn vào từng trang.

   GHI GÌ:
     open  — mở một trang
     stay  — rời trang: đã xem bao nhiêu GIÂY THẬT + bao nhiêu thao tác
     cta   — bấm vào một gói (trang nâng cấp hoặc màn khoá)
     lock  — màn khoá hiện ra (khách hết hạn mà vẫn quay lại)

   KHÔNG GHI: vị trí, IP, thiết bị, nội dung gõ, tên từ đang học.
   (Từ đã học / video đã xem đã nằm sẵn ở srs_cards + video_progress.)

   AI BỊ GHI: chỉ học viên trong 7 ngày đầu kể từ lúc đăng ký.
   Việc chốt chặn nằm ở DB (RLS + eu_is_new_user()), không phải ở đây —
   nên người dùng có sửa JS cũng không ghi thêm được gì.

   THỜI GIAN THẬT: chỉ đếm khi tab đang HIỆN và trong 90 giây gần nhất
   có thao tác. Mở tab rồi bỏ đó KHÔNG được tính là đang học.
   ============================================================ */
(function () {
  "use strict";
  if (window.__EU_TRACK__) return;
  window.__EU_TRACK__ = true;

  var SB_URL = "https://fyglubimflzsetcovgqx.supabase.co";
  var SB_KEY = "sb_publishable_3h3EQvxWr0kba8Tyq5RNbQ_driFn_G_";
  var API = SB_URL + "/rest/v1/eu_events";
  var OFF_KEY = "eu_trk_off";        /* nhớ "tài khoản này hết 7 ngày rồi" */
  var IDLE_MS = 90000;               /* không thao tác quá 90s = ngừng đếm */
  var TICK_MS = 15000;               /* nhịp cộng giờ + nhịp gửi */

  /* ---------- tắt hẳn nếu đã biết là không được ghi ---------- */
  function isOff() {
    try { return sessionStorage.getItem(OFF_KEY) === "1"; } catch (e) { return false; }
  }
  function turnOff() {
    try { sessionStorage.setItem(OFF_KEY, "1"); } catch (e) {}
  }
  if (isOff()) return;

  /* ---------- lấy token đăng nhập từ kho của supabase-js ---------- */
  function token() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("sb-") !== 0 || k.indexOf("-auth-token") < 0) continue;
        var v = JSON.parse(localStorage.getItem(k) || "null");
        if (v && v.access_token) return v.access_token;
        if (v && v.currentSession && v.currentSession.access_token) return v.currentSession.access_token;
      }
    } catch (e) {}
    return null;
  }

  /* ---------- tên trang gọn: 'vocab.html' -> 'vocab' ---------- */
  var PAGE = (function () {
    var f = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    return f.replace(/\.html?$/, "") || "index";
  })();

  /* ---------- hàng đợi + gửi theo lô ---------- */
  var queue = [];
  var sending = false;

  function push(ev, detail, secs, acts) {
    if (isOff()) return;
    queue.push({
      page: PAGE,
      ev: ev,
      detail: detail == null ? null : String(detail).slice(0, 120),
      secs: secs == null ? null : Math.round(secs),
      acts: acts == null ? null : Math.round(acts)
    });
    if (queue.length >= 20) flush(false);
  }

  function flush(finalCall) {
    if (isOff() || sending || !queue.length) return;
    var t = token();
    if (!t) return;                       /* chưa đăng nhập → chờ, không mất dữ liệu */
    var batch = queue.slice();
    queue.length = 0;
    sending = true;

    var opt = {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + t,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(batch)
    };
    if (finalCall) opt.keepalive = true;  /* vẫn gửi được lúc đang đóng tab */

    fetch(API, opt).then(function (r) {
      sending = false;
      /* 401/403/42501 = tài khoản này không còn được ghi (quá 7 ngày, hoặc là
         giáo viên/admin). Tắt hẳn cho tới khi mở tab mới — khỏi gọi vô ích. */
      if (r.status === 401 || r.status === 403) { turnOff(); return; }
      if (!r.ok) { queue = batch.concat(queue); }   /* lỗi mạng → giữ lại gửi sau */
    }).catch(function () {
      sending = false;
      queue = batch.concat(queue);
    });
  }

  /* ---------- đếm giờ THẬT ---------- */
  var secs = 0, acts = 0, lastAct = Date.now(), sent = false;

  function bump() { acts++; lastAct = Date.now(); }
  ["click", "keydown", "scroll", "touchstart"].forEach(function (t) {
    document.addEventListener(t, bump, { passive: true, capture: true });
  });
  /* di chuột KHÔNG tính là thao tác, chỉ dùng để biết người còn ngồi đó */
  document.addEventListener("mousemove", function () { lastAct = Date.now(); },
    { passive: true, capture: true });

  setInterval(function () {
    if (document.visibilityState === "visible" && (Date.now() - lastAct) < IDLE_MS) {
      secs += TICK_MS / 1000;
    }
    flush(false);
  }, TICK_MS);

  /* ---------- chốt sổ khi rời trang ---------- */
  function closeOut() {
    if (sent) return;
    sent = true;
    push("stay", null, secs, acts);
    flush(true);
  }
  window.addEventListener("pagehide", closeOut);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { closeOut(); }
    else { sent = false; secs = 0; acts = 0; lastAct = Date.now(); push("open", "quay lại"); }
  });

  /* ---------- bấm vào gói (trang nâng cấp / màn khoá) ---------- */
  document.addEventListener("click", function (e) {
    try {
      var inLock = e.target.closest && e.target.closest("#eu-lock-wrap");
      if (PAGE !== "nangcap" && !inLock) return;
      var el = e.target.closest("a,button,[class*=plan],[class*=goi],[class*=card]");
      if (!el) return;
      var txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt) return;
      push("cta", txt);
      flush(false);
    } catch (err) {}
  }, true);

  /* ---------- màn khoá hiện ra ---------- */
  (function watchLock() {
    var seen = false;
    setInterval(function () {
      var has = !!document.getElementById("eu-lock-wrap");
      if (has && !seen) { seen = true; push("lock", PAGE); flush(false); }
      if (!has) seen = false;
    }, 3000);
  })();

  /* ---------- mở trang ---------- */
  push("open", null);
  setTimeout(function () { flush(false); }, 2500);   /* chờ topbar đăng nhập xong */

  /* API gỡ lỗi */
  window.euTrackStatus = function () {
    return { page: PAGE, secs: Math.round(secs), acts: acts, cho_gui: queue.length, tat: isOff() };
  };
})();
