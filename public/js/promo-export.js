import { renderPromo } from './promo-renderer.js';

const crcTable = Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

// PNGs are already compressed; store them in a standard ZIP without recompression.
function archive(files) {
    const parts = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const { name, data } of files) {
        const filename = new TextEncoder().encode(name);
        let crc = 0xffffffff;
        for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
        crc = (crc ^ 0xffffffff) >>> 0;
        const local = new Uint8Array(30 + filename.length), l = new DataView(local.buffer);
        l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(12, 33, true);
        l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true);
        l.setUint16(26, filename.length, true); local.set(filename, 30);
        const central = new Uint8Array(46 + filename.length), c = new DataView(central.buffer);
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
        c.setUint16(14, 33, true); c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
        c.setUint16(28, filename.length, true); c.setUint32(42, offset, true); central.set(filename, 46);
        parts.push(local, data); directory.push(central);
        offset += local.length + data.length; directorySize += central.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}

export async function exportPromos(design) {
    const name = design.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'promo', files = [];
    for (const ratio of Object.keys(window.PromoModel.SIZES)) {
        const canvas = document.createElement('canvas');
        await renderPromo(canvas, design, ratio, { preview: false });
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(`PNG export failed for ${ratio}.`)), 'image/png'));
        files.push({ name: `${name}-${ratio}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
        canvas.width = 1; canvas.height = 1;
    }
    return { name: `${name}-all-formats.zip`, blob: archive(files) };
}

const MP4_FPS = 20;
const ANIMATION_SECONDS = 6;
const MP4_MIME = 'video/mp4;codecs=avc1.42E028';
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function supportsNativeMp4() {
    return Boolean(window.MediaRecorder?.isTypeSupported?.(MP4_MIME) && HTMLCanvasElement.prototype.captureStream);
}

export async function supportsMp4() {
    if (supportsNativeMp4()) return true;
    if (typeof window.VideoEncoder?.isConfigSupported !== 'function') return false;
    try {
        const { supported } = await window.VideoEncoder.isConfigSupported({
            codec: 'avc1.420028', width: 1080, height: 1080, bitrate: 4_000_000, framerate: MP4_FPS
        });
        return supported === true;
    } catch {
        return false;
    }
}

function paintOpaque(canvas, design) {
    const context = canvas.getContext('2d');
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = design.colors.background || '#0b1020';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';
}

async function renderFrame(canvas, design, ratio, time) {
    await renderPromo(canvas, design, ratio, { preview: false, time });
    paintOpaque(canvas, design);
}

async function exportWithMediaRecorder(canvas, design, ratio, seconds, onProgress) {
    const frameCount = seconds * MP4_FPS;
    const stream = canvas.captureStream(MP4_FPS);
    let recorder;
    try {
        recorder = new MediaRecorder(stream, { mimeType: MP4_MIME });
        const chunks = [];
        const completed = new Promise((resolve, reject) => {
            recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
            recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/mp4' })), { once: true });
            recorder.addEventListener('error', event => reject(event.error || new Error('The browser could not record an MP4.')), { once: true });
        });
        completed.catch(() => {});
        recorder.start();
        const startedAt = performance.now();
        const stopTimer = setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
        }, seconds * 1000);
        try {
            for (let frame = 1; frame < frameCount && recorder.state === 'recording'; frame++) {
                const frameDeadline = startedAt + frame * 1000 / MP4_FPS;
                await delay(Math.max(0, frameDeadline - performance.now()));
                if (recorder.state !== 'recording') break;
                await renderFrame(canvas, design, ratio, frame / MP4_FPS);
                if (recorder.state === 'recording') onProgress(frame + 1, frameCount);
            }
            return await completed;
        } finally {
            clearTimeout(stopTimer);
            if (recorder.state !== 'inactive') recorder.stop();
        }
    } catch (error) {
        if (recorder?.state !== 'inactive') recorder?.stop();
        throw error;
    } finally {
        stream.getTracks().forEach(track => track.stop());
    }
}

async function exportWithWebCodecs(canvas, design, ratio, seconds, onProgress) {
    const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } = await import('./promo-encoder-bundle.js');
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const video = new CanvasSource(canvas, { codec: 'avc', bitrate: new Quality('high') });
    output.addVideoTrack(video, { frameRate: MP4_FPS });
    await output.start();
    const frameCount = seconds * MP4_FPS;
    for (let frame = 0; frame < frameCount; frame++) {
        await renderFrame(canvas, design, ratio, frame / MP4_FPS);
        await video.add(frame / MP4_FPS, 1 / MP4_FPS);
        onProgress(frame + 1, frameCount);
    }
    await output.finalize();
    if (!target.buffer) throw new Error('The browser MP4 encoder returned an empty file.');
    return new Blob([target.buffer], { type: 'video/mp4' });
}

export async function exportAnimation(design, ratio, { onProgress = () => {}, seconds = ANIMATION_SECONDS } = {}) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > ANIMATION_SECONDS) throw new Error('Animation duration must be between 0 and 6 seconds.');
    if (!await supportsMp4()) throw new Error('MP4 export is not supported by this browser. Try the latest version of Safari, Chrome, or Edge.');
    const canvas = document.createElement('canvas');
    await renderFrame(canvas, design, ratio, 0);
    const blob = supportsNativeMp4()
        ? await exportWithMediaRecorder(canvas, design, ratio, seconds, onProgress)
        : await exportWithWebCodecs(canvas, design, ratio, seconds, onProgress);
    const name = design.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'promo';
    return { blob, name: `${name}-${ratio}-animated.mp4` };
}
