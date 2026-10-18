import puppeteer from 'puppeteer';

const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('dialog', async dialog => { await dialog.accept(); });

try {
    await page.goto(`${baseUrl}/config-editor.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#config-editor .tab-btn');
    const configHasNoThemeControls = await page.$('#cfg-theme-font') === null;
    if (!configHasNoThemeControls) throw new Error('Config Editor still exposes Theme controls');

    await page.evaluate(() => {
        const btn = document.querySelector('.tab-btn[data-tab="lifecycle"]');
        if (btn) btn.click();
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#config-editor .tab-btn');
    const lifecycleStayedActive = await page.evaluate(() => document.querySelector('.tab-btn[data-tab="lifecycle"]')?.classList.contains('active'));
    if (!lifecycleStayedActive) throw new Error('Config Editor did not retain its active tab');

    await page.goto(`${baseUrl}/credits-editor.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#cfg-order-highlights-source');
    await page.select('#cfg-order-highlights-source', 'manual');
    const manualQuoteKeysVisible = await page.$eval('#cfg-highlights-selection', element => getComputedStyle(element).display !== 'none');
    if (!manualQuoteKeysVisible) throw new Error('Manual Quote keys are hidden');

    await page.goto(`${baseUrl}/theme-editor.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#outline-enabled');
    const themeControls = await page.evaluate(() => ({
        pickers: document.querySelectorAll('input[type="color"]').length,
        hasOutlineToggle: document.querySelector('#outline-enabled') instanceof HTMLInputElement,
        hasGoalBackground: document.querySelector('#goal-background') instanceof HTMLInputElement,
        hasViewerBackground: document.querySelector('#viewer-background') instanceof HTMLInputElement
    }));
    if (themeControls.pickers !== 6 || !themeControls.hasOutlineToggle || !themeControls.hasGoalBackground || !themeControls.hasViewerBackground) {
        throw new Error('Theme Editor is missing expected controls');
    }

    await page.goto(`${baseUrl}/overlay-url-wizard.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#credits-url');
    await page.select('#credits-timing', 'duration');
    await page.$eval('#credits-duration', input => {
        input.value = '82';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const creditsUrl = await page.$eval('#credits-url', element => element.href);
    if (new URL(creditsUrl).searchParams.get('duration') !== '82') {
        throw new Error('Overlay URL Wizard did not apply the Credits duration override');
    }
    const focusedCredits = await page.evaluate(() => ({
        credits: !document.querySelector('.overlay-config[data-overlay="credits"]').hidden,
        goals: document.querySelector('.overlay-config[data-overlay="goals"]').hidden,
        viewers: document.querySelector('.overlay-config[data-overlay="viewers"]').hidden
    }));
    if (!focusedCredits.credits || !focusedCredits.goals || !focusedCredits.viewers) {
        throw new Error('Overlay URL Wizard did not start with a focused Credits workflow');
    }
    await page.click('[data-overlay-choice="goals"]');
    const focusedGoals = await page.evaluate(() => ({
        credits: document.querySelector('.overlay-config[data-overlay="credits"]').hidden,
        goals: !document.querySelector('.overlay-config[data-overlay="goals"]').hidden,
        viewers: document.querySelector('.overlay-config[data-overlay="viewers"]').hidden
    }));
    if (!focusedGoals.credits || !focusedGoals.goals || !focusedGoals.viewers) {
        throw new Error('Overlay URL Wizard did not switch to the Goals workflow');
    }

    console.log('Editor smoke test passed.');
} finally {
    await browser.close();
}
