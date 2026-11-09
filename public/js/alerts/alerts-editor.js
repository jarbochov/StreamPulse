/**
 * StreamPulse — Alerts Studio Rule & Variant Inspector
 */

import {
    $, esc, ICONS, TRIGGERS, TRIGGER_META, ANIM_IN, ANIM_OUT, AMOUNT_LABEL, TOKENS,
    HAS_METRIC, DEFAULT_CHEERMOTES, SAMPLE_TOKENS, SND_GROUPS,
    cfg, sel, setSel, dirty, setDirty, openVariants, showThumbs,
    assets, timers, goals, liveStatus, lookByRule, rewardList, SFX_GROUPS,
    testAmount, setTestAmount, lastFocusedInput, setLastFocusedInput,
    channelEmotes, twitchCheermotes, cheermoteFamilies, customCheermotes,
    variantTab, variantMedia, rule, newVariant, setPath, api, guard,
    sourceOptions, isSfx, builtinName, soundCatalog, sndName,
    amountMode, variantGateMode, mediaKind, soundLabel, loadRewards, loadAssets, toast,
    testRewardOverrides
} from './alerts-state.js';
import { mountPreview, schedulePreview, playVariantSound } from './alerts-preview.js';
import { renderRules, save } from './alerts-rules.js';

export const VTABS = [
    ['visual', 'Visuals', ICONS.image],
    ['sound', 'Audio', ICONS.volume],
    ['timing', 'Timing & FX', ICONS.clock]
];

export function field(label, inner, hint = '') {
    return `<div class="row"><label>${label}</label>${inner}${hint ? `<small>${hint}</small>` : ''}</div>`;
}

export const inp = (path, value, type = 'text', extra = '') => `<input type="${type}" data-f="${path}" data-type="${type}" value="${esc(value)}" ${extra}>`;
export const segHtml = (attr, path, value, options) => `<span class="seg-pills"><select hidden ${attr}="${path}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${options.map(([v, l]) => `<button type="button" class="seg-btn${String(v) === String(value) ? ' active' : ''}" data-seg="${esc(v)}">${esc(l)}</button>`).join('')}</span>`;
export const seg_ = (path, value, options) => segHtml('data-f', path, value, options);
export const vseg = (i, key, value, options) => segHtml('data-v', `${i}.${key}`, value, options);
export const animOpts = (i, key, value, list) => `<select data-v="${i}.${key}">${list.map(a => `<option${a === value ? ' selected' : ''}>${a}</option>`).join('')}</select>`;
export const sel_ = (path, value, options) => `<select data-f="${path}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
export const vin = (i, key, label, value, attrs = '', type = 'number') => `<label class="fld"><span>${label}</span><input type="${type}" data-v="${i}.${key}" value="${esc(value)}" ${attrs}></label>`;
export const vsel = (i, key, label, value, options) => `<label class="fld"><span>${label}</span><select data-v="${i}.${key}">${options.map(a => `<option${a === value ? ' selected' : ''}>${a}</option>`).join('')}</select></label>`;

export function conditionsHtml(r) {
    const c = r.conditions, t = r.trigger;
    let html = '';
    if (AMOUNT_LABEL[t] && t !== 'sub') {
        const mode = amountMode(c);
        const step = t === 'donation' ? 'step="0.01" ' : '';
        html += field(`${AMOUNT_LABEL[t]} Condition`, seg_('conditions.amountMode', mode, [['min', 'At least'], ['range', 'Between'], ['exact', 'Equal to']]), 'Equal-to rules beat ranges; otherwise the highest minimum wins.');
        if (mode === 'exact') {
            html += field(`Exact ${AMOUNT_LABEL[t]}`, inp('conditions.exactAmount', c.exactAmount || c.minAmount || 0, 'number', `${step}min="0"`), t === 'donation' ? 'Matches within half a cent.' : '');
        } else {
            html += field(`Minimum ${AMOUNT_LABEL[t]}`, inp('conditions.minAmount', c.minAmount, 'number', `${step}min="0"`), 'When several rules match, the highest minimum wins (e.g. 100 vs 1000 bits).');
            if (mode === 'range') html += field(`Maximum ${AMOUNT_LABEL[t]}`, inp('conditions.maxAmount', c.maxAmount, 'number', `${step}min="0"`), 'Inclusive upper limit.');
        }
    }
    if (t === 'donation') {
        html += field('Donation Source', sel_('conditions.source', c.source || 'any', sourceOptions(c.source || 'any')), 'A rule for a specific source beats an "Any source" rule with the same amount.');
    }
    if (['sub', 'resub', 'milestone', 'gift'].includes(t)) {
        const tiers = Array.isArray(c.tiers) ? c.tiers : (c.tier ? [c.tier] : []);
        const allTiers = [
            ['1000', 'Tier 1'],
            ['2000', 'Tier 2'],
            ['3000', 'Tier 3'],
            ['prime', 'Prime']
        ];
        const checkboxes = `
            <div class="al-s6">
                ${allTiers.map(([val, label]) => `
                    <label class="check-row" style="font-size:0.78rem;">
                        <input type="checkbox" data-tier-check="${val}" ${tiers.includes(val) ? 'checked' : ''}>
                        <span>${label}</span>
                    </label>
                `).join('')}
            </div>
        `;
        html += field('Subscription Tiers', checkboxes, 'Check all applicable tiers (leave all checked or unchecked for Any Tier). Specific tier rules always take precedence over general rules.');
    }
    if (t === 'hype_train') html += field('When', sel_('conditions.phase', c.phase || 'any', [['any', 'Any stage'], ['start', 'Train starts'], ['levelup', 'Each level up'], ['end', 'Train ends']]), 'Needs the channel:read:hype_train scope (reconnect Twitch once). Level thresholds below apply to the train level.');
    if (t === 'redeem') {
        loadRewards(() => { renderEditor(); });
        const ids = c.rewardIds || [];
        const list = rewardList.rewards;
        const known = new Set(list.map(x => x.id));
        const rows = list.map(x => `<label class="check-row"><input type="checkbox" data-reward-check="${esc(x.id)}" ${ids.includes(x.id) ? 'checked' : ''}><span>${esc(x.title)} <small style="color:var(--text-muted)">${x.cost} pts${x.enabled ? '' : ' (disabled)'}</small></span></label>`)
            .concat(ids.filter(id => !known.has(id)).map(id => `<label class="check-row"><input type="checkbox" data-reward-check="${esc(id)}" checked><span>Unlisted reward <small style="color:var(--text-muted)">${esc(id.slice(0, 8))}</small></span></label>`)).join('');
        const status = rewardList.loading ? 'Loading your rewards...' : rewardList.error ? `Could not load rewards: ${esc(rewardList.error)}` : (!list.length ? 'No custom rewards found.' : '');
        html += field('Rewards', `<div class="reward-picker"><label class="check-row"><input type="checkbox" data-reward-all ${ids.length ? '' : 'checked'}><span><b>All redeems</b></span></label>${rows}${status ? `<div class="hint">${status}</div>` : ''}</div>`, 'Pick one or more rewards, or leave All redeems checked.');
        if (c.rewardName) html += field('Name filter (legacy)', inp('conditions.rewardName', c.rewardName, 'text', 'placeholder="blank = no name filter"'), 'Older rules matched by reward title text. Clear it to rely on the checkboxes.');
    }
    if (t === 'timer') html += field('Timer Trigger', sel_('conditions.timerId', c.timerId, [['', 'Any timer'], ...timers.map(x => [x.id, x.label || x.id])]));
    if (t === 'goal') html += field('Goal Trigger', sel_('conditions.goalId', c.goalId, [['', 'Any goal'], ...goals.map(x => [x.id, x.title])]));
    if (t === 'chat_word') html += field('Words or #Hashtags', inp('conditions.keywords', c.keywords.join(', '), 'list', 'placeholder="hype, #clip, gg"'), 'Comma separated. Matches whole words, case-insensitive.');
    if (t === 'chat_command') {
        html += field('Command Name', inp('conditions.command', c.command || '', 'text', 'placeholder="e.g. hype, shoutout, hydrate"'), 'Command word without the prefix (e.g. "hype" triggers on !hype).');
        html += field('Required Permission', seg_('conditions.permission', c.permission || 'everyone', [
            ['everyone', 'Everyone'],
            ['subs', 'Subs & VIPs'],
            ['mods', 'Mods'],
            ['streamer', 'Broadcaster']
        ]), 'Minimum role required to trigger this alert via chat.');
    }
    if (t === 'milestone') {
        html += field('Milestone Months', inp('conditions.milestones', c.milestones.join(', '), 'numlist', 'placeholder="6, 12, 24, 36"'), 'Specific anniversary milestones (comma-separated).');
        html += field('…or Every N Months', inp('conditions.everyMonths', c.everyMonths, 'number', 'min="0" max="120"'), '12 = every yearly anniversary (0 = off).');
    }
    return html;
}

export function focusPicker(i, v) {
    const x = v.focusX ?? 50, y = v.focusY ?? 50;
    return `<div class="focus-row"><div class="focus-pick" data-focus="${i}" style="background-image:url('${esc(v.image)}')" title="Click or drag to choose what stays visible when the image is cropped"><span class="focus-dot" style="left:${x}%;top:${y}%"></span></div><span class="hint">Focus point: moving it crops the image to fill the alert and keeps this spot in view.</span>${(v.focusX ?? 50) !== 50 || (v.focusY ?? 50) !== 50 ? `<button type="button" class="btn sm ghost" data-focus-reset="${i}">Reset</button>` : ''}</div>`;
}

export function mediaField(i, key, kinds, accept, label) {
    const v = rule().variants[i];
    const val = v[key] || '';
    const list = assets.filter(a => kinds.includes(a.kind));
    const isImg = kinds.includes('image');
    const isVid = kinds.includes('video');
    return `
    <div class="media-field-box">
        <div class="media-field-top">
            <span class="media-field-label">${label}</span>
            ${val ? `<button type="button" class="btn ghost sm danger" data-clear-media="${i}.${key}" style="font-size:0.68rem;padding:0.08rem 0.45rem;">Clear</button>` : ''}
        </div>
        <div class="media-field-main">
            ${val ? `
                <div class="media-preview-box" title="${esc(val)}">
                    ${isImg ? `<img src="${esc(val)}" alt="" onerror="this.parentElement.style.display='none'">` : isVid ? `<video src="${esc(val)}" muted preload="metadata" onerror="this.parentElement.style.display='none'"></video>` : `<div style="font-size:1.4rem;color:var(--accent);">${ICONS.volume}</div>`}
                </div>
            ` : ''}
            <div class="media-row">
                <input type="text" data-v="${i}.${key}" placeholder="Paste URL or choose below" value="${esc(val)}">
                <button type="button" class="btn sm" data-library="${i}.${key}" data-kinds="${kinds.join(',')}" ${list.length ? '' : 'disabled'}>
                    ${ICONS.folder} <span>Library (${list.length})</span>
                </button>
                <button type="button" class="btn sm" data-upload="${i}.${key}" data-accept="${accept}">
                    ${ICONS.upload} <span>Upload</span>
                </button>
            </div>
        </div>
    </div>`;
}

export function soundHtml(v, i) {
    const isBuiltin = !!(builtinName(v) || isSfx(v));
    const file = isBuiltin ? '' : mediaField(i, 'sound', ['audio'], 'audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg', 'Custom Audio File');
    const chip = isBuiltin ? `
        <div class="media-field-box">
            <div class="media-field-top"><span class="media-field-label">Built-in Sound</span></div>
            <div class="snd-chip">
                <button type="button" class="btn sm icon-btn" data-snd-play="${i}" aria-label="Play ${esc(sndName(v.sound))}">${ICONS.play}</button>
                <span class="snd-chip-name" title="${esc(v.sound)}">${esc(sndName(v.sound))}</span>
                <button type="button" class="btn sm" data-snd-browse="${i}">Change</button>
                <button type="button" class="btn sm ghost danger icon-btn" data-snd-remove="${i}" aria-label="Remove built-in sound">${ICONS.close}</button>
            </div>
        </div>` : '';
    const browse = isBuiltin ? '' : `<div><button type="button" class="btn sm" data-snd-browse="${i}"><svg class="ico" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> <span>Browse built-in sounds</span></button></div>`;
    return `
    <div class="vgrid c2">
        ${chip}${isBuiltin ? '' : `<div style="display:flex;flex-direction:column;gap:0.5rem;">${file}${browse}</div>`}
    </div>`;
}

// Built-in sound browser state & methods
export const snd = { idx: 0, pending: '', group: localStorage.getItem('alerts.sndGroup') || 'Celebration', q: '', audio: null, playing: '', opener: null };
export function sndStop() {
    try { snd.audio && snd.audio.pause && snd.audio.pause(); } catch {}
    snd.audio = null;
    snd.playing = '';
}
export function sndPlay(value, vol) {
    sndStop();
    snd.playing = value;
    if (window.OverlayShared) snd.audio = window.OverlayShared.playSoundValue(value, vol);
    setTimeout(() => { if (snd.playing === value) { snd.playing = ''; sndRender(); } }, 4000);
}
export function sndRender() {
    const dlg = $('snd-dlg');
    if (!dlg) return;
    const all = soundCatalog();
    const q = snd.q.trim().toLowerCase();
    dlg.querySelector('#snd-tabs').innerHTML = SND_GROUPS.map(g => `<button type="button" role="tab" class="snd-tab${!q && g === snd.group ? ' active' : ''}" aria-selected="${!q && g === snd.group}" data-snd-group="${esc(g)}">${esc(g)} <span class="count-pill">${all.filter(s => s.group === g).length}</span></button>`).join('');
    const items = all.filter(s => q ? (s.label + ' ' + s.group).toLowerCase().includes(q) : s.group === snd.group);
    dlg.querySelector('#snd-list').innerHTML = (items.length ? items : []).map(s => `
        <div class="snd-item${s.value === snd.pending ? ' selected' : ''}" data-snd-pick="${esc(s.value)}" role="option" aria-selected="${s.value === snd.pending}" tabindex="0">
            <button type="button" class="btn sm icon-btn" data-snd-toggle="${esc(s.value)}" aria-label="${snd.playing === s.value ? 'Stop' : 'Play'} ${esc(s.label)}">${snd.playing === s.value ? ICONS.stop : ICONS.play}</button>
            <span class="snd-item-name">${esc(s.label)}${q ? ` <span class="snd-item-grp">${esc(s.group)}</span>` : ''}</span>
            ${s.value === snd.pending ? `<svg class="ico snd-check" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </div>`).join('') || '<div class="snd-empty">No sounds match.</div>';
    dlg.querySelector('#snd-none')?.classList.toggle('selected', !snd.pending);
}
export function sndOpen(idx) {
    const v = rule().variants[idx];
    snd.idx = idx;
    snd.q = '';
    snd.opener = document.activeElement;
    snd.pending = (builtinName(v) || isSfx(v)) ? v.sound : '';
    const cur = soundCatalog().find(s => s.value === snd.pending);
    if (cur) snd.group = cur.group;
    if (!SND_GROUPS.includes(snd.group)) snd.group = SND_GROUPS[0];
    const qInp = $('snd-q');
    if (qInp) qInp.value = '';
    sndRender();
    const dlg = $('snd-dlg');
    if (dlg) {
        dlg.showModal();
        qInp?.focus();
    }
}
export function sndClose() {
    sndStop();
    const d = $('snd-dlg');
    if (d && d.open) d.close();
}
export function sndCommit() {
    const r = rule(), v = r.variants[snd.idx];
    const was = (builtinName(v) || isSfx(v)) ? v.sound : '';
    if (snd.pending !== was) {
        if (snd.pending) v.sound = snd.pending;
        else if (was) v.sound = '';
        setDirty(true);
    }
    sndClose();
    renderEditor();
}

