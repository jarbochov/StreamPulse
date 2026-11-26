/**
 * StreamPulse Credit Suite — Left Panel Outliner (Blocks + Floating Tracks)
 * Drag-and-drop ordering via SortableJS (zero up/down arrows).
 */

const SVG_GRIP = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const SVG_EYE = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_EYE_OFF = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const SVG_COPY = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const SVG_TRASH = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtSec(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const rem = (s % 60).toFixed(1).padStart(4, '0');
    return `${m}:${rem}`;
}

function makeDefaultBlock(kind) {
    const engine = window.StreamPulseCreditSuiteEngine;
    const id = `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const type = (kind === 'image' || kind === 'video' || kind === 'icon') ? 'media' : kind;
    const defaults = {
        featured: { title: 'FEATURED CREDIT', subtitle: 'Role or Billing', content: 'NAME HERE', presentation: 'card', duration: 4.5 },
        'role-split': {
            title: 'Production Crew',
            presentation: 'crawl',
            rows: [
                { id: `r-${Date.now()}-1`, role: 'Director', name: 'Alex Rivera', checked: true },
                { id: `r-${Date.now()}-2`, role: 'Producer', name: 'Jordan Blake', checked: true }
            ]
        },
        roster: {
            title: 'Special Thanks',
            presentation: 'crawl',
            columns: 2,
            names: [
                { id: `n-${Date.now()}-1`, name: 'Casey Morgan', checked: true },
                { id: `n-${Date.now()}-2`, name: 'Taylor Quinn', checked: true },
                { id: `n-${Date.now()}-3`, name: 'Riley Vance', checked: true },
                { id: `n-${Date.now()}-4`, name: 'Avery Sterling', checked: true }
            ]
        },
        section: { title: 'Department', presentation: 'crawl', columns: 1, content: 'Line One\nLine Two' },
        paragraph: { title: '', presentation: 'crawl', content: 'Write your dedication, copyright notice, or closing message here.' },
        image: { title: '', presentation: 'crawl', mediaKind: 'image', mediaUrl: '', caption: '' },
        video: { title: '', presentation: 'crawl', mediaKind: 'video', mediaUrl: '', caption: '' },
        icon: { title: '', presentation: 'crawl', mediaKind: 'icon', mediaIcon: 'fa-solid fa-star', mediaWidth: 140, caption: '' },
        media: { title: '', presentation: 'crawl', mediaKind: 'image', mediaUrl: '', caption: '' },
        'logo-strip': {
            title: 'Partners & Tools',
            presentation: 'crawl',
            logos: [
                { id: `lg-${Date.now()}-1`, iconClass: 'fa-solid fa-bolt', label: 'Partner One' },
                { id: `lg-${Date.now()}-2`, iconClass: 'fa-solid fa-star', label: 'Partner Two' }
            ]
        },
        'split-row': {
            title: 'Spotlight Moment',
            presentation: 'crawl',
            mediaKind: 'icon',
            mediaIcon: 'fa-solid fa-camera-retro',
            mediaPosition: 'left',
            content: 'Pair an image, video, or icon directly beside scrolling credit text.'
        },
        divider: { title: 'Divider', presentation: 'crawl', dividerStyle: 'ornament' },
        spacer: { title: 'Spacer', presentation: 'crawl', spacerHeight: 140 }
    };
    return engine.normalizeBlock({ id, type, ...(defaults[kind] || defaults[type] || {}) });
}

function makeDefaultClip(elementType, trackLayer, currentTimeSec = 0) {
    const engine = window.StreamPulseCreditSuiteEngine;
    const id = `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const isBehind = trackLayer === 'behind';
    const base = {
        id,
        elementType,
        name: `${elementType[0].toUpperCase()}${elementType.slice(1)} Clip`,
        timingMode: 'timecode',
        startSec: Number(currentTimeSec.toFixed(2)),
        durationSec: 10,
        x: isBehind ? 0 : 5,
        y: isBehind ? 0 : 16,
        width: isBehind ? 100 : 40,
        height: isBehind ? 100 : 68,
        pushCredits: isBehind ? 'none' : 'auto',
        enterAnim: isBehind ? 'fade' : 'slide-left',
        exitAnim: 'fade',
        shadow: !isBehind
    };
    if (elementType === 'text') {
        base.text = 'CHAPTER TITLE';
        base.height = 18;
        base.y = 40;
    } else if (elementType === 'badge') {
        base.width = 24;
        base.height = 10;
        base.x = 6;
        base.y = 8;
        base.pushCredits = 'none';
    } else if (elementType === 'counter' || elementType === 'meter') {
        base.width = 26;
        base.height = 18;
        base.x = 6;
        base.y = 72;
        base.pushCredits = 'none';
    } else if (elementType === 'icon') {
        base.width = 16;
        base.height = 24;
        base.x = 8;
        base.y = 36;
    } else if (elementType === 'shape') {
        base.text = 'FEATURED CARD';
        base.subtext = 'Side showcase panel';
        base.fillGradient = true;
        base.borderStyle = 'corner-brackets';
        base.borderWidth = 3;
        base.borderColor = '#E5C07BFF';
    }
    return engine.normalizeClip(base);
}

