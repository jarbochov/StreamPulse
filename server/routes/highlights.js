const { readRequestBody, sendJson, sendError } = require('./helpers');

function createHighlightsRoutes({
    getHighlights = () => [],
    setHighlights = () => {},
    saveHighlights = () => {},
    getChatLog = () => [],
    getChatData = () => ({}),
    getClipCandidateConfig = () => ({}),
    clipSessionOverrideForName = () => null,
    addClipCandidate = () => null,
    buildChatPdfHtml = () => '',
    generatePdf = async () => Buffer.from(''),
    localDateTimeStr = (d) => String(d || '')
} = {}) {
    return async function handleHighlightsRoutes(req, res, url, pathname) {
        if (pathname === '/api/highlights/pin-last' && req.method === 'POST') {
            const chatLog = getChatLog() || [];
            if (chatLog.length === 0) {
                sendError(res, 'No chat messages yet', 404);
                return true;
            }
            const last = chatLog[chatLog.length - 1];
            const highlights = getHighlights() || [];
            const already = highlights.some(h => h.ts === last.ts && h.user === last.user);
            if (already) {
                sendJson(res, { status: 'already_pinned', user: last.user, message: last.message });
                return true;
            }
            const chatData = getChatData() || {};
            const sessionName = 'chat-' + localDateTimeStr(chatData.startedAt) + '.json';
            highlights.push({
                ts: last.ts,
                user: last.user,
                message: last.message || '',
                messageHtml: last.messageHtml || '',
                avatar: last.avatar || null,
                session: sessionName,
                pinnedAt: Date.now()
            });
            saveHighlights();
            console.log(`[Highlights] Pinned last message from ${last.user}`);
            sendJson(res, { status: 'pinned', user: last.user, message: last.message });
            return true;
        }

        if (pathname === '/api/highlights/export' && req.method === 'GET') {
            const format = url.searchParams.get('format');
            const sessionFilter = url.searchParams.get('session');
            const userFilter = (url.searchParams.get('user') || '').toLowerCase();
            const rawQuery = (url.searchParams.get('q') || '').trim().toLowerCase();
            let data = getHighlights() || [];
            if (sessionFilter) {
                data = data.filter(h => h.session === sessionFilter);
            }
            if (userFilter) {
                data = data.filter(h => (h.user || '').toLowerCase() === userFilter);
            }
            if (rawQuery) {
                data = data.filter(h =>
                    (h.user || '').toLowerCase().includes(rawQuery) ||
                    (h.message || '').toLowerCase().includes(rawQuery)
                );
            }

            const formatTime = (ts) => {
                if (!ts) return '';
                const d = new Date(ts);
                return d.toLocaleString();
            };

            const safeFilename = sessionFilter
                ? 'highlights-' + sessionFilter.replace(/[^a-zA-Z0-9_-]/g, '_')
                : 'highlights';

            if (format === 'tsv') {
                const header = 'Timestamp\tUser\tMessage\tSession\tPinned At';
                const rows = data.map(h =>
                    `${formatTime(h.ts)}\t${h.user}\t${(h.message || '').replace(/\t/g, ' ')}\t${h.session || ''}\t${formatTime(h.pinnedAt)}`
                );
                const content = header + '\n' + rows.join('\n');
                res.writeHead(200, {
                    'Content-Type': 'text/tab-separated-values',
                    'Content-Disposition': `attachment; filename="${safeFilename}.tsv"`
                });
                res.end(content);
                return true;
            }

            if (format === 'txt') {
                const groups = {};
                data.forEach(h => {
                    const s = h.session || 'unknown';
                    if (!groups[s]) groups[s] = [];
                    groups[s].push(h);
                });

                let content = 'Highlights Export\n=================\n';
                for (const [session, items] of Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))) {
                    content += `\n--- Session: ${session} ---\n\n`;
                    for (const h of items) {
                        const time = formatTime(h.ts);
                        const timeStr = time ? time.split(', ').pop() || time : '';
                        content += `[${timeStr}] ${h.user}: ${h.message || ''}\n`;
                    }
                }
                res.writeHead(200, {
                    'Content-Type': 'text/plain',
                    'Content-Disposition': `attachment; filename="${safeFilename}.txt"`
                });
                res.end(content);
                return true;
            }

            if (format === 'pdf') {
                const title = sessionFilter
                    ? `Highlights — ${sessionFilter}`
                    : 'Highlights Export';
                try {
                    const htmlContent = buildChatPdfHtml(title, `${data.length} highlights`, data);
                    const pdfBuffer = await generatePdf(htmlContent);
                    res.writeHead(200, {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `attachment; filename="${safeFilename}.pdf"`,
                        'Content-Length': pdfBuffer.length
                    });
                    res.end(pdfBuffer);
                } catch (err) {
                    console.error('[PDF] Highlights export failed:', err.message);
                    sendError(res, 'PDF generation failed: ' + err.message, 500);
                }
                return true;
            }

            sendError(res, 'Invalid format. Use: tsv, txt, or pdf', 400);
            return true;
        }

        if (pathname === '/api/highlights') {
            if (req.method === 'GET') {
                const sessionFilter = url.searchParams.get('session');
                let result = getHighlights() || [];
                if (sessionFilter) {
                    result = result.filter(h => h.session === sessionFilter);
                }
                sendJson(res, result);
                return true;
            }

            if (req.method === 'POST') {
                try {
                    const body = JSON.parse(await readRequestBody(req) || '{}');
                    const { ts, user, message, messageHtml, avatar, session } = body;
                    if (!ts || !user) throw new Error('Missing ts or user');
                    const highlights = getHighlights() || [];
                    highlights.push({
                        ts,
                        user,
                        message: message || '',
                        messageHtml: messageHtml || '',
                        avatar: avatar || null,
                        session: session || 'unknown',
                        pinnedAt: Date.now()
                    });
                    saveHighlights();
                    let candidate = null;
                    const clipConfig = getClipCandidateConfig() || {};
                    if (clipConfig.enabled && clipConfig.include_highlights) {
                        const sessionOverride = clipSessionOverrideForName(session);
                        if (sessionOverride) {
                            candidate = addClipCandidate(
                                'highlighted-chat',
                                { user, message: message || '' },
                                Number(ts),
                                0.9,
                                sessionOverride,
                                `${sessionOverride.session}:highlight:${ts}:${user}`
                            );
                        }
                    }
                    console.log(`[Highlights] Pinned message from ${user}`);
                    sendJson(res, { status: 'pinned', count: highlights.length, candidateId: candidate?.id || null });
                } catch (err) {
                    sendError(res, err, 400);
                }
                return true;
            }

            if (req.method === 'DELETE') {
                try {
                    const body = JSON.parse(await readRequestBody(req) || '{}');
                    const { ts, user } = body;
                    if (!ts || !user) throw new Error('Missing ts or user');
                    let highlights = getHighlights() || [];
                    const before = highlights.length;
                    highlights = highlights.filter(h => !(h.ts === ts && h.user === user));
                    setHighlights(highlights);
                    saveHighlights();
                    console.log(`[Highlights] Unpinned message from ${user} (${before - highlights.length} removed)`);
                    sendJson(res, { status: 'unpinned', count: highlights.length });
                } catch (err) {
                    sendError(res, err, 400);
                }
                return true;
            }
        }

        return false;
    };
}

module.exports = {
    createHighlightsRoutes
};
