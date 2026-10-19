(function (root) {
    const themes = {
        system: { id: 'system', name: 'StreamPulse Shared Theme (Default)', accent: '', indicator: '', gradient: '', glow: '', slices: [] },
        purple: {
            id: 'purple', name: 'Purple Chaos', accent: '#a855f7', indicator: '#ec4899',
            gradient: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)',
            glow: 'rgba(168, 85, 247, 0.4)',
            slices: ['#a855f7', '#ec4899', '#f97316', '#eab308', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#d946ef'],
            stops: ['#a855f7', '#ec4899', '#f97316']
        },
        rainbow: {
            id: 'rainbow', name: 'Vibrant Rainbow', accent: '#ef4444', indicator: '#fbbf24',
            gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 20%, #f59e0b 40%, #10b981 60%, #3b82f6 80%, #8b5cf6 100%)',
            glow: 'rgba(239, 68, 68, 0.4)',
            slices: ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'],
            stops: ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6']
        },
        cyberpunk: {
            id: 'cyberpunk', name: 'Cyberpunk Neon', accent: '#00f0ff', indicator: '#ff007f',
            gradient: 'linear-gradient(135deg, #00f0ff 0%, #ff007f 100%)',
            glow: 'rgba(0, 240, 255, 0.45)',
            slices: ['#00f0ff', '#ff007f', '#ffe600', '#7928ca', '#00ff66', '#ff003c'],
            stops: ['#00f0ff', '#ff007f']
        },
        gold: {
            id: 'gold', name: 'Royal Gold & Navy', accent: '#fbbf24', indicator: '#fbbf24',
            gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
            glow: 'rgba(251, 191, 36, 0.4)',
            slices: ['#fbbf24', '#d97706', '#b45309', '#f59e0b', '#fef3c7', '#78350f', '#eab308'],
            stops: ['#fbbf24', '#d97706']
        },
        fire: {
            id: 'fire', name: 'Fire & Magma', accent: '#ef4444', indicator: '#f59e0b',
            gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 50%, #fbbf24 100%)',
            glow: 'rgba(239, 68, 68, 0.45)',
            slices: ['#ef4444', '#dc2626', '#b91c1c', '#f97316', '#ea580c', '#f59e0b'],
            stops: ['#ef4444', '#f97316', '#fbbf24']
        },
        midnight: {
            id: 'midnight', name: 'Midnight Nebula', accent: '#8b5cf6', indicator: '#38bdf8',
            gradient: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 50%, #06b6d4 100%)',
            glow: 'rgba(139, 92, 246, 0.4)',
            slices: ['#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6'],
            stops: ['#8b5cf6', '#3b82f6', '#06b6d4']
        },
        matrix: {
            id: 'matrix', name: 'Hacker Terminal', accent: '#10b981', indicator: '#34d399',
            gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            glow: 'rgba(16, 185, 129, 0.4)',
            slices: ['#10b981', '#059669', '#047857', '#34d399', '#065f46', '#6ee7b7'],
            stops: ['#10b981', '#059669']
        }
    };
    if (typeof module === 'object' && module.exports) module.exports = themes;
    else root.StudioThemes = themes;
})(typeof window !== 'undefined' ? window : globalThis);
