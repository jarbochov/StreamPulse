'use strict';

// Native StreamPulse Poll Engine: manages live multi-platform chat polls,
// voting rules, timers, tournament brackets, overlay takeovers, and victory celebrations.

const fs = require('fs');
const path = require('path');

const DEFAULT_PRESETS = [
    {
        id: 'game-of-night',
        title: 'Game of the Night',
        choices: ['Option A', 'Option B', 'Option C'],
        duration: 60,
        blind: true,
        keywordVoting: true,
        subMultiplier: 1
    },
    {
        id: 'next-game',
        title: 'Which game should we play next?',
        choices: ['Zelda: Tears of the Kingdom', 'Elden Ring', 'Metroid Prime'],
        duration: 120,
        blind: false,
        keywordVoting: true,
        subMultiplier: 2
    },
    {
        id: 'channel-challenge',
        title: 'Channel Challenge: Attempt Hardcore Run?',
        choices: ['Accept the Challenge!', 'No, Stay Safe!'],
        duration: 60,
        blind: false,
        keywordVoting: true,
        subMultiplier: 1
    }
];

const DEFAULT_TOURNAMENT_PRESETS = [
    {
        id: 'tp-8p-single-bo3',
        name: '8-Player Single Elimination (Bo3)',
        title: 'Community Championship (8 Players)',
        format: 'single',
        progressionMode: 'manual',
        scoringType: 'bestOf',
        bestOf: 3,
        matchDuration: 120,
        entrants: ['Apex', 'Blaze', 'Cipher', 'Drift', 'Echo', 'Frost', 'Ghost', 'Helix']
    },
    {
        id: 'tp-16p-single-bo3',
        name: '16-Player Single Elimination',
        title: 'Stream Invitational (16 Players)',
        format: 'single',
        progressionMode: 'manual',
        scoringType: 'bestOf',
        bestOf: 3,
        matchDuration: 120,
        entrants: [
            'Seed 1 - Alpha', 'Seed 2 - Bravo', 'Seed 3 - Charlie', 'Seed 4 - Delta',
            'Seed 5 - Echo', 'Seed 6 - Foxtrot', 'Seed 7 - Golf', 'Seed 8 - Hotel',
            'Seed 9 - India', 'Seed 10 - Juliet', 'Seed 11 - Kilo', 'Seed 12 - Lima',
            'Seed 13 - Mike', 'Seed 14 - November', 'Seed 15 - Oscar', 'Seed 16 - Papa'
        ]
    },
    {
        id: 'tp-8p-double-bo3',
        name: '8-Player Double Elimination',
        title: 'Double Elimination Major (8 Players)',
        format: 'double',
        progressionMode: 'manual',
        scoringType: 'bestOf',
        bestOf: 3,
        matchDuration: 120,
        entrants: ['Shadow', 'Viper', 'Phoenix', 'Titan', 'Rogue', 'Raven', 'Saber', 'Nova']
    },
    {
        id: 'tp-6p-single-bye',
        name: '6-Player Single Elimination (2 BYEs)',
        title: '6-Player Showdown (Top 2 BYE)',
        format: 'single',
        progressionMode: 'manual',
        scoringType: 'bestOf',
        bestOf: 3,
        matchDuration: 120,
        entrants: ['Seed 1 (BYE)', 'Seed 2 (BYE)', 'Challenger 3', 'Challenger 4', 'Challenger 5', 'Challenger 6']
    },
    {
        id: 'tp-5p-round-robin',
        name: '5-Player Round Robin (All vs All)',
        title: 'Round Robin League (5 Players)',
        format: 'roundRobin',
        progressionMode: 'manual',
        scoringType: 'points',
        bestOf: 1,
        matchDuration: 90,
        entrants: ['Aces', 'Kings', 'Queens', 'Jacks', 'Jokers']
    },
    {
        id: 'tp-4p-quick-bo5',
        name: '4-Player Final Four (Bo5)',
        title: 'Final Four Showdown',
        format: 'single',
        progressionMode: 'manual',
        scoringType: 'bestOf',
        bestOf: 5,
        matchDuration: 180,
        entrants: ['Player 1', 'Player 2', 'Player 3', 'Player 4']
    }
];

