/**
 * StreamPulse Trivia Studio — State & API Service
 * Centralized state tracking, REST API methods, and WebSocket synchronization
 */

let currentState = null;
const stateListeners = new Set();

export function getState() {
    return currentState;
}

export function setCurrentState(state) {
    currentState = state;
    stateListeners.forEach(fn => {
        try { fn(currentState); } catch (err) { console.error('State listener error:', err); }
    });
}

export function onStateChange(fn) {
    stateListeners.add(fn);
    return () => stateListeners.delete(fn);
}

export function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.classList.add('show');
    clearTimeout(el._toastTimer);
    el._toastTimer = setTimeout(() => {
        el.classList.remove('show');
        el.style.display = 'none';
    }, 2800);
}

export function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function fetchState() {
    try {
        const res = await fetch('/api/trivia?includeAnswers=true');
        if (res.ok) {
            const data = await res.json();
            setCurrentState(data);
            return data;
        }
    } catch (err) {
        console.warn('Fetch trivia state failed:', err);
    }
    return null;
}

// ── Gameplay Lifecycle Triggers ──────────────────────────────────────────────

export async function startQuestion(targetIdOrIndex = null, options = {}) {
    const body = {};
    if (typeof targetIdOrIndex === 'string') body.id = targetIdOrIndex;
    else if (typeof targetIdOrIndex === 'number') body.index = targetIdOrIndex;
    if (options.duration) body.duration = options.duration;

    const res = await fetch('/api/trivia/question/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (res.ok) {
        toast('Question started!');
        await fetchState();
    }
    return res.ok;
}

export async function revealAnswer() {
    const res = await fetch('/api/trivia/question/reveal', { method: 'POST' });
    if (res.ok) {
        toast('Answer revealed!');
        await fetchState();
    }
    return res.ok;
}

export async function nextQuestion() {
    const res = await fetch('/api/trivia/question/next', { method: 'POST' });
    if (res.ok) {
        toast('Advanced to next question!');
        await fetchState();
    }
    return res.ok;
}

export async function prevQuestion() {
    const res = await fetch('/api/trivia/question/prev', { method: 'POST' });
    if (res.ok) {
        toast('Returned to previous question!');
        await fetchState();
    }
    return res.ok;
}

export async function clearQuestion() {
    const res = await fetch('/api/trivia/question/clear', { method: 'POST' });
    if (res.ok) {
        toast('Question cleared.');
        await fetchState();
    }
    return res.ok;
}

export async function resetTrivia() {
    const res = await fetch('/api/trivia/reset', { method: 'POST' });
    if (res.ok) {
        toast('Trivia reset to idle.');
        await fetchState();
    }
    return res.ok;
}

// ── Question Bank CRUD & Management ──────────────────────────────────────────

export async function toggleQuestionDone(id) {
    try {
        const res = await fetch(`/api/trivia/question/${encodeURIComponent(id)}/toggle-done`, { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            toast(data.done ? 'Marked as Done (Played)' : 'Marked as Unplayed');
            await fetchState();
            return true;
        }
    } catch (err) {
        toast(`Failed to toggle done: ${err.message}`);
    }
    return false;
}

export async function setQuestionDone(id, done) {
    try {
        const res = await fetch(`/api/trivia/question/${encodeURIComponent(id)}/done`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ done })
        });
        if (res.ok) {
            await fetchState();
            return true;
        }
    } catch (err) {
        toast(`Failed to set done: ${err.message}`);
    }
    return false;
}

export async function moveQuestion(id, direction) {
    try {
        const res = await fetch(`/api/trivia/question/${encodeURIComponent(id)}/move`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ direction })
        });
        if (res.ok) {
            await fetchState();
            return true;
        }
    } catch (err) {
        console.warn('Move failed:', err);
    }
    return false;
}

export async function deleteQuestion(id) {
    if (!confirm('Are you sure you want to delete this question?')) return false;
    try {
        const res = await fetch(`/api/trivia/question/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) {
            toast('Question deleted.');
            await fetchState();
            return true;
        }
    } catch (err) {
        toast(`Failed to delete question: ${err.message}`);
    }
    return false;
}

export async function saveQuestion(payload, id = null) {
    try {
        let res;
        if (id) {
            res = await fetch(`/api/trivia/question/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok && payload.done !== undefined) {
                await fetch(`/api/trivia/question/${encodeURIComponent(id)}/done`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ done: Boolean(payload.done) })
                });
            }
        } else {
            res = await fetch('/api/trivia/question', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        if (res.ok) {
            toast('Question saved!');
            await fetchState();
            return true;
        }
    } catch (err) {
        alert('Failed to save question: ' + err.message);
    }
    return false;
}

