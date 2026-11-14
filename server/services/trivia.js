'use strict';

/**
 * StreamPulse Trivia Service
 * 
 * Manages interactive stream trivia:
 * - 2 to 6 answers per question (including True/False support)
 * - Question bank management with reordering, shuffle / random order, and categories
 * - Live lifecycle state machine: IDLE -> QUESTION -> REVEAL -> IDLE
 * - Granular theming (colors, fonts, weights, shadows, border radiuses, collapse modes)
 * - Real-time audience voting via chat (!a-!f, !1-!6, !true/!false, !trivia)
 * - Saved and deletable presets with built-in starter templates
 * - Companion & REST API friendly controls (both GET and POST supported)
 * - WebSocket broadcast synchronization with overlays
 */

const fs = require('fs');
const path = require('path');
const { safeWriteFileSync } = require('../routes/helpers');

const DEFAULT_THEME = {
    preset: 'modern',
    cardBg: 'rgba(13, 17, 23, 0.94)',
    cardBorderColor: 'rgba(56, 189, 248, 0.35)',
    cardBorderWidth: 2,
    cardRadius: 16,
    cardBlur: 12,
    cardShadow: '0 16px 48px rgba(0, 0, 0, 0.65), 0 0 24px rgba(56, 189, 248, 0.12)',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    textColor: '#f0f6fc',
    headerFont: '',
    headerColor: '#f0f6fc',
    headerWeight: '700',
    headerTransform: 'uppercase',
    headerShadow: 'none',
    categoryFont: '',
    categoryColor: '#a855f7',
    categoryWeight: '700',
    categoryTransform: 'uppercase',
    questionFont: '',
    questionColor: '#f0f6fc',
    questionWeight: '700',
    questionShadow: '0 2px 4px rgba(0, 0, 0, 0.6)',
    questionTransform: 'none',
    choiceFont: '',
    choiceColor: '#f0f6fc',
    choiceWeight: '600',
    choiceShadow: 'none',
    choiceTransform: 'none',
    choiceBg: 'rgba(22, 27, 34, 0.88)',
    choiceBorderColor: 'rgba(255, 255, 255, 0.12)',
    choiceBorderWidth: 1.5,
    choiceRadius: 12,
    accentColor: '#3b82f6',
    correctColor: '#22c55e',
    correctBg: 'rgba(34, 197, 94, 0.16)',
    correctGlow: '0 0 24px rgba(34, 197, 94, 0.45)',
    incorrectColor: '#ef4444',
    incorrectOpacity: 0.35,
    collapseIncorrect: false, // Full screen broadcast trivia style
    timerColor: '#38bdf8',
    timerWarningColor: '#f59e0b',
    timerCriticalColor: '#ef4444',
    cardMaxWidth: '1100px',
    hintColor: '#94a3b8',
    funfactFont: '',
    funfactWeight: '500',
    funfactColor: '#eab308',
    funfactBg: 'rgba(234, 179, 8, 0.12)',
    funfactShadow: 'none',
    cardStyle: 'cards', // 'cards' | 'text' (pure floating text broadcast mode)
    // Customizable Header & Phase labels
    questionLabel: 'Question',
    answerLabel: 'Answer',
    counterFormat: 'full', // 'full' | 'compact' | 'slash' | 'number'
    phaseTransform: 'uppercase', // 'uppercase' | 'capitalize' | 'none'
    headerFontSize: '',
    phaseFont: '',
    phaseQuestionColor: '',
    phaseAnswerColor: '',
    // Toggleable visual elements
    showCategory: true,
    showQuestionNumber: true,
    showPhaseIndicator: true,
    showTimer: true,
    showVoteCounts: true,
    showPercentages: true,
    showChatHint: true,
    showFunFact: true,
    showLetterBadges: true
};

const DEFAULT_SETTINGS = {
    defaultDuration: 20,
    revealDelay: 6,
    advanceDelay: 6,
    autoAdvance: false,
    randomOrder: false,
    randomizeChoices: false,
    chatVoting: true,
    forceChatVoting: false, // allow chat voting even if chatbot announcer is off
    autoReveal: true, // auto-transition to answer on timer expiration
    manualTransition: false, // when true, requires manual transition to reveal answer
    showTimer: true,
    showVotes: true,
    showFunFact: true,
    soundEnabled: true,
    soundVolume: 75,
    subMultiplier: 1,
    leaderboard: {
        enabled: true,
        sortBy: 'points', // 'points' | 'correct' | 'accuracy'
        speedBonus: false, // up to +50% bonus points for faster answers
        commandsEnabled: true,
        commandCooldownMs: 3000,
        topLimit: 10
    }
};

const DEFAULT_LEADERBOARD_THEME = {
    layout: 'full', // 'full' | 'compact' | 'sidebar'
    theme: 'modern', // 'modern' | 'arcade' | 'esports' | 'minimal' | 'broadcast-text'
    scope: 'season', // 'season' | 'session'
    sortBy: 'points', // 'points' | 'correct' | 'accuracy'
    limit: 10,
    title: 'Trivia Leaderboard',
    bgColor: '#0e1118f0',
    cardBgColor: '#161b26cc',
    accentColor: '#6366f1',
    textColor: '#f8fafc',
    showPoints: true,
    showCorrect: true,
    showAccuracy: true,
    showStreak: true,
    showHeader: true,
    scale: 1
};

const BUILTIN_PRESETS = [
    {
        id: 'gaming-classics',
        name: 'Video Game Classics',
        description: 'Iconic questions on classic Nintendo, PlayStation, Sega, and PC milestones.',
        theme: { ...DEFAULT_THEME, preset: 'modern', accentColor: '#3b82f6' },
        settings: { ...DEFAULT_SETTINGS },
        questions: [
            {
                id: 'gc-1',
                category: 'Retro Gaming',
                question: 'In what year was the original Super Mario World released in Japan?',
                choices: ['1988', '1990', '1991', '1992'],
                correctIndex: 1,
                funfact: 'Super Mario World was a launch title for the Super Famicom in Japan on November 21, 1990.',
                duration: 20,
                points: 100
            },
            {
                id: 'gc-tf-1',
                category: 'Nintendo Lore',
                question: 'True or False: Mario was originally known as "Jumpman" in the 1981 arcade game Donkey Kong.',
                choices: ['True', 'False'],
                correctIndex: 0,
                funfact: 'Shigeru Miyamoto originally called him Jumpman, and he was depicted as a carpenter before becoming a plumber.',
                duration: 15,
                points: 50
            },
            {
                id: 'gc-2',
                category: 'Nintendo History',
                question: 'What was the code name for the Nintendo GameCube during development?',
                choices: ['Dolphin', 'Revolution', 'Project Reality', 'Atlantis'],
                correctIndex: 0,
                funfact: 'The Dolphin codename is still referenced today in model numbers (DOL-001) and emulator software.',
                duration: 20,
                points: 100
            },
            {
                id: 'gc-3',
                category: 'PlayStation',
                question: 'Which game is recognized as the best-selling title on the original PlayStation (PS1)?',
                choices: ['Final Fantasy VII', 'Gran Turismo', 'Crash Bandicoot', 'Metal Gear Solid'],
                correctIndex: 1,
                funfact: 'Gran Turismo sold over 10.8 million copies on PS1, out-selling Final Fantasy VII (10 million).',
                duration: 20,
                points: 100
            },
            {
                id: 'gc-multi-1',
                category: 'Pokemon Lore',
                question: 'Which of the following was NOT an original Generation 1 starter or mascot in Pokemon Red and Blue?',
                choices: ['Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu', 'Eevee', 'Togepi'],
                correctIndex: 5,
                funfact: 'Togepi was introduced in Generation 2 (Gold and Silver), famously carried by Misty in the anime.',
                duration: 25,
                points: 150
            },
            {
                id: 'gc-4',
                category: 'Speedrunning',
                question: 'Which classic game popularized the speedrunning glitch known as the "BLJ" (Backwards Long Jump)?',
                choices: ['Banjo-Kazooie', 'Super Mario 64', 'The Legend of Zelda: Ocarina of Time', 'Super Mario Sunshine'],
                correctIndex: 1,
                funfact: 'BLJ allows players to accumulate uncapped reverse velocity on stairs to bypass key doors.',
                duration: 20,
                points: 100
            }
        ]
    },
    {
        id: 'pop-culture',
        name: 'Pop Culture & Sci-Fi',
        description: 'Cinema, science fiction, animation, and popular fandoms.',
        theme: { ...DEFAULT_THEME, preset: 'neon', accentColor: '#a855f7', categoryColor: '#ec4899' },
        settings: { ...DEFAULT_SETTINGS },
        questions: [
            {
                id: 'pc-1',
                category: 'Sci-Fi Cinema',
                question: 'In Back to the Future, what exact speed must the DeLorean reach to initiate time travel?',
                choices: ['66 mph', '77 mph', '88 mph', '99 mph'],
                correctIndex: 2,
                funfact: 'Doc Brown chose 88 mph because it was an easily memorable number that fit neatly on digital LED speedometers.',
                duration: 20,
                points: 100
            },
            {
                id: 'pc-tf-1',
                category: 'Star Wars Lore',
                question: 'True or False: Darth Vader explicitly says the line "Luke, I am your father" in The Empire Strikes Back.',
                choices: ['True', 'False'],
                correctIndex: 1,
                funfact: 'One of the most famous misquotes in cinema! Vader actually says: "No, I am your father."',
                duration: 15,
                points: 50
            },
            {
                id: 'pc-2',
                category: 'Comics & Marvel',
                question: 'What is the fictional metal alloy bonded to Wolverine\'s skeleton in the X-Men universe?',
                choices: ['Vibranium', 'Adamantium', 'Beskar', 'Uru', 'Kryptonite'],
                correctIndex: 1,
                funfact: 'Adamantium was first introduced in Avengers #66 in 1969, created by writer Roy Thomas.',
                duration: 20,
                points: 100
            },
            {
                id: 'pc-3',
                category: 'Animation',
                question: 'What was the first feature-length computer-animated film in cinema history?',
                choices: ['A Bug\'s Life', 'Toy Story', 'Antz', 'Shrek'],
                correctIndex: 1,
                funfact: 'Pixar released Toy Story in November 1995, pioneering the CGI feature film industry.',
                duration: 20,
                points: 100
            }
        ]
    },
    {
        id: 'streaming-lore',
        name: 'Twitch & Streaming Lore',
        description: 'Historic stream moments, emotes, and community milestones.',
        theme: { ...DEFAULT_THEME, preset: 'retro', accentColor: '#9146ff', categoryColor: '#00b3ff' },
        settings: { ...DEFAULT_SETTINGS },
        questions: [
            {
                id: 'sl-1',
                category: 'Twitch History',
                question: 'In what year was Twitch officially launched as an independent spinoff from Justin.tv?',
                choices: ['2009', '2011', '2013', '2015'],
                correctIndex: 1,
                funfact: 'Twitch launched in June 2011 and rapidly eclipsed Justin.tv before Amazon acquired it in 2014.',
                duration: 20,
                points: 100
            },
            {
                id: 'sl-tf-1',
                category: 'Emote Trivia',
                question: 'True or False: The famous "Kappa" emote depicts real-life Justin.tv software engineer Josh DeSeno.',
                choices: ['True', 'False'],
                correctIndex: 0,
                funfact: 'Josh DeSeno worked on the chat client at Justin.tv and added his own grayscale photo as an emote.',
                duration: 15,
                points: 50
            },
            {
                id: 'sl-2',
                category: 'Community Events',
                question: 'Which social gaming phenomenon in 2014 allowed thousands of viewers to simultaneously control a Game Boy game via chat?',
                choices: ['Twitch Plays Pokemon', 'Raid Boss Live', 'Chat Plays Dark Souls', 'Crowd Control Live'],
                correctIndex: 0,
                funfact: 'Twitch Plays Pokemon beat Pokemon Red in 16 days with over 1.1 million simultaneous participants.',
                duration: 20,
                points: 100
            }
        ]
    }
];

