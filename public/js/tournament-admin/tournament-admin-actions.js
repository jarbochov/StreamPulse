/**
 * StreamPulse — Tournament Multi-Match Admin Actions
 */

import {
    toast,
    tournamentData,
    setTournamentData
} from './tournament-admin-state.js';

let _renderPage = () => {};
export function registerPageRenderer(fn) {
    _renderPage = fn;
}

export async function updateLiveSeriesFormat(seriesVal) {
    let bestOf = 3;
    let targetScore = 2;
    let scoringType = 'bestOf';
    if (seriesVal === 'points') {
        scoringType = 'points';
        bestOf = 0;
        targetScore = 0;
    } else if (seriesVal === 'firstTo-10') {
        scoringType = 'firstTo';
        bestOf = 0;
        targetScore = 10;
    } else if (seriesVal === 'firstTo-custom') {
        const currentTarget = tournamentData?.targetScore || 5;
        const customInput = prompt('Enter custom First-to target score (1-99):', String(currentTarget));
        if (customInput === null) {
            _renderPage();
            return;
        }
        scoringType = 'firstTo';
        bestOf = 0;
        targetScore = Math.max(1, parseInt(customInput, 10) || 5);
    } else if (seriesVal.startsWith('bestOf-')) {
        scoringType = 'bestOf';
        bestOf = parseInt(seriesVal.replace('bestOf-', ''), 10) || 3;
        targetScore = Math.ceil(bestOf / 2);
    }
    try {
        const res = await fetch('/api/tournament/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scoringType, bestOf, targetScore })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast(`Series format updated (${seriesVal})`);
        }
    } catch {
        toast('Error updating series format');
    }
}

export async function updateLiveRoundsFormat(roundsVal) {
    const roundsBestOf = Math.max(0, parseInt(roundsVal, 10) || 0);
    try {
        const res = await fetch('/api/tournament/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roundsBestOf })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast(roundsBestOf > 0 ? `Enabled Best of ${roundsBestOf} Rounds per Game` : 'Rounds per Game turned off');
        }
    } catch {
        toast('Error updating rounds per game');
    }
}

export async function saveDraftPrompt() {
    if (!tournamentData) return;
    const defaultName = `${tournamentData.title || 'Tournament'} — Checkpoint`;
    const name = prompt('Checkpoint Name / Note:', defaultName);
    if (!name) return;
    try {
        const res = await fetch('/api/tournament/drafts/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            toast('Saved tournament draft checkpoint!');
        }
    } catch {
        toast('Error saving draft');
    }
}

export async function toggleLiveHighlight(enabled) {
    try {
        const res = await fetch('/api/tournament/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ highlightLive: Boolean(enabled) })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast(enabled ? 'Live match highlight enabled on bracket' : 'Live match highlight disabled on bracket');
        }
    } catch {
        toast('Error updating bracket highlight setting');
    }
}

export async function pinMatch(matchId) {
    try {
        const res = await fetch('/api/tournament/select-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast(matchId ? `Pinned match #${matchId} to Live HUD` : 'Unpinned live match');
        }
    } catch {
        toast('Error updating pinned match');
    }
}

export async function stepScore(matchId, entrantIdx, delta) {
    if (!tournamentData) return;
    const m = (tournamentData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const cur = entrantIdx === 1 ? (m.entrant1?.score ?? 0) : (m.entrant2?.score ?? 0);
    await setScoreDirect(matchId, entrantIdx, Math.max(0, cur + delta));
}

export async function setScoreDirect(matchId, entrantIdx, scoreVal) {
    if (!tournamentData) return;
    const m = (tournamentData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const entrantName = entrantIdx === 1 ? (m.entrant1?.name || m.entrants?.[0]) : (m.entrant2?.name || m.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;
    const score = Math.max(0, parseInt(scoreVal, 10) || 0);
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, entrant: entrantName, score, preserveActiveMatch: true })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
        }
    } catch {
        toast('Error updating score');
    }
}

