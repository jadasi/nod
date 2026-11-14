// Theme: follows the system by default; the HUD toggle cycles system -> light -> dark and is
// remembered in this browser. Display only. Loaded as a classic script in <head> so the page
// never flashes the wrong theme.
(function () {
  var KEY = 'nod.theme';
  var MODES = ['system', 'light', 'dark'];
  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return MODES.indexOf(v) >= 0 ? v : 'system';
    } catch {
      return 'system';
    }
  }
  function apply(mode) {
    var root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    var btn = document.getElementById('theme');
    if (btn) {
      btn.dataset.mode = mode;
      btn.setAttribute('aria-label', 'Theme: ' + mode + '. Change theme');
      btn.title = 'Theme: ' + mode;
    }
  }
  apply(stored());
  document.addEventListener('DOMContentLoaded', function () {
    apply(stored());
    var btn = document.getElementById('theme');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = MODES[(MODES.indexOf(stored()) + 1) % MODES.length];
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode: still switch for this page */
      }
      apply(next);
    });
  });
})();
