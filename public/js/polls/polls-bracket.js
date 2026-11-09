/**
 * StreamPulse Poll Studio — Tournament Bracket Studio & Match Operations
 */

import {
    $,
    esc,
    escapeHtml,
    toast,
    activeTourneyData,
    setActiveTourneyData,
    activePollData,
    setActivePollData
} from './polls-state.js';
import { updatePreview } from './polls-preview.js';

        // --- Tournament Studio Actions ---
        let currentCreateTourneyMode = 'vote';
        let pollTournamentTemplates = [];
        let pollTournamentSavedBrackets = [];
        let loadedTournamentTemplate = null;
        let tournamentLibraryRequest = null;
        let tournamentLibraryRendered = false;

export async function tournamentLibraryCall(path, method = 'GET', body) {
            const response = await fetch(`/api/polls/tournament/${path}`, {
                method, cache: 'no-store', signal: AbortSignal.timeout(10000),
                ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
            });
            const data = await response.json();
            if (!response.ok || data.status !== 'ok') throw new Error(data.error || 'Tournament library request failed');
            return data;
        }

export function tournamentSummary(t) {
            const format = t.format === 'double' ? 'Double elimination' : t.format === 'roundRobin' ? 'Round robin' : 'Single elimination';
            const count = t.entrants?.length || t.entrantCount || t.entrantsList?.length || t.bracketSize || 0;
            return `${format} · ${count} entrants`;
        }

export async function loadPollTournamentLibrary(force = false) {
            if (tournamentLibraryRequest) {
                await tournamentLibraryRequest;
                if (!force) return;
            }
            tournamentLibraryRequest = (async () => {
                try {
                    const [templates, history] = await Promise.all([
                        tournamentLibraryCall('presets'), tournamentLibraryCall('history')
                    ]);
                    const nextTemplates = templates.presets || [];
                    const nextHistory = history.history || [];
                    const unchanged = tournamentLibraryRendered &&
                        JSON.stringify(nextTemplates) === JSON.stringify(pollTournamentTemplates) &&
                        JSON.stringify(nextHistory) === JSON.stringify(pollTournamentSavedBrackets);
                    pollTournamentTemplates = nextTemplates;
                    pollTournamentSavedBrackets = nextHistory;
                    if (unchanged) return;
                    $('tourney-preset-select').innerHTML = '<option value="">-- Load a tournament template --</option>' +
                        pollTournamentTemplates.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
                    $('tournament-templates-list').innerHTML = pollTournamentTemplates.length
                        ? pollTournamentTemplates.map(t => `<div class="history-item tournament-library-item" data-template-id="${esc(t.id)}">
                            <div><div class="history-title">${esc(t.name)}</div><div class="history-meta">${esc(tournamentSummary(t))} · ${t.matchDuration}s per match${t.blind ? ' · Blind' : ''} · <button class="btn-secondary btn-sm" data-library-action="copy-id" data-id="${esc(t.id)}" title="Copy tournament template ID for Companion">Copy ID</button></div></div>
                            <div style="display: flex; gap: 0.4rem;"><button class="btn-secondary btn-sm" data-library-action="load-template" data-id="${esc(t.id)}">Load Template</button><button class="btn-danger btn-sm" data-library-action="delete-template" data-id="${esc(t.id)}">Delete</button></div>
                        </div>`).join('') : '<p class="history-meta">No tournament templates yet. Save one from the creation form or the current bracket.</p>';
                    $('tournament-history-list').innerHTML = pollTournamentSavedBrackets.length
                        ? pollTournamentSavedBrackets.map(t => `<div class="history-item tournament-library-item" data-history-id="${esc(t.id)}">
                            <div><div class="history-title">${esc(t.savedName || t.title)}</div><div class="history-meta">${esc(tournamentSummary(t))} · ${t.matches?.filter(m => m.status === 'COMPLETED').length || 0}/${t.matches?.length || 0} matches completed · ${t.isCheckpoint ? 'Checkpoint' : 'History'}${t.champion ? ` · Champion: ${esc(t.champion)}` : ''}</div><div class="history-meta">${esc(new Date(t.savedAt || t.endedAt || t.createdAt).toLocaleString())} · <button class="btn-secondary btn-sm" data-library-action="copy-id" data-id="${esc(t.id)}" title="Copy saved bracket ID for Companion">Copy ID</button></div></div>
                            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;"><button class="btn-secondary btn-sm" data-library-action="load-history" data-id="${esc(t.id)}">Load Saved Bracket</button><button class="btn-secondary btn-sm" data-library-action="history-template" data-id="${esc(t.id)}">Save as Template</button><button class="btn-danger btn-sm" data-library-action="delete-history" data-id="${esc(t.id)}">Delete</button></div>
                        </div>`).join('') : '<p class="history-meta">No saved brackets yet. Save a checkpoint without ending the tournament, or finish a tournament to archive its results.</p>';
                    tournamentLibraryRendered = true;
                } catch (err) {
                    tournamentLibraryRendered = false;
                    $('tournament-templates-list').textContent = err.message;
                    $('tournament-history-list').textContent = err.message;
                    toast(err.message);
                }
            })().finally(() => { tournamentLibraryRequest = null; });
            return tournamentLibraryRequest;
        }

