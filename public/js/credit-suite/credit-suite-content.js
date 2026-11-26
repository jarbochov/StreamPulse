/**
 * StreamPulse Credit Suite — Distraction-Free Content & Proofread View
 * Displays every Credit Block and Media/Side Clip in sequence order with content only
 * (headings, subtitles, names, roles, text, and asset thumbnails — zero formatting controls).
 */

const SVG_GRIP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const SVG_TRASH = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function friendlyAssetName(url) {
    if (!url) return '';
    const tail = String(url).split('/').pop() || url;
    try {
        return decodeURIComponent(tail).replace(/^[a-z0-9]{6,}-/i, '');
    } catch {
        return tail.replace(/^[a-z0-9]{6,}-/i, '');
    }
}

function copyText(text, btnEl) {
    const flash = () => {
        if (!btnEl) return;
        const prev = btnEl.dataset.origLabel || btnEl.textContent;
        btnEl.dataset.origLabel = prev;
        btnEl.textContent = 'Copied!';
        clearTimeout(btnEl._copyTimer);
        btnEl._copyTimer = setTimeout(() => { btnEl.textContent = prev; }, 1400);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(flash).catch(() => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                flash();
            } catch {}
        });
    }
}

export function mountCreditSuiteContent({ state }) {
    const viewEl = document.getElementById('cs-content-view');
    const searchEl = document.getElementById('cs-content-search');
    const filterEl = document.getElementById('cs-content-filter');
    const statsEl = document.getElementById('cs-content-stats');
    const copyBtn = document.getElementById('cs-content-copy-text');
    const listEl = document.getElementById('cs-content-blocks-list');
    const clipsEl = document.getElementById('cs-content-clips-list');
    const clipsWrap = document.getElementById('cs-content-clips-wrap');

    let query = '';
    let filterMode = 'all'; // 'all' | 'blocks' | 'clips'
    let blockSortable = null;
    const inlineSortables = [];

    searchEl?.addEventListener('input', () => {
        query = (searchEl.value || '').trim().toLowerCase();
        render();
    });

    filterEl?.addEventListener('change', () => {
        filterMode = filterEl.value || 'all';
        render();
    });

    copyBtn?.addEventListener('click', ev => {
        if (!state.store.project) return;
        const txt = window.StreamPulseCreditSuiteEngine.generatePlainText(state.store.project);
        copyText(txt, ev.currentTarget);
    });

    function cleanupSortables() {
        if (blockSortable) { blockSortable.destroy(); blockSortable = null; }
        while (inlineSortables.length) {
            try { inlineSortables.pop().destroy(); } catch {}
        }
    }

    function blockMatchesQuery(b) {
        if (!query) return true;
        const hay = [
            b.title,
            b.subtitle,
            b.content,
            b.caption,
            b.mediaUrl,
            ...(b.rows || []).flatMap(r => [r.role, r.name]),
            ...(b.names || []).flatMap(n => [n.name, n.editedName]),
            ...(b.logos || []).flatMap(l => [l.label, l.url])
        ].join(' ').toLowerCase();
        return hay.includes(query);
    }

    function clipMatchesQuery(c) {
        if (!query) return true;
        const hay = [c.name, c.elementType, c.text, c.subtext, c.caption, c.badgeLabel, c.counterLabel, c.counterValue, c.mediaUrl].join(' ').toLowerCase();
        return hay.includes(query);
    }

    function computeStats(proj) {
        const blocks = proj.blocks || [];
        let namesCount = 0;
        for (const b of blocks) {
            if (b.enabled === false) continue;
            if (b.type === 'role-split') namesCount += (b.rows || []).filter(r => r.checked !== false).length;
            else if (b.type === 'roster') namesCount += (b.names || []).filter(n => n.checked !== false).length;
        }
        const clipsCount = (proj.tracks || []).reduce((acc, tr) => acc + (tr.clips || []).length, 0);
        return `${blocks.length} blocks · ${namesCount} credited entries · ${clipsCount} side/overlay clips`;
    }

    function renderBlockCard(b, index) {
        const typeLabel = b.type === 'media' ? (b.mediaKind || 'image') : b.type.replace('-', ' ');
        const isDisabled = b.enabled === false;
        let inner = '';

        if (b.type === 'spacer') {
            inner = `<div class="cs-cr-muted">Blank vertical space (${b.spacerHeight || 120}px)</div>`;
        } else if (b.type === 'divider') {
            inner = `<div class="cs-cr-muted">Separator (${esc(b.dividerStyle || 'fade')})</div>`;
        } else {
            inner += `
                <div class="cs-cr-head-inputs">
                    <input type="text" class="cs-cr-title-input" data-cb="${esc(b.id)}" data-field="title" value="${esc(b.title || '')}" placeholder="Heading / Section title...">
                    <input type="text" class="cs-cr-sub-input" data-cb="${esc(b.id)}" data-field="subtitle" value="${esc(b.subtitle || '')}" placeholder="Subtitle (optional)...">
                </div>
            `;

            if (b.type === 'role-split') {
                const rows = b.rows || [];
                inner += `
                    <div class="cs-cr-rows" data-cr-rows="${esc(b.id)}">
                        ${rows.map((r, ri) => `
                            <div class="cs-cr-pair-row">
                                <span class="cs-grip" title="Drag row">${SVG_GRIP}</span>
                                <input type="checkbox" data-cr-rchk="${esc(b.id)}:${ri}" ${r.checked !== false ? 'checked' : ''} title="Include in credits">
                                <input type="text" data-cr-rrole="${esc(b.id)}:${ri}" value="${esc(r.role)}" placeholder="Role / Title">
                                <input type="text" data-cr-rname="${esc(b.id)}:${ri}" value="${esc(r.name)}" placeholder="Name">
                                <button type="button" class="cs-mini-icon-btn danger" data-cr-rdel="${esc(b.id)}:${ri}" title="Remove row">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="cs-cr-foot-actions">
                        <button type="button" class="cs-btn cs-btn-sm" data-cr-add-row="${esc(b.id)}">+ Add Role &amp; Name</button>
                    </div>
                `;
            } else if (b.type === 'roster') {
                const names = b.names || [];
                inner += `
                    <div class="cs-cr-rows" data-cr-names="${esc(b.id)}">
                        ${names.map((n, ni) => `
                            <div class="cs-cr-name-row">
                                <span class="cs-grip" title="Drag name">${SVG_GRIP}</span>
                                <input type="checkbox" data-cr-nchk="${esc(b.id)}:${ni}" ${n.checked !== false ? 'checked' : ''} title="Include in credits">
                                <input type="text" data-cr-nval="${esc(b.id)}:${ni}" value="${esc(n.editedName || n.name)}" placeholder="Name">
                                <button type="button" class="cs-mini-icon-btn danger" data-cr-ndel="${esc(b.id)}:${ni}" title="Remove name">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="cs-cr-foot-actions">
                        <button type="button" class="cs-btn cs-btn-sm" data-cr-add-name="${esc(b.id)}">+ Add Name</button>
                    </div>
                `;
            } else if (['featured', 'section', 'paragraph'].includes(b.type)) {
                inner += `<textarea class="cs-cr-textarea" data-cb="${esc(b.id)}" data-field="content" placeholder="Credit lines or paragraph text...">${esc(b.content || '')}</textarea>`;
            } else if (b.type === 'media' || b.type === 'split-row') {
                const thumb = b.mediaKind === 'icon'
                    ? `<div class="cs-cr-thumb-icon"><i class="${esc(b.mediaIcon || 'fa-solid fa-film')}"></i></div>`
                    : (b.mediaUrl
                        ? (b.mediaKind === 'video'
                            ? `<video class="cs-cr-thumb" src="${esc(b.mediaUrl)}" muted preload="metadata"></video>`
                            : `<img class="cs-cr-thumb" src="${esc(b.mediaUrl)}" alt="">`)
                        : `<div class="cs-cr-thumb-empty">No ${esc(b.mediaKind || 'image')}</div>`);
                inner += `
                    <div class="cs-cr-asset-row">
                        ${thumb}
                        <div class="cs-cr-asset-meta">
                            <div class="cs-cr-asset-file">${b.mediaKind === 'icon' ? esc(b.mediaIcon || 'Icon') : (esc(friendlyAssetName(b.mediaUrl)) || 'No asset chosen')}</div>
                            ${b.type === 'media'
                                ? `<input type="text" data-cb="${esc(b.id)}" data-field="caption" value="${esc(b.caption || '')}" placeholder="Caption (optional)...">`
                                : `<textarea class="cs-cr-textarea" data-cb="${esc(b.id)}" data-field="content" placeholder="Text beside media...">${esc(b.content || '')}</textarea>`
                            }
                        </div>
                        <button type="button" class="cs-btn cs-btn-sm" data-cr-pick-media="${esc(b.id)}">${b.mediaKind === 'icon' ? 'Pick Icon' : 'Choose Asset'}</button>
                    </div>
                `;
            } else if (b.type === 'logo-strip') {
                const logos = b.logos || [];
                inner += `
                    <div class="cs-cr-logos">
                        ${logos.map((lg, li) => `
                            <div class="cs-cr-logo-chip">
                                ${lg.url ? `<img src="${esc(lg.url)}" alt="">` : `<i class="${esc(lg.iconClass || 'fa-solid fa-star')}"></i>`}
                                <input type="text" data-cr-llbl="${esc(b.id)}:${li}" value="${esc(lg.label || '')}" placeholder="Label">
                                <button type="button" class="cs-mini-icon-btn danger" data-cr-ldel="${esc(b.id)}:${li}" title="Remove">&times;</button>
                            </div>
                        `).join('')}
                        <button type="button" class="cs-btn cs-btn-sm" data-cr-add-logo="${esc(b.id)}">+ Logo</button>
                    </div>
                `;
            }
        }

        return `
            <article class="cs-cr-card ${isDisabled ? 'disabled' : ''}" data-cr-block="${esc(b.id)}">
                <div class="cs-cr-card-head">
                    <span class="cs-grip" title="Drag to reorder">${SVG_GRIP}</span>
                    <span class="cs-cr-order">${index + 1}</span>
                    <span class="cs-pill">${esc(typeLabel)}</span>
                    <span class="cs-mode-chip ${b.presentation === 'card' ? 'card' : 'crawl'}">${b.presentation === 'card' ? 'Card' : 'Crawl'}</span>
                    <label class="cs-check-row" style="margin-left:auto;font-size:11px;color:var(--text-muted);">
                        <input type="checkbox" data-cr-enabled="${esc(b.id)}" ${!isDisabled ? 'checked' : ''}> Active
                    </label>
                    <button type="button" class="cs-mini-icon-btn danger" data-cr-del-block="${esc(b.id)}" title="Delete block">${SVG_TRASH}</button>
                </div>
                <div class="cs-cr-card-body">${inner}</div>
            </article>
        `;
    }

    function renderClipCard(tr, c) {
        const isMedia = c.elementType === 'image' || c.elementType === 'video';
        const isSlideshow = c.elementType === 'slideshow';
        const iconForClip = c.elementType === 'badge'
            ? c.badgeIcon
            : ((c.elementType === 'icon' || c.elementType === 'shape') ? c.iconClass : '');
        const slides = isSlideshow ? (c.slideshowImages || []).filter(Boolean) : [];
        const thumb = isMedia
            ? (c.mediaUrl
                ? (c.elementType === 'video'
                    ? `<video class="cs-cr-thumb" src="${esc(c.mediaUrl)}" muted preload="metadata"></video>`
                    : `<img class="cs-cr-thumb" src="${esc(c.mediaUrl)}" alt="">`)
                : `<div class="cs-cr-thumb-empty">No ${esc(c.elementType)}</div>`)
            : isSlideshow
                ? (slides[0]
                    ? `<img class="cs-cr-thumb" src="${esc(slides[0])}" alt="">`
                    : `<div class="cs-cr-thumb-empty">0 slides</div>`)
                : (iconForClip ? `<div class="cs-cr-thumb-icon"><i class="${esc(iconForClip)}"></i></div>` : '');

        return `
            <article class="cs-cr-card ${c.enabled === false ? 'disabled' : ''}">
                <div class="cs-cr-card-head">
                    <span class="cs-pill">${esc(tr.name)}</span>
                    <span class="cs-pill accent">${esc(c.elementType)}</span>
                    <input type="text" class="cs-cr-inline-name" data-cc="${esc(tr.id)}:${esc(c.id)}" data-field="name" value="${esc(c.name || '')}" placeholder="Clip name">
                    <button type="button" class="cs-mini-icon-btn danger" data-cr-del-clip="${esc(tr.id)}:${esc(c.id)}" title="Delete clip">${SVG_TRASH}</button>
                </div>
                <div class="cs-cr-card-body">
                    <div class="cs-cr-asset-row">
                        ${thumb}
                        <div class="cs-cr-asset-meta">
                            ${isMedia ? `<div class="cs-cr-asset-file">${esc(friendlyAssetName(c.mediaUrl)) || 'No asset chosen'}</div>` : ''}
                            ${isSlideshow ? `<div class="cs-cr-asset-file">${slides.length} slide${slides.length === 1 ? '' : 's'}${slides.length ? ': ' + esc(slides.map(friendlyAssetName).slice(0, 3).join(', ')) : ''}</div>` : ''}
                            ${(c.elementType === 'text' || c.elementType === 'shape') ? `<input type="text" data-cc="${esc(tr.id)}:${esc(c.id)}" data-field="text" value="${esc(c.text || '')}" placeholder="Heading / Text...">` : ''}
                            ${c.elementType === 'shape' ? `<textarea class="cs-cr-textarea" style="min-height:48px;" data-cc="${esc(tr.id)}:${esc(c.id)}" data-field="subtext" placeholder="Subtext...">${esc(c.subtext || '')}</textarea>` : ''}
                            ${isMedia ? `<input type="text" data-cc="${esc(tr.id)}:${esc(c.id)}" data-field="caption" value="${esc(c.caption || '')}" placeholder="Caption (optional)...">` : ''}
                            ${c.elementType === 'badge' ? `<input type="text" data-cc="${esc(tr.id)}:${esc(c.id)}" data-field="badgeLabel" value="${esc(c.badgeLabel || '')}" placeholder="Badge label">` : ''}
                            ${(c.elementType === 'counter' || c.elementType === 'meter') ? `<div class="cs-grid-2"><input type="text" data-cc="${esc(tr.id)}:${esc(c.id)}" data-field="counterLabel" value="${esc(c.counterLabel || '')}" placeholder="Label"><input type="text" data-cc="${esc(tr.id)}:${esc(c.id)}" data-field="counterValue" value="${esc(c.counterValue || '')}" placeholder="Value"></div>` : ''}
                            ${c.elementType === 'pattern' ? `<div class="cs-cr-asset-file">Pattern: ${esc(c.patternPreset || 'starfield')} (${esc(c.patternPalette || 'galaxy')})</div>` : ''}
                            ${c.elementType === 'cutout' ? `<div class="cs-cr-asset-file">Cutout punch-through zone</div>` : ''}
                        </div>
                        ${isMedia ? `<button type="button" class="cs-btn cs-btn-sm" data-cr-pick-clip="${esc(tr.id)}:${esc(c.id)}">Choose Asset</button>` : ''}
                    </div>
                </div>
            </article>
        `;
    }

    function render() {
        const proj = state.store.project;
        if (!proj || !viewEl || state.store.studioView !== 'content') return;

        cleanupSortables();
        if (statsEl) statsEl.textContent = computeStats(proj);

        const showBlocks = filterMode === 'all' || filterMode === 'blocks';
        const showClips = filterMode === 'all' || filterMode === 'clips';

        if (listEl) {
            listEl.style.display = showBlocks ? '' : 'none';
            if (showBlocks) {
                const visible = (proj.blocks || []).map((b, i) => ({ b, i })).filter(({ b }) => blockMatchesQuery(b));
                listEl.innerHTML = visible.length
                    ? visible.map(({ b, i }) => renderBlockCard(b, i)).join('')
                    : '<div class="cs-cr-empty">No matching credit blocks found.</div>';
            }
        }

        if (clipsWrap && clipsEl) {
            const allClips = [];
            for (const tr of (proj.tracks || [])) {
                for (const c of (tr.clips || [])) {
                    if (clipMatchesQuery(c)) allClips.push({ tr, c });
                }
            }
            clipsWrap.style.display = (showClips && allClips.length) ? '' : 'none';
            if (showClips && allClips.length) {
                clipsEl.innerHTML = allClips.map(({ tr, c }) => renderClipCard(tr, c)).join('');
            }
        }

        // Bind direct block field edits
        const editBlock = (bid, fn, opts = {}) => state.mutateProject(p => {
            const blk = p.blocks.find(x => x.id === bid);
            if (blk) fn(blk);
        }, opts);

        viewEl.querySelectorAll('[data-cb]').forEach(el => {
            el.addEventListener('input', () => editBlock(el.dataset.cb, b => { b[el.dataset.field] = el.value; }, { undoGroup: `cb:${el.dataset.cb}:${el.dataset.field}` }));
        });
        viewEl.querySelectorAll('[data-cr-enabled]').forEach(el => {
            el.addEventListener('change', () => editBlock(el.dataset.crEnabled, b => { b.enabled = el.checked; }, { reason: 'project-structure' }));
        });
        viewEl.querySelectorAll('[data-cr-del-block]').forEach(btn => {
            btn.addEventListener('click', () => {
                const bid = btn.dataset.crDelBlock;
                state.mutateProject(p => { p.blocks = p.blocks.filter(x => x.id !== bid); }, { reason: 'project-structure' });
            });
        });

        // Role-split inline controls
        viewEl.querySelectorAll('[data-cr-rchk]').forEach(el => {
            el.addEventListener('change', () => {
                const [bid, idx] = el.dataset.crRchk.split(':');
                editBlock(bid, b => { if (b.rows[Number(idx)]) b.rows[Number(idx)].checked = el.checked; });
            });
        });
        viewEl.querySelectorAll('[data-cr-rrole]').forEach(el => {
            el.addEventListener('input', () => {
                const [bid, idx] = el.dataset.crRrole.split(':');
                editBlock(bid, b => { if (b.rows[Number(idx)]) b.rows[Number(idx)].role = el.value; }, { undoGroup: `cr-r:${bid}:${idx}` });
            });
        });
        viewEl.querySelectorAll('[data-cr-rname]').forEach(el => {
            el.addEventListener('input', () => {
                const [bid, idx] = el.dataset.crRname.split(':');
                editBlock(bid, b => { if (b.rows[Number(idx)]) b.rows[Number(idx)].name = el.value; }, { undoGroup: `cr-n:${bid}:${idx}` });
            });
        });
        viewEl.querySelectorAll('[data-cr-rdel]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [bid, idx] = btn.dataset.crRdel.split(':');
                editBlock(bid, b => { b.rows.splice(Number(idx), 1); }, { reason: 'project-structure' });
            });
        });
        viewEl.querySelectorAll('[data-cr-add-row]').forEach(btn => {
            btn.addEventListener('click', () => {
                editBlock(btn.dataset.crAddRow, b => {
                    b.rows = b.rows || [];
                    b.rows.push({ id: `r-${Date.now()}`, role: '', name: '', checked: true });
                }, { reason: 'project-structure' });
            });
        });

        // Roster inline controls
        viewEl.querySelectorAll('[data-cr-nchk]').forEach(el => {
            el.addEventListener('change', () => {
                const [bid, idx] = el.dataset.crNchk.split(':');
                editBlock(bid, b => { if (b.names[Number(idx)]) b.names[Number(idx)].checked = el.checked; });
            });
        });
        viewEl.querySelectorAll('[data-cr-nval]').forEach(el => {
            el.addEventListener('input', () => {
                const [bid, idx] = el.dataset.crNval.split(':');
                editBlock(bid, b => {
                    const item = b.names[Number(idx)];
                    if (!item) return;
                    if (item.sourceKey) item.editedName = el.value;
                    else item.name = el.value;
                }, { undoGroup: `cr-nv:${bid}:${idx}` });
            });
        });
        viewEl.querySelectorAll('[data-cr-ndel]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [bid, idx] = btn.dataset.crNdel.split(':');
                editBlock(bid, b => { b.names.splice(Number(idx), 1); }, { reason: 'project-structure' });
            });
        });
        viewEl.querySelectorAll('[data-cr-add-name]').forEach(btn => {
            btn.addEventListener('click', () => {
                editBlock(btn.dataset.crAddName, b => {
                    b.names = b.names || [];
                    b.names.push({ id: `n-${Date.now()}`, name: '', editedName: '', checked: true });
                }, { reason: 'project-structure' });
            });
        });

        // Media & Logos
        viewEl.querySelectorAll('[data-cr-pick-media]').forEach(btn => {
            btn.addEventListener('click', () => {
                const bid = btn.dataset.crPickMedia;
                const blk = (proj.blocks || []).find(x => x.id === bid);
                if (!blk) return;
                if (blk.mediaKind === 'icon') {
                    window.IconPicker?.open({ value: blk.mediaIcon || '', onPick: cls => editBlock(bid, b => { b.mediaIcon = cls; }, { reason: 'project-structure' }) });
                } else {
                    window.ImagePicker?.open({ value: blk.mediaUrl || '', kind: blk.mediaKind === 'video' ? 'video' : 'image', onPick: url => editBlock(bid, b => { b.mediaUrl = url; }, { reason: 'project-structure' }) });
                }
            });
        });
        viewEl.querySelectorAll('[data-cr-llbl]').forEach(el => {
            el.addEventListener('input', () => {
                const [bid, idx] = el.dataset.crLlbl.split(':');
                editBlock(bid, b => { if (b.logos[Number(idx)]) b.logos[Number(idx)].label = el.value; }, { undoGroup: `cr-l:${bid}:${idx}` });
            });
        });
        viewEl.querySelectorAll('[data-cr-ldel]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [bid, idx] = btn.dataset.crLdel.split(':');
                editBlock(bid, b => { b.logos.splice(Number(idx), 1); }, { reason: 'project-structure' });
            });
        });
        viewEl.querySelectorAll('[data-cr-add-logo]').forEach(btn => {
            btn.addEventListener('click', () => {
                const bid = btn.dataset.crAddLogo;
                window.ImagePicker?.open({
                    kind: 'image',
                    onPick: url => editBlock(bid, b => {
                        b.logos = b.logos || [];
                        b.logos.push({ id: `lg-${Date.now()}`, url, iconClass: '', label: friendlyAssetName(url) });
                    }, { reason: 'project-structure' })
                });
            });
        });

        // Clips edits
        viewEl.querySelectorAll('[data-cc]').forEach(el => {
            el.addEventListener('input', () => {
                const [tid, cid] = el.dataset.cc.split(':');
                state.mutateProject(p => {
                    const c = p.tracks.find(t => t.id === tid)?.clips.find(x => x.id === cid);
                    if (c) c[el.dataset.field] = el.value;
                }, { undoGroup: `cc:${cid}:${el.dataset.field}` });
            });
        });
        viewEl.querySelectorAll('[data-cr-del-clip]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [tid, cid] = btn.dataset.crDelClip.split(':');
                state.mutateProject(p => {
                    const tr = p.tracks.find(t => t.id === tid);
                    if (tr) tr.clips = tr.clips.filter(x => x.id !== cid);
                }, { reason: 'project-structure' });
            });
        });
        viewEl.querySelectorAll('[data-cr-pick-clip]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [tid, cid] = btn.dataset.crPickClip.split(':');
                const clip = proj.tracks.find(t => t.id === tid)?.clips.find(x => x.id === cid);
                if (!clip) return;
                window.ImagePicker?.open({
                    value: clip.mediaUrl || '',
                    kind: clip.elementType === 'video' ? 'video' : 'image',
                    onPick: url => state.mutateProject(p => {
                        const c = p.tracks.find(t => t.id === tid)?.clips.find(x => x.id === cid);
                        if (c) c.mediaUrl = url;
                    }, { reason: 'project-structure' })
                });
            });
        });

        // Drag-and-drop reorder blocks & inline rows (only when not filtered by search)
        if (typeof Sortable !== 'undefined' && !query && listEl && showBlocks) {
            blockSortable = new Sortable(listEl, {
                animation: 150,
                handle: '.cs-cr-card-head .cs-grip',
                ghostClass: 'sortable-ghost',
                onEnd: evt => {
                    if (evt.oldIndex === evt.newIndex) return;
                    state.mutateProject(p => {
                        const [moved] = p.blocks.splice(evt.oldIndex, 1);
                        if (moved) p.blocks.splice(evt.newIndex, 0, moved);
                    }, { reason: 'project-structure' });
                }
            });
            viewEl.querySelectorAll('[data-cr-rows]').forEach(rowList => {
                const bid = rowList.dataset.crRows;
                inlineSortables.push(new Sortable(rowList, {
                    animation: 120,
                    handle: '.cs-grip',
                    onEnd: evt => {
                        if (evt.oldIndex === evt.newIndex) return;
                        editBlock(bid, b => { const [m] = b.rows.splice(evt.oldIndex, 1); b.rows.splice(evt.newIndex, 0, m); }, { reason: 'project-structure' });
                    }
                }));
            });
            viewEl.querySelectorAll('[data-cr-names]').forEach(nameList => {
                const bid = nameList.dataset.crNames;
                inlineSortables.push(new Sortable(nameList, {
                    animation: 120,
                    handle: '.cs-grip',
                    onEnd: evt => {
                        if (evt.oldIndex === evt.newIndex) return;
                        editBlock(bid, b => { const [m] = b.names.splice(evt.oldIndex, 1); b.names.splice(evt.newIndex, 0, m); }, { reason: 'project-structure' });
                    }
                }));
            });
        }
    }

    function isEditingTextIn(container) {
        const active = document.activeElement;
        if (!active || !container || !container.contains(active)) return false;
        if (active.tagName === 'TEXTAREA') return true;
        if (active.tagName === 'INPUT') {
            return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(active.type);
        }
        return Boolean(active.isContentEditable);
    }

    state.subscribe(reason => {
        if (state.store.studioView !== 'content') return;
        if (['init', 'project-switched', 'project-structure'].includes(reason)) {
            render();
        } else if (reason === 'project') {
            if (!isEditingTextIn(viewEl)) {
                render();
            }
        }
    });

    return { render };
}
