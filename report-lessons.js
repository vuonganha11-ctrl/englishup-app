/* EnglishUp · Lịch lên buổi học — NHÚNG vào trang Báo cáo (report.html).
   Tự chứa: tự tạo Supabase client, tự nhận vai trò, tự inject 1 panel lịch
   lưới tháng vào view đang hiển thị (#view-teacher hoặc #view-student) ngay
   dưới khối thống kê, nên các chỉ số học tập vẫn hiển thị đồng thời.

   Quy trình: GV tạo buổi (nháp) → tải ghi âm mẫu → gửi Admin duyệt →
   Admin nghe + duyệt/từ chối → sau buổi: GV chấm điểm + nhận xét, HV nộp
   ghi âm kết quả → GV đánh dấu hoàn thành. Buổi ĐÃ DUYỆT/HOÀN THÀNH chỉ
   Admin được xóa (RLS + UI). */
(function () {
  "use strict";
  if (window.__LX_LESSONS_LOADED) return;            // chống nạp trùng
  if (!/report\.html$/.test((location.pathname || "").toLowerCase())) return;
  window.__LX_LESSONS_LOADED = true;

  var SB_URL = "https://fyglubimflzsetcovgqx.supabase.co";
  var SB_KEY = "sb_publishable_3h3EQvxWr0kba8Tyq5RNbQ_driFn_G_";
  var BUCKET = "englishup";
  if (!window.supabase) return;
  var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { lock: function (_n, _t, fn) { return fn(); } } });

  var STATUS = {
    draft:     { label: "Nháp",       cls: "st-draft" },
    pending:   { label: "Chờ duyệt",  cls: "st-pending" },
    approved:  { label: "Đã duyệt",   cls: "st-approved" },
    rejected:  { label: "Bị từ chối", cls: "st-rejected" },
    completed: { label: "Hoàn thành", cls: "st-completed" },
  };
  var CRITERIA = [
    ["eval_pronunciation", "Phát âm"],
    ["eval_fluency", "Trôi chảy"],
    ["eval_vocabulary", "Từ vựng"],
    ["eval_confidence", "Tự tin"],
  ];

  var S = {
    me: null, role: "student", isStaff: false, isAdmin: false,
    year: 0, month: 0, lessons: [], words: [], topics: [], students: [],
    pickWords: new Set(), pickStudents: new Set(), filter: "all", editId: null,
  };

  /* ───── tiện ích ───── */
  function $(id) { return document.getElementById(id); }
  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function todayStr() { var t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); }
  function fmtTime(t) { return t ? t.slice(0, 5) : ""; }
  function fmtDateVN(s) { if (!s) return ""; var p = s.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function toast(m) { var t = $("lx-toast"); if (!t) return; t.textContent = m; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function openOv(id) { var o = $(id); if (o) o.classList.add("open"); }
  function closeOv(id) { var o = $(id); if (o) o.classList.remove("open"); }

  /* ───── CSS ───── */
  function injectCSS() {
    if ($("lx-css")) return;
    var css = [
      ".lx-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px}",
      ".lx-head h2{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;margin:0}",
      ".lx-btn{font-family:inherit;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-size:13px;padding:8px 15px;transition:.15s}",
      ".lx-btn:disabled{opacity:.5;cursor:not-allowed}",
      ".lx-primary{background:var(--accent);color:#fff}.lx-primary:hover{background:#3b7de8}",
      ".lx-ghost{background:var(--card2);color:var(--text);border:1px solid var(--border)}.lx-ghost:hover{border-color:var(--border2)}",
      ".lx-success{background:var(--a3);color:#06281c}.lx-success:hover{opacity:.9}",
      ".lx-danger{background:transparent;color:var(--danger);border:1px solid var(--danger)}.lx-danger:hover{background:rgba(248,113,113,.12)}",
      ".lx-sm{padding:5px 11px;font-size:12px}",
      ".lx-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px}",
      ".lx-nav{display:flex;align-items:center;gap:8px}",
      ".lx-nav button{min-width:30px;height:30px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--text);cursor:pointer;font-size:14px;line-height:1}",
      ".lx-nav button:hover{border-color:var(--border2)}",
      ".lx-title{font-size:14px;font-weight:700;min-width:128px;text-align:center}",
      ".lx-filters{display:flex;gap:6px;flex-wrap:wrap}",
      ".lx-f{font-size:12px;font-weight:600;padding:5px 11px;border-radius:20px;border:1px solid var(--border);background:var(--card2);color:var(--muted);cursor:pointer}",
      ".lx-f:hover{border-color:var(--border2);color:var(--text)}",
      ".lx-f.on{color:var(--accent);background:rgba(79,142,247,.12);border-color:rgba(79,142,247,.35)}",
      ".lx-dow{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px}",
      ".lx-dow div{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;text-align:center;padding:2px 0}",
      ".lx-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}",
      ".lx-cell{min-height:92px;background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:5px;display:flex;flex-direction:column;gap:3px;overflow:hidden}",
      ".lx-cell.empty{background:transparent;border-color:transparent}",
      ".lx-cell.today{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}",
      ".lx-cell.clk{cursor:pointer}.lx-cell.clk:hover{border-color:var(--border2)}",
      ".lx-dn{font-size:11px;font-weight:600;color:var(--muted);display:flex;align-items:center;justify-content:space-between}",
      ".lx-cell.today .lx-dn{color:var(--accent)}",
      ".lx-add{opacity:0;font-size:13px;color:var(--muted)}",
      ".lx-cell.clk:hover .lx-add{opacity:1}",
      ".lx-chip{font-size:11px;font-weight:600;border-radius:6px;padding:2px 6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:3px solid}",
      ".lx-chip .tm{font-variant-numeric:tabular-nums;opacity:.85;margin-right:4px}",
      ".lx-chip.st-draft{background:rgba(100,116,139,.16);border-color:var(--muted);color:#aeb8cc}",
      ".lx-chip.st-pending{background:rgba(251,146,60,.16);border-color:var(--a4);color:#f7c08a}",
      ".lx-chip.st-approved{background:rgba(52,211,153,.16);border-color:var(--a3);color:#86e8c2}",
      ".lx-chip.st-rejected{background:rgba(248,113,113,.16);border-color:var(--danger);color:#f4a3a3}",
      ".lx-chip.st-completed{background:rgba(79,142,247,.16);border-color:var(--accent);color:#a8c6f7}",
      ".lx-more{font-size:10px;color:var(--muted);padding-left:2px}",
      ".lx-legend{display:flex;gap:13px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--muted)}",
      ".lx-legend span{display:inline-flex;align-items:center;gap:5px}",
      ".lx-legend i{width:11px;height:11px;border-radius:3px;display:inline-block}",
      ".lx-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px}",
      ".lx-badge.st-draft{color:#aeb8cc;background:rgba(100,116,139,.16)}",
      ".lx-badge.st-pending{color:var(--a4);background:rgba(251,146,60,.14)}",
      ".lx-badge.st-approved{color:var(--a3);background:rgba(52,211,153,.14)}",
      ".lx-badge.st-rejected{color:var(--danger);background:rgba(248,113,113,.14)}",
      ".lx-badge.st-completed{color:var(--accent);background:rgba(79,142,247,.14)}",
      ".lx-ov{position:fixed;inset:0;background:rgba(4,6,12,.8);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:.2s;z-index:1000;padding:20px}",
      ".lx-ov.open{opacity:1;pointer-events:auto}",
      ".lx-modal{width:720px;max-width:96vw;max-height:90vh;overflow:auto;background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:22px;transform:scale(.97);transition:.2s}",
      ".lx-ov.open .lx-modal{transform:scale(1)}",
      ".lx-mh{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}",
      ".lx-mh h3{font-size:18px;font-weight:700;margin:0}",
      ".lx-mh .sub{font-size:12px;color:var(--muted);margin-top:3px}",
      ".lx-x{background:var(--card);border:1px solid var(--border);color:var(--text);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:15px;flex-shrink:0}",
      ".lx-2{display:grid;grid-template-columns:1fr 1fr;gap:13px}",
      "@media(max-width:640px){.lx-2{grid-template-columns:1fr}.lx-modal{padding:17px}.lx-cell{min-height:66px}}",
      ".lx-fld{margin-bottom:12px}",
      ".lx-fld label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px}",
      ".lx-fld input,.lx-fld textarea,.lx-fld select{width:100%;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-family:inherit;font-size:14px}",
      ".lx-fld textarea{resize:vertical;min-height:70px}",
      ".lx-fld input:focus,.lx-fld textarea:focus,.lx-fld select:focus{outline:none;border-color:var(--accent)}",
      ".lx-pick{background:var(--card);border:1px solid var(--border);border-radius:8px;max-height:168px;overflow:auto;padding:6px}",
      ".lx-psearch{width:100%;background:var(--card2);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text);font-family:inherit;font-size:13px;margin-bottom:6px;position:sticky;top:0}",
      ".lx-opt{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:7px;cursor:pointer;font-size:13px}",
      ".lx-opt:hover{background:var(--card2)}",
      ".lx-opt input{width:16px;height:16px;flex-shrink:0;accent-color:var(--accent)}",
      ".lx-opt .meta{font-size:11px;color:var(--muted);margin-left:auto}",
      ".lx-cnt{font-size:11px;color:var(--muted);margin-top:5px}",
      ".lx-sec{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:13px;margin-bottom:12px}",
      ".lx-sec h4{font-size:13px;font-weight:700;margin:0 0 9px;display:flex;align-items:center;gap:7px}",
      ".lx-wl{display:flex;flex-wrap:wrap;gap:6px}",
      ".lx-wt{background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:3px 9px;font-size:12px;color:#aeb8cc}",
      ".lx-wt b{color:var(--text);font-weight:600}",
      ".lx-au{width:100%;margin-top:6px;height:38px}",
      ".lx-aue{font-size:12px;color:var(--muted);font-style:italic}",
      ".lx-stu{background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:11px 12px;margin-bottom:9px}",
      ".lx-stu .nm{font-weight:600;font-size:14px}.lx-stu .em{font-size:11px;color:var(--muted)}",
      ".lx-rub{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px}",
      ".lx-rb{display:flex;align-items:center;gap:8px;font-size:12px}",
      ".lx-rb label{color:var(--muted);min-width:62px}",
      ".lx-rb input{width:62px;background:var(--card);border:1px solid var(--border);border-radius:7px;padding:6px 8px;color:var(--text);font-family:inherit;font-size:13px;text-align:center}",
      ".lx-score{font-size:12px;font-weight:700;padding:2px 9px;border-radius:20px;color:var(--a3);background:rgba(52,211,153,.13)}",
      ".lx-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}",
      ".lx-grow{flex:1}",
      ".lx-err{color:var(--danger);font-size:12px;min-height:16px;margin-top:6px}",
      ".lx-ok{color:var(--a3);font-size:12px}",
      ".lx-hint{font-size:11px;color:var(--muted);margin-top:4px}",
      ".lx-up{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px}",
      ".lx-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--card2);border:1px solid var(--border2);border-radius:10px;padding:11px 18px;font-size:13px;font-weight:500;opacity:0;pointer-events:none;transition:.25s;z-index:1100}",
      ".lx-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}",
      ".lx-muted{color:var(--muted)}",
    ].join("");
    var st = document.createElement("style"); st.id = "lx-css"; st.textContent = css;
    document.head.appendChild(st);
  }

  /* ───── DOM: panel + modals ───── */
  function buildPanel() {
    var panel = el('<div class="panel" id="lx-panel"></div>');
    panel.innerHTML =
      '<div class="lx-head">' +
      '  <h2>📅 Lịch lên buổi học</h2>' +
      (S.isStaff ? '<button class="lx-btn lx-primary" id="lx-create">+ Tạo buổi học</button>' : '') +
      '</div>' +
      '<div class="lx-bar">' +
      '  <div class="lx-nav">' +
      '    <button id="lx-prev" title="Tháng trước">‹</button>' +
      '    <div class="lx-title" id="lx-title">—</div>' +
      '    <button id="lx-next" title="Tháng sau">›</button>' +
      '    <button class="lx-btn lx-ghost lx-sm" id="lx-today" style="margin-left:6px">Hôm nay</button>' +
      '  </div>' +
      '  <div class="lx-filters" id="lx-filters"></div>' +
      '</div>' +
      '<div class="lx-dow"><div>T2</div><div>T3</div><div>T4</div><div>T5</div><div>T6</div><div>T7</div><div>CN</div></div>' +
      '<div class="lx-grid" id="lx-grid"></div>' +
      '<div class="lx-legend">' +
      '  <span><i style="background:var(--muted)"></i>Nháp</span>' +
      '  <span><i style="background:var(--a4)"></i>Chờ duyệt</span>' +
      '  <span><i style="background:var(--a3)"></i>Đã duyệt</span>' +
      '  <span><i style="background:var(--danger)"></i>Bị từ chối</span>' +
      '  <span><i style="background:var(--accent)"></i>Hoàn thành</span>' +
      '</div>';
    return panel;
  }

  function buildModals() {
    if ($("lx-ovCreate")) return;
    var create = el(
      '<div class="lx-ov" id="lx-ovCreate"><div class="lx-modal">' +
      '<div class="lx-mh"><div><h3 id="lx-cTitle">Tạo buổi học</h3><div class="sub">Giáo viên lên lịch nội dung & từ vựng cho học viên.</div></div>' +
      '<button class="lx-x" id="lx-cClose">✕</button></div>' +
      '<div class="lx-fld"><label>Tiêu đề buổi học *</label><input id="lx-fTitle" placeholder="VD: Luyện đọc — Chủ đề Food (Unit 3)"></div>' +
      '<div class="lx-2"><div class="lx-fld"><label>Ngày *</label><input type="date" id="lx-fDate"></div>' +
      '<div class="lx-fld"><label>Giờ bắt đầu *</label><input type="time" id="lx-fTime" value="19:00"></div></div>' +
      '<div class="lx-2"><div class="lx-fld"><label>Thời lượng (phút)</label><input type="number" id="lx-fDur" value="120" min="15" step="15"></div>' +
      '<div class="lx-fld"><label>Chủ đề (tuỳ chọn)</label><select id="lx-fTopic"><option value="">— Không chọn —</option></select></div></div>' +
      '<div class="lx-fld"><label>Nội dung buổi học *</label><textarea id="lx-fContent" placeholder="Mô tả nội dung, đoạn văn luyện đọc, mục tiêu buổi học…"></textarea></div>' +
      '<div class="lx-2"><div class="lx-fld"><label>Từ vựng (chọn nhiều)</label><div class="lx-pick" id="lx-wordPick"></div><div class="lx-cnt" id="lx-wordCnt">Đã chọn 0 từ</div></div>' +
      '<div class="lx-fld"><label>Học viên (chọn nhiều) *</label><div class="lx-pick" id="lx-stuPick"></div><div class="lx-cnt" id="lx-stuCnt">Đã chọn 0 học viên</div></div></div>' +
      '<div class="lx-err" id="lx-cErr"></div>' +
      '<div class="lx-acts"><button class="lx-btn lx-ghost" id="lx-cCancel">Hủy</button><span class="lx-grow"></span>' +
      '<button class="lx-btn lx-primary" id="lx-cSave">Lưu buổi học (nháp)</button></div>' +
      '<div class="lx-hint" style="margin-top:8px">Sau khi lưu, mở buổi học để tải <b>ghi âm mẫu</b> rồi gửi Admin duyệt.</div>' +
      '</div></div>'
    );
    var detail = el(
      '<div class="lx-ov" id="lx-ovDetail"><div class="lx-modal">' +
      '<div class="lx-mh"><div><h3 id="lx-dTitle">Buổi học</h3><div class="sub" id="lx-dSub"></div></div>' +
      '<button class="lx-x" id="lx-dClose">✕</button></div><div id="lx-dBody"></div></div></div>'
    );
    document.body.appendChild(create);
    document.body.appendChild(detail);
    document.body.appendChild(el('<div class="lx-toast" id="lx-toast"></div>'));
    // sự kiện cố định
    $("lx-cClose").onclick = function () { closeOv("lx-ovCreate"); };
    $("lx-cCancel").onclick = function () { closeOv("lx-ovCreate"); };
    $("lx-dClose").onclick = function () { closeOv("lx-ovDetail"); };
    $("lx-cSave").onclick = saveLesson;
    $("lx-ovCreate").onclick = function (e) { if (e.target.id === "lx-ovCreate") closeOv("lx-ovCreate"); };
    $("lx-ovDetail").onclick = function (e) { if (e.target.id === "lx-ovDetail") closeOv("lx-ovDetail"); };
  }

  /* ───── khởi tạo ───── */
  function mountInto() {
    var view = $(S.isStaff ? "view-teacher" : "view-student");
    if (!view) return false;
    if ($("lx-panel")) return true;
    var anchor = $(S.isStaff ? "t-stats" : "s-stats");
    var panel = buildPanel();
    if (anchor && anchor.parentNode === view) anchor.insertAdjacentElement("afterend", panel);
    else view.appendChild(panel);
    // sự kiện panel
    if ($("lx-create")) $("lx-create").onclick = function () { openCreate(); };
    $("lx-prev").onclick = function () { shiftMonth(-1); };
    $("lx-next").onclick = function () { shiftMonth(1); };
    $("lx-today").onclick = function () { var t = new Date(); S.year = t.getFullYear(); S.month = t.getMonth(); renderCalendar(); };
    buildFilters();
    return true;
  }

  async function init() {
    var session = null;
    try { var r = await sb.auth.getSession(); session = r.data.session; } catch (e) {}
    if (!session) return;                                  // chưa đăng nhập → để report.html xử lý
    S.me = session.user;
    try { var p = await sb.from("user_profiles").select("role").eq("id", S.me.id).maybeSingle(); S.role = (p.data && p.data.role) || "student"; } catch (e) { S.role = "student"; }
    S.isAdmin = S.role === "admin";
    S.isStaff = S.role === "admin" || S.role === "teacher";

    injectCSS();
    buildModals();
    var now = new Date(); S.year = now.getFullYear(); S.month = now.getMonth();
    if (S.isStaff) {
      if (!mountInto()) return;                 // GV/Admin: panel lịch riêng (view không có lịch sẵn)
      await Promise.all([loadWords(), loadTopics(), loadStudents()]);
    } else {
      setupStudentOverlay();                    // HV: gộp chip buổi học vào lịch học theo tháng sẵn có
    }
    await loadLessons();
  }

  function buildFilters() {
    var f = $("lx-filters"); if (!f) return; f.innerHTML = "";
    var opts = S.isStaff
      ? [["all", "Tất cả"], ["mine", "Của tôi"], ["pending", "Chờ duyệt"], ["approved", "Đã duyệt"]]
      : [["all", "Tất cả"], ["pending", "Chờ duyệt"], ["approved", "Đã duyệt"]];
    opts.forEach(function (o) {
      var b = document.createElement("button");
      b.className = "lx-f" + (S.filter === o[0] ? " on" : ""); b.dataset.k = o[0];
      b.innerHTML = esc(o[1]) + (o[0] === "pending" ? ' <span id="lx-cntPending"></span>' : "");
      b.onclick = function () { S.filter = o[0]; Array.prototype.forEach.call(document.querySelectorAll(".lx-f"), function (x) { x.classList.toggle("on", x.dataset.k === o[0]); }); renderCalendar(); };
      f.appendChild(b);
    });
  }

  /* ───── nạp dữ liệu ───── */
  async function loadWords() { try { var r = await sb.from("words").select("id,term,level,topic").order("term"); S.words = r.data || []; } catch (e) { S.words = []; } }
  async function loadTopics() {
    try {
      var r = await sb.from("topics").select("id,name").order("name"); S.topics = r.data || [];
      var sel = $("lx-fTopic"); if (sel) S.topics.forEach(function (t) { var o = document.createElement("option"); o.value = t.id; o.textContent = t.name; sel.appendChild(o); });
    } catch (e) { S.topics = []; }
  }
  async function loadStudents() { try { var r = await sb.from("user_profiles").select("id,full_name,email").eq("role", "student").order("full_name"); S.students = r.data || []; } catch (e) { S.students = []; } }
  async function loadLessons() {
    try { var r = await sb.from("lessons").select("*, lesson_students(*)").order("scheduled_date"); if (r.error) throw r.error; S.lessons = r.data || []; }
    catch (e) { S.lessons = []; toast("Lỗi tải buổi học: " + (e.message || e)); }
    renderAll();
  }
  function renderAll() { if (S.isStaff) renderCalendar(); else lxOverlayChips(); }

  /* ───── lịch lưới tháng ───── */
  function visibleLessons() {
    var ls = S.lessons.slice();
    if (S.filter === "mine") ls = ls.filter(function (l) { return l.teacher_id === S.me.id; });
    else if (S.filter === "pending") ls = ls.filter(function (l) { return l.status === "pending"; });
    else if (S.filter === "approved") ls = ls.filter(function (l) { return l.status === "approved"; });
    return ls;
  }
  function renderCalendar() {
    var grid = $("lx-grid"); if (!grid) return;
    var y = S.year, m = S.month;
    $("lx-title").textContent = "Tháng " + (m + 1) + ", " + y;
    var pend = S.lessons.filter(function (l) { return l.status === "pending"; }).length;
    var cp = $("lx-cntPending"); if (cp) cp.textContent = pend ? "(" + pend + ")" : "";

    var byDate = {};
    visibleLessons().forEach(function (l) { (byDate[l.scheduled_date] = byDate[l.scheduled_date] || []).push(l); });
    Object.keys(byDate).forEach(function (k) { byDate[k].sort(function (a, b) { return (a.start_time || "").localeCompare(b.start_time || ""); }); });

    var first = new Date(y, m, 1);
    var offset = (first.getDay() + 6) % 7;
    var dim = new Date(y, m + 1, 0).getDate();
    grid.innerHTML = ""; var tdy = todayStr();
    var i;
    for (i = 0; i < offset; i++) grid.appendChild(el('<div class="lx-cell empty"></div>'));
    for (var d = 1; d <= dim; d++) {
      (function (d) {
        var ds = ymd(y, m, d);
        var c = el('<div class="lx-cell' + (ds === tdy ? " today" : "") + (S.isStaff ? " clk" : "") + '"></div>');
        c.innerHTML = '<div class="lx-dn"><span>' + d + '</span>' + (S.isStaff ? '<span class="lx-add">＋</span>' : "") + '</div>';
        if (S.isStaff) c.addEventListener("click", function (e) { if (e.target === c || e.target.parentNode === c || e.target.classList.contains("lx-dn") || e.target.classList.contains("lx-add")) openCreate(ds); });
        var list = byDate[ds] || [];
        list.slice(0, 3).forEach(function (l) {
          var stt = STATUS[l.status] || STATUS.draft;
          var ch = el('<div class="lx-chip ' + stt.cls + '"><span class="tm">' + fmtTime(l.start_time) + '</span>' + esc(l.title) + '</div>');
          ch.title = stt.label + " · " + (l.title || "");
          ch.addEventListener("click", function (e) { e.stopPropagation(); openDetail(l.id); });
          c.appendChild(ch);
        });
        if (list.length > 3) c.appendChild(el('<div class="lx-more">+' + (list.length - 3) + ' buổi nữa</div>'));
        grid.appendChild(c);
      })(d);
    }
  }
  function shiftMonth(n) { var m = S.month + n, y = S.year; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } S.month = m; S.year = y; renderCalendar(); }

  /* ───── HỌC VIÊN: gộp chip buổi học vào lịch "Lịch học theo tháng" của report.html ─────
     Không vẽ lịch riêng. Đọc ngày từ thuộc tính title của từng ô (.cal-cell),
     chèn chip buổi học, và theo dõi mọi lần report.html vẽ lại để chèn lại. */
  function injectStudentCSS() {
    if ($("lx-css-student")) return;
    var css =
      "#cal-grid .cal-cell:not(.empty){aspect-ratio:auto;min-height:90px;justify-content:flex-start;align-items:stretch;padding:6px;gap:3px;line-height:1.2}" +
      "#cal-grid .cal-cell .cal-n{align-self:flex-start;margin-top:0}" +
      ".lx-onchips{display:flex;flex-direction:column;gap:3px;margin-top:3px}" +
      ".lx-onchips .lx-chip{cursor:pointer}";
    var st = document.createElement("style"); st.id = "lx-css-student"; st.textContent = css; document.head.appendChild(st);
  }
  function setupStudentOverlay() {
    injectStudentCSS();
    var grid = $("cal-grid");
    var panel = grid ? grid.closest(".panel") : null;
    if (panel) {
      var h = panel.querySelector("h2");
      if (h && /Lịch học theo tháng/.test(h.textContent)) h.textContent = "📅 Lịch học & buổi học";
      if (!$("lx-leg-student")) {
        panel.appendChild(el('<div class="lx-legend" id="lx-leg-student" style="margin-top:8px">' +
          '<span style="color:var(--text);font-weight:600;margin-right:2px">Buổi học:</span>' +
          '<span><i style="background:var(--a4)"></i>Chờ duyệt</span>' +
          '<span><i style="background:var(--a3)"></i>Đã duyệt</span>' +
          '<span><i style="background:var(--accent)"></i>Hoàn thành</span></div>'));
      }
    }
    if (grid && !window.__lxCalObs) {
      window.__lxCalObs = new MutationObserver(function () { lxOverlayChips(); });
      window.__lxCalObs.observe(grid, { childList: true });
    }
    lxOverlayChips();
  }
  function lxOverlayChips() {
    var grid = $("cal-grid"); if (!grid) return;
    var byDate = {};
    S.lessons.forEach(function (l) { (byDate[l.scheduled_date] = byDate[l.scheduled_date] || []).push(l); });
    Object.keys(byDate).forEach(function (k) { byDate[k].sort(function (a, b) { return (a.start_time || "").localeCompare(b.start_time || ""); }); });
    var cells = grid.querySelectorAll(".cal-cell:not(.empty)");
    Array.prototype.forEach.call(cells, function (cell) {
      var old = cell.querySelector(".lx-onchips"); if (old) old.parentNode.removeChild(old);
      var t = cell.getAttribute("title") || ""; var m = t.match(/(\d{4}-\d{2}-\d{2})/); if (!m) return;
      var list = byDate[m[1]]; if (!list || !list.length) return;
      var box = document.createElement("div"); box.className = "lx-onchips";
      list.slice(0, 3).forEach(function (l) {
        var stt = STATUS[l.status] || STATUS.draft;
        var ch = document.createElement("div"); ch.className = "lx-chip " + stt.cls;
        ch.innerHTML = '<span class="tm">' + fmtTime(l.start_time) + '</span>' + esc(l.title);
        ch.title = stt.label + " · " + (l.title || "");
        ch.addEventListener("click", function (e) { e.stopPropagation(); openDetail(l.id); });
        box.appendChild(ch);
      });
      if (list.length > 3) box.appendChild(el('<div class="lx-more">+' + (list.length - 3) + '</div>'));
      cell.appendChild(box);
    });
  }

  /* ───── tạo / sửa ───── */
  function openCreate(dateStr) {
    S.editId = null; S.pickWords = new Set(); S.pickStudents = new Set();
    $("lx-cTitle").textContent = "Tạo buổi học";
    $("lx-cSave").textContent = "Lưu buổi học (nháp)";
    $("lx-fTitle").value = ""; $("lx-fContent").value = ""; $("lx-fTime").value = "19:00"; $("lx-fDur").value = "120"; $("lx-fTopic").value = "";
    $("lx-fDate").value = dateStr || todayStr();
    $("lx-cErr").textContent = "";
    renderWordPick(""); renderStuPick(""); updatePickCnt();
    openOv("lx-ovCreate");
  }
  function renderWordPick(q) {
    var box = $("lx-wordPick"); if (!box) return;
    var ql = (q || "").toLowerCase();
    var items = S.words.filter(function (w) { return !ql || (w.term || "").toLowerCase().indexOf(ql) >= 0; }).slice(0, 300);
    box.innerHTML = '<input class="lx-psearch" placeholder="Tìm từ vựng…" value="' + esc(q || "") + '">';
    box.querySelector(".lx-psearch").addEventListener("input", function (e) { renderWordPick(e.target.value); });
    if (!S.words.length) { box.appendChild(el('<div class="lx-muted" style="padding:8px;font-size:12px">Chưa có từ vựng.</div>')); return; }
    items.forEach(function (w) {
      var row = el('<label class="lx-opt"><input type="checkbox" ' + (S.pickWords.has(w.id) ? "checked" : "") + '><span>' + esc(w.term) + '</span><span class="meta">' + esc(w.level || "") + '</span></label>');
      row.querySelector("input").addEventListener("change", function (e) { e.target.checked ? S.pickWords.add(w.id) : S.pickWords.delete(w.id); updatePickCnt(); });
      box.appendChild(row);
    });
    var sp = box.querySelector(".lx-psearch"); if (sp) { sp.focus(); sp.setSelectionRange(sp.value.length, sp.value.length); }
  }
  function renderStuPick(q) {
    var box = $("lx-stuPick"); if (!box) return;
    var ql = (q || "").toLowerCase();
    var items = S.students.filter(function (s) { return !ql || (s.full_name || "").toLowerCase().indexOf(ql) >= 0 || (s.email || "").toLowerCase().indexOf(ql) >= 0; });
    box.innerHTML = '<input class="lx-psearch" placeholder="Tìm học viên…" value="' + esc(q || "") + '">';
    box.querySelector(".lx-psearch").addEventListener("input", function (e) { renderStuPick(e.target.value); });
    if (!S.students.length) { box.appendChild(el('<div class="lx-muted" style="padding:8px;font-size:12px">Chưa có học viên.</div>')); return; }
    items.forEach(function (s) {
      var nm = s.full_name || s.email || "(không tên)";
      var row = el('<label class="lx-opt"><input type="checkbox" ' + (S.pickStudents.has(s.id) ? "checked" : "") + '><span>' + esc(nm) + '</span></label>');
      row.querySelector("input").addEventListener("change", function (e) { e.target.checked ? S.pickStudents.add(s.id) : S.pickStudents.delete(s.id); updatePickCnt(); });
      box.appendChild(row);
    });
    var sp = box.querySelector(".lx-psearch"); if (sp) { sp.focus(); sp.setSelectionRange(sp.value.length, sp.value.length); }
  }
  function updatePickCnt() { var a = $("lx-wordCnt"), b = $("lx-stuCnt"); if (a) a.textContent = "Đã chọn " + S.pickWords.size + " từ"; if (b) b.textContent = "Đã chọn " + S.pickStudents.size + " học viên"; }

  async function saveLesson() {
    var title = $("lx-fTitle").value.trim(), date = $("lx-fDate").value, time = $("lx-fTime").value;
    var content = $("lx-fContent").value.trim(), dur = parseInt($("lx-fDur").value) || 120, topic = $("lx-fTopic").value || null;
    var err = $("lx-cErr"); err.textContent = "";
    if (!title) { err.textContent = "Nhập tiêu đề buổi học."; return; }
    if (!date || !time) { err.textContent = "Chọn ngày và giờ."; return; }
    if (!content) { err.textContent = "Nhập nội dung buổi học."; return; }
    if (S.pickStudents.size === 0) { err.textContent = "Chọn ít nhất 1 học viên."; return; }
    var btn = $("lx-cSave"); btn.disabled = true; btn.textContent = "Đang lưu…";
    try {
      if (!S.editId) {
        var prof = null; try { var pr = await sb.from("user_profiles").select("full_name").eq("id", S.me.id).maybeSingle(); prof = pr.data; } catch (e) {}
        var payload = { title: title, content: content, topic_id: topic, word_ids: Array.from(S.pickWords), scheduled_date: date, start_time: time, duration_minutes: dur, teacher_id: S.me.id, teacher_name: (prof && prof.full_name) || S.me.email, status: "draft" };
        var ins = await sb.from("lessons").insert(payload).select().single(); if (ins.error) throw ins.error;
        var lesson = ins.data;
        var rows = Array.from(S.pickStudents).map(function (sid) { var s = S.students.find(function (x) { return x.id === sid; }) || {}; return { lesson_id: lesson.id, student_id: sid, student_name: s.full_name || null, student_email: s.email || null }; });
        var e2 = await sb.from("lesson_students").insert(rows); if (e2.error) throw e2.error;
        closeOv("lx-ovCreate"); toast("Đã tạo buổi học (nháp)."); await loadLessons(); openDetail(lesson.id);
      } else {
        var lid = S.editId;
        var up = await sb.from("lessons").update({ title: title, content: content, topic_id: topic, word_ids: Array.from(S.pickWords), scheduled_date: date, start_time: time, duration_minutes: dur }).eq("id", lid); if (up.error) throw up.error;
        var l = S.lessons.find(function (x) { return x.id === lid; });
        var cur = new Set((l.lesson_students || []).map(function (s) { return s.student_id; }));
        var want = S.pickStudents;
        var toAdd = Array.from(want).filter(function (x) { return !cur.has(x); });
        var toDel = (l.lesson_students || []).filter(function (s) { return !want.has(s.student_id); });
        if (toAdd.length) { var rows2 = toAdd.map(function (sid) { var s = S.students.find(function (x) { return x.id === sid; }) || {}; return { lesson_id: lid, student_id: sid, student_name: s.full_name || null, student_email: s.email || null }; }); var ea = await sb.from("lesson_students").insert(rows2); if (ea.error) throw ea.error; }
        for (var k = 0; k < toDel.length; k++) { await sb.from("lesson_students").delete().eq("id", toDel[k].id); }
        closeOv("lx-ovCreate"); toast("Đã lưu thay đổi."); S.editId = null; await loadLessons(); openDetail(lid);
      }
    } catch (e) { err.textContent = "Lỗi lưu: " + (e.message || e); }
    finally { btn.disabled = false; btn.textContent = S.editId ? "Lưu thay đổi" : "Lưu buổi học (nháp)"; }
  }

  /* ───── chi tiết (role-aware) ───── */
  async function openDetail(id) {
    var l = S.lessons.find(function (x) { return x.id === id; }); if (!l) return;
    var stt = STATUS[l.status] || STATUS.draft;
    var owner = S.isAdmin || l.teacher_id === S.me.id;
    var canDelete = S.isAdmin || (l.teacher_id === S.me.id && ["draft", "pending", "rejected"].indexOf(l.status) >= 0);
    // Sửa nội dung: Admin mọi trạng thái; GV chỉ khi Nháp hoặc Chờ duyệt
    var canEdit = S.isAdmin || (l.teacher_id === S.me.id && (l.status === "draft" || l.status === "pending"));
    $("lx-dTitle").innerHTML = esc(l.title) + ' <span class="lx-badge ' + stt.cls + '" style="margin-left:6px">' + stt.label + '</span>';
    $("lx-dSub").textContent = fmtDateVN(l.scheduled_date) + " · " + fmtTime(l.start_time) + " · " + (l.duration_minutes || 120) + " phút · GV: " + (l.teacher_name || "—");
    var body = $("lx-dBody"); body.innerHTML = '<div class="lx-muted" style="font-size:13px">Đang tải…</div>';
    openOv("lx-ovDetail");

    var words = [];
    if (l.word_ids && l.word_ids.length) { try { var r = await sb.from("words").select("id,term,phonetic,definition_vi").in("id", l.word_ids); words = r.data || []; } catch (e) {} }
    var mine = (l.lesson_students || []).find(function (s) { return s.student_id === S.me.id; });

    var h = "";
    h += '<div class="lx-sec"><h4>📘 Nội dung</h4><div style="font-size:14px;white-space:pre-wrap">' + (esc(l.content) || '<span class="lx-muted">—</span>') + '</div>';
    if (words.length) h += '<div style="margin-top:11px"><div class="lx-wl">' + words.map(function (w) { return '<span class="lx-wt" title="' + esc(w.definition_vi || "") + '"><b>' + esc(w.term) + '</b>' + (w.phonetic ? " " + esc(w.phonetic) : "") + '</span>'; }).join("") + '</div></div>';
    h += '</div>';

    h += '<div class="lx-sec"><h4>🎙️ Ghi âm mẫu (giáo viên)</h4>';
    h += l.sample_audio_url ? '<audio class="lx-au" controls src="' + esc(l.sample_audio_url) + '"></audio>' : '<div class="lx-aue">Chưa có ghi âm mẫu.</div>';
    if (owner && l.status !== "completed") h += '<div class="lx-up"><input type="file" accept="audio/*" id="lx-upSample"><button class="lx-btn lx-ghost lx-sm" id="lx-btnSample">Tải lên ghi âm mẫu</button></div>';
    h += '</div>';

    if (l.admin_note) h += '<div class="lx-sec"><h4>📝 Ghi chú của Admin</h4><div style="font-size:13px;white-space:pre-wrap">' + esc(l.admin_note) + '</div></div>';
    if (S.isAdmin && l.status === "pending") {
      h += '<div class="lx-sec"><h4>✅ Duyệt buổi học</h4><div class="lx-fld"><label>Ghi chú (tuỳ chọn)</label><textarea id="lx-adNote" placeholder="Nhận xét nội dung / ghi âm mẫu…"></textarea></div>' +
        '<div class="lx-acts" style="margin-top:0"><button class="lx-btn lx-success" id="lx-approve">Duyệt & triển khai</button><button class="lx-btn lx-danger" id="lx-reject">Từ chối</button></div></div>';
    }

    if (S.isStaff) {
      h += '<div class="lx-sec"><h4>👥 Học viên & đánh giá</h4>';
      (l.lesson_students || []).forEach(function (s) { h += staffRow(l, s); });
      if (!(l.lesson_students || []).length) h += '<div class="lx-muted" style="font-size:13px">Chưa có học viên.</div>';
      h += '</div>';
    } else if (mine) {
      h += '<div class="lx-sec"><h4>🎧 Ghi âm kết quả của bạn</h4>';
      h += mine.result_audio_url ? '<audio class="lx-au" controls src="' + esc(mine.result_audio_url) + '"></audio><div class="lx-hint">Đã nộp' + (mine.result_submitted_at ? " lúc " + new Date(mine.result_submitted_at).toLocaleString("vi-VN") : "") + '.</div>' : '<div class="lx-aue">Bạn chưa nộp ghi âm.</div>';
      if (l.status === "approved" || l.status === "completed") h += '<div class="lx-up"><input type="file" accept="audio/*" id="lx-upResult"><button class="lx-btn lx-primary lx-sm" id="lx-btnResult">Nộp ghi âm</button></div>';
      else h += '<div class="lx-hint">Có thể nộp sau khi buổi học được Admin duyệt.</div>';
      h += '</div>';
      h += '<div class="lx-sec"><h4>⭐ Đánh giá của giáo viên</h4>' + evalRO(mine) + '</div>';
    }

    if (owner || canDelete || canEdit) {
      h += '<div class="lx-acts">';
      if (owner && (l.status === "draft" || l.status === "rejected")) h += '<button class="lx-btn lx-primary" id="lx-submit">Gửi Admin duyệt</button>';
      if (canEdit) h += '<button class="lx-btn lx-ghost" id="lx-edit">Sửa nội dung</button>';
      if (owner && l.status === "approved") h += '<button class="lx-btn lx-success" id="lx-complete">Đánh dấu hoàn thành</button>';
      h += '<span class="lx-grow"></span>';
      if (canDelete) h += '<button class="lx-btn lx-danger" id="lx-delete">Xóa</button>';
      else if (owner) h += '<span class="lx-hint">Buổi đã duyệt — chỉ Admin được xóa.</span>';
      h += '</div><div class="lx-err" id="lx-dErr"></div>';
    }

    body.innerHTML = h;
    // bind sự kiện động
    bind("lx-btnSample", function () { uploadSample(l.id); });
    bind("lx-approve", function () { adminDecision(l.id, "approved"); });
    bind("lx-reject", function () { adminDecision(l.id, "rejected"); });
    bind("lx-submit", function () { submitApproval(l.id); });
    bind("lx-edit", function () { editLesson(l.id); });
    bind("lx-complete", function () { markCompleted(l.id); });
    bind("lx-delete", function () { deleteLesson(l.id); });
    bind("lx-btnResult", function () { if (mine) uploadResult(mine.id, l.id); });
    (l.lesson_students || []).forEach(function (s) { bind("lx-saveEval-" + s.id, function () { saveEval(s.id, l.id); }); });
  }
  function bind(id, fn) { var e = $(id); if (e) e.onclick = fn; }

  function staffRow(l, s) {
    var scored = s.eval_pronunciation != null || s.eval_fluency != null || s.eval_vocabulary != null || s.eval_confidence != null;
    var avg = avgScore(s);
    var h = '<div class="lx-stu"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '<div><div class="nm">' + esc(s.student_name || s.student_email || "(không tên)") + '</div><div class="em">' + esc(s.student_email || "") + '</div></div>' +
      (avg != null ? '<span class="lx-score">TB ' + avg + '/10</span>' : '') + '</div>';
    h += '<div style="margin-top:8px;font-size:12px" class="lx-muted">Ghi âm kết quả: ' + (s.result_audio_url ? '<a href="' + esc(s.result_audio_url) + '" target="_blank" style="color:var(--accent)">nghe</a>' : "chưa nộp") + '</div>';
    if (s.result_audio_url) h += '<audio class="lx-au" controls src="' + esc(s.result_audio_url) + '"></audio>';
    h += '<div class="lx-rub">' + CRITERIA.map(function (c) { return '<div class="lx-rb"><label>' + c[1] + '</label><input type="number" min="0" max="10" id="' + c[0] + '_' + s.id + '" value="' + (s[c[0]] != null ? s[c[0]] : "") + '" placeholder="0-10"></div>'; }).join("") + '</div>';
    h += '<div class="lx-fld" style="margin:9px 0 0"><textarea id="lx-cmt_' + s.id + '" placeholder="Nhận xét cho học viên…">' + esc(s.eval_comment || "") + '</textarea></div>';
    h += '<div class="lx-acts" style="margin-top:9px"><button class="lx-btn lx-success lx-sm" id="lx-saveEval-' + s.id + '">' + (scored ? "Cập nhật đánh giá" : "Lưu đánh giá") + '</button>' + (s.evaluated_at ? '<span class="lx-ok">Đã chấm ' + new Date(s.evaluated_at).toLocaleDateString("vi-VN") + '</span>' : "") + '</div>';
    h += '</div>';
    return h;
  }
  function evalRO(s) {
    var any = s.eval_pronunciation != null || s.eval_fluency != null || s.eval_vocabulary != null || s.eval_confidence != null || s.eval_comment;
    if (!any) return '<div class="lx-muted" style="font-size:13px">Chưa có đánh giá.</div>';
    var avg = avgScore(s);
    var h = '<div class="lx-rub">' + CRITERIA.map(function (c) { return '<div class="lx-rb"><label>' + c[1] + '</label><b>' + (s[c[0]] != null ? s[c[0]] + "/10" : "—") + '</b></div>'; }).join("") + '</div>';
    if (avg != null) h += '<div style="margin-top:9px"><span class="lx-score">Trung bình ' + avg + '/10</span></div>';
    if (s.eval_comment) h += '<div style="margin-top:9px;font-size:13px;white-space:pre-wrap"><span class="lx-muted">Nhận xét:</span> ' + esc(s.eval_comment) + '</div>';
    return h;
  }
  function avgScore(s) { var v = [s.eval_pronunciation, s.eval_fluency, s.eval_vocabulary, s.eval_confidence].filter(function (x) { return x != null; }); if (!v.length) return null; return Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length * 10) / 10; }

  /* ───── hành động ───── */
  async function uploadSample(lessonId) {
    var f = $("lx-upSample").files[0]; if (!f) { toast("Chọn file ghi âm."); return; }
    try {
      toast("Đang tải ghi âm mẫu…");
      var ext = (f.name.split(".").pop() || "webm").toLowerCase();
      var path = "lessons/sample/" + lessonId + "-" + Date.now() + "." + ext;
      var u = await sb.storage.from(BUCKET).upload(path, f, { cacheControl: "3600", upsert: true }); if (u.error) throw u.error;
      var pub = sb.storage.from(BUCKET).getPublicUrl(path);
      var up = await sb.from("lessons").update({ sample_audio_url: pub.data.publicUrl }).eq("id", lessonId); if (up.error) throw up.error;
      toast("Đã tải ghi âm mẫu."); await loadLessons(); openDetail(lessonId);
    } catch (e) { toast("Lỗi tải lên: " + (e.message || e)); }
  }
  async function submitApproval(lessonId) {
    var l = S.lessons.find(function (x) { return x.id === lessonId; });
    if (l && !l.sample_audio_url) { if (!confirm("Chưa có ghi âm mẫu. Vẫn gửi duyệt?")) return; }
    try { var up = await sb.from("lessons").update({ status: "pending", admin_note: null }).eq("id", lessonId); if (up.error) throw up.error; toast("Đã gửi Admin duyệt."); await loadLessons(); openDetail(lessonId); }
    catch (e) { var el2 = $("lx-dErr"); if (el2) el2.textContent = "Lỗi: " + (e.message || e); else toast("Lỗi: " + (e.message || e)); }
  }
  async function adminDecision(lessonId, decision) {
    var note = ($("lx-adNote") && $("lx-adNote").value.trim()) || null;
    try { var up = await sb.from("lessons").update({ status: decision, admin_note: note }).eq("id", lessonId); if (up.error) throw up.error; toast(decision === "approved" ? "Đã duyệt & triển khai." : "Đã từ chối buổi học."); await loadLessons(); openDetail(lessonId); }
    catch (e) { toast("Lỗi: " + (e.message || e)); }
  }
  async function saveEval(lsId, lessonId) {
    var upd = { eval_comment: ($("lx-cmt_" + lsId).value.trim() || null) };
    CRITERIA.forEach(function (c) { var v = $(c[0] + "_" + lsId).value; upd[c[0]] = v === "" ? null : Math.max(0, Math.min(10, parseInt(v) || 0)); });
    try { var up = await sb.from("lesson_students").update(upd).eq("id", lsId); if (up.error) throw up.error; toast("Đã lưu đánh giá."); await loadLessons(); openDetail(lessonId); }
    catch (e) { toast("Lỗi lưu đánh giá: " + (e.message || e)); }
  }
  async function uploadResult(lsId, lessonId) {
    var f = $("lx-upResult").files[0]; if (!f) { toast("Chọn file ghi âm."); return; }
    try {
      toast("Đang nộp ghi âm…");
      var ext = (f.name.split(".").pop() || "webm").toLowerCase();
      var path = "lessons/result/" + lessonId + "-" + S.me.id + "-" + Date.now() + "." + ext;
      var u = await sb.storage.from(BUCKET).upload(path, f, { cacheControl: "3600", upsert: true }); if (u.error) throw u.error;
      var pub = sb.storage.from(BUCKET).getPublicUrl(path);
      var up = await sb.from("lesson_students").update({ result_audio_url: pub.data.publicUrl, result_submitted_at: new Date().toISOString() }).eq("id", lsId); if (up.error) throw up.error;
      toast("Đã nộp ghi âm kết quả."); await loadLessons(); openDetail(lessonId);
    } catch (e) { toast("Lỗi nộp: " + (e.message || e)); }
  }
  async function markCompleted(lessonId) {
    if (!confirm("Đánh dấu buổi học đã hoàn thành?")) return;
    try { var up = await sb.from("lessons").update({ status: "completed" }).eq("id", lessonId); if (up.error) throw up.error; toast("Đã hoàn thành buổi học."); await loadLessons(); openDetail(lessonId); }
    catch (e) { toast("Lỗi: " + (e.message || e)); }
  }
  function editLesson(lessonId) {
    var l = S.lessons.find(function (x) { return x.id === lessonId; }); if (!l) return;
    S.editId = lessonId; S.pickWords = new Set(l.word_ids || []); S.pickStudents = new Set((l.lesson_students || []).map(function (s) { return s.student_id; }));
    $("lx-cTitle").textContent = "Sửa buổi học"; $("lx-cSave").textContent = "Lưu thay đổi";
    $("lx-fTitle").value = l.title || ""; $("lx-fContent").value = l.content || ""; $("lx-fDate").value = l.scheduled_date; $("lx-fTime").value = fmtTime(l.start_time); $("lx-fDur").value = l.duration_minutes || 120; $("lx-fTopic").value = l.topic_id || "";
    $("lx-cErr").textContent = ""; renderWordPick(""); renderStuPick(""); updatePickCnt();
    closeOv("lx-ovDetail"); openOv("lx-ovCreate");
  }
  async function deleteLesson(lessonId) {
    if (!confirm("Xóa buổi học này? Mọi đánh giá & ghi âm liên quan sẽ bị gỡ.")) return;
    try { var dl = await sb.from("lessons").delete().eq("id", lessonId); if (dl.error) throw dl.error; closeOv("lx-ovDetail"); toast("Đã xóa buổi học."); await loadLessons(); }
    catch (e) { var el2 = $("lx-dErr"); if (el2) el2.textContent = "Lỗi xóa: " + (e.message || e); else toast("Lỗi: " + (e.message || e)); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
