/**
 * StreamPulse Trivia Studio — Leaderboard & Stats Controller
 * Manages session vs season standings table, scoring settings,
 * leaderboard overlay customization, OBS URL builder, and live postMessage preview.
 */

import {
    getState,
    esc,
    toast,
    saveSettings,
    resetLeaderboard,
    exportLeaderboard,
    importLeaderboard,
    saveLeaderboardTheme,
    resetLeaderboardTheme
} from './trivia-state.js';

let activeScope = 'season';
let activeViewSort = 'points';
let searchQuery = '';
let previewSample = true;
let previewCheckerboard = false;
let lbFormSignature = '';

const PREVIEW_SAMPLE_ENTRIES = [
    { rank: 1, key: 'pixelvalkyrie', name: 'PixelValkyrie', points: 640, correct: 6, answered: 7, accuracy: 86, streak: 4, bestStreak: 4 },
    { rank: 2, key: 'arcadeknight', name: 'ArcadeKnight', points: 520, correct: 5, answered: 6, accuracy: 83, streak: 2, bestStreak: 3 },
    { rank: 3, key: 'retrosynth', name: 'RetroSynth', points: 430, correct: 4, answered: 6, accuracy: 67, streak: 1, bestStreak: 2 },
    { rank: 4, key: 'turbotactician', name: 'TurboTactician', points: 310, correct: 3, answered: 5, accuracy: 60, streak: 0, bestStreak: 2 },
    { rank: 5, key: 'glitchmage', name: 'GlitchMage', points: 200, correct: 2, answered: 4, accuracy: 50, streak: 1, bestStreak: 1 }
];

function restoreLbPrefs() {
    try {
        const s = localStorage.getItem('trivia-lb-scope');
        if (s === 'session' || s === 'season') activeScope = s;
        const sort = localStorage.getItem('trivia-lb-view-sort');
        if (sort && ['points', 'correct', 'accuracy'].includes(sort)) activeViewSort = sort;
        const samp = localStorage.getItem('trivia-lb-sample');
        if (samp === '0' || samp === 'false') previewSample = false;
        const bg = localStorage.getItem('trivia-lb-bg');
        if (bg === 'checkerboard') previewCheckerboard = true;
    } catch {}
}

function saveLbPref(key, val) {
    try { localStorage.setItem(key, String(val)); } catch {}
}

function normalizeColorValue(val) {
    const raw = String(val || '').trim();
    if (!raw) return '';
    return raw.startsWith('#') ? raw : `#${raw}`;
}

function setPairColor(baseId, value, fallback) {
    const resolved = value || fallback;
    const textEl = document.getElementById(baseId);
    const pickerEl = document.getElementById(`${baseId}-picker`);
    if (textEl) textEl.value = resolved;
    if (pickerEl) {
        const hex6 = resolved.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
        if (hex6.length === 6) pickerEl.value = `#${hex6}`;
    }
}

