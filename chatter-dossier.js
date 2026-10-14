// Chatter Dossier / Community CRM Modal Component for StreamPulse
(function() {
    let dialog = null;
    let currentChatter = null;
    let saveNoteTimer = null;

    function injectStyles() {
        if (document.getElementById('chatter-dossier-styles')) return;
        const style = document.createElement('style');
        style.id = 'chatter-dossier-styles';
        style.textContent = `
            .dossier-clickable {
                cursor: pointer;
                transition: color 0.15s ease;
            }
            .dossier-clickable:hover {
                color: var(--accent) !important;
                text-decoration: underline;
            }
            #chatter-dossier-dialog {
                background: var(--bg-card, #161b22);
                border: 1px solid var(--border, #30363d);
                border-radius: 12px;
                color: var(--text, #c9d1d9);
                padding: 0;
                width: min(640px, 94vw);
                max-height: 90vh;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
                overflow: hidden;
            }
            #chatter-dossier-dialog::backdrop {
                background: rgba(0, 0, 0, 0.65);
                backdrop-filter: blur(3px);
            }
            .dossier-header {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 1.25rem 1.5rem;
                background: var(--bg-raised, #21262d);
                border-bottom: 1px solid var(--border, #30363d);
            }
            .dossier-avatar {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                object-fit: cover;
                border: 2px solid var(--border, #30363d);
                background: var(--bg-inset, #0d1117);
                flex-shrink: 0;
            }
            .dossier-user-info {
                flex: 1;
                min-width: 0;
            }
            .dossier-username-row {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .dossier-username {
                font-size: 1.25rem;
                font-weight: 700;
                color: #fff;
            }
            .dossier-sub-info {
                font-size: 0.78rem;
                color: var(--text-muted, #8b949e);
                margin-top: 3px;
            }
            .dossier-close-btn {
                background: transparent;
                border: none;
                color: var(--text-muted, #8b949e);
                font-size: 1.4rem;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 6px;
                line-height: 1;
            }
            .dossier-close-btn:hover {
                color: #fff;
                background: rgba(255, 255, 255, 0.1);
            }
            .dossier-body {
                padding: 1.25rem 1.5rem;
                overflow-y: auto;
                max-height: calc(90vh - 150px);
                display: flex;
                flex-direction: column;
                gap: 1.25rem;
            }
            .dossier-stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
                gap: 8px;
            }
            .dossier-stat-card {
                background: var(--bg-inset, #0d1117);
                border: 1px solid var(--border, #30363d);
                border-radius: 8px;
                padding: 8px 10px;
                text-align: center;
            }
            .dossier-stat-val {
                font-size: 1.15rem;
                font-weight: 700;
                color: var(--accent, #58a6ff);
            }
            .dossier-stat-lbl {
                font-size: 0.68rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: var(--text-muted, #8b949e);
                margin-top: 2px;
            }
            .dossier-section-title {
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                font-weight: 700;
                color: var(--text-muted, #8b949e);
                margin-bottom: 6px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .dossier-tags-wrap {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                align-items: center;
            }
            .dossier-tag {
                background: var(--bg-raised, #21262d);
                border: 1px solid var(--border, #30363d);
                color: var(--text, #c9d1d9);
                font-size: 0.72rem;
                padding: 2px 8px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }
            .dossier-tag-del {
                cursor: pointer;
                color: var(--text-muted, #8b949e);
                font-weight: bold;
            }
            .dossier-tag-del:hover {
                color: var(--danger, #f85149);
            }
            .dossier-add-tag-btn {
                background: transparent;
                border: 1px dashed var(--border, #30363d);
                color: var(--accent, #58a6ff);
                font-size: 0.72rem;
                padding: 2px 8px;
                border-radius: 999px;
                cursor: pointer;
            }
            .dossier-add-tag-btn:hover {
                border-color: var(--accent, #58a6ff);
            }
            .dossier-notes-textarea {
                width: 100%;
                min-height: 85px;
                background: var(--bg-inset, #0d1117);
                border: 1px solid var(--border, #30363d);
                border-radius: 6px;
                color: var(--text, #c9d1d9);
                padding: 8px 10px;
                font-family: inherit;
                font-size: 0.85rem;
                line-height: 1.45;
                resize: vertical;
                box-sizing: border-box;
            }
            .dossier-notes-textarea:focus {
                outline: none;
                border-color: var(--accent, #58a6ff);
            }
            .dossier-saved-hint {
                font-size: 0.72rem;
                color: var(--success, #3fb950);
                opacity: 0;
                transition: opacity 0.2s ease;
            }
            .dossier-saved-hint.show {
                opacity: 1;
            }
            .dossier-games-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .dossier-game-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 5px 8px;
                background: var(--bg-inset, #0d1117);
                border-radius: 6px;
                font-size: 0.8rem;
            }
            .dossier-game-name {
                font-weight: 600;
                color: #fff;
            }
            .dossier-game-meta {
                color: var(--text-muted, #8b949e);
                font-size: 0.72rem;
            }
            .dossier-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 1rem 1.5rem;
                background: var(--bg-raised, #21262d);
                border-top: 1px solid var(--border, #30363d);
            }
            .dossier-actions {
                display: flex;
                gap: 8px;
            }
            .dossier-btn {
                padding: 0.45rem 0.9rem;
                font-size: 0.82rem;
                border-radius: 6px;
                border: 1px solid var(--border, #30363d);
                background: var(--bg-card, #161b22);
                color: var(--text, #c9d1d9);
                cursor: pointer;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.15s ease;
            }
            .dossier-btn:hover {
                border-color: var(--accent, #58a6ff);
                color: #fff;
            }
            .dossier-btn.primary {
                background: var(--accent, #1f6feb);
                border-color: var(--accent, #1f6feb);
                color: #fff;
            }
            .dossier-badge {
                font-size: 0.65rem;
                padding: 1px 6px;
                border-radius: 999px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            .dossier-badge.sub {
                background: rgba(168, 85, 247, 0.2);
                border: 1px solid rgba(168, 85, 247, 0.4);
                color: #c084fc;
            }
            .dossier-badge.vip {
                background: rgba(234, 179, 8, 0.2);
                border: 1px solid rgba(234, 179, 8, 0.4);
                color: #facc15;
            }
        `;
        document.head.appendChild(style);
    }

    function createModal() {
        if (dialog) return;
        injectStyles();
        dialog = document.createElement('dialog');
        dialog.id = 'chatter-dossier-dialog';
        dialog.innerHTML = `
            <div class="dossier-header">
                <img class="dossier-avatar" id="dos-avatar" src="" alt="">
                <div class="dossier-user-info">
                    <div class="dossier-username-row">
                        <span class="dossier-username" id="dos-username">User</span>
                        <span id="dos-badges"></span>
                    </div>
                    <div class="dossier-sub-info" id="dos-sub-info">Loading info…</div>
                </div>
                <button type="button" class="dossier-close-btn" id="dos-close" title="Close">✕</button>
            </div>
            <div class="dossier-body">
                <div>
                    <div class="dossier-section-title">Lifetime Community Engagement</div>
                    <div class="dossier-stats-grid">
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-msgs">0</div>
                            <div class="dossier-stat-lbl">Messages</div>
                        </div>
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-streams">0</div>
                            <div class="dossier-stat-lbl">Streams</div>
                        </div>
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-tenure">—</div>
                            <div class="dossier-stat-lbl">Sub Tenure</div>
                        </div>
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-bits">0</div>
                            <div class="dossier-stat-lbl">Bits</div>
                        </div>
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-gifts">0</div>
                            <div class="dossier-stat-lbl">Gifts Given</div>
                        </div>
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-raids">0</div>
                            <div class="dossier-stat-lbl">Raids</div>
                        </div>
                    </div>
                </div>

                <div>
                    <div class="dossier-section-title">
                        <span>Streamer Notes (Private CRM)</span>
                        <span class="dossier-saved-hint" id="dos-saved-hint">Saved</span>
                    </div>
                    <textarea class="dossier-notes-textarea" id="dos-notes" placeholder="Write private notes about this chatter (e.g. VIP status, preferences, friendship, stream topics)..."></textarea>
                    <div style="margin-top:8px;">
                        <div class="dossier-tags-wrap" id="dos-tags-wrap"></div>
                    </div>
                </div>

                <div>
                    <div class="dossier-section-title">Favorite Games &amp; Categories Watched</div>
                    <div class="dossier-games-list" id="dos-games">
                        <div style="font-size:0.8rem;color:var(--text-muted);">None recorded yet.</div>
                    </div>
                </div>
            </div>
            <div class="dossier-footer">
                <div class="dossier-actions">
                    <button type="button" class="dossier-btn" id="dos-search-btn">🔍 Search Chat Log</button>
                    <a class="dossier-btn" id="dos-twitch-btn" href="#" target="_blank" rel="noopener">Twitch Channel ↗</a>
                </div>
                <button type="button" class="dossier-btn primary" id="dos-done-btn">Done</button>
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('dos-close').addEventListener('click', () => dialog.close());
        document.getElementById('dos-done-btn').addEventListener('click', () => dialog.close());

        document.getElementById('dos-notes').addEventListener('input', () => {
            clearTimeout(saveNoteTimer);
            saveNoteTimer = setTimeout(saveCurrentNotes, 600);
        });

        document.getElementById('dos-search-btn').addEventListener('click', () => {
            if (!currentChatter) return;
            dialog.close();
            const q = `user:${currentChatter.username}`;
            const searchInput = document.getElementById('global-search-input');
            if (searchInput && typeof window.globalSearch === 'function') {
                searchInput.value = q;
                window.globalSearch();
            } else {
                location.href = `/sessions.html?q=${encodeURIComponent(q)}`;
            }
        });
    }

    async function saveCurrentNotes() {
        if (!currentChatter) return;
        const notes = document.getElementById('dos-notes').value;
        try {
            await fetch(`/api/chatters/${encodeURIComponent(currentChatter.username)}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes, tags: currentChatter.tags })
            });
            const hint = document.getElementById('dos-saved-hint');
            hint.classList.add('show');
            setTimeout(() => hint.classList.remove('show'), 1500);
        } catch (e) {
            console.warn('[Chatter Dossier] Failed to save notes:', e);
        }
    }

    function renderTags() {
        const wrap = document.getElementById('dos-tags-wrap');
        const tags = currentChatter?.tags || [];
        wrap.innerHTML = tags.map((t, idx) => `
            <span class="dossier-tag">
                ${t}
                <span class="dossier-tag-del" data-idx="${idx}" title="Remove tag">×</span>
            </span>
        `).join('') + '<button type="button" class="dossier-add-tag-btn" id="dos-add-tag">+ Add Tag</button>';

        wrap.querySelectorAll('.dossier-tag-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                currentChatter.tags.splice(idx, 1);
                renderTags();
                saveCurrentNotes();
            });
        });

        document.getElementById('dos-add-tag').addEventListener('click', async () => {
            const tag = prompt('Enter a new community tag (e.g. Regular, Mod, Artist, VIP):');
            if (tag && tag.trim()) {
                currentChatter.tags.push(tag.trim().slice(0, 30));
                renderTags();
                saveCurrentNotes();
            }
        });
    }

    async function openChatterDossier(username) {
        if (!username) return;
        createModal();
        dialog.showModal();

        document.getElementById('dos-username').textContent = username;
        document.getElementById('dos-sub-info').textContent = 'Loading community history…';
        document.getElementById('dos-badges').innerHTML = '';
        document.getElementById('dos-avatar').src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="%238b949e" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>';

        try {
            const res = await fetch(`/api/chatters/${encodeURIComponent(username)}`);
            if (!res.ok) throw new Error('Chatter history not found');
            const data = await res.json();
            currentChatter = data;

            if (data.chatimg) {
                document.getElementById('dos-avatar').src = data.chatimg;
            }
            document.getElementById('dos-username').textContent = data.username;

            let badgesHtml = '';
            if (data.isSubscriber) {
                badgesHtml += `<span class="dossier-badge sub">${data.subMonths ? `${data.subMonths}m Sub` : 'Sub'}</span>`;
            }
            if (data.isVip || (data.tags || []).some(t => t.toLowerCase() === 'vip')) {
                badgesHtml += `<span class="dossier-badge vip">VIP</span>`;
            }
            document.getElementById('dos-badges').innerHTML = badgesHtml;

            const firstSeenStr = data.firstSeen ? new Date(data.firstSeen).toLocaleDateString() : 'Unknown';
            const lastSeenStr = data.lastSeen ? new Date(data.lastSeen).toLocaleDateString() : 'Unknown';
            document.getElementById('dos-sub-info').textContent = `First seen ${firstSeenStr} · Last active ${lastSeenStr}`;

            document.getElementById('dos-msgs').textContent = Number(data.totalMessages || 0).toLocaleString();
            document.getElementById('dos-streams').textContent = Number(data.sessionsAttended || 0).toLocaleString();
            document.getElementById('dos-tenure').textContent = data.subMonths ? `${data.subMonths} mo` : (data.isSubscriber ? 'Active' : '—');
            document.getElementById('dos-bits').textContent = Number(data.bitsTotal || 0).toLocaleString();
            document.getElementById('dos-gifts').textContent = Number(data.giftSubsTotal || 0).toLocaleString();
            document.getElementById('dos-raids').textContent = Number(data.raidsCount || 0).toLocaleString();

            document.getElementById('dos-notes').value = data.notes || '';
            renderTags();

            const gamesContainer = document.getElementById('dos-games');
            if (data.favoriteGames && data.favoriteGames.length) {
                gamesContainer.innerHTML = data.favoriteGames.map(g => `
                    <div class="dossier-game-row">
                        <span class="dossier-game-name">${g.category}</span>
                        <span class="dossier-game-meta">${g.sessions} stream${g.sessions === 1 ? '' : 's'} · ${g.messages} msgs</span>
                    </div>
                `).join('');
            } else {
                gamesContainer.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);padding:4px 0;">No category history recorded yet.</div>';
            }

            document.getElementById('dos-twitch-btn').href = `https://twitch.tv/${encodeURIComponent(data.username)}`;
        } catch (e) {
            document.getElementById('dos-sub-info').textContent = 'New chatter or no historical data found.';
        }
    }

    // Attach global click delegate
    document.addEventListener('click', e => {
        const trigger = e.target.closest('[data-chatter]');
        if (trigger) {
            e.preventDefault();
            e.stopPropagation();
            openChatterDossier(trigger.dataset.chatter);
        }
    });

    window.openChatterDossier = openChatterDossier;
})();