export function emojiHtml(v, i, r) {
    const amountLabel = AMOUNT_LABEL[r.trigger] && r.trigger !== 'sub' ? AMOUNT_LABEL[r.trigger].toLowerCase() : '';
    const emoteEffect = v.emoteEffect || 'showcase';
    const emoteScale = v.emoteScale ?? 100;
    const emoteDensity = v.emoteDensity ?? 30;

    const effectExplainer = {
        showcase: 'Big, prominent hero emote centered in the alert box.',
        rain: 'Emotes stream down continuously from the top across the alert card like rain.',
        party: 'Celebratory confetti-style explosion of emotes bursting outward in all directions.',
        fountain: 'Emotes shoot upward from the bottom like a fireworks geyser and arc down.',
        bounce: 'Joyful floating and bouncing emotes dancing across the alert card.'
    }[emoteEffect] || 'Showcase hero emote centered in the alert box.';

    const viewerMode = r.trigger === 'bits' && (v.emoteSource || 'viewer') === 'viewer';
    const ladder = amountLabel && !viewerMode ? `
        <div class="al-s7 fld-guide-card">
            <div class="al-s8">
                ${ICONS.info} <span>${AMOUNT_LABEL[r.trigger]} Guide: Emote Ladder vs. Milestone Variants — Which should you use?</span>
            </div>
            <div class="al-s9">
                <div class="al-s10">
                    <div class="al-s11">
                        <span style="color:var(--accent);font-weight:900;">&#9670;</span> Use an Emote Ladder when:
                    </div>
                    <div>You want to keep the <b>same alert look and sound</b>, but want the emote to change (e.g. cheer badges) or trigger a bigger emote rain/party as the ${amountLabel} increase.</div>
                    <div class="al-s12">Example: 100 bits drops Cheer100; 1,000 bits drops a heavy Cheer1000 emote party.</div>
                </div>
                <div class="al-s10">
                    <div class="al-s11">
                        <span style="color:var(--success);font-weight:900;">&#9670;</span> Use a Milestone Variant when:
                    </div>
                    <div>You want a <b>completely different alert experience</b> — such as a louder sound, custom message text, a custom video/GIF, or a longer on-screen duration.</div>
                    <div class="al-s12">Example: 100+ bits plays a hype horn sound and video; 5,000+ bits triggers an epic celebration alert.</div>
                </div>
            </div>
        </div>

        <div class="fld" style="margin-top:0.75rem;">
            <span class="al-s13">
                <span>Emoji / Emote Ladder (escalates by ${amountLabel})</span>
                <span class="hint" style="font-size:0.69rem;">Changes the emote (or rain/party) when ${amountLabel} reach these levels</span>
            </span>
            <div style="display:grid;gap:0.4rem;margin-top:0.35rem;">
                ${v.emojiLadder.map((step, j) => `
                    <div class="al-s14 media-row">
                        <span class="al-s15">from &ge;</span>
                        <input type="number" min="0" style="max-width:110px;" data-lad="${i}.${j}.min" value="${esc(step.min)}">
                        <span style="font-size:0.75rem;color:var(--text-muted);">${amountLabel}:</span>
                        <input type="text" maxlength="2000" placeholder="e.g. HypeEmote, fa-solid fa-fire, or image URL" data-lad="${i}.${j}.emoji" value="${esc(step.emoji)}">
                        ${step.emojiUrl ? `<img class="al-s16" src="${esc(step.emojiUrl)}" alt="">` : ''}
                        <button type="button" class="btn sm danger icon-btn" data-del-step="${i}.${j}" title="Remove step">${ICONS.close}</button>
                    </div>
                `).join('')}
                <div>
                    <button type="button" class="btn sm" data-add-step="${i}" ${v.emojiLadder.length >= 12 ? 'disabled' : ''}>${ICONS.plus} Add Ladder Step</button>
                </div>
            </div>
        </div>
        <div class="al-s17 vgrid c3">
            ${vin(i, 'emojiEvery', `One emote per N ${amountLabel} (0 = off)`, v.emojiEvery, 'min="0"')}
            ${vin(i, 'emojiMax', 'Max repeated emotes', v.emojiMax, 'min="1" max="25"')}
            <label class="fld">
                <span>Test ${amountLabel}</span>
                <input type="number" min="0" data-test-amount value="${testAmount || ''}" placeholder="${r.conditions.minAmount || 100}">
            </label>
        </div>` : '';

    return `
    <div style="display:grid;gap:0.75rem;">
        ${r.trigger === 'bits' ? `
            <div class="al-s18">
                <div class="al-s19">
                    <span class="al-s20">Bits Emote Source:</span>
                    ${vseg(i, 'emoteSource', v.emoteSource || 'viewer', [
                        ['viewer', 'Auto Viewer Cheermote'],
                        ['custom', 'Custom Emote / Ladder']
                    ])}
                </div>
                ${(v.emoteSource || 'viewer') === 'viewer' ? `
                    <div class="al-s21">
                        <div class="al-s22">
                            ${ICONS.info} <span>Automatically resolves official animated Twitch cheermotes from the viewer's chat message (or the total bits tier).</span>
                        </div>
                        <div class="al-s23">
                            <span style="font-size:0.73rem;font-weight:700;color:var(--text-muted);">Family Theme:</span>
                            <select class="al-s24" data-v="${i}.cheermoteFamily">
                                <option value="auto"${(!v.cheermoteFamily || v.cheermoteFamily === 'auto') ? ' selected' : ''}>Auto (Match message or Cheer)</option>
                                <option value="cheer"${v.cheermoteFamily === 'cheer' ? ' selected' : ''}>Official Cheer (Standard)</option>
                                ${Object.keys(cheermoteFamilies).filter(k => k !== 'cheer').map(k => `
                                    <option value="${esc(k)}"${v.cheermoteFamily === k ? ' selected' : ''}>${esc(cheermoteFamilies[k]?.name || k)}</option>
                                `).join('')}
                                ${customCheermotes.map(c => `
                                    <option value="${esc(c.prefix)}"${v.cheermoteFamily === c.prefix ? ' selected' : ''}>${esc(c.prefix)} (Channel custom)</option>
                                `).join('')}
                            </select>
                            <span class="al-s25 hint">Tiers: 1, 100, 500, 1000, 5000, 10000, 100000.</span>
                        </div>
                    </div>
                ` : `
                    <div class="al-s26">
                        ${ICONS.info} <span>Using a fixed custom emote or ladder. You can also populate official cheermotes into the ladder below with one click.</span>
                        <div style="margin-top:0.35rem;">
                            <button type="button" class="btn sm" data-populate-cheermotes="${i}">
                                ${ICONS.sparkles} Populate Ladder from Twitch Cheermotes
                            </button>
                        </div>
                    </div>
                `}
            </div>
        ` : ''}

        ${!viewerMode ? `
            <div class="fld">
                <span class="al-s13">
                    <span>Base Hero Emoji or Emote</span>
                    <span class="hint" style="font-size:0.69rem;">Name, FontAwesome icon class (e.g. fa-solid fa-star), or custom image URL</span>
                </span>
                <div class="media-row" style="margin-top:0.25rem;">
                    <input type="text" data-v="${i}.emoji" placeholder="e.g. PartyPopper, Twitch emote name, fa-solid fa-heart" value="${esc(v.emoji || '')}">
                    ${v.emojiUrl ? `<img class="al-s27" src="${esc(v.emojiUrl)}" alt="" title="Resolved image">` : ''}
                    ${v.emojiUrl ? `<button type="button" class="btn sm ghost danger icon-btn" data-clear-emote-url="${i}" title="Clear image URL">${ICONS.close}</button>` : ''}
                </div>
            </div>

            ${channelEmotes.length ? `
                <div class="fld" style="margin-top:0.2rem;">
                    <span class="al-s28 hint">Quick-pick from your channel emotes:</span>
                    <div class="al-s29 emote-picker-chips">
                        ${channelEmotes.slice(0, 16).map(e => `
                            <button type="button" class="btn sm ghost emote-chip${v.emoji === e.name ? ' active' : ''}" data-select-channel-emote="${esc(e.name)}" data-emote-url="${esc(e.url)}" data-vi="${i}" title="${esc(e.name)}">
                                <img src="${esc(e.url)}" alt="${esc(e.name)}" style="width:16px;height:16px;vertical-align:-2px;margin-right:4px;">
                                <span>${esc(e.name)}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        ` : ''}

        <!-- Emote Celebration Effects -->
        <div class="al-s30">
            <div class="vgrid c3" style="align-items:end;">
                <label class="fld">
                    <span style="font-weight:700;">Celebration Animation Effect</span>
                    <select data-v="${i}.emoteEffect">
                        <option value="showcase"${emoteEffect === 'showcase' ? ' selected' : ''}>Showcase (Single Hero Emote)</option>
                        <option value="rain"${emoteEffect === 'rain' ? ' selected' : ''}>Emote Rain (Cascading stream)</option>
                        <option value="party"${emoteEffect === 'party' ? ' selected' : ''}>Emote Party (Explosive confetti)</option>
                        <option value="fountain"${emoteEffect === 'fountain' ? ' selected' : ''}>Emote Fountain (Geyser shooting up)</option>
                        <option value="bounce"${emoteEffect === 'bounce' ? ' selected' : ''}>Bouncing Emotes (Joyful float)</option>
                    </select>
                </label>
                <label class="fld">
                    <span>Emote Size Scale</span>
                    <div style="display:flex;align-items:center;gap:0.4rem;">
                        <input type="range" min="40" max="250" data-v="${i}.emoteScale" value="${emoteScale}">
                        <span style="font-size:0.75rem;font-weight:700;width:38px;">${emoteScale}%</span>
                    </div>
                </label>
                ${emoteEffect !== 'showcase' ? `
                    <label class="fld">
                        <span>Particle Density</span>
                        <div style="display:flex;align-items:center;gap:0.4rem;">
                            <input type="range" min="10" max="80" data-v="${i}.emoteDensity" value="${emoteDensity}">
                            <span style="font-size:0.75rem;font-weight:700;width:38px;">${emoteDensity}</span>
                        </div>
                    </label>
                ` : ''}
            </div>
            <div class="al-s22" style="margin-top:0.4rem;">
                ${ICONS.info} <span>${effectExplainer}</span>
            </div>
        </div>

        ${ladder}
    </div>`;
}

export function variantHtml(v, i, r) {
    const open = r.variants.length === 1 || openVariants.has(v.id);
    const hasMetric = HAS_METRIC.includes(r.trigger);
    const metricName = AMOUNT_LABEL[r.trigger] || (['sub', 'resub', 'milestone'].includes(r.trigger) ? 'Months' : 'Amount');
    const isMilestone = hasMetric && (v.variantType === 'gated' || (v.gateMin > 0) || (v.gateMax > 0));
    const gateMode = variantGateMode(v);
    const tab = variantTab.get(v.id) || 'visual';
    const media = variantMedia.get(v.id) || (v.video ? 'video' : v.image ? 'image' : (v.emoji || v.emojiUrl || v.emojiLadder?.length || (r.trigger === 'bits' && v.emoteSource !== 'custom')) ? 'emoji' : 'image');

    let pool = [];
    if (isMilestone) {
        pool = r.variants.filter(other => (other.variantType === 'gated' || other.gateMin > 0) && (other.gateMin || 0) === (v.gateMin || 0));
    } else {
        pool = r.variants.filter(other => other.variantType !== 'gated' && !other.gateMin && !other.gateMax);
    }
    if (!pool.length) pool = [v];
    const totalPoolWeight = pool.reduce((sum, item) => sum + Math.max(1, Number(item.weight) || 1), 0);
    const oddsPct = Math.round((Math.max(1, Number(v.weight) || 1) / totalPoolWeight) * 100);

    let thumbHtml = '';
    if (v.image) {
        thumbHtml = `<img src="${esc(v.image)}" alt="" onerror="this.parentElement.innerHTML='${ICONS.image.replace(/'/g, "\\'")}'">`;
    } else if (v.video) {
        thumbHtml = `<video src="${esc(v.video)}" muted preload="metadata"></video>`;
    } else if (v.emojiUrl) {
        thumbHtml = `<img src="${esc(v.emojiUrl)}" alt="" onerror="this.parentElement.innerHTML='${ICONS.smile.replace(/'/g, "\\'")}'">`;
    } else if (v.emoji) {
        thumbHtml = `<span>${ICONS.smile}</span>`;
    } else {
        thumbHtml = `<span>${ICONS.image}</span>`;
    }

    let tierBadge = '';
    if (hasMetric) {
        if (isMilestone) {
            const gm = variantGateMode(v);
            tierBadge = `<span class="tier-badge milestone">${ICONS.flag} Milestone: ${gm === 'exact' ? '=' : '&ge;'} ${v.gateMin || 0} ${esc(metricName)}${gm === 'range' && v.gateMax > 0 ? ` - &le; ${v.gateMax}` : ''}</span>`;
        } else {
            tierBadge = `<span class="tier-badge base">${ICONS.zap} Base Alert (Any ${esc(metricName)})</span>`;
        }
    } else {
        tierBadge = `<span class="tier-badge default">${ICONS.zap} Standard Alert</span>`;
    }

    const oddsBadge = pool.length > 1 ? `<span class="odds-badge weighted" title="${oddsPct}% chance among variants at this tier level">${oddsPct}% roll</span>` : '';

    const panels = {
        visual: `
            <div class="al-s31">
                <span class="al-s32">Media Mode:</span>
                <div class="seg-pills">
                    ${[['image', 'Image / GIF', ICONS.image], ['video', 'Video', ICONS.video], ['emoji', 'Emoji & Emotes', ICONS.smile]].map(([key, label, icon]) => `
                        <button type="button" class="seg-btn${key === media ? ' active' : ''}" data-vmedia="${key}" data-vid-tab="${esc(v.id)}">
                            ${icon} <span>${label}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            ${media === 'video' ? `
                ${mediaField(i, 'video', ['video'], 'video/mp4,video/webm', 'Alert Video (WebM / MP4)')}
                <div class="video-options-bar">
                    <div class="video-options-left">
                        <label class="check-row">
                            <input type="checkbox" data-v="${i}.videoSound" ${v.videoSound ? 'checked' : ''}>
                            <span>Play video audio</span>
                        </label>
                        <label class="check-row">
                            <input type="checkbox" data-v="${i}.videoLoop" ${v.videoLoop !== false ? 'checked' : ''}>
                            <span>Loop video</span>
                        </label>
                    </div>
                    ${v.videoSound ? `
                        <div class="video-vol-group">
                            <span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">Video volume</span>
                            <input type="range" class="vol-slider" min="0" max="100" data-v="${i}.videoVolume" data-vidvol-slider="${i}" value="${v.videoVolume ?? 70}" style="width:100px;">
                            <span class="vol-badge" id="vidvol-badge-${i}">${v.videoVolume ?? 70}%</span>
                        </div>
                    ` : ''}
                </div>
            ` : media === 'image' ? `
                ${mediaField(i, 'image', ['image'], 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', 'Alert Image / GIF')}
                ${v.image ? focusPicker(i, v) : ''}
                ${v.video ? '<span class="al-s33 hint">Note: A video URL is also set and takes priority over the image on playback.</span>' : ''}
            ` : `
                ${emojiHtml(v, i, r)}
                ${v.video || v.image ? '<span class="al-s33 hint">Emoji only display when image and video are blank.</span>' : ''}
            `}
        `,
        sound: `
            <div class="audio-field-card">
                ${soundHtml(v, i)}
                <div class="al-s34 fld">
                    <div class="al-s13">
                        <label>Alert volume</label>
                        <span class="vol-badge" id="vol-badge-${i}">${v.volume ?? 70}%</span>
                    </div>
                    <div class="vol-wrap" style="margin-top:0.25rem;">
                        <svg class="al-s35 ico sm" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>
                        <input type="range" class="vol-slider" min="0" max="100" data-v="${i}.volume" data-vol-slider="${i}" value="${v.volume ?? 70}">
                        <svg class="ico sm" style="color:var(--text);" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    </div>
                </div>
            </div>
        `,
        timing: `
            <div class="al-s36 vgrid c3">
                ${vin(i, 'duration', 'Show Duration (s)', v.duration, 'min="1" max="120" step="0.5"')}
                <div class="fld" style="grid-column:span 2;"><span>Animation</span><div class="anim-row" style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">${animOpts(i, 'animIn', v.animIn, ANIM_IN)}<span class="al-s35">then</span>${animOpts(i, 'animOut', v.animOut, ANIM_OUT)}<button type="button" class="btn sm" data-replay="${i}" title="Replay in the live preview">${ICONS.play} <span>Replay</span></button></div></div>
            </div>
        `
    };

    return `
    <details class="variant" data-vid="${esc(v.id)}"${open ? ' open' : ''}>
        <summary>
            <div class="vsum-top">
                <div class="vsum-badges">
                    ${showThumbs() ? `<span class="vthumb sm">${thumbHtml}</span>` : ''}<span class="vnum-badge">Variant ${i + 1}</span>
                    ${tierBadge}
                    ${oddsBadge}
                </div>
                <div class="vsum-text-col">
                    <div class="vsum-title" title="${esc(v.title || '')}">${esc(v.title || '(No title template set)')}</div>
                    <div class="vsum-line">${variantWarnings(v, i, r).length ? `<span class="vwarn" title="${esc(variantWarnings(v, i, r).join('; '))}">${ICONS.warn}</span> ` : ''}${esc([mediaKind(v) || 'No media', soundLabel(v) || 'No sound', `${v.duration}s`].join(' · '))}</div>
                </div>
                <div class="vsum-actions">
                    <div class="vmeta-chips"></div>
                    <button type="button" class="btn sm ghost v-preview-btn" data-test-variant="${i}" title="Preview this variant on overlays">
                        ${ICONS.play} <span>Preview</span>
                    </button>
                    <button type="button" class="btn sm ghost" data-dup-variant="${i}" title="Duplicate this variant">
                        ${ICONS.copy} <span>Duplicate</span>
                    </button>
                    <button type="button" class="btn sm ghost danger" data-del-variant="${i}" ${r.variants.length < 2 ? 'disabled' : ''} title="Remove this variant">
                        ${ICONS.trash} <span>Remove</span>
                    </button>
                    <span class="v-chevron">${ICONS.chevronDown}</span>
                </div>
            </div>
        </summary>
        <div class="variant-body">
            <!-- Section 1: Activation & Tier Rules -->
            <div class="vsection-card">
                <div class="vsection-head">
                    <span class="vsection-title">${ICONS.layers} Activation &amp; Tier Rules</span>
                </div>
                ${hasMetric ? `
                    <div class="role-cards-grid">
                        <label class="role-card-label${!isMilestone ? ' active' : ''}" data-role-card="base" data-vi="${i}">
                            <input type="radio" name="vrole-${i}" value="base" ${!isMilestone ? 'checked' : ''}>
                            <div class="role-card-content">
                                <div class="role-card-title">${ICONS.zap} Base Alert (Default)</div>
                                <div class="role-card-desc">Plays for standard events or when no milestone tier threshold is reached.</div>
                            </div>
                        </label>
                        <label class="role-card-label${isMilestone ? ' active' : ''}" data-role-card="milestone" data-vi="${i}">
                            <input type="radio" name="vrole-${i}" value="milestone" ${isMilestone ? 'checked' : ''}>
                            <div class="role-card-content">
                                <div class="role-card-title">${ICONS.flag} Milestone Tier (Threshold)</div>
                                <div class="role-card-desc">Escalates this alert when ${esc(metricName)} meets or exceeds a target number.</div>
                            </div>
                        </label>
                    </div>
                    ${isMilestone ? `
                        <div class="threshold-params-row">
                            <div class="threshold-inputs">
                                <span class="al-s37">${esc(metricName)}:</span>
                                ${vseg(i, 'gateMode', gateMode, [['min', 'At least'], ['range', 'Between'], ['exact', 'Equal to']])}
                                <div class="input-affix-group" title="${gateMode === 'exact' ? 'Exact' : 'Minimum'} ${esc(metricName)} required to activate this tier">
                                    <span class="input-affix">${gateMode === 'exact' ? '=' : '&ge;'}</span>
                                    <input type="number" min="0" step="any" data-v="${i}.gateMin" value="${v.gateMin ?? 0}">
                                </div>
                                ${gateMode === 'range' ? `<span style="font-size:0.73rem;color:var(--text-muted);font-weight:600;">to</span>
                                <div class="input-affix-group" title="Maximum ${esc(metricName)} (inclusive)">
                                    <span class="input-affix">&le;</span>
                                    <input type="number" min="0" step="any" data-v="${i}.gateMax" value="${v.gateMax ?? 0}">
                                </div>` : ''}
                            </div>
                            <div class="threshold-explainer">
                                ${ICONS.info}
                                <span>${gateMode === 'exact' ? `Activates when <b>${esc(metricName)} = ${v.gateMin || 0}</b>. Exact tiers beat ranges.` : `Activates when <b>${esc(metricName)} &ge; ${v.gateMin || 0}</b>${gateMode === 'range' && v.gateMax > 0 ? ` and &le; ${v.gateMax}` : ''}. Highest matching tier wins.`}</span>
                            </div>
                        </div>
                        <div class="al-s38">
                            ${ICONS.info}
                            <span><b>Tip:</b> If you only want to change the emote or trigger an emote rain/party as ${esc(metricName)} scale up while keeping the same sound and layout, use the <b>Emote Ladder</b> in the Visuals tab instead of creating multiple variants.</span>
                        </div>
                    ` : ''}
                ` : `
                    <div class="al-s39">
                        ${ICONS.zap} <span>Always triggers when this alert rule fires.</span>
                    </div>
                `}
                <div class="odds-row">
                    <div class="odds-left">
                        <label class="odds-input-box" title="Relative weight among variants at this tier level">
                            <span style="font-size:0.73rem;font-weight:700;color:var(--text-muted);">Variant Weight:</span>
                            <input type="number" min="1" max="100" data-v="${i}.weight" value="${v.weight ?? 1}">
                        </label>
                        <span class="odds-pill-large" title="Probability of rolling this variant when this tier activates">${oddsPct}% Chance</span>
                        <span class="odds-hint-text">when this tier qualifies</span>
                    </div>
                </div>
            </div>

            <!-- Section 2: Content & Template -->
            <div class="vsection-card">
                <div class="vsection-head">
                    <span class="vsection-title">${ICONS.type} Alert Text &amp; Placeholders</span>
                </div>
                <div class="full-text-field">
                    <div class="field-label-row"><label>Title Template</label><button type="button" class="btn sm ghost" data-ph-open="${i}.title" title="Insert a placeholder at the cursor">{{ }} Placeholder</button></div>
                    <input type="text" class="full-text-input" data-v="${i}.title" value="${esc(v.title || '')}" placeholder="e.g. {{alert.user}} resubscribed for {{alert.months}} months!">
                </div>
                <div class="al-s17 full-text-field">
                    <div class="field-label-row"><label>Subtitle / Message (Optional)</label><button type="button" class="btn sm ghost" data-ph-open="${i}.message" title="Insert a placeholder at the cursor">{{ }} Placeholder</button></div>
                    <input type="text" class="full-text-input" data-v="${i}.message" value="${esc(v.message || '')}" placeholder="e.g. Thanks for the amazing support!">
                </div>
            </div>

            <details class="vsection-card live-card" data-persist="alerts.livePreview"${localStorage.getItem('alerts.livePreview') !== '0' ? ' open' : ''}>
                <summary class="vsection-head">
                    <span class="vsection-title">${ICONS.play} Live preview</span>
                    <span class="live-actions" style="display:inline-flex;gap:0.35rem;flex-wrap:wrap;">
                        <button type="button" class="btn sm" data-play-sound="${i}" title="Play this variant's sound at its saved volume">${ICONS.volume} <span>Play sound</span></button>
                        <span class="btn sm ghost live-toggle">${ICONS.chevronDown}</span>
                    </span>
                </summary>
                <div class="v-live-stage" data-live="${i}"></div>
                <div class="hint live-note">Preview only. Build alert overlays in the <a href="/custom-overlay-editor.html?new=1" target="_blank" rel="noopener">Overlay Editor</a> (Alert box element) to control position, size and style.</div>
            </details>

            <!-- Section 3: Visuals, Audio & Timing -->
            <div class="vsection-card">
                <div class="vtabs">
                    ${VTABS.map(([key, label, icon]) => `
                        <button type="button" class="vtab${key === tab ? ' active' : ''}" data-vtab="${key}" data-vid-tab="${esc(v.id)}">
                            ${icon} <span>${label}</span>
                        </button>
                    `).join('')}
                </div>
                ${panels[tab] || panels.visual}
            </div>
        </div>
    </details>`;
}

export function summary(r, whenOnly) {
    const c = r.conditions, t = TRIGGERS[r.trigger];
    const hasAmt = !!AMOUNT_LABEL[r.trigger] && r.trigger !== 'sub';
    let when = `When there is a "${t}"`;
    if (['sub', 'resub', 'milestone', 'gift'].includes(r.trigger)) {
        const tiers = Array.isArray(c.tiers) ? c.tiers : (c.tier ? [c.tier] : []);
        const tierNames = { '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3', 'prime': 'Prime' };
        if (tiers.length > 0 && tiers.length < 4) {
            when += ` (${tiers.map(val => tierNames[val] || val).join(', ')})`;
        }
    }
    const mode = amountMode(c);
    if (hasAmt && mode === 'exact') when += ` of exactly ${c.exactAmount || c.minAmount}`;
    else if (hasAmt && mode === 'range' && c.minAmount && c.maxAmount) when += ` between ${c.minAmount} and ${c.maxAmount}`;
    else if (hasAmt && c.minAmount) when += ` of ${c.minAmount} or more`;
    if (r.trigger === 'donation' && c.source && c.source !== 'any') when += ` from ${sourceOptions(c.source).find(([id]) => id === c.source)?.[1] || c.source}`;
    if (r.trigger === 'redeem' && c.rewardName) when += ` for "${c.rewardName}"`;
    else if (r.trigger === 'redeem' && c.rewardIds?.length) when += ` for ${c.rewardIds.length === 1 ? (rewardList.rewards.find(x => x.id === c.rewardIds[0])?.title || '1 reward') : c.rewardIds.length + ' rewards'}`;
    if (r.trigger === 'chat_word' && c.keywords.length) when += `: ${c.keywords.join(', ')}`;
    if (r.trigger === 'chat_command' && c.command) when += ` "!${c.command}" (${c.permission || 'everyone'})`;
    if (whenOnly) {
        const m = hasAmt ? (mode === 'exact' ? `exactly ${c.exactAmount || c.minAmount}` : mode === 'range' && c.minAmount && c.maxAmount ? `${c.minAmount}-${c.maxAmount}` : c.minAmount ? `${c.minAmount}+` : '') : '';
        const unit = { bits: 'bits', raid: 'viewers', gift: 'gifted subs', donation: '', redeem: 'points' }[r.trigger] || '';
        const verb = { bits: 'cheers', raid: 'raids with', gift: 'gifts', donation: 'donates', follow: 'follows', sub: 'subscribes', resub: 'resubscribes', redeem: 'redeems' }[r.trigger];
        if (verb) return `When someone ${verb}${m ? ' ' + m : ''}${unit && m ? ' ' + unit : ''}${r.trigger === 'redeem' && c.rewardName ? ` "${c.rewardName}"` : ''}${c.cooldownSeconds ? ` (${c.cooldownSeconds}s cooldown)` : ''}`;
        return when;
    }
    const extras = [r.actions.timer.enabled ? 'trigger a timer' : '', r.actions.http.enabled ? `send a webhook${r.actions.http.delay > 0 ? ` (after ${r.actions.http.delay}s)` : ''}` : ''].filter(Boolean);
    if (r.webhookOnly) {
        const actStr = extras.length ? extras.join(' and ') : 'run its actions only';
        return `${when}, ${actStr} silently without on-screen overlay or page takeovers.${r.enabled ? '' : ' (This rule is currently disabled.)'}`;
    }
    return `${when}, display ${r.variants.length > 1 ? `one of ${r.variants.length} variants` : 'the alert'}${extras.length ? ' and ' + extras.join(' and ') : ''}.${r.enabled ? '' : ' (This rule is currently disabled.)'}`;
}

export const isMilestoneV = (v, r) => HAS_METRIC.includes(r.trigger) && (v.variantType === 'gated' || v.gateMin > 0 || v.gateMax > 0);

export function variantWarnings(v, i, r) {
    const w = [];
    if (r.webhookOnly) return w;
    if (!v.sound) w.push('No sound set');
    if (!mediaKind(v) && !(r.trigger === 'bits' && v.emoteSource !== 'custom')) w.push('No media set');
    if (isMilestoneV(v, r) && v.gateMax > 0 && v.gateMax < v.gateMin) w.push(`Unreachable: maximum ${v.gateMax} is below minimum ${v.gateMin}`);
    return w;
}

export function ruleWarnings(r) {
    const out = [];
    if (!HAS_METRIC.includes(r.trigger)) return out;
    const ms = r.variants.filter(v => isMilestoneV(v, r));
    const base = r.variants.filter(v => !isMilestoneV(v, r));
    if (ms.length && !base.length) out.push({ level: 'warn', text: 'Milestone tiers exist but there is no Base Alert; events below the lowest tier show nothing.', vid: ms[0].id });
    const byMin = new Map();
    ms.forEach(v => { const k = `${variantGateMode(v)}:${Number(v.gateMin) || 0}`; byMin.set(k, (byMin.get(k) || 0) + 1); });
    byMin.forEach((n, k) => { if (n > 1) out.push({ level: 'warn', text: `${n} variants share threshold ${k.split(':')[1]}; they roll by weight instead of escalating.` }); });
    const minAmt = Number(r.conditions.minAmount) || 0;
    const lowest = ms.filter(v => variantGateMode(v) === 'min').reduce((m, v) => Math.min(m, Number(v.gateMin) || 0), Infinity);
    if (base.length && ms.length && minAmt > 0 && lowest <= minAmt) out.push({ level: 'warn', text: `Base Alert is unreachable: every event of ${minAmt}+ already meets the ${lowest} milestone.`, vid: base[0].id });
    return out;
}

// Asset Library Modal
let libTarget = null, libKinds = [];
export function cleanupLibMedia() {
    const grid = $('lib-grid');
    if (!grid) return;
    if (window.OverlayShared?.cleanupMedia) {
        window.OverlayShared.cleanupMedia(grid);
    } else {
        grid.querySelectorAll('video, audio').forEach(m => {
            try { m.pause(); m.removeAttribute('src'); m.load(); } catch {}
        });
    }
}

export function renderLib() {
    const q = $('lib-q')?.value.toLowerCase() || '';
    const list = assets.filter(a => libKinds.includes(a.kind) && (a.label || a.name).toLowerCase().includes(q));
    cleanupLibMedia();
    const grid = $('lib-grid');
    if (grid) {
        grid.innerHTML = list.length ? list.map(a => `
            <button type="button" class="lib-item" data-url="${esc(a.url)}" title="${esc(a.label || a.name)}">
                <div class="th">
                    ${a.kind === 'image' ? `<img loading="lazy" decoding="async" src="${esc(a.url)}" alt="">` : a.kind === 'video' ? `<video preload="none" muted playsinline src="${esc(a.url)}#t=0.1"></video>` : `<span style="font-size:1.6rem;">${ICONS.volume}</span>`}
                </div>
                <span class="nm">${esc(a.label || a.name)}</span>
            </button>
        `).join('') : '<p class="hint" style="grid-column:1/-1;text-align:center;padding:2rem;">No matching assets in library.</p>';
    }
}

export function insertAtCursor(input, text) {
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const val = input.value;
    input.value = val.substring(0, start) + text + val.substring(end);
    input.selectionStart = input.selectionEnd = start + text.length;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function renderSummary() {
    const b = document.querySelector('#editor .summary-text b');
    if (b && rule()) b.textContent = summary(rule());
    const ws = document.querySelector('#editor .when-sentence');
    if (ws && rule()) ws.textContent = summary(rule(), true);
    const rt = $('rule-title');
    if (rt && rule()) rt.textContent = rule().name;
}

export function renderEditor() {
    const r = rule();
    const editor = $('editor');
    if (!editor) return;

    if (!r) {
        editor.innerHTML = `
            <div class="card empty-state">
                ${ICONS.sliders}
                <span>Select an alert rule on the left, or click "New Rule" to create one.</span>
            </div>
        `;
        return;
    }
    const a = r.actions;
    const meta = TRIGGER_META[r.trigger] || { label: r.trigger, icon: ICONS.zap, color: '#3b82f6' };
    const hasMetric = HAS_METRIC.includes(r.trigger);
    const metricName = AMOUNT_LABEL[r.trigger] || (['sub', 'resub', 'milestone'].includes(r.trigger) ? 'Months' : 'Amount');

    let ladderHtml = '';
    if (hasMetric && r.variants.some(v => v.variantType === 'gated' || v.gateMin > 0)) {
        const milestoneVariants = r.variants
            .filter(v => (v.variantType === 'gated' || (v.gateMin > 0)))
            .sort((a, b) => (Number(a.gateMin) || 0) - (Number(b.gateMin) || 0));
        const baseVariants = r.variants.filter(v => v.variantType !== 'gated' && !v.gateMin && !v.gateMax);
        
        const groups = new Map();
        for (const v of milestoneVariants) {
            const min = Number(v.gateMin) || 0;
            if (!groups.has(min)) groups.set(min, []);
            groups.get(min).push(v);
        }

        ladderHtml = `
            <div class="tier-ladder-banner">
                <div class="tier-ladder-header">
                    <div class="tier-ladder-title">
                        ${ICONS.layers}
                        <span>Milestone ladder</span>
                    </div>
                    <div class="tier-ladder-hint">
                        StreamPulse checks highest milestone first. Highest matching tier wins; below all milestones, Base Alert plays.
                    </div>
                </div>
                <div class="tier-steps-row">
                    <div class="tier-step-chip base" data-jump-tier="base" title="Plays for any event below the lowest milestone">
                        <span class="tier-step-lbl">Base Alert</span>
                        <span class="tier-step-val">Any ${esc(metricName)}</span>
                        <span class="tier-step-count">${baseVariants.length} var</span>
                    </div>
                    ${Array.from(groups.entries()).map(([min, vars]) => `
                        <span class="tier-step-arrow">${ICONS.arrowRight}</span>
                        <div class="tier-step-chip threshold" data-jump-tier="${min}" title="Plays when ${esc(metricName)} is &ge; ${min}">
                            <span class="tier-step-lbl">Milestone</span>
                            <span class="tier-step-val">&ge; ${min} ${esc(metricName)}</span>
                            <span class="tier-step-count">${vars.length} var</span>
                        </div>
                    `).join('')}
                    ${!groups.size ? `
                        <span class="tier-step-arrow" style="font-size:0.72rem;color:var(--text-faint);">
                            (All variants currently act as Base Alert. Set any variant to "Milestone Tier" below to escalate!)
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    editor.innerHTML = `
        <div class="summary-banner">
            <div class="summary-left" style="flex-direction:column;align-items:flex-start;gap:0.2rem;">
                <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                    <div class="summary-icon" style="color:${meta.color};border-color:color-mix(in srgb, ${meta.color} 35%, var(--border));">${meta.icon}</div>
                    <b class="rule-title" id="rule-title">${esc(r.name)}</b>
                    <span class="badge accent">${meta.label}</span>
                </div>
                <div class="summary-text rule-sentence" hidden><b></b></div>
            </div>
            <div class="summary-actions">
                <label class="master-toggle rule-active" title="Enable or disable this specific rule">
                    <input type="checkbox" data-f="enabled" data-type="check" ${r.enabled ? 'checked' : ''}>
                    <span class="toggle-track"><span class="toggle-thumb"></span></span>
                    <span class="toggle-label">Active</span>
                </label>
                <span class="summary-sep" aria-hidden="true"></span>
                ${hasMetric ? `
                    <div class="al-s40">
                        <span class="sim-label">Simulate ${esc(metricName)}</span>
                        <input class="al-s41" type="number" min="0" data-test-amount value="${testAmount || ''}" placeholder="${r.conditions.minAmount || 100}">
                    </div>
                ` : ''}
                <button type="button" class="btn sm primary" data-test-rule title="Test this alert on overlays (Cmd/Ctrl+Enter)">${ICONS.play} Test Rule</button>
                <details class="more-menu" data-persist="alerts.moreOpen"${localStorage.getItem('alerts.moreOpen') === '1' ? ' open' : ''}>
                    <summary class="btn sm ghost">More ${ICONS.chevronDown}</summary>
                    <div class="more-pop">
                        <label class="al-s42 check-row" title="Action Only: runs the actions (webhook, timer, chat, Companion) with no on-screen alert, text, media, sound or page">
                            <input type="checkbox" data-f="webhookOnly" data-type="check" ${r.webhookOnly ? 'checked' : ''}>
                            <span style="font-size:0.75rem;font-weight:700;">Action only</span>
                        </label>
                        <button type="button" class="btn sm" id="dup-rule" title="Duplicate rule (Cmd/Ctrl+D)">${ICONS.copy} Duplicate</button>
                        <button type="button" class="btn sm danger" id="del-rule" title="Delete rule">${ICONS.trash} Delete</button>
                    </div>
                </details>
            </div>
        </div>

        <details class="card adv-card when-card" data-persist="alerts.whenOpen"${localStorage.getItem('alerts.whenOpen') !== '0' ? ' open' : ''}>
            <summary class="adv-toggle">
                <h2 class="al-s43">
                    <span class="al-s1">${ICONS.zap}<span>When</span></span>
                    <span class="when-sentence">${esc(summary(r, true))}</span>
                </h2>
                <span class="btn sm ghost">Edit ${ICONS.chevronDown}</span>
            </summary>
            <div class="cgrid">
                ${field('Rule Name', inp('name', r.name, 'text', 'maxlength="80" placeholder="e.g. Sub Tier 1"'))}
                ${field('Event Trigger', sel_('trigger', r.trigger, Object.entries(TRIGGERS)))}
                ${field('Priority', seg_('priority', r.priority || 'normal', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['critical', 'Critical']]), 'Higher priority alerts play first when several are waiting.')}
                ${r.priority === 'critical' ? `<label class="check-row"><input type="checkbox" data-f="interrupt" data-type="check" ${r.interrupt ? 'checked' : ''}><span>Interrupt the alert on screen</span></label>` : ''}
                ${r.webhookOnly || !lookByRule[r.id] ? '' : field('Look', `<span class="hint">${esc(lookByRule[r.id])} (set in the custom overlay editor)</span>`)}
                ${field('Expire after (seconds)', inp('expireSeconds', r.expireSeconds || 0, 'number', 'min="0" max="86400"'), 'Drop this alert if it waits in the queue longer than this (0 = never).')}
                ${field('Cooldown (seconds)', inp('conditions.cooldownSeconds', r.conditions.cooldownSeconds, 'number', 'min="0"'), 'Minimum seconds between triggers of this rule (0 = none).')}
                ${r.webhookOnly ? `
                    <div class="al-s44">
                        ${ICONS.info}
                        <span><b>Action only:</b> runs the actions below with no on-screen alert, sound or page.</span>
                    </div>
                ` : ''}
                ${conditionsHtml(r)}
            </div>
        </details>

        ${r.webhookOnly ? `<div class="card" id="display-card"><div class="al-s45">${ICONS.info}<span><b>Action only:</b> this rule shows no alert, text, media or sound. It only runs the actions below.</span></div></div>` : `<div class="card" id="display-card">
            ${ladderHtml}
            <div class="card-head-row">
                <h2>
                    <span class="al-s1">${ICONS.image}<span>Show</span></span>
                    <span class="badge">${r.variants.length} variant${r.variants.length === 1 ? '' : 's'}</span>
                </h2>
                <div class="al-s46">
                    <button type="button" class="btn sm" id="add-base-variant" title="Add a new variation to the Base Alert tier">${ICONS.plus} <span>Base Variant</span></button>
                    ${hasMetric ? `<button type="button" class="btn sm" id="add-milestone-variant" title="Add an escalating milestone tier">${ICONS.plus} <span>Milestone Tier</span></button>` : ''}
                </div>
            </div>
            <div class="vrow-slim">
                ${r.variants.length > 1 ? `<label class="vpick"><span>Pick</span>${seg_('pick', r.pick === 'sequential' ? 'sequential' : 'weighted', [['weighted', 'Weighted random'], ['sequential', 'In order']])}</label>` : ''}
            </div>
            ${(() => { const ws = ruleWarnings(r); const list = `<div class="warn-list">${ws.map(x => `<div class="warn-item ${x.level}"${x.vid ? ` data-jump-variant="${esc(x.vid)}"` : ''}>${x.level === 'warn' ? ICONS.warn : ICONS.info}<span>${esc(x.text)}</span></div>`).join('')}</div>`; return !ws.length ? '' : ws.length > 2 ? `<details class="v-adv" data-persist="alerts.warnOpen"${localStorage.getItem('alerts.warnOpen') === '1' ? ' open' : ''}><summary>${ws.length} warnings</summary>${list}</details>` : list; })()}
            ${r.variants.length ? '' : `<div class="empty-state" style="padding:1rem 0.5rem;"><span>No variants yet. Add one to choose what this rule shows.</span></div>`}
            ${(() => {
                const gm = new Map();
                r.variants.forEach((v, i) => { const k = isMilestoneV(v, r) ? String(Number(v.gateMin) || 0) : 'base'; if (!gm.has(k)) gm.set(k, []); gm.get(k).push(i); });
                const keys = [...gm.keys()].sort((x, y) => x === 'base' ? -1 : y === 'base' ? 1 : Number(x) - Number(y));
                return keys.map(k => {
                    const idxs = gm.get(k), ms = k !== 'base';
                    const first = r.variants[idxs[0]];
                    const label = !hasMetric ? 'Alert variants' : !ms ? 'Base alert' : `Milestone tier <small>${variantGateMode(first) === 'exact' ? '=' : '&gt;='} ${k} ${esc(metricName.toLowerCase())}</small>`;
                    return `<div class="tier-group${ms ? ' milestone' : ''}" data-tier="${k}">
                        <div class="tier-group-head">${ms ? ICONS.flag : ICONS.zap}<span>${label}</span><span class="count-pill">${idxs.length}</span>${idxs.length > 1 ? '<small>rolls by weight</small>' : ''}</div>
                        ${idxs.map(i => variantHtml(r.variants[i], i, r)).join('')}
                    </div>`;
                }).join('');
            })()}
        </div>`}

        <details class="card adv-card" id="adv-actions"${localStorage.getItem('alerts.advOpen') === '1' ? ' open' : ''}>
            <summary class="adv-toggle">
                <h2 class="al-s43">
                    <span class="al-s1">
                        ${ICONS.clock}
                        <span>Then</span>
                    </span>
                    <span class="badge${(a.timer.enabled || a.http.enabled) ? ' accent' : ''}">${(a.timer.enabled ? 1 : 0) + (a.http.enabled ? 1 : 0)} active</span>
                </h2>
                <span class="hint act-line" title="${esc(a.http.enabled ? a.http.url : '')}">${[a.http.enabled ? `Webhook ${a.http.method} ${a.http.url || '(no URL)'}` : '', a.timer.enabled ? 'Timer control' : ''].filter(Boolean).join(' · ') || 'No actions'}</span>
                <span class="adv-chev">${ICONS.chevronDown}</span>
            </summary>

            <div class="cgrid">
                <!-- Timer Action -->
                <div class="al-s47">
                    <label class="al-s48 check-row">
                        <input type="checkbox" data-f="actions.timer.enabled" data-type="check" ${a.timer.enabled ? 'checked' : ''}>
                        <span>Control a Timer</span>
                    </label>
                    ${a.timer.enabled ? `
                        ${field('Target Timer', sel_('actions.timer.timerId', a.timer.timerId, [['', 'Choose timer…'], ...timers.map(x => [x.id, x.label || x.id])]))}
                        ${field('Action', sel_('actions.timer.action', a.timer.action, [['start', 'Start'], ['pause', 'Pause'], ['resume', 'Resume'], ['reset', 'Reset'], ['add_time', 'Add Time'], ['subtract_time', 'Subtract Time']]))}
                        ${['add_time', 'subtract_time'].includes(a.timer.action) ? `
                            ${field('Seconds', inp('actions.timer.seconds', a.timer.seconds, 'number', 'min="0"'))}
                            <label class="check-row" style="margin-top:0.2rem;">
                                <input type="checkbox" data-f="actions.timer.perUnit" data-type="check" ${a.timer.perUnit ? 'checked' : ''}>
                                <span>Multiply by amount (e.g. 30s per 100 bits / viewer)</span>
                            </label>
                        ` : ''}
                    ` : '<span class="al-s49 hint">Start, pause, or adjust a timer when this alert fires.</span>'}
                </div>

                <div class="al-s47">
                    <label class="al-s48 check-row">
                        <input type="checkbox" data-f="actions.chat.enabled" data-type="check" ${a.chat.enabled ? 'checked' : ''}>
                        <span>Send Chat Message</span>
                    </label>
                    ${a.chat.enabled ? `
                        ${field('Message', inp('actions.chat.template', a.chat.template, 'text', 'maxlength="1000" placeholder="Thanks {{alert.user}}!"'), 'Supports {{alert.*}} placeholders. Sent via SocialStream, trimmed to 400 characters.')}
                        ${field('Chat cooldown (seconds)', inp('actions.chat.cooldownSeconds', a.chat.cooldownSeconds, 'number', 'min="0"'), 'Spam guard: minimum seconds between chat messages from this rule.')}
                    ` : ''}
                </div>

                <div class="al-s47">
                    <label class="al-s48 check-row">
                        <input type="checkbox" data-f="actions.companion.enabled" data-type="check" ${a.companion.enabled ? 'checked' : ''}>
                        <span>Press Companion Button</span>
                    </label>
                    ${a.companion.enabled ? `
                        ${field('Companion address', `<input type="text" id="s-companion-url" value="${esc(cfg.settings.companionUrl || 'http://127.0.0.1:8000')}" placeholder="http://127.0.0.1:8000">`, 'Global setting. Only this host is ever contacted.')}
                        <div class="vgrid c3">
                            ${field('Page', inp('actions.companion.page', a.companion.page, 'number', 'min="0"'))}
                            ${field('Row', inp('actions.companion.row', a.companion.row, 'number', 'min="0"'))}
                            ${field('Column', inp('actions.companion.column', a.companion.column, 'number', 'min="0"'))}
                        </div>
                        <div class="vgrid c3">
                            ${field('Or location', inp('actions.companion.location', a.companion.location, 'text', 'placeholder="1/0/2"'), 'Optional page/row/column; overrides the numbers.')}
                            ${field('Delay (seconds)', inp('actions.companion.delay', a.companion.delay, 'number', 'min="0" max="300" step="0.5"'))}
                            <div class="al-s50"><button type="button" class="btn sm" id="btn-test-companion">${ICONS.play} <span>Test Button</span></button><span id="companion-test-result" class="hint"></span></div>
                        </div>
                    ` : ''}
                </div>

                <!-- Webhook Action -->
                <div class="al-s47">
                    <label class="al-s48 check-row">
                        <input type="checkbox" data-f="actions.http.enabled" data-type="check" ${a.http.enabled ? 'checked' : ''}>
                        <span>Send Webhook (HTTP Request)</span>
                    </label>
                    ${a.http.enabled ? `
                        ${field('Endpoint URL', inp('actions.http.url', a.http.url, 'text', 'placeholder="http://192.168.1.4:8000/api/location/..."'), 'URL to trigger on alert. Supports Bitfocus Companion buttons, Discord webhooks, or automation.')}
                        <div class="vgrid c3" style="align-items:end;gap:0.65rem;">
                            ${field('HTTP Method', seg_('actions.http.method', a.http.method, [['POST', 'POST'], ['GET', 'GET']]))}
                            ${field('Delay (seconds)', inp('actions.http.delay', a.http.delay ?? 0, 'number', 'min="0" max="300" step="0.5" placeholder="0"'))}
                            <div class="al-s50">
                                <button type="button" class="btn sm" id="btn-test-webhook" style="white-space:nowrap;">
                                    ${ICONS.play} <span>Test Webhook</span>
                                </button>
                                <span id="webhook-test-result" style="font-size:0.73rem;"></span>
                            </div>
                        </div>
                        <span class="al-s49 hint">Set delay to 0 for immediate trigger, or wait N seconds after the alert fires. For <b>Bitfocus Companion</b> buttons (e.g. <code>/api/location/&lt;page&gt;/&lt;row&gt;/&lt;col&gt;/press</code>), set HTTP Method to <b>POST</b>.</span>
                    ` : '<span class="al-s49 hint">Trigger external automation, Discord bot, Bitfocus Companion, or smart home light on alert.</span>'}
                </div>
            </div>
        </details>
    `;
    mountPreview();
}

export function setupEditorEvents(renderAll) {
    const editor = $('editor');
    if (!editor) return;

    editor.addEventListener('toggle', event => {
        const d = event.target;
        if (!d.dataset?.vid) return;
        if (d.open) {
            openVariants.add(d.dataset.vid);
            editor.querySelectorAll('.variant[open]').forEach(o => { if (o !== d) o.open = false; });
            mountPreview();
        } else {
            openVariants.delete(d.dataset.vid);
        }
    }, true);

    editor.addEventListener('focusin', event => {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            setLastFocusedInput(event.target);
        }
    });

    editor.addEventListener('input', event => {
        const el = event.target, r = rule();
        if (!r) return;
        if (el.dataset.f) {
            const type = el.dataset.type;
            let value = el.value;
            if (type === 'check') value = el.checked;
            else if (type === 'number') value = Number(value) || 0;
            else if (type === 'list') value = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            else if (type === 'numlist') value = value.split(',').map(s => Number(s.trim())).filter(n => n > 0);
            setPath(r, el.dataset.f, value);
            setDirty(true);
            if (el.dataset.f === 'name' || el.dataset.f === 'enabled') renderRules();
            renderSummary();
        } else if (el.dataset.lad) {
            const [i, j, key] = el.dataset.lad.split('.');
            r.variants[i].emojiLadder[j][key] = key === 'min' ? Number(el.value) || 0 : el.value;
            setDirty(true);
        } else if (el.dataset.testAmount !== undefined) {
            setTestAmount(Number(el.value) || 0);
            if (r.trigger === 'bits') renderEditor();
        } else if (el.dataset.v) {
            const [i, key] = el.dataset.v.split('.');
            r.variants[i][key] = el.type === 'number' || el.type === 'range' ? Number(el.value) || 0 : (el.type === 'checkbox' ? el.checked : el.value);
            if (key === 'volume') {
                const badge = $(`vol-badge-${i}`);
                if (badge) badge.textContent = `${r.variants[i][key]}%`;
            } else if (key === 'videoVolume') {
                const badge = $(`vidvol-badge-${i}`);
                if (badge) badge.textContent = `${r.variants[i][key]}%`;
            } else if (key === 'title') {
                const titleEl = document.querySelector(`.variant[data-vid="${r.variants[i].id}"] .vsum-title`);
                if (titleEl) titleEl.textContent = el.value || '(No title template set)';
            } else if (key === 'message') {
                const subEl = document.querySelector(`.variant[data-vid="${r.variants[i].id}"] .vsum-subtitle`);
                if (subEl) subEl.textContent = el.value;
            }
            setDirty(true);
            schedulePreview();
        }
    });

    editor.addEventListener('change', event => {
        const el = event.target, r = rule();
        if (!r) return;
        if (el.dataset.f) {
            const type = el.dataset.type;
            let value = el.value;
            if (type === 'check') value = el.checked;
            else if (type === 'number') value = Number(value) || 0;
            else if (type === 'list') value = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            else if (type === 'numlist') value = value.split(',').map(s => Number(s.trim())).filter(n => n > 0);
            setPath(r, el.dataset.f, value);
            setDirty(true);
            if (el.dataset.f === 'webhookOnly') {
                renderRules();
                renderEditor();
                return;
            }
        }
        if (el.dataset.rewardCheck !== undefined || el.dataset.rewardAll !== undefined) {
            const ids = new Set(r.conditions.rewardIds || []);
            if (el.dataset.rewardAll !== undefined) ids.clear();
            else if (el.checked) ids.add(el.dataset.rewardCheck);
            else ids.delete(el.dataset.rewardCheck);
            r.conditions.rewardIds = Array.from(ids);
            setDirty(true);
            renderSummary();
            renderRules();
            renderEditor();
            return;
        }
        if (el.dataset.tierCheck) {
            const tiers = new Set(Array.isArray(r.conditions.tiers) ? r.conditions.tiers : (r.conditions.tier ? [r.conditions.tier] : []));
            if (el.checked) tiers.add(el.dataset.tierCheck);
            else tiers.delete(el.dataset.tierCheck);
            r.conditions.tiers = Array.from(tiers);
            r.conditions.tier = r.conditions.tiers.length === 1 ? r.conditions.tiers[0] : '';
            setDirty(true);
            renderSummary();
            renderRules();
        } else if (el.dataset.f === 'trigger') {
            r.trigger = el.value;
            if (!AMOUNT_LABEL[r.trigger] || r.trigger === 'sub') { r.conditions.minAmount = r.conditions.maxAmount = r.conditions.exactAmount = 0; r.conditions.amountMode = 'min'; }
            if (r.trigger !== 'donation') r.conditions.source = 'any';
            import('./alerts-state.js').then(({ DEFAULT_TITLE }) => {
                const prev = Object.values(DEFAULT_TITLE);
                r.variants.forEach(v => { if (!v.title || prev.includes(v.title)) v.title = DEFAULT_TITLE[r.trigger] || ''; });
            });
            if (r.name === 'New alert' || Object.values(TRIGGERS).includes(r.name)) r.name = TRIGGERS[r.trigger];
            if (r.trigger === 'chat_word') {
                r.conditions.cooldownSeconds = r.conditions.cooldownSeconds || 30;
            } else if (r.trigger === 'chat_command') {
                r.conditions.cooldownSeconds = r.conditions.cooldownSeconds || 30;
                r.conditions.command = r.conditions.command || 'hype';
                r.conditions.permission = r.conditions.permission || 'everyone';
            }
            if (renderAll) renderAll();
        } else if (el.dataset.f === 'conditions.amountMode') {
            const c = r.conditions;
            if (el.value === 'exact') c.exactAmount = c.exactAmount || c.minAmount || 0;
            else if (c.exactAmount && !c.minAmount) c.minAmount = c.exactAmount;
            if (el.value !== 'range') c.maxAmount = 0;
            renderEditor();
            renderRules();
        } else if (el.dataset.f === 'pick' || ['priority', 'actions.chat.enabled', 'actions.companion.enabled', 'actions.timer.enabled', 'actions.http.enabled', 'actions.timer.action', 'webhookOnly'].includes(el.dataset.f)) {
            renderEditor();
        } else if (el.dataset.soundPreset !== undefined) {
            const idx = el.dataset.soundPreset;
            r.variants[idx].sound = el.value;
            setDirty(true);
            renderEditor();
            if (el.value && window.OverlayShared) window.OverlayShared.playSoundValue(el.value, (r.variants[idx].volume ?? 70) / 100);
        } else if (el.dataset.variantCond !== undefined) {
            const idx = Number(el.dataset.variantCond);
            if (r && r.variants[idx]) {
                if (el.value === 'threshold') {
                    r.variants[idx].variantType = 'gated';
                    if (!r.variants[idx].gateMin) {
                        r.variants[idx].gateMin = r.conditions.minAmount || (['sub', 'resub', 'milestone'].includes(r.trigger) ? 12 : 100);
                    }
                } else {
                    r.variants[idx].variantType = 'weighted';
                    r.variants[idx].gateMin = 0;
                    r.variants[idx].gateMax = 0;
                }
                setDirty(true);
                renderEditor();
            }
        } else if (el.dataset.lad && el.dataset.lad.endsWith('.min')) {
            const [i] = el.dataset.lad.split('.');
            r.variants[i].emojiLadder.sort((a, b) => a.min - b.min);
            renderEditor();
        } else if (el.dataset.pick) {
            const [i, key] = el.dataset.pick.split('.');
            if (el.value) { r.variants[i][key] = el.value; setDirty(true); renderEditor(); }
        } else if (el.dataset.v) {
            const [i, key] = el.dataset.v.split('.');
            if (el.type === 'checkbox') r.variants[i][key] = el.checked;
            else r.variants[i][key] = el.value;
            setDirty(true);
            if (key === 'gateMode') {
                if (el.value === 'min') r.variants[i].gateMax = 0;
                if (el.value === 'exact') r.variants[i].gateMax = r.variants[i].gateMin;
            }
            if (key === 'videoSound' || key === 'gateMode' || key === 'gateMin' || key === 'gateMax' || key === 'gateMinOp' || key === 'gateMaxOp' || key === 'weight' || key === 'emoteEffect' || key === 'cheermoteFamily' || key === 'emoteSource') renderEditor();
            else schedulePreview();
        }
    });

    editor.addEventListener('click', guard(async event => {
        const r = rule();
        if (!r) return;

        // Role Card Selection (Base Alert vs Milestone Tier)
        const roleCard = event.target.closest('[data-role-card]');
        if (roleCard) {
            const vi = Number(roleCard.dataset.vi);
            const role = roleCard.dataset.roleCard;
            if (r.variants[vi]) {
                if (role === 'milestone') {
                    r.variants[vi].variantType = 'gated';
                    if (!r.variants[vi].gateMin) {
                        r.variants[vi].gateMin = r.conditions.minAmount || (['sub', 'resub', 'milestone'].includes(r.trigger) ? 12 : 100);
                    }
                } else {
                    r.variants[vi].variantType = 'weighted';
                    r.variants[vi].gateMin = 0;
                    r.variants[vi].gateMax = 0;
                }
                setDirty(true);
                renderEditor();
            }
            return;
        }

        const sb = event.target.closest('[data-seg]');
        if (sb) {
            const sl = sb.parentElement.querySelector('select');
            sb.parentElement.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === sb));
            sl.value = sb.dataset.seg;
            sl.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
        const jt = event.target.closest('[data-jump-tier]'), jv = event.target.closest('[data-jump-variant]');
        if (jt) {
            const g = editor.querySelector(`.tier-group[data-tier="${CSS.escape(jt.dataset.jumpTier)}"]`);
            if (g) { g.scrollIntoView({ behavior: 'smooth', block: 'center' }); g.classList.add('flash'); setTimeout(() => g.classList.remove('flash'), 1400); }
            return;
        }
        if (jv) { openVariants.add(jv.dataset.jumpVariant); renderEditor(); editor.querySelector('.variant[open]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        const btn = event.target.closest('button');
        if (!btn) return;

        if (btn.dataset.phOpen) {
            const input = document.querySelector(`input[data-v="${btn.dataset.phOpen}"]`);
            const toks = TOKENS[rule().trigger] || [];
            if (window.PlaceholderPicker) {
                window.PlaceholderPicker.open({
                    getStatus: () => liveStatus,
                    extraGroups: toks.length ? [{ label: 'This alert', items: toks.map(t => [`alert.${t}`, t.replace(/_/g, ' ')]) }] : [],
                    extraValues: Object.fromEntries(toks.map(t => [`alert.${t}`, SAMPLE_TOKENS[t]])),
                    onWarn: m => toast(m, true),
                    onPick: token => {
                        if (input && document.contains(input)) window.PlaceholderPicker.insertInto(input, token);
                        else { navigator.clipboard?.writeText(`{{${token}}}`); toast('Copied placeholder'); }
                    }
                });
            }
            return;
        }
        if (btn.dataset.insertToken) {
            const token = btn.dataset.insertToken;
            const targetKey = btn.dataset.tokenTarget;
            const input = targetKey ? document.querySelector(`input[data-v="${targetKey}"]`) : null;
            if (input) {
                insertAtCursor(input, token);
                btn.closest('details')?.removeAttribute('open');
                toast(`Inserted ${token}`);
            } else {
                navigator.clipboard?.writeText(token);
                toast(`Copied ${token}`);
            }
            return;
        }
        if (btn.dataset.insert) {
            const token = btn.dataset.insert;
            const targetInput = lastFocusedInput && document.contains(lastFocusedInput)
                ? lastFocusedInput
                : document.querySelector('input[data-v$=".title"]') || document.querySelector('input[data-v$=".message"]');
            if (targetInput) {
                insertAtCursor(targetInput, token);
                toast(`Inserted ${token}`);
            } else {
                navigator.clipboard?.writeText(token);
                toast(`Copied ${token} to clipboard`);
            }
            return;
        }

        if (btn.dataset.replay !== undefined) { mountPreview(false, true); return; }
        if (btn.dataset.playSound !== undefined) { playVariantSound(r.variants[btn.dataset.playSound]); return; }
        if (btn.dataset.clearMedia) {
            const [i, key] = btn.dataset.clearMedia.split('.');
            r.variants[i][key] = '';
            setDirty(true);
            renderEditor();
            return;
        }

        if (btn.dataset.library) {
            libTarget = btn.dataset.library;
            libKinds = btn.dataset.kinds.split(',');
            const libQ = $('lib-q');
            if (libQ) libQ.value = '';
            renderLib();
            $('lib')?.showModal();
            libQ?.focus();
            return;
        }
        if (btn.dataset.test !== undefined || btn.dataset.delVariant !== undefined || btn.dataset.dupVariant !== undefined) event.preventDefault();
        if (btn.dataset.setVariantType) {
            const vi = Number(btn.dataset.vi);
            if (r && r.variants[vi]) {
                r.variants[vi].variantType = btn.dataset.setVariantType;
                setDirty(true);
                renderEditor();
            }
            return;
        }
        if (btn.dataset.selectChannelEmote) {
            const vi = Number(btn.dataset.vi);
            if (r && r.variants[vi]) {
                r.variants[vi].emoji = btn.dataset.selectChannelEmote;
                r.variants[vi].emojiUrl = btn.dataset.emoteUrl || '';
                setDirty(true);
                renderEditor();
            }
            return;
        }
        if (btn.dataset.populateCheermotes !== undefined) {
            const vi = Number(btn.dataset.populateCheermotes);
            if (r && r.variants[vi]) {
                const famKey = (r.variants[vi].cheermoteFamily && r.variants[vi].cheermoteFamily !== 'auto') ? r.variants[vi].cheermoteFamily.toLowerCase() : 'cheer';
                const fam = cheermoteFamilies[famKey] || customCheermotes.find(c => c.prefix.toLowerCase() === famKey) || cheermoteFamilies.cheer;
                const cheermotesList = fam?.tiers || (twitchCheermotes.length ? twitchCheermotes : DEFAULT_CHEERMOTES);
                r.variants[vi].emojiLadder = cheermotesList.map(c => ({
                    min: c.min,
                    emoji: c.name,
                    emojiUrl: c.url
                })).sort((a, b) => a.min - b.min);
                r.variants[vi].emoji = cheermotesList[0]?.name || 'Cheer1';
                r.variants[vi].emojiUrl = cheermotesList[0]?.url || '';
                setDirty(true);
                renderEditor();
                toast(`Populated ${fam?.name || fam?.prefix || 'Twitch Cheermotes'} ladder (${cheermotesList.length} tiers)`);
            }
            return;
        }
        if (btn.dataset.clearEmoteUrl !== undefined) {
            const vi = Number(btn.dataset.clearEmoteUrl);
            if (r && r.variants[vi]) {
                r.variants[vi].emojiUrl = '';
                setDirty(true);
                renderEditor();
            }
            return;
        }
        if (btn.dataset.vmedia) { variantMedia.set(btn.dataset.vidTab, btn.dataset.vmedia); openVariants.add(btn.dataset.vidTab); renderEditor(); return; }
        if (btn.dataset.vtab) { variantTab.set(btn.dataset.vidTab, btn.dataset.vtab); openVariants.add(btn.dataset.vidTab); renderEditor(); return; }
        if (btn.dataset.dupVariant !== undefined) {
            const idx = Number(btn.dataset.dupVariant);
            const nv = { ...JSON.parse(JSON.stringify(r.variants[idx])), id: newVariant(r.trigger).id };
            r.variants.splice(idx + 1, 0, nv);
            openVariants.add(nv.id);
            setDirty(true);
            renderEditor();
            toast(`Duplicated Variant ${idx + 1}`);
            return;
        }
        if (btn.id === 'add-base-variant' || btn.id === 'add-variant') {
            const nv = newVariant(r.trigger, 'weighted', 0);
            r.variants.push(nv);
            openVariants.add(nv.id);
            setDirty(true);
            renderEditor();
            return;
        }
        if (btn.id === 'add-milestone-variant') {
            const maxThreshold = r.variants.reduce((max, v) => Math.max(max, Number(v.gateMin) || 0), 0);
            const step = ['sub', 'resub', 'milestone'].includes(r.trigger) ? 12 : (maxThreshold >= 1000 ? 500 : (maxThreshold >= 100 ? 100 : 50));
            const nextMin = maxThreshold > 0 ? maxThreshold + step : (r.conditions.minAmount || step);
            const nv = newVariant(r.trigger, 'milestone', nextMin);
            r.variants.push(nv);
            openVariants.add(nv.id);
            setDirty(true);
            renderEditor();
            return;
        }
        else if (btn.dataset.addStep !== undefined) {
            const v = r.variants[btn.dataset.addStep], last = v.emojiLadder[v.emojiLadder.length - 1];
            v.emojiLadder.push({ min: last ? last.min * 10 || 100 : 100, emoji: '', emojiUrl: '' });
            setDirty(true);
            renderEditor();
        } else if (btn.dataset.delStep !== undefined) {
            const [i, j] = btn.dataset.delStep.split('.');
            r.variants[i].emojiLadder.splice(Number(j), 1);
            setDirty(true);
            renderEditor();
        } else if (btn.dataset.soundPreview !== undefined) {
            const v = r.variants[btn.dataset.soundPreview];
            if (v.sound && window.OverlayShared) window.OverlayShared.playSoundValue(v.sound, (v.volume ?? 70) / 100);
        } else if (btn.dataset.delVariant !== undefined) {
            r.variants.splice(Number(btn.dataset.delVariant), 1);
            setDirty(true);
            renderEditor();
        } else if (btn.id === 'del-rule') {
            if (window.StreamPulse && !await window.StreamPulse.confirm('Delete Rule', `Delete "${r.name}"?`, { danger: true, confirmText: 'Delete' })) return;
            cfg.rules = cfg.rules.filter(x => x !== r);
            setSel(cfg.rules[0]?.id || null);
            setDirty(true);
            if (renderAll) renderAll();
        } else if (btn.id === 'dup-rule') {
            const copy = JSON.parse(JSON.stringify(r));
            copy.id = `rule-${Date.now().toString(36)}`;
            copy.name = `${r.name} copy`;
            cfg.rules.push(copy);
            setSel(copy.id);
            setDirty(true);
            if (renderAll) renderAll();
        } else if (btn.id === 'btn-test-companion') {
            const out = $('companion-test-result');
            if (out) out.textContent = 'Testing...';
            const c = r.actions.companion;
            try {
                await api('/api/alerts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }).catch(() => {});
                const res = await api('/api/alerts/test-companion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
                if (out) out.textContent = res.ok ? `Pressed (${res.status})` : `Failed: ${res.error || res.status}`;
            } catch (err) { if (out) out.textContent = `Failed: ${err.message}`; }
        } else if (btn.id === 'btn-test-webhook') {
            const statusEl = $('webhook-test-result');
            const urlInput = document.querySelector('input[data-f="actions.http.url"]');
            const methodSelect = document.querySelector('select[data-f="actions.http.method"]');
            const targetUrl = (urlInput ? urlInput.value : (r?.actions?.http?.url || '')).trim();
            const method = (methodSelect ? methodSelect.value : (r?.actions?.http?.method || 'POST'));
            if (!targetUrl) {
                if (statusEl) statusEl.innerHTML = `<span class="pill dirty" style="font-size:0.7rem;padding:2px 8px;">Enter a URL first</span>`;
                return;
            }
            if (statusEl) statusEl.innerHTML = `<span style="font-size:0.7rem;color:var(--text-muted);font-weight:600;">Testing...</span>`;
            try {
                const res = await api('/api/alerts/test-webhook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: targetUrl, method, ruleId: r?.id, trigger: r?.trigger })
                });
                if (res.ok) {
                    if (statusEl) statusEl.innerHTML = `<span class="al-s53 pill ok">${ICONS.check} ${res.status} OK</span>`;
                    toast('Webhook trigger succeeded');
                } else {
                    const errMsg = res.note ? `${res.status} ${res.statusText}: ${res.note}` : (res.error || `${res.status} ${res.statusText}`);
                    if (statusEl) statusEl.innerHTML = `<span class="al-s53 pill dirty" title="${esc(errMsg)}">${ICONS.close} ${res.status || 'Error'}</span>`;
                    toast(`Webhook failed: ${errMsg}`, true);
                }
            } catch (err) {
                if (statusEl) statusEl.innerHTML = `<span class="al-s53 pill dirty">${ICONS.close} Error</span>`;
                toast(`Webhook error: ${err.message}`, true);
            }
            return;
        } else if (btn.dataset.testRule !== undefined) {
            await save(renderAll);
            const res = await api('/api/alerts/test', {
                method: 'POST',
                body: JSON.stringify({
                    ruleId: sel,
                    ...await testRewardOverrides(r),
                    ...(testAmount ? { amount: testAmount, months: testAmount, count: testAmount, viewers: testAmount } : {})
                })
            });
            if (r.webhookOnly) {
                toast(`Ran actions for "${r.name}" (action only)`);
            } else {
                const vIdx = res.alert?.variantId ? r.variants.findIndex(x => x.id === res.alert.variantId) : -1;
                const label = vIdx >= 0 ? `Variant ${vIdx + 1}` : 'alert';
                toast(`Test alert queued: rolled ${label}`);
            }
            import('./alerts-panels.js').then(({ refreshQueue }) => refreshQueue());
        } else if (btn.dataset.testVariant !== undefined || btn.dataset.test !== undefined) {
            await save(renderAll);
            const variantIdx = Number(btn.dataset.testVariant ?? btn.dataset.test);
            const targetVariant = r.variants[variantIdx] || r.variants[0];
            await api('/api/alerts/test', {
                method: 'POST',
                body: JSON.stringify({
                    ruleId: sel,
                    variantId: targetVariant.id,
                    ...await testRewardOverrides(r),
                    ...(testAmount ? { amount: testAmount, months: testAmount, count: testAmount, viewers: testAmount } : {})
                })
            });
            toast(`Previewing Variant ${variantIdx + 1}`);
            import('./alerts-panels.js').then(({ refreshQueue }) => refreshQueue());
        } else if (btn.dataset.upload) {
            const [i, key] = btn.dataset.upload.split('.');
            const picker = document.createElement('input');
            picker.type = 'file';
            picker.accept = btn.dataset.accept;
            picker.onchange = guard(async () => {
                const file = picker.files[0];
                if (!file) return;
                if (file.size > 100 * 1024 * 1024) throw new Error('File exceeds the 100 MB limit.');
                const ext = (file.name.split('.').pop() || '').toLowerCase();
                const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: key === 'sound' ? 'audio/ogg' : 'video/ogg' };
                const type = types[ext] || file.type;
                const data = await api('/api/custom-overlays/assets', { method: 'POST', headers: { 'Content-Type': type, 'X-Asset-Name': file.name.replace(/[^\x20-\x7e]+/g, '-') }, body: file });
                r.variants[i][key] = data.url;
                setDirty(true);
                await loadAssets();
                renderEditor();
                toast('File uploaded to library');
            });
            picker.click();
        }
    }));

    // Asset library dialog events
    $('lib-q')?.addEventListener('input', renderLib);
    $('lib-close')?.addEventListener('click', () => $('lib')?.close());
    $('lib')?.addEventListener('close', () => {
        cleanupLibMedia();
        const grid = $('lib-grid');
        if (grid) grid.innerHTML = '';
    });
    $('lib-grid')?.addEventListener('click', event => {
        const item = event.target.closest('.lib-item'), r = rule();
        if (!item || !r || !libTarget) return;
        const [i, key] = libTarget.split('.');
        r.variants[i][key] = item.dataset.url;
        setDirty(true);
        $('lib')?.close();
        renderEditor();
    });

    // Sound dialog events
    document.addEventListener('click', e => {
        const t = e.target;
        if (t.id === 'snd-dlg') return sndClose();
        const g = t.closest('[data-snd-group]');
        if (g) {
            snd.group = g.dataset.sndGroup;
            snd.q = '';
            const sq = $('snd-q');
            if (sq) sq.value = '';
            localStorage.setItem('alerts.sndGroup', snd.group);
            return sndRender();
        }
        const tg = t.closest('[data-snd-toggle]');
        if (tg) {
            const val = tg.dataset.sndToggle;
            if (snd.playing === val) sndStop();
            else sndPlay(val, (rule().variants[snd.idx].volume ?? 70) / 100);
            return sndRender();
        }
        const pk = t.closest('[data-snd-pick]');
        if (pk) {
            snd.pending = pk.dataset.sndPick;
            return sndRender();
        }
        if (t.closest('#snd-none')) { snd.pending = ''; return sndRender(); }
        if (t.closest('#snd-done')) return sndCommit();
        if (t.closest('#snd-cancel')) return sndClose();
        const br = t.closest('[data-snd-browse]');
        if (br) return sndOpen(br.dataset.sndBrowse);
        const pl = t.closest('[data-snd-play]');
        if (pl) {
            const v = rule().variants[pl.dataset.sndPlay];
            if (v.sound && window.OverlayShared) window.OverlayShared.playSoundValue(v.sound, (v.volume ?? 70) / 100);
            return;
        }
        const rm = t.closest('[data-snd-remove]');
        if (rm) {
            rule().variants[rm.dataset.sndRemove].sound = '';
            setDirty(true);
            renderEditor();
        }
    });

    document.addEventListener('input', e => {
        if (e.target.id === 'snd-q') {
            snd.q = e.target.value;
            sndRender();
        }
    });

    document.addEventListener('keydown', e => {
        const d = $('snd-dlg');
        if (!d || !d.open) return;
        if (e.key === 'Tab') {
            const f = [...d.querySelectorAll('button, input, [tabindex="0"]')].filter(x => !x.disabled && x.offsetParent !== null);
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-snd-pick]')) {
            e.preventDefault();
            snd.pending = e.target.dataset.sndPick;
            sndRender();
            d.querySelector(`[data-snd-pick="${CSS.escape(snd.pending)}"]`)?.focus();
        }
    });

    $('snd-dlg')?.addEventListener('close', () => { sndStop(); snd.opener && snd.opener.isConnected && snd.opener.focus(); });
    $('snd-dlg')?.addEventListener('cancel', () => sndStop());

    // Focus point drag picker
    (function () {
        let drag = null;
        const set = e => {
            const box = drag, rc = box.getBoundingClientRect();
            const x = Math.round(Math.min(1, Math.max(0, (e.clientX - rc.left) / rc.width)) * 100);
            const y = Math.round(Math.min(1, Math.max(0, (e.clientY - rc.top) / rc.height)) * 100);
            const v = rule().variants[Number(box.dataset.focus)];
            v.focusX = x; v.focusY = y;
            const dot = box.querySelector('.focus-dot');
            if (dot) { dot.style.left = x + '%'; dot.style.top = y + '%'; }
            setDirty(true);
        };
        document.addEventListener('pointerdown', e => {
            const b = e.target.closest('[data-focus]');
            if (!b) return;
            drag = b;
            b.setPointerCapture?.(e.pointerId);
            set(e);
        });
        document.addEventListener('pointermove', e => { if (drag) set(e); });
        document.addEventListener('pointerup', () => { if (drag) { drag = null; renderEditor(); } });
        document.addEventListener('click', e => {
            const b = e.target.closest('[data-focus-reset]');
            if (!b) return;
            const v = rule().variants[Number(b.dataset.focusReset)];
            v.focusX = 50; v.focusY = 50;
            setDirty(true);
            renderEditor();
        });
    })();
}
