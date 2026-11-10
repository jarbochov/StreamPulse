import { gradientStyle } from './styles.js';
import { inPlanList } from './variables.js';


// Draws or updates a progress bar/ring in place so CSS transitions keep animating between ticks.
function renderProgress(node, element, expand) {
    const config = element.progress || {};
    const style = element.style || {};
    const ring = config.kind === 'ring';
    const raw = parseFloat(expand(element.content || '0'));
    const percent = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
    const label = expand(String(config.label ?? '{{progress}}%').replace(/\{\{\s*progress\s*\}\}/g, String(Math.round(percent))));
    const key = ring ? 'ring' : 'bar';
    if (node._progressKind !== key) {
        node._progressKind = key;
        const ns = 'http://www.w3.org/2000/svg';
        const holder = document.createElement('div');
        holder.style.cssText = 'position:absolute;inset:0;border-radius:inherit;overflow:hidden;';
        if (ring) {
            const svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', '0 0 100 100');
            svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
            const track = document.createElementNS(ns, 'circle'), arc = document.createElementNS(ns, 'circle');
            for (const circle of [track, arc]) { circle.setAttribute('cx', '50'); circle.setAttribute('cy', '50'); circle.setAttribute('fill', 'none'); }
            arc.setAttribute('stroke-linecap', 'round');
            arc.setAttribute('transform', 'rotate(-90 50 50)');
            arc.style.transition = 'stroke-dashoffset .5s linear';
            svg.append(track, arc);
            holder.appendChild(svg);
            holder._track = track; holder._fill = arc;
        } else {
            const track = document.createElement('div'), fill = document.createElement('div');
            track.style.cssText = 'position:absolute;inset:0;';
            fill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;transition:width .5s linear;';
            track.appendChild(fill);
            holder.appendChild(track);
            holder._track = track; holder._fill = fill;
        }
        const text = document.createElement('div');
        text.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;white-space:nowrap;';
        holder._text = text;
        holder.appendChild(text);
        node.replaceChildren(holder);
        node._progress = holder;
    }
    const holder = node._progress;
    if (ring) {
        const thickness = Math.max(2, Math.min(40, config.thickness || 10));
        const radius = 50 - thickness / 2, circumference = 2 * Math.PI * radius;
        holder._track.setAttribute('r', radius); holder._track.setAttribute('stroke', config.trackColor || 'rgba(255,255,255,.18)'); holder._track.setAttribute('stroke-width', thickness);
        holder._fill.setAttribute('r', radius); holder._fill.setAttribute('stroke', style.fill || '#1f6feb'); holder._fill.setAttribute('stroke-width', thickness);
        holder._fill.style.strokeDasharray = circumference;
        holder._fill.style.strokeDashoffset = circumference * (1 - percent / 100);
    } else {
        holder._track.style.background = config.trackColor || 'rgba(255,255,255,.18)';
        holder._fill.style.background = style.fill || '#1f6feb';
        holder._fill.style.width = `${percent}%`;
        const fillStyle = style.gradient?.enabled ? gradientStyle(style.gradient) : { backgroundSize: '', animation: '' };
        Object.assign(holder._fill.style, fillStyle);
    }
    holder._text.textContent = config.showLabel === false ? '' : label;
}

function ensureTickerStyle() {
    if (document.getElementById('sp-gl-ticker')) return;
    const tag = document.createElement('style');
    tag.id = 'sp-gl-ticker';
    tag.textContent = '@keyframes spGlTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes spGlTickerR{from{transform:translateX(-50%)}to{transform:translateX(0)}}.sp-fx-paused [data-gl-ticker-body]{animation-play-state:paused!important}';
    document.head.appendChild(tag);
}

