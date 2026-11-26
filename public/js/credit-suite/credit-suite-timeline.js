/**
 * StreamPulse Credit Suite — Bottom NLE Multi-Track Scrubbable Timeline
 */

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    const multiBar = document.getElementById('cs-tl-multiselect-bar');
    const durInput = document.getElementById('cs-tl-dur-input');
    const speedInput = document.getElementById('cs-tl-speed-input');
    const LABEL_W = 170;

    let scrubbing = false;
    let clipDrag = null;
    let cardResize = null;
    let crawlResize = null;
    let marquee = null;
    let playheadEl = null;
    let dragMoveRaf = 0;
    let lastPointerEv = null;

    durInput?.addEventListener('change', () => {
        const target = Math.max(5, Math.min(3600, Number(durInput.value) || 30));
        durInput.value = String(Math.round(target));
        state.mutateProject(p => {
            p.timing.mode = 'duration';
            p.timing.targetDurationSec = target;
        });
    });

    speedInput?.addEventListener('change', () => {
        const spd = Math.max(15, Math.min(600, Number(speedInput.value) || 95));
        state.mutateProject(p => {
            p.timing.mode = 'speed';
            p.timing.speedPxPerSec = spd;
        });
    });

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

    function getSelectedClipEntries() {
        const proj = state.store.project;
        const solved = state.store.solved;
        const ids = state.store.selectedClipIds;
        if (!proj || !ids || ids.size === 0) return [];
        const resolvedMap = new Map((solved?.resolvedClips || []).map(rc => [rc.clip.id, rc]));
        const out = [];
        for (const tr of (proj.tracks || [])) {
            for (const c of (tr.clips || [])) {
                if (!ids.has(c.id) || c.enabled === false) continue;
                const rc = resolvedMap.get(c.id);
                out.push({
                    trackId: tr.id,
                    clipId: c.id,
                    startSec: rc ? rc.startSec : (c.startSec || 0),
                    durationSec: rc ? rc.durationSec : (c.durationSec || 5)
                });
            }
        }
        return out.sort((a, b) => a.startSec - b.startSec);
    }

    function applyMultiSpace(deltaSec) {
        const items = getSelectedClipEntries();
        if (items.length < 2) return;
        state.mutateProject(p => {
            const byId = new Map();
            for (const tr of p.tracks) for (const c of tr.clips) byId.set(c.id, c);
            if (deltaSec === 'pack') {
                let cursor = items[0].startSec;
                for (const it of items) {
                    const c = byId.get(it.clipId);
                    if (!c) continue;
                    c.timingMode = 'timecode';
                    c.startSec = Number(Math.max(0, cursor).toFixed(2));
                    c.durationSec = Number(it.durationSec.toFixed(2));
                    cursor = c.startSec + c.durationSec;
                }
            } else {
                // Adjust each inter-clip gap by deltaSec while preventing negative overlaps
                let prevEnd = items[0].startSec + items[0].durationSec;
                const first = byId.get(items[0].clipId);
                if (first) {
                    first.timingMode = 'timecode';
                    first.startSec = Number(items[0].startSec.toFixed(2));
                    first.durationSec = Number(items[0].durationSec.toFixed(2));
                }
                for (let idx = 1; idx < items.length; idx++) {
                    const it = items[idx];
                    const prevOrigEnd = items[idx - 1].startSec + items[idx - 1].durationSec;
                    const origGap = it.startSec - prevOrigEnd;
                    const nextGap = origGap >= 0 ? Math.max(0, origGap + deltaSec) : Math.max(0, deltaSec);
                    const c = byId.get(it.clipId);
                    if (!c) continue;
                    c.timingMode = 'timecode';
                    c.startSec = Number(Math.max(0, prevEnd + nextGap).toFixed(2));
                    c.durationSec = Number(it.durationSec.toFixed(2));
                    prevEnd = c.startSec + c.durationSec;
                }
            }
        }, { reason: 'project-structure' });
    }

    function applyMultiStretch(factor) {
        const items = getSelectedClipEntries();
        if (items.length < 2) return;
        const origin = items[0].startSec;
        state.mutateProject(p => {
            const byId = new Map();
            for (const tr of p.tracks) for (const c of tr.clips) byId.set(c.id, c);
            let prevEnd = origin;
            items.forEach((it, idx) => {
                const c = byId.get(it.clipId);
                if (!c) return;
                c.timingMode = 'timecode';
                const scaledStart = origin + (it.startSec - origin) * factor;
                const nextStart = idx === 0
                    ? origin
                    : (it.startSec >= items[idx - 1].startSec + items[idx - 1].durationSec - 0.01
                        ? Math.max(prevEnd, scaledStart)
                        : Math.max(0, scaledStart));
                const nextDur = Math.max(0.5, it.durationSec * factor);
                c.startSec = Number(Math.max(0, nextStart).toFixed(2));
                c.durationSec = Number(nextDur.toFixed(2));
                prevEnd = c.startSec + c.durationSec;
            });
        }, { reason: 'project-structure' });
    }

    function renderMultiBar() {
        if (!multiBar) return;
        const count = state.store.selectedClipIds?.size || 0;
        if (count < 2) {
            multiBar.style.display = 'none';
            multiBar.innerHTML = '';
            return;
        }
        multiBar.style.display = 'inline-flex';
        multiBar.innerHTML = `
            <span class="cs-pill accent">${count} clips</span>
            <button type="button" class="cs-btn cs-btn-sm" data-ms="space-add" title="Add +1s space between selected clips">+1s Gap</button>
            <button type="button" class="cs-btn cs-btn-sm" data-ms="space-sub" title="Remove 1s space between selected clips">-1s Gap</button>
            <button type="button" class="cs-btn cs-btn-sm" data-ms="pack" title="Pack selected clips back-to-back">Pack</button>
            <button type="button" class="cs-btn cs-btn-sm" data-ms="stretch-up" title="Stretch selected group by 125%">Stretch +25%</button>
            <button type="button" class="cs-btn cs-btn-sm" data-ms="stretch-dn" title="Compress selected group by 80%">Shrink -20%</button>
            <button type="button" class="cs-btn cs-btn-sm cs-btn-danger" data-ms="del" title="Delete selected clips">Delete</button>
            <button type="button" class="cs-btn cs-btn-sm" data-ms="clear" title="Clear multi-selection">Clear</button>
        `;
        multiBar.querySelectorAll('[data-ms]').forEach(btn => {
            btn.addEventListener('click', () => {
                const act = btn.dataset.ms;
                if (act === 'space-add') applyMultiSpace(1);
                else if (act === 'space-sub') applyMultiSpace(-1);
                else if (act === 'pack') applyMultiSpace('pack');
                else if (act === 'stretch-up') applyMultiStretch(1.25);
                else if (act === 'stretch-dn') applyMultiStretch(0.8);
                else if (act === 'del') {
                    const ids = new Set(state.store.selectedClipIds);
                    state.mutateProject(p => {
                        for (const tr of p.tracks) tr.clips = tr.clips.filter(c => !ids.has(c.id));
                    });
                    state.setSelection(null, null);
                } else if (act === 'clear') {
                    state.setSelection(null, null);
                }
            });
        });
    }

    function render() {
        const proj = state.store.project;
        const solved = state.store.solved;
        if (!proj || !solved || !gridEl) return;
        renderMultiBar();

        if (zoomInput) zoomInput.value = String(state.store.timelineZoom);
        if (durInput && document.activeElement !== durInput) {
            durInput.value = String(Math.round(solved.totalDurationSec || 0));
        }
        if (speedInput && document.activeElement !== speedInput) {
            speedInput.value = String(Math.round(solved.effectiveSpeed || 95));
        }

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
                for (let idx = 0; idx < seg.blockMetrics.length; idx++) {
                    const bm = seg.blockMetrics[idx];
                    const isLastInRun = idx === seg.blockMetrics.length - 1;
                    const startFrac = bm.offsetY / totalH;
                    const endFrac = (bm.offsetY + bm.height) / totalH;
                    const sliceStart = seg.startSec + startFrac * seg.durationSec;
                    const sliceEnd = seg.startSec + endFrac * seg.durationSec;
                    const left = sliceStart * pps;
                    const w = Math.max(20, (sliceEnd - sliceStart) * pps - 2);
                    const isSel = sel.kind === 'block' && sel.id === bm.blockId;
                    const label = bm.block.title || bm.block.type;
                    seqHtml += `
                        <div class="cs-tl-clip kind-crawl ${isSel ? 'selected' : ''}" data-tl-block="${esc(bm.blockId)}" style="left:${left.toFixed(1)}px;width:${w.toFixed(1)}px;" title="Crawl: ${esc(label)}${isLastInRun ? ' (drag right handle to stretch/shorten crawl duration)' : ''}">
                            <span>${esc(label)}</span>
                            ${isLastInRun ? `<div class="cs-tl-trim right" data-crawl-trim="${esc(seg.id)}" title="Drag to change crawl duration & speed"></div>` : ''}
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
                const isSel = (sel.kind === 'clip' && sel.id === c.id) || state.store.selectedClipIds?.has(c.id);
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

        // Credit block clicks, Card duration trim, & Crawl duration stretch
        gridEl.querySelectorAll('[data-tl-block]').forEach(el => {
            el.addEventListener('pointerdown', ev => {
                const trimId = ev.target.closest('[data-card-trim]')?.dataset.cardTrim;
                const crawlTrimId = ev.target.closest('[data-crawl-trim]')?.dataset.crawlTrim;
                const bid = el.dataset.tlBlock;
                ev.stopPropagation();
                if (trimId || crawlTrimId) ev.preventDefault();
                if (crawlTrimId) {
                    const run = solved.crawlRuns.find(r => r.id === crawlTrimId);
                    if (run) {
                        crawlResize = {
                            runId: crawlTrimId,
                            startX: ev.clientX,
                            origRunDur: run.durationSec,
                            origTravel: run.travelDistance,
                            recorded: false
                        };
                    }
                    return;
                }
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

        // Track clip drag/move (supports single OR multi-select group move!) & edge trim
        gridEl.querySelectorAll('[data-tl-clip]').forEach(el => {
            el.addEventListener('pointerdown', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                const cid = el.dataset.tlClip;
                const tid = el.dataset.tlTrack;
                const trimSide = ev.target.closest('[data-clip-trim]')?.dataset.clipTrim || 'move';
                if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
                    state.toggleClipSelection(cid, tid);
                    return;
                }
                const alreadyMulti = state.store.selectedClipIds?.has(cid) && state.store.selectedClipIds.size > 1;
                if (!alreadyMulti) {
                    state.setSelection('clip', cid, tid);
                }
                const rc = resolvedByClip.get(cid);
                const tr = proj.tracks.find(t => t.id === tid);
                const clip = tr?.clips.find(c => c.id === cid);
                if (!clip) return;

                const groupEntries = (alreadyMulti && trimSide === 'move')
                    ? getSelectedClipEntries()
                    : [{ trackId: tid, clipId: cid, startSec: rc ? rc.startSec : (clip.startSec || 0), durationSec: rc ? rc.durationSec : (clip.durationSec || 5) }];

                clipDrag = {
                    trackId: tid,
                    clipId: cid,
                    mode: trimSide,
                    startX: ev.clientX,
                    origStart: rc ? rc.startSec : (clip.startSec || 0),
                    origDur: rc ? rc.durationSec : (clip.durationSec || 5),
                    groupEntries,
                    recorded: false
                };
            });
        });

        // Scrubbing on ruler / empty lane areas (Shift+Drag starts marquee multi-select!)
        gridEl.querySelectorAll('[data-scrub-lane]').forEach(lane => {
            lane.addEventListener('pointerdown', ev => {
                if (ev.target.closest('.cs-tl-clip, .cs-tl-marker')) return;
                if (ev.shiftKey) {
                    ev.preventDefault();
                    const gridRect = gridEl.getBoundingClientRect();
                    const box = document.createElement('div');
                    box.className = 'cs-tl-marquee';
                    gridEl.appendChild(box);
                    marquee = {
                        startX: ev.clientX - gridRect.left,
                        startY: ev.clientY - gridRect.top,
                        box
                    };
                    return;
                }
                scrubbing = true;
                stage.pause();
                stage.seek(timeFromClientX(ev.clientX));
            });
        });
    }

    function processPointerMove() {
        dragMoveRaf = 0;
        const ev = lastPointerEv;
        if (!ev) return;
        if (marquee && gridEl) {
            const rect = gridEl.getBoundingClientRect();
            const curX = ev.clientX - rect.left;
            const curY = ev.clientY - rect.top;
            const x = Math.min(marquee.startX, curX);
            const y = Math.min(marquee.startY, curY);
            const w = Math.abs(curX - marquee.startX);
            const h = Math.abs(curY - marquee.startY);
            marquee.box.style.left = `${x}px`;
            marquee.box.style.top = `${y}px`;
            marquee.box.style.width = `${w}px`;
            marquee.box.style.height = `${h}px`;
            marquee.rect = { left: x, top: y, right: x + w, bottom: y + h };
            return;
        }
        if (scrubbing) {
            stage.seek(timeFromClientX(ev.clientX));
            return;
        }
        if (crawlResize) {
            const dxSec = (ev.clientX - crawlResize.startX) / pxPerSec();
            const nextRunDur = Math.max(2, crawlResize.origRunDur + dxSec);
            const nextSpeed = Math.max(15, Math.min(600, Math.round(crawlResize.origTravel / nextRunDur)));
            const recordUndo = !crawlResize.recorded;
            crawlResize.recorded = true;
            state.mutateProject(p => {
                p.timing.mode = 'speed';
                p.timing.speedPxPerSec = nextSpeed;
            }, { reason: 'project', recordUndo });
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
                if (clipDrag.mode === 'move' && clipDrag.groupEntries.length > 1) {
                    const minStart = Math.min(...clipDrag.groupEntries.map(g => g.startSec));
                    const clampedDx = Math.max(-minStart, dxSec);
                    for (const entry of clipDrag.groupEntries) {
                        const tr = p.tracks.find(t => t.id === entry.trackId);
                        const c = tr?.clips.find(x => x.id === entry.clipId);
                        if (!c) continue;
                        c.timingMode = 'timecode';
                        c.startSec = Number(Math.max(0, entry.startSec + clampedDx).toFixed(2));
                        c.durationSec = Number(entry.durationSec.toFixed(2));
                    }
                    return;
                }
                const tr = p.tracks.find(t => t.id === clipDrag.trackId);
                const c = tr?.clips.find(x => x.id === clipDrag.clipId);
                if (!c) return;
                c.timingMode = 'timecode';
                if (clipDrag.mode === 'move') {
                    c.startSec = Math.max(0, Number((clipDrag.origStart + dxSec).toFixed(2)));
                    c.durationSec = Number(clipDrag.origDur.toFixed(2));
                } else if (clipDrag.mode === 'right') {
                    c.startSec = Number(clipDrag.origStart.toFixed(2));
                    c.durationSec = Math.max(0.5, Number((clipDrag.origDur + dxSec).toFixed(2)));
                } else if (clipDrag.mode === 'left') {
                    const maxShift = clipDrag.origDur - 0.5;
                    const shift = Math.max(-clipDrag.origStart, Math.min(maxShift, dxSec));
                    c.startSec = Number((clipDrag.origStart + shift).toFixed(2));
                    c.durationSec = Number((clipDrag.origDur - shift).toFixed(2));
                }
            }, { reason: 'project', recordUndo });
        }
    }

    function handlePointerMove(ev) {
        if (!marquee && !scrubbing && !crawlResize && !cardResize && !clipDrag) return;
        lastPointerEv = ev;
        if (!dragMoveRaf) dragMoveRaf = requestAnimationFrame(processPointerMove);
    }

    function finishPointerInteraction(cancelled = false) {
        if (dragMoveRaf) {
            cancelAnimationFrame(dragMoveRaf);
            dragMoveRaf = 0;
        }
        lastPointerEv = null;
        if (marquee) {
            const mRect = marquee.rect;
            marquee.box.remove();
            marquee = null;
            if (!cancelled && mRect && gridEl) {
                const gridRect = gridEl.getBoundingClientRect();
                const hits = [];
                gridEl.querySelectorAll('[data-tl-clip]').forEach(el => {
                    const r = el.getBoundingClientRect();
                    const left = r.left - gridRect.left;
                    const top = r.top - gridRect.top;
                    const right = r.right - gridRect.left;
                    const bottom = r.bottom - gridRect.top;
                    if (right >= mRect.left && left <= mRect.right && bottom >= mRect.top && top <= mRect.bottom) {
                        hits.push(el.dataset.tlClip);
                    }
                });
                state.setClipSelectionSet(hits);
            }
        }
        scrubbing = false;
        cardResize = null;
        crawlResize = null;
        clipDrag = null;
    }

    const handlePointerUp = () => finishPointerInteraction(false);
    const handlePointerCancel = () => finishPointerInteraction(true);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    state.subscribe(reason => {
        if (marquee || state.store.studioView !== 'studio') return;
        if (['init', 'project-switched', 'solved', 'selection', 'timeline-zoom'].includes(reason)) {
            render();
        }
    });

    function destroy() {
        finishPointerInteraction(true);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
    }

    return { render, updatePlayhead, scrollEl, destroy };
}
