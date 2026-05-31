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

    // ─── Mobile nav (drawer + backdrop; aria-expanded + Escape-to-close) ──────
    function setNav(open) {
      var rail = document.querySelector('.rail');
      if (rail) rail.classList.toggle('open', open);
      var toggle = document.querySelector('.nav-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      // Modal-drawer focus containment: while open, make the page content inert
      // (out of tab order + a11y tree) and move focus into the drawer; on close,
      // restore content and return focus to the toggle.
      var main = document.querySelector('.content');
      if (main) main.inert = open;
      if (open) {
        var first = rail && rail.querySelector('a');
        if (first) first.focus();
      } else if (toggle) {
        toggle.focus();
      }
    }
    document.querySelectorAll('[data-action="nav"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var rail = document.querySelector('.rail');
        setNav(!(rail && rail.classList.contains('open')));
      });
    });
    // Selecting a TOC link closes the drawer (so the now-active content isn't
    // left inert behind the panel) before the anchor navigation scrolls.
    var drawerRail = document.querySelector('.rail');
    if (drawerRail) {
      drawerRail.querySelectorAll('a').forEach(function(a) {
        a.addEventListener('click', function() {
          if (drawerRail.classList.contains('open')) setNav(false);
        });
      });
    }
    document.addEventListener('keydown', function(e) {
      var rail = document.querySelector('.rail');
      if (!rail || !rail.classList.contains('open')) return;
      if (e.key === 'Escape') { setNav(false); return; } // setNav restores focus to the toggle
      // Trap Tab within the open drawer (modal pattern).
      if (e.key !== 'Tab') return;
      var f = rail.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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

    // ─── Tabs (ARIA pattern: aria-selected + roving tabindex + arrow keys) ────
    function activateTab(group, btn, focus) {
      var idx = btn.getAttribute('data-tab');
      group.querySelectorAll('.tab-btn').forEach(function(b) {
        var on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.setAttribute('tabindex', on ? '0' : '-1');
      });
      group.querySelectorAll('.tabpane').forEach(function(pane) {
        pane.classList.toggle('active', pane.getAttribute('data-tab') === idx);
      });
      if (focus) btn.focus();
    }
    document.querySelectorAll('.tabs').forEach(function(group) {
      var btns = [].slice.call(group.querySelectorAll('.tab-btn'));
      btns.forEach(function(btn, i) {
        btn.addEventListener('click', function() { activateTab(group, btn, false); });
        btn.addEventListener('keydown', function(e) {
          var ni = -1;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') ni = (i + 1) % btns.length;
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ni = (i - 1 + btns.length) % btns.length;
          else if (e.key === 'Home') ni = 0;
          else if (e.key === 'End') ni = btns.length - 1;
          if (ni >= 0) { e.preventDefault(); activateTab(group, btns[ni], true); }
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