function matchesPeriodToken(item, token) {
    if (!item || !token) return true;
    const t = String(token).trim().toLowerCase();
    if (!t || t === 'all') return true;

    const itemDates = [
        item.streamDate,
        ...(Array.isArray(item.streamDates) ? item.streamDates.map(d => typeof d === 'string' ? d : d?.date) : [])
    ].filter(Boolean);

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowStr = `${tom.getFullYear()}-${pad(tom.getMonth() + 1)}-${pad(tom.getDate())}`;

    const dayOfWeek = now.getDay();
    const diffToMon = (dayOfWeek + 6) % 7;
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
    const weekStartStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
    const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon + 6);
    const weekEndStr = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;

    const periodLower = String(item.period || '').trim().toLowerCase();

    if (t === '@today' || t === 'today' || t === 'tonight') {
        return item.status === 'tonight' ||
               periodLower === 'tonight' ||
               periodLower === 'today' ||
               itemDates.includes(todayStr);
    }
    if (t === '@tomorrow' || t === 'tomorrow' || t === 'next-stream' || t === 'next stream') {
        return periodLower === 'next stream' ||
               periodLower === 'next-stream' ||
               periodLower === 'tomorrow' ||
               itemDates.includes(tomorrowStr);
    }
    if (t === '@this-week' || t === 'this-week' || t === 'thisweek' || t === 'this week') {
        return periodLower === 'this week' ||
               periodLower === 'weekend' ||
               itemDates.some(d => d >= weekStartStr && d <= weekEndStr);
    }
    if (t === '@upcoming' || t === 'upcoming') {
        return itemDates.some(d => d >= todayStr) ||
               Boolean(item.streamRecurring) ||
               (periodLower && !['played', 'backlog'].includes(periodLower) && !['played', 'backlog'].includes(item.status));
    }
    if (t === '@unscheduled' || t === 'unscheduled' || t === 'none' || t === 'no-period' || t === 'undated') {
        return !periodLower && itemDates.length === 0;
    }

    if (t.startsWith('!')) {
        const notToken = t.slice(1).trim().toLowerCase();
        return periodLower !== notToken;
    }

    return periodLower === t;
}

function matchesPeriodFilter(item, wantedTokens) {
    if (!item) return false;
    if (!wantedTokens || !wantedTokens.length) return true;
    const tokens = (Array.isArray(wantedTokens) ? wantedTokens : String(wantedTokens).split(','))
        .map(t => String(t).trim())
        .filter(Boolean);
    if (!tokens.length) return true;

    const pos = tokens.filter(t => !t.startsWith('!'));
    const neg = tokens.filter(t => t.startsWith('!'));

    if (neg.some(t => !matchesPeriodToken(item, t))) {
        return false;
    }
    if (!pos.length) return true;
    return pos.some(t => matchesPeriodToken(item, t));
}

