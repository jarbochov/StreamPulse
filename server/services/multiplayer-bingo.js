const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    MP_BINGO_PLAYER_COLORS,
    defaultPack,
    normalizePack,
    defaultAppearance,
    normalizeAppearance,
    resolveStandings
} = require('../../shared/multiplayer-bingo.cjs');

const copy = value => JSON.parse(JSON.stringify(value));

function shuffledOrder(length) {
    const arr = Array.from({ length: Math.max(0, length) }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateToken() {
    return crypto.randomBytes(12).toString('hex');
}

function defaultState() {
    const starter = defaultPack('default-race');
    return {
        activePackId: starter.id,
        packs: [starter],
        session: {
            hidden: false,
            locked: false,
            focusedCardId: '',
            cards: [],
            claims: {},
            calledPrompts: []
        },
        appearance: defaultAppearance()
    };
}

function sanitizeCard(card) {
    return {
        id: card.id,
        name: card.name,
        color: card.color,
        order: Array.isArray(card.order) ? [...card.order] : [],
        stamped: Array.isArray(card.stamped) ? [...card.stamped] : []
    };
}

module.exports = function createMultiplayerBingoService({ dataDir, onChange = () => {} } = {}) {
    const file = dataDir ? path.join(dataDir, 'multiplayer-bingo.json') : null;

    function normalizeState(raw) {
        const base = defaultState();
        if (!raw || typeof raw !== 'object') return base;
        const packs = Array.isArray(raw.packs) && raw.packs.length
            ? raw.packs.slice(0, 100).map((p, idx) => normalizePack(p, `pack-${idx + 1}`))
            : base.packs;
        // Ensure unique pack IDs
        const seen = new Set();
        const uniquePacks = [];
        for (const p of packs) {
            let id = p.id;
            while (seen.has(id)) id = `${p.id}-${seen.size + 1}`;
            seen.add(id);
            uniquePacks.push({ ...p, id });
        }
        const activePackId = uniquePacks.some(p => p.id === raw.activePackId) ? raw.activePackId : uniquePacks[0].id;
        const rawSession = raw.session && typeof raw.session === 'object' ? raw.session : {};
        const cards = Array.isArray(rawSession.cards)
            ? rawSession.cards.slice(0, 24).map((c, idx) => ({
                id: String(c.id || `card-${idx + 1}`),
                name: String(c.name || `Player ${idx + 1}`).trim().slice(0, 40) || `Player ${idx + 1}`,
                color: String(c.color || MP_BINGO_PLAYER_COLORS[idx % MP_BINGO_PLAYER_COLORS.length]),
                token: String(c.token || generateToken()),
                order: Array.isArray(c.order) ? c.order.map(Number).filter(Number.isInteger) : [],
                stamped: Array.isArray(c.stamped) ? c.stamped.map(Number).filter(Number.isInteger) : []
            }))
            : [];
        const focusedCardId = cards.some(c => c.id === rawSession.focusedCardId) ? String(rawSession.focusedCardId) : '';
        return {
            activePackId,
            packs: uniquePacks,
            session: {
                hidden: Boolean(rawSession.hidden),
                locked: Boolean(rawSession.locked),
                focusedCardId,
                cards,
                claims: rawSession.claims && typeof rawSession.claims === 'object' ? { ...rawSession.claims } : {},
                calledPrompts: Array.isArray(rawSession.calledPrompts) ? [...new Set(rawSession.calledPrompts.map(Number).filter(Number.isInteger))] : []
            },
            appearance: normalizeAppearance(raw.appearance)
        };
    }

    function readDisk() {
        if (!file || !fs.existsSync(file)) return defaultState();
        try {
            return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')));
        } catch {
            return defaultState();
        }
    }

    let state = readDisk();
    let revision = 1;

    function getActivePack() {
        return state.packs.find(p => p.id === state.activePackId) || state.packs[0];
    }

    function getSanitizedState() {
        const activePack = getActivePack();
        return {
            activePackId: state.activePackId,
            activePack: copy(activePack),
            packs: state.packs.map(p => ({ id: p.id, name: p.name, size: p.size, claimMode: p.claimMode, promptCount: p.prompts.length })),
            session: {
                hidden: state.session.hidden,
                locked: state.session.locked,
                focusedCardId: state.session.focusedCardId,
                cards: state.session.cards.map(sanitizeCard),
                claims: copy(state.session.claims),
                calledPrompts: [...(state.session.calledPrompts || [])]
            },
            appearance: copy(state.appearance),
            revision
        };
    }

    function persist(next) {
        state = normalizeState(next);
        revision++;
        if (file) {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const temp = `${file}.tmp`;
            fs.writeFileSync(temp, JSON.stringify(state, null, 2));
            fs.renameSync(temp, file);
        }
        onChange(getSanitizedState());
    }

    return {
        getRevision: () => revision,
        getState: () => ({ ...copy(state), activePack: copy(getActivePack()), revision }),
        getSanitizedState,
        getPublicStatus() {
            const pack = getActivePack();
            const standings = resolveStandings(pack, state.session.cards, state.session.claims);
            const focused = state.session.cards.find(c => c.id === state.session.focusedCardId);
            const leader = standings[0] || null;
            return {
                packId: pack.id,
                packName: pack.name,
                size: pack.size,
                claimMode: pack.claimMode,
                playerCount: state.session.cards.length,
                hidden: state.session.hidden,
                locked: state.session.locked,
                focusedPlayer: focused ? focused.name : '',
                leader: leader ? leader.name : '',
                leaderScore: leader ? leader.stampedCount : 0,
                leaderBingos: leader ? leader.bingoCount : 0,
                standings
            };
        },
        reload() {
            state = readDisk();
            revision++;
            onChange(getSanitizedState());
        },
        reset() {
            persist(defaultState());
            return this.getState();
        },
        savePack(input, idOverride = '') {
            const targetId = idOverride || input?.id || `pack-${crypto.randomBytes(4).toString('hex')}`;
            const pack = normalizePack({ ...input, id: targetId }, targetId);
            const exists = state.packs.some(p => p.id === pack.id);
            if (!exists && state.packs.length >= 100) {
                const err = new Error('Maximum of 100 prompt packs reached');
                err.statusCode = 400;
                throw err;
            }
            const nextPacks = exists
                ? state.packs.map(p => (p.id === pack.id ? pack : p))
                : [...state.packs, pack];
            persist({ ...state, packs: nextPacks });
            return copy(pack);
        },
        deletePack(packId) {
            if (state.packs.length <= 1) {
                const err = new Error('At least one prompt pack must remain');
                err.statusCode = 400;
                throw err;
            }
            if (!state.packs.some(p => p.id === packId)) {
                const err = new Error('Prompt pack not found');
                err.statusCode = 404;
                throw err;
            }
            const nextPacks = state.packs.filter(p => p.id !== packId);
            const activePackId = state.activePackId === packId ? nextPacks[0].id : state.activePackId;
            persist({ ...state, packs: nextPacks, activePackId });
            return this.getState();
        },
        selectPack(packId) {
            const pack = state.packs.find(p => p.id === packId);
            if (!pack) {
                const err = new Error('Prompt pack not found');
                err.statusCode = 404;
                throw err;
            }
            const poolLen = Math.max(pack.size * pack.size, pack.prompts.length);
            const nextCards = state.session.cards.map(c => ({
                ...c,
                stamped: [],
                order: shuffledOrder(poolLen)
            }));
            persist({
                ...state,
                activePackId: pack.id,
                session: {
                    ...state.session,
                    claims: {},
                    calledPrompts: [],
                    cards: nextCards
                }
            });
            return this.getState();
        },
        updateAppearance(patch = {}) {
            persist({
                ...state,
                appearance: normalizeAppearance({ ...state.appearance, ...patch })
            });
            return copy(state.appearance);
        },
        addPlayer({ name, color } = {}) {
            if (state.session.cards.length >= 24) {
                const err = new Error('Maximum of 24 player cards per game');
                err.statusCode = 400;
                throw err;
            }
            const pack = getActivePack();
            const idx = state.session.cards.length;
            const poolLen = Math.max(pack.size * pack.size, pack.prompts.length);
            const card = {
                id: `card-${crypto.randomBytes(4).toString('hex')}`,
                name: String(name || `Player ${idx + 1}`).trim().slice(0, 40) || `Player ${idx + 1}`,
                color: String(color || MP_BINGO_PLAYER_COLORS[idx % MP_BINGO_PLAYER_COLORS.length]),
                token: generateToken(),
                order: shuffledOrder(poolLen),
                stamped: []
            };
            persist({
                ...state,
                session: {
                    ...state.session,
                    cards: [...state.session.cards, card]
                }
            });
            return { card: copy(card), state: this.getState() };
        },
        removePlayer(cardId) {
            const nextCards = state.session.cards.filter(c => c.id !== cardId);
            const nextClaims = {};
            for (const [k, v] of Object.entries(state.session.claims || {})) {
                if (v && v.cardId !== cardId) nextClaims[k] = v;
            }
            const focusedCardId = state.session.focusedCardId === cardId ? '' : state.session.focusedCardId;
            persist({
                ...state,
                session: {
                    ...state.session,
                    cards: nextCards,
                    claims: nextClaims,
                    focusedCardId
                }
            });
            return this.getState();
        },
        regenerateToken(cardId) {
            const target = state.session.cards.find(c => c.id === cardId);
            if (!target) {
                const err = new Error('Player card not found');
                err.statusCode = 404;
                throw err;
            }
            const nextToken = generateToken();
            const nextCards = state.session.cards.map(c => (c.id === cardId ? { ...c, token: nextToken } : c));
            persist({
                ...state,
                session: { ...state.session, cards: nextCards }
            });
            return { card: copy(state.session.cards.find(c => c.id === cardId)), state: this.getState() };
        },
        setFlags(patch = {}) {
            const nextSession = { ...state.session };
            if (patch.hidden !== undefined) nextSession.hidden = Boolean(patch.hidden);
            if (patch.locked !== undefined) nextSession.locked = Boolean(patch.locked);
            if (patch.focusedCardId !== undefined) {
                const id = String(patch.focusedCardId || '');
                nextSession.focusedCardId = id && state.session.cards.some(c => c.id === id) ? id : '';
            }
            persist({ ...state, session: nextSession });
            return this.getState();
        },
        toggleCell(cardId, cellIndex, { isHost = false, forceState = undefined } = {}) {
            const pack = getActivePack();
            if (!isHost && state.session.hidden) {
                const err = new Error('Board is hidden until the host reveals it');
                err.statusCode = 403;
                throw err;
            }
            if (!isHost && state.session.locked) {
                const err = new Error('Board is locked by the host');
                err.statusCode = 403;
                throw err;
            }
            const cardIdx = state.session.cards.findIndex(c => c.id === cardId);
            if (cardIdx < 0) {
                const err = new Error('Player card not found');
                err.statusCode = 404;
                throw err;
            }
            const size = pack.size;
            const total = size * size;
            const cell = Number(cellIndex);
            if (!Number.isInteger(cell) || cell < 0 || cell >= total) {
                const err = new Error('Invalid bingo cell index');
                err.statusCode = 400;
                throw err;
            }
            const centerIdx = size % 2 === 1 ? Math.floor(total / 2) : -1;
            const hasFree = pack.freeSpace && centerIdx >= 0;
            if (hasFree && cell === centerIdx) return this.getState();

            const nextCards = state.session.cards.map(c => ({ ...c, stamped: [...c.stamped] }));
            const card = nextCards[cardIdx];
            const nextClaims = { ...state.session.claims };

            if (pack.claimMode === 'lockout') {
                const poolOffset = hasFree && cell > centerIdx ? cell - 1 : cell;
                const promptIndex = Array.isArray(card.order) && card.order[poolOffset] !== undefined ? card.order[poolOffset] : poolOffset;
                const key = String(promptIndex);
                const existing = nextClaims[key];
                if (existing && existing.cardId !== card.id) {
                    if (!isHost) {
                        const err = new Error('Already claimed by another player');
                        err.statusCode = 409;
                        throw err;
                    }
                    if (forceState === false) delete nextClaims[key];
                    else nextClaims[key] = { cardId: card.id, at: Date.now() };
                } else if (existing && existing.cardId === card.id) {
                    if (forceState !== true) delete nextClaims[key];
                } else if (forceState !== false) {
                    nextClaims[key] = { cardId: card.id, at: Date.now() };
                }
            } else {
                const set = new Set(card.stamped);
                const nextOn = forceState !== undefined ? Boolean(forceState) : !set.has(cell);
                if (nextOn) set.add(cell);
                else set.delete(cell);
                card.stamped = [...set].sort((a, b) => a - b);
            }

            persist({
                ...state,
                session: {
                    ...state.session,
                    cards: nextCards,
                    claims: nextClaims
                }
            });
            return this.getState();
        },
        shuffleAll() {
            const pack = getActivePack();
            const poolLen = Math.max(pack.size * pack.size, pack.prompts.length);
            const nextCards = state.session.cards.map(c => ({
                ...c,
                stamped: [],
                order: shuffledOrder(poolLen)
            }));
            persist({
                ...state,
                session: {
                    ...state.session,
                    claims: {},
                    calledPrompts: [],
                    cards: nextCards
                }
            });
            return this.getState();
        },
        resetBoard() {
            const nextCards = state.session.cards.map(c => ({ ...c, stamped: [] }));
            persist({
                ...state,
                session: {
                    ...state.session,
                    claims: {},
                    calledPrompts: [],
                    cards: nextCards
                }
            });
            return this.getState();
        },
        callPrompt(promptIndex, forceState = undefined) {
            const pack = getActivePack();
            const idx = Number(promptIndex);
            if (!Number.isInteger(idx) || idx < 0 || idx >= pack.prompts.length) {
                const err = new Error('Invalid prompt index');
                err.statusCode = 400;
                throw err;
            }
            const calledSet = new Set(Array.isArray(state.session.calledPrompts) ? state.session.calledPrompts : []);
            const nextCalled = forceState !== undefined ? Boolean(forceState) : !calledSet.has(idx);
            if (nextCalled) calledSet.add(idx);
            else calledSet.delete(idx);

            const size = pack.size;
            const total = size * size;
            const centerIdx = size % 2 === 1 ? Math.floor(total / 2) : -1;
            const hasFree = pack.freeSpace && centerIdx >= 0;
            const playableSlots = hasFree ? total - 1 : total;

            const nextCards = state.session.cards.map(card => {
                const order = Array.isArray(card.order) ? card.order : [];
                const poolPos = order.slice(0, playableSlots).indexOf(idx);
                if (poolPos < 0) return { ...card, stamped: [...card.stamped] };
                const cellIdx = hasFree && poolPos >= centerIdx ? poolPos + 1 : poolPos;
                const set = new Set(card.stamped);
                if (nextCalled) set.add(cellIdx);
                else set.delete(cellIdx);
                return { ...card, stamped: [...set].sort((a, b) => a - b) };
            });

            const nextClaims = { ...state.session.claims };
            if (!nextCalled && pack.claimMode === 'lockout') {
                delete nextClaims[String(idx)];
            }

            persist({
                ...state,
                session: {
                    ...state.session,
                    calledPrompts: [...calledSet].sort((a, b) => a - b),
                    cards: nextCards,
                    claims: nextClaims
                }
            });
            return this.getState();
        },
        findCardByToken(token) {
            const clean = String(token || '').trim();
            if (!clean) return null;
            const card = state.session.cards.find(c => c.token === clean);
            if (!card) return null;
            const pack = getActivePack();
            const safeSession = {
                hidden: state.session.hidden,
                locked: state.session.locked,
                focusedCardId: state.session.focusedCardId,
                claims: copy(state.session.claims),
                cards: state.session.cards.map(c => ({
                    id: c.id,
                    name: c.name,
                    color: c.color,
                    order: c.id === card.id ? [...c.order] : [],
                    stamped: c.id === card.id ? [...c.stamped] : []
                }))
            };
            return {
                pack: copy(pack),
                cardId: card.id,
                session: safeSession,
                appearance: copy(state.appearance)
            };
        }
    };
};
