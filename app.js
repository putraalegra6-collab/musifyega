var deferredInstallPrompt=null;
var isStandaloneApp=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;
var isIOSDevice=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;

if (isStandaloneApp) {
    try { localStorage.setItem('pwa_installed', 'true'); } catch(e){}
} else if (localStorage.getItem('pwa_installed') === 'true') {
    isStandaloneApp = true;
}

function updateOnlineOfflineStatus() {
    var banner = document.getElementById('pwa-offline-banner');
    if (!navigator.onLine) {
        if (banner) banner.classList.remove('hidden');
        showToast('Mode Offline PWA Aktif — Memutar lagu & lirik tersimpan');
    } else {
        if (banner) banner.classList.add('hidden');
    }
}

function clearPwaCache() {
    if ('caches' in window) {
        caches.keys().then(function(names) {
            names.forEach(function(name) {
                if (name && String(name).indexOf('musifyega-audio') === 0) return;
                caches.delete(name);
            });
        });
    }
    localStorage.removeItem('pwa_lyrics_cache');
    localStorage.removeItem('pwa_audio_cache');
    if (typeof lyricsCache !== 'undefined') lyricsCache = {};
    if (typeof audioUrlCache !== 'undefined') audioUrlCache = {};
    showToast('Cache offline PWA berhasil dibersihkan');
    if (typeof Profile !== 'undefined' && Profile.render) Profile.render();
}

window.addEventListener('online', function() {
    updateOnlineOfflineStatus();
    showToast('Koneksi internet terhubung kembali (Online)');
    if (typeof backfillOfflineAudio === 'function') backfillOfflineAudio();
});
window.addEventListener('offline', function() {
    updateOnlineOfflineStatus();
});
document.addEventListener('DOMContentLoaded', updateOnlineOfflineStatus);

window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    deferredInstallPrompt=e;
    var btn=document.getElementById('pwa-install-btn');
    if(btn&&!isStandaloneApp)btn.classList.remove('hidden');
});
window.addEventListener('appinstalled',function(){
    deferredInstallPrompt=null;
    try { localStorage.setItem('pwa_installed', 'true'); } catch(e){}
    isStandaloneApp = true;
    var btn=document.getElementById('pwa-install-btn');
    if(btn)btn.classList.add('hidden');
    showToast('MusifyEga berhasil diinstall!');
});

function isPwaInstalled() {
    return isStandaloneApp || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true || localStorage.getItem('pwa_installed') === 'true';
}

function showPwaRequiredModal() {
    var existing = document.getElementById('pwa-required-modal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'pwa-required-modal';
    modal.className = 'fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in';
    modal.onclick = function(e){ if(e.target === modal) modal.remove(); };
    modal.innerHTML = '<div class="bg-[#161514] border border-white/15 rounded-2xl p-5 max-w-xs w-full text-center space-y-3 shadow-2xl relative" onclick="event.stopPropagation()">'+
        '<div class="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 text-white flex items-center justify-center mx-auto shadow-md">'+
            '<i data-lucide="smartphone" class="w-6 h-6 text-white"></i>'+
        '</div>'+
        '<div class="space-y-1">'+
            '<h3 class="text-white font-bold text-sm">Install Aplikasi Terlebih Dahulu</h3>'+
            '<p class="text-white/60 text-xs leading-relaxed">'+
                'Fitur Mode Offline khusus untuk aplikasi PWA. Silakan install MusifyEga ke layar utama terlebih dahulu.'+
            '</p>'+
        '</div>'+
        '<div class="space-y-2 pt-1">'+
            '<button onclick="document.getElementById(\'pwa-required-modal\').remove(); installPWA();" class="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-gray-200 text-black font-bold text-xs shadow-md active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer">'+
                '<i data-lucide="download" class="w-4 h-4"></i>'+
                '<span>Install Aplikasi</span>'+
            '</button>'+
            '<button onclick="document.getElementById(\'pwa-required-modal\').remove();" class="w-full py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-semibold text-xs active:scale-95 transition cursor-pointer">'+
                'Tutup'+
            '</button>'+
        '</div>'+
    '</div>';
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();
}

function installPWA(){
    if(deferredInstallPrompt){
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function(choice){
            if(choice.outcome==='accepted') {
                try { localStorage.setItem('pwa_installed', 'true'); } catch(e){}
                isStandaloneApp = true;
                showToast('Menginstall MusifyEga...');
            }
            deferredInstallPrompt=null;
            var btn=document.getElementById('pwa-install-btn');
            if(btn)btn.classList.add('hidden');
        });
    }else if(isIOSDevice){
        showToast('Tap ikon Bagikan lalu pilih "Add to Home Screen"');
    }else{
        showToast('Petunjuk: Buka menu browser lalu pilih "Tambah ke Layar Utama" / "Install Aplikasi"');
    }
}

var OFFLINE_AUDIO_CACHE = 'musifyega-audio-v1';
var OFFLINE_DB_NAME = 'musifyega-offline';
var OFFLINE_DB_VER = 1;
var OFFLINE_STORE = 'audio';
var offlineDownloadLock = {};
var offlineBackfillRunning = false;

function getOfflineSongs() {
    try {
        var data = localStorage.getItem('pwa_offline_tracks');
        return data ? JSON.parse(data) : [];
    } catch(e) {
        return [];
    }
}

function persistOfflineSongs(list) {
    try { localStorage.setItem('pwa_offline_tracks', JSON.stringify(list || [])); } catch(e){}
}

function isOfflineSong(track) {
    if (!track) return false;
    var vid = track.videoId || track.id;
    var list = getOfflineSongs();
    return list.some(function(s) {
        return (s.videoId === vid || s.id === vid);
    });
}

function offlineAudioRequest(vid) {
    return new Request('/offline-audio/' + encodeURIComponent(vid), { mode: 'same-origin' });
}

