import { createCreditSuiteRenderer } from './credit-suite-renderer.js';

function fmtTimecode(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const rem = (s % 60).toFixed(1).padStart(4, '0');
    return `${String(m).padStart(2, '0')}:${rem}`;
}

export function mountCreditSuiteStage({ state, onTimeTick }) {
    const areaEl = document.getElementById('cs-stage-canvas-area');
    const frameEl = document.getElementById('cs-stage-frame');
    const scalerEl = document.getElementById('cs-stage-scaler');
    const overlayEl = document.getElementById('cs-stage-overlay');
    const reflowPill = document.getElementById('cs-reflow-pill');
    const timecodeEl = document.getElementById('cs-timecode');
    const playBtn = document.getElementById('cs-btn-play');
    const restartBtn = document.getElementById('cs-btn-restart');
    const stepBackBtn = document.getElementById('cs-btn-step-back');
    const stepFwdBtn = document.getElementById('cs-btn-step-fwd');
    const speedSel = document.getElementById('cs-playback-speed');
    const guidesBtn = document.getElementById('cs-btn-guides');
    const backdropBtns = document.querySelectorAll('[data-cs-backdrop]');

    let currentScale = 0.5;
    let lastReflowZone = '';
    let lastPlayingUi = null;
    let dragState = null;
    let dragRafId = 0;
    let pendingDragRect = null;
    let needsStageSync = false;

    const renderer = createCreditSuiteRenderer(scalerEl, {
        interactive: true,
        deterministic: false,
        onSolved: solved => {
            state.setSolved(solved);
            fitStage();
            renderGizmo();
        },
        onStateChange: () => {
            updatePlayButton();
        },
        onTimeUpdate: frame => {
            window.__csStudioTime = frame.timeSec;
            if (timecodeEl) {
                timecodeEl.textContent = `${fmtTimecode(frame.timeSec)} / ${fmtTimecode(frame.durationSec)}`;
            }
            if (reflowPill && frame.reflow.zone !== lastReflowZone) {
                lastReflowZone = frame.reflow.zone;
                if (frame.reflow.zone === 'right') {
                    reflowPill.textContent = 'Reflow: Right';
                    reflowPill.className = 'cs-pill saved';
                } else if (frame.reflow.zone === 'left') {
                    reflowPill.textContent = 'Reflow: Left';
                    reflowPill.className = 'cs-pill dirty';
                } else {
                    reflowPill.textContent = 'Column: Center';
                    reflowPill.className = 'cs-pill';
                }
            }
            if (onTimeTick) onTimeTick(frame);
        },
        onClipSelect: (trackId, clipId) => {
            state.setSelection('clip', clipId, trackId);
        }
    });

    function updatePlayButton() {
        if (!playBtn) return;
        const playing = renderer.isPlaying();
        if (playing === lastPlayingUi) return;
        lastPlayingUi = playing;
        playBtn.innerHTML = playing
            ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause'
            : '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg> Play';
    }

    function fitStage() {
        const proj = state.store.project;
        if (!proj || !areaEl || !frameEl || !scalerEl) return;
        const cw = proj.canvas.width || 1920;
        const ch = proj.canvas.height || 1080;
        const rect = areaEl.getBoundingClientRect();
        const availW = Math.max(200, rect.width - 28);
        const availH = Math.max(140, rect.height - 28);
        const scale = Math.min(availW / cw, availH / ch);
        currentScale = scale;

        frameEl.style.width = `${Math.round(cw * scale)}px`;
        frameEl.style.height = `${Math.round(ch * scale)}px`;
        scalerEl.style.width = `${cw}px`;
        scalerEl.style.height = `${ch}px`;
        scalerEl.style.transform = `scale(${scale})`;
    }

    function applyBackdropAndGuides() {
        if (frameEl) {
            frameEl.classList.remove('backdrop-checker', 'backdrop-dark', 'backdrop-light');
            frameEl.classList.add(`backdrop-${state.store.backdrop}`);
        }
        backdropBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.csBackdrop === state.store.backdrop);
        });
        guidesBtn?.classList.toggle('cs-btn-primary', state.store.showGuides);
        renderGizmo();
    }

    function snapPercent(val, targets = [0, 5, 50, 95, 100], threshold = 1.2) {
        for (const t of targets) {
            if (Math.abs(val - t) <= threshold) return t;
        }
        return Number(val.toFixed(2));
    }

    function renderGizmo() {
        if (!overlayEl || !state.store.project) return;
        let html = '';
        if (state.store.showGuides) {
            html += '<div class="cs-guide-safe"></div><div class="cs-guide-center-v"></div><div class="cs-guide-center-h"></div>';
        }
        const sel = state.getSelectedClip();
        if (sel?.clip && sel.clip.enabled !== false) {
            const c = sel.clip;
            html += `
                <div class="cs-clip-gizmo" id="cs-active-gizmo" style="left:${c.x}%;top:${c.y}%;width:${c.width}%;height:${c.height}%;">
                    <div class="cs-gizmo-handle" data-dir="nw"></div>
                    <div class="cs-gizmo-handle" data-dir="n"></div>
                    <div class="cs-gizmo-handle" data-dir="ne"></div>
                    <div class="cs-gizmo-handle" data-dir="e"></div>
                    <div class="cs-gizmo-handle" data-dir="se"></div>
                    <div class="cs-gizmo-handle" data-dir="s"></div>
                    <div class="cs-gizmo-handle" data-dir="sw"></div>
                    <div class="cs-gizmo-handle" data-dir="w"></div>
                </div>
            `;
        }
        overlayEl.innerHTML = html;

        const gizmo = overlayEl.querySelector('#cs-active-gizmo');
        if (gizmo && sel?.clip) {
            gizmo.addEventListener('pointerdown', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                const handle = ev.target.closest('.cs-gizmo-handle');
                const dir = handle ? handle.dataset.dir : 'move';
                const frameRect = frameEl.getBoundingClientRect();
                dragState = {
                    dir,
                    trackId: sel.track.id,
                    clipId: sel.clip.id,
                    startX: ev.clientX,
                    startY: ev.clientY,
                    frameW: frameRect.width || 1,
                    frameH: frameRect.height || 1,
                    orig: { x: sel.clip.x, y: sel.clip.y, width: sel.clip.width, height: sel.clip.height },
                    recorded: false
                };
            });
        }
    }

    function applyLiveDragGeometry() {
        dragRafId = 0;
        if (!dragState || !pendingDragRect) return;
        const { x, y, width, height } = pendingDragRect;
        const gizmo = overlayEl?.querySelector('#cs-active-gizmo');
        if (gizmo) {
            gizmo.style.left = `${x}%`;
            gizmo.style.top = `${y}%`;
            gizmo.style.width = `${width}%`;
            gizmo.style.height = `${height}%`;
        }
        const clipEl = scalerEl?.querySelector(`.cs-track-clip[data-clip-id="${CSS.escape(dragState.clipId)}"]`);
        if (clipEl) {
            clipEl.style.left = `${x}%`;
            clipEl.style.top = `${y}%`;
            clipEl.style.width = `${width}%`;
            clipEl.style.height = `${height}%`;
        }
    }

    function handlePointerMove(ev) {
        if (!dragState) return;
        const dxPct = ((ev.clientX - dragState.startX) / dragState.frameW) * 100;
        const dyPct = ((ev.clientY - dragState.startY) / dragState.frameH) * 100;
        const { dir, orig, trackId, clipId } = dragState;
        let nx = orig.x;
        let ny = orig.y;
        let nw = orig.width;
        let nh = orig.height;

        if (dir === 'move') {
            nx = snapPercent(orig.x + dxPct);
            ny = snapPercent(orig.y + dyPct);
        } else {
            if (dir.includes('e')) nw = Math.max(4, orig.width + dxPct);
            if (dir.includes('s')) nh = Math.max(4, orig.height + dyPct);
            if (dir.includes('w')) {
                const maxShift = orig.width - 4;
                const shift = Math.min(maxShift, dxPct);
                nx = orig.x + shift;
                nw = orig.width - shift;
            }
            if (dir.includes('n')) {
                const maxShift = orig.height - 4;
                const shift = Math.min(maxShift, dyPct);
                ny = orig.y + shift;
                nh = orig.height - shift;
            }
        }

        const recordUndo = !dragState.recorded;
        dragState.recorded = true;
        const rx = Number(nx.toFixed(2));
        const ry = Number(ny.toFixed(2));
        const rw = Number(nw.toFixed(2));
        const rh = Number(nh.toFixed(2));
        pendingDragRect = { x: rx, y: ry, width: rw, height: rh };
        state.mutateProject(p => {
            const tr = p.tracks.find(t => t.id === trackId);
            const c = tr?.clips.find(x => x.id === clipId);
            if (c) {
                c.x = rx;
                c.y = ry;
                c.width = rw;
                c.height = rh;
            }
        }, { reason: 'clip-transform', recordUndo });
        if (!dragRafId) dragRafId = requestAnimationFrame(applyLiveDragGeometry);
    }

    function finishDrag() {
        if (!dragState) return;
        if (dragRafId) {
            cancelAnimationFrame(dragRafId);
            dragRafId = 0;
        }
        dragState = null;
        pendingDragRect = null;
        state.emit('project');
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    // Transport bindings
    playBtn?.addEventListener('click', () => {
        if (renderer.isPlaying()) renderer.pause();
        else renderer.play();
        updatePlayButton();
    });
    restartBtn?.addEventListener('click', () => {
        renderer.seek(0);
        renderer.play();
        updatePlayButton();
    });
    stepBackBtn?.addEventListener('click', () => {
        renderer.pause();
        renderer.seek(Math.max(0, renderer.getTime() - 1));
        updatePlayButton();
    });
    stepFwdBtn?.addEventListener('click', () => {
        renderer.pause();
        renderer.seek(renderer.getTime() + 1);
        updatePlayButton();
    });
    speedSel?.addEventListener('change', () => {
        renderer.setSpeedRate(Number(speedSel.value) || 1);
    });
    guidesBtn?.addEventListener('click', () => {
        state.setShowGuides(!state.store.showGuides);
    });
    backdropBtns.forEach(btn => {
        btn.addEventListener('click', () => state.setBackdrop(btn.dataset.csBackdrop));
    });

    const ro = new ResizeObserver(() => fitStage());
    if (areaEl) ro.observe(areaEl);

    function syncProjectToRenderer(resetTime = false) {
        if (!state.store.project) return;
        if (state.store.studioView !== 'studio') {
            needsStageSync = true;
            return;
        }
        needsStageSync = false;
        const prevT = resetTime ? 0 : renderer.getTime();
        const wasPlaying = !resetTime && renderer.isPlaying();
        if (resetTime && renderer.isPlaying()) renderer.pause();
        renderer.setProject(state.store.project, { variables: state.store.variablesMap });
        renderer.seek(prevT);
        if (wasPlaying) renderer.play();
        fitStage();
        applyBackdropAndGuides();
        updatePlayButton();
    }

    state.subscribe(reason => {
        if (reason === 'init' || reason === 'project-switched') {
            syncProjectToRenderer(true);
        } else if (reason === 'project' || reason === 'project-structure' || reason === 'variables') {
            syncProjectToRenderer(false);
        } else if (reason === 'selection' || reason === 'ui') {
            applyBackdropAndGuides();
        }
    });

    return {
        renderer,
        seek: t => renderer.seek(t),
        play: () => { renderer.play(); updatePlayButton(); },
        pause: () => { renderer.pause(); updatePlayButton(); },
        togglePlay: () => {
            if (renderer.isPlaying()) renderer.pause();
            else renderer.play();
            updatePlayButton();
        },
        flushIfStale: () => {
            if (needsStageSync) syncProjectToRenderer(false);
            else fitStage();
        },
        getTime: () => renderer.getTime(),
        getScale: () => currentScale,
        destroy: () => {
            if (dragRafId) cancelAnimationFrame(dragRafId);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', finishDrag);
            window.removeEventListener('pointercancel', finishDrag);
            ro.disconnect();
            renderer.destroy();
        }
    };
}
