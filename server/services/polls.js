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
    chatbotAnnouncer = null,
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
    let activePollTournament = null;
    let pollTournamentHistory = [];
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
                if (data.tournament.isPoll && !data.pollTournament) {
                    activePollTournament = data.tournament;
                } else {
                    activeTournament = data.tournament;
                }
            }
            if (Array.isArray(data.tournamentHistory)) {
                tournamentHistory = data.tournamentHistory.slice(0, 30);
            }
            if (Array.isArray(data.tournamentPresets)) {
                tournamentPresets = data.tournamentPresets;
            }
            if (Array.isArray(data.tournamentDrafts)) {
                tournamentDrafts = data.tournamentDrafts.slice(0, 30);
            }
            if (data.pollTournament) {
                activePollTournament = data.pollTournament;
            }
            if (Array.isArray(data.pollTournamentHistory)) {
                pollTournamentHistory = data.pollTournamentHistory.slice(0, 30);
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
                tournamentDrafts: tournamentDrafts.slice(0, 30),
                pollTournament: activePollTournament,
                pollTournamentHistory: pollTournamentHistory.slice(0, 30)
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
        if (activePoll.tournamentMatchId) {
            const pollMatch = activePollTournament?.matches?.find(m => m.id === activePoll.tournamentMatchId);
            if (pollMatch && pollMatch.status === 'ACTIVE') {
                if (pollMatch.entrant1 && activePoll.choices[0]) {
                    pollMatch.entrant1.votes = activePoll.choices[0].votes;
                    pollMatch.entrant1.percent = Math.round(activePoll.choices[0].percent);
                }
                if (pollMatch.entrant2 && activePoll.choices[1]) {
                    pollMatch.entrant2.votes = activePoll.choices[1].votes;
                    pollMatch.entrant2.percent = Math.round(activePoll.choices[1].percent);
                }
                broadcastPollTournamentUpdate();
            }
            const match = activeTournament?.matches?.find(m => m.id === activePoll.tournamentMatchId);
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

    function broadcastPollTournamentUpdate() {
        if (!activePollTournament) return;
        broadcastToOverlays('poll-tournament-update', activePollTournament);
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
            announceChat: params.announceChat !== false,
            settings
        };

        save();
        startTimer();

        const payload = getPublicPayload(activePoll);
        const takeoverMs = duration > 0 ? duration * 1000 : 3600000;
        onTakeover('poll-active', activePoll.title, takeoverMs);
        broadcastToOverlays('poll-update', payload);

        if (activePoll.announceChat && chatbotAnnouncer?.announcePollStart) {
            Promise.resolve().then(() => chatbotAnnouncer.announcePollStart(activePoll)).catch(() => {});
        }

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

        if (status === 'COMPLETED' && finishedPoll.announceChat && chatbotAnnouncer?.announcePollEnd) {
            Promise.resolve().then(() => chatbotAnnouncer.announcePollEnd(finishedPoll)).catch(() => {});
        }

        // Handle linked tournament match cleanly
        if (finishedPoll.tournamentMatchId) {
            const isPollTourney = Boolean(activePollTournament?.matches?.some(m => m.id === finishedPoll.tournamentMatchId));
            const targetTourney = isPollTourney ? activePollTournament : activeTournament;
            const broadcastFn = isPollTourney ? broadcastPollTournamentUpdate : broadcastTournamentUpdate;
            if (targetTourney && Array.isArray(targetTourney.matches)) {
                const match = targetTourney.matches.find(m => m.id === finishedPoll.tournamentMatchId);
                if (status === 'COMPLETED' && finishedPoll.winner && !finishedPoll.isTie && (finishedPoll.totalVotes || 0) > 0) {
                    advanceTournamentMatch(finishedPoll.tournamentMatchId, finishedPoll.winner, { isPoll: isPollTourney });
                } else if (status === 'TERMINATED') {
                    if (match) {
                        match.status = 'PENDING';
                        match.winner = null;
                        if (match.entrant1) { match.entrant1.votes = 0; match.entrant1.percent = 0; }
                        if (match.entrant2) { match.entrant2.votes = 0; match.entrant2.percent = 0; }
                        broadcastFn();
                    }
                } else {
                    if (match) {
                        match.status = 'PENDING';
                        match.winner = null;
                        broadcastFn();
                    }
                    log(`[Polls] Tournament match poll "${finishedPoll.title}" completed with 0 votes or tie — match retained for resolution.`);
                }
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

        // Never count announcements or bot messages as votes
        if (/^\[(?:bot|poll|tournament)/i.test(text)) return false;
        if (chatbotAnnouncer?.isBotMessage?.(text)) return false;
        const botTag = chatbotAnnouncer?.getTag?.();
        if (botTag && text.toLowerCase().startsWith(botTag.toLowerCase())) return false;

        let choiceIndex = -1;

        // 1. Command format: !vote 1, <prefix>vote 1, or !vote <word>
        const botPrefix = chatbotAnnouncer?.getPrefix?.() || '!';
        const escapedPrefix = botPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cmdMatch = text.match(new RegExp(`^(?:${escapedPrefix}|!)vote\\s+(.+)$`, 'i'));
        if (cmdMatch) {
            const arg = cmdMatch[1].trim();
            // Ignore if arg contains choice prompt syntax like "1: Title" or "1 - Title"
            if (/^\d+\s*[:\-\u2014]/.test(arg)) return false;

            // Only treat as option number if arg is strictly digits (e.g. "1", "2")
            const num = /^\d+$/.test(arg) ? parseInt(arg, 10) : NaN;
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
    function parseEntrant(item) {
        if (!item) return null;
        if (typeof item === 'object') {
            const name = String(item.name || '').trim();
            const tag = String(item.tag || '').trim();
            const color = String(item.color || '').trim();
            return name ? { name, tag, ...(color ? { color } : {}) } : null;
        }
        const raw = String(item).trim();
        if (!raw) return null;

        // Pattern 1: Name [Tag] e.g. Daigo [Ryu]
        let m = raw.match(/^(.*?)\s*\[(.*?)\]$/);
        if (m && m[1].trim()) return { name: m[1].trim(), tag: m[2].trim() };

        // Pattern 2: Tag | Name e.g. FOX | SonicFox
        m = raw.match(/^(.*?)\s*\|\s*(.*)$/);
        if (m && m[1].trim() && m[2].trim()) return { name: m[2].trim(), tag: m[1].trim() };

        // Pattern 3: Name (Tag) e.g. Tokido (Ken)
        m = raw.match(/^(.*?)\s*\((.*?)\)$/);
        if (m && m[1].trim()) return { name: m[1].trim(), tag: m[2].trim() };

        // Pattern 4: Name, Tag e.g. MenaRD, Zangief
        m = raw.match(/^(.*?)\s*,\s*(.*?)$/);
        if (m && m[1].trim()) return { name: m[1].trim(), tag: m[2].trim() };

        return { name: raw, tag: '' };
    }

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

    function generateRoundRobinRounds(entrants, bestOf, targetScore, legs = 1, roundsBestOf = 0) {
        const list = [...entrants];
        const isOdd = list.length % 2 !== 0;
        if (isOdd) list.push(null);
        const numRounds = list.length - 1;
        const half = list.length / 2;
        const matches = [];

        // Leg 1
        for (let r = 0; r < numRounds; r++) {
            for (let i = 0; i < half; i++) {
                const e1 = list[i];
                const e2 = list[list.length - 1 - i];
                if (e1 && e2) {
                    const e1Name = typeof e1 === 'object' ? e1.name : e1;
                    const e1Tag = typeof e1 === 'object' ? (e1.tag || '') : '';
                    const e1Color = typeof e1 === 'object' ? (e1.color || '') : '';
                    const e2Name = typeof e2 === 'object' ? e2.name : e2;
                    const e2Tag = typeof e2 === 'object' ? (e2.tag || '') : '';
                    const e2Color = typeof e2 === 'object' ? (e2.color || '') : '';
                    matches.push({
                        id: `rr_1_${r + 1}_${matches.length + 1}`,
                        round: r + 1,
                        roundName: legs > 1 ? `Round ${r + 1} (Leg 1)` : `Round ${r + 1}`,
                        bracket: 'roundRobin',
                        matchIndex: matches.length,
                        leg: 1,
                        entrant1: { name: e1Name, tag: e1Tag, color: e1Color, seed: entrants.findIndex(x => (typeof x === 'object' ? x.name : x) === e1Name) + 1, score: 0, rounds: 0, votes: 0, percent: 0 },
                        entrant2: { name: e2Name, tag: e2Tag, color: e2Color, seed: entrants.findIndex(x => (typeof x === 'object' ? x.name : x) === e2Name) + 1, score: 0, rounds: 0, votes: 0, percent: 0 },
                        entrants: [e1Name, e2Name],
                        scores: [0, 0],
                        targetScore,
                        bestOf: Number(bestOf) || 0,
                        roundsBestOf: Number(roundsBestOf) || 0,
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

        // Leg 2 (Double Round Robin: Home & Away reversed)
        if (legs > 1) {
            const leg2List = [...entrants];
            if (isOdd) leg2List.push(null);
            for (let r = 0; r < numRounds; r++) {
                for (let i = 0; i < half; i++) {
                    const e2 = leg2List[i];
                    const e1 = leg2List[leg2List.length - 1 - i];
                    if (e1 && e2) {
                        const e1Name = typeof e1 === 'object' ? e1.name : e1;
                        const e1Tag = typeof e1 === 'object' ? (e1.tag || '') : '';
                        const e1Color = typeof e1 === 'object' ? (e1.color || '') : '';
                        const e2Name = typeof e2 === 'object' ? e2.name : e2;
                        const e2Tag = typeof e2 === 'object' ? (e2.tag || '') : '';
                        const e2Color = typeof e2 === 'object' ? (e2.color || '') : '';
                        matches.push({
                            id: `rr_2_${r + 1}_${matches.length + 1}`,
                            round: numRounds + r + 1,
                            roundName: `Round ${numRounds + r + 1} (Leg 2)`,
                            bracket: 'roundRobin',
                            matchIndex: matches.length,
                            leg: 2,
                            entrant1: { name: e1Name, tag: e1Tag, color: e1Color, seed: entrants.findIndex(x => (typeof x === 'object' ? x.name : x) === e1Name) + 1, score: 0, rounds: 0, votes: 0, percent: 0 },
                            entrant2: { name: e2Name, tag: e2Tag, color: e2Color, seed: entrants.findIndex(x => (typeof x === 'object' ? x.name : x) === e2Name) + 1, score: 0, rounds: 0, votes: 0, percent: 0 },
                            entrants: [e1Name, e2Name],
                            scores: [0, 0],
                            targetScore,
                            bestOf: Number(bestOf) || 0,
                            roundsBestOf: Number(roundsBestOf) || 0,
                            matchDetails: '',
                            status: 'PENDING',
                            winner: null
                        });
                    }
                }
                const fixed = leg2List[0];
                const rest = leg2List.slice(1);
                rest.unshift(rest.pop());
                leg2List.splice(0, leg2List.length, fixed, ...rest);
            }
        }

        return matches;
    }

    function recalculateRoundRobinStandings(tournament) {
        if (!tournament || tournament.format !== 'roundRobin') return;
        const stats = {};
        const winPts = tournament.pointsPerWin !== undefined ? tournament.pointsPerWin : 3;
        const drawPts = tournament.pointsPerDraw !== undefined ? tournament.pointsPerDraw : 1;
        const lossPts = tournament.pointsPerLoss !== undefined ? tournament.pointsPerLoss : 0;

        (tournament.entrantsList || []).forEach(name => {
            const parsed = parseEntrant(name);
            const rawName = parsed ? parsed.name : name;
            stats[rawName] = { name: rawName, tag: parsed?.tag || '', played: 0, won: 0, lost: 0, draws: 0, scoreFor: 0, scoreAgainst: 0, diff: 0, points: 0 };
        });

        for (const m of tournament.matches) {
            if (m.status === 'COMPLETED' && (m.winner || m.isDraw)) {
                const e1 = m.entrant1?.name;
                const e2 = m.entrant2?.name;
                const s1 = m.entrant1?.score || (Array.isArray(m.scores) ? m.scores[0] : 0) || 0;
                const s2 = m.entrant2?.score || (Array.isArray(m.scores) ? m.scores[1] : 0) || 0;

                if (stats[e1]) {
                    stats[e1].played++;
                    stats[e1].scoreFor += s1;
                    stats[e1].scoreAgainst += s2;
                    stats[e1].diff = stats[e1].scoreFor - stats[e1].scoreAgainst;
                }
                if (stats[e2]) {
                    stats[e2].played++;
                    stats[e2].scoreFor += s2;
                    stats[e2].scoreAgainst += s1;
                    stats[e2].diff = stats[e2].scoreFor - stats[e2].scoreAgainst;
                }

                if (m.winner === 'DRAW' || m.isDraw) {
                    if (stats[e1]) { stats[e1].draws++; stats[e1].points += drawPts; }
                    if (stats[e2]) { stats[e2].draws++; stats[e2].points += drawPts; }
                } else if (m.winner === e1) {
                    if (stats[e1]) { stats[e1].won++; stats[e1].points += winPts; }
                    if (stats[e2]) { stats[e2].lost++; stats[e2].points += lossPts; }
                } else if (m.winner === e2) {
                    if (stats[e2]) { stats[e2].won++; stats[e2].points += winPts; }
                    if (stats[e1]) { stats[e1].lost++; stats[e1].points += lossPts; }
                }
            }
        }

        const sorted = Object.values(stats).sort((a, b) => b.points - a.points || b.won - a.won || b.diff - a.diff || b.scoreFor - a.scoreFor);
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

    function createTournament(input = {}, opts = {}) {
        const {
            title,
            logo = '',
            logoSize = '',
            format = 'single',
            entrants = [],
            progressionMode = 'vote',
            scoringType = 'points',
            bestOf = 0,
            roundsBestOf = 0,
            targetScore: rawTargetScore = 0,
            matchDuration = 60,
            blind = false,
            subMultiplier = 1,
            roundRobinLegs = 1,
            pointsSystem = '3-1-0',
            pointsPerWin,
            pointsPerDraw,
            pointsPerLoss = 0,
            allowDraws = true,
            isPoll: inputIsPoll = false
        } = input;
        const isPoll = Boolean(opts.isPoll !== undefined ? opts.isPoll : inputIsPoll);
        const cleanEntrants = (Array.isArray(entrants) ? entrants : [])
            .map(parseEntrant)
            .filter(Boolean);

        if (cleanEntrants.length < 2) {
            throw new Error('Tournament requires at least 2 participants');
        }

        const targetScore = (Number(bestOf) > 0)
            ? Math.ceil(Number(bestOf) / 2)
            : Math.max(0, parseInt(rawTargetScore, 10) || 0);
        const numRoundsBestOf = Math.max(0, parseInt(roundsBestOf, 10) || 0);

        if (format === 'roundRobin' || format === 'round-robin') {
            const rawEntrants = [...cleanEntrants];
            const legs = Math.max(1, Math.min(2, parseInt(roundRobinLegs, 10) || 1));
            let winPts = 3, drawPts = 1, lossPts = 0;
            if (pointsSystem === '1-0-0') { winPts = 1; drawPts = 0; lossPts = 0; }
            else if (pointsSystem === '2-1-0') { winPts = 2; drawPts = 1; lossPts = 0; }
            if (pointsPerWin !== undefined) winPts = Number(pointsPerWin) || 0;
            if (pointsPerDraw !== undefined) drawPts = Number(pointsPerDraw) || 0;
            if (pointsPerLoss !== undefined) lossPts = Number(pointsPerLoss) || 0;

            const rrMatches = generateRoundRobinRounds(rawEntrants, bestOf, targetScore, legs, numRoundsBestOf);
            const standings = rawEntrants.map((e, idx) => ({
                name: e.name,
                tag: e.tag || '',
                color: e.color || '',
                seed: idx + 1,
                played: 0,
                won: 0,
                lost: 0,
                draws: 0,
                scoreFor: 0,
                scoreAgainst: 0,
                diff: 0,
                points: 0
            }));

            const tourneyObj = {
                id: `tourney-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                title: title || 'StreamPulse Tournament',
                logo: String(logo || '').trim(),
                logoSize: String(logoSize || '').trim(),
                format: 'roundRobin',
                progressionMode,
                scoringType,
                bestOf: Number(bestOf) || 0,
                roundsBestOf: numRoundsBestOf,
                targetScore,
                roundRobinLegs: legs,
                pointsSystem,
                pointsPerWin: winPts,
                pointsPerDraw: drawPts,
                pointsPerLoss: lossPts,
                allowDraws: Boolean(allowDraws),
                entrantCount: rawEntrants.length,
                bracketSize: rawEntrants.length,
                roundCount: Math.max(...rrMatches.map(m => m.round || 1)),
                matchDuration: Math.max(10, Number(matchDuration) || 60),
                blind: Boolean(blind),
                subMultiplier: Number(subMultiplier) || 1,
                status: 'READY',
                activeMatchId: rrMatches[0]?.id || null,
                highlightLive: true,
                champion: null,
                createdAt: new Date().toISOString(),
                matches: rrMatches,
                entrantsList: rawEntrants.map(e => e.tag ? `${e.name} [${e.tag}]` : e.name),
                standings,
                announceChat: input.announceChat !== false,
                isPoll: Boolean(isPoll)
            };

            if (isPoll) {
                activePollTournament = tourneyObj;
                save();
                broadcastPollTournamentUpdate();
                return activePollTournament;
            } else {
                activeTournament = tourneyObj;
                save();
                broadcastTournamentUpdate();
                return activeTournament;
            }
        }

        // Determine smallest power of 2 >= cleanEntrants.length (between 2 and 32)
        const entrantCount = cleanEntrants.length;
        let bracketSize = 2;
        while (bracketSize < entrantCount && bracketSize < 32) {
            bracketSize *= 2;
        }

        while (cleanEntrants.length < bracketSize) {
            cleanEntrants.push({ name: 'BYE', tag: '' });
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
                let entrant1 = { name: 'TBD', tag: '', color: '', seed: 0, score: 0, votes: 0, percent: 0 };
                let entrant2 = { name: 'TBD', tag: '', color: '', seed: 0, score: 0, votes: 0, percent: 0 };

                if (r === 0) {
                    const pair = seedPairs[m];
                    const s1 = pair[0];
                    const s2 = pair[1];
                    const e1 = cleanEntrants[s1 - 1];
                    const e2 = cleanEntrants[s2 - 1];
                    entrant1 = {
                        name: e1?.name || `Seed ${s1}`,
                        tag: e1?.tag || '',
                        color: e1?.color || (m % 2 === 0 ? '#ef4444' : '#3b82f6'),
                        seed: s1,
                        score: 0,
                        votes: 0,
                        percent: 0
                    };
                    entrant2 = {
                        name: e2?.name || `Seed ${s2}`,
                        tag: e2?.tag || '',
                        color: e2?.color || (m % 2 === 0 ? '#3b82f6' : '#ef4444'),
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

        allMatches.forEach(m => {
            m.roundsBestOf = numRoundsBestOf;
            if (m.entrant1 && m.entrant1.rounds === undefined) m.entrant1.rounds = 0;
            if (m.entrant2 && m.entrant2.rounds === undefined) m.entrant2.rounds = 0;
        });

        const elimTourneyObj = {
            id: `tourney-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            title: title || 'StreamPulse Tournament',
            logo: String(logo || '').trim(),
            logoSize: String(logoSize || '').trim(),
            format,
            progressionMode,
            scoringType,
            bestOf: Number(bestOf) || 0,
            roundsBestOf: numRoundsBestOf,
            targetScore,
            entrantCount,
            bracketSize,
            roundCount,
            matchDuration: Math.max(10, Number(matchDuration) || 60),
            blind: Boolean(blind),
            subMultiplier: Number(subMultiplier) || 1,
            status: 'READY',
            activeMatchId: firstPlayable ? firstPlayable.id : (allMatches[0]?.id || null),
            highlightLive: true,
            champion: null,
            createdAt: new Date().toISOString(),
            matches: allMatches,
            entrantsList: cleanEntrants.filter(e => e.name !== 'BYE').map(e => e.tag ? `${e.name} [${e.tag}]` : e.name),
            announceChat: input.announceChat !== false,
            isPoll: Boolean(isPoll)
        };

        if (isPoll) {
            activePollTournament = elimTourneyObj;
            save();
            broadcastPollTournamentUpdate();
            return activePollTournament;
        } else {
            activeTournament = elimTourneyObj;
            save();
            broadcastTournamentUpdate();
            return activeTournament;
        }
    }

    function resolveTargetTournament(matchId, isPoll = false) {
        if (matchId && activePollTournament?.matches?.some(m => m.id === matchId)) {
            return { tournament: activePollTournament, isPoll: true };
        }
        if (matchId && activeTournament?.matches?.some(m => m.id === matchId)) {
            return { tournament: activeTournament, isPoll: false };
        }
        if (isPoll) {
            return {
                tournament: activePollTournament || activeTournament,
                isPoll: Boolean(activePollTournament || !activeTournament)
            };
        }
        return {
            tournament: activeTournament || activePollTournament,
            isPoll: Boolean(!activeTournament && activePollTournament)
        };
    }

    function getTournament({ isPoll = false } = {}) {
        return isPoll ? activePollTournament : activeTournament;
    }

    function startTournamentMatch(matchId, { isPoll = false } = {}) {
        const { tournament: targetTourney, isPoll: isPollTourney } = resolveTargetTournament(matchId, isPoll);
        if (!targetTourney) throw new Error('No active tournament');
        const match = targetTourney.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        if (match.isBye || match.entrant1?.name === 'BYE' || match.entrant2?.name === 'BYE') {
            throw new Error('Cannot start a BYE match — this competitor automatically advances to the next round');
        }

        if (!match.entrant1?.name || match.entrant1.name === 'TBD' || !match.entrant2?.name || match.entrant2.name === 'TBD') {
            throw new Error('Both match participants must be decided before starting');
        }

        match.status = 'ACTIVE';
        targetTourney.activeMatchId = match.id;
        targetTourney.status = 'IN_PROGRESS';

        // Launch native poll for matchup
        const poll = createPoll({
            title: `${targetTourney.title} — ${match.roundName}: ${match.entrant1.name} vs ${match.entrant2.name}`,
            choices: [match.entrant1.name, match.entrant2.name],
            duration: targetTourney.matchDuration,
            blind: targetTourney.blind,
            subMultiplier: targetTourney.subMultiplier,
            tournamentMatchId: match.id,
            celebration: { sound: '', confetti: true },
            announceChat: targetTourney.announceChat !== false
        });

        save();
        if (isPollTourney) broadcastPollTournamentUpdate();
        else broadcastTournamentUpdate();
        return { match, poll };
    }
    function advanceTournamentMatch(matchId, winnerName, { isPoll = false } = {}) {
        const { tournament: targetTourney, isPoll: isPollTourney } = resolveTargetTournament(matchId, isPoll);
        if (!targetTourney) return null;
        const match = targetTourney.matches.find(m => m.id === matchId);
        if (!match) return null;

        const wName = String(winnerName || match.entrant1?.name || '').trim();
        const isDraw = wName === 'DRAW' || wName === 'TIE';
        match.status = 'COMPLETED';
        match.winner = isDraw ? 'DRAW' : wName;
        match.isDraw = isDraw;

        const isEntrant1Winner = !isDraw && match.entrant1?.name === wName;
        const winnerObj = isDraw ? null : (isEntrant1Winner ? match.entrant1 : match.entrant2);
        const loserObj = isDraw ? null : (isEntrant1Winner ? match.entrant2 : match.entrant1);

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
        if (targetTourney.format === 'roundRobin') {
            recalculateRoundRobinStandings(targetTourney);
            const nextPending = targetTourney.matches.find(m => m.status === 'PENDING');
            if (targetTourney.highlightLive !== false && targetTourney.activeMatchId === match.id) {
                targetTourney.activeMatchId = nextPending ? nextPending.id : null;
            }
            if (!nextPending) {
                targetTourney.status = 'COMPLETED';
                targetTourney.champion = targetTourney.standings?.[0]?.name || null;
                const hist = isPollTourney ? pollTournamentHistory : tournamentHistory;
                hist.unshift({ ...targetTourney });
                if (hist.length > 20) hist.length = 20;

                log(`[Tournament] Round Robin completed! Champion: "${targetTourney.champion}"!`);
                if (targetTourney.announceChat !== false && chatbotAnnouncer?.announceTournamentChampion) {
                    Promise.resolve().then(() => chatbotAnnouncer.announceTournamentChampion(targetTourney)).catch(() => {});
                }
                try {
                    onAlert({
                        type: 'poll_end',
                        title: `${targetTourney.title} Champion`,
                        winner: targetTourney.champion,
                        votes: 0,
                        percent: 100,
                        total_votes: 0,
                        user: targetTourney.champion,
                        celebration: { confetti: true }
                    });
                } catch (err) {
                    error('[Tournament] Alert error:', err.message);
                }
            }
        } else if (match.nextMatchId) {
            const nextMatch = targetTourney.matches.find(m => m.id === match.nextMatchId);
            if (nextMatch) {
                const targetObj = { name: wName, tag: winnerObj?.tag || '', color: winnerObj?.color || '', seed: winnerObj?.seed || 0, score: 0, rounds: 0, votes: 0, percent: 0 };
                if (match.nextSlot === 1) nextMatch.entrant1 = targetObj;
                else nextMatch.entrant2 = targetObj;
                nextMatch.entrants = [nextMatch.entrant1?.name || 'TBD', nextMatch.entrant2?.name || 'TBD'];
            }
            const nextPlayable = targetTourney.matches.find(m =>
                !m.isBye && m.status === 'PENDING' &&
                m.entrant1?.name && m.entrant1.name !== 'TBD' && m.entrant1.name !== 'BYE' &&
                m.entrant2?.name && m.entrant2.name !== 'TBD' && m.entrant2.name !== 'BYE'
            );
            if (targetTourney.highlightLive !== false && targetTourney.activeMatchId === match.id) {
                targetTourney.activeMatchId = nextPlayable ? nextPlayable.id : null;
            }
        } else {
            // Grand Finals completed! Crown tournament champion!
            targetTourney.status = 'COMPLETED';
            targetTourney.champion = wName;
            targetTourney.endedAt = new Date().toISOString();
            const historyItem = JSON.parse(JSON.stringify(targetTourney));
            const hist = isPollTourney ? pollTournamentHistory : tournamentHistory;
            const alreadyArchived = hist.length > 0 && hist[0].id === historyItem.id;
            if (!alreadyArchived) {
                hist.unshift(historyItem);
                if (hist.length > 30) hist.length = 30;
            }

            log(`[Tournament] Champion crowned: "${wName}" in "${targetTourney.title}"!`);
            if (targetTourney.announceChat !== false && chatbotAnnouncer?.announceTournamentChampion) {
                Promise.resolve().then(() => chatbotAnnouncer.announceTournamentChampion(targetTourney)).catch(() => {});
            }
            try {
                onAlert({
                    type: 'poll_end',
                    title: `${targetTourney.title} Champion`,
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
        if (targetTourney.format === 'double' && loserObj && loserObj.name !== 'BYE' && loserObj.name !== 'TBD') {
            if (match.id === 'm_1_1') {
                const lb = targetTourney.matches.find(m => m.id === 'lb_1_1');
                if (lb) lb.entrant1 = { ...loserObj, rounds: 0, votes: 0, percent: 0 };
            } else if (match.id === 'm_1_2') {
                const lb = targetTourney.matches.find(m => m.id === 'lb_1_1');
                if (lb) lb.entrant2 = { ...loserObj, rounds: 0, votes: 0, percent: 0 };
            } else if (match.id === 'm_2_1') {
                const lbf = targetTourney.matches.find(m => m.id === 'lb_2_1');
                if (lbf) lbf.entrant2 = { ...loserObj, rounds: 0, votes: 0, percent: 0 };
            }
        }

        save();
        if (isPollTourney) broadcastPollTournamentUpdate();
        else broadcastTournamentUpdate();
        return targetTourney;
    }

    function updateMatchScore(matchId, {
        entrant1Score, entrant2Score, entrant, entrantIndex, delta, score, winner, matchDetails,
        entrant1Tag, entrant2Tag, entrant1Rounds, entrant2Rounds, rounds, roundDelta,
        entrant1Color, entrant2Color, color, preserveActiveMatch = false, isPoll = false
    } = {}) {
        const { tournament: targetTourney, isPoll: isPollTourney } = resolveTargetTournament(matchId, isPoll);
        if (!targetTourney) throw new Error('No active tournament');
        const match = targetTourney.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        if (entrant === undefined && (entrantIndex === 0 || entrantIndex === 1)) {
            entrant = entrantIndex === 0 ? match.entrant1?.name : match.entrant2?.name;
        }

        if (delta !== undefined && (entrantIndex === 0 || entrantIndex === 1 || entrant !== undefined)) {
            const d = parseInt(delta, 10) || 0;
            if (entrantIndex === 0 || (entrant && match.entrant1?.name === entrant)) {
                entrant1Score = Math.max(0, (match.entrant1?.score || 0) + d);
            } else if (entrantIndex === 1 || (entrant && match.entrant2?.name === entrant)) {
                entrant2Score = Math.max(0, (match.entrant2?.score || 0) + d);
            }
        }

        if (entrant !== undefined && score !== undefined) {
            if (match.entrant1?.name === entrant) entrant1Score = score;
            else if (match.entrant2?.name === entrant) entrant2Score = score;
        }

        if (entrant !== undefined && rounds !== undefined) {
            if (match.entrant1?.name === entrant) entrant1Rounds = rounds;
            else if (match.entrant2?.name === entrant) entrant2Rounds = rounds;
        }

        if (entrant !== undefined && color !== undefined) {
            if (match.entrant1?.name === entrant) entrant1Color = color;
            else if (match.entrant2?.name === entrant) entrant2Color = color;
        }

        if (entrant1Color !== undefined && match.entrant1) {
            match.entrant1.color = String(entrant1Color).trim();
            const e1Name = match.entrant1.name;
            targetTourney.matches.forEach(m => {
                if (m.entrant1 && m.entrant1.name === e1Name) m.entrant1.color = match.entrant1.color;
                if (m.entrant2 && m.entrant2.name === e1Name) m.entrant2.color = match.entrant1.color;
            });
        }
        if (entrant2Color !== undefined && match.entrant2) {
            match.entrant2.color = String(entrant2Color).trim();
            const e2Name = match.entrant2.name;
            targetTourney.matches.forEach(m => {
                if (m.entrant1 && m.entrant1.name === e2Name) m.entrant1.color = match.entrant2.color;
                if (m.entrant2 && m.entrant2.name === e2Name) m.entrant2.color = match.entrant2.color;
            });
        }

        const maxGameScore = Number(match.targetScore || targetTourney.targetScore) || 0;

        if (entrant1Score !== undefined) {
            let s1 = Math.max(0, parseInt(entrant1Score, 10) || 0);
            if (maxGameScore > 0) s1 = Math.min(maxGameScore, s1);
            if (match.entrant1) match.entrant1.score = s1;
            if (Array.isArray(match.scores)) match.scores[0] = s1;
        }
        if (entrant2Score !== undefined) {
            let s2 = Math.max(0, parseInt(entrant2Score, 10) || 0);
            if (maxGameScore > 0) s2 = Math.min(maxGameScore, s2);
            if (match.entrant2) match.entrant2.score = s2;
            if (Array.isArray(match.scores)) match.scores[1] = s2;
        }
        const seriesDecided = maxGameScore > 0 && (
            (match.entrant1?.score || 0) >= maxGameScore ||
            (match.entrant2?.score || 0) >= maxGameScore
        );
        if (entrant1Rounds !== undefined && match.entrant1) {
            match.entrant1.rounds = seriesDecided ? 0 : Math.max(0, parseInt(entrant1Rounds, 10) || 0);
        }
        if (entrant2Rounds !== undefined && match.entrant2) {
            match.entrant2.rounds = seriesDecided ? 0 : Math.max(0, parseInt(entrant2Rounds, 10) || 0);
        }
        if (roundDelta !== undefined && entrant !== undefined) {
            const rd = parseInt(roundDelta, 10) || 0;
            if (!seriesDecided || rd < 0) {
                if (match.entrant1?.name === entrant) {
                    match.entrant1.rounds = Math.max(0, (match.entrant1.rounds || 0) + rd);
                } else if (match.entrant2?.name === entrant) {
                    match.entrant2.rounds = Math.max(0, (match.entrant2.rounds || 0) + rd);
                }
            }
        }

        // Automatic game score advancement when rounds target is achieved
        const rb = Number(match.roundsBestOf || targetTourney.roundsBestOf) || 0;
        const targetRounds = rb > 0 ? Math.ceil(rb / 2) : 0;
        if (targetRounds > 0 && !seriesDecided) {
            if ((match.entrant1?.rounds || 0) >= targetRounds) {
                match.entrant1.rounds = 0;
                if (match.entrant2) match.entrant2.rounds = 0;
                const nextS1 = (match.entrant1.score || 0) + 1;
                match.entrant1.score = maxGameScore > 0 ? Math.min(maxGameScore, nextS1) : nextS1;
                if (Array.isArray(match.scores)) match.scores[0] = match.entrant1.score;
            } else if ((match.entrant2?.rounds || 0) >= targetRounds) {
                if (match.entrant1) match.entrant1.rounds = 0;
                match.entrant2.rounds = 0;
                const nextS2 = (match.entrant2.score || 0) + 1;
                match.entrant2.score = maxGameScore > 0 ? Math.min(maxGameScore, nextS2) : nextS2;
                if (Array.isArray(match.scores)) match.scores[1] = match.entrant2.score;
            } else {
                if (match.entrant1) match.entrant1.rounds = Math.min(targetRounds - 1, match.entrant1.rounds || 0);
                if (match.entrant2) match.entrant2.rounds = Math.min(targetRounds - 1, match.entrant2.rounds || 0);
            }
        } else {
            if (match.entrant1) match.entrant1.rounds = 0;
            if (match.entrant2) match.entrant2.rounds = 0;
        }

        if (entrant1Tag !== undefined && match.entrant1) {
            match.entrant1.tag = String(entrant1Tag).trim();
        }
        if (entrant2Tag !== undefined && match.entrant2) {
            match.entrant2.tag = String(entrant2Tag).trim();
        }
        if (matchDetails !== undefined) {
            match.matchDetails = String(matchDetails).trim();
        }

        if (!preserveActiveMatch && targetTourney.highlightLive !== false) {
            targetTourney.activeMatchId = match.id;
        }
        if (match.status === 'PENDING') {
            match.status = 'ACTIVE';
        }
        if (targetTourney.status === 'READY') {
            targetTourney.status = 'IN_PROGRESS';
        }

        match.pendingWinner = null;
        if (!winner && match.targetScore > 0) {
            if (match.entrant1.score >= match.targetScore && match.entrant1.name !== 'TBD') match.pendingWinner = match.entrant1.name;
            else if (match.entrant2.score >= match.targetScore && match.entrant2.name !== 'TBD') match.pendingWinner = match.entrant2.name;
        }

        if (winner) {
            advanceTournamentMatch(match.id, winner, { isPoll: isPollTourney });
        } else {
            save();
            if (isPollTourney) broadcastPollTournamentUpdate();
            else broadcastTournamentUpdate();
        }

        return { match, tournament: targetTourney, autoAdvanced: Boolean(winner) };
    }

    function selectActiveMatch(matchId, { isPoll = false } = {}) {
        const { tournament: targetTourney, isPoll: isPollTourney } = resolveTargetTournament(matchId, isPoll);
        if (!targetTourney) throw new Error('No active tournament');

        if (!matchId || matchId === 'none' || matchId === 'null') {
            targetTourney.activeMatchId = null;
            save();
            if (isPollTourney) broadcastPollTournamentUpdate();
            else broadcastTournamentUpdate();
            return { match: null, tournament: targetTourney };
        }

        const match = targetTourney.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        targetTourney.activeMatchId = match.id;
        if (match.status === 'PENDING' && match.entrant1?.name !== 'TBD' && match.entrant2?.name !== 'TBD') {
            match.status = 'ACTIVE';
        }
        save();
        if (isPollTourney) broadcastPollTournamentUpdate();
        else broadcastTournamentUpdate();
        return { match, tournament: targetTourney };
    }

    function cascadeClearDownstream(startMatchId, oldWinnerName, targetTourney = activeTournament) {
        if (!targetTourney || !Array.isArray(targetTourney.matches)) return;
        const visited = new Set();

        function clearStep(mId, winnerName) {
            if (!mId || visited.has(mId)) return;
            visited.add(mId);

            const current = targetTourney.matches.find(m => m.id === mId);
            if (!current) return;

            const downstreams = targetTourney.matches.filter(m =>
                m.id !== current.id && !visited.has(m.id) &&
                (m.id === current.nextMatchId ||
                (winnerName && (m.entrant1?.name === winnerName || m.entrant2?.name === winnerName)))
            );

            for (const ds of downstreams) {
                const nextWinner = ds.winner;
                if (ds.id === current.nextMatchId) {
                    if (current.nextSlot === 1 || ds.entrant1?.name === winnerName) {
                        ds.entrant1 = { name: 'TBD', seed: 0, score: 0, rounds: 0, votes: 0, percent: 0 };
                    }
                    if (current.nextSlot === 2 || ds.entrant2?.name === winnerName) {
                        ds.entrant2 = { name: 'TBD', seed: 0, score: 0, rounds: 0, votes: 0, percent: 0 };
                    }
                } else if (winnerName) {
                    if (ds.entrant1?.name === winnerName) {
                        ds.entrant1 = { name: 'TBD', seed: 0, score: 0, rounds: 0, votes: 0, percent: 0 };
                    }
                    if (ds.entrant2?.name === winnerName) {
                        ds.entrant2 = { name: 'TBD', seed: 0, score: 0, rounds: 0, votes: 0, percent: 0 };
                    }
                }
                ds.entrants = [ds.entrant1?.name || 'TBD', ds.entrant2?.name || 'TBD'];
                ds.status = 'PENDING';
                ds.winner = null;
                ds.scores = [0, 0];
                if (ds.entrant1) { ds.entrant1.score = 0; ds.entrant1.rounds = 0; ds.entrant1.votes = 0; ds.entrant1.percent = 0; }
                if (ds.entrant2) { ds.entrant2.score = 0; ds.entrant2.rounds = 0; ds.entrant2.votes = 0; ds.entrant2.percent = 0; }

                clearStep(ds.id, nextWinner);
            }
        }

        clearStep(startMatchId, oldWinnerName);

        if (targetTourney.champion && (targetTourney.champion === oldWinnerName || !targetTourney.matches.some(m => m.roundName === 'Grand Finals' && m.status === 'COMPLETED'))) {
            targetTourney.champion = null;
            if (targetTourney.status === 'COMPLETED') {
                targetTourney.status = 'IN_PROGRESS';
            }
        }
    }

    function rollbackTournamentMatch(matchId, { isPoll = false } = {}) {
        const { tournament: targetTourney, isPoll: isPollTourney } = resolveTargetTournament(matchId, isPoll);
        if (!targetTourney) throw new Error('No active tournament');
        const match = targetTourney.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        const oldWinner = match.winner;
        match.status = 'ACTIVE';
        match.winner = null;
        if (match.entrant1) { match.entrant1.score = 0; match.entrant1.rounds = 0; match.entrant1.votes = 0; match.entrant1.percent = 0; }
        if (match.entrant2) { match.entrant2.score = 0; match.entrant2.rounds = 0; match.entrant2.votes = 0; match.entrant2.percent = 0; }
        match.scores = [0, 0];

        cascadeClearDownstream(match.id, oldWinner, targetTourney);

        targetTourney.activeMatchId = match.id;
        targetTourney.status = 'IN_PROGRESS';
        save();
        if (isPollTourney) broadcastPollTournamentUpdate();
        else broadcastTournamentUpdate();
        return { match, tournament: targetTourney };
    }

    function resetMatch(matchId, { isPoll = false } = {}) {
        const { tournament: targetTourney, isPoll: isPollTourney } = resolveTargetTournament(matchId, isPoll);
        if (!targetTourney) throw new Error('No active tournament');
        const match = targetTourney.matches.find(m => m.id === matchId);
        if (!match) throw new Error(`Match ${matchId} not found`);

        const oldWinner = match.winner;
        match.status = 'PENDING';
        match.winner = null;
        if (match.entrant1) { match.entrant1.score = 0; match.entrant1.rounds = 0; match.entrant1.votes = 0; match.entrant1.percent = 0; }
        if (match.entrant2) { match.entrant2.score = 0; match.entrant2.rounds = 0; match.entrant2.votes = 0; match.entrant2.percent = 0; }
        match.scores = [0, 0];

        cascadeClearDownstream(match.id, oldWinner, targetTourney);

        save();
        if (isPollTourney) broadcastPollTournamentUpdate();
        else broadcastTournamentUpdate();
        return { match, tournament: targetTourney };
    }

    function updateTournamentSettings(settings = {}, { isPoll = false } = {}) {
        if (settings.isPoll !== undefined) isPoll = Boolean(settings.isPoll);
        const { tournament: targetTourney, isPoll: isPollTourney } = resolveTargetTournament(settings.activeMatchId, isPoll);
        if (!targetTourney) throw new Error('No active tournament');
        if (settings.title) targetTourney.title = String(settings.title).trim();
        if (settings.logo !== undefined) targetTourney.logo = String(settings.logo || '').trim();
        if (settings.logoSize !== undefined) targetTourney.logoSize = String(settings.logoSize || '').trim();
        if (settings.progressionMode) targetTourney.progressionMode = settings.progressionMode;
        if (settings.scoringType) targetTourney.scoringType = settings.scoringType;
        if (settings.bestOf !== undefined) {
            targetTourney.bestOf = Number(settings.bestOf) || 0;
            const targetScore = settings.targetScore !== undefined
                ? (Number(settings.targetScore) || 0)
                : (targetTourney.bestOf > 0 ? Math.ceil(targetTourney.bestOf / 2) : 0);
            targetTourney.targetScore = targetScore;
            targetTourney.matches.forEach(m => {
                m.bestOf = targetTourney.bestOf;
                m.targetScore = targetScore;
                if (targetScore > 0 && !m.winner) {
                    if (m.entrant1) m.entrant1.score = Math.min(targetScore, m.entrant1.score || 0);
                    if (m.entrant2) m.entrant2.score = Math.min(targetScore, m.entrant2.score || 0);
                    if (Array.isArray(m.scores)) {
                        m.scores[0] = Math.min(targetScore, m.scores[0] || 0);
                        m.scores[1] = Math.min(targetScore, m.scores[1] || 0);
                    }
                }
            });
        } else if (settings.targetScore !== undefined) {
            const targetScore = Number(settings.targetScore) || 0;
            targetTourney.targetScore = targetScore;
            targetTourney.matches.forEach(m => {
                m.targetScore = targetScore;
                if (targetScore > 0 && !m.winner) {
                    if (m.entrant1) m.entrant1.score = Math.min(targetScore, m.entrant1.score || 0);
                    if (m.entrant2) m.entrant2.score = Math.min(targetScore, m.entrant2.score || 0);
                    if (Array.isArray(m.scores)) {
                        m.scores[0] = Math.min(targetScore, m.scores[0] || 0);
                        m.scores[1] = Math.min(targetScore, m.scores[1] || 0);
                    }
                }
            });
        }
        if (settings.roundsBestOf !== undefined) {
            const rb = Math.max(0, parseInt(settings.roundsBestOf, 10) || 0);
            targetTourney.roundsBestOf = rb;
            targetTourney.matches.forEach(m => {
                m.roundsBestOf = rb;
            });
        }
        if (settings.matchDuration !== undefined) targetTourney.matchDuration = Number(settings.matchDuration) || 60;
        if (settings.blind !== undefined) targetTourney.blind = Boolean(settings.blind);
        if (settings.highlightLive !== undefined) targetTourney.highlightLive = Boolean(settings.highlightLive);
        if (settings.activeMatchId !== undefined) {
            targetTourney.activeMatchId = (settings.activeMatchId === null || settings.activeMatchId === 'none' || settings.activeMatchId === '') ? null : String(settings.activeMatchId);
        }
        if (settings.announceChat !== undefined) targetTourney.announceChat = Boolean(settings.announceChat);
        save();
        if (isPollTourney) broadcastPollTournamentUpdate();
        else broadcastTournamentUpdate();
        return targetTourney;
    }

    function resetTournament({ isPoll = false, saveToHistory = true } = {}) {
        const targetTourney = isPoll ? activePollTournament : activeTournament;
        if (!targetTourney) return { ok: true };
        if (activePoll && activePoll.tournamentMatchId) {
            finishPoll('TERMINATED');
        }
        if (saveToHistory) {
            const hasStarted = targetTourney.matches?.some(m => m.status === 'COMPLETED' || m.status === 'ACTIVE') || targetTourney.status === 'COMPLETED';
            if (hasStarted) {
                const historyItem = {
                    ...JSON.parse(JSON.stringify(targetTourney)),
                    id: targetTourney.id || `th_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    endedAt: targetTourney.endedAt || new Date().toISOString()
                };
                const hist = isPoll ? pollTournamentHistory : tournamentHistory;
                const alreadyArchived = hist.length > 0 && hist[0].id === historyItem.id;
                if (!alreadyArchived) {
                    hist.unshift(historyItem);
                    if (hist.length > 30) hist.length = 30;
                }
            }
        }
        if (isPoll) {
            activePollTournament = null;
            broadcastToOverlays('poll-tournament-update', null);
        } else {
            activeTournament = null;
            broadcastToOverlays('tournament-update', null);
        }
        save();
        return { ok: true };
    }

    function getTournamentHistory({ isPoll = false } = {}) {
        return isPoll ? pollTournamentHistory : tournamentHistory;
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
        getPollTournament: () => activePollTournament,
        broadcastPollTournamentUpdate,
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
        getChatbotStatus: () => chatbotAnnouncer?.isReady?.() || { ready: false, reason: 'Chatbot service not configured' },
        destroy: () => { if (pollTimer) clearInterval(pollTimer); }
    };
}

module.exports = { createPollService, DEFAULT_PRESETS };
