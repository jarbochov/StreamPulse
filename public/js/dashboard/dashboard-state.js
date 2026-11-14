/**
 * Shared DOM helpers and formatting utilities for the StreamPulse Dashboard.
 */

export const $ = id => document.getElementById(id);

const lastText = new Map();
const lastHtml = new Map();

export const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

/** Update textContent only when the string value changes. */
export function setText(id, value) {
    const el = $(id);
    if (!el) return;
    const text = String(value);
    if (lastText.get(id) === text) return;
    lastText.set(id, text);
    lastHtml.delete(id);
    el.textContent = text;
}

/** Update innerHTML only when the markup string changes. */
export function setHtml(id, html) {
    const el = $(id);
    if (!el) return;
    if (lastHtml.get(id) === html) return;
    lastHtml.set(id, html);
    lastText.delete(id);
    el.innerHTML = html;
}

export function setDot(id, color) {
    const el = $(id);
    if (!el || el.dataset.color === color) return;
    el.dataset.color = color;
    el.className = `dot ${color}`;
}

export const fmt = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