function createTriviaService({
    dataDir,
    triviaPath = path.join(dataDir, 'trivia.json'),
    leaderboardPath = path.join(dataDir, 'trivia-leaderboard.json'),
    broadcastToOverlays = () => {},
    chatbotAnnouncer = null,
    log = console.log
} = {}) {
    let state = {
        id: 'default',
        title: 'Stream Trivia',
        status: 'idle', // 'idle' | 'question' | 'reveal'
        theme: { ...DEFAULT_THEME },
        leaderboardTheme: { ...DEFAULT_LEADERBOARD_THEME },
        settings: {
            ...DEFAULT_SETTINGS,
            leaderboard: { ...DEFAULT_SETTINGS.leaderboard }
        },
        questions: JSON.parse(JSON.stringify(BUILTIN_PRESETS[0].questions)),
        currentIndex: 0,
        activeQuestion: null,
        presets: JSON.parse(JSON.stringify(BUILTIN_PRESETS))
    };

    // Runtime state tracking
    let questionTimer = null;
    let revealTimer = null;
    let activeChoiceOrder = [];
    let seasonStartedAt = Date.now();
    const userVotes = new Map(); // userId/username -> choiceIndex
    const voterMeta = new Map(); // voterKey -> { displayName, userId, votedAt, isSub }
    const sessionPlayers = new Map(); // voterKey -> stats record (in-memory)
    const seasonPlayers = new Map(); // voterKey -> stats record (persisted)
    const commandCooldowns = new Map(); // commandKey -> last reply timestamp
    const playedQuestionIds = new Set();

    function normalizeLeaderboardSettings(raw = {}) {
        const base = DEFAULT_SETTINGS.leaderboard;
        const src = raw && typeof raw === 'object' ? raw : {};
        const sortBy = ['points', 'correct', 'accuracy'].includes(src.sortBy) ? src.sortBy : base.sortBy;
        const topLimit = Math.max(1, Math.min(100, parseInt(src.topLimit, 10) || base.topLimit));
        const cooldown = Number(src.commandCooldownMs);
        return {
            enabled: src.enabled !== undefined ? Boolean(src.enabled) : base.enabled,
            sortBy,
            speedBonus: src.speedBonus !== undefined ? Boolean(src.speedBonus) : base.speedBonus,
            commandsEnabled: src.commandsEnabled !== undefined ? Boolean(src.commandsEnabled) : base.commandsEnabled,
            commandCooldownMs: Number.isFinite(cooldown) ? Math.max(0, Math.min(60000, cooldown)) : base.commandCooldownMs,
            topLimit
        };
    }

    function save() {
        try {
            const dataToSave = {
                id: state.id,
                title: state.title,
                status: state.status,
                theme: state.theme,
                leaderboardTheme: state.leaderboardTheme,
                settings: state.settings,
                questions: state.questions,
                currentIndex: state.currentIndex,
                activeQuestion: state.activeQuestion ? sanitizeActiveQuestion(state.activeQuestion, true) : null,
                presets: state.presets
            };
            safeWriteFileSync(triviaPath, JSON.stringify(dataToSave, null, 2));
        } catch (err) {
            log('[Trivia] Error saving state:', err.message);
        }
    }

    function normalizePlayerRecord(entry = {}, fallbackKey = '') {
        const rawKey = String(entry.key || entry.name || entry.userId || fallbackKey).trim().toLowerCase();
        if (!rawKey) return null;
        const correct = Math.max(0, parseInt(entry.correct, 10) || 0);
        const wrong = Math.max(0, parseInt(entry.wrong, 10) || 0);
        const answeredRaw = parseInt(entry.answered, 10);
        const answered = Number.isFinite(answeredRaw) ? Math.max(correct + wrong, answeredRaw) : (correct + wrong);
        const streak = Math.max(0, parseInt(entry.streak, 10) || 0);
        const bestStreak = Math.max(streak, parseInt(entry.bestStreak, 10) || 0);
        return {
            key: rawKey,
            name: String(entry.name || entry.displayName || fallbackKey || rawKey).trim() || rawKey,
            userId: String(entry.userId || '').trim(),
            points: Math.max(0, Math.round(Number(entry.points) || 0)),
            correct,
            wrong,
            answered,
            streak,
            bestStreak,
            lastPlayedAt: entry.lastPlayedAt || null
        };
    }

    function getLeaderboardMap(scope = 'season') {
        return scope === 'session' ? sessionPlayers : seasonPlayers;
    }

    function formatPlayerRow(entry, rank = null) {
        const accuracy = entry.answered > 0 ? Math.round((entry.correct / entry.answered) * 100) : 0;
        const row = {
            key: entry.key,
            name: entry.name,
            userId: entry.userId || '',
            points: entry.points,
            correct: entry.correct,
            wrong: entry.wrong,
            answered: entry.answered,
            accuracy,
            streak: entry.streak,
            bestStreak: entry.bestStreak,
            lastPlayedAt: entry.lastPlayedAt
        };
        if (rank !== null) row.rank = rank;
        return row;
    }

    function sortPlayers(map, sortBy = 'points') {
        const mode = ['points', 'correct', 'accuracy'].includes(sortBy) ? sortBy : 'points';
        return Array.from(map.values())
            .map(entry => formatPlayerRow(entry))
            .sort((a, b) => {
                if (mode === 'correct') {
                    return (b.correct - a.correct) || (b.points - a.points) || (b.accuracy - a.accuracy) || (b.bestStreak - a.bestStreak) || a.name.localeCompare(b.name);
                }
                if (mode === 'accuracy') {
                    return (b.accuracy - a.accuracy) || (b.correct - a.correct) || (b.points - a.points) || (b.bestStreak - a.bestStreak) || a.name.localeCompare(b.name);
                }
                return (b.points - a.points) || (b.correct - a.correct) || (b.accuracy - a.accuracy) || (b.bestStreak - a.bestStreak) || a.name.localeCompare(b.name);
            });
    }

    function saveLeaderboard() {
        try {
            const payload = {
                version: 1,
                seasonStartedAt,
                updatedAt: Date.now(),
                players: sortPlayers(seasonPlayers, 'points')
            };
            safeWriteFileSync(leaderboardPath, JSON.stringify(payload, null, 2));
        } catch (err) {
            log('[Trivia] Error saving leaderboard:', err.message);
        }
    }

    function loadLeaderboard() {
        try {
            if (!fs.existsSync(leaderboardPath)) return;
            const raw = fs.readFileSync(leaderboardPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            if (Number(parsed.seasonStartedAt) > 0) {
                seasonStartedAt = Number(parsed.seasonStartedAt);
            }
            seasonPlayers.clear();
            const list = Array.isArray(parsed.players) ? parsed.players : (Array.isArray(parsed) ? parsed : []);
            for (const item of list) {
                const normalized = normalizePlayerRecord(item);
                if (normalized) seasonPlayers.set(normalized.key, normalized);
            }
        } catch (err) {
            log('[Trivia] Error loading leaderboard:', err.message);
        }
    }

    function getLeaderboard({ scope = 'season', sortBy = null, limit = null } = {}) {
        const resolvedScope = scope === 'session' ? 'session' : 'season';
        const resolvedSort = ['points', 'correct', 'accuracy'].includes(sortBy)
            ? sortBy
            : (state.settings?.leaderboard?.sortBy || 'points');
        const map = getLeaderboardMap(resolvedScope);
        const sorted = sortPlayers(map, resolvedSort);
        const defaultLimit = state.settings?.leaderboard?.topLimit || 10;
        const parsedLimit = limit === 0 ? 0 : (limit !== null && limit !== undefined ? parseInt(limit, 10) : defaultLimit);
        const sliced = parsedLimit === 0
            ? sorted
            : sorted.slice(0, Math.max(1, Math.min(500, Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit)));
        return {
            scope: resolvedScope,
            sortBy: resolvedSort,
            seasonStartedAt,
            totalPlayers: map.size,
            entries: sliced.map((entry, idx) => ({ ...entry, rank: idx + 1 }))
        };
    }

    function getPlayerStats(identifier) {
        const needle = String(identifier || '').replace(/^@/, '').trim().toLowerCase();
        if (!needle) return null;
        const findInScope = (scope) => {
            const map = getLeaderboardMap(scope);
            const sorted = sortPlayers(map, state.settings?.leaderboard?.sortBy || 'points');
            const idx = sorted.findIndex(p =>
                p.key === needle ||
                p.name.toLowerCase() === needle ||
                (p.userId && p.userId.toLowerCase() === needle)
            );
            return idx !== -1 ? { ...sorted[idx], rank: idx + 1 } : null;
        };
        const season = findInScope('season');
        const session = findInScope('session');
        if (!season && !session) return null;
        return {
            key: (season || session).key,
            name: (session || season).name,
            season,
            session
        };
    }

    function broadcastLeaderboard() {
        const payload = {
            season: getLeaderboard({ scope: 'season' }),
            session: getLeaderboard({ scope: 'session' }),
            leaderboardTheme: state.leaderboardTheme
        };
        broadcastToOverlays('trivia:leaderboard', payload);
        return payload;
    }

    function load() {
        try {
            if (fs.existsSync(triviaPath)) {
                const raw = fs.readFileSync(triviaPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    if (parsed.id) state.id = parsed.id;
                    if (parsed.title) state.title = parsed.title;
                    if (parsed.theme && typeof parsed.theme === 'object') {
                        state.theme = { ...DEFAULT_THEME, ...parsed.theme };
                    }
                    if (parsed.leaderboardTheme && typeof parsed.leaderboardTheme === 'object') {
                        state.leaderboardTheme = { ...DEFAULT_LEADERBOARD_THEME, ...parsed.leaderboardTheme };
                    }
                    if (parsed.settings && typeof parsed.settings === 'object') {
                        state.settings = {
                            ...DEFAULT_SETTINGS,
                            ...parsed.settings,
                            advanceDelay: parsed.settings.advanceDelay ?? parsed.settings.revealDelay ?? DEFAULT_SETTINGS.advanceDelay,
                            leaderboard: normalizeLeaderboardSettings(parsed.settings.leaderboard)
                        };
                    }
                    if (Array.isArray(parsed.questions)) {
                        state.questions = parsed.questions;
                        for (const q of state.questions) {
                            if (q.done) playedQuestionIds.add(q.id);
                        }
                    }
                    if (typeof parsed.currentIndex === 'number' && parsed.currentIndex >= 0) {
                        state.currentIndex = parsed.currentIndex;
                    }
                    if (Array.isArray(parsed.presets) && parsed.presets.length > 0) {
                        state.presets = parsed.presets;
                    }
                }
            }
        } catch (err) {
            log('[Trivia] Error loading state:', err.message);
        }
        loadLeaderboard();
    }

    function isChatbotEnabled() {
        if (!chatbotAnnouncer) return false;
        if (typeof chatbotAnnouncer.getStats === 'function') {
            const stats = chatbotAnnouncer.getStats();
            return stats && stats.enabled === true;
        }
        return true;
    }

    function isChatVotingActive() {
        if (state.settings.chatVoting === false) return false;
        // If chatbot announcer is attached and disabled, chat voting is inactive unless explicitly forced on
        if (chatbotAnnouncer && !isChatbotEnabled() && !state.settings.forceChatVoting) {
            return false;
        }
        return true;
    }

    function sanitizeActiveQuestion(q, includeAnswer = false) {
        if (!q) return null;
        const totalVotes = userVotes.size;
        const choiceCount = Array.isArray(q.choices) ? q.choices.length : 4;
        const voteCounts = new Array(choiceCount).fill(0);

        for (const choiceIdx of userVotes.values()) {
            if (choiceIdx >= 0 && choiceIdx < choiceCount) {
                voteCounts[choiceIdx]++;
            }
        }

        const choices = (q.choices || []).map((text, idx) => ({
            index: idx,
            text,
            letter: String.fromCharCode(65 + idx), // 'A', 'B', 'C', 'D', 'E', 'F'
            votes: voteCounts[idx] || 0,
            percent: totalVotes > 0 ? Math.round(((voteCounts[idx] || 0) / totalVotes) * 100) : 0
        }));

        const now = Date.now();
        const remainingSeconds = q.endsAt ? Math.max(0, Math.ceil((q.endsAt - now) / 1000)) : 0;

        // Check if question is True/False format
        const isTrueFalse = choices.length === 2 &&
            choices.some(c => /^true$/i.test(c.text.trim())) &&
            choices.some(c => /^false$/i.test(c.text.trim()));

        return {
            id: q.id,
            category: q.category || 'General',
            question: q.question || '',
            choices,
            choiceCount: choices.length,
            isTrueFalse,
            correctIndex: (includeAnswer || state.status === 'reveal') ? q.correctIndex : null,
            funfact: (includeAnswer || state.status === 'reveal') ? (q.funfact || '') : '',
            points: q.points || 100,
            duration: q.duration || state.settings.defaultDuration || 20,
            totalVotes,
            phase: state.status,
            startedAt: q.startedAt || null,
            endsAt: q.endsAt || null,
            remainingSeconds
        };
    }

    function broadcastState(eventType = 'trivia:state', extra = {}) {
        const payload = {
            status: state.status,
            currentIndex: state.currentIndex,
            totalQuestions: state.questions.length,
            activeQuestion: sanitizeActiveQuestion(state.activeQuestion, state.status === 'reveal'),
            theme: state.theme,
            leaderboardTheme: state.leaderboardTheme,
            settings: state.settings,
            leaderboard: {
                season: getLeaderboard({ scope: 'season', limit: 25 }),
                session: getLeaderboard({ scope: 'session', limit: 25 })
            },
            chatbotEnabled: isChatbotEnabled(),
            chatVotingActive: isChatVotingActive(),
            ...extra
        };
        broadcastToOverlays(eventType, payload);
        return payload;
    }

    function clearTimers() {
        if (questionTimer) {
            clearTimeout(questionTimer);
            questionTimer = null;
        }
        if (revealTimer) {
            clearTimeout(revealTimer);
            revealTimer = null;
        }
    }

    function startQuestion(indexOrId = null, options = {}) {
        clearTimers();
        userVotes.clear();
        voterMeta.clear();

        let opts = options;
        let queryTarget = indexOrId;
        if (indexOrId && typeof indexOrId === 'object') {
            opts = { ...indexOrId, ...options };
            queryTarget = indexOrId.questionId ?? indexOrId.id ?? indexOrId.index ?? null;
        }

        if (state.questions.length === 0) {
            throw new Error('No questions in the trivia bank');
        }

        let targetIndex = state.currentIndex;
        if (typeof queryTarget === 'number' && queryTarget >= 0 && queryTarget < state.questions.length) {
            targetIndex = queryTarget;
        } else if (typeof queryTarget === 'string' && queryTarget) {
            const idx = state.questions.findIndex(q => q.id === queryTarget);
            if (idx !== -1) targetIndex = idx;
        } else if (state.settings.randomOrder) {
            let unplayed = state.questions.filter(q => !playedQuestionIds.has(q.id));
            if (unplayed.length === 0) {
                resetDoneQuestions();
                unplayed = state.questions;
            }
            const picked = unplayed[Math.floor(Math.random() * unplayed.length)];
            targetIndex = state.questions.findIndex(q => q.id === picked.id);
        } else {
            let unplayed = state.questions.filter(q => !playedQuestionIds.has(q.id));
            if (unplayed.length > 0) {
                const nextUnplayed = state.questions.find((q, i) => i >= state.currentIndex && !playedQuestionIds.has(q.id)) || unplayed[0];
                targetIndex = state.questions.findIndex(q => q.id === nextUnplayed.id);
            }
        }

        state.currentIndex = targetIndex;
        const rawQuestion = state.questions[targetIndex];
        playedQuestionIds.add(rawQuestion.id);
        rawQuestion.done = true;

        const overrideDuration = Number(opts.duration);
        const durationSec = overrideDuration > 0 ? overrideDuration : (state.settings.defaultDuration || 20);
        activeChoiceOrder = rawQuestion.choices.map((_, index) => index);
        if (state.settings.randomizeChoices) {
            for (let i = activeChoiceOrder.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [activeChoiceOrder[i], activeChoiceOrder[j]] = [activeChoiceOrder[j], activeChoiceOrder[i]];
            }
        }
        const now = Date.now();

        state.status = 'question';
        state.activeQuestion = {
            ...rawQuestion,
            choices: activeChoiceOrder.map(index => rawQuestion.choices[index]),
            correctIndex: activeChoiceOrder.indexOf(rawQuestion.correctIndex),
            startedAt: now,
            endsAt: now + (durationSec * 1000),
            duration: durationSec,
            _scored: false
        };

        // Schedule auto-reveal when question timer expires (unless manual transition is enabled)
        const shouldAutoReveal = opts.autoReveal !== undefined
            ? Boolean(opts.autoReveal)
            : (opts.manualTransition !== undefined
                ? !opts.manualTransition
                : (state.settings.autoReveal !== false && !state.settings.manualTransition));

        if (durationSec > 0 && shouldAutoReveal) {
            questionTimer = setTimeout(() => {
                const delaySec = Math.max(0, Number(state.settings.revealDelay) || 0);
                if (delaySec === 0) {
                    revealAnswer();
                } else {
                    questionTimer = setTimeout(revealAnswer, delaySec * 1000);
                    questionTimer.unref?.();
                    broadcastState();
                }
            }, durationSec * 1000);
            questionTimer.unref?.();
        }

        save();
        broadcastState('trivia:start', { question: sanitizeActiveQuestion(state.activeQuestion, false) });

        if (isChatVotingActive() && chatbotAnnouncer && typeof chatbotAnnouncer.announceTriviaQuestion === 'function') {
            try {
                Promise.resolve(chatbotAnnouncer.announceTriviaQuestion(state.activeQuestion))
                    .catch(err => log('[Trivia] Chatbot question announce failed:', err.message));
            } catch (err) {
                log('[Trivia] Chatbot question announce failed:', err.message);
            }
        }

        return getPublicState();
    }

    function recordPlayerAnswer(map, { voterKey, displayName, userId, isCorrect, earnedPoints, now }) {
        let entry = map.get(voterKey);
        if (!entry) {
            entry = normalizePlayerRecord({
                key: voterKey,
                name: displayName || voterKey,
                userId: userId || '',
                points: 0,
                correct: 0,
                wrong: 0,
                answered: 0,
                streak: 0,
                bestStreak: 0,
                lastPlayedAt: null
            });
            map.set(voterKey, entry);
        }
        if (displayName) entry.name = displayName;
        if (userId && !entry.userId) entry.userId = userId;
        entry.answered += 1;
        entry.lastPlayedAt = now;
        if (isCorrect) {
            entry.correct += 1;
            entry.streak += 1;
            if (entry.streak > entry.bestStreak) entry.bestStreak = entry.streak;
            entry.points += earnedPoints;
        } else {
            entry.wrong += 1;
            entry.streak = 0;
        }
    }

    function scoreActiveQuestion() {
        const q = state.activeQuestion;
        if (!q || q._scored) return false;
        q._scored = true;
        if (state.settings?.leaderboard?.enabled === false) return false;
        if (userVotes.size === 0) return false;

        const now = Date.now();
        const basePoints = Math.max(1, Number(q.points) || 100);
        const speedBonusEnabled = Boolean(state.settings?.leaderboard?.speedBonus);
        const startedAt = Number(q.startedAt) || 0;
        const endsAt = Number(q.endsAt) || 0;
        const totalMs = startedAt > 0 && endsAt > startedAt ? (endsAt - startedAt) : 0;

        for (const [voterKey, choiceIndex] of userVotes.entries()) {
            const meta = voterMeta.get(voterKey) || {};
            const isCorrect = choiceIndex === q.correctIndex;
            let earnedPoints = 0;
            if (isCorrect) {
                let speedMultiplier = 0;
                if (speedBonusEnabled && totalMs > 0 && meta.votedAt) {
                    const elapsedMs = Math.max(0, Math.min(totalMs, meta.votedAt - startedAt));
                    const remainingRatio = Math.max(0, Math.min(1, 1 - (elapsedMs / totalMs)));
                    speedMultiplier = 0.5 * remainingRatio;
                }
                earnedPoints = Math.round(basePoints * (1 + speedMultiplier));
            }
            const update = {
                voterKey,
                displayName: meta.displayName || voterKey,
                userId: meta.userId || '',
                isCorrect,
                earnedPoints,
                now
            };
            recordPlayerAnswer(sessionPlayers, update);
            recordPlayerAnswer(seasonPlayers, update);
        }

        saveLeaderboard();
        return true;
    }

    function revealAnswer() {
        if (state.status !== 'question' && state.status !== 'idle') {
            return getPublicState();
        }
        if (!state.activeQuestion && state.questions.length > 0) {
            state.activeQuestion = { ...state.questions[state.currentIndex], _scored: false };
        }
        if (!state.activeQuestion) return getPublicState();

        clearTimers();
        state.status = 'reveal';
        const leaderboardUpdated = scoreActiveQuestion();

        save();
        if (leaderboardUpdated) {
            broadcastLeaderboard();
        }
        broadcastState('trivia:reveal', {
            question: sanitizeActiveQuestion(state.activeQuestion, true),
            correctIndex: state.activeQuestion.correctIndex,
            correctLetter: String.fromCharCode(65 + (state.activeQuestion.correctIndex || 0)),
            funfact: state.activeQuestion.funfact || '',
            leaderboardUpdated
        });

        if (isChatVotingActive() && chatbotAnnouncer && typeof chatbotAnnouncer.announceTriviaAnswer === 'function') {
            try {
                Promise.resolve(chatbotAnnouncer.announceTriviaAnswer(sanitizeActiveQuestion(state.activeQuestion, true)))
                    .catch(err => log('[Trivia] Chatbot answer announce failed:', err.message));
            } catch (err) {
                log('[Trivia] Chatbot answer announce failed:', err.message);
            }
        }

        // Hold the revealed answer independently of the pre-reveal delay.
        if (state.settings.autoAdvance) {
            const delaySec = Math.max(0, Number(state.settings.advanceDelay) || 0);
            revealTimer = setTimeout(() => {
                if (!state.settings.autoAdvance) return;
                if (state.questions.some(q => !playedQuestionIds.has(q.id))) {
                    nextQuestion();
                } else {
                    resetTrivia();
                }
            }, delaySec * 1000);
            revealTimer.unref?.();
        }

        return getPublicState();
    }

    function nextQuestion() {
        if (state.questions.length === 0) throw new Error('No questions available');

        let targetIndex;
        if (state.settings.randomOrder) {
            let unplayed = state.questions.filter(q => !playedQuestionIds.has(q.id));
            if (unplayed.length === 0) {
                resetDoneQuestions();
                unplayed = state.questions;
            }
            const picked = unplayed[Math.floor(Math.random() * unplayed.length)];
            targetIndex = state.questions.findIndex(q => q.id === picked.id);
        } else {
            let unplayed = state.questions.filter(q => !playedQuestionIds.has(q.id));
            if (unplayed.length > 0) {
                const nextUnplayed = state.questions.find((q, i) => i > state.currentIndex && !playedQuestionIds.has(q.id)) || unplayed[0];
                targetIndex = state.questions.findIndex(q => q.id === nextUnplayed.id);
            } else {
                targetIndex = (state.currentIndex + 1) % state.questions.length;
            }
        }

        return startQuestion(targetIndex);
    }

    function resetDoneQuestions() {
        playedQuestionIds.clear();
        for (const q of state.questions) {
            q.done = false;
        }
        save();
        broadcastState('trivia:state');
        return true;
    }

    function toggleQuestionDone(id, forcedValue = null) {
        const q = state.questions.find(item => item.id === id);
        if (!q) throw new Error('Question not found');
        const isDone = playedQuestionIds.has(id) || Boolean(q.done);
        const nextDone = typeof forcedValue === 'boolean' ? forcedValue : !isDone;
        if (nextDone) {
            playedQuestionIds.add(id);
            q.done = true;
        } else {
            playedQuestionIds.delete(id);
            q.done = false;
        }
        save();
        broadcastState('trivia:state');
        const unplayed = state.questions.filter(item => !playedQuestionIds.has(item.id) && !item.done).length;
        return { id, done: nextDone, unplayedCount: unplayed };
    }

    function setQuestionDone(id, isDone = true) {
        return toggleQuestionDone(id, Boolean(isDone));
    }

    function previousQuestion() {
        if (state.questions.length === 0) throw new Error('No questions available');
        const prevIdx = (state.currentIndex - 1 + state.questions.length) % state.questions.length;
        return startQuestion(prevIdx);
    }

    function clearQuestion() {
        clearTimers();
        userVotes.clear();
        voterMeta.clear();
        activeChoiceOrder = [];
        state.status = 'idle';
        state.activeQuestion = null;
        save();
        broadcastState();
        return getPublicState();
    }

    function resetTrivia() {
        clearTimers();
        userVotes.clear();
        voterMeta.clear();
        playedQuestionIds.clear();
        for (const q of state.questions) q.done = false;
        state.status = 'idle';
        state.activeQuestion = null;

        save();
        broadcastState('trivia:reset');
        return getPublicState();
    }

    function castVote({ user = '', userId = '', choiceIndex = -1, isSub = false } = {}) {
        if (state.status !== 'question') return false;
        if (state.activeQuestion?.endsAt && Date.now() >= state.activeQuestion.endsAt) return false;
        if (!isChatVotingActive()) return false;
        const choiceCount = state.activeQuestion?.choices?.length || 4;
        if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= choiceCount) return false;

        const voterKey = (userId || user || '').trim().toLowerCase();
        if (!voterKey) return false;

        userVotes.set(voterKey, choiceIndex);
        const displayName = String(user || voterKey).trim() || voterKey;
        voterMeta.set(voterKey, {
            displayName,
            userId: String(userId || '').trim(),
            votedAt: Date.now(),
            isSub: Boolean(isSub)
        });

        // Broadcast updated vote counts to overlays
        const sanitized = sanitizeActiveQuestion(state.activeQuestion, false);
        broadcastToOverlays('trivia:vote-update', {
            choices: sanitized.choices,
            totalVotes: sanitized.totalVotes
        });

        return true;
    }

    function sendCommandReply(cdKey, text) {
        if (!text) return false;
        const cooldownMs = Math.max(0, Number(state.settings?.leaderboard?.commandCooldownMs ?? 3000));
        const now = Date.now();
        const prev = commandCooldowns.get(cdKey) || 0;
        if (cooldownMs > 0 && now - prev < cooldownMs) {
            return true;
        }
        commandCooldowns.set(cdKey, now);
        if (chatbotAnnouncer && typeof chatbotAnnouncer.postMessage === 'function' && (isChatbotEnabled() || state.settings.forceChatVoting)) {
            try {
                Promise.resolve(chatbotAnnouncer.postMessage(text))
                    .catch(err => log('[Trivia] Leaderboard command reply failed:', err.message));
            } catch (err) {
                log('[Trivia] Leaderboard command reply failed:', err.message);
            }
        }
        return true;
    }

    function handleLeaderboardChatCommand(lower, { user = '', userId = '' } = {}) {
        if (state.settings?.leaderboard?.enabled === false) return false;
        if (state.settings?.leaderboard?.commandsEnabled === false) return false;

        const statsMatch = lower.match(/^!(?:triviastats|tstats)(?:\s+(.+))?$/);
        if (statsMatch) {
            const rawArg = (statsMatch[1] || '').trim().split(/\s+/)[0] || '';
            const target = (rawArg || user || userId || '').replace(/^@/, '').trim();
            if (!target) return false;
            const stats = getPlayerStats(target);
            const cdKey = `stats:${target.toLowerCase()}`;
            if (!stats) {
                return sendCommandReply(cdKey, `@${target} has no trivia stats recorded yet.`);
            }
            const parts = [];
            if (stats.season) {
                const s = stats.season;
                parts.push(`Season: #${s.rank} • ${s.points} pts • ${s.correct}/${s.answered} (${s.accuracy}% acc)${s.streak > 1 ? ` • streak ${s.streak}` : ''}`);
            }
            if (stats.session) {
                const sess = stats.session;
                parts.push(`Session: #${sess.rank} • ${sess.points} pts • ${sess.correct}/${sess.answered} (${sess.accuracy}%)`);
            }
            return sendCommandReply(cdKey, `@${stats.name} Trivia Stats — ${parts.join(' | ')}`);
        }

        const topMatch = lower.match(/^!(?:triviatop|trivialeaderboard|tleaderboard)(?:\s+(.+))?$/);
        if (topMatch) {
            const arg = (topMatch[1] || '').trim().toLowerCase();
            const scope = arg === 'session' ? 'session' : 'season';
            const scopeLabel = scope === 'session' ? 'Session' : 'Season';
            const lb = getLeaderboard({ scope, limit: 5 });
            const cdKey = `top:${scope}`;
            if (!lb.entries.length) {
                return sendCommandReply(cdKey, `Trivia Leaderboard (${scopeLabel}) has no scores yet!`);
            }
            const formatted = lb.entries
                .map(e => `#${e.rank} ${e.name} (${e.points} pts, ${e.correct}/${e.answered}, ${e.accuracy}%)`)
                .join(' • ');
            return sendCommandReply(cdKey, `Trivia Top (${scopeLabel}): ${formatted}`);
        }

        return false;
    }

    function handleChatMessage(msg = {}) {
        const comment = String(msg.comment || msg.message || '').trim();
        if (!comment) return false;

        const user = String(msg.user || msg.username || msg.author || '').trim();
        const userId = String(msg.userId || msg.authorId || user).trim();
        const isSub = Boolean(msg.subscriber || msg.isSub || msg.hasMembership);
        const lower = comment.toLowerCase();

        if (handleLeaderboardChatCommand(lower, { user, userId })) {
            return true;
        }

        if (state.status !== 'question' || !isChatVotingActive()) return false;
        if (!state.activeQuestion) return false;

        const choices = state.activeQuestion.choices || [];
        const choiceCount = choices.length;

        // 1. Check True/False voting if question has 2 choices and represents true/false
        if (choiceCount === 2) {
            const trueIdx = choices.findIndex(c => /^true$/i.test(c.trim()));
            const falseIdx = choices.findIndex(c => /^false$/i.test(c.trim()));

            if (trueIdx !== -1 && falseIdx !== -1) {
                if (lower === '!true' || lower === '!t' || lower === 'true' || lower === 't') {
                    return castVote({ user, userId, choiceIndex: trueIdx, isSub });
                }
                if (lower === '!false' || lower === '!f' || lower === 'false' || lower === 'f') {
                    return castVote({ user, userId, choiceIndex: falseIdx, isSub });
                }
            }
        }

        // 2. Direct letter or number command: "!a" to "!f", or "!1" to "!6"
        const directMatch = lower.match(/^!([a-f1-6])\b/);
        if (directMatch) {
            const token = directMatch[1];
            let choiceIndex = -1;
            if (token >= 'a' && token <= 'f') {
                choiceIndex = token.charCodeAt(0) - 97; // 0..5
            } else if (token >= '1' && token <= '6') {
                choiceIndex = parseInt(token, 10) - 1; // 0..5
            }
            if (choiceIndex >= 0 && choiceIndex < choiceCount) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        // 3. Command "!trivia <choice>"
        const triviaCmdMatch = lower.match(/^!trivia\s+([a-f1-6]|true|false|t|f)\b/);
        if (triviaCmdMatch) {
            const token = triviaCmdMatch[1];
            if (choiceCount === 2 && (token === 'true' || token === 't')) {
                const trueIdx = choices.findIndex(c => /^true$/i.test(c.trim()));
                if (trueIdx !== -1) return castVote({ user, userId, choiceIndex: trueIdx, isSub });
            }
            if (choiceCount === 2 && (token === 'false' || token === 'f')) {
                const falseIdx = choices.findIndex(c => /^false$/i.test(c.trim()));
                if (falseIdx !== -1) return castVote({ user, userId, choiceIndex: falseIdx, isSub });
            }
            let choiceIndex = -1;
            if (token >= 'a' && token <= 'f') {
                choiceIndex = token.charCodeAt(0) - 97;
            } else if (token >= '1' && token <= '6') {
                choiceIndex = parseInt(token, 10) - 1;
            }
            if (choiceIndex >= 0 && choiceIndex < choiceCount) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        // 4. Bare single letter or single number vote
        if (lower.length === 1 && /^[a-f1-6]$/.test(lower)) {
            let choiceIndex = -1;
            if (lower >= 'a' && lower <= 'f') {
                choiceIndex = lower.charCodeAt(0) - 97;
            } else if (lower >= '1' && lower <= '6') {
                choiceIndex = parseInt(lower, 10) - 1;
            }
            if (choiceIndex >= 0 && choiceIndex < choiceCount) {
                return castVote({ user, userId, choiceIndex, isSub });
            }
        }

        return false;
    }

    function checkIsTrueFalse(choices = []) {
        return choices.length === 2 &&
            choices.some(c => /^true$/i.test(String(c).trim())) &&
            choices.some(c => /^false$/i.test(String(c).trim()));
    }

    // Question Management CRUD
    function addQuestion(item) {
        if (!item || !item.question || !Array.isArray(item.choices)) {
            throw new Error('Question and choices array are required');
        }
        if (item.choices.length < 2 || item.choices.length > 6) {
            throw new Error('A question must have between 2 and 6 choices');
        }
        const choiceSlice = item.choices.map(c => String(c || '').trim()).filter(Boolean);
        if (choiceSlice.length < 2 || choiceSlice.length > 6) {
            throw new Error('A question must have between 2 and 6 choices');
        }

        const newQuestion = {
            id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: String(item.category || 'General').trim(),
            question: String(item.question || '').trim(),
            choices: choiceSlice,
            isTrueFalse: checkIsTrueFalse(choiceSlice),
            correctIndex: Math.max(0, Math.min(choiceSlice.length - 1, parseInt(item.correctIndex, 10) || 0)),
            funfact: String(item.funfact || '').trim(),
            duration: Math.max(5, Math.min(300, parseInt(item.duration, 10) || state.settings.defaultDuration || 20)),
            points: Math.max(10, parseInt(item.points, 10) || 100)
        };

        state.questions.push(newQuestion);
        save();
        broadcastState('trivia:state');
        return newQuestion;
    }

    function updateQuestion(id, updates) {
        const idx = state.questions.findIndex(q => q.id === id);
        if (idx === -1) throw new Error('Question not found');

        const existing = state.questions[idx];
        let choices = existing.choices;
        if (updates.choices && Array.isArray(updates.choices)) {
            const filtered = updates.choices.map(c => String(c || '').trim()).filter(Boolean).slice(0, 6);
            if (filtered.length >= 2) choices = filtered;
        }

        let correctIndex = existing.correctIndex;
        if (updates.correctIndex !== undefined) {
            correctIndex = Math.max(0, Math.min(choices.length - 1, parseInt(updates.correctIndex, 10) || 0));
        }

        const updated = {
            ...existing,
            ...updates,
            id: existing.id,
            choices,
            isTrueFalse: checkIsTrueFalse(choices),
            correctIndex
        };

        state.questions[idx] = updated;
        if (state.activeQuestion && state.activeQuestion.id === id) {
            activeChoiceOrder = activeChoiceOrder.filter(index => index < choices.length);
            for (let index = 0; index < choices.length; index++) {
                if (!activeChoiceOrder.includes(index)) activeChoiceOrder.push(index);
            }
            if (updates.choices) userVotes.clear();
            state.activeQuestion = {
                ...state.activeQuestion, ...updated,
                choices: activeChoiceOrder.map(index => choices[index]),
                correctIndex: activeChoiceOrder.indexOf(updated.correctIndex),
                duration: state.activeQuestion.duration
            };
        }

        save();
        broadcastState('trivia:state');
        return updated;
    }

    function deleteQuestion(id) {
        const idx = state.questions.findIndex(q => q.id === id);
        if (idx === -1) return false;

        state.questions.splice(idx, 1);
        playedQuestionIds.delete(id);
        if (state.currentIndex >= state.questions.length) {
            state.currentIndex = Math.max(0, state.questions.length - 1);
        }
        if (state.activeQuestion && state.activeQuestion.id === id) {
            resetTrivia();
        } else {
            save();
            broadcastState('trivia:state');
        }
        return true;
    }

    function reorderQuestions(ids) {
        if (!Array.isArray(ids)) throw new Error('ids must be an array');
        const qMap = new Map(state.questions.map(q => [q.id, q]));
        const reordered = [];
        for (const id of ids) {
            if (qMap.has(id)) {
                reordered.push(qMap.get(id));
                qMap.delete(id);
            }
        }
        for (const remaining of qMap.values()) {
            reordered.push(remaining);
        }
        state.questions = reordered;
        if (state.activeQuestion) state.currentIndex = state.questions.findIndex(q => q.id === state.activeQuestion.id);
        save();
        broadcastState('trivia:state');
        return state.questions;
    }

    function moveQuestion(id, direction) {
        const idx = state.questions.findIndex(q => q.id === id);
        if (idx === -1) return state.questions;
        const targetIdx = direction === 'up' || Number(direction) < 0 ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= state.questions.length) return state.questions;

        const temp = state.questions[idx];
        state.questions[idx] = state.questions[targetIdx];
        state.questions[targetIdx] = temp;
        if (state.activeQuestion) state.currentIndex = state.questions.findIndex(q => q.id === state.activeQuestion.id);
        save();
        broadcastState('trivia:state');
        return state.questions;
    }

    function shuffleQuestions() {
        for (let i = state.questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.questions[i], state.questions[j]] = [state.questions[j], state.questions[i]];
        }
        state.currentIndex = state.activeQuestion ? state.questions.findIndex(q => q.id === state.activeQuestion.id) : 0;
        playedQuestionIds.clear();
        for (const q of state.questions) q.done = false;
        save();
        broadcastState('trivia:state');
        return state.questions;
    }

    function clearQuestions() {
        state.questions = [];
        state.currentIndex = 0;
        resetTrivia();
        return [];
    }

    function parseCsvRows(csvText) {
        const text = String(csvText || '').replace(/^\uFEFF/, '');
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') {
                        field += '"';
                        i += 1;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(field);
                field = '';
            } else if (ch === '\r' || ch === '\n') {
                if (ch === '\r' && text[i + 1] === '\n') i += 1;
                row.push(field);
                if (row.some(cell => String(cell).trim() !== '')) {
                    rows.push(row);
                }
                row = [];
                field = '';
            } else {
                field += ch;
            }
        }
        if (field.length > 0 || row.length > 0) {
            row.push(field);
            if (row.some(cell => String(cell).trim() !== '')) {
                rows.push(row);
            }
        }
        return rows;
    }

    function resolveCsvCorrectIndex(rawVal, choices, isIndexCol = false) {
        const trimmed = String(rawVal ?? '').trim();
        if (!trimmed || !choices.length) return 0;

        if (isIndexCol && /^\d+$/.test(trimmed)) {
            return Math.max(0, Math.min(choices.length - 1, parseInt(trimmed, 10)));
        }

        if (/^[a-f]$/i.test(trimmed)) {
            const idx = trimmed.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < choices.length) return idx;
        }

        const lower = trimmed.toLowerCase();
        const exactIdx = choices.findIndex(c => c.toLowerCase() === lower);
        if (exactIdx !== -1) return exactIdx;

        const prefixed = trimmed.match(/^(?:choice|option|answer)\s*([a-f])$/i);
        if (prefixed) {
            const idx = prefixed[1].toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < choices.length) return idx;
        }

        if (/^[1-6]$/.test(trimmed)) {
            const oneBased = parseInt(trimmed, 10) - 1;
            if (oneBased >= 0 && oneBased < choices.length) return oneBased;
        }

        return 0;
    }

    function parseQuestionsCsv(csvText) {
        const rows = parseCsvRows(csvText);
        if (!rows.length) {
            throw new Error('CSV is empty.');
        }

        const normalizeHeader = cell => String(cell || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const firstNorm = rows[0].map(normalizeHeader);
        const headerTokens = new Set(['category', 'topic', 'question', 'prompt', 'questiontext', 'choicea', 'optiona', 'choice1', 'choices', 'correctanswer', 'correct', 'correctindex']);
        const hasHeader = firstNorm.some(h => headerTokens.has(h));

        const colMap = {
            category: -1,
            question: -1,
            choicesList: -1,
            choiceCols: [-1, -1, -1, -1, -1, -1],
            correct: -1,
            correctIsIndex: false,
            funfact: -1,
            duration: -1,
            points: -1
        };

        let startRow = 0;
        if (hasHeader) {
            startRow = 1;
            firstNorm.forEach((h, idx) => {
                if (h === 'category' || h === 'topic' || h === 'subject') colMap.category = idx;
                else if (h === 'question' || h === 'prompt' || h === 'questiontext' || h === 'q') colMap.question = idx;
                else if (h === 'choices' || h === 'options' || h === 'answers') colMap.choicesList = idx;
                else if (['choicea', 'optiona', 'choice1', 'option1', 'answera', 'answer1', 'a'].includes(h)) colMap.choiceCols[0] = idx;
                else if (['choiceb', 'optionb', 'choice2', 'option2', 'answerb', 'answer2', 'b'].includes(h)) colMap.choiceCols[1] = idx;
                else if (['choicec', 'optionc', 'choice3', 'option3', 'answerc', 'answer3', 'c'].includes(h)) colMap.choiceCols[2] = idx;
                else if (['choiced', 'optiond', 'choice4', 'option4', 'answerd', 'answer4', 'd'].includes(h)) colMap.choiceCols[3] = idx;
                else if (['choicee', 'optione', 'choice5', 'option5', 'answere', 'answer5', 'e'].includes(h)) colMap.choiceCols[4] = idx;
                else if (['choicef', 'optionf', 'choice6', 'option6', 'answerf', 'answer6', 'f'].includes(h)) colMap.choiceCols[5] = idx;
                else if (['correctindex', 'answerindex'].includes(h)) {
                    colMap.correct = idx;
                    colMap.correctIsIndex = true;
                } else if (['correctanswer', 'correct', 'answer', 'correctchoice', 'correctletter', 'solution'].includes(h)) {
                    colMap.correct = idx;
                } else if (['funfact', 'fact', 'explanation', 'hint', 'note', 'notes'].includes(h)) colMap.funfact = idx;
                else if (['duration', 'time', 'seconds', 'timer', 'timelimit'].includes(h)) colMap.duration = idx;
                else if (['points', 'score', 'value', 'pts'].includes(h)) colMap.points = idx;
            });
        }

        const questions = [];
        for (let r = startRow; r < rows.length; r++) {
            const cells = rows[r];
            let category = 'General';
            let questionText = '';
            let choices = [];
            let rawCorrect = '';
            let funfact = '';
            let durationRaw = '';
            let pointsRaw = '';

            if (hasHeader) {
                if (colMap.category !== -1) category = cells[colMap.category] || 'General';
                if (colMap.question !== -1) questionText = cells[colMap.question] || '';
                const hasIndividualChoices = colMap.choiceCols.some(c => c !== -1);
                if (hasIndividualChoices) {
                    choices = colMap.choiceCols
                        .map(idx => (idx !== -1 ? String(cells[idx] ?? '').trim() : ''))
                        .filter(Boolean);
                } else if (colMap.choicesList !== -1) {
                    const delim = String(cells[colMap.choicesList] || '').includes('|') ? '|' : ';';
                    choices = String(cells[colMap.choicesList] || '').split(delim).map(s => s.trim()).filter(Boolean);
                }
                if (colMap.correct !== -1) rawCorrect = cells[colMap.correct] ?? '';
                if (colMap.funfact !== -1) funfact = cells[colMap.funfact] ?? '';
                if (colMap.duration !== -1) durationRaw = cells[colMap.duration] ?? '';
                if (colMap.points !== -1) pointsRaw = cells[colMap.points] ?? '';
            } else {
                // Headerless fallback: support 10-col (ChoiceA..D) or 12-col (ChoiceA..F)
                const sixChoices = cells.length >= 11;
                category = cells[0] || 'General';
                questionText = cells[1] || '';
                const choiceEnd = sixChoices ? 8 : 6;
                choices = cells.slice(2, choiceEnd).map(c => String(c ?? '').trim()).filter(Boolean);
                rawCorrect = cells[choiceEnd] ?? '';
                funfact = cells[choiceEnd + 1] ?? '';
                durationRaw = cells[choiceEnd + 2] ?? '';
                pointsRaw = cells[choiceEnd + 3] ?? '';
            }

            const trimmedQuestion = String(questionText || '').trim();
            if (!trimmedQuestion) continue;
            const cleanChoices = choices.slice(0, 6);
            if (cleanChoices.length < 2) continue;

            questions.push({
                category: String(category || 'General').trim() || 'General',
                question: trimmedQuestion,
                choices: cleanChoices,
                correctIndex: resolveCsvCorrectIndex(rawCorrect, cleanChoices, colMap.correctIsIndex),
                funfact: String(funfact || '').trim(),
                duration: parseInt(durationRaw, 10) || undefined,
                points: parseInt(pointsRaw, 10) || undefined
            });
        }

        if (!questions.length) {
            throw new Error('No valid questions found in CSV. Ensure Question and at least 2 choices are filled in.');
        }
        return questions;
    }

    function importQuestions(itemsOrCsv, { replace = false } = {}) {
        const items = typeof itemsOrCsv === 'string' ? parseQuestionsCsv(itemsOrCsv) : itemsOrCsv;
        if (!Array.isArray(items)) throw new Error('Import items must be an array or CSV text');
        const validated = items.map((it, idx) => {
            const choices = Array.isArray(it.choices)
                ? it.choices.map(c => String(c || '').trim()).filter(Boolean).slice(0, 6)
                : ['True', 'False'];
            return {
                id: it.id || `q_imp_${Date.now()}_${idx}`,
                category: String(it.category || 'General').trim(),
                question: String(it.question || '').trim(),
                choices: choices.length >= 2 ? choices : ['True', 'False'],
                correctIndex: Math.max(0, Math.min(choices.length - 1, parseInt(it.correctIndex, 10) || 0)),
                funfact: String(it.funfact || '').trim(),
                duration: Math.max(5, Math.min(300, parseInt(it.duration, 10) || state.settings.defaultDuration || 20)),
                points: Math.max(10, parseInt(it.points, 10) || 100)
            };
        }).filter(q => q.question.length > 0 && q.choices.length >= 2);

        if (replace) {
            state.questions = validated;
            state.currentIndex = 0;
            playedQuestionIds.clear();
        } else {
            state.questions.push(...validated);
        }

        save();
        broadcastState('trivia:state');
        return state.questions;
    }

    // Preset Management
    function savePreset(name, description = '') {
        const trimmedName = String(name || '').trim();
        if (!trimmedName) throw new Error('Preset name is required');

        const presetId = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const preset = {
            id: presetId,
            name: trimmedName,
            description: String(description || '').trim(),
            theme: JSON.parse(JSON.stringify(state.theme)),
            settings: JSON.parse(JSON.stringify(state.settings)),
            questions: JSON.parse(JSON.stringify(state.questions)),
            createdAt: new Date().toISOString()
        };

        state.presets.push(preset);
        save();
        broadcastState('trivia:state');
        return preset;
    }

    function loadPreset(presetId) {
        const preset = state.presets.find(p => p.id === presetId);
        if (!preset) throw new Error('Preset not found');

        if (Array.isArray(preset.questions)) {
            state.questions = JSON.parse(JSON.stringify(preset.questions));
        }
        if (preset.theme) {
            state.theme = { ...DEFAULT_THEME, ...preset.theme };
        }
        if (preset.settings) {
            state.settings = { ...DEFAULT_SETTINGS, ...preset.settings };
        }
        state.currentIndex = 0;
        playedQuestionIds.clear();
        resetTrivia();

        return getPublicState();
    }

    function deletePreset(presetId) {
        if (BUILTIN_PRESETS.some(bp => bp.id === presetId)) {
            throw new Error('Built-in presets cannot be deleted');
        }
        const idx = state.presets.findIndex(p => p.id === presetId);
        if (idx === -1) return false;

        state.presets.splice(idx, 1);
        save();
        broadcastState('trivia:state');
        return true;
    }

    function resetPresets() {
        state.presets = JSON.parse(JSON.stringify(BUILTIN_PRESETS));
        save();
        broadcastState('trivia:state');
        return state.presets;
    }

    function updateSettings(newSettings) {
        if (!newSettings || typeof newSettings !== 'object') return state.settings;
        const prevLeaderboard = state.settings.leaderboard || DEFAULT_SETTINGS.leaderboard;
        state.settings = {
            ...state.settings,
            ...newSettings,
            leaderboard: newSettings.leaderboard !== undefined
                ? normalizeLeaderboardSettings({ ...prevLeaderboard, ...newSettings.leaderboard })
                : normalizeLeaderboardSettings(prevLeaderboard)
        };
        for (const [key, max] of [['revealDelay', 60], ['advanceDelay', 300]]) {
            if (Object.hasOwn(newSettings, key)) {
                const value = Number(newSettings[key]);
                state.settings[key] = Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : DEFAULT_SETTINGS[key];
            }
        }
        if (Object.hasOwn(newSettings, 'defaultDuration')) {
            const value = Number(newSettings.defaultDuration);
            state.settings.defaultDuration = Number.isFinite(value) ? Math.min(300, Math.max(5, value)) : DEFAULT_SETTINGS.defaultDuration;
        }
        save();
        broadcastLeaderboard();
        broadcastState('trivia:state');
        return state.settings;
    }

    function updateTheme(newTheme) {
        if (!newTheme || typeof newTheme !== 'object') return state.theme;
        state.theme = {
            ...state.theme,
            ...newTheme
        };
        save();
        broadcastState('trivia:state');
        return state.theme;
    }

    function updateLeaderboardTheme(newTheme) {
        if (!newTheme || typeof newTheme !== 'object') return state.leaderboardTheme;
        if (newTheme.reset === true) {
            state.leaderboardTheme = { ...DEFAULT_LEADERBOARD_THEME };
        } else {
            state.leaderboardTheme = {
                ...DEFAULT_LEADERBOARD_THEME,
                ...state.leaderboardTheme,
                ...newTheme
            };
        }
        save();
        broadcastState('trivia:state');
        broadcastLeaderboard();
        return state.leaderboardTheme;
    }

    function resetLeaderboard(scopeOrOpts = 'session') {
        const rawScope = typeof scopeOrOpts === 'string'
            ? scopeOrOpts
            : (scopeOrOpts && typeof scopeOrOpts === 'object' ? scopeOrOpts.scope : 'session');
        const scope = ['session', 'season', 'both', 'all'].includes(rawScope) ? rawScope : 'session';
        if (scope === 'session' || scope === 'both' || scope === 'all') {
            sessionPlayers.clear();
        }
        if (scope === 'season' || scope === 'both' || scope === 'all') {
            seasonPlayers.clear();
            seasonStartedAt = Date.now();
            saveLeaderboard();
        }
        broadcastState('trivia:state');
        const payload = broadcastLeaderboard();
        return {
            success: true,
            scope,
            seasonStartedAt,
            ...payload
        };
    }

    function csvEscape(val) {
        const str = String(val ?? '');
        return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }

    function exportLeaderboard({ scope = 'season', format = 'json' } = {}) {
        const lb = getLeaderboard({ scope, limit: 0 });
        if (String(format).toLowerCase() === 'csv') {
            const header = ['Rank', 'Player', 'Points', 'Correct', 'Wrong', 'Answered', 'Accuracy%', 'Streak', 'BestStreak', 'LastPlayedAt'].join(',');
            const rows = lb.entries.map(e => [
                e.rank,
                csvEscape(e.name),
                e.points,
                e.correct,
                e.wrong,
                e.answered,
                e.accuracy,
                e.streak,
                e.bestStreak,
                e.lastPlayedAt ? new Date(e.lastPlayedAt).toISOString() : ''
            ].join(','));
            return [header, ...rows].join('\r\n');
        }
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            scope: lb.scope,
            sortBy: lb.sortBy,
            seasonStartedAt: lb.seasonStartedAt,
            totalPlayers: lb.totalPlayers,
            players: lb.entries
        };
    }

    function importLeaderboard(data, { replace = false, scope = 'season' } = {}) {
        const resolvedScope = scope === 'session' ? 'session' : 'season';
        const list = Array.isArray(data)
            ? data
            : (data && Array.isArray(data.players) ? data.players : (data && Array.isArray(data.entries) ? data.entries : null));
        if (!list) {
            throw new Error('Leaderboard import must be an array or an object with a players array');
        }
        const map = getLeaderboardMap(resolvedScope);
        if (replace) {
            map.clear();
        }
        let importedCount = 0;
        for (const item of list) {
            const normalized = normalizePlayerRecord(item);
            if (!normalized) continue;
            map.set(normalized.key, normalized);
            importedCount += 1;
        }
        if (resolvedScope === 'season') {
            if (data && !Array.isArray(data) && Number(data.seasonStartedAt) > 0) {
                seasonStartedAt = Number(data.seasonStartedAt);
            }
            saveLeaderboard();
        }
        broadcastState('trivia:state');
        broadcastLeaderboard();
        return {
            importedCount,
            ...getLeaderboard({ scope: resolvedScope, limit: 0 })
        };
    }

    function exportQuestions({ format = 'json' } = {}) {
        if (String(format).toLowerCase() === 'csv') {
            const header = ['Category', 'Question', 'ChoiceA', 'ChoiceB', 'ChoiceC', 'ChoiceD', 'ChoiceE', 'ChoiceF', 'CorrectAnswer', 'FunFact', 'Duration', 'Points'].join(',');
            const rows = state.questions.map(q => {
                const choices = Array.isArray(q.choices) ? q.choices : [];
                const correctIdx = Math.max(0, Math.min(Math.max(0, choices.length - 1), Number(q.correctIndex) || 0));
                const correctLetter = choices.length ? String.fromCharCode(65 + correctIdx) : 'A';
                return [
                    csvEscape(q.category || 'General'),
                    csvEscape(q.question || ''),
                    csvEscape(choices[0] || ''),
                    csvEscape(choices[1] || ''),
                    csvEscape(choices[2] || ''),
                    csvEscape(choices[3] || ''),
                    csvEscape(choices[4] || ''),
                    csvEscape(choices[5] || ''),
                    correctLetter,
                    csvEscape(q.funfact || ''),
                    q.duration || state.settings.defaultDuration || 20,
                    q.points || 100
                ].join(',');
            });
            return [header, ...rows].join('\r\n');
        }
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            title: state.title,
            questionCount: state.questions.length,
            questions: state.questions.map(q => ({
                id: q.id,
                category: q.category || 'General',
                question: q.question || '',
                choices: Array.isArray(q.choices) ? [...q.choices] : [],
                correctIndex: Number(q.correctIndex) || 0,
                funfact: q.funfact || '',
                duration: q.duration || state.settings.defaultDuration || 20,
                points: q.points || 100
            }))
        };
    }

    function getPublicState({ includeAnswers = false } = {}) {
        const seasonLb = getLeaderboard({ scope: 'season', limit: 25 });
        const sessionLb = getLeaderboard({ scope: 'session', limit: 25 });
        return {
            id: state.id,
            title: state.title,
            status: state.status,
            currentIndex: state.currentIndex,
            totalQuestions: state.questions.length,
            playedQuestionIds: Array.from(playedQuestionIds),
            unplayedCount: state.questions.filter(q => !playedQuestionIds.has(q.id) && !q.done).length,
            activeQuestion: sanitizeActiveQuestion(state.activeQuestion, Boolean(includeAnswers || state.status === 'reveal')),
            chatbotEnabled: isChatbotEnabled(),
            chatVotingActive: isChatVotingActive(),
            questions: state.questions.map(q => ({
                id: q.id,
                category: q.category,
                question: q.question,
                choices: q.choices,
                choiceCount: q.choices.length,
                isTrueFalse: q.choices.length === 2 &&
                    q.choices.some(c => /^true$/i.test(c.trim())) &&
                    q.choices.some(c => /^false$/i.test(c.trim())),
                correctIndex: includeAnswers ? q.correctIndex : undefined,
                funfact: q.funfact,
                duration: q.duration,
                points: q.points,
                done: playedQuestionIds.has(q.id) || Boolean(q.done),
                played: playedQuestionIds.has(q.id) || Boolean(q.done)
            })),
            theme: state.theme,
            leaderboardTheme: state.leaderboardTheme,
            settings: state.settings,
            leaderboard: {
                season: seasonLb,
                session: sessionLb
            },
            presets: state.presets.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                questionCount: (p.questions || []).length,
                isBuiltin: BUILTIN_PRESETS.some(bp => bp.id === p.id)
            }))
        };
    }

    function getStatusSummary() {
        const active = sanitizeActiveQuestion(state.activeQuestion, state.status === 'reveal');
        const seasonLb = getLeaderboard({ scope: 'season', limit: 5 });
        const sessionLb = getLeaderboard({ scope: 'session', limit: 5 });
        return {
            status: state.status,
            currentIndex: state.currentIndex,
            totalQuestions: state.questions.length,
            activeCategory: active ? active.category : null,
            activeQuestionText: active ? active.question : null,
            totalVotes: active ? active.totalVotes : 0,
            remainingSeconds: active ? active.remainingSeconds : 0,
            chatbotEnabled: isChatbotEnabled(),
            chatVotingActive: isChatVotingActive(),
            activeQuestion: active,
            leaderboard: {
                enabled: state.settings.leaderboard?.enabled !== false,
                sortBy: state.settings.leaderboard?.sortBy || 'points',
                seasonStartedAt,
                seasonTotalPlayers: seasonPlayers.size,
                sessionTotalPlayers: sessionPlayers.size,
                seasonLeader: seasonLb.entries[0] || null,
                sessionLeader: sessionLb.entries[0] || null,
                seasonTop3: seasonLb.entries.slice(0, 3),
                sessionTop3: sessionLb.entries.slice(0, 3)
            }
        };
    }

    load();

    return {
        getPublicState,
        getStatusSummary,
        getLeaderboard,
        getPlayerStats,
        resetLeaderboard,
        exportLeaderboard,
        importLeaderboard,
        updateLeaderboardTheme,
        startQuestion,
        revealAnswer,
        nextQuestion,
        previousQuestion,
        clearQuestion,
        resetTrivia,
        castVote,
        handleChatMessage,
        addQuestion,
        updateQuestion,
        deleteQuestion,
        reorderQuestions,
        moveQuestion,
        shuffleQuestions,
        resetDoneQuestions,
        toggleQuestionDone,
        setQuestionDone,
        clearQuestions,
        importQuestions,
        exportQuestions,
        savePreset,
        loadPreset,
        deletePreset,
        resetPresets,
        updateSettings,
        updateTheme,
        stop: () => clearTimers(),
        destroy: () => clearTimers(),
        getState: () => state
    };
}

module.exports = {
    createTriviaService,
    DEFAULT_THEME,
    DEFAULT_LEADERBOARD_THEME,
    DEFAULT_SETTINGS,
    BUILTIN_PRESETS
};
