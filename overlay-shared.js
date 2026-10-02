(function(root) {
    const GOOGLE_FONTS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Poppins', 'Raleway', 'Merriweather', 'Playfair Display', 'Bebas Neue', 'Fira Code', 'Silkscreen'];
    const googleFontSet = new Set(GOOGLE_FONTS);

    const VARIABLE_GROUPS = [
        { label: 'Viewers', items: [['viewers.current', 'Current viewers'], ['viewers.peak', 'Peak viewers'], ['viewers.average', 'Average viewers']] },
        { label: 'Chat', items: [['chatters', 'Chatters'], ['messages', 'Messages'], ['followers', 'Followers'], ['subscribers', 'Subscribers']] },
        { label: 'Engagement', items: [['gift_subs', 'Gift subs'], ['bits', 'Bits'], ['donations', 'Donations']] },
        { label: 'Hashtags', items: [['hashtags.top', 'Most popular hashtag overall'], ['hashtags.session_top', 'Most popular hashtag this session'], ['hashtags.total', 'Total hashtag mentions']] },
        { label: 'Stream', items: [['music.title', 'Music title'], ['music.artist', 'Music artist'], ['stream.title', 'Stream title'], ['overlay.name', 'Overlay name']] }
    ];

    function variableTable(status = {}, context = {}) {
        return {
            'viewer.current': status.viewers?.current,
            'viewers.current': status.viewers?.current,
            'viewer.peak': status.viewers?.peak,
            'viewers.peak': status.viewers?.peak,
            'viewer.average': status.viewers?.average,
            'viewers.average': status.viewers?.average,
            'chatters': status.ssn?.chatters,
            'messages': status.ssn?.messages,
            'followers': status.ssn?.followers,
            'subscribers': status.ssn?.subscribers,
            'gift_subs': status.goalMetrics?.gift_subs,
            'bits': status.goalMetrics?.bits,
            'donations': status.goalMetrics?.donations,
            'hashtags': status.ssn?.hashtags,
            'hashtags.top': status.popularHashtags?.overall?.[0]?.tag || status.hashtags?.topTag,
            'hashtags.session_top': status.popularHashtags?.session?.[0]?.tag,
            'hashtags.total': status.hashtags?.totalMentions,
            'music.title': status.music?.track,
            'music.artist': status.music?.artist,
            'stream.title': status.stream?.title,
            'overlay.name': context.overlayName
        };
    }

    // keepEmpty leaves {{token}} in place when no live value exists, which keeps editor previews selectable.
    function expandVariables(value, status, context = {}, keepEmpty = false) {
        const table = variableTable(status, context);
        return String(value ?? '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, name) => {
            const resolved = table[name];
            const text = resolved === undefined || resolved === null ? '' : String(resolved);
            return text === '' && keepEmpty ? match : text;
        });
    }

    function variableSnapshot(status, context) {
        return JSON.stringify(variableTable(status, context));
    }

    function renderMarkdown(source) {
        const html = root.marked.parse(String(source ?? ''), { breaks: true });
        return root.DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'img'],
            ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt']
        });
    }

    function loadGoogleFont(fontFamily) {
        const name = String(fontFamily || '').split(',')[0].replace(/^['"]|['"]$/g, '').trim();
        if (!googleFontSet.has(name)) return;
        const id = `google-font-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;600;700;900&display=swap`;
        document.head.appendChild(link);
    }

    root.OverlayShared = { GOOGLE_FONTS, VARIABLE_GROUPS, expandVariables, variableSnapshot, renderMarkdown, loadGoogleFont };
})(window);
