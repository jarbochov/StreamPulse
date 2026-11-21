'use strict';
/* global window */

const path = require('path');

async function renderPatternStamps(profiles, { signal } = {}) {
    if (signal?.aborted) throw new Error('Pattern rendering cancelled');
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const abort = () => { browser.close().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        if (signal?.aborted) throw new Error('Pattern rendering cancelled');
        const page = await browser.newPage();
        const publicDir = path.resolve(__dirname, '../../public/js');
        await page.addScriptTag({ path: path.join(publicDir, 'pattern-catalog.js') });
        await page.addScriptTag({ path: path.join(publicDir, 'patterns-shared.js') });
        await page.addScriptTag({ path: path.join(publicDir, 'obs-patterns/bake.js') });
        return await page.evaluate(items => items.map(item => window.StreamPulsePatternBake.draw(item)), profiles);
    } finally {
        signal?.removeEventListener('abort', abort);
        await browser.close().catch(() => {});
    }
}

module.exports = { renderPatternStamps };