// Renders the manual game plan as a cover grid, a cover strip or a text list.
function renderGameList(node, element, plan) {
    const config = element.gameList || {};
    const style = element.style || {};
    let items = (plan?.items || []).filter(item => {
        if (config.filter === 'all') return true;
        if (config.filter === 'scheduled-only') {
            return (item.status === 'scheduled' || (item.extraLists || []).includes('scheduled')) && item.status !== 'tonight';
        }
        if (config.filter === 'scheduled' || !config.filter) {
            return item.status === 'scheduled' || item.status === 'tonight' || (item.extraLists || []).includes('scheduled');
        }
        return inPlanList(item, config.filter);
    });
    const order = (plan?.periods || []).map(name => String(name).toLowerCase());
    const rank = item => { const at = order.indexOf(String(item.period || '').toLowerCase()); return at < 0 ? order.length : at; };
    const wanted = (Array.isArray(config.periods) && config.periods.length ? config.periods : config.period ? [config.period] : []);
    if (wanted.length) items = items.filter(item => matchesPeriodFilter(item, wanted));
    // Date filter and grouping use the dates a game was streamed on (auto-recorded) plus its finished date.
    const datesOf = item => [...new Set([...(item.played || []), item.finished].filter(Boolean))];
    const monthKey = (year, month) => { const d = new Date(year, month, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const today = new Date();
    const when = config.when || '';
    const inWindow = !when ? null
        : when === 'thisYear' ? date => date.startsWith(String(today.getFullYear()))
        : when === 'lastYear' ? date => date.startsWith(String(today.getFullYear() - 1))
        : when === 'thisMonth' ? date => date.startsWith(monthKey(today.getFullYear(), today.getMonth()))
        : when === 'lastMonth' ? date => date.startsWith(monthKey(today.getFullYear(), today.getMonth() - 1))
        : date => date.startsWith(when);
    if (inWindow) items = items.filter(item => datesOf(item).some(inWindow));
    if (config.groupBy === 'month' || config.groupBy === 'year') {
        const size = config.groupBy === 'month' ? 7 : 4;
        const label = key => !key ? 'Undated' : size === 7 ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : key;
        items = items.flatMap(item => {
            const keys = [...new Set(datesOf(item).filter(date => !inWindow || inWindow(date)).map(date => date.slice(0, size)))].sort();
            return (keys.length ? keys : ['']).map(key => ({ ...item, period: label(key), __groupKey: key }));
        }).sort((a, b) => a.__groupKey.localeCompare(b.__groupKey));
    }
    if (config.maxPeriods > 0) {
        const keep = [...new Set(items.map(item => item.period || ''))].sort((a, b) => rank({ period: a }) - rank({ period: b })).slice(0, config.maxPeriods);
        items = items.filter(item => keep.includes(item.period || ''));
    }

    const listMap = new Map((plan?.lists || []).map(l => [l.id, l.name]));
    const statusNames = { scheduled: 'Scheduled', backlog: 'Backlog', played: 'Played', tonight: 'Tonight' };
    for (const entry of plan?.lists || []) statusNames[entry.id] = entry.name;

    const dateVal = item => item.streamDate || item.finished || (Array.isArray(item.played) ? item.played[0] : '') || '';
    const groupVal = item => listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean) || item.period || '';
    const STATUS_PRIORITY = { tonight: 1, scheduled: 2, 'up-next': 3, backlog: 4, played: 5 };

    const sortMode = config.sort || 'plan';
    if (sortMode === 'date' || sortMode === 'date-asc') {
        items = [...items].sort((a, b) => {
            const dA = dateVal(a), dB = dateVal(b);
            if (dA && dB) return dA.localeCompare(dB) || String(a.name).localeCompare(String(b.name));
            if (dA && !dB) return -1;
            if (!dA && dB) return 1;
            return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name));
        });
    } else if (sortMode === 'date-desc') {
        items = [...items].sort((a, b) => {
            const dA = dateVal(a), dB = dateVal(b);
            if (dA && dB) return dB.localeCompare(dA) || String(a.name).localeCompare(String(b.name));
            if (dA && !dB) return -1;
            if (!dA && dB) return 1;
            return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name));
        });
    } else if (sortMode === 'group' || sortMode === 'collection') {
        items = [...items].sort((a, b) => {
            const gA = groupVal(a), gB = groupVal(b);
            if (gA && gB && gA !== gB) return gA.localeCompare(gB);
            if (gA && !gB) return -1;
            if (!gA && gB) return 1;
            const dA = dateVal(a), dB = dateVal(b);
            return (dA && dB ? dA.localeCompare(dB) : 0) || String(a.name).localeCompare(String(b.name));
        });
    } else if (sortMode === 'status') {
        items = [...items].sort((a, b) => {
            const sA = STATUS_PRIORITY[a.status] || 50;
            const sB = STATUS_PRIORITY[b.status] || 50;
            if (sA !== sB) return sA - sB;
            const dA = dateVal(a), dB = dateVal(b);
            return (dA && dB ? dA.localeCompare(dB) : 0) || String(a.name).localeCompare(String(b.name));
        });
    } else if (sortMode === 'name' || sortMode === 'name-asc') {
        items = [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    } else if (sortMode === 'name-desc') {
        items = [...items].sort((a, b) => String(b.name).localeCompare(String(a.name)));
    } else if (sortMode === 'rating') {
        items = [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.name).localeCompare(String(b.name)));
    } else {
        // 'plan' order (default)
        items = items.map((item, at) => ({ item, at })).sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at).map(entry => entry.item);
    }

    if (config.max > 0) items = items.slice(0, config.max);

    const layout = config.layout || 'grid';
    if (layout === 'ticker') ensureTickerStyle();
    const gap = config.gap ?? 12;
    const groupGap = config.groupGap ?? gap;
    const accent = config.accent || '#3fb950';
    node.replaceChildren();
    node._fitObserver?.disconnect();
    node._fitObserver = null;
    node.style.display = 'block';
    node.style.overflow = 'hidden';
    node.style.whiteSpace = 'normal';
    if (!items.length) {
        const empty = document.createElement('div');
        empty.style.opacity = '.6';
        empty.textContent = 'No games to show. Add some in the Game Plan editor.';
        node.appendChild(empty);
        return;
    }

    const inner = document.createElement('div');
    inner.style.transformOrigin = 'top left';
    node.appendChild(inner);
    const sections = [];
    const kanban = layout === 'kanban';
    const tiers = layout === 'tiers';
    const ticker = layout === 'ticker';
    const alignH = config.alignH || 'left', alignV = config.alignV || 'top';
    const hAlign = kanban || ticker ? 'left' : alignH;
    const just = { left: 'flex-start', center: 'center', right: 'flex-end' }[hAlign];
    const coverMargin = { left: '0 auto 0 0', center: '0 auto', right: '0 0 0 auto' }[hAlign];
    const TIERS = [[5, 'S', '#ff7f7f'], [4, 'A', '#ffbf7f'], [3, 'B', '#ffdf7f'], [2, 'C', '#bfff7f'], [1, 'D', '#7fbfff'], [0, '?', '#b0b0b0']];
    const TIER_LETTERS = [['S', '#ff7f7f'], ['A', '#ffbf7f'], ['B', '#ffdf7f'], ['C', '#bfff7f'], ['D', '#7fbfff'], ['F', '#bf9fff'], ['?', '#b0b0b0']];
    const autoColumns = layout === 'grid' && config.columns === 0;
    if (tiers) {
        if (config.tierSource === 'tier') {
            const defs = (plan?.tierSets?.[config.filter] || (plan?.tiers?.length ? plan.tiers : TIER_LETTERS.slice(0, 6).map(([id, color]) => ({ id, label: id, color }))));
            for (const def of defs) {
                const tierItems = items.filter(item => item.tier === def.id);
                if (tierItems.length) sections.push({ label: def.label, color: def.color, items: tierItems });
            }
            const unranked = items.filter(item => !defs.some(def => def.id === item.tier));
            if (unranked.length) sections.push({ label: '?', color: '#b0b0b0', items: unranked });
        } else for (const [stars, label, color] of TIERS) {
            const tierItems = items.filter(item => Math.round(Math.max(0, Math.min(5, item.rating || 0))) === stars);
            if (tierItems.length) sections.push({ label, color, items: tierItems });
        }
    } else if (kanban) {
        // One column per period, or per list when showing everything.
        for (const item of items) {
            const customList = listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean);
            const label = config.groupBy === 'collection' ? (customList || item.period || 'General')
                : config.groupBy === 'status' ? (item.status === 'tonight' ? 'Tonight' : (item.status === 'scheduled' ? 'Scheduled' : (statusNames[item.status] || item.status || 'Other')))
                : config.filter === 'all' ? (statusNames[item.status] || item.status) : (item.period || 'No period');
            let section = sections.find(entry => entry.label === label);
            if (!section) { section = { label, items: [] }; sections.push(section); }
            section.items.push(item);
        }
        inner.style.cssText += `display:flex;align-items:flex-start;gap:${groupGap}px;transform-origin:top left;`;
    } else if (!ticker && config.headings !== false && config.filter !== 'backlog' && config.groupBy !== 'none') {
        for (const item of items) {
            const customList = listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean);
            const label = config.groupBy === 'collection' ? (customList || item.period || 'General')
                : config.groupBy === 'status' ? (item.status === 'tonight' ? 'Tonight' : (item.status === 'scheduled' ? 'Scheduled' : (statusNames[item.status] || item.status || 'Other')))
                : (item.period || '');
            let section = sections.find(entry => entry.label === label);
            if (!section) { section = { label, items: [] }; sections.push(section); }
            section.items.push(item);
        }
    } else sections.push({ label: '', items });

    const meta = item => {
        if (config.meta === 'year') return item.releaseYear ? String(item.releaseYear) : '';
        if (config.meta === 'genres') return (item.genres || []).slice(0, 2).join(' · ');
        if (config.meta === 'note') return item.note || '';
        if (config.meta === 'rating') {
            if (!(item.rating > 0)) return '';
            return `${item.rating} / 5`;
        }
        if (config.meta === 'tags') return (item.tags || []).slice(0, 3).join(' · ');
        if (config.meta === 'group') {
            return listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean) || item.period || '';
        }
        if (config.meta === 'status') {
            return item.playingNow ? 'Playing' : (item.status === 'tonight' ? 'Tonight' : (item.status === 'scheduled' ? 'Scheduled' : (statusNames[item.status] || item.status || '')));
        }
        if (config.meta === 'date') return item.streamDate || '';
        if (config.meta === 'period') return item.period || '';
        return '';
    };
    const makePill = (text, bg, fg, border) => {
        const pill = document.createElement('span');
        pill.textContent = text;
        pill.style.cssText = `background:${bg};color:${fg};${border ? `border:1px solid ${border};` : ''}font-size:.55em;font-weight:700;letter-spacing:.04em;padding:.15em .5em;border-radius:999px;white-space:nowrap;display:inline-flex;align-items:center;line-height:1.2;`;
        return pill;
    };
    const statusPill = item => {
        if (!config.showStatusBadge) return null;
        if (item.status === 'tonight') return makePill('Tonight', `color-mix(in srgb, ${accent} 22%, transparent)`, `color-mix(in srgb, ${accent} 80%, #ffffff)`, `color-mix(in srgb, ${accent} 45%, transparent)`);
        if (item.status === 'up-next') return makePill('Up Next', `color-mix(in srgb, ${accent} 15%, transparent)`, `color-mix(in srgb, ${accent} 70%, #ffffff)`, `color-mix(in srgb, ${accent} 35%, transparent)`);
        if (item.status === 'scheduled') return makePill('Scheduled', 'rgba(255,255,255,0.1)', '#e2e8f0', 'rgba(255,255,255,0.2)');
        if (item.status === 'played') return makePill('Done', 'rgba(34,197,94,0.2)', '#4ade80', 'rgba(34,197,94,0.4)');
        return null;
    };
    const groupPill = item => {
        if (!config.showGroupBadge) return null;
        const grp = listMap.get(item.status) || (item.extraLists || []).map(id => listMap.get(id)).find(Boolean) || item.period;
        if (!grp) return null;
        return makePill(grp, 'rgba(139,92,246,0.2)', '#c084fc', 'rgba(139,92,246,0.4)');
    };
    const scale = (config.coverScale || 100) / 100;
    const compact = layout === 'grid' || layout === 'strip' || tiers || ticker;
    // Opacity would cut text out of a parent's clipped gradient fill, so dimmed text stays solid when the text color is a gradient.
    const dim = value => (style.textGradient?.enabled ? '' : `opacity:${value};`);
    // Text sizes are percentages of the element's own font size; the old px settings still apply when no percentage is set.
    const rel = (percent, legacyPx, fallback) => (!(percent > 0) && legacyPx > 0 ? `${legacyPx}px` : `${(percent > 0 ? percent : fallback) / 100}em`);
    const titleSize = rel(config.titleScale, config.titleSize, compact ? 80 : 100);
    const headingSize = rel(config.headingScale, config.headingSize, 100);
    const metaSize = rel(config.metaScale, 0, compact ? 65 : 70);
    const onCover = compact && config.titlePlacement === 'overlay' && config.showCovers !== false && config.showTitles !== false;
    const titleFlow = config.titleWrap === 'wrap' ? 'overflow-wrap:break-word;line-height:1.2' : 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const badge = () => {
        const tag = document.createElement('span');
        tag.textContent = 'NOW PLAYING';
        tag.style.cssText = `background:${accent};color:#000;font-size:.55em;font-weight:800;letter-spacing:.06em;padding:.15em .5em;border-radius:999px;white-space:nowrap;`;
        return tag;
    };
    const cover = (item, extra, hideName) => {
        const wrap = document.createElement('div');
        wrap.dataset.glCover = '1';
        wrap.style.cssText = `background:rgba(255,255,255,.08);border-radius:${Math.min(12, style.borderRadius || 8)}px;overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center;font-size:.6em;padding:.3em;box-sizing:border-box;${extra}`;
        if (item.cover) {
            const img = document.createElement('img');
            img.decoding = 'async';
            img.src = item.cover; img.alt = '';
            img.style.cssText = config.coverFit === 'natural' ? 'width:100%;height:auto;display:block;' : `position:absolute;inset:0;width:100%;height:100%;object-fit:${config.coverFit === 'contain' ? 'contain' : 'cover'};display:block;`;
            if (config.coverFit !== 'natural') wrap.style.position = 'relative';
            wrap.style.padding = '0';
            wrap.appendChild(img);
        } else if (!hideName) wrap.textContent = item.name;
        if (item.playingNow && config.highlightCurrent !== false) {
            wrap.style.boxShadow = `0 0 0 3px ${accent}`;
        } else if (item.status === 'tonight' && config.highlightCurrent !== false) {
            wrap.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${accent} 50%, transparent)`;
        }
        return wrap;
    };

    const tierBoxWidth = Math.max(2.2, Math.min(6, Math.max(...sections.map(entry => String(entry.label || '').length), 1) * 0.65 + 0.8));
    for (const section of sections) {
        let holder = inner;
        if (kanban) {
            holder = document.createElement('div');
            holder.dataset.glCover = '1';
            holder.style.cssText = `flex:1 1 0;min-width:0;background:rgba(255,255,255,.06);border-radius:${Math.min(16, style.borderRadius || 10)}px;padding:.6em;box-sizing:border-box;`;
            inner.appendChild(holder);
        } else if (tiers) {
            holder = document.createElement('div');
            holder.dataset.glSection = '1';
            holder.style.cssText = `display:flex;align-items:stretch;gap:.6em;min-width:0;margin-bottom:${groupGap}px;`;
            const badgeBox = document.createElement('div');
            badgeBox.textContent = section.label;
            badgeBox.style.cssText = `flex:none;width:${tierBoxWidth}em;display:flex;align-items:center;justify-content:center;text-align:center;overflow-wrap:anywhere;line-height:1.1;font-weight:800;font-size:${headingSize};background:${section.color};color:#000;border-radius:${Math.min(12, style.borderRadius || 8)}px;`;
            holder.appendChild(badgeBox);
            inner.appendChild(holder);
        } else if (autoColumns || config.periodsAcross > 0 || config.fit === 'shrink') {
            holder = document.createElement('div');
            holder.dataset.glSection = '1';
            holder.style.minWidth = '0';
            inner.appendChild(holder);
        }
        if (section.label && !tiers) {
            const heading = document.createElement('div');
            heading.textContent = section.label;
            heading.style.cssText = `font-weight:700;margin:0 0 .5em;text-align:${hAlign};${dim(.85)}font-size:${headingSize};`;
            holder.appendChild(heading);
        }
        const body = document.createElement('div');
        body.style.marginBottom = kanban || tiers ? '0' : `${groupGap}px`;
        if (tiers) body.style.cssText += 'flex:1;min-width:0;';
        if (layout === 'list' || kanban) {
            body.style.cssText += `display:flex;flex-direction:column;gap:${gap / 2}px;`;
            for (const item of section.items) {
                const row = document.createElement('div');
                row.style.cssText = `display:flex;align-items:center;gap:.6em;justify-content:${just};`;
                if (config.showCovers !== false) row.appendChild(cover(item, `width:${((kanban ? 3 : 2.4) * scale).toFixed(2)}em;height:${((kanban ? 4 : 3.2) * scale).toFixed(2)}em;flex:none;`));
                const text = document.createElement('div');
                text.style.cssText = `min-width:0;flex:${hAlign === 'left' ? '1' : '0 1 auto'};text-align:${hAlign};`;
                const title = document.createElement('div');
                title.style.cssText = `display:flex;align-items:center;gap:.5em;justify-content:${just};flex-wrap:wrap;`;
                const name = document.createElement('span');
                name.textContent = item.name;
                name.style.cssText = `font-weight:600;${titleFlow};font-size:${titleSize};`;
                if (config.showTitles !== false || config.showCovers === false) title.appendChild(name);
                if (item.playingNow && config.highlightCurrent !== false) title.appendChild(badge());
                const sp = statusPill(item); if (sp) title.appendChild(sp);
                const gp = groupPill(item); if (gp) title.appendChild(gp);
                text.appendChild(title);
                const extra = meta(item);
                if (extra) { const line = document.createElement('div'); line.textContent = extra; line.style.cssText = `font-size:${metaSize};${dim(.65)}`; text.appendChild(line); }
                row.appendChild(text);
                body.appendChild(row);
            }
        } else {
            const strip = layout === 'strip';
            const cols = ticker ? (config.columns || 5) : tiers ? (config.columns || 6) : (config.columns || 3);
            body.style.cssText += strip
                ? `display:flex;gap:${gap}px;justify-content:${just};`
                : ticker ? 'display:flex;width:max-content;align-items:center;min-height:100%;will-change:transform;'
                : `display:flex;flex-wrap:wrap;gap:${gap}px;justify-content:${just};--cols:${cols};`;
            if (!strip && !ticker) body.dataset.glGrid = '1';
            if (ticker) body.dataset.glTickerBody = '1';
            let tickerItems = section.items;
            if (ticker && tickerItems.length > 0) {
                tickerItems = [...tickerItems];
                const minNeeded = Math.max(cols + 1, section.items.length * 2);
                while (tickerItems.length < minNeeded) {
                    tickerItems = tickerItems.concat(section.items);
                }
            }
            const fill = target => { for (const item of (ticker ? tickerItems : section.items)) {
                const card = document.createElement('div');
                card.style.cssText = strip ? `flex:1 1 0;min-width:0;max-width:calc((100% - ${5 * gap}px) / 6);`
                    : ticker ? `flex:0 0 calc((100cqw - ${(cols - 1) * gap}px) / ${cols});width:calc((100cqw - ${(cols - 1) * gap}px) / ${cols});min-width:0;`
                    : `flex:0 0 calc((100% - (var(--cols) - 1) * ${gap}px) / var(--cols) - .5px);min-width:0;`;
                const face = cover(item, `width:${Math.min(100, scale * 100)}%;margin:${coverMargin};${config.coverFit === 'natural' && item.cover ? '' : `aspect-ratio:${config.coverRatio || '3/4'};`}`, onCover);
                const extra = meta(item);
                if (onCover) {
                    face.style.position = 'relative';
                    const bar = document.createElement('div');
                    bar.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:1.6em .45em .4em;background:linear-gradient(transparent,rgba(0,0,0,.85));color:#fff;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.7);';
                    const name = document.createElement('div');
                    name.textContent = item.name;
                    name.style.cssText = `font-weight:600;font-size:${titleSize};${titleFlow};`;
                    bar.appendChild(name);
                    if (extra) { const line = document.createElement('div'); line.textContent = extra; line.style.cssText = `font-size:${metaSize};opacity:.8;${titleFlow};`; bar.appendChild(line); }
                    face.appendChild(bar);
                    if (item.playingNow && config.highlightCurrent !== false) { const flag = badge(); flag.style.cssText += 'position:absolute;top:.4em;left:.4em;'; face.appendChild(flag); }
                    const sp = statusPill(item), gp = groupPill(item);
                    if (sp || gp) {
                        const pillRow = document.createElement('div');
                        pillRow.style.cssText = 'position:absolute;top:.4em;right:.4em;display:flex;gap:4px;flex-wrap:wrap;';
                        if (sp) pillRow.appendChild(sp);
                        if (gp) pillRow.appendChild(gp);
                        face.appendChild(pillRow);
                    }
                    card.appendChild(face);
                } else {
                    card.appendChild(face);
                    const sp = statusPill(item), gp = groupPill(item);
                    if ((item.playingNow && config.highlightCurrent !== false) || sp || gp) {
                        const holder = document.createElement('div');
                        holder.style.cssText = `display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:${just};margin-top:.35em;`;
                        if (item.playingNow && config.highlightCurrent !== false) holder.appendChild(badge());
                        if (sp) holder.appendChild(sp);
                        if (gp) holder.appendChild(gp);
                        card.appendChild(holder);
                    }
                    if (config.showTitles !== false) {
                        const name = document.createElement('div');
                        name.textContent = item.name;
                        name.style.cssText = `margin-top:.35em;font-weight:600;text-align:${hAlign};font-size:${titleSize};${titleFlow};`;
                        card.appendChild(name);
                    }
                    if (extra) { const line = document.createElement('div'); line.textContent = extra; line.style.cssText = `font-size:${metaSize};${dim(.65)}text-align:${hAlign};${titleFlow};`; card.appendChild(line); }
                }
                target.appendChild(card);
            } };
            if (ticker) {
                for (let copy = 0; copy < 2; copy++) {
                    const half = document.createElement('div');
                    half.dataset.glTickerCopy = '1';
                    half.style.cssText = `display:flex;gap:${gap}px;padding-right:${gap}px;`;
                    fill(half);
                    body.appendChild(half);
                }
            } else fill(body);
        }
        holder.appendChild(body);
    }

    // Placement: auto columns pick the fewest columns (biggest covers) that fit the box, "shrink" scales down when still too tall,
    // and the position options decide where leftover space goes.
    const shrink = config.fit === 'shrink';
    node.style.containerType = ticker ? 'inline-size' : '';
    const fadeMask = ticker && config.tickerFade !== false ? 'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)' : '';
    node.style.webkitMaskImage = fadeMask;
    node.style.maskImage = fadeMask;
    if (typeof ResizeObserver !== 'function' || !(ticker || autoColumns || shrink || config.periodsAcross > 0 || alignV !== 'top' || alignH !== 'left')) return;
    const grids = [...inner.querySelectorAll('[data-gl-grid]')];
    if (config.periodsAcross > 0 && !kanban && !tiers) {
        inner.style.display = 'grid';
        inner.style.gridTemplateColumns = `repeat(${config.periodsAcross},minmax(0,1fr))`;
        inner.style.columnGap = `${groupGap}px`;
        inner.style.alignItems = 'start';
    }
    // "Shrink to fit" first reflows grids/tiers into more games per row (never fewer than set) so covers stay big before anything is scaled down.
    const reflow = autoColumns || (shrink && (layout === 'grid' || tiers));
    const minCols = autoColumns ? 1 : (config.columns || (tiers ? 6 : 3));
    const place = () => {
        if (ticker) {
            const copies = [...inner.querySelectorAll('[data-gl-ticker-copy]')];
            if (!copies.length) return;
            const scrolls = copies[0].children.length > 0;
            if (copies[1]) copies[1].style.display = scrolls ? 'flex' : 'none';
            const body = copies[0].parentElement;
            if (body) {
                body.style.animation = scrolls
                    ? `${config.tickerDirection === 'right' ? 'spGlTickerR' : 'spGlTicker'} ${(copies[0].children.length * (config.tickerPace || 3)).toFixed(2)}s linear infinite`
                    : 'none';
            }
            return;
        }
        inner.style.transform = '';
        inner.style.transformOrigin = 'left top';
        const avail = node.clientHeight;
        if (!(avail > 0)) return;
        if (reflow && grids.length) {
            // Try every mix of "periods side by side" and "covers per row", keeping the one with the biggest covers once fitted.
            const sectionEls = [...inner.querySelectorAll(':scope > [data-gl-section]')];
            const width = node.clientWidth;
            const most = Math.max(1, Math.min(12, Math.max(...grids.map(grid => grid.children.length))));
            inner.style.display = 'grid';
            inner.style.columnGap = `${groupGap}px`;
            inner.style.alignItems = 'start';
            let best = null;
            const maxAcross = tiers ? 1 : (config.periodsAcross > 0 ? Math.min(config.periodsAcross, sectionEls.length) : sectionEls.length);
            const minAcross = config.periodsAcross > 0 && !tiers ? Math.min(config.periodsAcross, sectionEls.length) : 1;
            for (let across = minAcross; across <= maxAcross; across++) {
                inner.style.gridTemplateColumns = `repeat(${across},minmax(0,1fr))`;
                for (let columns = Math.min(minCols, most); columns <= most; columns++) {
                    grids.forEach(grid => grid.style.setProperty('--cols', columns));
                    const need = inner.offsetHeight;
                    const fit = need > avail ? avail / need : 1;
                    const cell = (width - (across - 1) * groupGap) / across;
                    const score = shrink || need <= avail ? ((cell - (columns - 1) * gap) / columns) * fit : fit * 0.0001;
                    if (!best || score > best.score * 1.02) best = { across, columns, score };
                }
            }
            if (best) {
                inner.style.gridTemplateColumns = `repeat(${best.across},minmax(0,1fr))`;
                grids.forEach(grid => grid.style.setProperty('--cols', best.columns));
            }
        }
        const need = inner.offsetHeight;
        const factorH = shrink && need > avail ? avail / need : 1;
        const needW = inner.offsetWidth;
        const availW = node.clientWidth;
        const factorW = shrink && availW > 0 && needW > availW ? availW / needW : 1;
        const factor = Math.min(factorH, factorW);
        const free = Math.max(0, avail - need * factor);
        const dy = alignV === 'middle' ? free / 2 : alignV === 'bottom' ? free : 0;
        let dx = 0;
        if (alignH !== 'left') {
            // Align the visible content (covers and tight text bounds), not the stretched grid cells around it.
            const box = node.getBoundingClientRect();
            const zoom = node.offsetWidth ? box.width / node.offsetWidth : 1;
            let left = Infinity, right = -Infinity;
            const take = rect => { if (rect.width > 0) { left = Math.min(left, rect.left); right = Math.max(right, rect.right); } };
            inner.querySelectorAll('[data-gl-cover], img').forEach(el => take(el.getBoundingClientRect()));
            const range = document.createRange();
            const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) { if (walker.currentNode.textContent.trim()) { range.selectNodeContents(walker.currentNode); take(range.getBoundingClientRect()); } }
            if (right > left) {
                const from = (left - box.left) / zoom * factor, to = (right - box.left) / zoom * factor;
                dx = alignH === 'center' ? (node.clientWidth - (to - from)) / 2 - from : node.clientWidth - to;
            }
        }
        if (factor < 1 || dy > 0 || dx) inner.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${factor.toFixed(4)})`;
    };
    node._fitObserver = new ResizeObserver(place);
    node._fitObserver.observe(node);
    node.querySelectorAll('img').forEach(img => img.addEventListener('load', place));
    place();
}

export { matchesPeriodFilter, matchesPeriodToken, renderGameList, renderProgress };
