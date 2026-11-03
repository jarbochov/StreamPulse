async function generatePdf(htmlContent) {
    const puppeteer = require('puppeteer'); // loaded lazily; only PDF export needs it
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(async () => {
            /* global document */
            const images = Array.from(document.images || []);
            if (!images.length) return;

            await Promise.race([
                Promise.all(images.map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise(resolve => {
                        const finish = () => resolve();
                        img.addEventListener('load', finish, { once: true });
                        img.addEventListener('error', finish, { once: true });
                    });
                })),
                new Promise(resolve => setTimeout(resolve, 1500))
            ]);
        });
        const pdf = await page.pdf({ format: 'A4', margin: { top: '40px', bottom: '40px', left: '40px', right: '40px' }, printBackground: true });
        return pdf;
    } finally {
        await browser.close();
    }
}

module.exports = {
    generatePdf
};
