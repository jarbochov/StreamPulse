import puppeteer from 'puppeteer';

const baseUrl = (process.env.STREAMPULSE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

try {
    await page.goto(`${baseUrl}/config-editor.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#config-editor details');
    const configHasNoThemeControls = await page.$('#cfg-theme-font') === null;
    if (!configHasNoThemeControls) throw new Error('Config Editor still exposes Theme controls');

    await page.evaluate(() => {
        const details = [...document.querySelectorAll('#config-editor details')];
        details.forEach(section => { section.open = false; });
        const general = details.find(section => section.querySelector('summary')?.textContent.startsWith('General'));
        general.open = true;
    });
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    const generalStayedOpen = await page.evaluate(() => [...document.querySelectorAll('#config-editor details')]
        .find(section => section.querySelector('summary')?.textContent.startsWith('General'))?.open);
    if (!generalStayedOpen) throw new Error('Config Editor did not retain its expanded section');

    await page.goto(`${baseUrl}/credits-editor.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#cfg-order-highlights-source');
    await page.select('#cfg-order-highlights-source', 'manual');
    const manualQuoteKeysVisible = await page.$eval('#cfg-highlights-selection', element => getComputedStyle(element).display !== 'none');
    if (!manualQuoteKeysVisible) throw new Error('Manual Quote keys are hidden');

    await page.goto(`${baseUrl}/theme-editor.html`, { waitUntil: 'networkidle0', timeout: 30000 });
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

    await page.goto(`${baseUrl}/overlay-url-wizard.html`, { waitUntil: 'networkidle0', timeout: 30000 });
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
