'use strict';

/**
 * StreamPulse Matchup Scoreboard & Versus Engine
 * 
 * Provides live score tracking, series management, and visual HUD overlays
 * for 2 to 4 competitors or teams (fighting games, esports, speedrun races, TCGs).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

function createDefaultMatchup() {
    return {
        id: `matchup-${Date.now().toString(36)}`,
        title: 'Versus Showdown',
        phase: 'Grand Finals',
        details: 'Best of 5',
        competitorCount: 2,
        competitors: [
            { id: 'c1', name: 'Player 1', tag: '', color: DEFAULT_COLORS[0], score: 0 },
            { id: 'c2', name: 'Player 2', tag: '', color: DEFAULT_COLORS[1], score: 0 }
        ],
        format: 'bestOf', // 'points' | 'bestOf' | 'firstTo'
        bestOf: 5,
        targetScore: 3,
        status: 'ACTIVE', // 'ACTIVE' | 'COMPLETED'
        winner: null,
        clock: {
            enabled: true,
            mode: 'countdown', // 'countdown' | 'stopwatch' | 'race'
            runnerTimersMode: 'finish', // 'finish' (overall clock only, reveal runner finish times) | 'always' (show live runner clocks) | 'off' (overall clock only, no runner timers)
            showSplits: true, // true (show +delta splits behind 1st) | false (show finish times only)
            duration: 99,
            remaining: 99,
            elapsed: 0,
            isRunning: false,
            startedAt: null,
            estimate: '', // e.g. "45:00" for GDQ speedruns
            split: ''
        },
        queue: [],
        history: [],
        presets: [
            {
                id: 'preset-sf6-ft10',
                name: 'Street Fighter 6 — First to 10 (FT10)',
                title: 'Street Fighter 6',
                phase: 'FT10 Exhibition',
                details: 'Decider Match',
                format: 'firstTo',
                targetScore: 10,
                competitorCount: 2,
                clock: { enabled: true, mode: 'countdown', duration: 99, remaining: 99, elapsed: 0, isRunning: false, estimate: '' },
                competitors: [
                    { id: 'c1', name: 'Player 1', tag: 'Ken', color: '#ef4444', score: 0 },
                    { id: 'c2', name: 'Player 2', tag: 'Luke', color: '#3b82f6', score: 0 }
                ]
            },
            {
                id: 'preset-tekken-bo5',
                name: 'Tekken 8 — Best of 5',
                title: 'Tekken 8',
                phase: 'Winners Finals',
                details: 'Best of 5',
                format: 'bestOf',
                bestOf: 5,
                targetScore: 3,
                competitorCount: 2,
                clock: { enabled: true, mode: 'countdown', duration: 60, remaining: 60, elapsed: 0, isRunning: false, estimate: '' },
                competitors: [
                    { id: 'c1', name: 'Player 1', tag: 'Jin', color: '#ef4444', score: 0 },
                    { id: 'c2', name: 'Player 2', tag: 'Kazuya', color: '#8b5cf6', score: 0 }
                ]
            },
            {
                id: 'preset-smash-bo3',
                name: 'Super Smash Bros — Best of 3',
                title: 'Smash Ultimate',
                phase: 'Semifinals',
                details: '3 Stock · 7 Mins',
                format: 'bestOf',
                bestOf: 3,
                targetScore: 2,
                competitorCount: 2,
                clock: { enabled: true, mode: 'countdown', duration: 420, remaining: 420, elapsed: 0, isRunning: false, estimate: '' },
                competitors: [
                    { id: 'c1', name: 'Player 1', tag: 'Fox', color: '#ef4444', score: 0 },
                    { id: 'c2', name: 'Player 2', tag: 'Falco', color: '#3b82f6', score: 0 }
                ]
            },
            {
                id: 'preset-speedrun-1v1',
                name: 'Speedrun 1v1 Race (GDQ Style)',
                title: 'Speedrun Race 1v1',
                phase: 'Any% Race',
                details: 'Target Estimate: 45:00',
                format: 'bestOf',
                bestOf: 1,
                targetScore: 1,
                competitorCount: 2,
                clock: { enabled: true, mode: 'race', runnerTimersMode: 'finish', showSplits: true, duration: 0, remaining: 0, elapsed: 0, isRunning: false, estimate: '45:00' },
                competitors: [
                    { id: 'c1', name: 'Runner 1', tag: 'PB 42:15', color: '#10b981', score: 0 },
                    { id: 'c2', name: 'Runner 2', tag: 'PB 43:30', color: '#3b82f6', score: 0 }
                ]
            },
            {
                id: 'preset-mariokart-4p',
                name: 'Mario Kart — 4-Player Points FFA',
                title: 'Mario Kart 8 Deluxe',
                phase: 'Grand Prix GP4',
                details: '150cc · 4 Races',
                format: 'points',
                targetScore: 0,
                competitorCount: 4,
                clock: { enabled: false, mode: 'countdown', duration: 99, remaining: 99, elapsed: 0, isRunning: false, estimate: '' },
                competitors: [
                    { id: 'c1', name: 'Player 1', tag: 'Mario', color: '#ef4444', score: 0 },
                    { id: 'c2', name: 'Player 2', tag: 'Luigi', color: '#10b981', score: 0 },
                    { id: 'c3', name: 'Player 3', tag: 'Peach', color: '#ec4899', score: 0 },
                    { id: 'c4', name: 'Player 4', tag: 'Bowser', color: '#f59e0b', score: 0 }
                ]
            }
        ],
        activeQueueIndex: -1,
        updatedAt: new Date().toISOString()
    };
}

function createMatchupService({
    dataDir,
    broadcastToOverlays = () => {},
    onAlert = () => {},
    log = console.log,
    error = console.error
} = {}) {
    const matchupFile = dataDir ? path.join(dataDir, 'matchup.json') : null;
    let activeMatchup = null;
    let clockTimer = null;
    let lastTickAt = Date.now();

    // Clocks never survive a restart in a running state (the ticker is gone).
    function settleClocksAfterLoad(data) {
        if (data.clock) data.clock.isRunning = false;
        for (const c of (data.competitors || [])) {
            if (c.timer) c.timer.isRunning = false;
        }
    }

    function load() {
        if (!matchupFile) {
            activeMatchup = createDefaultMatchup();
            return;
        }
        try {
            if (fs.existsSync(matchupFile)) {
                const raw = fs.readFileSync(matchupFile, 'utf8');
                const data = JSON.parse(raw);
                if (data && Array.isArray(data.competitors) && data.competitors.length >= 2) {
                    if (!Array.isArray(data.queue)) data.queue = [];
                    if (!Array.isArray(data.presets)) data.presets = createDefaultMatchup().presets;
                    if (!Array.isArray(data.history)) data.history = [];
                    if (!data.clock) data.clock = createDefaultMatchup().clock;
                    settleClocksAfterLoad(data);
                    activeMatchup = data;
                    return;
                }
            }
        } catch (err) {
            error('[Matchup] Error reading matchup file, initializing default:', err.message);
        }
        activeMatchup = createDefaultMatchup();
        save();
    }

    function save() {
        if (!matchupFile || !activeMatchup) return;
        try {
            activeMatchup.updatedAt = new Date().toISOString();
            fs.writeFileSync(matchupFile, JSON.stringify(activeMatchup, null, 2), 'utf8');
        } catch (err) {
            error('[Matchup] Error saving matchup file:', err.message);
        }
    }

    function broadcastUpdate() {
        if (!activeMatchup) return;
        broadcastToOverlays('matchup-update', activeMatchup);
    }

    function logEvent(type, text) {
        if (!activeMatchup) return;
        if (!Array.isArray(activeMatchup.log)) activeMatchup.log = [];
        activeMatchup.log.push({ ts: new Date().toISOString(), clock: activeMatchup.clock ? Math.round((activeMatchup.clock.elapsed || 0) * 10) / 10 : 0, type, text });
        if (activeMatchup.log.length > 500) activeMatchup.log.splice(0, activeMatchup.log.length - 500);
    }

    function snapshotRecord(status) {
        const m = activeMatchup;
        return {
            id: `mh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            status,
            title: m.title, phase: m.phase, details: m.details, format: m.format,
            bestOf: m.bestOf, targetScore: m.targetScore,
            winner: m.winner || null,
            clock: m.clock ? JSON.parse(JSON.stringify(m.clock)) : null,
            competitors: m.competitors.map(c => ({
                name: c.name, score: c.score, tag: c.tag, color: c.color,
                timer: c.timer ? { elapsed: c.timer.elapsed, finished: c.timer.finished, finishTime: c.timer.finishTime, delta: c.timer.delta } : null
            })),
            log: (m.log || []).slice()
        };
    }

    function saveProgress() {
        if (!activeMatchup) load();
        const rec = snapshotRecord('IN_PROGRESS');
        activeMatchup.history.unshift(rec);
        if (activeMatchup.history.length > 100) activeMatchup.history.length = 100;
        logEvent('save', 'Progress saved');
        save();
        return rec;
    }

    function checkWinnerCondition() {
        if (!activeMatchup) return false;
        const target = activeMatchup.targetScore;
        if (!target || target <= 0) return false;

        const leader = activeMatchup.competitors.find(c => (Number(c.score) || 0) >= target);
        if (leader) {
            const isNewWinner = activeMatchup.status !== 'COMPLETED' || activeMatchup.winner !== leader.name;
            activeMatchup.winner = leader.name;
            activeMatchup.status = 'COMPLETED';

            if (isNewWinner) {
                if (activeMatchup.clock && activeMatchup.clock.isRunning) {
                    activeMatchup.clock.isRunning = false;
                    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
                }
                if (!Array.isArray(activeMatchup.history)) activeMatchup.history = [];
                logEvent('winner', `${leader.name} won the set`);
                activeMatchup.history.unshift(snapshotRecord('COMPLETED'));
                activeMatchup.history.length = Math.min(activeMatchup.history.length, 100);

                log(`[Matchup] Competitor "${leader.name}" won the set (${leader.score} wins)!`);
                onAlert({
                    type: 'poll_end',
                    subType: 'matchup_winner',
                    winner: leader.name,
                    score: leader.score,
                    title: activeMatchup.title,
                    phase: activeMatchup.phase,
                    details: activeMatchup.details
                });
            }
            return true;
        } else if (activeMatchup.status === 'COMPLETED') {
            activeMatchup.winner = null;
            activeMatchup.status = 'ACTIVE';
        }
        return false;
    }

    function getMatchup() {
        if (!activeMatchup) load();
        return activeMatchup;
    }

    function updateMatchup(data = {}) {
        if (!activeMatchup) load();

        if (data.title !== undefined) activeMatchup.title = String(data.title || '').trim() || 'Versus Showdown';
        if (data.phase !== undefined) activeMatchup.phase = String(data.phase || '').trim();
        if (data.details !== undefined) activeMatchup.details = String(data.details || '').trim();
        if (data.format !== undefined) activeMatchup.format = data.format === 'points' ? 'points' : (data.format === 'firstTo' ? 'firstTo' : 'bestOf');

        if (data.roundsBestOf !== undefined) {
            activeMatchup.roundsBestOf = Math.max(0, parseInt(data.roundsBestOf, 10) || 0);
            activeMatchup.competitors.forEach(c => { c.rounds = 0; });
        }

        if (data.bestOf !== undefined) {
            activeMatchup.bestOf = Math.max(0, parseInt(data.bestOf, 10) || 0);
            if (activeMatchup.format === 'bestOf') {
                activeMatchup.targetScore = activeMatchup.bestOf > 0 ? Math.ceil(activeMatchup.bestOf / 2) : 0;
            }
        }

        if (data.targetScore !== undefined && activeMatchup.format === 'firstTo') {
            activeMatchup.targetScore = Math.max(1, parseInt(data.targetScore, 10) || 1);
        } else if (activeMatchup.format === 'points') {
            activeMatchup.targetScore = 0;
        }

        if (data.competitorCount !== undefined) {
            const count = Math.max(2, Math.min(4, parseInt(data.competitorCount, 10) || 2));
            activeMatchup.competitorCount = count;

            while (activeMatchup.competitors.length < count) {
                const idx = activeMatchup.competitors.length;
                activeMatchup.competitors.push({
                    id: `c${idx + 1}`,
                    name: `Player ${idx + 1}`,
                    tag: '',
                    color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
                    score: 0
                });
            }
            if (activeMatchup.competitors.length > count) {
                activeMatchup.competitors = activeMatchup.competitors.slice(0, count);
            }
        }

        if (Array.isArray(data.competitors)) {
            data.competitors.forEach((c, idx) => {
                if (idx < activeMatchup.competitors.length && c) {
                    if (c.name !== undefined) activeMatchup.competitors[idx].name = String(c.name || '').trim() || `Player ${idx + 1}`;
                    if (c.tag !== undefined) activeMatchup.competitors[idx].tag = String(c.tag || '').trim();
                    if (c.color !== undefined) activeMatchup.competitors[idx].color = String(c.color || '').trim() || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
                    if (c.score !== undefined) activeMatchup.competitors[idx].score = Math.max(0, parseInt(c.score, 10) || 0);
                }
            });
        }

        if ((data.format !== undefined || data.bestOf !== undefined || data.targetScore !== undefined) && activeMatchup.targetScore > 0) {
            activeMatchup.competitors.forEach(c => {
                c.score = Math.min(activeMatchup.targetScore, Math.max(0, Number(c.score) || 0));
            });
        }

        checkWinnerCondition();
        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function resolveIndex(indexOrId) {
        if (!activeMatchup) load();
        if (typeof indexOrId === 'string' && indexOrId.startsWith('c')) {
            const found = activeMatchup.competitors.findIndex(c => c.id === indexOrId);
            if (found !== -1) return found;
        }
        const idx = parseInt(indexOrId, 10);
        if (!isNaN(idx) && idx >= 0 && idx < activeMatchup.competitors.length) {
            return idx;
        }
        return -1;
    }

    function updateScore(indexOrId, { delta, score, roundDelta, rounds } = {}) {
        if (!activeMatchup) load();
        const idx = resolveIndex(indexOrId);
        if (idx === -1) {
            throw new Error(`Invalid competitor identifier ${indexOrId}`);
        }

        const comp = activeMatchup.competitors[idx];
        const maxGameScore = Number(activeMatchup.targetScore) > 0 ? Number(activeMatchup.targetScore) : 0;
        const maxAllowedForComp = maxGameScore > 0 ? maxGameScore : Infinity;

        if (delta !== undefined) {
            const d = parseInt(delta, 10) || 0;
            comp.score = Math.min(maxAllowedForComp, Math.max(0, (comp.score || 0) + d));
        } else if (score !== undefined) {
            comp.score = Math.max(0, parseInt(score, 10) || 0);
        }
        const seriesDecided = maxGameScore > 0 && activeMatchup.competitors.some(c => (Number(c.score) || 0) >= maxGameScore);
        const rb = Number(activeMatchup.roundsBestOf) || 0;
        const targetRounds = rb > 0 ? Math.ceil(rb / 2) : 0;
        if (roundDelta !== undefined) {
            const rd = parseInt(roundDelta, 10) || 0;
            if (targetRounds > 0 && (!seriesDecided || rd < 0)) {
                comp.rounds = Math.max(0, (comp.rounds || 0) + rd);
                logEvent('round', `${comp.name} rounds ${comp.rounds}`);
                if (comp.rounds >= targetRounds) {
                    activeMatchup.competitors.forEach(c => { c.rounds = 0; });
                    comp.score = Math.min(maxAllowedForComp, (comp.score || 0) + 1);
                    logEvent('game', `${comp.name} won the game`);
                } else {
                    comp.rounds = Math.min(targetRounds - 1, comp.rounds);
                }
            } else if (seriesDecided || targetRounds === 0) {
                comp.rounds = 0;
            }
        } else if (rounds !== undefined) {
            if (targetRounds > 0 && !seriesDecided) {
                comp.rounds = Math.max(0, parseInt(rounds, 10) || 0);
                logEvent('round', `${comp.name} rounds ${comp.rounds}`);
                if (comp.rounds >= targetRounds) {
                    activeMatchup.competitors.forEach(c => { c.rounds = 0; });
                    comp.score = Math.min(maxAllowedForComp, (comp.score || 0) + 1);
                    logEvent('game', `${comp.name} won the game`);
                } else {
                    comp.rounds = Math.min(targetRounds - 1, comp.rounds);
                }
            } else {
                comp.rounds = 0;
            }
        } else {
            if (seriesDecided) activeMatchup.competitors.forEach(c => { c.rounds = 0; });
            logEvent('score', `${comp.name} score ${comp.score}`);
        }

        checkWinnerCondition();
        save();
        broadcastUpdate();
        return { competitor: comp, matchup: activeMatchup };
    }

    function setCompetitorScore(indexOrId, opts) {
        const res = updateScore(indexOrId, opts);
        return res.matchup;
    }

    function setCompetitorCount(count) {
        return updateMatchup({ competitorCount: count });
    }

    function updateCompetitor(indexOrId, data = {}) {
        if (!activeMatchup) load();
        const idx = resolveIndex(indexOrId);
        if (idx === -1) throw new Error(`Invalid competitor identifier ${indexOrId}`);
        const comps = [...activeMatchup.competitors];
        comps[idx] = { ...comps[idx], ...data };
        return updateMatchup({ competitors: comps });
    }

    function swapSides() {
        if (!activeMatchup) load();
        if (activeMatchup.competitors.length >= 2) {
            const temp = { ...activeMatchup.competitors[0] };
            activeMatchup.competitors[0] = { ...activeMatchup.competitors[1], id: 'c1' };
            activeMatchup.competitors[1] = { ...temp, id: 'c2' };
            save();
            broadcastUpdate();
        }
        return activeMatchup;
    }

    function resetScores() {
        if (!activeMatchup) load();
        activeMatchup.competitors.forEach(c => { c.score = 0; c.rounds = 0; });
        activeMatchup.winner = null;
        activeMatchup.status = 'ACTIVE';
        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function resetMatchup() {
        activeMatchup = createDefaultMatchup();
        save();
        broadcastUpdate();
        return activeMatchup;
    }

    // --- Matchup Queue / Fight Card Methods ---
    function getQueue() {
        if (!activeMatchup) load();
        return {
            queue: activeMatchup.queue || [],
            activeQueueIndex: activeMatchup.activeQueueIndex ?? -1
        };
    }

    function addToQueue(input = {}) {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.queue)) activeMatchup.queue = [];
        const item = input.match || input;
        const loadImmediately = Boolean(input.loadImmediately || item.loadImmediately);
        const id = item.id || `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const match = {
            id,
            title: String(item.title || activeMatchup.title || 'Exhibition Match').trim(),
            phase: String(item.phase || 'Match').trim(),
            details: String(item.details || '').trim(),
            format: item.format === 'points' ? 'points' : (item.format === 'firstTo' ? 'firstTo' : 'bestOf'),
            bestOf: Math.max(0, parseInt(item.bestOf, 10) || 5),
            targetScore: item.targetScore !== undefined ? Math.max(1, parseInt(item.targetScore, 10) || 1) : 3,
            competitors: Array.isArray(item.competitors) && item.competitors.length >= 2
                ? item.competitors.map((c, i) => ({
                    id: c.id || `c${i + 1}`,
                    name: String(c.name || `Player ${i + 1}`).trim(),
                    tag: String(c.tag || '').trim(),
                    color: c.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                    score: Math.max(0, parseInt(c.score, 10) || 0)
                }))
                : [
                    { id: 'c1', name: 'Player 1', tag: '', color: DEFAULT_COLORS[0], score: 0 },
                    { id: 'c2', name: 'Player 2', tag: '', color: DEFAULT_COLORS[1], score: 0 }
                ]
        };
        activeMatchup.queue.push(match);
        if (loadImmediately) {
            selectQueueMatch(activeMatchup.queue.length - 1);
        } else {
            save();
            broadcastUpdate();
        }
        return activeMatchup.queue;
    }

    function setQueue(arr = []) {
        if (!activeMatchup) load();
        activeMatchup.queue = Array.isArray(arr) ? arr : [];
        save();
        broadcastUpdate();
        return activeMatchup.queue;
    }

    function selectQueueMatch(indexOrId) {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.queue) || !activeMatchup.queue.length) return null;
        let idx = -1;
        if (typeof indexOrId === 'string') {
            idx = activeMatchup.queue.findIndex(m => m.id === indexOrId);
        }
        if (idx === -1) {
            idx = parseInt(indexOrId, 10);
        }
        if (isNaN(idx) || idx < 0 || idx >= activeMatchup.queue.length) {
            throw new Error(`Invalid queue match identifier ${indexOrId}`);
        }

        const match = activeMatchup.queue[idx];
        activeMatchup.activeQueueIndex = idx;
        activeMatchup.title = match.title || activeMatchup.title;
        activeMatchup.phase = match.phase || '';
        activeMatchup.details = match.details || '';
        activeMatchup.format = match.format || 'bestOf';
        activeMatchup.bestOf = match.bestOf || 5;
        activeMatchup.targetScore = match.targetScore || Math.ceil((match.bestOf || 5) / 2);
        activeMatchup.competitorCount = match.competitors ? match.competitors.length : 2;
        activeMatchup.competitors = match.competitors ? match.competitors.map(c => ({ ...c })) : [
            { id: 'c1', name: 'Player 1', tag: '', color: DEFAULT_COLORS[0], score: 0 },
            { id: 'c2', name: 'Player 2', tag: '', color: DEFAULT_COLORS[1], score: 0 }
        ];
        activeMatchup.winner = null;
        activeMatchup.status = 'ACTIVE';

        checkWinnerCondition();
        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function nextQueueMatch() {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.queue) || !activeMatchup.queue.length) return activeMatchup;
        const currentIdx = activeMatchup.activeQueueIndex ?? -1;
        const nextIdx = Math.min(activeMatchup.queue.length - 1, currentIdx + 1);
        if (nextIdx >= 0) return selectQueueMatch(nextIdx);
        return activeMatchup;
    }

    function prevQueueMatch() {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.queue) || !activeMatchup.queue.length) return activeMatchup;
        const currentIdx = activeMatchup.activeQueueIndex ?? 0;
        const prevIdx = Math.max(0, currentIdx - 1);
        return selectQueueMatch(prevIdx);
    }

    function deleteQueueMatch(indexOrId) {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.queue)) return activeMatchup.queue;
        let idx = -1;
        if (typeof indexOrId === 'string') {
            idx = activeMatchup.queue.findIndex(m => m.id === indexOrId);
        }
        if (idx === -1) idx = parseInt(indexOrId, 10);
        if (idx >= 0 && idx < activeMatchup.queue.length) {
            activeMatchup.queue.splice(idx, 1);
            if (activeMatchup.activeQueueIndex >= activeMatchup.queue.length) {
                activeMatchup.activeQueueIndex = activeMatchup.queue.length - 1;
            }
            save();
            broadcastUpdate();
        }
        return activeMatchup.queue;
    }

    // --- Matchup Presets / Templates Methods ---
    function getPresets() {
        if (!activeMatchup) load();
        return activeMatchup.presets || [];
    }

    function savePreset(preset = {}) {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.presets)) activeMatchup.presets = [];
        const id = preset.id || `preset-${Date.now().toString(36)}`;
        const name = String(preset.name || preset.title || 'Custom Preset').trim();
        const existingIdx = activeMatchup.presets.findIndex(p => p.id === id);
        const item = {
            id,
            name,
            title: String(preset.title || activeMatchup.title).trim(),
            phase: String(preset.phase || activeMatchup.phase).trim(),
            details: String(preset.details || activeMatchup.details).trim(),
            format: preset.format || activeMatchup.format,
            bestOf: preset.bestOf !== undefined ? preset.bestOf : activeMatchup.bestOf,
            targetScore: preset.targetScore !== undefined ? preset.targetScore : activeMatchup.targetScore,
            competitorCount: preset.competitorCount || activeMatchup.competitorCount,
            competitors: (preset.competitors || activeMatchup.competitors).map((c, i) => ({
                id: `c${i + 1}`,
                name: String(c.name || `Player ${i + 1}`).trim(),
                tag: String(c.tag || '').trim(),
                color: c.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                score: 0
            }))
        };
        if (existingIdx !== -1) {
            activeMatchup.presets[existingIdx] = item;
        } else {
            activeMatchup.presets.push(item);
        }
        save();
        return activeMatchup.presets;
    }

    function loadPreset(presetId) {
        if (!activeMatchup) load();
        const preset = (activeMatchup.presets || []).find(p => p.id === presetId);
        if (!preset) throw new Error(`Preset ${presetId} not found`);
        activeMatchup.title = preset.title;
        activeMatchup.phase = preset.phase;
        activeMatchup.details = preset.details;
        activeMatchup.format = preset.format;
        activeMatchup.bestOf = preset.bestOf;
        activeMatchup.targetScore = preset.targetScore;
        activeMatchup.competitorCount = preset.competitorCount || preset.competitors.length;
        activeMatchup.competitors = preset.competitors.map(c => ({ ...c, score: 0 }));
        activeMatchup.winner = null;
        activeMatchup.status = 'ACTIVE';
        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function deletePreset(presetId) {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.presets)) return [];
        activeMatchup.presets = activeMatchup.presets.filter(p => p.id !== presetId);
        save();
        return activeMatchup.presets;
    }

    function getHistory() {
        if (!activeMatchup) load();
        return Array.isArray(activeMatchup.history) ? activeMatchup.history : [];
    }

    function restoreHistoryItem(historyId) {
        if (!activeMatchup) load();
        const item = (activeMatchup.history || []).find(h => h.id === historyId);
        if (!item) throw new Error(`History record ${historyId} not found`);
        activeMatchup.title = item.title || activeMatchup.title;
        activeMatchup.phase = item.phase || '';
        activeMatchup.details = item.details || '';
        activeMatchup.format = item.format || 'bestOf';
        activeMatchup.bestOf = item.bestOf !== undefined ? item.bestOf : 5;
        activeMatchup.targetScore = item.targetScore !== undefined ? item.targetScore : 3;
        activeMatchup.competitorCount = item.competitors ? item.competitors.length : 2;
        activeMatchup.competitors = (item.competitors || []).map((c, i) => ({
            id: `c${i + 1}`,
            name: c.name || `Player ${i + 1}`,
            tag: c.tag || '',
            color: c.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
            score: c.score || 0
        }));
        activeMatchup.status = 'ACTIVE';
        activeMatchup.winner = null;
        if (item.status === 'IN_PROGRESS') {
            if (item.clock) activeMatchup.clock = Object.assign({}, item.clock, { isRunning: false });
            activeMatchup.competitors.forEach((c, i) => {
                const t = item.competitors[i] && item.competitors[i].timer;
                if (t) c.timer = Object.assign({ isRunning: false }, t, { isRunning: false });
            });
            activeMatchup.log = (item.log || []).slice();
        } else {
            activeMatchup.log = [];
        }
        logEvent('restore', 'Restored from history');
        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function deleteHistoryItem(historyId) {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.history)) return [];
        activeMatchup.history = activeMatchup.history.filter(h => h.id !== historyId);
        save();
        return activeMatchup.history;
    }

    function clearHistory() {
        if (!activeMatchup) load();
        activeMatchup.history = [];
        save();
        return [];
    }

    // --- Dual-Mode Match Clock & Stopwatch ---
    function ensureClock() {
        if (!activeMatchup.clock) {
            activeMatchup.clock = {
                enabled: true,
                mode: 'countdown',
                runnerTimersMode: 'finish',
                showSplits: true,
                duration: 99,
                remaining: 99,
                elapsed: 0,
                isRunning: false,
                startedAt: null,
                estimate: '',
                split: ''
            };
        }
        if (!activeMatchup.clock.runnerTimersMode) {
            activeMatchup.clock.runnerTimersMode = 'finish';
        }
        if (activeMatchup.clock.showSplits === undefined) {
            activeMatchup.clock.showSplits = true;
        }
    }

    function stopTicker() {
        if (clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    }

    // One shared, drift-corrected ticker drives countdown, stopwatch and race clocks.
    // Stopwatch / race elapsed time advances by real wall-clock delta so long runs
    // stay accurate even when the event loop is briefly busy.
    let countdownAcc = 0;
    function tickClock() {
        const clock = activeMatchup && activeMatchup.clock;
        if (!clock || !clock.isRunning) {
            stopTicker();
            return;
        }
        const now = Date.now();
        const dt = Math.max(0, (now - lastTickAt) / 1000);
        lastTickAt = now;

        if (clock.mode === 'race') {
            clock.elapsed += dt;
            const comps = activeMatchup.competitors || [];
            let anyRunning = false;
            for (const c of comps) {
                if (c.timer && c.timer.isRunning && !c.timer.finished) {
                    c.timer.elapsed += dt;
                    anyRunning = true;
                }
            }
            if (!anyRunning && comps.length > 0 && comps.every(c => c.timer && c.timer.finished)) {
                clock.isRunning = false;
                stopTicker();
            }
        } else if (clock.mode === 'stopwatch') {
            clock.elapsed += dt;
            const comps = activeMatchup.competitors || [];
            for (const c of comps) {
                if (c.timer && c.timer.isRunning && !c.timer.finished) {
                    c.timer.elapsed += dt;
                }
            }
        } else if (clock.remaining > 0) {
            const comps = activeMatchup.competitors || [];
            for (const c of comps) {
                if (c.timer && c.timer.isRunning && !c.timer.finished) {
                    c.timer.elapsed += dt;
                }
            }
            countdownAcc += dt;
            const whole = Math.floor(countdownAcc);
            if (whole < 1) return;
            countdownAcc -= whole;
            clock.remaining -= whole;
            if (clock.remaining <= 0) {
                clock.remaining = 0;
                clock.isRunning = false;
                stopTicker();
            }
        } else {
            clock.isRunning = false;
            stopTicker();
        }
        broadcastUpdate();
    }

    function ensureTicker() {
        stopTicker();
        lastTickAt = Date.now();
        countdownAcc = 0;
        clockTimer = setInterval(tickClock, 250);
        if (clockTimer.unref) clockTimer.unref();
    }

    function startClock() {
        if (!activeMatchup) load();
        ensureClock();
        if (activeMatchup.clock.isRunning) return activeMatchup.clock;

        activeMatchup.clock.isRunning = true;
        activeMatchup.clock.startedAt = Date.now();
        activeMatchup.clock.enabled = true;
        ensureTicker();

        save();
        broadcastUpdate();
        return activeMatchup.clock;
    }

    function pauseClock() {
        if (!activeMatchup) load();
        ensureClock();
        activeMatchup.clock.isRunning = false;
        if (clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
        save();
        broadcastUpdate();
        return activeMatchup.clock;
    }

    function resetClock(seconds) {
        if (!activeMatchup) load();
        ensureClock();
        activeMatchup.clock.isRunning = false;
        if (clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
        if (seconds !== undefined && !isNaN(Number(seconds))) {
            activeMatchup.clock.duration = Math.max(0, Number(seconds));
        }
        activeMatchup.clock.remaining = activeMatchup.clock.duration;
        activeMatchup.clock.elapsed = 0;
        save();
        broadcastUpdate();
        return activeMatchup.clock;
    }

    function setClockMode(params = {}) {
        if (!activeMatchup) load();
        ensureClock();
        if (params.mode && (params.mode === 'countdown' || params.mode === 'stopwatch' || params.mode === 'race')) {
            activeMatchup.clock.mode = params.mode;
        }
        if (params.runnerTimersMode !== undefined) {
            const rtm = String(params.runnerTimersMode).toLowerCase();
            activeMatchup.clock.runnerTimersMode = (rtm === 'always' || rtm === 'live') ? 'always' : ((rtm === 'off' || rtm === 'none') ? 'off' : 'finish');
        }
        if (params.showSplits !== undefined) {
            activeMatchup.clock.showSplits = Boolean(params.showSplits);
        }
        if (params.duration !== undefined) {
            const d = Math.max(0, Number(params.duration) || 0);
            activeMatchup.clock.duration = d;
            if (!activeMatchup.clock.isRunning) {
                activeMatchup.clock.remaining = d;
            }
        }
        if (params.estimate !== undefined) {
            activeMatchup.clock.estimate = String(params.estimate || '').trim();
        }
        if (params.enabled !== undefined) {
            activeMatchup.clock.enabled = Boolean(params.enabled);
            if (!activeMatchup.clock.enabled) {
                activeMatchup.clock.isRunning = false;
                (activeMatchup.competitors || []).forEach(c => { if (c.timer) c.timer.isRunning = false; });
                stopTicker();
            }
        }
        save();
        broadcastUpdate();
        return activeMatchup.clock;
    }

    function formatTime(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const hours = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        if (hours > 0) {
            return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Speedrun-grade precision: M:SS.cc (or H:MM:SS.cc past one hour).
    function formatPrecise(totalSeconds) {
        const clamped = Math.max(0, Number(totalSeconds) || 0);
        const centis = Math.floor(clamped * 100);
        const cs = centis % 100;
        const base = formatTime(Math.floor(centis / 100));
        return `${base}.${String(cs).padStart(2, '0')}`;
    }

    function ensureCompetitorTimers() {
        if (!activeMatchup) load();
        if (!Array.isArray(activeMatchup.competitors)) return;
        for (const c of activeMatchup.competitors) {
            if (!c.timer || typeof c.timer !== 'object') {
                c.timer = {
                    elapsed: 0,
                    isRunning: false,
                    finished: false,
                    finishTime: null,
                    finishSeconds: null,
                    place: null,
                    deltaSeconds: null,
                    delta: null
                };
            }
        }
    }

    function recomputeRacePlacements() {
        const comps = activeMatchup.competitors || [];
        const finishers = comps
            .filter(c => c.timer && c.timer.finished)
            .sort((a, b) => (a.timer.finishSeconds ?? a.timer.elapsed ?? 0) - (b.timer.finishSeconds ?? b.timer.elapsed ?? 0));
        if (!finishers.length) return;
        const firstSec = finishers[0].timer.finishSeconds ?? finishers[0].timer.elapsed ?? 0;
        finishers.forEach((c, idx) => {
            c.timer.place = idx + 1;
            const sec = c.timer.finishSeconds ?? c.timer.elapsed ?? 0;
            const diff = Math.max(0, sec - firstSec);
            c.timer.deltaSeconds = Math.round(diff * 100) / 100;
            if (idx === 0) {
                c.timer.delta = 'WINNER';
            } else {
                c.timer.delta = `+${formatPrecise(diff)}`;
            }
        });
    }

    function findRaceCompetitor(compIdentifier) {
        const comps = activeMatchup.competitors || [];
        if (typeof compIdentifier === 'number') return comps[compIdentifier] || null;
        if (typeof compIdentifier === 'string' && /^\d+$/.test(compIdentifier) && !comps.some(c => c.id === compIdentifier)) {
            return comps[Number(compIdentifier)] || null;
        }
        return comps.find(c => c.id === compIdentifier || c.name === compIdentifier) || null;
    }

    function syncRaceClockState() {
        const comps = activeMatchup.competitors || [];
        const anyRunning = comps.some(c => c.timer && c.timer.isRunning && !c.timer.finished);
        if (anyRunning) {
            if (!activeMatchup.clock.isRunning || !clockTimer) {
                activeMatchup.clock.mode = 'race';
                activeMatchup.clock.isRunning = true;
                activeMatchup.clock.startedAt = Date.now();
                ensureTicker();
            }
        } else if (activeMatchup.clock.isRunning) {
            activeMatchup.clock.isRunning = false;
            stopTicker();
        }
    }

    function startAllRace() {
        if (!activeMatchup) load();
        ensureClock();
        ensureCompetitorTimers();
        activeMatchup.clock.mode = 'race';
        activeMatchup.clock.enabled = true;

        for (const c of activeMatchup.competitors) {
            if (!c.timer.finished) c.timer.isRunning = true;
        }
        activeMatchup.clock.isRunning = true;
        activeMatchup.clock.startedAt = Date.now();
        ensureTicker();

        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function pauseAllRace() {
        if (!activeMatchup) load();
        ensureClock();
        ensureCompetitorTimers();
        activeMatchup.clock.isRunning = false;
        for (const c of activeMatchup.competitors) {
            c.timer.isRunning = false;
        }
        stopTicker();
        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function resetAllRace() {
        if (!activeMatchup) load();
        ensureClock();
        ensureCompetitorTimers();
        activeMatchup.clock.isRunning = false;
        activeMatchup.clock.elapsed = 0;
        for (const c of activeMatchup.competitors) {
            c.timer.elapsed = 0;
            c.timer.isRunning = false;
            c.timer.finished = false;
            c.timer.finishTime = null;
            c.timer.finishSeconds = null;
            c.timer.place = null;
            c.timer.deltaSeconds = null;
            c.timer.delta = null;
        }
        stopTicker();
        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function finishCompetitorRace(compIdentifier) {
        if (!activeMatchup) load();
        ensureClock();
        ensureCompetitorTimers();

        const comp = findRaceCompetitor(compIdentifier);
        if (!comp || comp.timer.finished) return activeMatchup;
        // A runner that was never started cannot finish.
        if (!comp.timer.isRunning && !(comp.timer.elapsed > 0)) return activeMatchup;

        const otherFinishers = activeMatchup.competitors.filter(c => c !== comp && c.timer?.finished);
        comp.timer.finished = true;
        comp.timer.isRunning = false;
        comp.timer.finishSeconds = Math.round((comp.timer.elapsed || 0) * 100) / 100;
        comp.timer.finishTime = formatPrecise(comp.timer.elapsed);
        logEvent('finish', `${comp.name} finished ${comp.timer.finishTime}`);

        recomputeRacePlacements();

        if (otherFinishers.length === 0) {
            if (activeMatchup.format === 'bestOf' || activeMatchup.format === 'firstTo') {
                comp.score += 1;
                checkWinnerCondition();
            }
            try {
                onAlert({
                    type: 'matchup_win',
                    title: `${comp.name} Finished First!`,
                    winner: comp.name,
                    user: comp.name,
                    score: comp.score,
                    details: `Finish Time: ${comp.timer.finishTime}`,
                    celebration: { sound: '', confetti: true }
                });
            } catch { /* ignore */ }
        }

        if (activeMatchup.competitors.every(c => c.timer?.finished)) {
            activeMatchup.clock.isRunning = false;
            stopTicker();
        }

        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function toggleCompetitorRace(compIdentifier) {
        if (!activeMatchup) load();
        ensureClock();
        ensureCompetitorTimers();

        const comp = findRaceCompetitor(compIdentifier);
        if (!comp) return activeMatchup;

        if (comp.timer.finished) {
            comp.timer.finished = false;
            comp.timer.finishTime = null;
            comp.timer.finishSeconds = null;
            comp.timer.place = null;
            comp.timer.deltaSeconds = null;
            comp.timer.delta = null;
            recomputeRacePlacements();
        }
        comp.timer.isRunning = !comp.timer.isRunning;
        syncRaceClockState();

        save();
        broadcastUpdate();
        return activeMatchup;
    }

    function resetCompetitorRace(compIdentifier) {
        if (!activeMatchup) load();
        ensureClock();
        ensureCompetitorTimers();

        const comp = findRaceCompetitor(compIdentifier);
        if (!comp) return activeMatchup;

        comp.timer.elapsed = 0;
        comp.timer.isRunning = false;
        comp.timer.finished = false;
        comp.timer.finishTime = null;
        comp.timer.finishSeconds = null;
        comp.timer.place = null;
        comp.timer.deltaSeconds = null;
        comp.timer.delta = null;
        recomputeRacePlacements();
        syncRaceClockState();

        save();
        broadcastUpdate();
        return activeMatchup;
    }


    function setTargetEstimate(estimate) {
        if (!activeMatchup) load();
        ensureClock();
        activeMatchup.clock.estimate = String(estimate || '').trim();
        save();
        broadcastUpdate();
        return activeMatchup.clock;
    }

    load();

    return {
        saveProgress,
        getMatchup,
        updateMatchup,
        updateScore,
        setCompetitorScore,
        updateCompetitor,
        setCompetitorCount,
        swapSides,
        resetScores,
        resetMatchup,
        getQueue,
        addToQueue,
        setQueue,
        selectQueueMatch,
        nextQueueMatch,
        prevQueueMatch,
        deleteQueueMatch,
        getPresets,
        savePreset,
        loadPreset,
        deletePreset,
        getHistory,
        restoreHistoryItem,
        deleteHistoryItem,
        clearHistory,
        // Clock methods
        startClock,
        pauseClock,
        resetClock,
        setClockMode,
        startAllRace,
        pauseAllRace,
        resetAllRace,
        finishCompetitorRace,
        toggleCompetitorRace,
        resetCompetitorRace,
        setTargetEstimate,
        destroy: () => {
            if (clockTimer) clearInterval(clockTimer);
        }
    };
}

module.exports = { createMatchupService, DEFAULT_COLORS };
