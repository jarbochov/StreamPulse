/**
 * StreamPulse Poll Studio — Live Broadcast Monitor & Active Poll Controls
 */

import {
    $,
    esc,
    toast,
    activePollData,
    setActivePollData,
    selectedDuration
} from './polls-state.js';
import { updatePreview } from './polls-preview.js';

export function renderActivePollMonitor(poll) {
            const card = $('active-poll-card');
            const pollStep = poll && poll.status === 'ACTIVE' ? 'live' : (poll && poll.status === 'CLOSED' ? 'review' : 'setup');
            document.querySelectorAll('#poll-steps .bstep').forEach(el => {
                const order = ['setup', 'live', 'review'];
                el.classList.toggle('active', el.dataset.step === pollStep);
                el.classList.toggle('done', order.indexOf(el.dataset.step) < order.indexOf(pollStep));
            });
            if (!poll || poll.status !== 'ACTIVE') {
                card.style.display = 'none';
                return;
            }
            card.style.display = 'block';
            $('active-poll-title').textContent = poll.title;

            const timerBadge = $('active-timer-badge');
            if (poll.duration > 0) {
                const rem = Math.max(0, Number(poll.remainingSeconds) || 0);
                timerBadge.textContent = `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
                timerBadge.style.color = rem <= 10 ? 'var(--danger, #ef4444)' : 'var(--accent)';
            } else {
                timerBadge.textContent = 'OPEN / MANUAL';
                timerBadge.style.color = 'var(--accent)';
            }

            $('active-total-votes').textContent = `${poll.totalVotes || 0} total vote${poll.totalVotes !== 1 ? 's' : ''}`;
            const tags = [];
            if (poll.blind) tags.push('Blind');
            if (poll.settings?.keywordVoting) tags.push('Keywords');
            if (poll.settings?.subMultiplier > 1) tags.push(`Subs ${poll.settings.subMultiplier}×`);
            $('active-features-tag').textContent = tags.join(' · ');

            const list = $('active-choices-list');
            const choicesHtml = (poll.choices || []).map((c, i) => {
                const pct = Math.round(c.percent || 0);
                const isWinner = poll.winner && poll.winner === c.title;
                return `
                    <div class="live-choice-bar${isWinner ? ' winner' : ''}">
                        <div class="live-choice-header">
                            <span><b>${i + 1}.</b> ${esc(c.title)}</span>
                            <span>${poll.blind ? '??' : `${c.votes} (${pct}%)`}</span>
                        </div>
                        <div class="live-choice-track">
                            <div class="live-choice-fill" style="width: ${poll.blind ? '0%' : pct + '%'};"></div>
                        </div>
                    </div>
                `;
            }).join('');
            if (list._choicesHtml !== choicesHtml) {
                list._choicesHtml = choicesHtml;
                list.innerHTML = choicesHtml;
            }

            const addContainer = $('active-add-choice-container');
            if (addContainer) {
                addContainer.style.display = (poll.choices || []).length < 10 ? 'flex' : 'none';
            }
        }

export async function addChoiceToActivePoll(titleParam) {
    const input = $('active-add-choice-input');
    const title = (typeof titleParam === 'string' ? titleParam : input?.value || '').trim();
    if (!title) {
        toast('Please enter an option name');
        input?.focus();
        return;
    }
    try {
        const res = await fetch('/api/polls/add-choice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            setActivePollData(data.poll);
            renderActivePollMonitor(activePollData);
            updatePreview();
            if (input) input.value = '';
            toast(`Added option "${title}" to live poll!`);
        } else {
            toast(data.error || 'Failed to add option');
        }
    } catch (err) {
        toast('Server error adding option to live poll');
    }
}



        // Launch Poll
export async function launchPoll() {
            const title = $('poll-question').value.trim();
            const inputs = $('choices-container').querySelectorAll('.choice-input');
            const choices = [...inputs].map(inp => inp.value.trim()).filter(Boolean);

            if (!title) { toast('Please enter a poll question.'); return; }
            if (choices.length < 2) { toast('Please enter at least 2 choices.'); return; }

            const payload = {
                title,
                choices,
                duration: selectedDuration,
                blind: $('poll-blind').checked,
                keywordVoting: $('poll-keywords').checked,
                subMultiplier: $('poll-sub-multiplier').checked ? 2 : 1,
                announceChat: $('poll-announce-chat')?.checked !== false,
                celebration: {
                    sound: $('celebration-sound').value,
                    volume: Number($('celebration-volume').value) || 75,
                    confetti: $('celebration-confetti').checked
                }
            };

            try {
                const res = await fetch('/api/polls/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActivePollData(data.poll);
                    renderActivePollMonitor(activePollData);
                    updatePreview();
                    toast('Live poll started!');
                } else {
                    toast(data.error || 'Failed to start poll');
                }
            } catch (err) {
                toast('Server error starting poll.');
            }
        }

export async function endActivePoll() {
            try {
                const res = await fetch('/api/polls/end', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'ok') {
                    toast('Poll concluded and winner crowned!');
                    setActivePollData(null);
                    renderActivePollMonitor(null);
                    loadHistory();
                    loadTournament();
                }
            } catch (err) {
                toast('Failed to conclude poll.');
            }
        }

export async function extendActivePoll(seconds = 30) {
            try {
                const res = await fetch('/api/polls/extend', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ seconds })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    setActivePollData(data.poll);
                    renderActivePollMonitor(activePollData);
                    toast(`Extended poll by +${seconds}s!`);
                }
            } catch (err) {
                toast('Failed to extend poll.');
            }
        }

export async function cancelActivePoll() {
            if (!confirm('Are you sure you want to stop and cancel this poll?')) return;
            try {
                const res = await fetch('/api/polls/cancel', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'ok') {
                    toast('Poll cancelled.');
                    setActivePollData(null);
                    renderActivePollMonitor(null);
                    updatePreview();
                    loadTournament();
                }
            } catch (err) {
                toast('Failed to cancel poll.');
            }
        }

        // Templates Management
