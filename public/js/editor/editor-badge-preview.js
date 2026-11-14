const shared = window.OverlayShared;

export function disposeBadgePreview(host) {
    host?._badgePreviewObserver?.disconnect();
    if (host?._badgePreviewFrame) cancelAnimationFrame(host._badgePreviewFrame);
    if (host) {
        host._badgePreviewObserver = null;
        host._badgePreviewFrame = 0;
        shared.cleanupNode?.(host);
    }
}

export function renderBadgePreview(host, element, status, wholeStrip = false, memberId = '') {
    const stage = host.closest('.ig-preview-stage');
    if (!stage) return;
    let viewport = host.parentElement;
    if (!viewport.classList.contains('ig-badge-preview-viewport')) {
        viewport = document.createElement('div');
        viewport.className = 'ig-badge-preview-viewport';
        host.before(viewport);
        viewport.appendChild(host);
    }
    const dialog = stage.closest('dialog');
    if (dialog && !host._badgePreviewCloseBound) {
        host._badgePreviewCloseBound = true;
        dialog.addEventListener('close', () => { if (!dialog.open) disposeBadgePreview(host); });
    }
    disposeBadgePreview(host);
    host.style.width = `${element.width}px`;
    host.style.height = `${element.height}px`;
    shared.renderImageGroupStrip(host, element, status);
    const card = memberId
        ? [...host.querySelectorAll('.sp-image-group-item')].find(node => node.dataset.groupEntryId === memberId)
        : host.querySelector('.sp-image-group-item');
    if (!wholeStrip) host.querySelectorAll('.sp-image-group-item').forEach(node => { if (node !== card) node.style.visibility = 'hidden'; });
    viewport.querySelector('.ig-preview-empty')?.remove();
    host.style.visibility = '';
    if (!wholeStrip && memberId && !card) {
        host.style.visibility = 'hidden';
        viewport.style.width = 'auto';
        viewport.style.height = 'auto';
        const message = document.createElement('span');
        message.className = 'ig-preview-empty hint';
        message.textContent = 'This member is not shown with the current filters, image fallback or item cap.';
        viewport.appendChild(message);
        return;
    }
    const fit = () => {
        if (!stage.clientWidth || !stage.clientHeight) return;
        host.style.transform = '';
        host.style.left = '0px';
        host.style.top = '0px';
        const hostRect = host.getBoundingClientRect();
        const rect = wholeStrip || !card ? hostRect : card.getBoundingClientRect();
        const padding = Math.max(12, Number(element.imageGroup?.cardShadow) || 0, Number(element.imageGroup?.avatarShadow) || 0);
        const width = rect.width + padding * 2;
        const height = rect.height + padding * 2;
        const scale = Math.min(1, (stage.clientWidth - 32) / Math.max(1, width), (stage.clientHeight - 32) / Math.max(1, height));
        viewport.style.width = `${width * scale}px`;
        viewport.style.height = `${height * scale}px`;
        host.style.left = `${(padding - (rect.left - hostRect.left)) * scale}px`;
        host.style.top = `${(padding - (rect.top - hostRect.top)) * scale}px`;
        host.style.transform = `scale(${scale})`;
    };
    const schedule = () => {
        if (host._badgePreviewFrame) return;
        host._badgePreviewFrame = requestAnimationFrame(() => {
            host._badgePreviewFrame = 0;
            fit();
        });
    };
    host._badgePreviewObserver = new ResizeObserver(schedule);
    host._badgePreviewObserver.observe(stage);
    if (card) host._badgePreviewObserver.observe(card);
    schedule();
}
