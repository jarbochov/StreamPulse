import { resolveDisplayOwner } from '../../../shared/variable-displays.cjs';
import { trackerMax } from '../../../shared/variable-links.cjs';
import { renderDisplayTable } from './display-table.js';
import { renderSavedBadge } from './display-badges.js';
import { cleanupNode } from './lifecycle.js';

let library = null, revision = null, pending = null;
export function setDisplayLibrary(data) {
    library = Array.isArray(data.displays) ? data.displays : [];
    revision = data.revision;
}

export async function loadDisplayLibrary(status, elements) {
    if (!elements?.some(element => element.type === 'data-display')) return;
    if (!library || (status.variableDisplaysRevision != null && revision !== status.variableDisplaysRevision)) {
        if (!pending) pending = fetch('/api/variable-displays', { cache: 'no-store' }).then(async response => {
            if (!response.ok) throw new Error('Display library unavailable');
            const data = await response.json();
            if (revision == null || data.revision >= revision) setDisplayLibrary(data);
        }).finally(() => { pending = null; });
        try { await pending; } catch { /* Retry after the next status refresh. */ }
    }
    status.variableDisplays = library || [];
    if (!Array.isArray(status.variableSets)) {
        try {
            const response = await fetch('/api/variables', { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                status.variableSets = data.sets || [];
            }
        } catch { /* Missing sources remain hidden until data is available. */ }
    }
}

export function renderVariableDisplay(host, element, status = {}) {
    const binding = element.display || {};
    const definition = status.variableDisplays?.find(display => display.id === binding.displayId);
    const catalog = status.variableSets?.find(set => set.id === definition?.catalogId);
    const { set: ownerSet, entry: owner } = resolveDisplayOwner(status.variableSets, binding);
    const tracker = ownerSet?.fields?.find(field => field.key === binding.tracker && field.type === 'checklist' && field.targetSet === definition?.catalogId);
    const tracks = Boolean(binding.setId);
    const signature = JSON.stringify([definition, definition?.kind === 'inventory' ? catalog?.roster : status.variableSets, tracks ? owner : null, tracker, binding, element.style, element.width, element.height, status.customVars, status.modules?.variableSets]);
    if (host._displaySignature === signature && host.querySelector('.sp-variable-display')) return true;
    host._displaySignature = signature;
    for (const child of host.querySelectorAll(':scope > .sp-variable-display')) cleanupNode(child);
    host.replaceChildren();
    if (!definition || !catalog || status.modules?.variableSets === false) return false;
    if (definition.kind === 'table') return renderDisplayTable(host, element, status, definition);
    if (definition.kind === 'badge') return renderSavedBadge(host, element, status, definition);
    if (tracks && (!owner || !tracker)) return false;
    const { layout, style } = definition;
    const map = owner?.values?.[tracker?.key] || {};
    const members = new Map((catalog.roster || []).map(item => [item.id, item]));
    const sections = definition.sections.map(section => ({
        ...section,
        items: section.items.flatMap(placement => {
            const item = members.get(placement.itemId);
            if (!item || item.enabled === false) return [];
            const level = Math.max(0, Math.min(trackerMax(tracker, item), Number(map[item.id]) || 0));
            const inactive = tracks && level === 0;
            if (inactive && binding.showMode === 'active' && layout.mode !== 'fixed') return [];
            return [{ ...placement, item, level, inactive, tier: item.tiers?.find(tier => tier.level === level) }];
        })
    }));
    const rowCount = section => Math.ceil((layout.mode === 'fixed' ? Math.max(0, ...section.items.map(item => item.cell + 1)) : section.items.length) / layout.columns);
    const titleHeight = style.fontSize * 2.2;
    const width = style.padding * 2 + layout.columns * layout.cellWidth + (layout.columns - 1) * layout.gap;
    const height = Math.max(1, style.padding * 2 + (style.showOwner ? titleHeight : 0) + sections.reduce((total, section, index) => {
        const rows = rowCount(section);
        return total + (index ? layout.sectionGap : 0) + (section.title && style.showSectionTitles ? titleHeight : 0) + rows * layout.cellHeight + Math.max(0, rows - 1) * layout.gap;
    }, 0));
    const root = document.createElement('div');
    root.className = 'sp-variable-display';
    Object.assign(root.style, { width: '100%', height: '100%', containerType: 'size', overflow: 'hidden' });
    const board = document.createElement('div');
    const unit = 'var(--display-unit)';
    root.style.setProperty('--display-unit', `min(calc(100cqw / ${width}), calc(100cqh / ${height}))`);
    const px = value => `calc(${unit} * ${value})`;
    Object.assign(board.style, { boxSizing: 'border-box', width: px(width), minHeight: px(height), padding: px(style.padding), background: style.background, color: style.color, fontFamily: style.fontFamily, fontSize: px(style.fontSize) });
    if (style.showOwner) {
        const heading = document.createElement('div');
        heading.textContent = owner?.label || definition.name;
        Object.assign(heading.style, { height: px(titleHeight), fontWeight: '700' });
        board.append(heading);
    }
    for (const [index, section] of sections.entries()) {
        const group = document.createElement('section');
        group.dataset.displaySection = section.id;
        if (index) group.style.marginTop = px(layout.sectionGap);
        if (section.title && style.showSectionTitles) {
            const heading = document.createElement('div');
            heading.textContent = section.title;
            Object.assign(heading.style, { height: px(titleHeight), fontWeight: '700' });
            group.append(heading);
        }
        const grid = document.createElement('div');
        Object.assign(grid.style, { display: 'grid', gridTemplateColumns: `repeat(${layout.columns}, ${px(layout.cellWidth)})`, gridTemplateRows: `repeat(${rowCount(section)}, ${px(layout.cellHeight)})`, gap: px(layout.gap) });
        for (const [position, placement] of section.items.entries()) {
            const { item, level, inactive, tier } = placement;
            const cell = document.createElement('div');
            cell.dataset.displayItem = item.id;
            cell.dataset.level = level;
            const slot = layout.mode === 'fixed' ? placement.cell : position;
            Object.assign(cell.style, { gridColumn: String(slot % layout.columns + 1), gridRow: String(Math.floor(slot / layout.columns) + 1), position: 'relative', overflow: 'hidden', boxSizing: 'border-box', border: `${px(style.borderWidth)} solid ${style.borderColor}`, borderRadius: px(style.radius), background: style.cellBackground, opacity: inactive ? String(style.inactiveOpacity) : '1', visibility: inactive && binding.showMode === 'active' ? 'hidden' : '', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: px(4) });
            const image = tier?.image || item.values?.[definition.imageField];
            if (image) {
                const img = document.createElement('img');
                img.src = image;
                img.alt = '';
                img.referrerPolicy = 'no-referrer';
                Object.assign(img.style, { width: '100%', flex: '1', minHeight: '0', objectFit: 'contain', filter: inactive ? 'grayscale(1)' : '' });
                cell.append(img);
            }
            if (style.showLabels || style.showLevels) {
                const label = document.createElement('div');
                label.textContent = [style.showLabels ? tier?.label || item.values?.[definition.labelField] || item.label : '', style.showLevels && tracks ? `Lv.${level}` : ''].filter(Boolean).join(' ');
                Object.assign(label.style, { width: '100%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 'none' });
                cell.append(label);
            }
            grid.append(cell);
        }
        group.append(grid);
        board.append(group);
    }
    root.append(board);
    host.append(root);
    return true;
}
