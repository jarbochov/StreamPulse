// Interval that pauses while the tab is hidden and refreshes once when it returns. Returns a normal interval id.
window.pollVisible = (fn, ms) => {
    const id = setInterval(() => { if (!document.hidden) fn(); }, ms);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) fn(); });
    return id;
};