export function tournamentFormSettings() {
            return {
                ...(loadedTournamentTemplate || {}),
                title: $('tourney-title').value.trim(),
                logo: ($('tourney-create-logo')?.value || '').trim(),
                format: $('tourney-format').value,
                entrants: $('tourney-entrants').value.split('\n').map(s => s.trim()).filter(Boolean).map(name =>
                    loadedTournamentTemplate?.entrants.find(e => typeof e === 'object' && tournamentEntrantLabel(e) === name) || name),
                matchDuration: Number($('tourney-duration').value),
                blind: $('tourney-blind').checked,
                announceChat: $('tourney-announce-chat').checked,
                progressionMode: 'vote', scoringType: 'points', bestOf: 0, isPoll: true
            };
        }

export async function savePollTournamentTemplate(source, historyId) {
            const settings = source === 'form' ? tournamentFormSettings() :
                source === 'active' ? activeTourneyData : pollTournamentSavedBrackets.find(t => t.id === historyId);
            if (!settings) { toast('No tournament to save.'); return; }
            const name = prompt('Tournament template name:', settings.title || 'Tournament Template');
            if (name === null || !name.trim()) return;
            try {
                await tournamentLibraryCall('presets', 'POST', {
                    ...(source === 'form' ? settings : source === 'active' ? { fromActive: true } : { historyId }),
                    name: name.trim()
                });
                toast('Tournament template saved. The current bracket and vote are unchanged.');
                await loadPollTournamentLibrary(true);
            } catch (err) { toast(err.message); }
        }

export async function savePollTournamentCheckpoint() {
            const name = prompt('Checkpoint name (bracket progress; no live ballot):', activeTourneyData?.title || 'Bracket Checkpoint');
            if (name === null || !name.trim()) return;
            try {
                await tournamentLibraryCall('checkpoints', 'POST', { name: name.trim() });
                toast('Checkpoint saved. The running tournament and vote are unchanged.');
                await loadPollTournamentLibrary(true);
            } catch (err) { toast(err.message); }
        }

