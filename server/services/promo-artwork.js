const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { safeWriteFileSync } = require('../routes/helpers');

const fail = (message, status = 502) => Object.assign(new Error(message), { status });
const imageIdPattern = /^[a-zA-Z0-9_]{1,100}$/;

function createPromoArtworkService({ assetsDir, getTwitchClientId, getAppToken, fetchImpl = fetch }) {
    async function query(body) {
        const clientId = getTwitchClientId();
        if (!clientId) throw fail('Configure Twitch client credentials in Settings to search IGDB artwork.', 409);
        const token = await getAppToken();
        if (!token) throw fail('Twitch app authentication is unavailable. Check your Twitch client credentials.', 409);
        const response = await fetchImpl('https://api.igdb.com/v4/games', {
            method: 'POST',
            headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
            body, signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw fail(`IGDB artwork lookup failed (${response.status}). Check your Twitch credentials or try again.`);
        const data = await response.json();
        if (!Array.isArray(data)) throw fail('IGDB returned an invalid artwork response.');
        return data;
    }
    async function gameMedia(id) {
        if (!/^[1-9][0-9]{0,10}$/.test(String(id))) throw fail('Choose a valid IGDB game.', 400);
        const [game] = await query(`where id = ${id}; fields name,cover.image_id,artworks.image_id,screenshots.image_id; limit 1;`);
        if (!game) throw fail('Game not found on IGDB.', 404);
        const images = [];
        const add = (item, kind) => {
            if (!imageIdPattern.test(item?.image_id || '') || images.some(image => image.imageId === item.image_id)) return;
            images.push({ imageId: item.image_id, kind, url: `https://images.igdb.com/igdb/image/upload/t_screenshot_med/${item.image_id}.jpg` });
        };
        add(game.cover, 'cover');
        for (const image of (game.artworks || []).slice(0, 40)) add(image, 'artwork');
        for (const image of (game.screenshots || []).slice(0, 40)) add(image, 'screenshot');
        return { id: String(id), name: game.name || 'Game', images };
    }
    return {
        async search(input) {
            const search = String(input || '').trim().slice(0, 100).replace(/["\\;\r\n]/g, ' ');
            if (search.length < 2) throw fail('Enter at least two characters to search games.', 400);
            const games = await query(`search "${search}"; fields name,first_release_date,cover.image_id,version_parent; limit 12;`);
            return { results: games.filter(game => !game.version_parent).map(game => ({
                id: String(game.id), name: game.name || '',
                year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : '',
                cover: imageIdPattern.test(game.cover?.image_id || '') ? `https://images.igdb.com/igdb/image/upload/t_cover_small/${game.cover.image_id}.jpg` : ''
            })) };
        },
        gameMedia,
        async importImage(gameId, imageId) {
            if (!imageIdPattern.test(String(imageId || ''))) throw fail('Choose a valid IGDB image.', 400);
            const game = await gameMedia(gameId);
            const image = game.images.find(item => item.imageId === imageId);
            if (!image) throw fail('That image does not belong to the selected IGDB game.', 400);
            const response = await fetchImpl(`https://images.igdb.com/igdb/image/upload/t_original/${imageId}.jpg`, {
                redirect: 'error', headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif' }, signal: AbortSignal.timeout(20000)
            });
            if (!response.ok) throw fail(`IGDB image download failed (${response.status}).`);
            const max = 20 * 1024 * 1024, chunks = [];
            let bytes = 0;
            if (Number(response.headers.get('content-length')) > max) {
                await response.body?.cancel();
                throw fail('This IGDB image exceeds the 20 MB import limit.', 413);
            }
            for await (const chunk of response.body) {
                bytes += chunk.length;
                if (bytes > max) throw fail('This IGDB image exceeds the 20 MB import limit.', 413);
                chunks.push(chunk);
            }
            const data = Buffer.concat(chunks);
            const ext = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff ? 'jpg'
                : data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
                    : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
                        : /^GIF8[79]a$/.test(data.toString('ascii', 0, 6)) ? 'gif'
                            : data.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(data.toString('ascii', 8, 32)) ? 'avif' : '';
            if (!ext) throw fail('IGDB returned an unsupported image. Choose another artwork or try again.');
            const label = game.name.replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 70) || 'game';
            const name = `igdb-${randomUUID()}-${label}-${image.kind}.${ext}`;
            fs.mkdirSync(assetsDir, { recursive: true });
            safeWriteFileSync(path.join(assetsDir, name), data);
            return { url: `/custom-overlay-assets/${encodeURIComponent(name)}`, name, game: game.name, kind: image.kind };
        }
    };
}

module.exports = { createPromoArtworkService };