function createPollService({
    dataDir,
    broadcastToOverlays = () => {},
    onTakeover = () => {},
    onAlert = () => {},
    getTwitchPoll = () => null,
    log = console.log,
    error = console.error
}) {
    const filePath = path.join(dataDir, 'polls.json');
    let activePoll = null;
    let pollHistory = [];
    let savedPresets = [...DEFAULT_PRESETS];
    let activeTournament = null;
    let tournamentHistory = [];
    let tournamentPresets = [...DEFAULT_TOURNAMENT_PRESETS];
    let tournamentDrafts = [];
    let pollTimer = null;
    let voters = new Map(); // userId -> { choiceId, weight }

    // Load persisted state and history
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.history)) {
                pollHistory = data.history.slice(0, 50);
            }
            if (Array.isArray(data.presets) && data.presets.length > 0) {
                savedPresets = data.presets;
            }
            if (data.tournament) {
                activeTournament = data.tournament;
            }
            if (Array.isArray(data.tournamentHistory)) {
                tournamentHistory = data.tournamentHistory.slice(0, 30);
            }
            if (Array.isArray(data.tournamentPresets) && data.tournamentPresets.length > 0) {
                tournamentPresets = data.tournamentPresets;
            }
            if (Array.isArray(data.tournamentDrafts)) {
                tournamentDrafts = data.tournamentDrafts.slice(0, 30);
            }
            if (data.active && data.active.status === 'ACTIVE') {
                const elapsed = Math.floor((Date.now() - Date.parse(data.active.startedAt || Date.now())) / 1000);
                if (data.active.duration > 0 && elapsed >= data.active.duration) {
                    data.active.status = 'COMPLETED';
                    data.active.endedAt = new Date().toISOString();
                    pollHistory.unshift(data.active);
                    activePoll = null;
                } else {
                    activePoll = data.active;
                    if (Array.isArray(data.voters)) {
                        voters = new Map(data.voters);
                    }
                    startTimer();
                }
            }
        }
    } catch (err) {
        error('[Polls] Error loading polls.json:', err.message);
    }

    function save() {
        try {
            const payload = {
                active: activePoll,
                voters: [...voters.entries()],
                history: pollHistory.slice(0, 50),
                presets: savedPresets,
                tournament: activeTournament,
                tournamentHistory: tournamentHistory.slice(0, 30),
                tournamentPresets,
                tournamentDrafts: tournamentDrafts.slice(0, 30)
            };
            fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
        } catch (err) {
            error('[Polls] Error saving polls.json:', err.message);
        }
    }

    function recalculateVotes() {
        if (!activePoll) return;
        const total = activePoll.choices.reduce((sum, c) => sum + (c.votes || 0), 0);
        activePoll.totalVotes = total;
        activePoll.choices.forEach(c => {
            c.percent = total > 0 ? (c.votes / total) * 100 : 0;
        });

        let maxVotes = -1;
        let winner = null;
        let isTie = false;
        for (const c of activePoll.choices) {
            if (c.votes > maxVotes) {
                maxVotes = c.votes;
                winner = c;
                isTie = false;
            } else if (c.votes === maxVotes && maxVotes > 0) {
                isTie = true;
            }
        }

        activePoll.winner = isTie ? '' : (winner?.title || '');
        activePoll.winningVotes = maxVotes > 0 ? maxVotes : 0;
        activePoll.winningPercent = winner && total > 0 && !isTie ? Math.round(winner.percent) : 0;
        activePoll.isTie = isTie;

        // If part of active tournament match, synchronize match votes
        if (activePoll.tournamentMatchId && activeTournament && Array.isArray(activeTournament.matches)) {
            const match = activeTournament.matches.find(m => m.id === activePoll.tournamentMatchId);
            if (match && match.status === 'ACTIVE') {
                if (match.entrant1 && activePoll.choices[0]) {
                    match.entrant1.votes = activePoll.choices[0].votes;
                    match.entrant1.percent = Math.round(activePoll.choices[0].percent);
                }
                if (match.entrant2 && activePoll.choices[1]) {
                    match.entrant2.votes = activePoll.choices[1].votes;
                    match.entrant2.percent = Math.round(activePoll.choices[1].percent);
                }
                broadcastTournamentUpdate();
            }
        }
    }

    function getPublicPayload(poll = activePoll) {
        if (!poll) return null;
        const now = Date.now();
        const start = Date.parse(poll.startedAt);
        const remaining = poll.duration > 0 && Number.isFinite(start)
            ? Math.max(0, Math.ceil(poll.duration - (now - start) / 1000))
            : 0;

        const isBlindActive = poll.status === 'ACTIVE' && poll.settings?.blind;

        return {
            id: poll.id,
            title: poll.title,
            status: poll.status,
            source: 'streampulse',
            duration: poll.duration,
            startedAt: poll.startedAt,
            endedAt: poll.endedAt,
            remainingSeconds: remaining,
            totalVotes: poll.totalVotes,
            blind: !!isBlindActive,
            keywordVoting: poll.settings?.keywordVoting !== false,
            isTie: !!poll.isTie,
            winner: poll.status === 'COMPLETED' ? poll.winner : '',
            winningVotes: poll.status === 'COMPLETED' ? poll.winningVotes : 0,
            winningPercent: poll.status === 'COMPLETED' ? poll.winningPercent : 0,
            tournamentMatchId: poll.tournamentMatchId || null,
            settings: {
                blind: !!poll.settings?.blind,
                keywordVoting: poll.settings?.keywordVoting !== false,
                subMultiplier: Number(poll.settings?.subMultiplier) || 1,
                resultsSeconds: Number(poll.settings?.resultsSeconds) || 15,
                celebration: poll.settings?.celebration || {}
            },
            choices: (poll.choices || []).map((c, i) => ({
                id: c.id ?? String(i + 1),
                title: c.title,
                votes: isBlindActive ? 0 : c.votes,
                percent: isBlindActive ? 0 : Math.round(c.percent)
            }))
        };
    }

    function broadcastUpdate() {
        if (!activePoll) return;
        const payload = getPublicPayload(activePoll);
        broadcastToOverlays('poll-update', payload);
    }

    function broadcastTournamentUpdate() {
        if (!activeTournament) return;
        broadcastToOverlays('tournament-update', activeTournament);
    }

    function startTimer() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (!activePoll || activePoll.status !== 'ACTIVE') {
                clearInterval(pollTimer);
                pollTimer = null;
                return;
            }

            if (activePoll.duration > 0) {
                const now = Date.now();
                const start = Date.parse(activePoll.startedAt);
                const remaining = Math.max(0, Math.ceil(activePoll.duration - (now - start) / 1000));
                activePoll.remainingSeconds = remaining;

                if (remaining <= 0) {
                    finishPoll('COMPLETED');
                    return;
                }
            }

            // Periodic sync (every 5 seconds or when under 10 seconds)
            if (activePoll.remainingSeconds <= 10 || activePoll.remainingSeconds % 5 === 0) {
                broadcastUpdate();
            }
        }, 1000);
    }

    function createPoll(params = {}) {
        if (typeof params === 'string') {
            try { params = JSON.parse(params); } catch { params = {}; }
        }

        const title = String(params.title || params.question || '').trim();
        if (!title) throw new Error('Poll question/title is required');

        const rawChoices = Array.isArray(params.choices) ? params.choices : [];
        const cleanChoices = rawChoices
            .map((c, i) => ({
                id: String(i + 1),
                title: typeof c === 'string' ? c.trim() : String(c.title || '').trim(),
                votes: 0,
                percent: 0
            }))
            .filter(c => c.title.length > 0)
            .slice(0, 10); // Supports up to 10 choices!

        if (cleanChoices.length < 2) {
            throw new Error('A poll requires at least 2 distinct choices (up to 10)');
        }

        const duration = Math.max(0, Math.min(86400, Number(params.duration) || 0)); // 0 = manual
        const settings = {
            blind: Boolean(params.blind),
            keywordVoting: params.keywordVoting !== false,
            allowMultiple: Boolean(params.allowMultiple),
            subMultiplier: Math.max(1, Math.min(10, Number(params.subMultiplier) || 1)),
            resultsSeconds: Math.max(3, Math.min(300, Number(params.resultsSeconds) || 15)),
            celebration: {
                sound: String(params.celebration?.sound || ''),
                volume: Math.max(0, Math.min(100, Number(params.celebration?.volume ?? 75))),
                video: String(params.celebration?.video || ''),
                videoSound: Boolean(params.celebration?.videoSound),
                confetti: params.celebration?.confetti !== false,
                countdownSound: Boolean(params.celebration?.countdownSound)
            }
        };

        // Complete any previously active poll
        if (activePoll && activePoll.status === 'ACTIVE') {
            finishPoll('TERMINATED');
        }

        voters.clear();

        activePoll = {
            id: `poll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            title,
            choices: cleanChoices,
            status: 'ACTIVE',
            duration,
            startedAt: new Date().toISOString(),
            endedAt: null,
            remainingSeconds: duration,
            totalVotes: 0,
            winner: '',
            winningVotes: 0,
            winningPercent: 0,
            isTie: false,
            tournamentMatchId: params.tournamentMatchId || null,
            settings
        };

        save();
        startTimer();

        const payload = getPublicPayload(activePoll);
        const takeoverMs = duration > 0 ? duration * 1000 : 3600000;
        onTakeover('poll-active', activePoll.title, takeoverMs);
        broadcastToOverlays('poll-update', payload);

        log(`[Polls] Started native poll: "${activePoll.title}" with ${cleanChoices.length} choices (duration: ${duration}s)`);
        return payload;
    }

    function finishPoll(status = 'COMPLETED') {
        if (!activePoll || activePoll.status !== 'ACTIVE') return null;

        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }

        activePoll.status = status;
        activePoll.endedAt = new Date().toISOString();
        activePoll.remainingSeconds = 0;
        recalculateVotes();

        const finishedPoll = { ...activePoll };
        const payload = getPublicPayload(finishedPoll);

        pollHistory.unshift(finishedPoll);
        if (pollHistory.length > 50) pollHistory.length = 50;

        activePoll = null;
        voters.clear();
        save();

        const resultsMs = Math.max(3000, (finishedPoll.settings?.resultsSeconds || 15) * 1000);
        onTakeover('poll-end', finishedPoll.title, resultsMs, payload);
        broadcastToOverlays('poll-update', payload);

        // Handle linked tournament match cleanly
        if (finishedPoll.tournamentMatchId && activeTournament && Array.isArray(activeTournament.matches)) {
            const match = activeTournament.matches.find(m => m.id === finishedPoll.tournamentMatchId);
            if (status === 'COMPLETED' && finishedPoll.winner && !finishedPoll.isTie && (finishedPoll.totalVotes || 0) > 0) {
                advanceTournamentMatch(finishedPoll.tournamentMatchId, finishedPoll.winner);
            } else if (status === 'TERMINATED') {
                if (match) {
                    match.status = 'PENDING';
                    match.winner = null;
                    if (match.entrant1) { match.entrant1.votes = 0; match.entrant1.percent = 0; }
                    if (match.entrant2) { match.entrant2.votes = 0; match.entrant2.percent = 0; }
                    broadcastTournamentUpdate();
                }
            } else {
                // Completed but zero votes or tie — leave match in pending/active state without false auto-advance
                if (match) {
                    match.status = 'PENDING';
                    match.winner = null;
                    broadcastTournamentUpdate();
                }
                log(`[Polls] Tournament match poll "${finishedPoll.title}" completed with 0 votes or tie — match retained for resolution.`);
            }
        }

        if (status === 'COMPLETED' && finishedPoll.winner) {
            log(`[Polls] Poll completed: "${finishedPoll.title}" — Winner: "${finishedPoll.winner}" (${finishedPoll.winningVotes} votes / ${finishedPoll.winningPercent}%)`);
            try {
                onAlert({
                    type: 'poll_end',
                    title: finishedPoll.title,
                    winner: finishedPoll.winner,
                    votes: finishedPoll.winningVotes,
                    percent: finishedPoll.winningPercent,
                    total_votes: finishedPoll.totalVotes,
                    user: finishedPoll.winner,
                    celebration: finishedPoll.settings?.celebration || {}
                });
            } catch (err) {
                error('[Polls] Error delivering poll_end alert:', err.message);
            }
        } else {
            log(`[Polls] Poll ended: "${finishedPoll.title}" (status: ${status})`);
        }

        return payload;
    }

    function extendPoll(extraSeconds = 30) {
        if (!activePoll || activePoll.status !== 'ACTIVE') return null;
        const add = Math.max(5, Math.min(3600, Number(extraSeconds) || 30));
        activePoll.duration = (Number(activePoll.duration) || 0) + add;
        broadcastUpdate();
        log(`[Polls] Extended poll by ${add}s (new duration: ${activePoll.duration}s)`);
        return getPublicPayload(activePoll);
    }

    function cancelPoll() {
        if (activePoll && activePoll.tournamentMatchId && activeTournament) {
            const match = activeTournament.matches.find(m => m.id === activePoll.tournamentMatchId);
            if (match) {
                match.status = 'PENDING';
                activeTournament.activeMatchId = null;
                broadcastTournamentUpdate();
            }
        }
        return finishPoll('TERMINATED');
    }

    function castVote({ user = '', userId = '', choiceIndex = -1, isSub = false }) {
        if (!activePoll || activePoll.status !== 'ACTIVE') return false;
        if (choiceIndex < 0 || choiceIndex >= activePoll.choices.length) return false;

        const uid = String(userId || user || '').trim().toLowerCase();
        if (!uid) return false;

        let weight = 1;
        if (isSub && activePoll.settings?.subMultiplier > 1) {
            weight = activePoll.settings.subMultiplier;
        }

        if (!activePoll.settings?.allowMultiple && voters.has(uid)) {
            return false;
        }

        voters.set(uid, { choiceId: choiceIndex, weight });
        activePoll.choices[choiceIndex].votes += weight;
        recalculateVotes();
        save();
        broadcastUpdate();
        return true;
    }

    function handleChatMessage(msg = {}) {
        if (!activePoll || activePoll.status !== 'ACTIVE') return false;

        const user = msg.chatname || msg.username || msg.user || '';
        const userId = msg.userId || msg.id || user.toLowerCase();
        if (!userId) return false;

        const text = String(msg.message || msg.text || '').trim();
        if (!text) return false;

        let choiceIndex = -1;

        // 1. Command format: !vote 1, !vote 2, or !vote <word>
        const cmdMatch = text.match(/^!vote\s+(.+)$/i);
        if (cmdMatch) {
            const arg = cmdMatch[1].trim();
            const num = parseInt(arg, 10);
            if (!isNaN(num) && num >= 1 && num <= activePoll.choices.length) {
                choiceIndex = num - 1;
            } else {
                const argLower = arg.toLowerCase();
                choiceIndex = activePoll.choices.findIndex(c => c.title.toLowerCase() === argLower || c.title.toLowerCase().startsWith(argLower));
            }
        } else {
            // 2. Direct single digit or 10: "1" through "10"
            const numMatch = text.match(/^([1-9]|10)$/);
            if (numMatch) {
                const num = parseInt(numMatch[1], 10);
                if (num >= 1 && num <= activePoll.choices.length) {
                    choiceIndex = num - 1;
                }
            }
        }

        // 3. Keyword / natural word voting (if enabled)
        if (choiceIndex === -1 && activePoll.settings?.keywordVoting) {
            const textLower = text.toLowerCase();
            for (let i = 0; i < activePoll.choices.length; i++) {
                const title = activePoll.choices[i].title.toLowerCase();
                const words = title.split(/\s+/).filter(w => w.length > 2);
                if (textLower === title || words.some(w => textLower.includes(w))) {
                    choiceIndex = i;
                    break;
                }
            }
        }

        if (choiceIndex === -1) return false;

        const isSub = Boolean(msg.subscriber || msg.isSub || msg.membership);
        return castVote({ user, userId, choiceIndex, isSub });
    }

    function getLatestPoll() {
        if (activePoll) {
            return getPublicPayload(activePoll);
        }
        if (pollHistory.length > 0) {
            const latest = pollHistory[0];
            const end = Date.parse(latest.endedAt);
            const resultsSec = latest.settings?.resultsSeconds || 15;
            if (Number.isFinite(end) && Date.now() < end + resultsSec * 1000) {
                return getPublicPayload(latest);
            }
        }
        // Fall back to external Twitch poll
        return getTwitchPoll();
    }

    // --- Saved Presets / Templates ---
    function getPresets() {
        return savedPresets;
    }

    function savePreset(preset = {}) {
        const title = String(preset.title || '').trim();
        if (!title) throw new Error('Preset title is required');
        const rawChoices = Array.isArray(preset.choices) ? preset.choices : [];
        const cleanChoices = rawChoices.map(c => typeof c === 'string' ? c.trim() : String(c.title || '').trim()).filter(Boolean);
        if (cleanChoices.length < 2) throw new Error('Preset requires at least 2 choices');

        const id = preset.id || `preset-${Date.now().toString(36)}`;
        const existingIdx = savedPresets.findIndex(p => p.id === id);
        const item = {
            id,
            title,
            choices: cleanChoices,
            duration: Number(preset.duration) || 60,
            blind: Boolean(preset.blind),
            keywordVoting: preset.keywordVoting !== false,
            subMultiplier: Number(preset.subMultiplier) || 1,
            celebration: preset.celebration || { sound: '', confetti: true, volume: 75 }
        };

        if (existingIdx >= 0) savedPresets[existingIdx] = item;
        else savedPresets.push(item);
        save();
        return item;
    }

    function deletePreset(id) {
        savedPresets = savedPresets.filter(p => p.id !== id);
        save();
        return { ok: true };
    }

    // --- Tournament Bracket Generation & Management ---
    function generateSeedPairs(size) {
        if (size <= 2) return [[1, 2]];
        let rounds = [1, 2];
        while (rounds.length < size) {
            const next = [];
            const sum = rounds.length * 2 + 1;
            for (const s of rounds) {
                next.push(s);
                next.push(sum - s);
            }
            rounds = next;
        }
        const pairs = [];
        for (let i = 0; i < rounds.length; i += 2) {
            pairs.push([rounds[i], rounds[i + 1]]);
        }
        return pairs;
    }

    function generateRoundRobinRounds(entrants, bestOf, targetScore) {
        const list = [...entrants];
        const isOdd = list.length % 2 !== 0;
        if (isOdd) list.push(null);
        const numRounds = list.length - 1;
        const half = list.length / 2;
        const matches = [];

        for (let r = 0; r < numRounds; r++) {
            for (let i = 0; i < half; i++) {
                const e1Name = list[i];
                const e2Name = list[list.length - 1 - i];
                if (e1Name && e2Name) {
                    matches.push({
                        id: `rr_${r + 1}_${matches.length + 1}`,
                        round: r + 1,
                        roundName: `Round ${r + 1}`,
                        bracket: 'roundRobin',
                        matchIndex: matches.length,
                        entrant1: { name: e1Name, seed: entrants.indexOf(e1Name) + 1, score: 0, votes: 0, percent: 0 },
                        entrant2: { name: e2Name, seed: entrants.indexOf(e2Name) + 1, score: 0, votes: 0, percent: 0 },
                        entrants: [e1Name, e2Name],
                        scores: [0, 0],
                        targetScore,
                        bestOf: Number(bestOf) || 0,
                        matchDetails: '',
                        status: 'PENDING',
                        winner: null
                    });
                }
            }
            const fixed = list[0];
            const rest = list.slice(1);
            rest.unshift(rest.pop());
            list.splice(0, list.length, fixed, ...rest);
        }
        return matches;
    }

    function recalculateRoundRobinStandings(tournament) {
        if (!tournament || tournament.format !== 'roundRobin') return;
        const stats = {};
        (tournament.entrantsList || []).forEach(name => {
            stats[name] = { name, played: 0, won: 0, lost: 0, points: 0 };
        });

        for (const m of tournament.matches) {
            if (m.status === 'COMPLETED' && m.winner) {
                const e1 = m.entrant1?.name;
                const e2 = m.entrant2?.name;
                if (stats[e1]) stats[e1].played++;
                if (stats[e2]) stats[e2].played++;

                if (m.winner === e1) {
                    if (stats[e1]) { stats[e1].won++; stats[e1].points += 3; }
                    if (stats[e2]) { stats[e2].lost++; }
                } else if (m.winner === e2) {
                    if (stats[e2]) { stats[e2].won++; stats[e2].points += 3; }
                    if (stats[e1]) { stats[e1].lost++; }
                }
            }
        }

        const sorted = Object.values(stats).sort((a, b) => b.won - a.won || b.points - a.points);
        tournament.standings = sorted;

        const allFinished = tournament.matches.every(m => m.status === 'COMPLETED');
        if (allFinished && sorted.length > 0) {
            tournament.status = 'COMPLETED';
            tournament.champion = sorted[0].name;
            tournament.endedAt = new Date().toISOString();
            const historyItem = JSON.parse(JSON.stringify(tournament));
            const alreadyArchived = tournamentHistory.length > 0 && tournamentHistory[0].id === historyItem.id;
            if (!alreadyArchived) {
                tournamentHistory.unshift(historyItem);
                if (tournamentHistory.length > 30) tournamentHistory.length = 30;
            }
        }
    }

    function createTournament({
        title,
        format = 'single',
        entrants = [],
        progressionMode = 'vote',
        scoringType = 'points',
        bestOf = 0,
        matchDuration = 60,
        blind = false,
        subMultiplier = 1
    } = {}) {
        const cleanEntrants = (Array.isArray(entrants) ? entrants : [])
            .map(e => typeof e === 'string' ? e.trim() : String(e.name || '').trim())
            .filter(Boolean);

        if (cleanEntrants.length < 2) {
            throw new Error('Tournament requires at least 2 participants');
        }

        const targetScore = (Number(bestOf) > 0) ? Math.ceil(Number(bestOf) / 2) : 0;

        if (format === 'roundRobin' || format === 'round-robin') {
            const rawEntrants = [...cleanEntrants];
            const rrMatches = generateRoundRobinRounds(rawEntrants, bestOf, targetScore);
            const standings = rawEntrants.map((name, idx) => ({
                name,
                seed: idx + 1,
                played: 0,
                won: 0,
                lost: 0,
                points: 0
            }));

            activeTournament = {
                id: `tourney-${Date.now().toString(36)}`,
                title: title || 'StreamPulse Tournament',
                format: 'roundRobin',
                progressionMode,
                scoringType,
                bestOf: Number(bestOf) || 0,
                targetScore,
                entrantCount: rawEntrants.length,
                bracketSize: rawEntrants.length,
                roundCount: Math.max(...rrMatches.map(m => m.round || 1)),
                matchDuration: Math.max(10, Number(matchDuration) || 60),
                blind: Boolean(blind),
                subMultiplier: Number(subMultiplier) || 1,
                status: 'READY',
                activeMatchId: rrMatches[0]?.id || null,
                champion: null,
                createdAt: new Date().toISOString(),
                matches: rrMatches,
                entrantsList: rawEntrants,
                standings
            };

            save();
            broadcastTournamentUpdate();
            return activeTournament;
        }

        // Determine smallest power of 2 >= cleanEntrants.length (between 2 and 32)
        const entrantCount = cleanEntrants.length;
        let bracketSize = 2;
        while (bracketSize < entrantCount && bracketSize < 32) {
            bracketSize *= 2;
        }

        while (cleanEntrants.length < bracketSize) {
            cleanEntrants.push('BYE');
        }

        const seedPairs = generateSeedPairs(bracketSize);
        const roundCount = Math.log2(bracketSize);
        const getRoundName = (roundIndex, totalRounds) => {
            const rem = totalRounds - roundIndex;
            if (rem === 0) return 'Grand Finals';
            if (rem === 1) return 'Semifinals';
            if (rem === 2) return 'Quarterfinals';
            if (rem === 3) return 'Round of 16';
            if (rem === 4) return 'Round of 32';
            return `Round ${roundIndex + 1}`;
        };

        const roundMatches = [];
        for (let r = 0; r < roundCount; r++) {
            const rMatches = [];
            const mCount = bracketSize / Math.pow(2, r + 1);
            const rName = getRoundName(r, roundCount - 1);

            for (let m = 0; m < mCount; m++) {
                const id = `m_${r + 1}_${m + 1}`;
                let entrant1 = { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 };
                let entrant2 = { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 };

                if (r === 0) {
                    const pair = seedPairs[m];
                    const s1 = pair[0];
                    const s2 = pair[1];
                    entrant1 = {
                        name: cleanEntrants[s1 - 1] || `Seed ${s1}`,
                        seed: s1,
                        score: 0,
                        votes: 0,
                        percent: 0
                    };
                    entrant2 = {
                        name: cleanEntrants[s2 - 1] || `Seed ${s2}`,
                        seed: s2,
                        score: 0,
                        votes: 0,
                        percent: 0
                    };
                }

                rMatches.push({
                    id,
                    round: r + 1,
                    bracket: 'winners',
                    roundName: rName,
                    matchIndex: m,
                    entrant1,
                    entrant2,
                    entrants: [entrant1.name, entrant2.name],
                    scores: [0, 0],
                    targetScore,
                    bestOf: Number(bestOf) || 0,
                    matchDetails: '',
                    status: 'PENDING',
                    winner: null,
                    nextMatchId: null,
                    nextSlot: (m % 2) + 1
                });
            }
            roundMatches.push(rMatches);
        }

        // Link nextMatchId
        for (let r = 0; r < roundCount - 1; r++) {
            const currentR = roundMatches[r];
            const nextR = roundMatches[r + 1];
            for (let m = 0; m < currentR.length; m++) {
                const nextIdx = Math.floor(m / 2);
                currentR[m].nextMatchId = nextR[nextIdx].id;
                currentR[m].nextSlot = (m % 2) + 1;
            }
        }

        let allMatches = roundMatches.flat();

        // Handle double elimination bracket expansion if selected
        if (format === 'double') {
            const lbMatches = [];
            if (bracketSize === 4) {
                lbMatches.push({
                    id: 'lb_1_1',
                    round: 1,
                    bracket: 'losers',
                    roundName: 'Losers Round 1',
                    matchIndex: 0,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING',
                    winner: null,
                    nextMatchId: 'lb_2_1',
                    nextSlot: 1
                });
                lbMatches.push({
                    id: 'lb_2_1',
                    round: 2,
                    bracket: 'losers',
                    roundName: 'Losers Finals',
                    matchIndex: 0,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING',
                    winner: null,
                    nextMatchId: 'gf_1',
                    nextSlot: 2
                });
                const gf = {
                    id: 'gf_1',
                    round: 3,
                    bracket: 'grand_finals',
                    roundName: 'Grand Finals',
                    matchIndex: 0,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING',
                    winner: null,
                    nextMatchId: null,
                    nextSlot: 1
                };
                const wbFinals = allMatches.find(m => m.round === 2);
                if (wbFinals) {
                    wbFinals.roundName = 'Winners Finals';
                    wbFinals.nextMatchId = 'gf_1';
                    wbFinals.nextSlot = 1;
                }
                allMatches = [...allMatches, ...lbMatches, gf];
            } else if (bracketSize === 8) {
                lbMatches.push({
                    id: 'lb_1_1', round: 1, bracket: 'losers', roundName: 'Losers Round 1', matchIndex: 0,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING', winner: null, nextMatchId: 'lb_2_1', nextSlot: 1
                });
                lbMatches.push({
                    id: 'lb_1_2', round: 1, bracket: 'losers', roundName: 'Losers Round 1', matchIndex: 1,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING', winner: null, nextMatchId: 'lb_2_2', nextSlot: 1
                });
                lbMatches.push({
                    id: 'lb_2_1', round: 2, bracket: 'losers', roundName: 'Losers Round 2', matchIndex: 0,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING', winner: null, nextMatchId: 'lb_3_1', nextSlot: 1
                });
                lbMatches.push({
                    id: 'lb_2_2', round: 2, bracket: 'losers', roundName: 'Losers Round 2', matchIndex: 1,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING', winner: null, nextMatchId: 'lb_3_1', nextSlot: 2
                });
                lbMatches.push({
                    id: 'lb_3_1', round: 3, bracket: 'losers', roundName: 'Losers Semifinals', matchIndex: 0,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING', winner: null, nextMatchId: 'lb_4_1', nextSlot: 1
                });
                lbMatches.push({
                    id: 'lb_4_1', round: 4, bracket: 'losers', roundName: 'Losers Finals', matchIndex: 0,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING', winner: null, nextMatchId: 'gf_1', nextSlot: 2
                });
                const gf = {
                    id: 'gf_1', round: 5, bracket: 'grand_finals', roundName: 'Grand Finals', matchIndex: 0,
                    entrant1: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 },
                    scores: [0, 0], targetScore, bestOf: Number(bestOf) || 0, matchDetails: '',
                    status: 'PENDING', winner: null, nextMatchId: null, nextSlot: 1
                };
                const wbFinals = allMatches.find(m => m.round === 3);
                if (wbFinals) {
                    wbFinals.roundName = 'Winners Finals';
                    wbFinals.nextMatchId = 'gf_1';
                    wbFinals.nextSlot = 1;
                }
                allMatches = [...allMatches, ...lbMatches, gf];
            }
        }

        // Auto-advance any BYEs in round 1
        for (const match of allMatches.filter(m => m.round === 1 && m.bracket === 'winners')) {
            if (match.entrant1.name === 'BYE' && match.entrant2.name !== 'BYE') {
                match.isBye = true;
                match.status = 'COMPLETED';
                match.winner = match.entrant2.name;
                if (match.nextMatchId) {
                    const nextM = allMatches.find(m => m.id === match.nextMatchId);
                    if (nextM) {
                        if (match.nextSlot === 1) nextM.entrant1 = { ...match.entrant2, score: 0, votes: 0, percent: 0 };
                        else nextM.entrant2 = { ...match.entrant2, score: 0, votes: 0, percent: 0 };
                    }
                }
            } else if (match.entrant2.name === 'BYE' && match.entrant1.name !== 'BYE') {
                match.isBye = true;
                match.status = 'COMPLETED';
                match.winner = match.entrant1.name;
                if (match.nextMatchId) {
                    const nextM = allMatches.find(m => m.id === match.nextMatchId);
                    if (nextM) {
                        if (match.nextSlot === 1) nextM.entrant1 = { ...match.entrant1, score: 0, votes: 0, percent: 0 };
                        else nextM.entrant2 = { ...match.entrant1, score: 0, votes: 0, percent: 0 };
                    }
                }
            }
        }

        const firstPlayable = allMatches.find(m =>
            !m.isBye &&
            m.status === 'PENDING' &&
            m.entrant1?.name && m.entrant1.name !== 'TBD' && m.entrant1.name !== 'BYE' &&
            m.entrant2?.name && m.entrant2.name !== 'TBD' && m.entrant2.name !== 'BYE'
        );

        activeTournament = {
            id: `tourney-${Date.now().toString(36)}`,
            title: title || 'StreamPulse Tournament',
            format,
            progressionMode,
            scoringType,
            bestOf: Number(bestOf) || 0,
            targetScore,
            entrantCount,
            bracketSize,
            roundCount,
            matchDuration: Math.max(10, Number(matchDuration) || 60),
            blind: Boolean(blind),
            subMultiplier: Number(subMultiplier) || 1,
            status: 'READY',
            activeMatchId: firstPlayable ? firstPlayable.id : (allMatches[0]?.id || null),
            champion: null,
            createdAt: new Date().toISOString(),
            matches: allMatches
        };

        save();
        broadcastTournamentUpdate();
        return activeTournament;
    }

    function getTournament() {
        return activeTournament;
    }

    function startTournamentMatch(matchId) {
        if (!activeTournament) throw new Error('No active tournament');
        const match = activeTournament.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        if (match.isBye || match.entrant1?.name === 'BYE' || match.entrant2?.name === 'BYE') {
            throw new Error('Cannot start a BYE match — this competitor automatically advances to the next round');
        }

        if (!match.entrant1?.name || match.entrant1.name === 'TBD' || !match.entrant2?.name || match.entrant2.name === 'TBD') {
            throw new Error('Both match participants must be decided before starting');
        }

        match.status = 'ACTIVE';
        activeTournament.activeMatchId = match.id;
        activeTournament.status = 'IN_PROGRESS';

        // Launch native poll for matchup
        const poll = createPoll({
            title: `${activeTournament.title} — ${match.roundName}: ${match.entrant1.name} vs ${match.entrant2.name}`,
            choices: [match.entrant1.name, match.entrant2.name],
            duration: activeTournament.matchDuration,
            blind: activeTournament.blind,
            subMultiplier: activeTournament.subMultiplier,
            tournamentMatchId: match.id,
            celebration: { sound: '', confetti: true }
        });

        save();
        broadcastTournamentUpdate();
        return { match, poll };
    }

    function advanceTournamentMatch(matchId, winnerName) {
        if (!activeTournament) return null;
        const match = activeTournament.matches.find(m => m.id === matchId);
        if (!match) return null;

        const wName = String(winnerName || match.entrant1?.name || '').trim();
        match.status = 'COMPLETED';
        match.winner = wName;

        const isEntrant1Winner = match.entrant1?.name === wName;
        const winnerObj = isEntrant1Winner ? match.entrant1 : match.entrant2;
        const loserObj = isEntrant1Winner ? match.entrant2 : match.entrant1;

        // Cleanly conclude any running match poll linked to this match
        if (activePoll && activePoll.tournamentMatchId === match.id && activePoll.status === 'ACTIVE') {
            activePoll.status = 'COMPLETED';
            activePoll.winner = wName;
            activePoll.endedAt = new Date().toISOString();
            const payload = getPublicPayload(activePoll);
            activePoll = null;
            voters.clear();
            save();
            broadcastToOverlays('poll-update', payload);
        }

        // Advance winner to next match
        if (activeTournament.format === 'roundRobin') {
            recalculateRoundRobinStandings(activeTournament);
            const nextPending = activeTournament.matches.find(m => m.status === 'PENDING');
            activeTournament.activeMatchId = nextPending ? nextPending.id : null;
            if (!nextPending) {
                activeTournament.status = 'COMPLETED';
                activeTournament.champion = activeTournament.standings?.[0]?.name || null;
                tournamentHistory.unshift({ ...activeTournament });
                if (tournamentHistory.length > 20) tournamentHistory.length = 20;

                log(`[Tournament] Round Robin completed! Champion: "${activeTournament.champion}"!`);
                try {
                    onAlert({
                        type: 'poll_end',
                        title: `${activeTournament.title} Champion`,
                        winner: activeTournament.champion,
                        votes: 0,
                        percent: 100,
                        total_votes: 0,
                        user: activeTournament.champion,
                        celebration: { confetti: true }
                    });
                } catch (err) {
                    error('[Tournament] Alert error:', err.message);
                }
            }
        } else if (match.nextMatchId) {
            const nextMatch = activeTournament.matches.find(m => m.id === match.nextMatchId);
            if (nextMatch) {
                const targetObj = { name: wName, seed: winnerObj?.seed || 0, score: 0, votes: 0, percent: 0 };
                if (match.nextSlot === 1) nextMatch.entrant1 = targetObj;
                else nextMatch.entrant2 = targetObj;
                nextMatch.entrants = [nextMatch.entrant1?.name || 'TBD', nextMatch.entrant2?.name || 'TBD'];
            }
            const nextPlayable = activeTournament.matches.find(m =>
                !m.isBye && m.status === 'PENDING' &&
                m.entrant1?.name && m.entrant1.name !== 'TBD' && m.entrant1.name !== 'BYE' &&
                m.entrant2?.name && m.entrant2.name !== 'TBD' && m.entrant2.name !== 'BYE'
            );
            activeTournament.activeMatchId = nextPlayable ? nextPlayable.id : null;
        } else {
            // Grand Finals completed! Crown tournament champion!
            activeTournament.status = 'COMPLETED';
            activeTournament.champion = wName;
            activeTournament.endedAt = new Date().toISOString();
            const historyItem = JSON.parse(JSON.stringify(activeTournament));
            const alreadyArchived = tournamentHistory.length > 0 && tournamentHistory[0].id === historyItem.id;
            if (!alreadyArchived) {
                tournamentHistory.unshift(historyItem);
                if (tournamentHistory.length > 30) tournamentHistory.length = 30;
            }

            log(`[Tournament] Champion crowned: "${wName}" in "${activeTournament.title}"!`);
            try {
                onAlert({
                    type: 'poll_end',
                    title: `${activeTournament.title} Champion`,
                    winner: wName,
                    votes: (match.entrant1?.votes || 0) + (match.entrant2?.votes || 0),
                    percent: 100,
                    total_votes: (match.entrant1?.votes || 0) + (match.entrant2?.votes || 0),
                    user: wName,
                    celebration: { confetti: true }
                });
            } catch (err) {
                error('[Tournament] Alert error:', err.message);
            }
        }

        // Handle double elimination loser routing
        if (activeTournament.format === 'double' && loserObj && loserObj.name !== 'BYE' && loserObj.name !== 'TBD') {
            if (match.id === 'm_1_1') {
                const lb = activeTournament.matches.find(m => m.id === 'lb_1_1');
                if (lb) lb.entrant1 = { ...loserObj, votes: 0, percent: 0 };
            } else if (match.id === 'm_1_2') {
                const lb = activeTournament.matches.find(m => m.id === 'lb_1_1');
                if (lb) lb.entrant2 = { ...loserObj, votes: 0, percent: 0 };
            } else if (match.id === 'm_2_1') {
                const lbf = activeTournament.matches.find(m => m.id === 'lb_2_1');
                if (lbf) lbf.entrant2 = { ...loserObj, votes: 0, percent: 0 };
            }
        }

        save();
        broadcastTournamentUpdate();
        return activeTournament;
    }

    function updateMatchScore(matchId, { entrant1Score, entrant2Score, entrant, score, winner, matchDetails } = {}) {
        if (!activeTournament) throw new Error('No active tournament');
        const match = activeTournament.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        if (entrant !== undefined && score !== undefined) {
            if (match.entrant1?.name === entrant) entrant1Score = score;
            else if (match.entrant2?.name === entrant) entrant2Score = score;
        }

        if (entrant1Score !== undefined) {
            const s1 = Math.max(0, parseInt(entrant1Score, 10) || 0);
            if (match.entrant1) match.entrant1.score = s1;
            if (Array.isArray(match.scores)) match.scores[0] = s1;
        }
        if (entrant2Score !== undefined) {
            const s2 = Math.max(0, parseInt(entrant2Score, 10) || 0);
            if (match.entrant2) match.entrant2.score = s2;
            if (Array.isArray(match.scores)) match.scores[1] = s2;
        }
        if (matchDetails !== undefined) {
            match.matchDetails = String(matchDetails).trim();
        }

        activeTournament.activeMatchId = match.id;
        if (match.status === 'PENDING') {
            match.status = 'ACTIVE';
        }

        // Reaching the target score only flags a pending winner; the operator confirms the advance.
        match.pendingWinner = null;
        if (!winner && match.targetScore > 0) {
            if (match.entrant1.score >= match.targetScore && match.entrant1.name !== 'TBD') match.pendingWinner = match.entrant1.name;
            else if (match.entrant2.score >= match.targetScore && match.entrant2.name !== 'TBD') match.pendingWinner = match.entrant2.name;
        }

        if (winner) {
            advanceTournamentMatch(match.id, winner);
        } else {
            save();
            broadcastTournamentUpdate();
        }

        return { match, tournament: activeTournament, autoAdvanced: Boolean(winner) };
    }

    function selectActiveMatch(matchId) {
        if (!activeTournament) throw new Error('No active tournament');
        const match = activeTournament.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        activeTournament.activeMatchId = match.id;
        if (match.status === 'PENDING' && match.entrant1?.name !== 'TBD' && match.entrant2?.name !== 'TBD') {
            match.status = 'ACTIVE';
        }
        save();
        broadcastTournamentUpdate();
        return { match, tournament: activeTournament };
    }

    function cascadeClearDownstream(startMatchId, oldWinnerName) {
        if (!activeTournament || !Array.isArray(activeTournament.matches)) return;
        const visited = new Set();

        function clearStep(mId, winnerName) {
            if (!mId || visited.has(mId)) return;
            visited.add(mId);

            const current = activeTournament.matches.find(m => m.id === mId);
            if (!current) return;

            const downstreams = activeTournament.matches.filter(m =>
                m.id !== current.id && !visited.has(m.id) &&
                (m.id === current.nextMatchId ||
                (winnerName && (m.entrant1?.name === winnerName || m.entrant2?.name === winnerName)))
            );

            for (const ds of downstreams) {
                const nextWinner = ds.winner;
                if (ds.id === current.nextMatchId) {
                    if (current.nextSlot === 1 || ds.entrant1?.name === winnerName) {
                        ds.entrant1 = { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 };
                    }
                    if (current.nextSlot === 2 || ds.entrant2?.name === winnerName) {
                        ds.entrant2 = { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 };
                    }
                } else if (winnerName) {
                    if (ds.entrant1?.name === winnerName) {
                        ds.entrant1 = { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 };
                    }
                    if (ds.entrant2?.name === winnerName) {
                        ds.entrant2 = { name: 'TBD', seed: 0, score: 0, votes: 0, percent: 0 };
                    }
                }
                ds.entrants = [ds.entrant1?.name || 'TBD', ds.entrant2?.name || 'TBD'];
                ds.status = 'PENDING';
                ds.winner = null;
                ds.scores = [0, 0];
                if (ds.entrant1) { ds.entrant1.score = 0; ds.entrant1.votes = 0; ds.entrant1.percent = 0; }
                if (ds.entrant2) { ds.entrant2.score = 0; ds.entrant2.votes = 0; ds.entrant2.percent = 0; }

                clearStep(ds.id, nextWinner);
            }
        }

        clearStep(startMatchId, oldWinnerName);

        // Always reset champion if Grand Finals was reset or champion matched oldWinnerName
        if (activeTournament.champion && (activeTournament.champion === oldWinnerName || !activeTournament.matches.some(m => m.roundName === 'Grand Finals' && m.status === 'COMPLETED'))) {
            activeTournament.champion = null;
            if (activeTournament.status === 'COMPLETED') {
                activeTournament.status = 'IN_PROGRESS';
            }
        }
    }

    function rollbackTournamentMatch(matchId) {
        if (!activeTournament) throw new Error('No active tournament');
        const match = activeTournament.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        const oldWinner = match.winner;
        match.status = 'ACTIVE';
        match.winner = null;
        if (match.entrant1) { match.entrant1.score = 0; match.entrant1.votes = 0; match.entrant1.percent = 0; }
        if (match.entrant2) { match.entrant2.score = 0; match.entrant2.votes = 0; match.entrant2.percent = 0; }
        match.scores = [0, 0];

        cascadeClearDownstream(match.id, oldWinner);

        activeTournament.activeMatchId = match.id;
        activeTournament.status = 'IN_PROGRESS';
        save();
        broadcastTournamentUpdate();
        return { match, tournament: activeTournament };
    }

    function resetMatch(matchId) {
        if (!activeTournament) throw new Error('No active tournament');
        const match = activeTournament.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        const oldWinner = match.winner;
        match.status = 'PENDING';
        match.winner = null;
        if (match.entrant1) { match.entrant1.score = 0; match.entrant1.votes = 0; match.entrant1.percent = 0; }
        if (match.entrant2) { match.entrant2.score = 0; match.entrant2.votes = 0; match.entrant2.percent = 0; }
        match.scores = [0, 0];

        cascadeClearDownstream(match.id, oldWinner);

        save();
        broadcastTournamentUpdate();
        return { match, tournament: activeTournament };
    }

    function updateTournamentSettings(settings = {}) {
        if (!activeTournament) throw new Error('No active tournament');
        if (settings.title) activeTournament.title = String(settings.title).trim();
        if (settings.progressionMode) activeTournament.progressionMode = settings.progressionMode;
        if (settings.scoringType) activeTournament.scoringType = settings.scoringType;
        if (settings.bestOf !== undefined) {
            activeTournament.bestOf = Number(settings.bestOf) || 0;
            const targetScore = activeTournament.bestOf > 0 ? Math.ceil(activeTournament.bestOf / 2) : 0;
            activeTournament.targetScore = targetScore;
            activeTournament.matches.forEach(m => {
                m.bestOf = activeTournament.bestOf;
                m.targetScore = targetScore;
            });
        }
        if (settings.matchDuration !== undefined) activeTournament.matchDuration = Number(settings.matchDuration) || 60;
        if (settings.blind !== undefined) activeTournament.blind = Boolean(settings.blind);
        save();
        broadcastTournamentUpdate();
        return activeTournament;
    }

    function resetTournament({ saveToHistory = true } = {}) {
        if (!activeTournament) return { ok: true };
        if (activePoll && activePoll.tournamentMatchId) {
            finishPoll('TERMINATED');
        }
        if (saveToHistory) {
            const hasStarted = activeTournament.matches?.some(m => m.status === 'COMPLETED' || m.status === 'ACTIVE') || activeTournament.status === 'COMPLETED';
            if (hasStarted) {
                const historyItem = {
                    ...JSON.parse(JSON.stringify(activeTournament)),
                    id: activeTournament.id || `th_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    endedAt: activeTournament.endedAt || new Date().toISOString()
                };
                const alreadyArchived = tournamentHistory.length > 0 && tournamentHistory[0].id === historyItem.id;
                if (!alreadyArchived) {
                    tournamentHistory.unshift(historyItem);
                    if (tournamentHistory.length > 30) tournamentHistory.length = 30;
                }
            }
        }
        activeTournament = null;
        save();
        broadcastToOverlays('tournament-update', null);
        return { ok: true };
    }

    function getTournamentHistory() {
        return tournamentHistory;
    }

    function restoreTournament(id) {
        const item = tournamentHistory.find(t => t.id === id);
        if (!item) throw new Error('Tournament history record not found');
        activeTournament = JSON.parse(JSON.stringify(item));
        activeTournament.status = 'IN_PROGRESS';
        const activeMatch = (activeTournament.matches || []).find(m => !m.isBye && !m.winner) || activeTournament.matches?.[0];
        if (activeMatch) activeTournament.activeMatchId = activeMatch.id;
        save();
        broadcastTournamentUpdate();
        return activeTournament;
    }

    function deleteTournamentHistory(id) {
        tournamentHistory = tournamentHistory.filter(t => t.id !== id);
        save();
        return { ok: true };
    }

    function clearTournamentHistory() {
        tournamentHistory = [];
        save();
        return { ok: true };
    }

    function getTournamentPresets() {
        return tournamentPresets.map(p => ({
            ...p,
            isBuiltIn: DEFAULT_TOURNAMENT_PRESETS.some(b => b.id === p.id)
        }));
    }

    function saveTournamentPreset(preset = {}) {
        const name = String(preset.name || preset.title || '').trim();
        if (!name) throw new Error('Preset name is required');
        const entrants = Array.isArray(preset.entrants) ? preset.entrants.map(e => String(e).trim()).filter(Boolean) : [];
        if (entrants.length < 2) throw new Error('Preset requires at least 2 entrants');

        const isBuiltIn = DEFAULT_TOURNAMENT_PRESETS.some(b => b.id === preset.id);
        const id = (preset.id && !isBuiltIn) ? preset.id : `preset-tourney-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const existingIdx = tournamentPresets.findIndex(p => p.id === id);
        const item = {
            id,
            name,
            title: String(preset.title || name).trim(),
            format: preset.format || 'single',
            progressionMode: preset.progressionMode || 'manual',
            scoringType: preset.scoringType || 'bestOf',
            bestOf: Number(preset.bestOf) || 3,
            matchDuration: Number(preset.matchDuration) || 120,
            entrants,
            isCustom: true
        };
        if (existingIdx >= 0) tournamentPresets[existingIdx] = item;
        else tournamentPresets.push(item);
        save();
        return item;
    }

    function updateTournamentPreset(id, updates = {}) {
        const existingIdx = tournamentPresets.findIndex(p => p.id === id);
        if (existingIdx === -1) throw new Error(`Preset ${id} not found`);
        const p = tournamentPresets[existingIdx];
        if (updates.name !== undefined && String(updates.name).trim()) p.name = String(updates.name).trim();
        if (updates.title !== undefined && String(updates.title).trim()) p.title = String(updates.title).trim();
        if (updates.format !== undefined) p.format = updates.format;
        if (updates.progressionMode !== undefined) p.progressionMode = updates.progressionMode;
        if (updates.scoringType !== undefined) p.scoringType = updates.scoringType;
        if (updates.bestOf !== undefined) p.bestOf = Number(updates.bestOf) || 3;
        if (updates.matchDuration !== undefined) p.matchDuration = Number(updates.matchDuration) || 120;
        if (Array.isArray(updates.entrants) && updates.entrants.length >= 2) {
            p.entrants = updates.entrants.map(e => String(e).trim()).filter(Boolean);
        }
        p.isCustom = true;
        save();
        return p;
    }

    function deleteTournamentPreset(id) {
        tournamentPresets = tournamentPresets.filter(p => p.id !== id);
        save();
        return { ok: true };
    }

    // --- In-Progress Tournament Drafts & Checkpoints ---
    function getTournamentDrafts() {
        return tournamentDrafts;
    }

    function saveTournamentDraft(name) {
        if (!activeTournament) throw new Error('No active tournament to save as draft');
        const draftName = String(name || activeTournament.title || 'Tournament Snapshot').trim();
        const item = {
            id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            name: draftName,
            savedAt: new Date().toISOString(),
            tournament: JSON.parse(JSON.stringify(activeTournament))
        };
        tournamentDrafts.unshift(item);
        if (tournamentDrafts.length > 30) tournamentDrafts.length = 30;
        save();
        return item;
    }

    function restoreTournamentDraft(id) {
        const draft = tournamentDrafts.find(d => d.id === id);
        if (!draft || !draft.tournament) throw new Error(`Draft ${id} not found`);
        activeTournament = JSON.parse(JSON.stringify(draft.tournament));
        save();
        broadcastTournamentUpdate();
        return activeTournament;
    }

    function deleteTournamentDraft(id) {
        tournamentDrafts = tournamentDrafts.filter(d => d.id !== id);
        save();
        return { ok: true };
    }

    return {
        createPoll,
        finishPoll,
        extendPoll,
        cancelPoll,
        castVote,
        handleChatMessage,
        getActivePoll: () => activePoll ? getPublicPayload(activePoll) : null,
        getLatestPoll,
        getHistory: () => pollHistory.slice(0, 50).map(p => getPublicPayload(p)),
        clearHistory: () => { pollHistory = []; save(); },
        // Presets
        getPresets,
        savePreset,
        deletePreset,
        // Tournaments
        createTournament,
        getTournament,
        startTournamentMatch,
        advanceTournamentMatch,
        updateMatchScore,
        selectActiveMatch,
        resetMatch,
        rollbackTournamentMatch,
        updateTournamentSettings,
        resetTournament,
        getTournamentHistory,
        restoreTournament,
        deleteTournamentHistory,
        clearTournamentHistory,
        getTournamentPresets,
        saveTournamentPreset,
        updateTournamentPreset,
        deleteTournamentPreset,
        getTournamentDrafts,
        saveTournamentDraft,
        restoreTournamentDraft,
        deleteTournamentDraft,
        destroy: () => { if (pollTimer) clearInterval(pollTimer); }
    };
}

module.exports = { createPollService, DEFAULT_PRESETS };