export function loadPollTournamentTemplate(id) {
            const template = pollTournamentTemplates.find(t => t.id === id);
            if (!template) return;
            loadedTournamentTemplate = template;
            $('tourney-title').value = template.title;
            $('tourney-format').value = template.format;
            $('tourney-entrants').value = template.entrants.map(tournamentEntrantLabel).join('\n');
            const duration = $('tourney-duration');
            for (const option of [...duration.options]) if (option.dataset.templateDuration) option.remove();
            if (![...duration.options].some(option => Number(option.value) === template.matchDuration)) {
                const option = new Option(`${template.matchDuration} seconds per match`, String(template.matchDuration));
                option.dataset.templateDuration = 'true';
                duration.add(option);
            }
            duration.value = String(template.matchDuration);
            $('tourney-blind').checked = template.blind;
            $('tourney-announce-chat').checked = template.announceChat !== false;
            setCreatePollTourneyLogo(template.logo || '');
            switchTab('tourney');
            $('create-tournament-card').style.display = 'block';
            updateEntrantsCalc();
            $('create-tournament-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
            toast('Template loaded into the form. Create a new bracket when ready; saved results are not reused.');
        }

export function tournamentEntrantLabel(entrant) {
            return typeof entrant === 'object' ? entrant.tag ? `${entrant.name} [${entrant.tag}]` : entrant.name : entrant;
        }

        document.addEventListener('click', async event => {
            const button = event.target.closest('[data-library-action]');
            if (!button || button.disabled) return;
            const id = button.dataset.id;
            const action = button.dataset.libraryAction;
            if (action === 'copy-id') {
                try { await navigator.clipboard.writeText(id); toast('Saved item ID copied.'); }
                catch { prompt('Copy saved item ID:', id); }
                return;
            }
            if (action === 'load-template') { loadPollTournamentTemplate(id); return; }
            if (action === 'history-template') { await savePollTournamentTemplate('history', id); return; }
            if (action === 'load-history' && activePollData?.status === 'ACTIVE') {
                toast('End the current poll before loading a saved bracket.');
                return;
            }
            const message = action === 'load-history'
                ? 'Load this saved bracket and replace the current bracket? Save a checkpoint first if you want to preserve its exact current progress. Unfinished match votes must be started again.'
                : 'Delete this saved item? The current tournament and poll will not change.';
            if (!confirm(message)) return;
            button.disabled = true;
            try {
                if (action === 'load-history') {
                    const data = await tournamentLibraryCall('history/restore', 'POST', { id });
                    setActiveTourneyData(data.tournament);
                    switchTab('tourney');
                    renderTournamentStudio(activeTourneyData);
                    toast('Saved bracket loaded. No vote has been started.');
                } else {
                    await tournamentLibraryCall(`${action === 'delete-template' ? 'presets' : 'history'}/${encodeURIComponent(id)}`, 'DELETE');
                    toast('Saved item deleted.');
                }
                await loadPollTournamentLibrary(true);
            } catch (err) { toast(err.message); } finally { button.disabled = false; }
        });

export function setCreateTourneyMode(mode) {
            currentCreateTourneyMode = mode;
        }

export function updateEntrantsCalc() {
            const text = $('tourney-entrants').value.trim();
            const entrants = text ? text.split('\n').map(s => s.trim()).filter(Boolean) : [];
            const count = entrants.length;
            const pill = $('tourney-entrants-pill');
            const format = $('tourney-format')?.value;
            if ($('double-entrant-hint')) $('double-entrant-hint').style.display = format === 'double' ? 'block' : 'none';
            if (!pill) return;
            if (count < 2) {
                pill.textContent = `${count} seed${count === 1 ? '' : 's'} (min 2)`;
                pill.style.color = 'var(--text-muted)';
                return;
            }
            if (format === 'roundRobin') {
                const totalMatches = (count * (count - 1)) / 2;
                pill.textContent = `${count} entrants · Round Robin (${totalMatches} matches)`;
                pill.style.color = 'var(--accent)';
                return;
            }
            let bracketSize = 2;
            while (bracketSize < count && bracketSize < 32) {
                bracketSize *= 2;
            }
            const byes = bracketSize - count;
            pill.textContent = byes > 0
                ? `${count} entrants · ${bracketSize}-bracket (${byes} BYE${byes === 1 ? '' : 's'})`
                : `${count} entrants · ${bracketSize}-bracket (Full)`;
            pill.style.color = 'var(--accent)';
        }

export function fillSampleEntrants(count = 8) {
            const samples = [
                'Chrono Trigger', 'Final Fantasy VI', 'EarthBound', 'Secret of Mana',
                'Super Mario RPG', 'Lufia II', 'Breath of Fire II', 'Dragon Quest V',
                'Golden Sun', 'Xenogears', 'Suikoden II', 'Grandia',
                'Star Ocean', 'Wild Arms', 'Valkyrie Profile', 'Phantasy Star IV'
            ];
            $('tourney-entrants').value = samples.slice(0, count).join('\n');
            if (!$('tourney-title').value.trim()) {
                $('tourney-title').value = `Retro RPG Championship (${count} Seeds)`;
            }
            updateEntrantsCalc();
        }

export async function pullTourneyFromGamePlan() {
            try {
                const res = await fetch('/api/game-plan');
                const plan = await res.json();
                const games = (plan.items || []).map(i => i.title).filter(Boolean);
                if (games.length < 2) {
                    toast('Need at least 2 games in Game Plan for a tournament!');
                    return;
                }
                const count = Math.min(games.length, 32);
                $('tourney-entrants').value = games.slice(0, count).join('\n');
                $('tourney-title').value = `Game Plan Tournament (${count} Games)`;
                updateEntrantsCalc();
                toast(`Loaded ${count} games from Game Plan!`);
            } catch {
                toast('Could not fetch Game Plan data.');
            }
        }

export async function launchTournament() {
            const title = $('tourney-title').value.trim();
            const format = $('tourney-format').value;
            const text = $('tourney-entrants').value.trim();
            const entrants = text.split('\n').map(s => s.trim()).filter(Boolean);

            if (!title) { toast('Please enter a tournament title.'); return; }
            if (entrants.length < 2) { toast('Please enter at least 2 participants.'); return; }
            if (format === 'double' && ![2, 4, 8, 16].includes(entrants.length)) {
                toast('Double elimination requires 2, 4, 8, or 16 participants.');
                return;
            }
            if (activePollData?.status === 'ACTIVE') { toast('End the current poll before creating a new bracket.'); return; }
            if (activeTourneyData && !confirm('Replace the current tournament with a fresh bracket? Save a checkpoint first to preserve its exact progress.')) return;

            const isManual = false;
            const payload = {
                ...tournamentFormSettings(),
                title,
                logo: ($('tourney-create-logo')?.value || $('tourney-opt-logo')?.value || '').trim(),
                format,
                entrants: tournamentFormSettings().entrants,
                progressionMode: currentCreateTourneyMode,
                scoringType: isManual ? 'bestOf' : 'points',
                bestOf: 0,
                matchDuration: !isManual ? (parseInt($('tourney-duration').value, 10) || 60) : 0,
                blind: !isManual ? $('tourney-blind').checked : false,
                announceChat: $('tourney-announce-chat')?.checked !== false,
                isPoll: true
            };

            try {
                const res = await fetch('/api/polls/tournament/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    loadedTournamentTemplate = null;
                    renderTournamentStudio(activeTourneyData);
                    setPreviewMode('tree');
                    toast('Tournament bracket launched!');
                } else {
                    toast(data.error || 'Failed to create tournament');
                }
            } catch {
                toast('Server error creating tournament.');
            }
        }

export function getCurrentMatch() {
            if (!activeTourneyData) return null;
            const matches = activeTourneyData.matches || [];
            return matches.find(m => m.id === activeTourneyData.activeMatchId && !m.isBye) ||
                   matches.find(m => m.status === 'ACTIVE' && !m.isBye) ||
                   matches.find(m => m.status === 'PENDING' && !m.isBye && m.entrant1?.name && m.entrant2?.name && m.entrant1.name !== 'TBD' && m.entrant2.name !== 'TBD' && m.entrant1.name !== 'BYE' && m.entrant2.name !== 'BYE') ||
                   matches.find(m => !m.isBye) ||
                   matches[0];
        }

export function renderTournamentStudio(t) {
            const card = $('active-tournament-card');
            const createCard = $('create-tournament-card');

            if (!t) {
                card.style.display = 'none';
                createCard.style.display = 'block';
                return;
            }

            card.style.display = 'block';
            createCard.style.display = loadedTournamentTemplate ? 'block' : 'none';
            $('tourney-card-title').textContent = t.title;
            const liveLogoThumb = $('tourney-active-logo-thumb');
            const liveLogoLabel = $('btn-live-tourney-logo-label');
            if (liveLogoThumb) {
                liveLogoThumb.src = t.logo || '';
                liveLogoThumb.style.display = t.logo ? 'block' : 'none';
            }
            if (liveLogoLabel) {
                liveLogoLabel.textContent = t.logo ? 'Change Logo…' : 'Bracket Logo…';
            }
            if (t.logo !== undefined && $('tourney-opt-logo') && !$('tourney-opt-logo').value) {
                $('tourney-opt-logo').value = t.logo || '';
                syncPollTourneyOverlayLogoUi(t.logo || '');
            }
            $('tourney-mode-badge').textContent = t.progressionMode === 'manual' ? 'Manual Scored' : 'Chat Vote';
            $('tourney-format-badge').textContent = t.format === 'double' ? 'Double Elim' : (t.format === 'roundRobin' ? 'Round Robin' : 'Single Elim');
            const chatToggleLabel = $('label-live-tourney-chat');
            const chatToggleBtn = $('btn-tourney-chat-toggle');
            if (chatToggleLabel && chatToggleBtn) {
                const isAnnouncing = t.announceChat !== false;
                chatToggleLabel.textContent = isAnnouncing ? 'Chat: On' : 'Chat: Off';
                chatToggleBtn.style.opacity = isAnnouncing ? '1' : '0.65';
                chatToggleBtn.title = isAnnouncing ? 'Chat announcements active for this tournament. Click to mute.' : 'Chat announcements muted for this tournament. Click to enable.';
            }

            const matches = t.matches || [];
            const currentMatch = t.status === 'COMPLETED' ? null : getCurrentMatch();
            const isManual = t.progressionMode === 'manual';

            const durDisplay = $('live-match-duration-display');
            if (durDisplay) {
                durDisplay.textContent = t.matchDuration ? `${t.matchDuration}s` : 'Manual';
            }
            const extendGroup = $('live-extend-timer-group');
            if (extendGroup) {
                extendGroup.style.display = (currentMatch && currentMatch.status === 'ACTIVE' && !isManual) ? 'inline-flex' : 'none';
            }
            const durationBar = $('tourney-duration-bar');
            if (durationBar) {
                durationBar.style.display = isManual ? 'none' : 'flex';
            }

            const e1Stepper = $('e1-stepper');
            const e2Stepper = $('e2-stepper');
            const detailsInput = $('match-details-input');
            const btnStart = $('btn-start-match');
            const btnAdv1 = $('btn-advance-e1');
            const btnAdv2 = $('btn-advance-e2');
            const btnReset = $('btn-reset-match');

            if (currentMatch && t.status !== 'COMPLETED') {
                $('current-match-round').textContent = currentMatch.roundName;

                if (isManual) {
                    if (t.bestOf > 0) {
                        const target = t.targetScore || Math.ceil(t.bestOf / 2);
                        $('current-match-series').textContent = `Best of ${t.bestOf} (First to ${target} wins)`;
                    } else {
                        $('current-match-series').textContent = 'Free Points';
                    }
                } else {
                    $('current-match-series').textContent = 'Chat Vote Match';
                }

                if (currentMatch.status === 'COMPLETED') {
                    $('current-match-status').textContent = `Winner: ${currentMatch.winner || 'TBD'}`;
                    $('current-match-status').style.color = '#3fb950';
                } else if (currentMatch.status === 'ACTIVE') {
                    $('current-match-status').textContent = isManual ? 'Scoring In Progress' : 'Voting Live';
                    $('current-match-status').style.color = '#3fb950';
                } else {
                    $('current-match-status').textContent = 'Ready';
                    $('current-match-status').style.color = 'var(--accent)';
                }

                $('entrant1-name').textContent = currentMatch.entrant1?.name || 'TBD';
                $('entrant2-name').textContent = currentMatch.entrant2?.name || 'TBD';
                const e1Color = currentMatch.entrant1?.color || '#ef4444';
                const e2Color = currentMatch.entrant2?.color || '#3b82f6';
                if ($('entrant1-color-picker')) $('entrant1-color-picker').value = e1Color;
                if ($('entrant1-color-strip')) $('entrant1-color-strip').style.background = e1Color;
                if ($('entrant2-color-picker')) $('entrant2-color-picker').value = e2Color;
                if ($('entrant2-color-strip')) $('entrant2-color-strip').style.background = e2Color;

                if (isManual) {
                    if (e1Stepper) e1Stepper.style.display = 'flex';
                    if (e2Stepper) e2Stepper.style.display = 'flex';
                    $('e1-score-input').value = currentMatch.entrant1?.score ?? (currentMatch.scores ? currentMatch.scores[0] : 0);
                    $('e2-score-input').value = currentMatch.entrant2?.score ?? (currentMatch.scores ? currentMatch.scores[1] : 0);

                    const target = t.targetScore || (t.bestOf ? Math.ceil(t.bestOf / 2) : 0);
                    if (target > 0) {
                        const s1 = currentMatch.entrant1?.score || 0;
                        const s2 = currentMatch.entrant2?.score || 0;
                        const pips1 = Array.from({ length: target }, (_, i) => i < s1 ? '●' : '○').join(' ');
                        const pips2 = Array.from({ length: target }, (_, i) => i < s2 ? '●' : '○').join(' ');
                        $('entrant1-votes').textContent = `${pips1} (${s1} of ${target} wins)`;
                        $('entrant2-votes').textContent = `${pips2} (${s2} of ${target} wins)`;
                    } else {
                        $('entrant1-votes').textContent = `${currentMatch.entrant1?.score || 0} pts`;
                        $('entrant2-votes').textContent = `${currentMatch.entrant2?.score || 0} pts`;
                    }

                    if (detailsInput) detailsInput.value = currentMatch.matchDetails || '';
                    if (btnStart) btnStart.style.display = 'none';
                    if (btnAdv1) {
                        btnAdv1.style.display = 'inline-block';
                        btnAdv1.textContent = `Advance ${currentMatch.entrant1?.name ? currentMatch.entrant1.name.slice(0, 12) : '#1'}`;
                    }
                    if (btnAdv2) {
                        btnAdv2.style.display = 'inline-block';
                        btnAdv2.textContent = `Advance ${currentMatch.entrant2?.name ? currentMatch.entrant2.name.slice(0, 12) : '#2'}`;
                    }
                    if (btnReset) btnReset.style.display = 'inline-block';
                } else {
                    if (e1Stepper) e1Stepper.style.display = 'none';
                    if (e2Stepper) e2Stepper.style.display = 'none';
                    $('entrant1-votes').textContent = `${currentMatch.entrant1?.votes || 0} votes (${currentMatch.entrant1?.percent || 0}%)`;
                    $('entrant2-votes').textContent = `${currentMatch.entrant2?.votes || 0} votes (${currentMatch.entrant2?.percent || 0}%)`;

                    if (btnStart) {
                        btnStart.style.display = 'inline-block';
                        if (isCurrentMatchPoll(currentMatch)) {
                            btnStart.textContent = 'End Match Vote';
                        } else {
                            btnStart.textContent = 'Start Match Vote';
                        }
                    }
                    if (btnAdv1) {
                        btnAdv1.style.display = 'inline-block';
                        btnAdv1.textContent = `Advance ${currentMatch.entrant1?.name ? currentMatch.entrant1.name.slice(0, 12) : '#1'}`;
                    }
                    if (btnAdv2) {
                        btnAdv2.style.display = 'inline-block';
                        btnAdv2.textContent = `Advance ${currentMatch.entrant2?.name ? currentMatch.entrant2.name.slice(0, 12) : '#2'}`;
                    }
                    if (btnReset) btnReset.style.display = 'inline-block';
                }
            } else if (t.status === 'COMPLETED') {
                $('current-match-round').textContent = 'Tournament Finished!';
                $('current-match-series').textContent = '';
                $('current-match-status').textContent = 'Champion Crowned';
                $('current-match-status').style.color = '#3fb950';
                $('entrant1-name').textContent = t.champion || 'Champion';
                $('entrant1-votes').textContent = 'Grand Champion';
                $('entrant2-name').textContent = 'Concluded';
                $('entrant2-votes').textContent = 'All matches finished';
                if (e1Stepper) e1Stepper.style.display = 'none';
                if (e2Stepper) e2Stepper.style.display = 'none';
                if (btnStart) btnStart.style.display = 'none';
                if (btnAdv1) btnAdv1.style.display = 'none';
                if (btnAdv2) btnAdv2.style.display = 'none';
                if (btnReset) btnReset.style.display = 'none';
            }

            // Render mini bracket tree view in studio
            const treeView = $('bracket-studio-view');
            function renderStudioMatchItem(m) {
                if (m.isBye) {
                    const real = m.entrant1?.name !== 'BYE' ? m.entrant1 : m.entrant2;
                    return `
                        <div class="tournament-match-box completed" style="margin-bottom: 0.5rem; padding: 0.45rem 0.75rem; font-size: 0.8rem; opacity: 0.7; border-style: dashed;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                                <span style="font-weight: 700; color: var(--text-muted); font-size: 0.72rem;">${esc(m.roundName)}</span>
                                <span class="badge-studio" style="font-size: 0.65rem; background: rgba(88,166,255,0.15); color: var(--accent);">BYE</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #3fb950; font-weight: 700;">${esc(real?.name || m.winner || 'Advanced')}</span>
                                <span style="font-size: 0.72rem; color: var(--text-muted);">1st Round BYE</span>
                            </div>
                        </div>
                    `;
                }

                const isAct = m.id === (currentMatch ? currentMatch.id : t.activeMatchId);
                const isComp = m.status === 'COMPLETED';
                const e1Score = m.entrant1?.score ?? (m.scores ? m.scores[0] : 0);
                const e2Score = m.entrant2?.score ?? (m.scores ? m.scores[1] : 0);
                const scoreBadge = isManual
                    ? `<span class="badge-studio" style="font-size: 0.72rem; font-family: monospace;">${e1Score} - ${e2Score}</span>`
                    : `<span style="font-size: 0.72rem; color: ${isAct ? 'var(--accent)' : (isComp ? '#3fb950' : 'var(--text-muted)')}; font-weight: 700;">${m.status}</span>`;

                return `
                    <div class="tournament-match-box clickable${isAct ? ' active' : ''}${isComp ? ' completed' : ''}" data-match-id="${esc(m.id)}" style="margin-bottom: 0.5rem; padding: 0.45rem 0.75rem; font-size: 0.8rem; cursor: pointer;" onclick="selectTournamentMatch('${m.id}')" title="Click to score or control match">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                            <span style="font-weight: 700; color: var(--text-muted); font-size: 0.72rem;">${esc(m.roundName)}${m.matchDetails ? ` · ${esc(m.matchDetails)}` : ''}</span>
                            ${scoreBadge}
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="display: inline-flex; align-items: center; gap: 0.3rem; ${m.winner === m.entrant1?.name ? 'color: #3fb950; font-weight: 700;' : ''}">
                                ${m.entrant1?.color ? `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${m.entrant1.color}; flex-shrink:0;"></span>` : ''}
                                ${esc(m.entrant1?.name || 'TBD')}
                            </span>
                            <span style="font-size: 0.72rem; color: var(--text-muted); padding: 0 0.4rem;">vs</span>
                            <span style="display: inline-flex; align-items: center; gap: 0.3rem; ${m.winner === m.entrant2?.name ? 'color: #3fb950; font-weight: 700;' : ''}">
                                ${m.entrant2?.color ? `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${m.entrant2.color}; flex-shrink:0;"></span>` : ''}
                                ${esc(m.entrant2?.name || 'TBD')}
                            </span>
                        </div>
                    </div>
                `;
            }

            const sectionNav = $('bracket-section-nav');
            if (sectionNav) sectionNav.style.display = t.format === 'double' ? 'flex' : 'none';
            if (t.format === 'double') {
                const wMatches = matches.filter(m => m.bracket === 'winners' || (!m.bracket && !m.id.startsWith('lb_') && m.id !== 'gf_1'));
                const lMatches = matches.filter(m => m.bracket === 'losers' || m.id.startsWith('lb_'));
                const gfMatches = matches.filter(m => m.bracket === 'grand_finals' || m.id === 'gf_1');
                $('bracket-nav-winners').hidden = !wMatches.length;
                $('bracket-nav-losers').hidden = !lMatches.length;
                $('bracket-nav-finals').hidden = !gfMatches.length;

                let studioHtml = '';
                if (wMatches.length) {
                    studioHtml += `<div id="bracket-section-winners" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); margin: 0.5rem 0 0.35rem; padding-bottom: 0.2rem; border-bottom: 1px solid var(--border);">Winners Bracket</div>`;
                    studioHtml += wMatches.map(renderStudioMatchItem).join('');
                }
                if (lMatches.length) {
                    studioHtml += `<div id="bracket-section-losers" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #f59e0b; margin: 0.85rem 0 0.35rem; padding-bottom: 0.2rem; border-bottom: 1px solid var(--border);">Losers Bracket</div>`;
                    studioHtml += lMatches.map(renderStudioMatchItem).join('');
                } else if (t.bracketSize >= 4) {
                    studioHtml += `<p class="bracket-warning">This tournament has no saved losers bracket. Do not reset it.</p>
                        <button type="button" class="btn-secondary btn-sm" onclick="repairPollBracket()">Review bracket repair</button>`;
                }
                if (gfMatches.length) {
                    studioHtml += `<div id="bracket-section-finals" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ffd700; margin: 0.85rem 0 0.35rem; padding-bottom: 0.2rem; border-bottom: 1px solid var(--border);">Grand Finals</div>`;
                    studioHtml += gfMatches.map(renderStudioMatchItem).join('');
                }
                treeView.innerHTML = studioHtml;
            } else {
                treeView.innerHTML = matches.map(renderStudioMatchItem).join('');
            }

            // Progress text
            const completedCount = matches.filter(m => m.status === 'COMPLETED').length;
            $('tourney-progress-text').textContent = `${completedCount} of ${matches.length} matches completed`;
        }

