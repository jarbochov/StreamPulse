'use strict';
/* global window */

const path = require('path');

let sharedBrowserPromise = null;
let activeJobs = 0;

async function getSharedBrowser() {
    if (sharedBrowserPromise) {
        try {
            const existing = await sharedBrowserPromise;
            if (existing.connected !== false) return existing;
        } catch { /* relaunch below */ }
        sharedBrowserPromise = null;
    }
    const puppeteer = require('puppeteer');
    sharedBrowserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const browser = await sharedBrowserPromise;
        browser.once('disconnected', () => {
            if (sharedBrowserPromise) sharedBrowserPromise = null;
        });
        return browser;
    } catch (err) {
        sharedBrowserPromise = null;
        throw err;
    }
}

async function releaseSharedBrowser() {
    if (activeJobs > 0 || !sharedBrowserPromise) return;
    const p = sharedBrowserPromise;
    sharedBrowserPromise = null;
    try {
        const b = await p;
        await b.close();
    } catch { /* ignore close error */ }
}

async function renderPatternStamps(profiles, { signal } = {}) {
    if (signal?.aborted) throw new Error('Pattern rendering cancelled');
    activeJobs++;
    let page = null;
    const abort = () => {
        if (page) page.close().catch(() => {});
        if (activeJobs <= 1) {
            const p = sharedBrowserPromise;
            sharedBrowserPromise = null;
            if (p) p.then(b => b.close()).catch(() => {});
        }
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        const browser = await getSharedBrowser();
        if (signal?.aborted) throw new Error('Pattern rendering cancelled');
        page = await browser.newPage();
        const publicDir = path.resolve(__dirname, '../../public/js');
        await page.addScriptTag({ path: path.join(publicDir, 'pattern-catalog.js') });
        await page.addScriptTag({ path: path.join(publicDir, 'patterns-shared.js') });
        await page.addScriptTag({ path: path.join(publicDir, 'obs-patterns/bake.js') });
        return await page.evaluate(items => items.map(item => window.StreamPulsePatternBake.draw(item)), profiles);
    } finally {
        signal?.removeEventListener('abort', abort);
        if (page) await page.close().catch(() => {});
        activeJobs = Math.max(0, activeJobs - 1);
        await releaseSharedBrowser();
    }
}

module.exports = { renderPatternStamps };
