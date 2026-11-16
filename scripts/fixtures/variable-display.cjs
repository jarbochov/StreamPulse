const { normalizeDisplay } = require('../../shared/variable-displays.cjs');
const image = (color, label) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect x="10" y="10" width="60" height="60" rx="14" fill="${color}"/><text x="40" y="50" text-anchor="middle" fill="white" font-size="26" font-family="sans-serif">${label}</text></svg>`)}`;
const sets = [
    { id: 'equipment', name: 'Expedition equipment', slotsCount: 0, fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'image', label: 'Image', type: 'image' }],
        roster: [
            { id: 'sword', label: 'Sword', values: { name: 'Sword', image: image('#38bdf8', 'S') }, tiers: [{ level: 1, label: 'Wood sword', image: image('#a17745', 'I') }, { level: 2, label: 'Steel sword', image: image('#94a3b8', 'II') }] },
            { id: 'shield', label: 'Shield', values: { name: 'Shield', image: image('#8b5cf6', 'H') } },
            { id: 'boots', label: 'Boots', values: { name: 'Boots', image: image('#10b981', 'B') } },
            { id: 'key', label: 'Moon key', values: { name: 'Moon key', image: image('#f59e0b', 'K') } }
        ] },
    { id: 'people', name: 'Players', slotsCount: 2, slots: ['river', 'sky'], fields: [{ key: 'gear', label: 'Equipment', type: 'checklist', targetSet: 'equipment' }],
        roster: [
            { id: 'river', label: 'River Vale', values: { gear: { sword: 2, shield: 1 } } },
            { id: 'sky', label: 'Sky Meadow', values: { gear: { boots: 1, key: 1 } } }
        ] },
    { id: 'schedule', name: 'Schedule', slotsCount: 1, slots: ['tonight'], fields: [
        { key: 'p1', label: 'Player 1', type: 'ref', targetSet: 'people' }, { key: 'p2', label: 'Player 2', type: 'ref', targetSet: 'people' }
    ], roster: [{ id: 'tonight', label: 'Moon Harbor expedition', values: { p1: 'river', p2: 'sky' } }] }
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
module.exports = { sets, display, binding };