export function jumpToBracketSection(section) {
            const view = $('bracket-studio-view');
            const heading = $(`bracket-section-${section}`);
            if (!view || !heading) return;
            view.scrollTop += heading.getBoundingClientRect().top - view.getBoundingClientRect().top - 12;
        }

export async function repairPollBracket() {
            try {
                const previewResponse = await fetch('/api/polls/tournament/repair-preview');
                const previewData = await previewResponse.json();
                if (!previewResponse.ok) {
                    toast(previewData.error || 'Could not preview bracket repair.');
                    return;
                }
                const preview = previewData.preview;
                if (!confirm(`Restore ${preview.losersMatches} losers matches and Grand Finals using ${preview.completedWinners} completed winners results?\n\n${preview.readyLosersMatches} losers matches will be ready. Existing results and any running vote will be preserved. A backup will be saved before changes are applied.`)) return;
                const response = await fetch('/api/polls/tournament/repair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tournamentId: preview.tournamentId, fingerprint: preview.fingerprint })
                });
                const data = await response.json();
                if (!response.ok) {
                    toast(data.error || 'Bracket repair failed.');
                    return;
                }
                setActiveTourneyData(data.tournament);
                renderTournamentStudio(activeTourneyData);
                toast('Losers bracket restored. A backup was saved.');
            } catch {
                toast('Server error repairing bracket.');
            }
        }

