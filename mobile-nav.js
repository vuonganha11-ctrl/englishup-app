/* EnglishUp · mobile-nav.js — Nút ☰ + ngăn kéo điều hướng cho điện thoại.
   Dùng chung mọi trang. Tự tìm <nav> trong .topbar (top-nav / topnav / nav trơn),
   dựng nút hamburger + ngăn kéo trượt. Mỗi lần mở sẽ ĐỌC LẠI nav hiện tại
   (tôn trọng link đang ẩn như "Tài khoản") nên luôn khớp trạng thái đăng nhập. */
(function () {
  "use strict";

  function init() {
    var topbar = document.querySelector(".topbar");
    if (!topbar) return;
    var srcNav = topbar.querySelector("nav");
    if (!srcNav) return;
    if (document.getElementById("eu-hamburger")) return; /* tránh dựng 2 lần */

    /* --- Nút hamburger (đặt đầu topbar) --- */
    var btn = document.createElement("button");
    btn.id = "eu-hamburger";
    btn.className = "eu-hamburger";
    btn.type = "button";
    btn.setAttribute("aria-label", "Mở menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span></span><span></span><span></span>";
    topbar.insertBefore(btn, topbar.firstChild);

    /* --- Lớp phủ + ngăn kéo --- */
    var overlay = document.createElement("div");
    overlay.className = "eu-drawer-overlay";

    var drawer = document.createElement("aside");
    drawer.id = "eu-drawer";
    drawer.className = "eu-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "Điều hướng");

    var head = document.createElement("div");
    head.className = "eu-drawer-head";
    head.innerHTML =
      '<span class="eu-drawer-logo">English<span>Up</span></span>' +
      '<button type="button" class="eu-drawer-close" aria-label="Đóng menu">&times;</button>';

    var dnav = document.createElement("nav");
    dnav.className = "eu-drawer-nav";

    drawer.appendChild(head);
    drawer.appendChild(dnav);
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    /* Dựng lại danh sách link từ nav gốc, bỏ link đang ẩn, bỏ id trùng */
    function rebuild() {
      dnav.innerHTML = "";
      var links = srcNav.querySelectorAll("a");
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var hiddenByStyle = (a.style && a.style.display === "none");
        var hiddenByClass = a.classList.contains("hidden");
        var hiddenByLayout = (a.offsetParent === null && !drawer.classList.contains("open"));
        if (hiddenByStyle || hiddenByClass) continue;
        var c = a.cloneNode(true);
        c.removeAttribute("id");
        c.removeAttribute("style");
        dnav.appendChild(c);
      }
    }

    function open() {
      rebuild();
      drawer.classList.add("open");
      overlay.classList.add("open");
      document.body.classList.add("eu-noscroll");
      btn.setAttribute("aria-expanded", "true");
    }
    function close() {
      drawer.classList.remove("open");
      overlay.classList.remove("open");
      document.body.classList.remove("eu-noscroll");
      btn.setAttribute("aria-expanded", "false");
    }

    btn.addEventListener("click", open);
    overlay.addEventListener("click", close);
    head.querySelector(".eu-drawer-close").addEventListener("click", close);
    dnav.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== dnav) { if (t.tagName === "A") { close(); break; } t = t.parentNode; }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    /* Quay về desktop khi xoay ngang / phóng to → đóng ngăn kéo */
    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) { close(); closeFilter(); }
    });

    /* ===== Trang Từ vựng: ngăn kéo bộ lọc (sidebar) ===== */
    var sidebar = document.querySelector("aside.sidebar");
    function closeFilter() {
      if (!sidebar) return;
      sidebar.classList.remove("eu-filter-open");
      overlay.classList.remove("open");
      document.body.classList.remove("eu-noscroll");
    }
    if (sidebar) {
      var fab = document.createElement("button");
      fab.type = "button";
      fab.className = "eu-filter-fab";
      fab.setAttribute("aria-label", "Mở bộ lọc chủ đề");
      fab.innerHTML = '<span aria-hidden="true">🔎</span> Bộ lọc';
      document.body.appendChild(fab);

      fab.addEventListener("click", function () {
        sidebar.classList.add("eu-filter-open");
        overlay.classList.add("open");
        document.body.classList.add("eu-noscroll");
      });
      /* chạm vào 1 chủ đề / cấp độ → đóng panel để xem kết quả ngay */
      sidebar.addEventListener("click", function (e) {
        var t = e.target;
        while (t && t !== sidebar) {
          if (t.classList && (t.classList.contains("topic-row") ||
              t.classList.contains("topic-row-all") || t.classList.contains("level-chip"))) {
            closeFilter(); break;
          }
          t = t.parentNode;
        }
      });
      /* overlay dùng chung: bấm overlay đóng cả nav lẫn bộ lọc */
      overlay.addEventListener("click", closeFilter);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
