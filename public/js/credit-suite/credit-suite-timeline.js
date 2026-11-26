/**
 * StreamPulse Credit Suite — Bottom NLE Multi-Track Scrubbable Timeline
 */

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtRuler(sec) {
    const s = Math.floor(Math.max(0, sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
}

export function mountCreditSuiteTimeline({ state, stage, blocksApi }) {
    const scrollEl = document.getElementById('cs-timeline-scroll');
    const gridEl = document.getElementById('cs-timeline-grid');
    const zoomInput = document.getElementById('cs-timeline-zoom');
    const addTrackBtn = document.getElementById('cs-tl-add-track');
    const LABEL_W = 170;

    let scrubbing = false;
    let clipDrag = null;
    let cardResize = null;
    let playheadEl = null;

    zoomInput?.addEventListener('input', () => {
        state.setTimelineZoom(Number(zoomInput.value) || 18);
    });

    addTrackBtn?.addEventListener('click', () => {
        blocksApi?.addTrack('side');
    });

    function pxPerSec() {
        return state.store.timelineZoom || 18;
    }

    function timeFromClientX(clientX) {
        if (!gridEl) return 0;
        const rect = gridEl.getBoundingClientRect();
        const x = clientX - rect.left - LABEL_W;
        const dur = state.store.solved?.totalDurationSec || 10;
        return Math.max(0, Math.min(dur, x / pxPerSec()));
    }

    function updatePlayhead(timeSec) {
        if (!playheadEl) return;
        const left = LABEL_W + Math.max(0, Number(timeSec) || 0) * pxPerSec();
        playheadEl.style.left = `${left.toFixed(1)}px`;
    }

    function render() {
        const proj = state.store.project;
        const solved = state.store.solved;
        if (!proj || !solved || !gridEl) return;

        if (zoomInput) zoomInput.value = String(state.store.timelineZoom);

        const pps = pxPerSec();
        const dur = Math.max(10, solved.totalDurationSec || 10);
        const laneW = Math.max(600, Math.ceil((dur + 4) * pps));
        gridEl.style.width = `${LABEL_W + laneW}px`;

        // Ruler ticks
        const step = pps >= 40 ? 1 : (pps >= 20 ? 2 : (pps >= 10 ? 5 : 10));
        let ticksHtml = '';
        for (let t = 0; t <= dur + 2; t += step) {
            ticksHtml += `<div class="cs-tl-tick" style="left:${(t * pps).toFixed(1)}px;">${fmtRuler(t)}</div>`;
        }
        for (const mk of (solved.markers || [])) {
            ticksHtml += `<button type="button" class="cs-tl-marker" data-marker-t="${mk.timeSec}" style="left:${(mk.timeSec * pps).toFixed(1)}px;" title="Jump to ${esc(mk.name)}">${esc(mk.name)}</button>`;
        }

        // Credits Sequence Lane (Cards + Crawl Block slices)
        const sel = state.store.selection;
        let seqHtml = '';
        for (const seg of solved.segments) {
            if (seg.kind === 'card') {
                const left = seg.startSec * pps;
                const w = Math.max(24, seg.durationSec * pps);
                const isSel = sel.kind === 'block' && sel.id === seg.blockId;
                seqHtml += `
                    <div class="cs-tl-clip kind-card ${isSel ? 'selected' : ''}" data-tl-block="${esc(seg.blockId)}" style="left:${left.toFixed(1)}px;width:${w.toFixed(1)}px;" title="Card: ${esc(seg.block.title || seg.block.type)} (${seg.durationSec.toFixed(1)}s)">
                        <span>${esc(seg.block.title || seg.block.type)}</span>
                        <div class="cs-tl-trim right" data-card-trim="${esc(seg.blockId)}"></div>
                    </div>
                `;
            } else if (seg.kind === 'crawl') {
                const totalH = Math.max(1, seg.contentHeight || 1);
                for (const bm of seg.blockMetrics) {
                    const startFrac = bm.offsetY / totalH;
                    const endFrac = (bm.offsetY + bm.height) / totalH;
                    const sliceStart = seg.startSec + startFrac * seg.durationSec;
                    const sliceEnd = seg.startSec + endFrac * seg.durationSec;
                    const left = sliceStart * pps;
                    const w = Math.max(18, (sliceEnd - sliceStart) * pps - 2);
                    const isSel = sel.kind === 'block' && sel.id === bm.blockId;
                    const label = bm.block.title || bm.block.type;
                    seqHtml += `
                        <div class="cs-tl-clip kind-crawl ${isSel ? 'selected' : ''}" data-tl-block="${esc(bm.blockId)}" style="left:${left.toFixed(1)}px;width:${w.toFixed(1)}px;" title="Crawl: ${esc(label)}">
                            <span>${esc(label)}</span>
                        </div>
                    `;
                }
            }
        }

        // Auto-Reflow visualization lane
        let reflowHtml = '';
        if (proj.theme?.autoReflow?.enabled !== false) {
            for (const rc of solved.resolvedClips) {
                if (rc.pushTargetZone === 'none') continue;
                const left = rc.startSec * pps;
                const w = Math.max(16, rc.durationSec * pps);
                reflowHtml += `<div class="cs-tl-reflow-bar ${rc.pushTargetZone}" style="left:${left.toFixed(1)}px;width:${w.toFixed(1)}px;">${rc.pushTargetZone === 'right' ? 'Credits Right' : 'Credits Left'}</div>`;
            }
        }

        // Floating / Side / Background Track rows
        const resolvedByClip = new Map(solved.resolvedClips.map(rc => [rc.clip.id, rc]));
        const trackRowsHtml = (proj.tracks || []).map(tr => {
            const kindClass = tr.layer === 'behind' ? 'kind-behind' : (tr.layer === 'above' ? 'kind-above' : 'kind-side');
            const clipsHtml = (tr.clips || []).map(c => {
                if (c.enabled === false) return '';
                const rc = resolvedByClip.get(c.id);
                const startS = rc ? rc.startSec : (c.startSec || 0);
                const durS = rc ? rc.durationSec : (c.durationSec || 5);
                const left = startS * pps;
                const w = Math.max(24, durS * pps);
                const isSel = sel.kind === 'clip' && sel.id === c.id;
                const badge = c.timingMode === 'block' ? '[Sync] ' : '';
                return `
                    <div class="cs-tl-clip ${kindClass} ${isSel ? 'selected' : ''}" data-tl-clip="${esc(c.id)}" data-tl-track="${esc(tr.id)}" style="left:${left.toFixed(1)}px;width:${w.toFixed(1)}px;" title="${esc(c.name)} (${startS.toFixed(1)}s – ${(startS + durS).toFixed(1)}s)">
                        <div class="cs-tl-trim left" data-clip-trim="left"></div>
                        <span>${badge}${esc(c.name || c.elementType)}</span>
                        <div class="cs-tl-trim right" data-clip-trim="right"></div>
                    </div>
                `;
            }).join('');

            return `
                <div class="cs-tl-row">
                    <div class="cs-tl-label">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tr.name)}</span>
                        <button type="button" class="cs-btn cs-btn-sm" data-quick-clip="${esc(tr.id)}" title="Add clip to ${esc(tr.name)}">+</button>
                    </div>
                    <div class="cs-tl-lane" data-scrub-lane="1" style="width:${laneW}px;">${clipsHtml}</div>
                </div>
            `;
        }).join('');

        gridEl.innerHTML = `
            <div class="cs-tl-row ruler">
                <div class="cs-tl-label">Timecode</div>
                <div class="cs-tl-lane" data-scrub-lane="1" style="width:${laneW}px;">${ticksHtml}</div>
            </div>
            <div class="cs-tl-row">
                <div class="cs-tl-label">Credits Sequence</div>
                <div class="cs-tl-lane" data-scrub-lane="1" style="width:${laneW}px;">${seqHtml}</div>
            </div>
            <div class="cs-tl-row reflow-row">
                <div class="cs-tl-label" style="font-size:10px;">Auto-Reflow</div>
                <div class="cs-tl-lane" data-scrub-lane="1" style="width:${laneW}px;">${reflowHtml}</div>
            </div>
            ${trackRowsHtml}
            <div class="cs-playhead" id="cs-tl-playhead"></div>
        `;

        playheadEl = gridEl.querySelector('#cs-tl-playhead');
        updatePlayhead(stage.getTime());

        // Marker clicks
        gridEl.querySelectorAll('[data-marker-t]').forEach(btn => {
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                stage.seek(Number(btn.dataset.markerT) || 0);
            });
        });

        // Quick-add clip buttons
        gridEl.querySelectorAll('[data-quick-clip]').forEach(btn => {
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                blocksApi?.addClipToTrack(btn.dataset.quickClip, 'image');
            });
        });

        // Credit block clicks & Card duration trim
        gridEl.querySelectorAll('[data-tl-block]').forEach(el => {
            el.addEventListener('pointerdown', ev => {
                const trimId = ev.target.closest('[data-card-trim]')?.dataset.cardTrim;
                const bid = el.dataset.tlBlock;
                ev.stopPropagation();
                state.setSelection('block', bid);
                if (trimId) {
                    const blk = proj.blocks.find(b => b.id === trimId);
                    if (blk) {
                        cardResize = {
                            blockId: trimId,
                            startX: ev.clientX,
                            origDur: Number(blk.duration) || 4.5,
                            recorded: false
                        };
                    }
                    return;
                }
                const bt = solved.blockTimings[bid];
                if (bt) stage.seek(bt.kind === 'crawl' ? bt.centerSec : bt.startSec + Math.min(1, bt.durationSec * 0.35));
            });
        });

        // Track clip drag/move & edge trim
        gridEl.querySelectorAll('[data-tl-clip]').forEach(el => {
            el.addEventListener('pointerdown', ev => {
                ev.stopPropagation();
                const cid = el.dataset.tlClip;
                const tid = el.dataset.tlTrack;
                const trimSide = ev.target.closest('[data-clip-trim]')?.dataset.clipTrim || 'move';
                state.setSelection('clip', cid, tid);
                const rc = resolvedByClip.get(cid);
                const tr = proj.tracks.find(t => t.id === tid);
                const clip = tr?.clips.find(c => c.id === cid);
                if (!clip) return;
                clipDrag = {
                    trackId: tid,
                    clipId: cid,
                    mode: trimSide,
                    startX: ev.clientX,
                    origStart: rc ? rc.startSec : (clip.startSec || 0),
                    origDur: rc ? rc.durationSec : (clip.durationSec || 5),
                    recorded: false
                };
            });
        });

        // Scrubbing on ruler / empty lane areas
        gridEl.querySelectorAll('[data-scrub-lane]').forEach(lane => {
            lane.addEventListener('pointerdown', ev => {
                if (ev.target.closest('.cs-tl-clip, .cs-tl-marker')) return;
                scrubbing = true;
                stage.pause();
                stage.seek(timeFromClientX(ev.clientX));
            });
        });
    }

    window.addEventListener('pointermove', ev => {
        if (scrubbing) {
            stage.seek(timeFromClientX(ev.clientX));
            return;
        }
        if (cardResize) {
            const dxSec = (ev.clientX - cardResize.startX) / pxPerSec();
            const nextDur = Math.max(0.5, Number((cardResize.origDur + dxSec).toFixed(2)));
            const recordUndo = !cardResize.recorded;
            cardResize.recorded = true;
            state.mutateProject(p => {
                const b = p.blocks.find(x => x.id === cardResize.blockId);
                if (b) b.duration = nextDur;
            }, { reason: 'project', recordUndo });
            return;
        }
        if (clipDrag) {
            const dxSec = (ev.clientX - clipDrag.startX) / pxPerSec();
            const recordUndo = !clipDrag.recorded;
            clipDrag.recorded = true;
            state.mutateProject(p => {
                const tr = p.tracks.find(t => t.id === clipDrag.trackId);
                const c = tr?.clips.find(x => x.id === clipDrag.clipId);
                if (!c) return;
                c.timingMode = 'timecode';
                if (clipDrag.mode === 'move') {
                    c.startSec = Math.max(0, Number((clipDrag.origStart + dxSec).toFixed(2)));
                } else if (clipDrag.mode === 'right') {
                    c.durationSec = Math.max(0.5, Number((clipDrag.origDur + dxSec).toFixed(2)));
                } else if (clipDrag.mode === 'left') {
                    const maxShift = clipDrag.origDur - 0.5;
                    const shift = Math.max(-clipDrag.origStart, Math.min(maxShift, dxSec));
                    c.startSec = Number((clipDrag.origStart + shift).toFixed(2));
                    c.durationSec = Number((clipDrag.origDur - shift).toFixed(2));
                }
            }, { reason: 'project', recordUndo });
        }
    });

    window.addEventListener('pointerup', () => {
        scrubbing = false;
        cardResize = null;
        clipDrag = null;
    });

    state.subscribe(reason => {
        if (['init', 'project', 'project-switched', 'solved', 'selection', 'timeline-zoom'].includes(reason)) {
            render();
        }
    });

    return { render, updatePlayhead, scrollEl };
}