export async function setLiveTourneyDuration(sec) {
            sec = parseInt(sec, 10);
            if (!sec || sec < 10) return;
            try {
                const res = await fetch('/api/polls/tournament/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchDuration: sec, updateActiveMatchTimer: true })
                });
                const data = await res.json();
                if (data.ok) {
                    setActiveTourneyData(data.tournament);
                    renderTournamentStudio(activeTourneyData);
                    toast(`Match duration set to ${sec}s for upcoming & active rounds`);
                }
            } catch (err) {
                toast('Error updating match duration');
            }
        }

export async function promptCustomTourneyDuration() {
            const cur = activeTourneyData?.matchDuration || 60;
            const input = prompt('Enter match duration in seconds (e.g. 45, 90, 150):', cur);
            if (!input) return;
            const sec = parseInt(input, 10);
            if (sec >= 10 && sec <= 86400) {
                setLiveTourneyDuration(sec);
            } else {
                toast('Invalid duration. Must be between 10 and 86400 seconds.');
            }
        }

export async function extendLiveMatchTimer(sec) {
            sec = parseInt(sec, 10) || 30;
            try {
                const res = await fetch('/api/polls/tournament/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ extendDuration: sec })
                });
                const data = await res.json();
                if (data.ok) {
                    toast(`Added +${sec}s to live voting match!`);
                }
            } catch (err) {
                toast('Error extending match timer');
            }
        }

