/**
 * StreamPulse — Tournament Multi-Match Admin State & Navigation
 */

export const $ = id => document.getElementById(id);

export function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

export let tournamentData = null;
export function setTournamentData(data) { tournamentData = data; }

export let currentFilter = localStorage.getItem('tourney-admin-filter') || 'all';
export function setCurrentFilter(val) { currentFilter = val; }

export let currentRoundFilter = 'all';
export function setCurrentRoundFilter(val) { currentRoundFilter = val; }

export let currentGroupMode = localStorage.getItem('tourney-admin-group') || 'round';
export function setCurrentGroupMode(val) { currentGroupMode = val; }

const urlParams = new URLSearchParams(window.location.search);
export let focusedMatchId = urlParams.get('match') || null;
export function setFocusedMatchId(val) { focusedMatchId = val; }

export const isPopoutWindow = urlParams.get('popout') === '1';

export function classifyMatch(m) {
    const isBye = Boolean(m.isBye || m.entrant2?.name === 'BYE');
    if (isBye) return 'bye';
    if (m.winner) return 'completed';
    const e1 = m.entrant1?.name || m.entrants?.[0] || 'TBD';
    const e2 = m.entrant2?.name || m.entrants?.[1] || 'TBD';
    if (e1 !== 'TBD' && e2 !== 'TBD') return 'playable';
    return 'upcoming';
}

export function setFocusedMatch(matchId, renderFn) {
    focusedMatchId = matchId || null;
    const nextUrl = new URL(window.location.href);
    if (focusedMatchId) {
        nextUrl.searchParams.set('match', focusedMatchId);
    } else {
        nextUrl.searchParams.delete('match');
        nextUrl.searchParams.delete('popout');
        document.body.classList.remove('popout-mode');
    }
    window.history.replaceState({}, '', nextUrl.toString());
    if (renderFn) renderFn();
}

export function focusNextPlayableMatch(renderFn) {
    if (!tournamentData || !Array.isArray(tournamentData.matches)) return;
    const playable = tournamentData.matches.filter(m => classifyMatch(m) === 'playable');
    if (!playable.length) {
        toast('No playable matches remaining');
        return;
    }
    const curIdx = playable.findIndex(m => m.id === focusedMatchId);
    const nextM = playable[(curIdx + 1) % playable.length];
    setFocusedMatch(nextM.id, renderFn);
}

export function popOutMatchWindow(matchId, renderFn) {
    const url = `/tournament-admin.html?match=${encodeURIComponent(matchId)}&popout=1`;
    const win = window.open(
        url,
        `streampulse_match_${matchId}`,
        'width=820,height=470,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
    );
    if (!win) {
        setFocusedMatch(matchId, renderFn);
        toast('Focused match view (pop-up blocked by browser)');
    }
}

export function setMatchFilter(filter, renderFn) {
    currentFilter = filter;
    try { localStorage.setItem('tourney-admin-filter', filter); } catch {}
    document.querySelectorAll('#filter-chips .preset-chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    if (renderFn) renderFn();
}

export function setRoundFilter(roundVal, renderFn) {
    currentRoundFilter = roundVal || 'all';
    if (renderFn) renderFn();
}

export function setGroupMode(mode, renderFn) {
    currentGroupMode = mode === 'flat' ? 'flat' : 'round';
    try { localStorage.setItem('tourney-admin-group', currentGroupMode); } catch {}
    if (renderFn) renderFn();
}
