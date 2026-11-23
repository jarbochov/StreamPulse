const root = window;

function isOverlayHidden() {
    if (root?.StreamPulseIdle?.isHidden) return Boolean(root.StreamPulseIdle.isHidden());
    return typeof document !== 'undefined' && Boolean(document.hidden);
}

export { isOverlayHidden, root };
