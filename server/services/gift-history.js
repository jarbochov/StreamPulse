'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { isDeepStrictEqual } = require('util');

const clone = value => JSON.parse(JSON.stringify(value));
function fail(message, status = 400) {
    throw Object.assign(new Error(message), { status });
}

function persistCorrection(files, id, backup) {
    const staged = files.map(file => ({
        ...file, temp: `${file.path}.${id}.tmp`,
        original: fs.existsSync(file.path) ? fs.readFileSync(file.path) : null
    }));
    let applied = 0;
    try {
        for (const file of staged) fs.writeFileSync(file.temp, JSON.stringify(file.data, null, 2), { flag: 'wx' });
        for (const file of staged) {
            fs.renameSync(file.temp, file.path);
            applied++;
        }
    } catch (error) {
        try {
            for (const file of staged.slice(0, applied).reverse()) {
                if (file.original === null) fs.unlinkSync(file.path);
                else {
                    fs.writeFileSync(file.temp, file.original, { flag: 'wx' });
                    fs.renameSync(file.temp, file.path);
                }
            }
        } catch {
            throw new Error(`Gift correction rollback failed; recover using ${backup}`, { cause: error });
        }
        throw error;
    } finally {
        for (const file of staged) fs.rmSync(file.temp, { force: true });
    }
}

function correctGiftAttribution({ dataDir, liveChatPath, statsPath, chat, stats, reason, from, to, recipient, timestamp, day, count, expected, dryRun = false }) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) fail('A correction reason is required (maximum 500 characters)');
    for (const value of [from, to, recipient]) {
        if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 100) fail('from, to and recipient must be names of 1-100 characters');
    }
    if (from.toLowerCase() === to.toLowerCase()) fail('from and to must identify different gifters');
    if (typeof dryRun !== 'boolean') fail('dryRun must be a boolean');
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) fail('timestamp must identify the original gift');
    if (!Number.isSafeInteger(count) || count < 1) fail('count must be a positive integer');
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
        || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) fail('day must be a valid YYYY-MM-DD stats bucket');
    if (!chat.startedAt) fail('No current session to correct', 409);
    const gifts = chat.giftSubs || [];
    const matches = gifts.filter(gift => (gift.gifter || gift.chatname) === from && gift.timestamp === timestamp);
    if (matches.length !== 1) fail('A unique matching current-session gift was not found', 404);
    const gift = matches[0];
    const source = stats.giftSubs?.[from];
    const target = stats.giftSubs?.[to] || null;
    const current = { startedAt: chat.startedAt, gift, sourceStats: source || null, targetStats: target };
    if (!isDeepStrictEqual(expected, clone(current))) fail('Gift data changed; reload session and stats before correcting it', 409);
    if (Math.max(1, Number(gift.count) || 1) !== count) fail('count must match the complete current-session gift entry');
    if (!Number.isSafeInteger(source?.days?.[day]) || source.days[day] < count) fail('Source stats bucket does not contain this gift count');
    if (Object.keys(stats.giftSubs || {}).some(name => name !== to && name.toLowerCase() === to.toLowerCase())) fail('Use the exact existing target stats name');
    const targetGifts = gifts.filter(item => item !== gift && (item.gifter || item.chatname).toLowerCase() === to.toLowerCase());
    if (targetGifts.length > 1 || (targetGifts[0] && (targetGifts[0].gifter || targetGifts[0].chatname) !== to)) fail('Target session attribution is ambiguous');
    const existing = targetGifts[0];
    if (existing && (!Number.isSafeInteger(existing.count) || existing.count < 1)) fail('Invalid target session gift count');
    if (target?.days?.[day] !== undefined && (!Number.isSafeInteger(target.days[day]) || target.days[day] < 0)) fail('Invalid target stats bucket');
    const avatar = to.toLowerCase() === 'anonymous' ? null : existing?.chatimg || target?.chatimg || chat.chatters?.[to]?.chatimg || null;
    const sessionGift = { ...(existing || gift), chatname: to, gifter: to, recipient, chatimg: avatar, count: (existing?.count || 0) + count };
    const nextGifts = gifts.flatMap(item => item === gift ? (existing ? [] : [sessionGift]) : item === existing ? [sessionGift] : [item]);
    const sourceStats = { ...source, days: { ...source.days, [day]: source.days[day] - count } };
    if (!sourceStats.days[day]) delete sourceStats.days[day];
    const eventAt = new Date(timestamp).toISOString();
    const targetStats = {
        ...(target || {}), chatimg: avatar,
        firstSeen: target?.firstSeen && target.firstSeen < eventAt ? target.firstSeen : eventAt,
        lastSeen: target?.lastSeen && target.lastSeen > eventAt ? target.lastSeen : eventAt,
        days: { ...(target?.days || {}), [day]: (target?.days?.[day] || 0) + count }
    };
    const giftStats = { ...stats.giftSubs, [from]: sourceStats, [to]: targetStats };
    if (!Object.values(sourceStats.days).some(value => Number(value) > 0)) delete giftStats[from];
    const at = new Date().toISOString();
    const nextChat = { ...chat, giftSubs: nextGifts, lastUpdated: at };
    const nextStats = { ...stats, giftSubs: giftStats };
    const result = {
        ok: true, dryRun, replayed: false, backup: null, from, to, recipient, day, count,
        sessionGift, sourceStats: giftStats[from] || null, targetStats
    };
    if (!dryRun) {
        const id = randomUUID();
        result.backup = path.join('backups', `gift-attribution-repair-${id}.json`);
        fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
        fs.writeFileSync(path.join(dataDir, result.backup), JSON.stringify({
            at, reason: reason.trim(), from, to, recipient, day, count,
            original: { chat, stats }, corrected: { sessionGift, sourceStats: result.sourceStats, targetStats }
        }), { flag: 'wx' });
        persistCorrection([{ path: statsPath, data: nextStats }, { path: liveChatPath, data: nextChat }], id, result.backup);
    }
    return { nextChat, nextStats, result };
}

module.exports = { correctGiftAttribution };
