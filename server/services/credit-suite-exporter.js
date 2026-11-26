'use strict';
/* global window, document */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const AdmZip = require('adm-zip');

const EXPORT_FORMATS = Object.freeze({
    mp4: { ext: '.mp4', mime: 'video/mp4', label: 'MP4 (H.264)', alpha: false, needsFfmpeg: true },
    'webm-alpha': { ext: '.webm', mime: 'video/webm', label: 'WebM (VP9 + Alpha)', alpha: true, needsFfmpeg: true },
    'prores-alpha': { ext: '.mov', mime: 'video/quicktime', label: 'ProRes 4444 (.mov + Alpha)', alpha: true, needsFfmpeg: true },
    'png-sequence': { ext: '.zip', mime: 'application/zip', label: 'PNG Frame Sequence (.zip)', alpha: true, needsFfmpeg: false },
    'full-png': { ext: '.png', mime: 'image/png', label: 'Full Tall Credits (.png)', alpha: true, needsFfmpeg: false },
    'section-pngs': { ext: '.zip', mime: 'application/zip', label: 'Section PNGs Bundle (.zip)', alpha: true, needsFfmpeg: false }
});

function detectFfmpegCapabilities() {
    const candidates = [process.env.FFMPEG_PATH, 'ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].filter(Boolean);
    for (const bin of candidates) {
        try {
            const verOut = execFileSync(bin, ['-version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
            const encodersOut = execFileSync(bin, ['-encoders'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
            return {
                available: true,
                path: bin,
                version: (verOut.split('\n')[0] || '').trim(),
                encoders: {
                    libx264: /\blibx264\b/.test(encodersOut),
                    libvpxVp9: /\blibvpx-vp9\b/.test(encodersOut),
                    proresKs: /\bprores_ks\b/.test(encodersOut)
                }
            };
        } catch { /* try next candidate */ }
    }
    return {
        available: false,
        path: '',
        version: '',
        encoders: { libx264: false, libvpxVp9: false, proresKs: false }
    };
}

function slugify(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'credits';
}

function createCreditSuiteExporter(options = {}) {
    const exportsDir = options.exportsDir || path.resolve(__dirname, '../../data/credit-suite/exports');
    const getBaseUrl = typeof options.getBaseUrl === 'function' ? options.getBaseUrl : () => 'http://127.0.0.1:3000';
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    let cachedCaps = null;
    const jobs = new Map();

    function getCapabilities(forceRefresh = false) {
        if (!cachedCaps || forceRefresh) {
            cachedCaps = detectFfmpegCapabilities();
        }
        return {
            ffmpeg: cachedCaps,
            formats: EXPORT_FORMATS
        };
    }

    function serializeJob(job) {
        if (!job) return null;
        return {
            id: job.id,
            projectId: job.projectId,
            projectName: job.projectName,
            format: job.format,
            status: job.status,
            phase: job.phase,
            percent: job.percent,
            frame: job.frame,
            totalFrames: job.totalFrames,
            etaSec: job.etaSec,
            fileName: job.fileName,
            fileSize: job.fileSize,
            error: job.error,
            createdAt: job.createdAt,
            finishedAt: job.finishedAt,
            downloadUrl: job.status === 'done' ? `/api/credit-suite/export/${encodeURIComponent(job.id)}/download` : ''
        };
    }

    function emitProgress(job) {
        onProgress(serializeJob(job));
    }

    function getJob(id) {
        return serializeJob(jobs.get(id));
    }

    function getJobFile(id) {
        const job = jobs.get(id);
        if (!job || job.status !== 'done' || !job.filePath || !fs.existsSync(job.filePath)) return null;
        const spec = EXPORT_FORMATS[job.format] || EXPORT_FORMATS.mp4;
        return { filePath: job.filePath, fileName: job.fileName, mime: spec.mime };
    }

    function cancelJob(id) {
        const job = jobs.get(id);
        if (!job) return false;
        if (job.status === 'running' || job.status === 'queued') {
            job.cancelled = true;
            job.status = 'cancelled';
            job.phase = 'Cancelled';
            try { job.ffmpegProc?.kill('SIGKILL'); } catch {}
            emitProgress(job);
            return true;
        }
        return false;
    }

    function pruneOldExports() {
        try {
            fs.mkdirSync(exportsDir, { recursive: true });
            const entries = fs.readdirSync(exportsDir)
                .map(name => ({ name, full: path.join(exportsDir, name), mtime: fs.statSync(path.join(exportsDir, name)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime);
            for (const stale of entries.slice(20)) {
                try { fs.unlinkSync(stale.full); } catch {}
            }
        } catch { /* ignore */ }
    }

    function buildFfmpegArgs(format, fps, outPath) {
        const base = ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', '-'];
        if (format === 'mp4') {
            return [
                ...base,
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '18',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                outPath
            ];
        }
        if (format === 'webm-alpha') {
            return [
                ...base,
                '-c:v', 'libvpx-vp9',
                '-pix_fmt', 'yuva420p',
                '-auto-alt-ref', '0',
                '-b:v', '0',
                '-crf', '24',
                '-deadline', 'good',
                '-cpu-used', '3',
                outPath
            ];
        }
        if (format === 'prores-alpha') {
            return [
                ...base,
                '-c:v', 'prores_ks',
                '-profile:v', '4444',
                '-vendor', 'apl0',
                '-bits_per_mb', '8000',
                '-pix_fmt', 'yuva444p10le',
                outPath
            ];
        }
        throw new Error(`Unsupported FFmpeg format "${format}"`);
    }

    async function runExportJob(job, project, opts) {
        fs.mkdirSync(exportsDir, { recursive: true });
        pruneOldExports();

        const format = job.format;
        const spec = EXPORT_FORMATS[format];
        const caps = getCapabilities().ffmpeg;
        if (spec.needsFfmpeg && !caps.available) {
            throw new Error('FFmpeg was not found on this system. Install FFmpeg (e.g. brew install ffmpeg) to export video files.');
        }

        const width = Math.max(320, Math.min(3840, Math.round(Number(opts.width) || project.canvas?.width || 1920)));
        const height = Math.max(240, Math.min(2160, Math.round(Number(opts.height) || project.canvas?.height || 1080)));
        const fps = [24, 30, 60].includes(Number(opts.fps)) ? Number(opts.fps) : (project.canvas?.fps || 30);
        const bgOverride = opts.bgOverride || (spec.alpha && opts.transparent ? 'transparent' : '');
        const omitBackground = Boolean(bgOverride === 'transparent' || (spec.alpha && (project.background?.type === 'transparent' || opts.transparent)));

        const puppeteer = require('puppeteer');
        let browser = null;
        let page = null;

        try {
            job.status = 'running';
            job.phase = 'Launching headless Chromium renderer';
            emitProgress(job);

            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
            });
            page = await browser.newPage();
            await page.setViewport({ width, height, deviceScaleFactor: 1 });

            const params = new URLSearchParams({
                project: project.id,
                export: '1',
                w: String(width),
                h: String(height)
            });
            if (bgOverride) params.set('bg', bgOverride);
            if (opts.chromaColor) params.set('chroma', opts.chromaColor);
            if (format === 'full-png' || format === 'section-pngs') params.set('static', '1');

            const url = `${getBaseUrl()}/overlays/credit-suite.html?${params.toString()}`;
            job.phase = 'Loading credits sequence & fonts';
            emitProgress(job);

            await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });
            await page.waitForFunction(() => Boolean(window.__creditSuiteReady), { timeout: 20000 });
            await page.evaluate(async () => {
                if (document.fonts && document.fonts.ready) {
                    try { await document.fonts.ready; } catch {}
                }
            });

            if (job.cancelled) return;

            // Static Full Tall PNG Export
            if (format === 'full-png') {
                job.phase = 'Rendering full credits PNG';
                job.percent = 50;
                emitProgress(job);
                const info = await page.evaluate(() => window.__creditSuitePrepareStaticSheet?.() || { width: 1920, height: 1080 });
                const sheetH = Math.max(height, Math.min(16000, Math.ceil(info.height || height)));
                await page.setViewport({ width, height: sheetH, deviceScaleFactor: 1 });
                await page.evaluate(() => window.__creditSuiteRefit?.());
                await page.screenshot({ path: job.filePath, type: 'png', omitBackground, fullPage: true });
                job.fileSize = fs.statSync(job.filePath).size;
                job.percent = 100;
                job.status = 'done';
                job.phase = 'Complete';
                job.finishedAt = new Date().toISOString();
                emitProgress(job);
                return;
            }

            // Static Section PNGs ZIP Export
            if (format === 'section-pngs') {
                const blockList = await page.evaluate(() => window.__creditSuiteListStaticBlocks?.() || []);
                if (!blockList.length) throw new Error('No exportable sections found in this project');
                const zip = new AdmZip();
                job.totalFrames = blockList.length;
                for (let i = 0; i < blockList.length; i++) {
                    if (job.cancelled) return;
                    const blk = blockList[i];
                    job.frame = i + 1;
                    job.percent = Math.round(((i + 1) / blockList.length) * 95);
                    job.phase = `Rendering section ${i + 1} / ${blockList.length}: ${blk.title || blk.type}`;
                    emitProgress(job);

                    const dim = await page.evaluate(id => window.__creditSuitePrepareStaticBlock?.(id) || { width: 1920, height: 1080 }, blk.id);
                    const bh = Math.max(height, Math.min(8000, Math.ceil(dim.height || height)));
                    await page.setViewport({ width, height: bh, deviceScaleFactor: 1 });
                    await page.evaluate(() => window.__creditSuiteRefit?.());
                    const buf = await page.screenshot({ type: 'png', omitBackground });
                    const prefix = String(i + 1).padStart(2, '0');
                    zip.addFile(`${prefix}-${slugify(blk.title || blk.type)}.png`, buf);
                }
                job.phase = 'Packaging ZIP archive';
                emitProgress(job);
                zip.writeZip(job.filePath);
                job.fileSize = fs.statSync(job.filePath).size;
                job.percent = 100;
                job.status = 'done';
                job.phase = 'Complete';
                job.finishedAt = new Date().toISOString();
                emitProgress(job);
                return;
            }

            // Frame-accurate animated export (MP4, WebM Alpha, ProRes 4444 Alpha, PNG Sequence ZIP)
            const meta = await page.evaluate(() => window.__creditSuiteGetMeta?.() || { durationSec: 10 });
            const durationSec = Math.max(0.5, Number(opts.durationSec) || Number(meta.durationSec) || 10);
            const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
            job.totalFrames = totalFrames;

            let ffmpegProc = null;
            let ffmpegStderr = '';
            let ffmpegDonePromise = null;
            let seqZip = null;

            if (format === 'png-sequence') {
                seqZip = new AdmZip();
            } else {
                const args = buildFfmpegArgs(format, fps, job.filePath);
                ffmpegProc = spawn(caps.path, args, { stdio: ['pipe', 'ignore', 'pipe'] });
                job.ffmpegProc = ffmpegProc;
                ffmpegProc.stderr.on('data', chunk => { ffmpegStderr += chunk.toString('utf8').slice(-2000); });
                ffmpegDonePromise = new Promise((resolve, reject) => {
                    ffmpegProc.on('error', reject);
                    ffmpegProc.on('close', code => {
                        if (job.cancelled) return resolve();
                        if (code === 0) resolve();
                        else reject(new Error(`FFmpeg exited with code ${code}: ${ffmpegStderr.slice(-400)}`));
                    });
                });
            }

            const startedAt = Date.now();
            job.phase = `Rendering ${totalFrames} frames at ${fps} fps`;
            emitProgress(job);

            for (let f = 0; f < totalFrames; f++) {
                if (job.cancelled) break;
                const tSec = f / fps;
                await page.evaluate(t => window.__creditSuiteSeek?.(t), tSec);
                const pngBuf = await page.screenshot({ type: 'png', omitBackground });

                if (seqZip) {
                    seqZip.addFile(`frame_${String(f + 1).padStart(5, '0')}.png`, pngBuf);
                } else if (ffmpegProc && ffmpegProc.stdin.writable) {
                    const ok = ffmpegProc.stdin.write(pngBuf);
                    if (!ok) {
                        await new Promise(resolve => ffmpegProc.stdin.once('drain', resolve));
                    }
                }

                job.frame = f + 1;
                if (f === 0 || (f + 1) % Math.max(1, Math.round(fps / 4)) === 0 || f === totalFrames - 1) {
                    const elapsedSec = (Date.now() - startedAt) / 1000;
                    const fpsActual = (f + 1) / Math.max(0.05, elapsedSec);
                    job.etaSec = Math.max(0, Math.round((totalFrames - (f + 1)) / Math.max(0.1, fpsActual)));
                    job.percent = Math.min(98, Math.round(((f + 1) / totalFrames) * 96));
                    job.phase = `Frame ${f + 1} / ${totalFrames} (${fpsActual.toFixed(1)} fps)`;
                    emitProgress(job);
                }
            }

            if (job.cancelled) {
                try { ffmpegProc?.stdin?.end(); } catch {}
                try { if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath); } catch {}
                return;
            }

            if (seqZip) {
                job.phase = 'Packaging PNG sequence ZIP';
                job.percent = 98;
                emitProgress(job);
                seqZip.writeZip(job.filePath);
            } else if (ffmpegProc) {
                job.phase = 'Finalizing video container';
                job.percent = 98;
                emitProgress(job);
                ffmpegProc.stdin.end();
                await ffmpegDonePromise;
            }

            job.fileSize = fs.existsSync(job.filePath) ? fs.statSync(job.filePath).size : 0;
            job.percent = 100;
            job.etaSec = 0;
            job.status = 'done';
            job.phase = 'Complete';
            job.finishedAt = new Date().toISOString();
            emitProgress(job);
        } catch (err) {
            if (!job.cancelled) {
                job.status = 'error';
                job.error = err?.message || String(err);
                job.phase = 'Export failed';
                job.finishedAt = new Date().toISOString();
                emitProgress(job);
            }
            try { if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath); } catch {}
        } finally {
            job.ffmpegProc = null;
            if (page) await page.close().catch(() => {});
            if (browser) await browser.close().catch(() => {});
        }
    }

    function startExport(project, opts = {}) {
        const format = EXPORT_FORMATS[opts.format] ? opts.format : 'mp4';
        const spec = EXPORT_FORMATS[format];
        const id = `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const safeBase = slugify(project.name || project.id);
        const fileName = `${safeBase}-${format}${spec.ext}`;
        const filePath = path.join(exportsDir, `${id}-${fileName}`);

        const job = {
            id,
            projectId: project.id,
            projectName: project.name,
            format,
            status: 'queued',
            phase: 'Queued',
            percent: 0,
            frame: 0,
            totalFrames: 0,
            etaSec: null,
            fileName,
            filePath,
            fileSize: 0,
            error: '',
            cancelled: false,
            ffmpegProc: null,
            createdAt: new Date().toISOString(),
            finishedAt: ''
        };
        jobs.set(id, job);
        emitProgress(job);

        // Fire asynchronously without blocking HTTP response
        setImmediate(() => {
            runExportJob(job, project, opts).catch(() => {});
        });

        return serializeJob(job);
    }

    return {
        EXPORT_FORMATS,
        getCapabilities,
        startExport,
        getJob,
        getJobFile,
        cancelJob
    };
}

module.exports = { createCreditSuiteExporter, EXPORT_FORMATS };
