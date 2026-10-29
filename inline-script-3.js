/* Smooth dismiss/switch helpers for popups & full-page modals */
        window.uiClose = function (el) {
            el = typeof el === 'string' ? document.getElementById(el) : el;
            if (!el || el.dataset.uiClosing) return;
            el.dataset.uiClosing = '1';
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.remove(); return; }
            el.classList.add('is-closing');
            setTimeout(function () { el.remove(); }, 210);
        };
        window.uiPageOpen = function (el) {
            if (!el) return;
            el.style.display = 'flex';
            el.classList.remove('ui-page-out');
            el.classList.remove('ui-page-in');
            void el.offsetWidth;
            el.classList.add('ui-page-in');
        };
        window.uiPageClose = function (el, after) {
            if (!el) { if (after) after(); return; }
            var finish = function () { el.style.display = 'none'; el.classList.remove('ui-page-out'); if (after) after(); };
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                el.classList.remove('ui-page-in', 'ui-page-out'); finish(); return;
            }
            el.classList.remove('ui-page-in');
            el.classList.add('ui-page-out');
            setTimeout(function () { if (el.classList.contains('ui-page-out')) finish(); }, 230);
        };