export function stepScore(entrantIdx, delta) {
            const input = entrantIdx === 1 ? $('e1-score-input') : $('e2-score-input');
            if (!input) return;
            let val = parseInt(input.value, 10) || 0;
            val = Math.max(0, val + delta);
            input.value = val;
            applyManualScoreInput();
        }

export async function applyManualScoreInput() {
            const m = getCurrentMatch();
            if (!m) return;
            const s1 = parseInt($('e1-score-input').value, 10) || 0;
            const s2 = parseInt($('e2-score-input').value, 10) || 0;
            const details = $('match-details-input').value.trim();
            try {
                const res = await fetch('/api/polls/tournament/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId: m.id, entrant1Score: s1, entrant2Score: s2, matchDetails: details })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    renderTournamentStudio(activeTourneyData);
                    if (data.autoAdvanced) {
                        toast(`Match complete! ${data.match.winner} advanced to next round.`);
                    }
                }
            } catch {
                toast('Error updating score.');
            }
        }

export async function saveMatchDetails() {
            const m = getCurrentMatch();
            if (!m) return;
            const details = $('match-details-input').value.trim();
            try {
                const res = await fetch('/api/polls/tournament/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId: m.id, matchDetails: details })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    renderTournamentStudio(activeTourneyData);
                }
            } catch {
                toast('Error saving match details.');
            }
        }

