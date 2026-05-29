/**
 * THEME_INIT_JS — tiny blocking script for <head>.
 *
 * Reads saved theme or OS preference and sets [data-theme] on <html> before
 * first paint, eliminating flash-of-unstyled-theme (FOUC) for dark-mode users.
 * Must run synchronously in <head>; no toggle logic here.
 */
export const THEME_INIT_JS: string =
  '(function(){try{var t=localStorage.getItem(\'guide-theme\');' +
  'if(!t&&window.matchMedia&&matchMedia(\'(prefers-color-scheme: dark)\').matches)t=\'dark\';' +
  'if(t)document.documentElement.setAttribute(\'data-theme\',t);}catch(e){}})();'

/**
 * CHROME_JS — self-contained IIFE for guide pages (end-of-body).
 *
 * Dark mode: keyed on [data-theme="dark"] on <html>, matching dashboard-theme.css.
 * Initial theme application is handled by THEME_INIT_JS in <head>.
 *
 * Behaviours:
 *  - theme     : [data-action=theme] toggles current data-theme + persists to localStorage
 *  - mobile nav: [data-action=nav] toggles .open on .rail
 *  - copy      : wrap every <pre> in <div class="code">, prepend <button class="copy-btn">Copy</button>
 *  - tabs      : click .tab-btn → activate matching .tabpane within same .tabs group
 *  - filter-table: .filter-input input → hide non-matching <tbody tr> in enclosing .filter-table
 *  - scrollspy : IntersectionObserver on h2[id],h3[id]; marks .toc a[href="#id"] active
 */
export const CHROME_JS: string = /* js */ `(function(){
  var LS_KEY = 'guide-theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
  }

  document.addEventListener('DOMContentLoaded', function() {
    // ─── Theme toggle ────────────────────────────────────────────────────────
    document.querySelectorAll('[data-action="theme"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem(LS_KEY, next); } catch(e) {}
      });
    });

    // ─── Mobile nav ──────────────────────────────────────────────────────────
    document.querySelectorAll('[data-action="nav"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var rail = document.querySelector('.rail');
        if (rail) rail.classList.toggle('open');
      });
    });

    // ─── Copy buttons ─────────────────────────────────────────────────────────
    document.querySelectorAll('pre').forEach(function(pre) {
      if (!pre.parentNode) return;
      var wrapper = document.createElement('div');
      wrapper.className = 'code';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function() {
        var text = pre.textContent || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() {
            btn.textContent = 'Copied';
            setTimeout(function() { btn.textContent = 'Copy'; }, 1200);
          }, function() {
            btn.textContent = 'Copy';
          });
        }
      });
      wrapper.insertBefore(btn, pre);
    });

    // ─── Tabs ─────────────────────────────────────────────────────────────────
    document.querySelectorAll('.tabs').forEach(function(group) {
      group.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var idx = btn.getAttribute('data-tab');
          group.querySelectorAll('.tab-btn').forEach(function(b) {
            b.classList.toggle('active', b === btn);
          });
          group.querySelectorAll('.tabpane').forEach(function(pane) {
            pane.classList.toggle('active', pane.getAttribute('data-tab') === idx);
          });
        });
      });
    });

    // ─── Filter tables ────────────────────────────────────────────────────────
    document.querySelectorAll('.filter-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var q = input.value.toLowerCase();
        var container = input.closest('.filter-table');
        if (!container) return;
        container.querySelectorAll('tbody tr').forEach(function(row) {
          var text = (row.textContent || '').toLowerCase();
          row.style.display = text.includes(q) ? '' : 'none';
        });
      });
    });

    // ─── Scrollspy ────────────────────────────────────────────────────────────
    if (typeof IntersectionObserver === 'undefined') return;
    var headings = document.querySelectorAll('h2[id],h3[id]');
    if (!headings.length) return;
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.getAttribute('id');
        document.querySelectorAll('.toc a').forEach(function(a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + id);
        });
      });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
    headings.forEach(function(h) { observer.observe(h); });
  });
})();`
