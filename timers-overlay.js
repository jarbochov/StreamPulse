(function () {
    const body = document.body;
    const kind = body.dataset.kind === 'stopwatch' ? 'stopwatch' : 'countdown';
    const params = new URLSearchParams(location.search);
    const namedTimerId = (params.get('timer') || '').trim().toLowerCase();
    const mode = params.get('display') === 'compact' ? 'compact' : 'standard';
    const overlay = document.getElementById('overlay-root');
    const timerBox = document.getElementById('timer-box');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const titleEl = document.getElementById('timer-title');
    const messageEl = document.getElementById('complete-message');
    const placeholder = document.getElementById('placeholder');
    const compactNode = document.getElementById('compact-timer');
    const standardNode = document.getElementById('standard-timer');
    const segmentsWrap = document.getElementById('segments-standard');
    const units = ['days', 'hours', 'minutes', 'seconds'];
    const valueEls = Object.fromEntries(units.map(unit => [unit, document.getElementById(unit)]));
    const compactEls = Object.fromEntries(units.map(unit => [unit, document.getElementById(`compact-${unit}`)]));
    const segmentEls = Object.fromEntries(units.map(unit => [unit, document.getElementById(`${unit}-segment`)]));
    const compactSegEls = Object.fromEntries(units.map(unit => [unit, document.getElementById(`compact-${unit}-segment`)]));
    const fullUnits = params.get('units') === 'full';
    const showTitle = params.get('showtitle') !== 'false';
    const showMilliseconds = params.get('milliseconds') === 'true';
    let timerState = null;
    let timerSettings = { sound_enabled: false, sound_volume: 0.35 };
    let prevCompletionState = false;
    let animationStarted = false;

    applyTheme();
    loadSharedTheme();
    standardNode.style.display = mode === 'standard' ? 'flex' : 'none';
    compactNode.style.display = mode === 'compact' ? 'flex' : 'none';
    placeholder.classList.toggle('visible', !namedTimerId && kind === 'stopwatch');

    if (namedTimerId) {
        loadNamedTimer().then(() => {
            startAnimation();
            connectWebSocket();
        }).catch(showPlaceholder);
    } else if (kind === 'countdown') {
        timerState = buildStandaloneCountdown();
        startAnimation();
    } else {
        showPlaceholder('Add ?timer=your-stopwatch-id to the URL');
    }

    function startAnimation() {
        if (animationStarted) return;
        animationStarted = true;
        requestAnimationFrame(tick);
    }

    function tick() {
        render();
        requestAnimationFrame(tick);
    }

    function showPlaceholder(text) {
        overlay.classList.remove('hidden');
        placeholder.classList.add('visible');
        placeholder.textContent = text || 'Timer not found';
        titleEl.classList.remove('visible');
        messageEl.classList.remove('visible');
        if (progressWrap) progressWrap.classList.remove('visible');
        timerBox.style.display = 'none';
    }

    async function loadNamedTimer() {
        const res = await fetch('/api/timers');
        const data = await res.json();
        timerSettings = data.settings || timerSettings;
        timerState = data.timers?.[namedTimerId] || null;
        if (!timerState) throw new Error('Timer not found');
        await maybeAutoStartNamedTimer();
    }

    async function maybeAutoStartNamedTimer() {
        if (params.get('autostart') !== 'true' || !timerState) return;
        if (timerState.state === 'running') return;

        const action = timerState.state === 'paused'
            ? 'resume'
            : 'start';

        try {
            const res = await fetch(`/api/timers/${encodeURIComponent(namedTimerId)}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Failed to ${action} timer on load`);
            timerState = data.timer || timerState;
        } catch (err) {
            console.error('[Timers] Auto-start on load failed:', err);
        }
    }

    function connectWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${location.host}`);
        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg.type === 'timers-snapshot') {
                timerSettings = msg.data?.settings || timerSettings;
                const next = msg.data?.timers?.[namedTimerId];
                if (next) timerState = next;
            } else if (msg.type === 'timer-settings') {
                timerSettings = msg.data || timerSettings;
            } else if (msg.type === 'timer-update') {
                const next = msg.data?.timer;
                if (next?.id === namedTimerId) timerState = next;
            } else if (msg.type === 'timer-delete' && msg.data?.id === namedTimerId) {
                timerState = null;
                showPlaceholder(`Timer "${namedTimerId}" was deleted`);
                return;
            }
        };
        ws.onclose = () => setTimeout(connectWebSocket, 5000);
    }

    function buildStandaloneCountdown() {
        const direction = params.get('direction') === 'up' ? 'up' : 'down';
        const showOnEnd = ['message', 'zero', 'none'].includes(params.get('showonend')) ? params.get('showonend') : 'message';
        const endMessage = params.get('endmessage') || '⌛️';
        const timezone = params.get('timezone') || '';
        const targetAt = params.get('date') ? buildTargetDate(params.get('date'), timezone) : null;
        const durationMs = parseDurationMs({
            days: params.get('days'),
            hours: params.get('hours'),
            minutes: params.get('minutes'),
            seconds: params.get('seconds')
        });
        const now = Date.now();
        return {
            id: '',
            label: params.get('title') || '',
            kind: 'countdown',
            state: 'running',
            visible: true,
            startedAt: now,
            mode: targetAt ? 'date' : 'duration',
            targetAt,
            timezone,
            durationMs,
            startingRemainingMs: targetAt ? Math.max(0, targetAt - now) : durationMs,
            progress: params.get('progress') === 'true',
            showOnEnd,
            endMessage,
            direction
        };
    }

    function parseDurationMs(parts) {
        const days = Math.max(0, Number(parts.days) || 0);
        const hours = Math.max(0, Number(parts.hours) || 0);
        const minutes = Math.max(0, Number(parts.minutes) || 0);
        const seconds = Math.max(0, Number(parts.seconds) || 0);
        return Math.round((((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000);
    }

    function buildTargetDate(dateString, timezone) {
        if (!dateString) return null;
        if (!timezone) return Date.parse(dateString);
        try {
            const date = new Date(dateString);
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false
            });
            const parts = formatter.formatToParts(date);
            let year, month, day, hour, minute, second;
            for (const part of parts) {
                if (part.type === 'year') year = Number(part.value);
                if (part.type === 'month') month = Number(part.value) - 1;
                if (part.type === 'day') day = Number(part.value);
                if (part.type === 'hour') hour = Number(part.value);
                if (part.type === 'minute') minute = Number(part.value);
                if (part.type === 'second') second = Number(part.value);
            }
            return Date.UTC(year, month, day, hour, minute, second);
        } catch {
            return Date.parse(dateString);
        }
    }

    function applyTheme() {
        body.classList.toggle('theme-light', params.get('theme') === 'light');
        if (params.get('theme') !== 'light') body.classList.remove('theme-light');
        if (params.has('bgcolor')) document.documentElement.style.setProperty('--background-color', `#${params.get('bgcolor')}`);
        if (params.has('timercolor')) document.documentElement.style.setProperty('--timer-background', `#${params.get('timercolor')}`);
        if (params.has('textcolor')) document.documentElement.style.setProperty('--text-color', `#${params.get('textcolor')}`);
        if (params.has('labelcolor')) document.documentElement.style.setProperty('--label-color', `#${params.get('labelcolor')}`);
        if (params.has('progresscolor')) document.documentElement.style.setProperty('--progress-color', `#${params.get('progresscolor')}`);
        if (params.has('titlecolor')) document.documentElement.style.setProperty('--title-color', `#${params.get('titlecolor')}`);
        if (params.has('fontscale')) {
            const scale = Math.min(3, Math.max(0.5, Number(params.get('fontscale')) || 1));
            document.documentElement.style.setProperty('--font-scale', scale);
        }

        async function loadSharedTheme() {
            try {
                const res = await fetch('/api/config');
                if (!res.ok) return;
                const theme = (await res.json()).theme || {};
                const root = document.documentElement.style;
                if (theme.font_family) root.setProperty('--font-family', theme.font_family.includes(' ') ? `"${theme.font_family}", ui-monospace, monospace` : `${theme.font_family}, ui-monospace, monospace`);
                if (theme.text_color) {
                    root.setProperty('--text-color', theme.text_color);
                    root.setProperty('--title-color', theme.text_color);
                }
                if (theme.accent_color) root.setProperty('--progress-color', theme.accent_color);
                if (theme.font_scale) root.setProperty('--font-scale', theme.font_scale);
            } catch (error) { console.warn('[Timers] Shared theme load failed:', error.message); }
        }
    }

    function formatParts(ms, forceAllUnits) {
        const safeMs = Math.max(0, Number(ms) || 0);
        let total = Math.floor(safeMs / 1000);
        const days = Math.floor(total / 86400);
        total %= 86400;
        const hours = Math.floor(total / 3600);
        total %= 3600;
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        const hundredths = Math.floor((safeMs % 1000) / 10);
        const values = { days, hours, minutes, seconds };
        const visible = forceAllUnits ? ['days', 'hours', 'minutes', 'seconds'] : [];
        if (!forceAllUnits) {
            if (days > 0) visible.push('days', 'hours', 'minutes', 'seconds');
            else if (hours > 0) visible.push('hours', 'minutes', 'seconds');
            else visible.push('minutes', 'seconds');
        }
        return { values, visible, hundredths: String(hundredths).padStart(2, '0') };
    }

    function renderValue(el, value, fraction = '') {
        const main = String(value).padStart(2, '0');
        if (fraction) {
            el.innerHTML = `<span class="value-main">${main}</span><span class="value-fraction">${fraction}</span>`;
            return;
        }
        el.textContent = main;
    }

    function render() {
        if (!timerState) return;
        const now = Date.now();
        const live = getLiveState(timerState, now);
        const title = params.get('title') || live.displayTitle || live.label || '';
        titleEl.textContent = title;
        const hasVisibleContent = !!live.showMainDisplay || !!live.showMessage;
        const overlayVisible = live.visible !== false && hasVisibleContent;
        titleEl.classList.toggle('visible', overlayVisible && showTitle && !!title);
        overlay.classList.toggle('hidden', !overlayVisible);
        placeholder.classList.remove('visible');
        timerBox.style.display = live.showMainDisplay ? '' : 'none';

        const progressEnabled = kind === 'countdown'
            && (params.get('progress') ? params.get('progress') === 'true' : !!live.progress);
        if (progressWrap) progressWrap.classList.toggle('visible', progressEnabled && live.showMainDisplay);
        if (progressEnabled && progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, Math.round((live.percentComplete || 0) * 1000) / 10))}%`;

        messageEl.classList.toggle('visible', overlayVisible && !!live.showMessage);
        messageEl.textContent = live.completeMessage || '';

        if (live.showMainDisplay) {
            const parts = formatParts(live.displayMs, fullUnits);
            renderStandard(parts);
            renderCompact(parts);
        }

        maybePlayCompletionTone(live);
    }

    function getLiveState(state, now) {
        if (state.kind === 'countdown') {
            let remainingMs = state.remainingMs || 0;
            if (state.state === 'running' && state.startedAt) {
                remainingMs = Math.max(0, (state.startingRemainingMs || remainingMs) - (now - state.startedAt));
            } else if (!namedTimerId && state.mode === 'date' && state.targetAt) {
                remainingMs = Math.max(0, state.targetAt - now);
            } else if (!namedTimerId && state.state === 'running' && state.mode === 'duration') {
                remainingMs = Math.max(0, (state.startingRemainingMs || 0) - (now - state.startedAt));
            }

            let displayMs = remainingMs;
            let stateLabel = state.state;
            if (!namedTimerId && state.direction === 'up' && remainingMs === 0) {
                displayMs = Math.max(0, now - (state.startedAt + (state.startingRemainingMs || 0)));
                stateLabel = 'elapsed';
            }
            const totalMs = Math.max(0, state.totalMs || state.startingRemainingMs || state.durationMs || displayMs);
            const completed = state.state === 'completed' || (!namedTimerId && state.direction !== 'up' && remainingMs === 0);
            const showOnEnd = state.showOnEnd || 'message';
            return {
                ...state,
                state: stateLabel,
                remainingMs,
                displayMs,
                percentComplete: totalMs > 0 ? Math.min(1, Math.max(0, (totalMs - Math.min(totalMs, remainingMs)) / totalMs)) : 0,
                showMessage: completed && showOnEnd === 'message',
                completeMessage: completed ? (state.endMessage || '⌛️') : '',
                showMainDisplay: !(completed && showOnEnd === 'none') && !(completed && showOnEnd === 'message'),
                visible: state.visible !== false
            };
        }

        let elapsedMs = state.elapsedMs || state.initialMs || 0;
        if (state.state === 'running' && state.startedAt) {
            elapsedMs = Math.max(0, (state.accumulatedMs || 0) + (now - state.startedAt));
        }
        return {
            ...state,
            elapsedMs,
            displayMs: elapsedMs,
            percentComplete: 0,
            showMessage: false,
            completeMessage: '',
            showMainDisplay: true,
            visible: state.visible !== false
        };
    }

    function renderStandard(parts) {
        const visible = new Set(parts.visible);
        for (const unit of units) {
            const el = segmentEls[unit];
            const value = valueEls[unit];
            const show = visible.has(unit);
            el.style.display = show ? 'flex' : 'none';
            renderValue(value, parts.values[unit], showMilliseconds && unit === 'seconds' ? parts.hundredths : '');
        }
    }

    function renderCompact(parts) {
        const visible = parts.visible;
        for (const unit of units) {
            const show = visible.includes(unit);
            compactSegEls[unit].style.display = show ? 'inline-flex' : 'none';
            renderValue(compactEls[unit], parts.values[unit], showMilliseconds && unit === 'seconds' ? parts.hundredths : '');
        }
        const visibleNodes = units.filter(unit => visible.includes(unit));
        visibleNodes.forEach((unit, index) => {
            compactSegEls[unit].querySelector('.delimiter').style.display = index < visibleNodes.length - 1 ? 'inline-block' : 'none';
        });
    }

    function maybePlayCompletionTone(live) {
        if (kind !== 'countdown' || !namedTimerId) return;
        if (params.get('sound') === 'false') return;
        const enabled = timerSettings.sound_enabled;
        const isComplete = live.state === 'completed' || live.remainingMs === 0;
        if (!enabled) {
            prevCompletionState = isComplete;
            return;
        }
        if (!isComplete || prevCompletionState) {
            prevCompletionState = isComplete;
            return;
        }
        prevCompletionState = true;
        playTone(timerSettings.sound_volume || 0.35);
    }

    function playTone(volume) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = Math.max(0, Math.min(1, Number(volume) || 0.35)) * 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        osc.start(now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        osc.stop(now + 0.7);
        osc.onended = () => ctx.close().catch(() => {});
    }
})();