export async function selectTournamentMatch(matchId) {
            try {
                const res = await fetch('/api/polls/tournament/select-match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    renderTournamentStudio(activeTourneyData);
                }
            } catch {
                toast('Failed to select match.');
            }
        }

export async function updatePollTourneyEntrantColor(side, color) {
            const currentMatch = getCurrentMatch();
            if (!currentMatch) return;
            const entrant = side === 1 ? currentMatch.entrant1?.name : currentMatch.entrant2?.name;
            if (!entrant || entrant === 'TBD' || entrant === 'BYE') return;
            try {
                const res = await fetch('/api/polls/tournament/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId: currentMatch.id, entrantIndex: side - 1, entrant, color, isPoll: true })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    renderTournamentStudio(activeTourneyData);
                    toast(`Updated color for ${entrant}`);
                }
            } catch {
                toast('Failed to update entrant color');
            }
        }
        window.updatePollTourneyEntrantColor = updatePollTourneyEntrantColor;

export async function resetCurrentMatch() {
            const m = getCurrentMatch();
            if (!m) return;
            if (!confirm(`Reset scores and winner for ${m.roundName}?`)) return;
            try {
                const res = await fetch('/api/polls/tournament/reset-match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId: m.id })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    renderTournamentStudio(activeTourneyData);
                    toast('Match reset.');
                } else toast(data.error || 'Failed to reset match.');
            } catch {
                toast('Failed to reset match.');
            }
        }