export async function reorderQuestions(ids) {
    try {
        const res = await fetch('/api/trivia/questions/reorder', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        if (res.ok) {
            toast('Question bank reordered!');
            await fetchState();
            return true;
        }
    } catch (err) {
        console.warn('Reorder failed:', err);
    }
    return false;
}

export async function shuffleQuestions() {
    const res = await fetch('/api/trivia/questions/shuffle', { method: 'POST' });
    if (res.ok) {
        toast('Question bank shuffled!');
        await fetchState();
        return true;
    }
    toast('Failed to shuffle questions');
    return false;
}

export async function resetDoneQuestions() {
    const res = await fetch('/api/trivia/questions/reset-done', { method: 'POST' });
    if (res.ok) {
        toast('All questions marked as unplayed!');
        await fetchState();
        return true;
    }
    return false;
}

export async function importQuestions(questions, replace = false) {
    const res = await fetch('/api/trivia/questions/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questions, replace })
    });
    if (res.ok) {
        toast('Questions imported successfully!');
        await fetchState();
        return true;
    }
    const err = await res.json();
    alert(err.error || 'Import failed');
    return false;
}

// ── Presets ──────────────────────────────────────────────────────────────────

export async function loadPreset(id) {
    const res = await fetch(`/api/trivia/presets/${encodeURIComponent(id)}/load`, { method: 'POST' });
    if (res.ok) {
        toast('Preset loaded!');
        await fetchState();
        return true;
    }
    return false;
}

export async function savePreset(name, description = '') {
    const res = await fetch('/api/trivia/presets/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description })
    });
    if (res.ok) {
        toast('Preset saved successfully!');
        await fetchState();
        return true;
    }
    return false;
}

export async function deletePreset(id) {
    const res = await fetch(`/api/trivia/presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
        toast('Preset deleted.');
        await fetchState();
        return true;
    }
    const err = await res.json();
    alert(err.error || 'Failed to delete preset');
    return false;
}

// ── Settings & Theme Persistence ─────────────────────────────────────────────

export async function saveSettings(settings) {
    const res = await fetch('/api/trivia', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings })
    });
    if (res.ok) {
        toast('Settings saved!');
        await fetchState();
        return true;
    }
    return false;
}

export async function saveTheme(theme) {
    const res = await fetch('/api/trivia', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme })
    });
    if (res.ok) {
        toast('Theme saved!');
        await fetchState();
        return true;
    }
    return false;
}

// ── Leaderboard & Question Export/Import ─────────────────────────────────────

export async function resetLeaderboard(scope = 'session') {
    const res = await fetch('/api/trivia/leaderboard/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope })
    });
    if (res.ok) {
        toast(scope === 'season' ? 'Season leaderboard reset!' : 'Session stats cleared!');
        await fetchState();
        return true;
    }
    return false;
}

export async function importLeaderboard(data, { replace = false, scope = 'season' } = {}) {
    const body = Array.isArray(data) ? { players: data, replace, scope } : { ...data, replace, scope };
    const res = await fetch('/api/trivia/leaderboard/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (res.ok) {
        toast('Leaderboard stats imported!');
        await fetchState();
        return true;
    }
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Failed to import leaderboard');
    return false;
}

export async function saveLeaderboardTheme(leaderboardTheme) {
    const res = await fetch('/api/trivia/leaderboard/theme', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(leaderboardTheme)
    });
    if (res.ok) {
        toast('Leaderboard overlay theme saved!');
        await fetchState();
        return true;
    }
    return false;
}

export async function resetLeaderboardTheme() {
    const res = await fetch('/api/trivia/leaderboard/theme', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reset: true })
    });
    if (res.ok) {
        toast('Leaderboard overlay reset to defaults!');
        await fetchState();
        return true;
    }
    return false;
}

export async function exportQuestions() {
    const res = await fetch('/api/trivia/export');
    if (!res.ok) {
        toast('Export failed');
        return false;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trivia-questions-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Question bank exported!');
    return true;
}

export async function exportLeaderboard(scope = 'season', format = 'json') {
    const res = await fetch(`/api/trivia/leaderboard/export?scope=${encodeURIComponent(scope)}&format=${encodeURIComponent(format)}`);
    if (!res.ok) {
        toast('Export failed');
        return false;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trivia-leaderboard-${scope}-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Leaderboard exported (${format.toUpperCase()})!`);
    return true;
}

// ── Live WebSocket Feeds ─────────────────────────────────────────────────────

export function connectWs() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type && msg.type.startsWith('trivia:')) {
                fetchState();
            }
        } catch {}
    };
    ws.onclose = () => setTimeout(connectWs, 2500);
    return ws;
}