function looksLikeAudioBlob(blob) {
    if (!blob || blob.size < 1000) return false;
    var t = (blob.type || '').toLowerCase();
    if (!t) return true;
    if (t.indexOf('json') !== -1 || t.indexOf('text/html') !== -1 || t.indexOf('text/plain') !== -1) return false;
    return true;
}

function openOfflineDb() {
    return new Promise(function(resolve, reject) {
        if (!window.indexedDB) return reject(new Error('no idb'));
        var req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VER);
        req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
                db.createObjectStore(OFFLINE_STORE);
            }
        };
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function blobToArrayBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function(resolve, reject) {
        var fr = new FileReader();
        fr.onload = function() { resolve(fr.result); };
        fr.onerror = function() { reject(fr.error); };
        fr.readAsArrayBuffer(blob);
    });
}

function idbPutAudio(vid, blob, mime) {
    return blobToArrayBuffer(blob).then(function(buf) {
        return openOfflineDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(OFFLINE_STORE, 'readwrite');
                tx.objectStore(OFFLINE_STORE).put({
                    buf: buf,
                    mime: mime || blob.type || 'audio/mpeg',
                    size: blob.size,
                    savedAt: Date.now()
                }, vid);
                tx.oncomplete = function() { resolve(true); };
                tx.onerror = function() { reject(tx.error); };
            });
        });
    });
}

function idbGetAudio(vid) {
    return openOfflineDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(OFFLINE_STORE, 'readonly');
            var req = tx.objectStore(OFFLINE_STORE).get(vid);
            req.onsuccess = function() {
                var rec = req.result;
                if (!rec) return resolve(null);
                if (rec instanceof Blob) {
                    return resolve({ blob: rec, mime: rec.type });
                }
                if (rec.blob && (rec.blob instanceof Blob || typeof rec.blob.slice === 'function')) {
                    return resolve({ blob: rec.blob, mime: rec.mime || rec.blob.type });
                }
                if (rec.buf) {
                    var m = rec.mime || 'audio/mpeg';
                    return resolve({ blob: new Blob([rec.buf], { type: m }), mime: m });
                }
                if (rec instanceof ArrayBuffer) {
                    return resolve({ blob: new Blob([rec], { type: 'audio/mpeg' }), mime: 'audio/mpeg' });
                }
                resolve(null);
            };
            req.onerror = function() { reject(req.error); };
        });
    });
}

function idbDeleteAudio(vid) {
    return openOfflineDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(OFFLINE_STORE, 'readwrite');
            tx.objectStore(OFFLINE_STORE).delete(vid);
            tx.oncomplete = function() { resolve(true); };
            tx.onerror = function() { reject(tx.error); };
        });
    });
}

async function storeOfflineAudio(vid, blob) {
    var mime = blob.type || 'audio/mpeg';
    var cacheOk = false;
    var idbOk = false;
    try {
        if ('caches' in window) {
            var cache = await caches.open(OFFLINE_AUDIO_CACHE);
            var res = new Response(blob, {
                status: 200,
                headers: {
                    'Content-Type': mime,
                    'Content-Length': String(blob.size),
                    'Cache-Control': 'immutable'
                }
            });
            await cache.put(offlineAudioRequest(vid), res);
            cacheOk = true;
        }
    } catch (e) {}
    try {
        await idbPutAudio(vid, blob, mime);
        idbOk = true;
    } catch (e) {
        if (!cacheOk) throw e;
    }
    if (!cacheOk && !idbOk) throw new Error('store failed');
    return true;
}

async function getOfflineAudioBlob(vid) {
    if (!vid) return null;
    try {
        var rec = await idbGetAudio(vid);
        if (rec) {
            var b = rec.blob || (looksLikeAudioBlob(rec) ? rec : null);
            if (b && looksLikeAudioBlob(b)) return b;
        }
    } catch (e) {}
    try {
        if ('caches' in window) {
            var cache = await caches.open(OFFLINE_AUDIO_CACHE);
            var match = await cache.match(offlineAudioRequest(vid));
            if (!match) {
                match = await cache.match('/offline-audio/' + encodeURIComponent(vid));
            }
            if (match) {
                var blob = await match.blob();
                if (looksLikeAudioBlob(blob)) {
                    try { idbPutAudio(vid, blob, blob.type || 'audio/mpeg'); } catch(e){}
                    return blob;
                }
            }
        }
    } catch (e) {}
    return null;
}

async function deleteOfflineAudio(vid) {
    if (!vid) return;
    try {
        if ('caches' in window) {
            var cache = await caches.open(OFFLINE_AUDIO_CACHE);
            await cache.delete(offlineAudioRequest(vid));
        }
    } catch (e) {}
    try { await idbDeleteAudio(vid); } catch (e) {}
}

function markOfflineAudioReady(vid, ready) {
    var list = getOfflineSongs();
    var changed = false;
    for (var i = 0; i < list.length; i++) {
        if ((list[i].videoId === vid || list[i].id === vid) && list[i].audioReady !== ready) {
            list[i].audioReady = ready;
            changed = true;
        }
    }
    if (changed) persistOfflineSongs(list);
}

function rerenderOfflineIfOpen() {
    if (typeof OfflineView !== 'undefined' && typeof S !== 'undefined' && S.at === 'offline') OfflineView.render();
}

async function resolveTrackAudioUrl(track) {
    var vid = track.videoId || track.id;
    if (typeof audioUrlCache !== 'undefined' && audioUrlCache[vid]) return audioUrlCache[vid];
    var ytUrl = track.ytUrl || ('https://youtube.com/watch?v=' + vid);
    var r = await fetch(API.ytplay, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ytUrl })
    });
    var d = await r.json();
    if (d && d.result && d.result.download && d.result.download.audio) {
        var url = d.result.download.audio;
        if (typeof audioUrlCache !== 'undefined') {
            audioUrlCache[vid] = url;
            if (typeof savePwaCaches === 'function') savePwaCaches();
        }
        return url;
    }
    return null;
}