export function mountCreditSuiteBlocks({ state, seekToTime }) {
    const tabBlocksBtn = document.getElementById('cs-outliner-tab-blocks');
    const tabTracksBtn = document.getElementById('cs-outliner-tab-tracks');
    const addBar = document.getElementById('cs-outliner-add-bar');
    const listEl = document.getElementById('cs-outliner-list');
    let sortableInst = null;
    let menuOpen = false;

    tabBlocksBtn?.addEventListener('click', () => { menuOpen = false; state.setOutlinerTab('blocks'); });
    tabTracksBtn?.addEventListener('click', () => { menuOpen = false; state.setOutlinerTab('tracks'); });

    document.addEventListener('click', ev => {
        if (menuOpen && !ev.target.closest('#cs-outliner-add-bar')) {
            menuOpen = false;
            renderAddBar();
        }
    });

    function addBlock(type) {
        const blk = makeDefaultBlock(type);
        state.mutateProject(p => {
            p.blocks.push(blk);
        });
        state.setSelection('block', blk.id);
        menuOpen = false;
        renderAddBar();
    }

    function addTrack(layer = 'side') {
        const engine = window.StreamPulseCreditSuiteEngine;
        const labelMap = { behind: 'Backdrop Track', side: 'Side Media Track', above: 'Foreground Overlay' };
        state.mutateProject(p => {
            p.tracks.push(engine.normalizeTrack({
                id: `trk-${Date.now().toString(36)}`,
                name: `${labelMap[layer] || 'Track'} ${p.tracks.length + 1}`,
                layer,
                clips: []
            }, p.tracks.length));
        });
    }

    function addClipToTrack(trackId, elementType) {
        const proj = state.store.project;
        if (!proj) return;
        const tr = proj.tracks.find(t => t.id === trackId) || proj.tracks[0];
        if (!tr) return;
        const curT = Number(window.__csStudioTime || 0);
        const clip = makeDefaultClip(elementType, tr.layer, curT);
        state.mutateProject(p => {
            const target = p.tracks.find(t => t.id === tr.id);
            if (target) target.clips.push(clip);
        });
        state.setSelection('clip', clip.id, tr.id);
        menuOpen = false;
        renderAddBar();
    }

    function renderAddBar() {
        if (!addBar) return;
        const engine = window.StreamPulseCreditSuiteEngine;
        const tab = state.store.outlinerTab;
        if (tab === 'blocks') {
            const addOptions = [
                { id: 'featured', label: 'Featured Card' },
                { id: 'role-split', label: 'Role & Name Split' },
                { id: 'roster', label: 'Multi-Col Roster' },
                { id: 'section', label: 'Stacked Section' },
                { id: 'paragraph', label: 'Paragraph / Legal' },
                { id: 'image', label: 'Image Block' },
                { id: 'video', label: 'Video Block' },
                { id: 'icon', label: 'Icon Block' },
                { id: 'logo-strip', label: 'Logo / Sponsor Strip' },
                { id: 'split-row', label: 'Inline Split Row' },
                { id: 'divider', label: 'Divider' },
                { id: 'spacer', label: 'Spacer' }
            ];
            addBar.innerHTML = `
                <button type="button" class="cs-btn cs-btn-primary" id="cs-btn-add-block-toggle" style="flex:1;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Credit Block
                </button>
                <div class="cs-add-menu ${menuOpen ? 'open' : ''}" id="cs-add-block-menu">
                    ${addOptions.map(bt => `<button type="button" data-add-block="${bt.id}">${esc(bt.label)}</button>`).join('')}
                </div>
            `;
            addBar.querySelector('#cs-btn-add-block-toggle')?.addEventListener('click', ev => {
                ev.stopPropagation();
                menuOpen = !menuOpen;
                renderAddBar();
            });
            addBar.querySelectorAll('[data-add-block]').forEach(btn => {
                btn.addEventListener('click', () => addBlock(btn.dataset.addBlock));
            });
        } else {
            const tracks = state.store.project?.tracks || [];
            const defaultTrackId = tracks.find(t => t.layer === 'side')?.id || tracks[0]?.id || '';
            addBar.innerHTML = `
                <button type="button" class="cs-btn cs-btn-primary" id="cs-btn-add-clip-toggle" style="flex:1;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Visual Clip
                </button>
                <button type="button" class="cs-btn" id="cs-btn-new-track" title="Add Track">+ Track</button>
                <div class="cs-add-menu ${menuOpen ? 'open' : ''}" id="cs-add-clip-menu">
                    ${engine.CLIP_ELEMENT_TYPES.map(ct => `<button type="button" data-add-clip="${ct}">${esc(ct[0].toUpperCase() + ct.slice(1))}</button>`).join('')}
                </div>
            `;
            addBar.querySelector('#cs-btn-add-clip-toggle')?.addEventListener('click', ev => {
                ev.stopPropagation();
                menuOpen = !menuOpen;
                renderAddBar();
            });
            addBar.querySelector('#cs-btn-new-track')?.addEventListener('click', () => addTrack('side'));
            addBar.querySelectorAll('[data-add-clip]').forEach(btn => {
                btn.addEventListener('click', () => addClipToTrack(defaultTrackId, btn.dataset.addClip));
            });
        }
    }

    function renderList() {
        const proj = state.store.project;
        if (!proj || !listEl) return;

        tabBlocksBtn?.classList.toggle('active', state.store.outlinerTab === 'blocks');
        tabTracksBtn?.classList.toggle('active', state.store.outlinerTab === 'tracks');
        renderAddBar();

        if (sortableInst) {
            sortableInst.destroy();
            sortableInst = null;
        }

        if (state.store.outlinerTab === 'blocks') {
            const solved = state.store.solved;
            const sel = state.store.selection;
            if (!proj.blocks.length) {
                listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">No credit blocks yet. Click <strong>Add Credit Block</strong> above to begin.</div>';
                return;
            }
            listEl.innerHTML = proj.blocks.map(b => {
                const isSel = sel.kind === 'block' && sel.id === b.id;
                const bt = solved?.blockTimings?.[b.id];
                const tLabel = bt ? fmtSec(bt.kind === 'crawl' ? bt.focusStartSec : bt.startSec) : '--:--';
                const label = b.title || (b.type === 'divider' ? `Divider (${b.dividerStyle})` : b.type === 'spacer' ? `Spacer (${b.spacerHeight}px)` : b.type === 'media' ? `${(b.mediaKind || 'image')[0].toUpperCase()}${(b.mediaKind || 'image').slice(1)} Block` : b.type.replace('-', ' '));
                const typeLabel = b.type === 'media' ? (b.mediaKind || 'image') : b.type.replace('-', ' ');
                return `
                    <div class="cs-block-row ${isSel ? 'selected' : ''} ${b.enabled === false ? 'disabled' : ''}" data-block-id="${esc(b.id)}">
                        <span class="cs-grip" title="Drag to reorder">${SVG_GRIP}</span>
                        <div class="cs-block-row-meta">
                            <div class="cs-block-row-title">${esc(label)}</div>
                            <div class="cs-block-row-sub">
                                <span>${esc(typeLabel)}</span>
                                <span>${tLabel}</span>
                                ${b.marker ? `<span style="color:#f59e0b;">#${esc(b.marker)}</span>` : ''}
                            </div>
                        </div>
                        <button type="button" class="cs-mode-chip ${b.presentation === 'card' ? 'card' : 'crawl'}" data-act="toggle-pres" title="Toggle Card (Fade) vs Crawl (Scroll)">
                            ${b.presentation === 'card' ? 'Card' : 'Crawl'}
                        </button>
                        <div class="cs-row-actions">
                            <button type="button" class="cs-mini-icon-btn" data-act="toggle-en" title="${b.enabled === false ? 'Show block' : 'Hide block'}">${b.enabled === false ? SVG_EYE_OFF : SVG_EYE}</button>
                            <button type="button" class="cs-mini-icon-btn" data-act="dup" title="Duplicate">${SVG_COPY}</button>
                            <button type="button" class="cs-mini-icon-btn danger" data-act="del" title="Delete">${SVG_TRASH}</button>
                        </div>
                    </div>
                `;
            }).join('');

            listEl.querySelectorAll('.cs-block-row').forEach(row => {
                const id = row.dataset.blockId;
                row.addEventListener('click', ev => {
                    const actBtn = ev.target.closest('[data-act]');
                    if (actBtn) {
                        ev.stopPropagation();
                        const act = actBtn.dataset.act;
                        if (act === 'toggle-pres') {
                            state.mutateProject(p => {
                                const blk = p.blocks.find(x => x.id === id);
                                if (blk) blk.presentation = blk.presentation === 'card' ? 'crawl' : 'card';
                            });
                        } else if (act === 'toggle-en') {
                            state.mutateProject(p => {
                                const blk = p.blocks.find(x => x.id === id);
                                if (blk) blk.enabled = blk.enabled === false ? true : false;
                            });
                        } else if (act === 'dup') {
                            state.mutateProject(p => {
                                const idx = p.blocks.findIndex(x => x.id === id);
                                if (idx >= 0) {
                                    const copy = JSON.parse(JSON.stringify(p.blocks[idx]));
                                    copy.id = `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
                                    p.blocks.splice(idx + 1, 0, copy);
                                }
                            });
                        } else if (act === 'del') {
                            state.mutateProject(p => {
                                p.blocks = p.blocks.filter(x => x.id !== id);
                            });
                            if (state.store.selection.id === id) state.setSelection(null, null);
                        }
                        return;
                    }
                    state.setSelection('block', id);
                    const bt = state.store.solved?.blockTimings?.[id];
                    if (bt && seekToTime) {
                        seekToTime(bt.kind === 'crawl' ? bt.centerSec : bt.startSec + Math.min(1, bt.durationSec * 0.35));
                    }
                });
            });

            if (typeof Sortable !== 'undefined') {
                sortableInst = new Sortable(listEl, {
                    animation: 140,
                    handle: '.cs-grip',
                    ghostClass: 'sortable-ghost',
                    onEnd: evt => {
                        if (evt.oldIndex === evt.newIndex) return;
                        state.mutateProject(p => {
                            const [moved] = p.blocks.splice(evt.oldIndex, 1);
                            if (moved) p.blocks.splice(evt.newIndex, 0, moved);
                        });
                    }
                });
            }
        } else {
            // Tracks & Floating Clips View
            const sel = state.store.selection;
            const resolvedMap = new Map((state.store.solved?.resolvedClips || []).map(rc => [rc.clip.id, rc]));
            listEl.innerHTML = (proj.tracks || []).map(tr => {
                const layerLabel = tr.layer === 'behind' ? 'Behind' : (tr.layer === 'above' ? 'Above' : 'Side');
                const clipsHtml = (tr.clips || []).map(c => {
                    const isSel = (sel.kind === 'clip' && sel.id === c.id) || state.store.selectedClipIds?.has(c.id);
                    const rc = resolvedMap.get(c.id);
                    const tSpan = rc ? `${fmtSec(rc.startSec)} – ${fmtSec(rc.endSec)}` : `${fmtSec(c.startSec)}`;
                    return `
                        <div class="cs-block-row ${isSel ? 'selected' : ''} ${c.enabled === false ? 'disabled' : ''}" data-clip-id="${esc(c.id)}" data-track-id="${esc(tr.id)}">
                            <div class="cs-block-row-meta">
                                <div class="cs-block-row-title">${esc(c.name || c.elementType)}</div>
                                <div class="cs-block-row-sub">
                                    <span>${esc(c.elementType)}</span>
                                    <span>${tSpan}</span>
                                    ${c.timingMode === 'block' ? '<span style="color:#34d399;">Synced</span>' : ''}
                                </div>
                            </div>
                            <div class="cs-row-actions">
                                <button type="button" class="cs-mini-icon-btn" data-clip-act="toggle-en" title="Toggle clip">${c.enabled === false ? SVG_EYE_OFF : SVG_EYE}</button>
                                <button type="button" class="cs-mini-icon-btn danger" data-clip-act="del" title="Delete clip">${SVG_TRASH}</button>
                            </div>
                        </div>
                    `;
                }).join('') || '<div style="font-size:11px;color:var(--text-muted);padding:4px 6px;">No clips on this track</div>';

                return `
                    <div class="cs-section" style="padding:8px;">
                        <div class="cs-section-head">
                            <span>${esc(tr.name)} <span style="opacity:0.6;">(${layerLabel})</span></span>
                            <div style="display:flex;gap:4px;">
                                <select data-track-layer="${esc(tr.id)}" style="font-size:10px;padding:1px 4px;background:var(--bg-card);color:var(--text);border:1px solid var(--border);border-radius:4px;">
                                    <option value="side" ${tr.layer === 'side' ? 'selected' : ''}>Side</option>
                                    <option value="behind" ${tr.layer === 'behind' ? 'selected' : ''}>Behind</option>
                                    <option value="above" ${tr.layer === 'above' ? 'selected' : ''}>Above</option>
                                </select>
                                ${proj.tracks.length > 1 ? `<button type="button" class="cs-mini-icon-btn danger" data-del-track="${esc(tr.id)}" title="Delete track">${SVG_TRASH}</button>` : ''}
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:5px;">${clipsHtml}</div>
                    </div>
                `;
            }).join('');

            listEl.querySelectorAll('[data-track-layer]').forEach(selEl => {
                selEl.addEventListener('change', () => {
                    const tid = selEl.dataset.trackLayer;
                    state.mutateProject(p => {
                        const tr = p.tracks.find(t => t.id === tid);
                        if (tr) tr.layer = selEl.value;
                    });
                });
            });
            listEl.querySelectorAll('[data-del-track]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tid = btn.dataset.delTrack;
                    state.mutateProject(p => {
                        p.tracks = p.tracks.filter(t => t.id !== tid);
                    }, { reason: 'project-structure' });
                });
            });
            listEl.querySelectorAll('[data-clip-id]').forEach(row => {
                const cid = row.dataset.clipId;
                const tid = row.dataset.trackId;
                row.addEventListener('click', ev => {
                    const act = ev.target.closest('[data-clip-act]')?.dataset.clipAct;
                    if (act) {
                        ev.stopPropagation();
                        if (act === 'toggle-en') {
                            state.mutateProject(p => {
                                const tr = p.tracks.find(t => t.id === tid);
                                const c = tr?.clips.find(x => x.id === cid);
                                if (c) c.enabled = c.enabled === false ? true : false;
                            }, { reason: 'project-structure' });
                        } else if (act === 'del') {
                            state.mutateProject(p => {
                                const tr = p.tracks.find(t => t.id === tid);
                                if (tr) tr.clips = tr.clips.filter(x => x.id !== cid);
                            }, { reason: 'project-structure' });
                        }
                        return;
                    }
                    state.setSelection('clip', cid, tid);
                    const rc = resolvedMap.get(cid);
                    if (rc && seekToTime) seekToTime(rc.startSec + Math.min(1.2, rc.durationSec * 0.35));
                });
            });
        }
    }

    state.subscribe(reason => {
        if (['init', 'project-structure', 'project-switched', 'selection', 'outliner-ui', 'solved'].includes(reason)) {
            renderList();
        }
    });

    return { renderList, addBlock, addTrack, addClipToTrack };
}
