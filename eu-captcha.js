/* eu-captcha.js — Cloudflare Turnstile cho đăng nhập / đăng ký / quên mật khẩu (01/11/2026)
 * Nạp NGAY SAU thẻ supabase-js. Tự gắn captchaToken vào 3 hàm của supabase-js:
 *   signUp · signInWithPassword · resetPasswordForEmail
 * → các trang KHÔNG phải sửa chỗ gọi. Khi Supabase Auth bật "Enable Captcha protection"
 *   (nhà cung cấp Turnstile, dán Secret key) thì mọi lệnh trên bắt buộc phải có token.
 * Widget chế độ "interaction-only": người thật thường không phải bấm gì, chỉ hiện ô tick khi
 * Cloudflare nghi ngờ. Token dùng 1 lần → mỗi lệnh lấy token mới.
 */
(function () {
  'use strict';
  var SITEKEY = '0x4AAAAAAFu-rR0h4cqW9ioK';
  var API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var sb = window.supabase;
  if (!sb || !sb.AuthClient || window.__euCaptcha) return;
  window.__euCaptcha = true;

  var loading = null;
  function loadApi() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = API; s.async = true;
      s.onload = function () { window.turnstile ? res(window.turnstile) : rej(new Error('turnstile')); };
      s.onerror = function () { loading = null; rej(new Error('Không tải được Cloudflare Turnstile')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function overlay() {
    var o = document.getElementById('eu-cap-ov');
    if (o) return o;
    o = document.createElement('div');
    o.id = 'eu-cap-ov';
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;' +
      'background:rgba(8,12,20,.55);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    o.innerHTML = '<div style="background:#151b26;color:#e8edf5;border:1px solid #2a3446;border-radius:14px;padding:18px 20px;' +
      'max-width:340px;width:calc(100% - 32px);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.4)">' +
      '<div style="font-weight:600;margin-bottom:10px">🔒 Đang xác minh bạn không phải robot…</div>' +
      '<div id="eu-cap-box" style="display:flex;justify-content:center;min-height:0"></div>' +
      '<div id="eu-cap-msg" style="margin-top:8px;font-size:12px;color:#9aa6b8">Thường chỉ mất 1–2 giây.</div></div>';
    document.body.appendChild(o);
    return o;
  }

  function getToken() {
    return loadApi().then(function (ts) {
      return new Promise(function (res, rej) {
        var o = overlay(), box = o.querySelector('#eu-cap-box');
        box.innerHTML = '';
        o.style.display = 'flex';
        var done = false, wid = null;
        function finish(fn, v) {
          if (done) return; done = true; clearTimeout(t);
          o.style.display = 'none';
          try { if (wid !== null) ts.remove(wid); } catch (e) { console.warn('[captcha] remove', e); }
          fn(v);
        }
        var t = setTimeout(function () { finish(rej, new Error('Hết thời gian xác minh, vui lòng thử lại.')); }, 90000);
        wid = ts.render(box, {
          sitekey: SITEKEY,
          appearance: 'interaction-only',
          language: 'vi',
          callback: function (tok) { finish(res, tok); },
          'error-callback': function () { finish(rej, new Error('Xác minh chống robot thất bại, vui lòng thử lại.')); },
          'expired-callback': function () { finish(rej, new Error('Mã xác minh đã hết hạn, vui lòng thử lại.')); }
        });
      });
    });
  }
  window.euCaptchaToken = getToken;

  function fail(e) {
    var err = new Error((e && e.message) || 'Không xác minh được, vui lòng thử lại.');
    return { data: { user: null, session: null }, error: err };
  }

  var P = sb.AuthClient.prototype;
  ['signUp', 'signInWithPassword'].forEach(function (m) {
    var orig = P[m];
    if (typeof orig !== 'function') return;
    P[m] = function (cred) {
      var self = this;
      return getToken().then(function (tok) {
        var c = Object.assign({}, cred || {});
        c.options = Object.assign({}, (cred && cred.options) || {}, { captchaToken: tok });
        return orig.call(self, c);
      }, fail);
    };
  });
  var origReset = P.resetPasswordForEmail;
  if (typeof origReset === 'function') {
    P.resetPasswordForEmail = function (email, opts) {
      var self = this;
      return getToken().then(function (tok) {
        return origReset.call(self, email, Object.assign({}, opts || {}, { captchaToken: tok }));
      }, function (e) { return { data: null, error: fail(e).error }; });
    };
  }
})();
