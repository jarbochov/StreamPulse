(function (root) {
    const number = (value, fallback, min, max) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    };
    const color = (value, fallback) => typeof value === 'string' && value.trim() ? value.slice(0, 80) : fallback;

    function settings(input = {}) {
        if (!input || typeof input !== 'object') input = {};
        return {
            source: 'twitch',
            accent: color(input.accent, '#a78bfa'),
            winnerColor: color(input.winnerColor, '#4ade80'),
            trackColor: color(input.trackColor, 'rgba(255,255,255,0.14)'),
            showVotes: input.showVotes !== false,
            showPercent: input.showPercent !== false,
            showTimer: input.showTimer !== false,
            showTotal: input.showTotal !== false,
            resultsSeconds: number(input.resultsSeconds ?? 15, 15, 0, 300),
            previewMode: ['auto', 'sample', 'live'].includes(input.previewMode) ? input.previewMode : 'auto',
            sampleChoices: Math.round(number(input.sampleChoices ?? 3, 3, 2, 5)),
            sampleState: ['active', 'completed', 'tie', 'zero'].includes(input.sampleState) ? input.sampleState : 'active'
        };
    }

    function sample(input = {}, now = Date.now()) {
        const cfg = settings(input);
        const titles = ['Explore the ruins', 'Follow the river', 'Visit the village', 'Climb the tower', 'Take the forest path'];
        return {
            id: 'preview-poll', title: 'Where should we go next?',
            status: cfg.sampleState === 'active' ? 'ACTIVE' : 'COMPLETED',
            duration: 120, startedAt: new Date(now - 45000).toISOString(), endedAt: new Date(now).toISOString(),
            choices: titles.slice(0, cfg.sampleChoices).map((title, i) => ({
                id: `choice-${i}`, title,
                votes: cfg.sampleState === 'zero' ? 0 : cfg.sampleState === 'tie' && i < 2 ? 12 : [18, 12, 8, 4, 2][i]
            }))
        };
    }

    // Provider-neutral display model: only question, choices, counts, status, and timing are needed.
    function model(poll, input = {}, { preview = false, now = Date.now() } = {}) {
        const cfg = settings(input);
        const end = Date.parse(poll?.endedAt);
        const available = poll && Array.isArray(poll.choices) && poll.choices.length >= 2
            && poll.choices.slice(0, 10).every(choice => choice && typeof choice === 'object')
            && (poll.status === 'ACTIVE' || (['COMPLETED', 'TERMINATED', 'ARCHIVED'].includes(poll.status)
                && cfg.resultsSeconds > 0 && Number.isFinite(end) && now < end + cfg.resultsSeconds * 1000));
        const isSample = preview && (cfg.previewMode === 'sample' || (cfg.previewMode === 'auto' && !available));
        if (isSample) poll = sample(cfg, now);
        else if (!available) return null;
        const active = poll.status === 'ACTIVE';
        const ended = ['COMPLETED', 'TERMINATED', 'ARCHIVED'].includes(poll.status);
        const choices = poll.choices.slice(0, 10).map((choice, i) => ({
            id: String(choice.id ?? i), title: String(choice.title || ''),
            votes: Math.floor(number(choice.votes, 0, 0, Number.MAX_SAFE_INTEGER))
        }));
        const total = choices.reduce((sum, choice) => sum + choice.votes, 0);
        const max = Math.max(...choices.map(choice => choice.votes));
        const tied = max > 0 && choices.filter(choice => choice.votes === max).length > 1;
        const isBlind = Boolean(poll.blind && active);
        const duration = number(poll.duration, 0, 0, 86400);
        const start = Date.parse(poll.startedAt);
        const remaining = active && Number.isFinite(start) ? Math.max(0, Math.ceil(duration - (now - start) / 1000)) : 0;
        return {
            title: String(poll.title || 'Poll'), active, total, remaining, sample: isSample, blind: isBlind,
            celebration: poll.settings?.celebration,
            label: isBlind ? 'Blind Voting' : active ? (remaining > 0 ? 'Live' : 'Closing') : !max ? 'No votes' : tied ? 'Tie' : 'Results',
            choices: choices.map(choice => ({
                ...choice, percent: isBlind ? 0 : (total ? choice.votes / total * 100 : 0),
                winner: ended && max > 0 && choice.votes === max
            }))
        };
    }

    function styles() {
        if (document.getElementById('sp-poll-styles')) return;
        const css = document.createElement('style');
        css.id = 'sp-poll-styles';
        css.textContent = `
            .sp-poll-unavailable{visibility:hidden!important}
            .sp-poll{width:100%;height:100%;container:sp-poll / size;overflow:hidden}
            .sp-poll-content{box-sizing:border-box;width:100%;height:100%;display:flex;flex-direction:column;gap:clamp(2px,2cqh,8px);padding:clamp(3px,2cqw,16px)}
            .sp-poll-header{display:flex;align-items:center;gap:8px;min-width:0;flex:none;font-size:min(calc(var(--poll-size)*1.16),11cqh);line-height:1.15}
            .sp-poll-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
            .sp-poll-timer{flex:none;font-variant-numeric:tabular-nums;opacity:.8}
            .sp-poll [hidden]{display:none!important}
            .sp-poll-choices{display:flex;flex-direction:column;flex:1;min-height:0;gap:clamp(1px,1.6cqh,4px)}
            .sp-poll-choice{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:clamp(1px,.8cqh,2px);font-size:min(var(--poll-size),calc(40cqh / var(--poll-count)));line-height:1.05}
            .sp-poll-label{display:flex;align-items:center;gap:8px;min-width:0;min-height:0}
            .sp-poll-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .sp-poll-metric{flex:none;font-variant-numeric:tabular-nums;opacity:.8}
            .sp-poll-track{height:clamp(2px,2cqh,6px);flex-shrink:0;overflow:hidden;border-radius:999px;background:var(--poll-track)}
            .sp-poll-fill{height:100%;background:var(--poll-accent);border-radius:inherit;transition:width .25s ease}
            .sp-poll-choice[data-winner=true] .sp-poll-name{color:var(--poll-winner);font-weight:700}
            .sp-poll-choice[data-winner=true] .sp-poll-fill{background:var(--poll-winner)}
            .sp-poll-footer{flex:none;font-size:min(calc(var(--poll-size)*.8),8cqh);line-height:1.1;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            @container sp-poll (max-width:260px){.sp-poll-label{gap:4px}.sp-poll-header{gap:4px}}
            @media(prefers-reduced-motion:reduce){.sp-poll-fill{transition:none}}
        `;
        document.head.appendChild(css);
    }

    function render(node, element, poll, options = {}) {
        styles();
        const cfg = settings(element.poll);
        const data = model(poll, cfg, options);
        // Page transitions reset inline visibility, so use a class to keep unavailable panels hidden.
        node.classList.toggle('sp-poll-unavailable', !data && !options.preview);
        let record = node._pollWidget;
        if (!record || record.host.parentNode !== node) {
            const make = (cls, parent) => {
                const el = document.createElement('div');
                el.className = cls;
                parent.appendChild(el);
                return el;
            };
            const host = make('sp-poll', node);
            const content = make('sp-poll-content', host);
            const header = make('sp-poll-header', content);
            const title = make('sp-poll-title', header);
            const timer = make('sp-poll-timer', header);
            const choices = make('sp-poll-choices', content);
            const footer = make('sp-poll-footer', content);
            record = node._pollWidget = { host, content, title, timer, choices, footer, rows: [], make };
        }
        const signature = JSON.stringify([data, cfg, element.style?.fontSize, element.width, element.height]);
        if (record.signature === signature) return;
        record.signature = signature;
        const { host, content, title, timer, choices, footer, rows, make } = record;
        host.style.setProperty('--poll-size', `${number(element.style?.fontSize, 12, 6, 400) * Math.min((Number(element.width) || 400) / 400, (Number(element.height) || 150) / 150)}px`);
        host.style.setProperty('--poll-accent', cfg.accent);
        host.style.setProperty('--poll-winner', cfg.winnerColor);
        host.style.setProperty('--poll-track', cfg.trackColor);
        host.style.setProperty('--poll-count', data?.choices.length || 2);
        const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
        text(title, data?.title || 'No current poll');
        title.title = title.textContent;
        timer.hidden = !data?.active || !cfg.showTimer;
        text(timer, data ? `${Math.floor(data.remaining / 60)}:${String(data.remaining % 60).padStart(2, '0')}` : '');
        choices.hidden = !data;
        content.dataset.sample = String(!!data?.sample);
        const count = data?.choices.length || 0;
        while (rows.length > count) rows.pop().row.remove();
        while (rows.length < count) {
            const row = make('sp-poll-choice', choices);
            const label = make('sp-poll-label', row);
            const name = make('sp-poll-name', label);
            const metric = make('sp-poll-metric', label);
            const track = make('sp-poll-track', row);
            track.setAttribute('role', 'progressbar');
            track.setAttribute('aria-valuemin', '0');
            track.setAttribute('aria-valuemax', '100');
            const fill = make('sp-poll-fill', track);
            rows.push({ row, name, metric, track, fill });
        }
        (data?.choices || []).forEach((choice, i) => {
            const r = rows[i];
            r.row.dataset.winner = String(choice.winner);
            text(r.name, choice.title);
            r.name.title = choice.title;
            const metrics = [];
            if (data.blind) {
                metrics.push('??');
            } else {
                if (cfg.showVotes) metrics.push(String(choice.votes));
                if (cfg.showPercent) metrics.push(`${Math.round(choice.percent)}%`);
            }
            text(r.metric, metrics.join(' / '));
            r.metric.hidden = !metrics.length;
            r.fill.style.width = data.blind ? '0%' : `${choice.percent}%`;
            r.track.setAttribute('aria-label', choice.title);
            r.track.setAttribute('aria-valuenow', String(Math.round(choice.percent)));
        });
        text(footer, data
            ? [data.sample ? 'Sample' : '', data.label, cfg.showTotal ? `${data.total} votes` : ''].filter(Boolean).join(' · ')
            : 'Start a stream poll, or select sample data in Poll preview.');

        if (data && !data.active && !data.sample && data.choices.some(c => c.winner)) {
            const celebrationKey = `${poll.id}-${poll.endedAt}`;
            if (record.lastCelebration !== celebrationKey) {
                record.lastCelebration = celebrationKey;
                triggerCelebration(node, data.celebration || cfg.celebration);
            }
        }
    }

    function triggerCelebration(node, celebration = {}) {
        if (!node || !celebration) return;
        try {
            if (celebration.sound) {
                const audio = new Audio(celebration.sound);
                audio.volume = Math.max(0, Math.min(1, (Number(celebration.volume) || 75) / 100));
                audio.play().catch(() => {});
            }
        } catch {}

        if (celebration.confetti !== false && typeof window !== 'undefined') {
            try {
                let canvas = node.querySelector('.sp-poll-confetti');
                if (!canvas) {
                    canvas = document.createElement('canvas');
                    canvas.className = 'sp-poll-confetti';
                    canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;width:100%;height:100%;z-index:10;';
                    if (window.getComputedStyle(node).position === 'static') node.style.position = 'relative';
                    node.appendChild(canvas);
                }
                canvas.width = node.offsetWidth || 300;
                canvas.height = node.offsetHeight || 150;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const colors = ['#f43f5e', '#ec4899', '#a855f7', '#3b82f6', '#10b981', '#fbbf24'];
                    const particles = [];
                    for (let i = 0; i < 40; i++) {
                        particles.push({
                            x: canvas.width / 2, y: canvas.height * 0.8,
                            vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 6 - 3,
                            color: colors[Math.floor(Math.random() * colors.length)],
                            size: Math.random() * 4 + 3, alpha: 1
                        });
                    }
                    let frame = 0;
                    function anim() {
                        if (frame++ > 60 || !particles.length) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            return;
                        }
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        for (let i = particles.length - 1; i >= 0; i--) {
                            const p = particles[i];
                            p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.alpha -= 0.016;
                            if (p.alpha <= 0) { particles.splice(i, 1); continue; }
                            ctx.globalAlpha = p.alpha;
                            ctx.fillStyle = p.color;
                            ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
                        }
                        requestAnimationFrame(anim);
                    }
                    anim();
                }
            } catch {}
        }
    }

    const api = { settings, sample, model, render };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PollWidget = api;
})(typeof window !== 'undefined' ? window : globalThis);