export async function stepRound(matchId, entrantIdx, roundDelta) {
    if (!tournamentData) return;
    const m = (tournamentData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const entrantName = entrantIdx === 1 ? (m.entrant1?.name || m.entrants?.[0]) : (m.entrant2?.name || m.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, entrant: entrantName, roundDelta, preserveActiveMatch: true })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
        }
    } catch {
        toast('Error updating rounds');
    }
}

export async function setRoundDirect(matchId, entrantIdx, roundVal) {
    if (!tournamentData) return;
    const m = (tournamentData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const entrantName = entrantIdx === 1 ? (m.entrant1?.name || m.entrants?.[0]) : (m.entrant2?.name || m.entrants?.[1]);
    if (!entrantName || entrantName === 'TBD' || entrantName === 'BYE') return;
    const rounds = Math.max(0, parseInt(roundVal, 10) || 0);
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, entrant: entrantName, rounds, preserveActiveMatch: true })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
        }
    } catch {
        toast('Error setting rounds');
    }
}

export async function updateEntrantMeta(matchId, entrantIdx, field, val) {
    const payload = { matchId, preserveActiveMatch: true };
    if (field === 'tag') {
        if (entrantIdx === 1) payload.entrant1Tag = val;
        else payload.entrant2Tag = val;
    } else if (field === 'color') {
        if (entrantIdx === 1) payload.entrant1Color = val;
        else payload.entrant2Color = val;
    }
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
        }
    } catch {
        toast('Error updating entrant details');
    }
}

export async function saveMatchNote(matchId, note) {
    try {
        const res = await fetch('/api/tournament/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, matchDetails: (note || '').trim(), preserveActiveMatch: true })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            toast('Station / Match note saved');
        }
    } catch {
        toast('Error saving match note');
    }
}

export async function resetMatchScore(matchId) {
    try {
        const res = await fetch('/api/tournament/reset-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast('Match score reset to 0-0');
        }
    } catch {
        toast('Error resetting match');
    }
}

export async function recordDraw(matchId) {
    try {
        const res = await fetch('/api/tournament/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, winner: 'DRAW' })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast('Recorded tie / draw');
        }
    } catch {
        toast('Error recording draw');
    }
}

export async function advanceMatch(matchId) {
    if (!tournamentData) return;
    const m = (tournamentData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    const e1 = m.entrant1?.name || m.entrants?.[0];
    const e2 = m.entrant2?.name || m.entrants?.[1];
    const s1 = m.entrant1?.score ?? 0;
    const s2 = m.entrant2?.score ?? 0;
    let winner = m.winner;
    if (!winner) {
        if (s1 > s2) winner = e1;
        else if (s2 > s1) winner = e2;
        else {
            winner = prompt(`Scores are tied (${s1}-${s2}). Enter winner name (${e1} or ${e2}):`, e1);
            if (!winner) return;
        }
    }
    try {
        const res = await fetch('/api/tournament/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, winner })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast(`Advanced: ${winner}`);
        }
    } catch {
        toast('Error advancing match');
    }
}

export async function rollbackMatch(matchId) {
    if (!confirm('Undo this match advancement and roll back any downstream matches?')) return;
    try {
        const res = await fetch('/api/tournament/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast('Match rolled back');
        }
    } catch {
        toast('Error rolling back match');
    }
}

export async function quickStartSampleBracket(count = 8) {
    const entrants = [
        'Daigo [Ken]', 'Tokido [Akuma]', 'MenaRD [Blanka]', 'Punk [Cammy]',
        'AngryBird [Ken]', 'Leffen [Chun-Li]', 'Nephew [Juri]', 'SonicFox [JP]'
    ].slice(0, count);
    try {
        const res = await fetch('/api/tournament/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Championship Showdown',
                format: 'single',
                entrants,
                scoringType: 'bestOf',
                bestOf: 3,
                roundsBestOf: 3,
                targetScore: 2,
                progressionMode: 'manual'
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setTournamentData(data.tournament);
            _renderPage();
            toast('8-Player bracket started!');
        }
    } catch {
        toast('Error starting bracket');
    }
}
