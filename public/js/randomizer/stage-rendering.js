export function createStageRenderer({ $, getDeckLogo, getDeckWatermark, isSpinning }) {
    function getDeckPatternHtml() {
        if (getDeckLogo()) {
            return `<img src="${getDeckLogo().replace(/"/g, '&quot;')}" class="deck-card-custom-logo" alt="Card Logo" onerror="this.style.display='none';">`;
        }
        return `
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--stage-indicator)" stroke-width="1.8">
                <polygon points="12 2 20 12 12 22 4 12" fill="color-mix(in srgb, var(--stage-accent) 25%, transparent)"></polygon>
                <polyline points="7 12 10 12 12 8 14 16 16 12 18 12" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
            </svg>
        `;
    }

    function getDeckWatermarkHtml() {
        const text = (getDeckWatermark() || '').trim();
        if (!text) return '';
        return `<div class="deck-card-watermark">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</div>`;
    }

    function updateDeckVisuals() {
        const patternHtml = getDeckPatternHtml();
        document.querySelectorAll('#deck-view .deck-card-pattern').forEach(el => {
            el.innerHTML = patternHtml;
        });
        const text = (getDeckWatermark() || '').trim();
        document.querySelectorAll('#deck-view .deck-card-watermark').forEach(wm => {
            if (text === '') {
                wm.style.display = 'none';
            } else {
                wm.style.display = 'block';
                wm.textContent = text;
            }
        });
    }

    function renderIdleDeck(list) {
        const stack = $('deck-stack');
        const activeCard = $('deck-active-card');
        const badge = $('deck-count-badge');
        const cutPacket = $('deck-cut-packet');
        const splitLeft = $('deck-split-left');
        const splitRight = $('deck-split-right');
        const tray = $('deck-shuffle-tray');
        if (badge) badge.textContent = `${list.length} CARDS`;
        if (stack) {
            stack.classList.remove('dealing', 'squaring');
            stack.style.display = 'flex';
            stack.style.transform = '';
        }
        if (cutPacket) cutPacket.classList.remove('cutting');
        if (splitLeft) {
            splitLeft.classList.remove('retracting');
            splitLeft.style.display = 'none';
        }
        if (splitRight) {
            splitRight.classList.remove('retracting');
            splitRight.style.display = 'none';
        }
        if (tray) tray.innerHTML = '';
        if (activeCard && !isSpinning()) {
            activeCard.style.display = 'none';
            activeCard.classList.remove('is-flipped', 'tricky-suspense', 'hovering');
            activeCard.style.transform = '';
        }
        updateDeckVisuals();
    }

    function renderIdleRoller(centerIdx, list) {
        const track = $('roller-track');
        if (!track) return;
        track.innerHTML = '';
        const n = list.length || 1;
        for (let offset = -4; offset <= 4; offset++) {
            const pos = (centerIdx + offset + n * 1000) % n;
            const div = document.createElement('div');
            div.className = 'roller-item';
            if (offset === 0) div.className = 'roller-item active-winner';
            else if (Math.abs(offset) === 1) div.className = 'roller-item secondary';
            else div.className = 'roller-item tertiary';
            div.textContent = list[pos] || '(empty)';
            track.appendChild(div);
        }
        const boxHeight = $('roller-view')?.clientHeight || 240;
        const centerOffset = (boxHeight - 56) / 2;
        track.style.transform = `translateY(${centerOffset - 4 * 56}px)`;
    }

    return { getDeckPatternHtml, getDeckWatermarkHtml, updateDeckVisuals, renderIdleDeck, renderIdleRoller };
}
