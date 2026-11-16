const { normalizeDisplay } = require('../../shared/variable-displays.cjs');
const { normalizeCustomOverlay } = require('../../server/services/overlays');
const image = (color, label) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect x="10" y="10" width="60" height="60" rx="14" fill="${color}"/><text x="40" y="50" text-anchor="middle" fill="white" font-size="26" font-family="sans-serif">${label}</text></svg>`)}`;
const sets = [
    { id: 'equipment', name: 'Expedition equipment', slotsCount: 0, fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'image', label: 'Image', type: 'image' }],
        roster: [
            { id: 'sword', label: 'Sword', values: { name: 'Sword', image: image('#38bdf8', 'S') }, tiers: [{ level: 1, label: 'Wood sword', image: image('#a17745', 'I') }, { level: 2, label: 'Steel sword', image: image('#94a3b8', 'II') }] },
            { id: 'shield', label: 'Shield', values: { name: 'Shield', image: image('#8b5cf6', 'H') } },
            { id: 'boots', label: 'Boots', values: { name: 'Boots', image: image('#10b981', 'B') } },
            { id: 'key', label: 'Moon key', values: { name: 'Moon key', image: image('#f59e0b', 'K') } }
        ] },
    { id: 'people', name: 'Players', slotsCount: 2, slots: ['river', 'sky'], fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'avatar', label: 'Avatar', type: 'image' }, { key: 'gear', label: 'Equipment', type: 'checklist', targetSet: 'equipment' }],
        roster: [
            { id: 'river', label: 'River Vale', values: { name: 'River Vale', avatar: image('#0ea5e9', 'R'), gear: { sword: 2, shield: 1 } } },
            { id: 'sky', label: 'Sky Meadow', values: { name: 'Sky Meadow', avatar: image('#8b5cf6', 'S'), gear: { boots: 1, key: 1 } } }
        ] },
    { id: 'schedule', name: 'Schedule', slotsCount: 1, slots: ['tonight'], fields: [
        { key: 'start', label: 'Start', type: 'time' }, { key: 'duration', label: 'Duration', type: 'duration' },
        { key: 'p1', label: 'Player 1', type: 'ref', targetSet: 'people' }, { key: 'p2', label: 'Player 2', type: 'ref', targetSet: 'people' }
    ], roster: [
        { id: 'tonight', label: 'Moon Harbor expedition', values: { start: '18:30', duration: '45m', p1: 'river', p2: 'sky' } },
        { id: 'later', label: 'Cloud Ridge relay', values: { start: '19:30', duration: '1h', p1: 'sky', p2: 'river' } }
    ] }
];
const display = normalizeDisplay({
    id: 'fictional-inventory', name: 'Expedition inventory', catalogId: 'equipment',
    layout: { columns: 4, mode: 'fixed' }, style: { showOwner: true, showLevels: true },
    sections: [
        { title: 'Equipment', items: [{ itemId: 'sword', cell: 0 }, { itemId: 'shield', cell: 1 }, { itemId: 'boots', cell: 3 }] },
        { title: 'Quest items', items: [{ itemId: 'key', cell: 2 }] }
    ]
});
const binding = role => ({ displayId: display.id, setId: 'schedule', selector: 'active', path: [role], tracker: 'gear', showMode: 'dim' });
const table = normalizeDisplay({
    id: 'fictional-schedule', name: 'Expedition schedule', kind: 'table', catalogId: 'schedule',
    style: { fontSize: 20 },
    table: { rowOrder: ['tonight', 'later'], columns: [
        { key: 'start', label: 'Start', width: 1 },
        { key: '$label', label: 'Event', width: 3 },
        { key: 'duration', label: 'Duration', width: 1 },
        { key: 'p1.$label', label: 'Player 1', width: 2 }
    ] }
});
const badgeElement = normalizeCustomOverlay({ id: 'fictional-badge-design', elements: [{
    id: 'badge', type: 'image', width: 720, height: 220,
    imageGroup: { enabled: true, showLabels: true, imageField: 'avatar', labelField: 'name', layout: 'row', autoScale: true, fallbackMode: 'initials',
        fields: [{ key: 'name', role: 'title', slot: 'main', fontSize: 24 }] },
    style: { fontFamily: 'sans-serif', fontSize: 24, color: '#eef4ff' }
}] }).elements[0];
const badgeSettings = { ...badgeElement.imageGroup };
for (const key of ['setId', 'filterMode', 'linkedSource', 'onlySelected', 'showMode']) delete badgeSettings[key];
const badge = normalizeDisplay({
    id: 'fictional-badges', name: 'Expedition player cards', kind: 'badge', catalogId: 'people',
    badge: { width: 720, height: 220, imageGroup: badgeSettings, style: badgeElement.style, mediaFilter: badgeElement.mediaFilter }
});
module.exports = { sets, display, table, badge, binding };
