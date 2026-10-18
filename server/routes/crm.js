const { readRequestBody, sendJson, sendError } = require('./helpers');

function createCrmRoutes({ crmService }) {
    return async function handleCrmRoutes(req, res, url, pathname) {
        if (pathname === '/api/chatters' && req.method === 'GET') {
            const query = (url.searchParams.get('q') || '').toLowerCase().trim();
            const tagFilter = (url.searchParams.get('tag') || '').toLowerCase().trim();
            const segmentFilter = (url.searchParams.get('segment') || url.searchParams.get('filter') || '').toLowerCase().trim();
            const limit = parseInt(url.searchParams.get('limit'), 10) || 200;
            const result = crmService.getChattersList({ query, tagFilter, segmentFilter, limit });
            sendJson(res, result);
            return true;
        }

        if (pathname === '/api/chatters/export' && req.method === 'GET') {
            const query = (url.searchParams.get('q') || '').toLowerCase().trim();
            const tagFilter = (url.searchParams.get('tag') || '').toLowerCase().trim();
            const segmentFilter = (url.searchParams.get('segment') || url.searchParams.get('filter') || '').toLowerCase().trim();
            const includeNotes = url.searchParams.get('includeNotes') === 'true';
            const result = crmService.getChattersList({ query, tagFilter, segmentFilter, limit: 10000 });

            const escCsv = val => `"${String(val ?? '').replace(/"/g, '""')}"`;
            const headers = ['Username', 'Display Name', 'Attendance (Sessions)', 'Total Messages', 'First Seen', 'Last Seen', 'VIP', 'Mod', 'Subscriber', 'Sub Months', 'Pronouns', 'Tags'];
            if (includeNotes) headers.push('Private Notes');

            let csv = headers.join(',') + '\n';
            for (const c of result.chatters) {
                const row = [
                    escCsv(c.username),
                    escCsv(c.chatname || c.username),
                    c.sessionsAttended || 0,
                    c.totalMessages || 0,
                    escCsv(c.firstSeen || ''),
                    escCsv(c.lastSeen || ''),
                    c.isVip ? 'Yes' : 'No',
                    c.isMod ? 'Yes' : 'No',
                    c.isSubscriber ? 'Yes' : 'No',
                    c.subMonths || 0,
                    escCsv(c.pronouns || ''),
                    escCsv((c.tags || []).join('; '))
                ];
                if (includeNotes) row.push(escCsv(c.notes || ''));
                csv += row.join(',') + '\n';
            }

            const filename = `community-roster-${new Date().toISOString().slice(0, 10)}.csv`;
            res.writeHead(200, {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`
            });
            res.end(csv);
            return true;
        }

        const mChatterNotes = pathname.match(/^\/api\/chatters\/([^/]+)\/notes$/);
        if (mChatterNotes && req.method === 'POST') {
            const username = decodeURIComponent(mChatterNotes[1]);
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const dossier = crmService.updateChatterNotes(username, body);
                sendJson(res, dossier);
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        const mChatter = pathname.match(/^\/api\/chatters\/([^/]+)$/);
        if (mChatter && req.method === 'GET') {
            const username = decodeURIComponent(mChatter[1]);
            const dossier = crmService.getChatterDossier(username);
            if (!dossier) {
                sendJson(res, { error: 'Chatter not found' }, 404);
                return true;
            }
            sendJson(res, dossier);
            return true;
        }

        return false;
    };
}

module.exports = {
    createCrmRoutes
};