function bindColorPair(baseId, onUpdate) {
    const textEl = document.getElementById(baseId);
    const pickerEl = document.getElementById(`${baseId}-picker`);
    if (pickerEl && textEl) {
        pickerEl.addEventListener('input', () => {
            const current = textEl.value.trim().replace(/^#/, '');
            const alpha = current.length === 8 ? current.slice(6, 8) : '';
            textEl.value = pickerEl.value + alpha;
            onUpdate();
        });
        textEl.addEventListener('input', () => {
            const clean = textEl.value.trim().replace(/^#/, '');
            if (clean.length >= 6 && /^[0-9a-fA-F]{6}/.test(clean)) {
                pickerEl.value = `#${clean.slice(0, 6)}`;
            }
            onUpdate();
        });
    }
}

function collectThemeFormPayload() {
    const limitVal = parseInt(document.getElementById('cfg-lb-limit')?.value, 10);
    const scaleVal = parseFloat(document.getElementById('cfg-lb-scale')?.value);
    return {
        layout: document.getElementById('cfg-lb-layout')?.value || 'full',
        theme: document.getElementById('cfg-lb-theme')?.value || 'modern',
        scope: document.getElementById('cfg-lb-scope')?.value || 'season',
        sortBy: document.getElementById('cfg-lb-sort')?.value || 'points',
        limit: Number.isFinite(limitVal) ? Math.max(1, Math.min(25, limitVal)) : 10,
        title: document.getElementById('cfg-lb-title')?.value.trim() || 'Trivia Leaderboard',
        bgColor: normalizeColorValue(document.getElementById('cfg-lb-bg-color')?.value) || '#0e1118f0',
        cardBgColor: normalizeColorValue(document.getElementById('cfg-lb-card-bg')?.value) || '#161b26cc',
        accentColor: normalizeColorValue(document.getElementById('cfg-lb-accent-color')?.value) || '#6366f1',
        textColor: normalizeColorValue(document.getElementById('cfg-lb-text-color')?.value) || '#f8fafc',
        showPoints: document.getElementById('cfg-lb-show-points')?.checked !== false,
        showCorrect: document.getElementById('cfg-lb-show-correct')?.checked !== false,
        showAccuracy: document.getElementById('cfg-lb-show-accuracy')?.checked !== false,
        showStreak: document.getElementById('cfg-lb-show-streak')?.checked !== false,
        showHeader: document.getElementById('cfg-lb-show-header')?.checked !== false,
        scale: Number.isFinite(scaleVal) ? Math.max(0.5, Math.min(2.0, scaleVal)) : 1
    };
}

export function buildLeaderboardObsUrl() {
    const cfg = collectThemeFormPayload();
    const qs = new URLSearchParams();
    qs.set('scope', cfg.scope);
    qs.set('sort', cfg.sortBy);
    qs.set('limit', String(cfg.limit));
    qs.set('layout', cfg.layout);
    qs.set('theme', cfg.theme);
    if (cfg.title && cfg.title !== 'Trivia Leaderboard') qs.set('title', cfg.title);
    if (!cfg.showPoints) qs.set('points', '0');
    if (!cfg.showCorrect) qs.set('correct', '0');
    if (!cfg.showAccuracy) qs.set('accuracy', '0');
    if (!cfg.showStreak) qs.set('streak', '0');
    if (!cfg.showHeader) qs.set('header', '0');
    if (cfg.scale !== 1) qs.set('scale', String(cfg.scale));
    return `${location.origin}/overlays/trivia-leaderboard.html?${qs.toString()}`;
}

export function updateLeaderboardPreview() {
    const urlInput = document.getElementById('lb-obs-url');
    if (urlInput) urlInput.value = buildLeaderboardObsUrl();

    const scaleLabel = document.getElementById('cfg-lb-scale-val');
    const scaleInput = document.getElementById('cfg-lb-scale');
    if (scaleLabel && scaleInput) {
        scaleLabel.textContent = `${(parseFloat(scaleInput.value) || 1).toFixed(2)}×`;
    }

    const wrap = document.getElementById('lb-preview-wrap');
    if (wrap) {
        wrap.classList.toggle('checkerboard', previewCheckerboard);
    }

    const bgBtn = document.getElementById('btn-lb-prev-bg');
    if (bgBtn) bgBtn.textContent = previewCheckerboard ? 'Canvas: Grid' : 'Canvas: Dark';

    const sampleBtn = document.getElementById('btn-lb-prev-sample');
    if (sampleBtn) {
        sampleBtn.textContent = previewSample ? 'Sample: ON' : 'Sample: OFF';
        sampleBtn.classList.toggle('active', previewSample);
    }

    const iframe = document.getElementById('lb-preview-iframe');
    if (!iframe || !iframe.contentWindow) return;

    const themeCfg = collectThemeFormPayload();
    const state = getState();
    const bucket = themeCfg.scope === 'session' ? state?.leaderboard?.session : state?.leaderboard?.season;
    const liveEntries = bucket?.entries || [];

    const previewParams = {
        preview: 'true',
        sample: previewSample ? '1' : '0',
        scope: themeCfg.scope,
        sort: themeCfg.sortBy,
        limit: String(themeCfg.limit),
        layout: themeCfg.layout,
        theme: themeCfg.theme,
        title: themeCfg.title,
        points: themeCfg.showPoints ? '1' : '0',
        correct: themeCfg.showCorrect ? '1' : '0',
        accuracy: themeCfg.showAccuracy ? '1' : '0',
        streak: themeCfg.showStreak ? '1' : '0',
        header: themeCfg.showHeader ? '1' : '0',
        scale: String(themeCfg.scale),
        bg: themeCfg.bgColor,
        cardbg: themeCfg.cardBgColor,
        accent: themeCfg.accentColor,
        text: themeCfg.textColor
    };

    try {
        iframe.contentWindow.postMessage({
            type: 'trivia-leaderboard:preview-update',
            params: previewParams,
            theme: themeCfg,
            entries: previewSample ? PREVIEW_SAMPLE_ENTRIES : liveEntries
        }, '*');
    } catch {}
}

function sortRows(entries, sortBy) {
    const copy = (entries || []).map(e => ({ ...e }));
    copy.sort((a, b) => {
        if (sortBy === 'correct') {
            return (b.correct - a.correct) || (b.points - a.points) || (b.accuracy - a.accuracy) || a.name.localeCompare(b.name);
        }
        if (sortBy === 'accuracy') {
            return (b.accuracy - a.accuracy) || (b.correct - a.correct) || (b.points - a.points) || a.name.localeCompare(b.name);
        }
        return (b.points - a.points) || (b.correct - a.correct) || (b.accuracy - a.accuracy) || a.name.localeCompare(b.name);
    });
    return copy.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function renderLeaderboard(currentState) {
    if (!currentState) return;

    const btnSeason = document.getElementById('btn-lb-scope-season');
    const btnSession = document.getElementById('btn-lb-scope-session');
    if (btnSeason) btnSeason.classList.toggle('active', activeScope === 'season');
    if (btnSession) btnSession.classList.toggle('active', activeScope === 'session');

    const viewSortEl = document.getElementById('lb-view-sort');
    if (viewSortEl && viewSortEl.value !== activeViewSort) {
        viewSortEl.value = activeViewSort;
    }

    const bucket = activeScope === 'session'
        ? currentState.leaderboard?.session
        : currentState.leaderboard?.season;

    const totalEl = document.getElementById('lb-total-players');
    if (totalEl) {
        totalEl.textContent = `${bucket?.totalPlayers || 0} players`;
    }

    const seasonDateEl = document.getElementById('lb-season-date');
    if (seasonDateEl && currentState.leaderboard?.season?.seasonStartedAt) {
        const d = new Date(currentState.leaderboard.season.seasonStartedAt);
        seasonDateEl.textContent = `Season started ${d.toLocaleDateString()}`;
    }

    const tbody = document.getElementById('lb-table-body');
    if (tbody) {
        const ranked = sortRows(bucket?.entries || [], activeViewSort);
        const needle = searchQuery.trim().toLowerCase();
        const filtered = needle ? ranked.filter(p => p.name.toLowerCase().includes(needle)) : ranked;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">${needle ? 'No matching players found.' : `No ${activeScope} trivia stats yet — reveal a question with chat votes to score players.`}</td></tr>`;
        } else {
            tbody.innerHTML = filtered.map(p => {
                const rankClass = p.rank <= 3 ? ` lb-rank-${p.rank}` : '';
                return `
                    <tr>
                        <td><span class="lb-rank-badge${rankClass}">#${esc(p.rank)}</span></td>
                        <td style="font-weight: 600;">${esc(p.name)}</td>
                        <td style="font-weight: 700; color: var(--accent, #60a5fa);">${esc(p.points)}</td>
                        <td>${esc(p.correct)} / ${esc(p.answered)}</td>
                        <td>${esc(p.accuracy)}%</td>
                        <td>${esc(p.streak)} <span style="color: var(--text-muted); font-size: 11px;">(best ${esc(p.bestStreak)})</span></td>
                    </tr>
                `;
            }).join('');
        }
    }

    updateLeaderboardPreview();

    // Only hydrate settings/theme inputs when server values change so unsaved edits aren't overwritten
    const lbSettings = currentState.settings?.leaderboard || {};
    const lbTheme = currentState.leaderboardTheme || {};
    const sig = JSON.stringify([lbSettings, lbTheme]);
    if (sig === lbFormSignature) return;
    lbFormSignature = sig;

    const enEl = document.getElementById('cfg-lb-enabled');
    if (enEl) enEl.checked = lbSettings.enabled !== false;
    const sortEl = document.getElementById('cfg-lb-sort');
    if (sortEl) sortEl.value = lbSettings.sortBy || 'points';
    const spdEl = document.getElementById('cfg-lb-speed-bonus');
    if (spdEl) spdEl.checked = Boolean(lbSettings.speedBonus);
    const cmdEl = document.getElementById('cfg-lb-commands-enabled');
    if (cmdEl) cmdEl.checked = lbSettings.commandsEnabled !== false;
    const cdEl = document.getElementById('cfg-lb-cooldown');
    if (cdEl) cdEl.value = lbSettings.commandCooldownMs ?? 3000;
    const topEl = document.getElementById('cfg-lb-top-limit');
    if (topEl) topEl.value = lbSettings.topLimit || 10;

    const layEl = document.getElementById('cfg-lb-layout');
    if (layEl) layEl.value = lbTheme.layout || 'full';
    const thmEl = document.getElementById('cfg-lb-theme');
    if (thmEl) thmEl.value = lbTheme.theme || 'modern';
    const scpEl = document.getElementById('cfg-lb-scope');
    if (scpEl) scpEl.value = lbTheme.scope || 'season';
    const limEl = document.getElementById('cfg-lb-limit');
    if (limEl) limEl.value = lbTheme.limit || 10;
    const ttlEl = document.getElementById('cfg-lb-title');
    if (ttlEl) ttlEl.value = lbTheme.title || 'Trivia Leaderboard';

    setPairColor('cfg-lb-bg-color', lbTheme.bgColor, '#0e1118f0');
    setPairColor('cfg-lb-card-bg', lbTheme.cardBgColor, '#161b26cc');
    setPairColor('cfg-lb-accent-color', lbTheme.accentColor, '#6366f1');
    setPairColor('cfg-lb-text-color', lbTheme.textColor, '#f8fafc');

    const shPts = document.getElementById('cfg-lb-show-points');
    if (shPts) shPts.checked = lbTheme.showPoints !== false;
    const shCor = document.getElementById('cfg-lb-show-correct');
    if (shCor) shCor.checked = lbTheme.showCorrect !== false;
    const shAcc = document.getElementById('cfg-lb-show-accuracy');
    if (shAcc) shAcc.checked = lbTheme.showAccuracy !== false;
    const shStr = document.getElementById('cfg-lb-show-streak');
    if (shStr) shStr.checked = lbTheme.showStreak !== false;
    const shHdr = document.getElementById('cfg-lb-show-header');
    if (shHdr) shHdr.checked = lbTheme.showHeader !== false;

    const sclEl = document.getElementById('cfg-lb-scale');
    if (sclEl) sclEl.value = lbTheme.scale || 1;

    updateLeaderboardPreview();
}

export function initLeaderboardListeners() {
    restoreLbPrefs();

    document.getElementById('btn-lb-scope-season')?.addEventListener('click', () => {
        activeScope = 'season';
        saveLbPref('trivia-lb-scope', activeScope);
        renderLeaderboard(getState());
    });
    document.getElementById('btn-lb-scope-session')?.addEventListener('click', () => {
        activeScope = 'session';
        saveLbPref('trivia-lb-scope', activeScope);
        renderLeaderboard(getState());
    });

    document.getElementById('lb-view-sort')?.addEventListener('change', (e) => {
        activeViewSort = e.target.value;
        saveLbPref('trivia-lb-view-sort', activeViewSort);
        renderLeaderboard(getState());
    });

    document.getElementById('lb-search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderLeaderboard(getState());
    });

    document.getElementById('btn-lb-reset-session')?.addEventListener('click', async () => {
        if (!confirm('Clear current session leaderboard scores? Season/all-time stats will be preserved.')) return;
        await resetLeaderboard('session');
    });

    document.getElementById('btn-lb-reset-season')?.addEventListener('click', async () => {
        if (!confirm('Start a new Trivia Season and clear ALL persisted season stats?')) return;
        await resetLeaderboard('season');
    });

    document.getElementById('btn-lb-export-json')?.addEventListener('click', () => exportLeaderboard(activeScope, 'json'));
    document.getElementById('btn-lb-export-csv')?.addEventListener('click', () => exportLeaderboard(activeScope, 'csv'));

    // Leaderboard Import Modal
    document.getElementById('btn-lb-import-json')?.addEventListener('click', () => {
        const txt = document.getElementById('lb-import-json');
        const rep = document.getElementById('lb-import-replace');
        const scp = document.getElementById('lb-import-scope');
        if (txt) txt.value = '';
        if (rep) rep.checked = false;
        if (scp) scp.value = activeScope;
        document.getElementById('lb-import-modal')?.classList.add('open');
    });
    document.getElementById('btn-close-lb-import')?.addEventListener('click', () => {
        document.getElementById('lb-import-modal')?.classList.remove('open');
    });
    document.getElementById('btn-cancel-lb-import')?.addEventListener('click', () => {
        document.getElementById('lb-import-modal')?.classList.remove('open');
    });
    document.getElementById('lb-import-file')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const txt = document.getElementById('lb-import-json');
        if (txt) txt.value = text;
    });
    document.getElementById('btn-confirm-lb-import')?.addEventListener('click', async () => {
        const raw = document.getElementById('lb-import-json')?.value.trim();
        const replace = Boolean(document.getElementById('lb-import-replace')?.checked);
        const scope = document.getElementById('lb-import-scope')?.value || 'season';
        if (!raw) return alert('Paste exported leaderboard JSON or upload a file.');
        try {
            const parsed = JSON.parse(raw);
            const ok = await importLeaderboard(parsed, { replace, scope });
            if (ok) document.getElementById('lb-import-modal')?.classList.remove('open');
        } catch (err) {
            alert('Invalid JSON: ' + err.message);
        }
    });

    // Scoring & Commands Save
    document.getElementById('btn-lb-save-settings')?.addEventListener('click', async () => {
        await saveSettings({
            leaderboard: {
                enabled: document.getElementById('cfg-lb-enabled')?.checked !== false,
                sortBy: document.getElementById('cfg-lb-sort')?.value || 'points',
                speedBonus: Boolean(document.getElementById('cfg-lb-speed-bonus')?.checked),
                commandsEnabled: document.getElementById('cfg-lb-commands-enabled')?.checked !== false,
                commandCooldownMs: Math.max(0, parseInt(document.getElementById('cfg-lb-cooldown')?.value, 10) || 0),
                topLimit: Math.max(1, parseInt(document.getElementById('cfg-lb-top-limit')?.value, 10) || 10)
            }
        });
    });

    // Live Preview Input Bindings
    const liveInputs = [
        'cfg-lb-layout', 'cfg-lb-theme', 'cfg-lb-scope', 'cfg-lb-sort',
        'cfg-lb-limit', 'cfg-lb-title', 'cfg-lb-scale',
        'cfg-lb-show-points', 'cfg-lb-show-correct', 'cfg-lb-show-accuracy',
        'cfg-lb-show-streak', 'cfg-lb-show-header'
    ];
    for (const id of liveInputs) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.addEventListener('input', updateLeaderboardPreview);
        el.addEventListener('change', updateLeaderboardPreview);
    }

    for (const baseId of ['cfg-lb-bg-color', 'cfg-lb-card-bg', 'cfg-lb-accent-color', 'cfg-lb-text-color']) {
        bindColorPair(baseId, updateLeaderboardPreview);
    }

    document.getElementById('btn-lb-prev-bg')?.addEventListener('click', () => {
        previewCheckerboard = !previewCheckerboard;
        saveLbPref('trivia-lb-bg', previewCheckerboard ? 'checkerboard' : 'dark');
        updateLeaderboardPreview();
    });

    document.getElementById('btn-lb-prev-sample')?.addEventListener('click', () => {
        previewSample = !previewSample;
        saveLbPref('trivia-lb-sample', previewSample ? '1' : '0');
        updateLeaderboardPreview();
    });

    document.getElementById('btn-lb-copy-url')?.addEventListener('click', async () => {
        const url = buildLeaderboardObsUrl();
        try {
            await navigator.clipboard.writeText(url);
            toast('Leaderboard OBS URL copied!');
        } catch {
            const el = document.getElementById('lb-obs-url');
            if (el) { el.select(); document.execCommand('copy'); }
            toast('Leaderboard OBS URL copied!');
        }
    });

    document.getElementById('btn-lb-save-theme')?.addEventListener('click', async () => {
        await saveLeaderboardTheme(collectThemeFormPayload());
    });

    document.getElementById('btn-lb-reset-theme')?.addEventListener('click', async () => {
        if (!confirm('Reset leaderboard overlay customization back to defaults?')) return;
        lbFormSignature = '';
        await resetLeaderboardTheme();
    });

    window.addEventListener('message', (event) => {
        if (event.data?.type === 'trivia-leaderboard:overlay-ready') {
            updateLeaderboardPreview();
        }
    });
}