async function downloadAndStoreOfflineAudio(vid, audioUrl) {
    var urls = ['/api/proxy-audio?url=' + encodeURIComponent(audioUrl)];
    if (audioUrl) urls.push(audioUrl);
    var lastErr = null;
    for (var i = 0; i < urls.length; i++) {
        try {
            var r = await fetch(urls[i]);
            if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
            var blob = await r.blob();
            if (!looksLikeAudioBlob(blob)) { lastErr = new Error('not audio'); continue; }
            await storeOfflineAudio(vid, blob);
            return true;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('download failed');
}

async function ensureOfflineAudio(track, knownUrl) {
    if (!track) return false;
    var vid = track.videoId || track.id;
    if (!vid) return false;
    var existing = await getOfflineAudioBlob(vid);
    if (existing && looksLikeAudioBlob(existing)) {
        markOfflineAudioReady(vid, true);
        return true;
    }
    if (!navigator.onLine) return false;
    var audioUrl = knownUrl || await resolveTrackAudioUrl(track);
    if (!audioUrl) return false;
    await downloadAndStoreOfflineAudio(vid, audioUrl);
    markOfflineAudioReady(vid, true);
    return true;
}

async function refreshOfflineAudioFlags() {
    var list = getOfflineSongs();
    if (!list.length) return;
    var changed = false;
    for (var i = 0; i < list.length; i++) {
        var vid = list[i].videoId || list[i].id;
        var blob = null;
        try { blob = await getOfflineAudioBlob(vid); } catch (e) {}
        var ready = !!(blob && looksLikeAudioBlob(blob));
        if (list[i].audioReady !== ready) {
            list[i].audioReady = ready;
            changed = true;
        }
    }
    if (changed) {
        persistOfflineSongs(list);
        rerenderOfflineIfOpen();
    }
}

async function backfillOfflineAudio() {
    if (offlineBackfillRunning) return;
    offlineBackfillRunning = true;
    try {
        await refreshOfflineAudioFlags();
        if (!navigator.onLine) return;
        var list = getOfflineSongs();
        var pending = 0;
        for (var p = 0; p < list.length; p++) {
            if (!list[p].audioReady) pending++;
        }
        if (pending > 0) {
            showToast('Mengunduh ' + pending + ' lagu offline ke perangkat...');
        }
        var downloaded = 0;
        for (var i = 0; i < list.length; i++) {
            if (!navigator.onLine) break;
            var s = list[i];
            var vid = s.videoId || s.id;
            if (s.audioReady) continue;
            if (offlineDownloadLock[vid]) continue;
            offlineDownloadLock[vid] = true;
            try {
                var ok = await ensureOfflineAudio(s);
                if (ok) downloaded++;
            } catch (e) {}
            delete offlineDownloadLock[vid];
        }
        if (downloaded > 0) {
            showToast(downloaded + ' lagu offline siap diputar tanpa internet');
            rerenderOfflineIfOpen();
        }
    } finally {
        offlineBackfillRunning = false;
    }
}

function removeOfflineTrack(track) {
    if (!track) return false;
    var vid = track.videoId || track.id;
    if (!vid) return false;
    var list = getOfflineSongs();
    var existingIndex = list.findIndex(function(s) { return (s.videoId === vid || s.id === vid); });
    if (existingIndex === -1) return false;
    list.splice(existingIndex, 1);
    persistOfflineSongs(list);
    deleteOfflineAudio(vid);
    showToast('Lagu dihapus dari Mode Offline PWA');
    updateOfflineButtons();
    rerenderOfflineIfOpen();
    return true;
}

async function saveTrackForOffline(track) {
    if (!track) return false;
    var vid = track.videoId || track.id;
    if (!vid) return false;
    var list = getOfflineSongs();
    var existingIndex = list.findIndex(function(s) { return (s.videoId === vid || s.id === vid); });
    if (existingIndex !== -1) {
        return removeOfflineTrack(track);
    }
    if (!navigator.onLine) {
        showToast('Perlu koneksi internet untuk mengunduh lagu ke Offline');
        return false;
    }
    if (offlineDownloadLock[vid]) {
        showToast('Lagu ini sedang diunduh...');
        return false;
    }
    showToast('Menyimpan lagu ke Mode Offline...');
    var songObj = {
        id: vid,
        videoId: vid,
        title: track.title || 'Lagu',
        artist: track.artist || 'Unknown Artist',
        cover: track.cover || (typeof toHDCover==='function'?toHDCover('', vid):''),
        artistId: track.artistId || '',
        ytUrl: track.ytUrl || ('https://youtube.com/watch?v=' + vid),
        savedAt: Date.now(),
        audioReady: false
    };
    list.unshift(songObj);
    persistOfflineSongs(list);
    updateOfflineButtons();
    rerenderOfflineIfOpen();
    offlineDownloadLock[vid] = true;
    try {
        try {
            var cachedLyric = (typeof lyricsCache !== 'undefined' && lyricsCache[vid]) ? lyricsCache[vid] : null;
            if (!cachedLyric && typeof S !== 'undefined' && S.ld && S.ld.vid === vid && S.ld.lines && S.ld.lines.length > 0) {
                cachedLyric = S.ld;
            }
            if (!cachedLyric) {
                var tParam = songObj.title ? '&title=' + encodeURIComponent(songObj.title) : '';
                var aParam = songObj.artist ? '&artist=' + encodeURIComponent(songObj.artist) : '';
                var dParam = (typeof trackDurationSeconds === 'function') ? (function(){ var dd = trackDurationSeconds(track); return dd > 0 ? '&duration=' + dd : ''; })() : '';
                var lr = await fetch(API.lyrics + '?id=' + vid + tParam + aParam + dParam);
                var ld = await lr.json();
                if (ld && ld.status && ld.result && ld.result.lyrics) {
                    cachedLyric = {
                        vid: vid,
                        type: ld.result.lyrics.type || 'none',
                        lines: ld.result.lyrics.lines || []
                    };
                }
            }
            if (cachedLyric) {
                if (typeof lyricsCache !== 'undefined') lyricsCache[vid] = cachedLyric;
                songObj.lyrics = cachedLyric;
                if (typeof savePwaCaches === 'function') savePwaCaches();
                var latest = getOfflineSongs();
                for (var i = 0; i < latest.length; i++) {
                    if (latest[i].videoId === vid || latest[i].id === vid) latest[i].lyrics = cachedLyric;
                }
                persistOfflineSongs(latest);
            }
        } catch (e) {}
        var okAudio = await ensureOfflineAudio(songObj);
        if (!okAudio) throw new Error('audio download failed');
        markOfflineAudioReady(vid, true);
        showToast('Lagu "' + track.title + '" siap diputar tanpa internet');
        updateOfflineButtons();
        rerenderOfflineIfOpen();
        return true;
    } catch (err) {
        markOfflineAudioReady(vid, false);
        var msg = 'Gagal mengunduh audio, akan dicoba otomatis saat online.';
        if (err && (err.name === 'QuotaExceededError' || (String(err.message || '').indexOf('Quota') !== -1))) {
            msg = 'Penyimpanan penuh. Hapus lagu offline lain dulu.';
        }
        showToast(msg);
        updateOfflineButtons();
        rerenderOfflineIfOpen();
        return false;
    } finally {
        delete offlineDownloadLock[vid];
    }
}

function toggleCurrentOffline() {
    if (typeof S === 'undefined' || !S.ct) {
        showToast('Pilih lagu terlebih dahulu');
        return;
    }
    saveTrackForOffline(S.ct);
}

function updateOfflineButtons() {
    if (typeof S === 'undefined') return;
    var isSaved = S.ct ? isOfflineSong(S.ct) : false;
    var fullBtn = gid('full-offline-btn');
    if (fullBtn) {
        if (isSaved) {
            fullBtn.className = 'w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center active:scale-90 transition-all shrink-0 cursor-pointer shadow-md';
            fullBtn.title = 'Tersimpan di Mode Offline PWA (Klik untuk menghapus)';
            fullBtn.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5"></i>';
        } else {
            fullBtn.className = 'w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all shrink-0 cursor-pointer shadow-md';
            fullBtn.title = 'Simpan ke Mode Offline PWA';
            fullBtn.innerHTML = '<i data-lucide="wifi-off" class="w-5 h-5"></i>';
        }
    }
    if (window.lucide) lucide.createIcons();
}

var OfflineView = {
    render() {
        var el = gid('view-offline');
        if (!el) return;
        var offlineSongs = typeof getOfflineSongs === 'function' ? getOfflineSongs() : [];
        var isOnline = navigator.onLine;
        var songsHtml = '';
        if (offlineSongs.length > 0) {
            songsHtml = offlineSongs.map(function(s, i) {
                var isCur = S.ct && (
                    S.ct.id === s.id ||
                    S.ct.videoId === s.videoId ||
                    (S.ct.title === s.title && S.ct.artist === s.artist)
                );
                var isPlay = isCur && S.ip;
                var isLoad = isCur && S.il;
                var playIconHtml = '';
                if (isLoad) {
                    playIconHtml = '<div class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>';
                } else if (isPlay) {
                    playIconHtml = '<div class="flex items-end justify-center gap-[2px] w-4 h-4 pb-0.5"><span class="w-[2px] bg-black rounded-full animate-eq-1"></span><span class="w-[2px] bg-black rounded-full animate-eq-2"></span><span class="w-[2px] bg-black rounded-full animate-eq-3"></span></div>';
                } else if (isCur) {
                    playIconHtml = '<i data-lucide="pause" class="w-4 h-4 text-black fill-current"></i>';
                } else {
                    playIconHtml = '<i data-lucide="play" class="w-4 h-4 text-black fill-current ml-0.5"></i>';
                }
                var cardBg = isPlay ? 'bg-white/15 border-white/30 shadow-lg' : (isCur ? 'bg-white/10 border-white/20' : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]');
                var titleClass = isCur ? 'text-white font-bold' : 'text-white/90 font-semibold';
                var dateStr = s.savedAt ? new Date(s.savedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '';
                var safeSongJson = JSON.stringify(s).replace(/"/g, '&quot;');
                var preparing = s.audioReady !== true;
                var statusHtml = (dateStr ? ' • <span class="text-white/40">Offline ('+dateStr+')</span>' : '') +
                    (preparing ? ' • <span class="text-amber-400/90">Menyiapkan...</span>' : '');
                return '<div data-lp-source="offline" data-lp-index="'+i+'" class="flex items-center gap-3 p-2.5 rounded-2xl border '+cardBg+' active:scale-[0.98] transition-all duration-200 group shadow-md">'+
                    '<div onclick="PK(\'offline\','+i+')" class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">'+
                        '<div class="w-5 text-center text-white/50 text-xs font-bold group-hover:text-white shrink-0">'+(i + 1)+'</div>'+
                        '<img src="'+(s.cover || FI)+'" class="w-12 h-12 rounded-xl object-cover shrink-0 shadow-md border border-white/10" onerror="this.src=\''+FI+'\'" />'+
                        '<div class="min-w-0 flex-1">'+
                            '<h3 class="'+titleClass+' text-sm truncate">'+es(s.title)+'</h3>'+
                            '<p class="text-xs text-white/50 truncate mt-0.5">'+es(s.artist)+statusHtml+'</p>'+
                        '</div>'+
                    '</div>'+
                    '<button onclick="event.stopPropagation();saveTrackForOffline('+safeSongJson+');" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white/50 hover:text-red-400 border border-white/10 flex items-center justify-center shrink-0 active:scale-90 transition-all" title="Hapus dari Mode Offline PWA">'+
                        '<i data-lucide="trash-2" class="w-4 h-4"></i>'+
                    '</button>'+
                    '<button onclick="PK(\'offline\','+i+')" class="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shrink-0 active:scale-90 transition-all shadow-md">'+
                        playIconHtml+
                    '</button>'+
                '</div>';
            }).join('');
        } else {
            songsHtml = '<div class="text-center py-14 rounded-2xl bg-white/[0.03] border border-white/10 px-4">'+
                '<div class="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-3 text-white">'+
                    '<i data-lucide="wifi-off" class="w-6 h-6"></i>'+
                '</div>'+
                '<h3 class="text-white font-bold text-sm mb-1">Belum Ada Lagu Offline</h3>'+
                '<p class="text-white/60 text-xs max-w-xs mx-auto mb-3">Simpan lagu favoritmu — file audionya diunduh ke perangkat, jadi bisa diputar tanpa internet.</p>'+
                '<div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80 text-xs font-semibold">'+
                    '<i data-lucide="wifi-off" class="w-3.5 h-3.5"></i>'+
                    '<span>Klik ikon Offline di pemutar lagu</span>'+
                '</div>'+
            '</div>';
        }
        el.innerHTML = '<div class="pt-8 pb-3.5 px-4 sticky top-0 z-30 border-b border-white/10 shadow-2xl transition-all flex justify-between items-center bg-black/80 backdrop-blur-md">'+
            '<div>'+
                '<div class="flex items-center gap-2">'+
                    '<h1 class="text-2xl font-black text-white tracking-tight drop-shadow-md">Offline Mode</h1>'+
                    '<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${isOnline ? \'border-emerald-500/40 text-emerald-400 bg-emerald-500/10\' : \'border-white/20 text-white/60 bg-white/5\'}">${isOnline ? \'Online\' : \'Offline\'}</span>'+
                '</div>'+
                '<p class="text-xs text-white/50 mt-0.5">File audio tersimpan di perangkat</p>'+
            '</div>'+
            '<div class="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white shadow-md">'+
                '<i data-lucide="wifi-off" class="w-4 h-4"></i>'+
            '</div>'+
        '</div>'+
        '<div class="px-4 mt-4 space-y-3">'+
            (offlineSongs.length > 0 ? '<div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-white/60 uppercase tracking-wider">${offlineSongs.length} Lagu Tersimpan</span><button onclick="PK(\'offline\',0)" class="text-xs text-white hover:text-white/80 font-bold hover:underline flex items-center gap-1"><i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i> Putar Semua</button></div>' : '')+
            '<div class="space-y-2">${songsHtml}</div>'+
        '</div>';
        if (window.lucide) lucide.createIcons();
    }
};

var App={
    init(){
        document.documentElement.classList.remove('theme-light');
        localStorage.removeItem('theme');
        gid('nav-container').innerHTML='<div class="fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-lg z-40">'+
            '<div class="glass-dock rounded-[32px] py-1.5 px-1.5 flex items-center justify-between">'+
                '<button onclick="App.switch(\'home\')" id="nav-home" aria-label="Beranda" class="nav-item group relative flex flex-col items-center justify-center cursor-pointer select-none touch-manipulation py-1.5 px-2 rounded-2xl transition-all duration-300 active:scale-95">'+
                    '<i data-lucide="home" class="w-4 h-4 sm:w-5 sm:h-5 transition-all duration-300"></i>'+
                    '<span class="nav-label text-[9px] font-medium transition-all duration-300 mt-0.5">Home</span>'+
                '</button>'+
                '<button onclick="App.switch(\'search\')" id="nav-search" aria-label="Cari" class="nav-item group relative flex flex-col items-center justify-center cursor-pointer select-none touch-manipulation py-1.5 px-2 rounded-2xl transition-all duration-300 active:scale-95">'+
                    '<i data-lucide="search" class="w-4 h-4 sm:w-5 sm:h-5 transition-all duration-300"></i>'+
                    '<span class="nav-label text-[9px] font-medium transition-all duration-300 mt-0.5">Search</span>'+
                '</button>'+
                '<button onclick="App.switch(\'library\')" id="nav-library" aria-label="Koleksi" class="nav-item group relative flex flex-col items-center justify-center cursor-pointer select-none touch-manipulation py-1.5 px-2 rounded-2xl transition-all duration-300 active:scale-95">'+
                    '<i data-lucide="library" class="w-4 h-4 sm:w-5 sm:h-5 transition-all duration-300"></i>'+
                    '<span class="nav-label text-[9px] font-medium transition-all duration-300 mt-0.5">Library</span>'+
                '</button>'+
                '<button onclick="App.switch(\'offline\')" id="nav-offline" aria-label="Offline" class="nav-item group relative flex flex-col items-center justify-center cursor-pointer select-none touch-manipulation py-1.5 px-2 rounded-2xl transition-all duration-300 active:scale-95">'+
                    '<i data-lucide="wifi-off" class="w-4 h-4 sm:w-5 sm:h-5 transition-all duration-300"></i>'+
                    '<span class="nav-label text-[9px] font-medium transition-all duration-300 mt-0.5">Offline</span>'+
                '</button>'+
                '<button onclick="App.switch(\'liked\')" id="nav-liked" aria-label="Disukai" class="nav-item group relative flex flex-col items-center justify-center cursor-pointer select-none touch-manipulation py-1.5 px-2 rounded-2xl transition-all duration-300 active:scale-95">'+
                    '<i data-lucide="heart" class="w-4 h-4 sm:w-5 sm:h-5 transition-all duration-300"></i>'+
                    '<span class="nav-label text-[9px] font-medium transition-all duration-300 mt-0.5">Liked</span>'+
                '</button>'+
                '<button onclick="App.switch(\'dev\')" id="nav-dev" aria-label="Profil" class="nav-item group relative flex flex-col items-center justify-center cursor-pointer select-none touch-manipulation py-1.5 px-2 rounded-2xl transition-all duration-300 active:scale-95">'+
                    '<i data-lucide="user" class="w-4 h-4 sm:w-5 sm:h-5 transition-all duration-300"></i>'+
                    '<span class="nav-label text-[9px] font-medium transition-all duration-300 mt-0.5">Profile</span>'+
                '</button>'+
            '</div>'+
        '</div>';
        Profile.render();
        MP.init();FullPlayer.init();Artist.init();Album.init();Home.render();Search.render();
        if(typeof restoreResumeState==='function') restoreResumeState();
        if(typeof refreshOfflineAudioFlags==='function') refreshOfflineAudioFlags();
        if(typeof backfillOfflineAudio==='function') setTimeout(function(){ backfillOfflineAudio(); }, 1600);
        if(typeof updateOG==='function') updateOG(null);
        App.switch(!navigator.onLine ? 'offline' : 'home');
        lucide.createIcons();
        setTimeout(function(){ App.checkUrl(); }, 1000);
        window.addEventListener('popstate', function(e) {
            if (typeof Album !== 'undefined' && gid('album-modal') && gid('album-modal').style.display !== 'none') {
                gid('album-modal').style.display = 'none';
                gid('album-content').innerHTML = '';
                Album.currentAlbumId = null;
            }
            if (typeof Artist !== 'undefined' && gid('artist-modal') && gid('artist-modal').style.display !== 'none') {
                gid('artist-modal').style.display = 'none';
                gid('artist-content').innerHTML = '';
                Artist.currentArtistId = null;
            }
        });
    },
    checkUrl(){
        var path = window.location.pathname;
        if(path.startsWith('/search/')){
            var q = path.split('/search/')[1];
            if(q){
                setTimeout(function(){
                    var si=gid('search-input');
                    if(si){
                        try { si.value = decodeURIComponent(q); } catch(e) { si.value = q; }
                        gid('search-form').dispatchEvent(new Event('submit'));
                    }
                    App.switch('search');
                },300);
            }
        }
        else if(path.startsWith('/play/')){
            var videoId = path.split('/play/')[1];
            if(videoId) {
                var p = new URLSearchParams(location.search);
                var isShared = p.get('share') === 'true' || p.get('share') === '1';
                var qTitle = p.get('title');
                var qArtist = p.get('artist');
                var qCover = p.get('cover') || p.get('thumb');
                if (qCover && typeof updateOG === 'function') {
                    updateOG(qTitle || 'Lagu', qCover, qArtist || '');
                }
                if(isShared) {
                    App.showSharePopup(videoId);
                } else {
                    App.autoPlayTrack(videoId);
                }
            }
        }
        else if(path.startsWith('/album/')){
            var albumId = path.split('/album/')[1];
            if(albumId) {
                var p = new URLSearchParams(location.search);
                var qTitle = p.get('title');
                var qArtist = p.get('artist');
                var qCover = p.get('cover') || p.get('thumb');
                if (qCover && typeof updateOGForAlbum === 'function') {
                    updateOGForAlbum(qTitle || 'Album', qCover, qArtist || '');
                }
                App.switch('home');
                setTimeout(function(){ Album.open(albumId, qCover); }, 300);
            }
        }
        else if(path.startsWith('/artist/')){
            var artistId = path.split('/artist/')[1];
            if(artistId) {
                var p = new URLSearchParams(location.search);
                var qName = p.get('name') || p.get('title');
                var qCover = p.get('cover') || p.get('thumb');
                if (qCover && typeof updateOGForArtist === 'function') {
                    updateOGForArtist(qName || 'Artist', qCover);
                }
                App.switch('home');
                setTimeout(function(){ Artist.open(artistId, qName, qCover); }, 300);
            }
        }
        else {
            var p=new URLSearchParams(location.search);
            var play=p.get('play'),search=p.get('search'),isShared=p.get('share')==='1';
            if(play){if(isShared){App.showSharePopup(play);}else{App.autoPlayTrack(play);}}
            else if(search){setTimeout(function(){var si=gid('search-input');if(si){try { si.value = decodeURIComponent(search); } catch(e) { si.value = search; } gid('search-form').dispatchEvent(new Event('submit'));}App.switch('search');},300);}
        }
    },
    autoPlayTrack(videoId){
        fetch(API.search+'?query=https://youtube.com/watch?v='+videoId).then(function(r){return r.json();}).then(function(d){
            var title='Lagu',artist='MusifyEga',cover=toHDCover('', videoId),artistId='';
            if(d.status&&d.result.songs&&d.result.songs.length>0){var song=d.result.songs[0];title=cn(song.title);artist=cn(song.artist);cover=toHDCover(song.thumbnail, videoId);artistId=song.artistId||'';}
            S.ct={id:videoId,videoId:videoId,title:title,artist:artist,cover:cover,artistId:artistId,ytUrl:'https://youtube.com/watch?v='+videoId};
            S.ps='direct';S.pl=[S.ct];S.pi=0;UU();MP.show();resetLyricsUI(videoId);
            FullPlayer.open();loadTrack(S.ct);
        }).catch(function(){
            S.ct={id:videoId,videoId:videoId,title:'Lagu',artist:'MusifyEga',cover:toHDCover('', videoId),artistId:'',ytUrl:'https://youtube.com/watch?v='+videoId};
            S.ps='direct';S.pl=[S.ct];S.pi=0;UU();MP.show();resetLyricsUI(videoId);
            FullPlayer.open();loadTrack(S.ct);
        });
    },
    showSharePopup(videoId){
        fetch(API.search+'?query=https://youtube.com/watch?v='+videoId).then(function(r){return r.json();}).then(function(d){
            var title='Lagu',artist='MusifyEga',cover=toHDCover('', videoId);
            if(d.status&&d.result.songs&&d.result.songs.length>0){var song=d.result.songs[0];title=cn(song.title);artist=cn(song.artist);cover=toHDCover(song.thumbnail, videoId);}
            App.renderPopup(videoId,title,artist,cover);
        }).catch(function(){App.renderPopup(videoId,'Lagu','MusifyEga',toHDCover('', videoId));});
    },
    renderPopup(videoId,title,artist,cover){
        if(typeof updateOG==='function') updateOG(title, cover, artist);
        var popup=document.createElement('div');popup.className='fixed inset-0 z-[300] flex items-end justify-center bg-black/60';
        popup.onclick=function(e){if(e.target===popup)popup.remove();};
        popup.innerHTML='<div class="glass-strong w-full max-w-md rounded-t-3xl p-6 border-t border-white/10" style="animation:slideUp 0.4s ease-out forwards;"><div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4"></div><div class="flex items-center gap-4 mb-4"><img src="'+cover+'" class="w-16 h-16 rounded-xl object-cover " onerror="this.src=\''+FI+'\'" /><div class="flex-1 truncate"><h3 class="font-bold text-white truncate">'+title+'</h3><p class="text-[#9a9490] text-sm truncate">'+artist+'</p></div></div><p class="text-white/70 text-xs mb-4 text-center">Seseorang membagikan lagu ini kepadamu</p><div class="flex gap-3"><button id="popup-play" class="flex-1 btn-chrome font-bold py-3 rounded-full active:scale-95 flex items-center justify-center gap-2"><i data-lucide="play" class="w-4 h-4 fill-current"></i> Putar Sekarang</button><button id="popup-later" class="px-6 py-3 glass glass-hover text-white rounded-full active:scale-95">Nanti</button></div></div>';
        document.body.appendChild(popup);
        popup.querySelector('#popup-play').onclick=function(){popup.remove();S.ct={id:videoId,videoId:videoId,title:title,artist:artist,cover:cover,artistId:'',ytUrl:'https://youtube.com/watch?v='+videoId};S.ps='direct';S.pl=[S.ct];S.pi=0;UU();MP.show();resetLyricsUI(videoId);FullPlayer.open();loadTrack(S.ct);};
        popup.querySelector('#popup-later').onclick=function(){popup.remove();};
    },
    switch(t){
        if(typeof FullPlayer !== 'undefined' && FullPlayer.close) FullPlayer.close();
        if(typeof Album !== 'undefined' && Album.close) Album.close();
        if(typeof Artist !== 'undefined' && Artist.close) Artist.close();
        if(typeof Library !== 'undefined' && Library.closeModalOnly) Library.closeModalOnly();
        document.querySelectorAll('.fixed.z-\\[300\\], .fixed.z-\\[400\\]').forEach(function(el){
            if(el.id !== 'v2-popup' && el.id !== 'mini-player') el.remove();
        });
        var tabs = ['home', 'search', 'library', 'offline', 'liked', 'dev'];
        var prevTab = S.at || 'home';
        var prevIndex = tabs.indexOf(prevTab);
        var nextIndex = tabs.indexOf(t);
        S.at = t;
        tabs.forEach(function(id){
            var el = gid('view-' + id);
            if(el) {
                el.style.display = 'none';
                el.classList.remove('animate-slide-right', 'animate-slide-left');
            }
        });
        if(t==='library'){Library.render();}
        if(t==='dev'){Profile.render();}
        if(t==='offline'){
            OfflineView.render();
        }
        if(t==='home'){
            if (prevTab === 'home' && Home.activeCategory) {
                Home.selectCategory('Semua');
            } else {
                Home.render();
            }
        }
        if(t==='search'){Search.onShow();}
        if(t==='liked'){Liked.render();}
        var targetEl = gid('view-' + t);
        if(targetEl) {
            targetEl.style.display = 'block';
            if(prevIndex !== -1 && nextIndex !== -1 && prevIndex !== nextIndex) {
                if(nextIndex > prevIndex) {
                    targetEl.classList.add('animate-slide-right');
                } else {
                    targetEl.classList.add('animate-slide-left');
                }
            }
        }
        ['home','search','library','offline','liked','dev'].forEach(function(n){
            var b=gid('nav-'+n);
            if(!b)return;
            var isCurrent = (n === t);
            if(isCurrent){
                b.className = 'nav-item group relative flex flex-col items-center justify-center cursor-pointer select-none touch-manipulation py-1.5 px-2.5 sm:px-3 rounded-2xl text-[#0b0a09] font-bold transition-all duration-300 scale-105';
                b.style.background = 'linear-gradient(135deg, var(--accent), var(--accent-2))';
                b.style.boxShadow = '0 8px 20px rgba(var(--accent-rgb), 0.4)';
            } else {
                b.className = 'nav-item group relative flex flex-col items-center justify-center cursor-pointer select-none touch-manipulation py-1.5 px-2 rounded-2xl text-white/50 hover:text-white hover:bg-white/10 transition-all duration-300';
                b.style.background = '';
                b.style.boxShadow = '';
            }
        });
        var ma=gid('main-area');if(ma)ma.scrollTop=0;
        window.scrollTo(0,0);
        requestAnimationFrame(function(){var m2=gid('main-area');if(m2)m2.scrollTop=0;});
        lucide.createIcons();
    },
    renderLiked() {
        if (typeof Liked !== 'undefined') Liked.render();
    },
    showV2Popup() {
        if(localStorage.getItem('seen_v31_popup')) return;
        var popup = document.createElement('div');
        popup.id = 'v2-popup';
        popup.className = 'fixed inset-0 z-[400] flex items-center justify-center bg-black/80 px-4';
        popup.innerHTML = '<div class="glass-strong w-full max-w-sm rounded-3xl p-6 border border-white/10 text-center relative overflow-hidden" style="animation: slideUp 0.3s ease-out forwards;">'+
            '<div class="relative w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:linear-gradient(135deg,var(--accent),var(--accent-2));">'+
                '<i data-lucide="sparkles" class="w-8 h-8 text-[#0b0a09]"></i>'+
            '</div>'+
            '<h2 class="text-2xl font-black chrome-text mb-1">MusifyEga 3.1</h2>'+
            '<p class="text-white/70 text-xs mb-5">Lebih nyaman: lagu lanjut otomatis, kontrol lebih lengkap.</p>'+
            '<div class="space-y-3 text-left mb-6 max-h-[260px] overflow-y-auto pr-1">'+
                '<div class="flex items-start gap-3"><div class="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="play-circle" class="w-4 h-4 text-white/80"></i></div><div><h4 class="text-white font-bold text-sm">Resume Lagu Terakhir</h4><p class="text-white/60 text-xs leading-relaxed">App ditutup? Lagu terakhir + posisinya tersimpan. Buka lagi, tinggal tekan play.</p></div></div>'+
                '<div class="flex items-start gap-3"><div class="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="history" class="w-4 h-4 text-white/80"></i></div><div><h4 class="text-white font-bold text-sm">Riwayat Pencarian</h4><p class="text-white/60 text-xs leading-relaxed">8 pencarian terakhir tersimpan sebagai chip, bisa dihapus satu-satu atau semua.</p></div></div>'+
                '<div class="flex items-start gap-3"><div class="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="keyboard" class="w-4 h-4 text-white/80"></i></div><div><h4 class="text-white font-bold text-sm">Keyboard Shortcut</h4><p class="text-white/60 text-xs leading-relaxed">Spasi = play/pause, ←/→ = seek, ↑/↓ = volume, L = like, / = cari.</p></div></div>'+
                '<div class="flex items-start gap-3"><div class="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="move-horizontal" class="w-4 h-4 text-white/80"></i></div><div><h4 class="text-white font-bold text-sm">Swipe Mini-Player</h4><p class="text-white/60 text-xs leading-relaxed">Geser kiri/kanan = ganti lagu, geser ke atas = buka player penuh.</p></div></div>'+
                '<div class="flex items-start gap-3"><div class="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="rotate-cw" class="w-4 h-4 text-white/80"></i></div><div><h4 class="text-white font-bold text-sm">Seek ±10 Detik & Haptic</h4><p class="text-white/60 text-xs leading-relaxed">Tombol maju/mundur 10 detik di player + getaran halus tiap tap tombol di Android.</p></div></div>'+
                '<div class="flex items-start gap-3"><div class="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="mouse-pointer-click" class="w-4 h-4 text-white/80"></i></div><div><h4 class="text-white font-bold text-sm">Long-Press Kartu Lagu</h4><p class="text-white/60 text-xs leading-relaxed">Tahan kartu lagu untuk buka menu tiga titik — nggak perlu lagi ngejar tombol kecil.</p></div></div>'+
            '</div>'+
            '<button id="close-v2-popup" class="w-full btn-chrome font-bold py-3.5 rounded-full active:scale-95 transition-all">Keren, Mulai Dengar!</button>'+
        '</div>';
        document.body.appendChild(popup);
        if(window.lucide) lucide.createIcons();
        popup.querySelector('#close-v2-popup').onclick = function() {
            localStorage.setItem('seen_v31_popup', 'true');
            popup.remove();
        };
    }
};
App.init();Home.fetch();

document.addEventListener('keydown',function(e){
    if(e.defaultPrevented)return;
    var t=e.target;
    var tag=(t&&t.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||tag==='select'||tag==='button'||(t&&t.isContentEditable))return;
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    switch(e.key){
        case ' ':
            e.preventDefault();
            if(typeof TP==='function')TP();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if(typeof SKSEK==='function')SKSEK(-5);
            break;
        case 'ArrowRight':
            e.preventDefault();
            if(typeof SKSEK==='function')SKSEK(5);
            break;
        case 'ArrowUp':
            e.preventDefault();
            if(typeof applyVolume==='function'){
                var cur=(typeof AU!=='undefined'&&AU)?AU.volume:(typeof S!=='undefined'?S.volume:1);
                applyVolume(Math.min(1,(cur||0)+0.05));
            }
            break;
        case 'ArrowDown':
            e.preventDefault();
            if(typeof applyVolume==='function'){
                var cur2=(typeof AU!=='undefined'&&AU)?AU.volume:(typeof S!=='undefined'?S.volume:1);
                applyVolume(Math.max(0,(cur2||0)-0.05));
            }
            break;
        case 'l': case 'L':
            if(typeof S!=='undefined'&&S.ct&&typeof toggleCurrentLike==='function')toggleCurrentLike();
            break;
        case '/':
            e.preventDefault();
            var si=gid('search-input');
            if(si){
                App.switch('search');
                setTimeout(function(){si.focus();},120);
            }
            break;
    }
});

var splashStartTime = Date.now();
var splashDismissed = false;

function hideSplashScreen() {
    if (splashDismissed) return;
    var minDuration = 1000;
    var elapsed = Date.now() - splashStartTime;
    if (elapsed < minDuration) {
        setTimeout(hideSplashScreen, minDuration - elapsed);
        return;
    }
    splashDismissed = true;
    var sp = gid('splash-screen');
    if (!sp) return;
    sp.classList.add('hide');
    setTimeout(function() { 
        if (sp && sp.parentNode) sp.parentNode.removeChild(sp); 
        App.showV2Popup();
    }, 400);
}

(function(){
    var sp = gid('splash-screen');
    if (!sp) return;
    var logoWrap = sp.querySelector('.splash-logo-wrap') || sp.querySelector('.logo-wrap');
    if (logoWrap) {
        logoWrap.style.width = '170px';
        logoWrap.style.height = '170px';
        logoWrap.style.borderRadius = '50%';
    }
    var logo = sp.querySelector('.splash-logo-wrap img') || sp.querySelector('.logo');
    if (logo) {
        logo.style.borderRadius = '50%';
        logo.style.objectFit = 'cover';
    }
    setTimeout(function(){
        hideSplashScreen();
    }, 4500);
})();