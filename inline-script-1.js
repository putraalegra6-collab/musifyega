(function(){
            try {
                var t = localStorage.getItem('musifyrik_theme') || 'lime';
                var migratedTheme = localStorage.getItem('musifyrik_theme_refresh_v1') === '1';
                // The previous default was Rose; use the new reference palette once for legacy installs.
                if (!migratedTheme && t === 'rose') t = 'lime';
                document.documentElement.setAttribute('data-theme', t);
            } catch(e) { document.documentElement.setAttribute('data-theme', 'lime'); }
        })();