export function isCurrentMatchPoll(match) {
            if (activePollData?.status !== 'ACTIVE' || activePollData.tournamentMatchId !== match?.id) return false;
            if (activePollData.tournamentId) return activePollData.tournamentId === activeTourneyData?.id;
            return activePollData.choices?.[0]?.title === match.entrant1?.name &&
                activePollData.choices?.[1]?.title === match.entrant2?.name;
        }

export function startCurrentTournamentMatch() {
            const m = getCurrentMatch();
            if (!m) return;
            if (activePollData?.status === 'ACTIVE') {
                if (isCurrentMatchPoll(m)) endActivePoll();
                else toast('End the current poll before starting another match.');
                return;
            }
            startTournamentMatchById(m.id);
        }

export async function startTournamentMatchById(matchId) {
            try {
                const res = await fetch('/api/polls/tournament/start-match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActivePollData(data.poll);
                    renderActivePollMonitor(activePollData);
                    loadTournament();
                    toast('Match vote started in chat!');
                } else {
                    toast(data.error || 'Failed to start match');
                }
            } catch {
                toast('Server error starting match.');
            }
        }

export async function advanceSpecificEntrant(slot) {
            const m = getCurrentMatch();
            if (!m) return;
            const winner = slot === 1 ? m.entrant1?.name : m.entrant2?.name;
            if (!winner || winner === 'TBD' || winner === 'BYE') return;

            try {
                const res = await fetch('/api/polls/tournament/advance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId: m.id, winner })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    renderTournamentStudio(activeTourneyData);
                    toast(`Advanced ${winner}!`);
                } else toast(data.error || 'Failed to advance winner.');
            } catch {
                toast('Failed to advance winner.');
            }
        }

export async function quickTieBreak(mode) {
            const m = getCurrentMatch();
            if (!m) {
                toast('No active match selected.');
                return;
            }
            const e1 = m.entrant1?.name;
            const e2 = m.entrant2?.name;
            if (!e1 || !e2 || e1 === 'TBD' || e2 === 'TBD' || e1 === 'BYE' || e2 === 'BYE') {
                toast('Both match competitors must be decided first.');
                return;
            }
            let winner = null;
            if (mode === 'higherSeed') {
                const s1 = m.entrant1?.seed || 999;
                const s2 = m.entrant2?.seed || 999;
                winner = s1 <= s2 ? e1 : e2;
            } else {
                winner = Math.random() < 0.5 ? e1 : e2;
            }
            try {
                const res = await fetch('/api/polls/tournament/advance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchId: m.id, winner })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActiveTourneyData(data.tournament);
                    renderTournamentStudio(activeTourneyData);
                    toast(`Tie-breaker resolved: ${winner} advances!`);
                } else toast(data.error || 'Failed to resolve tie-breaker.');
            } catch {
                toast('Failed to resolve tie-breaker.');
            }
        }

export async function resetCurrentTournament() {
            if (!confirm('Are you sure you want to end and reset this tournament?')) return;
            try {
                await fetch('/api/polls/tournament/reset', { method: 'POST' });
                setActiveTourneyData(null);
                renderTournamentStudio(null);
                toast('Tournament reset.');
            } catch {
                toast('Failed to reset tournament.');
            }
        }

export async function toggleActiveTourneyChatAnnounce() {
            if (!activeTourneyData) return;
            const nextVal = activeTourneyData.announceChat === false ? true : false;
            try {
                const res = await fetch('/api/polls/tournament/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ announceChat: nextVal, isPoll: true })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    activeTourneyData.announceChat = nextVal;
                    renderTournamentStudio(activeTourneyData);
                    toast(`Chat announcements ${nextVal ? 'enabled' : 'disabled'} for this tournament.`);
                }
            } catch {
                toast('Failed to update tournament chat announcement setting.');
            }
        }


export async function loadTournament() {
            try {
                const res = await fetch('/api/polls/tournament');
                const data = await res.json();
                setActiveTourneyData(data.tournament);
                renderTournamentStudio(activeTourneyData);
            } catch (err) {
                console.warn('Error loading tournament:', err);
            }
        }

