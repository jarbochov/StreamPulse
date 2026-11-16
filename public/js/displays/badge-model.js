export const IMAGE_GROUP_FIELD_ROLES = ['title', 'subtitle', 'badge', 'accent', 'caption'];
export const IMAGE_GROUP_SLOTS = ['main', 'header', 'footer', 'trailing', 'avatar-top', 'avatar-bottom', 'corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'avatar-tl', 'avatar-tr', 'avatar-bl', 'avatar-br'];
export const IMAGE_GROUP_FIELD_ALIGNS = ['auto', 'left', 'center', 'right'];

export function normalizeGroupFieldItem(f, idx = 0) {
    if (!f || typeof f !== 'object') return null;
    const key = String(f.key || '').trim();
    if (!key) return null;
    const optNum = (raw, min, max) => (raw === null || raw === undefined || raw === '') ? null : Math.max(min, Math.min(max, Math.round(Number(raw) || 0)));
    return {
        key,
        kind: ['auto', 'text', 'image'].includes(f.kind) ? f.kind : 'auto',
        customSrc: String(f.customSrc || '').trim().slice(0, 1000),
        role: IMAGE_GROUP_FIELD_ROLES.includes(f.role) ? f.role : (idx === 0 ? 'title' : 'subtitle'),
        slot: IMAGE_GROUP_SLOTS.includes(f.slot) ? f.slot : 'main',
        align: IMAGE_GROUP_FIELD_ALIGNS.includes(f.align) ? f.align : 'auto',
        inline: f.inline === true,
        prefix: String(f.prefix || '').slice(0, 24),
        suffix: String(f.suffix || '').slice(0, 24),
        icon: String(f.icon || '').trim().slice(0, 80),
        sizeScale: Math.max(50, Math.min(200, Math.round(Number(f.sizeScale) || 100))),
        fontSize: optNum(f.fontSize, 8, 96),
        padX: optNum(f.padX, 0, 32),
        padY: optNum(f.padY, 0, 32),
        imgSize: Math.max(10, Math.min(200, Math.round(Number(f.imgSize) || 28))),
        imgShape: ['rounded', 'circle', 'square', 'auto'].includes(f.imgShape) ? f.imgShape : 'rounded',
        imgFit: ['contain', 'cover'].includes(f.imgFit) ? f.imgFit : 'contain',
        imgBorderW: Math.max(0, Math.min(8, Math.round(Number(f.imgBorderW) || 0))),
        fontFamily: String(f.fontFamily || '').slice(0, 120),
        fontWeight: ['400', '600', '700', '900'].includes(String(f.fontWeight || '')) ? String(f.fontWeight) : '',
        fontStyle: ['normal', 'italic'].includes(f.fontStyle) ? f.fontStyle : '',
        textTransform: ['none', 'uppercase', 'lowercase', 'capitalize'].includes(f.textTransform) ? f.textTransform : '',
        color: String(f.color || '').slice(0, 80),
        bgColor: String(f.bgColor || '').slice(0, 80)
    };
}

export function resolveImageGroupFields(ig = {}) {
    if (Array.isArray(ig.fields) && ig.fields.length) {
        return ig.fields.map((f, i) => normalizeGroupFieldItem(f, i)).filter(Boolean).slice(0, 10);
    }
    const list = [];
    if (ig.labelField) list.push(normalizeGroupFieldItem({ key: ig.labelField, role: 'title' }, 0));
    if (ig.subField) list.push(normalizeGroupFieldItem({ key: ig.subField, role: 'subtitle' }, 1));
    return list.filter(Boolean);
}

export function syncLegacyGroupFields(ig) {
    if (!ig || !Array.isArray(ig.fields)) return;
    ig.labelField = ig.fields[0]?.key || '';
    ig.subField = ig.fields[1]?.key || '';
}

export function defaultImageGroupConfig(setObj = null, existing = {}, enabled = true) {
    const sets = setObj ? [setObj] : [];
    const targetSet = setObj || sets.find(s => (s.fields || []).some(f => f.type === 'image' || f.type === 'url')) || sets[0] || null;
    const fields = targetSet?.fields || [];
    const imgField = fields.find(f => f.type === 'image' || f.type === 'url');
    const txtField = fields.find(f => f.type !== 'image' && f.type !== 'url');
    const primaryKey = existing?.labelField !== undefined ? existing.labelField : (txtField?.key || '');
    const secondaryKey = existing?.subField || '';
    const initialFields = Array.isArray(existing?.fields)
        ? existing.fields.map((f, i) => normalizeGroupFieldItem(f, i)).filter(Boolean).slice(0, 10)
        : [
            ...(primaryKey ? [normalizeGroupFieldItem({ key: primaryKey, role: 'title' }, 0)] : []),
            ...(secondaryKey ? [normalizeGroupFieldItem({ key: secondaryKey, role: 'subtitle' }, 1)] : [])
        ];
    return {
        setId: targetSet?.id || '',
        imageField: imgField?.key || 'image',
        labelField: primaryKey,
        subField: secondaryKey,
        fields: initialFields,
        onlySelected: false,
        maxItems: 0,
        showOverflowBadge: true,
        showAvatar: true,
        sortOrder: 'roster',
        layout: 'row',
        wrap: false,
        columns: 0,
        overlap: 16,
        staggerOffset: 18,
        spotlightScale: 1.35,
        shape: 'circle',
        aspectRatio: '1:1',
        size: 72,
        avatarRadius: 10,
        avatarBorderWidth: 0,
        avatarBorderColor: 'rgba(255,255,255,0.28)',
        avatarBorderGradient: { enabled: false, type: 'linear', angle: 135, position: 'center', from: '#38bdf8', mid: '', to: '#8957e5', animate: false, speed: 8 },
        avatarBorderStyle: 'solid',
        avatarBorderGlow: { enabled: false, color: '#38bdf8', blur: 16, spread: 2, neon: false, inner: false },
        avatarBorderAnimation: { type: 'none', speed: 4, size: 35, color2: '#ffffff', color3: '' },
        avatarBg: '#1e293b',
        avatarShadow: 0,
        gap: 12,
        rowGap: null,
        innerGap: 8,
        fieldGap: 2,
        fallbackMode: 'skip',
        showLabels: Boolean(primaryKey),
        labelPosition: 'below',
        textAlign: 'auto',
        textWrap: 'truncate',
        labelSize: 0,
        subFontFamily: '',
        badgeFontFamily: '',
        labelColor: '',
        subColor: '',
        labelBg: 'transparent',
        badgeBg: 'rgba(56,189,248,0.16)',
        badgeColor: '#38bdf8',
        delimiter: '',
        delimiterColor: '',
        showStatusDot: false,
        cardFrame: false,
        cardWidthMode: 'auto',
        cardWidth: 240,
        cardMinHeight: 0,
        cardAlign: 'center',
        cardBg: 'rgba(15,23,42,0.78)',
        cardGradient: { enabled: false, type: 'linear', angle: 135, position: 'center', from: '#0f172a', mid: '', to: '#1e293b', animate: false, speed: 8 },
        cardBlur: 0,
        cardBorderColor: 'rgba(255,255,255,0.16)',
        cardBorderGradient: { enabled: false, type: 'linear', angle: 135, position: 'center', from: '#38bdf8', mid: '', to: '#8957e5', animate: false, speed: 8 },
        cardBorderWidth: 1,
        cardBorderStyle: 'solid',
        cardBorderGlow: { enabled: false, color: '#38bdf8', blur: 16, spread: 2, neon: false, inner: false },
        cardBorderAnimation: { type: 'none', speed: 4, size: 35, color2: '#ffffff', color3: '' },
        cardRadius: 12,
        cardPaddingX: null,
        cardPaddingY: null,
        cornerInset: 6,
        cardShadow: 0,
        ...(existing || {}),
        ...(Array.isArray(existing?.fields) ? {} : { fields: initialFields }),
        enabled: typeof enabled === 'boolean' ? enabled : true
    };
}

