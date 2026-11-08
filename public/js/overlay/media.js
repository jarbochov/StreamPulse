
function parseYouTubeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return null;
    const str = urlStr.trim();
    try {
        const u = new URL(str, typeof location !== 'undefined' ? location.href : 'http://localhost:3000/');
        const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
        const timeParam = u.searchParams.get('t') || u.searchParams.get('start');
        let start = 0;
        if (timeParam) {
            const secMatch = timeParam.match(/^(?:(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?|(\d+))$/);
            if (secMatch) {
                if (secMatch[4]) start = Number(secMatch[4]);
                else start = (Number(secMatch[1] || 0) * 3600) + (Number(secMatch[2] || 0) * 60) + Number(secMatch[3] || 0);
            }
        }
        if (host === 'youtu.be') {
            const id = u.pathname.slice(1).split('/')[0].split('?')[0];
            if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                return { type: 'video', id, list: u.searchParams.get('list') || null, start };
            }
        } else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
            if (u.pathname === '/watch') {
                const id = u.searchParams.get('v');
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                    return { type: 'video', id, list: u.searchParams.get('list') || null, start };
                }
            } else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/live/') || u.pathname.startsWith('/embed/')) {
                const parts = u.pathname.split('/').filter(Boolean);
                const id = parts[1];
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                    return { type: 'video', id, list: u.searchParams.get('list') || null, start };
                }
            } else if (u.pathname === '/playlist' && u.searchParams.get('list')) {
                return { type: 'playlist', list: u.searchParams.get('list') };
            }
        }
    } catch { /* fallback to regex */ }

    const match = str.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|live\/|embed\/))([a-zA-Z0-9_-]{11})/i);
    if (match) {
        const listMatch = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
        const timeMatch = str.match(/[?&](?:t|start)=([0-9hms]+)/i);
        let start = 0;
        if (timeMatch) {
            const m = timeMatch[1].match(/^(?:(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?|(\d+))$/);
            if (m) {
                if (m[4]) start = Number(m[4]);
                else start = (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
            }
        }
        return { type: 'video', id: match[1], list: listMatch ? listMatch[1] : null, start };
    }
    const plMatch = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    if (plMatch && /youtube/i.test(str)) {
        return { type: 'playlist', list: plMatch[1] };
    }
    return null;
}

// Embeds saved as http://localhost:PORT/... break when the overlay is opened from another device; point them at the current origin.
// YouTube links (watch, shorts, live, share) are converted to privacy-enhanced embed URLs.
function embedUrl(url, options = {}) {
    if (!url) return '';
    try {
        const yt = parseYouTubeUrl(url);
        if (yt) {
            const params = new URLSearchParams();
            if (options.autoplay !== false) params.set('autoplay', '1');
            else params.set('autoplay', '0');
            params.set('enablejsapi', '1');
            if (options.loop !== false) {
                params.set('loop', '1');
                if (yt.id) params.set('playlist', yt.id);
            }
            if (options.controls === false) params.set('controls', '0');
            if (options.sound === false || options.mute === true || options.autoplay !== false) params.set('mute', '1');
            params.set('playsinline', '1');
            if (yt.list && yt.type !== 'playlist') params.set('list', yt.list);
            if (yt.start) params.set('start', String(yt.start));
            try {
                if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
                    params.set('origin', location.origin);
                }
            } catch {}
            return yt.type === 'playlist'
                ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(yt.list)}&${params.toString()}`
                : `https://www.youtube-nocookie.com/embed/${yt.id}?${params.toString()}`;
        }

        const parsed = new URL(url, location.href);
        if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) && parsed.host !== location.host) {
            parsed.protocol = location.protocol;
            parsed.host = location.host;
            return parsed.toString();
        }
    } catch { /* leave invalid URLs untouched */ }
    return url;
}

export { embedUrl, parseYouTubeUrl };
