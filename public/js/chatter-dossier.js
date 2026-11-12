// Chatter Dossier / Community Directory Modal Component for StreamPulse
(function() {
    let dialog = null;
    let currentChatter = null;
    let saveNoteTimer = null;
    let loadSequence = 0;

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
                position: fixed;
                inset: 0;
                margin: auto;
                background: var(--bg-card, #161b22);
                border: 1px solid var(--border, #30363d);
                border-radius: 12px;
                color: var(--text, #c9d1d9);
                padding: 0;
                width: min(640px, 94vw);
                max-height: 90vh;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75);
                overflow: hidden;
            }
            #chatter-dossier-dialog::backdrop {
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(3px);
                -webkit-backdrop-filter: blur(3px);
            }
            #chatter-dossier-dialog[open] {
                display: flex;
                flex-direction: column;
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
                min-height: 0;
                flex: 1 1 auto;
            }
            .dossier-tabs {
                display: flex;
                gap: 3px;
                margin: 12px 1.5rem 0;
                padding: 3px;
                background: var(--bg-inset, #0d1117);
                border: 1px solid var(--border, #30363d);
                border-radius: 9px;
            }
            .dossier-tab {
                flex: 1;
                min-width: 0;
                padding: 7px 10px;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: var(--text-muted, #8b949e);
                font: inherit;
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
            }
            .dossier-tab[aria-selected="true"] {
                background: var(--bg-card, #161b22);
                color: var(--accent, #58a6ff);
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            }
            .dossier-tab:focus-visible { outline: 2px solid var(--accent, #58a6ff); outline-offset: -2px; }
            .dossier-panel:not([hidden]) {
                display: flex;
                flex-direction: column;
                gap: 1.25rem;
            }
            .dossier-panel[hidden], .dossier-body[hidden] { display: none; }
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
            .dossier-insights-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 8px;
            }
            .dossier-insight {
                min-width: 0;
                padding: 8px 10px;
                background: var(--bg-inset, #0d1117);
                border: 1px solid var(--border, #30363d);
                border-radius: 8px;
                font-size: 0.8rem;
                overflow-wrap: anywhere;
            }
            .dossier-insight-label {
                color: var(--text-muted, #8b949e);
                font-size: 0.7rem;
                margin-bottom: 4px;
            }
            .dossier-insight-note {
                color: var(--text-muted, #8b949e);
                font-size: 0.75rem;
                margin-top: 8px;
            }
            .dossier-emotes {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .dossier-emote {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                min-width: 0;
                padding: 6px 9px;
                border: 1px solid var(--border, #30363d);
                border-radius: 8px;
                background: var(--bg-inset, #0d1117);
                font-size: 0.8rem;
                overflow-wrap: anywhere;
            }
            .dossier-emote img { width: 28px; height: 28px; object-fit: contain; flex-shrink: 0; }
            .dossier-emote-count { color: var(--text-muted, #8b949e); white-space: nowrap; }
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
                gap: 8px;
                flex-wrap: wrap;
            }
            .dossier-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
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
            .dossier-badge.mod {
                background: rgba(56, 139, 253, 0.2);
                border: 1px solid rgba(56, 139, 253, 0.45);
                color: #58a6ff;
            }
            @media (max-width: 540px) {
                .dossier-header { padding: 1rem; }
                .dossier-avatar { width: 44px; height: 44px; }
                .dossier-tabs { margin: 10px 1rem 0; }
                .dossier-body { padding: 1rem; }
                .dossier-footer { padding: 0.75rem 1rem; }
                .dossier-btn { padding: 0.4rem 0.65rem; }
                .dossier-insights-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
            }
        `;
        document.head.appendChild(style);
    }

    function createModal() {
        if (dialog) return;
        injectStyles();
        dialog = document.createElement('dialog');
        dialog.id = 'chatter-dossier-dialog';
        dialog.style.margin = 'auto';
        dialog.innerHTML = `
            <div class="dossier-header">
                <img class="dossier-avatar" id="dos-avatar" src="" alt="">
                <div class="dossier-user-info">
                    <div class="dossier-username-row">
                        <span class="dossier-username" id="dos-username">User</span>
                        <span class="dossier-pronouns" id="dos-header-pronouns" style="font-size:0.85rem;color:var(--text-muted);font-weight:500;"></span>
                        <span id="dos-badges"></span>
                    </div>
                    <div class="dossier-sub-info" id="dos-sub-info">Loading info…</div>
                </div>
                <button type="button" class="dossier-close-btn" id="dos-close" title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div class="dossier-tabs" role="tablist" aria-label="Dossier sections">
                <button type="button" class="dossier-tab" role="tab" id="dos-tab-overview" aria-controls="dos-panel-overview" data-dossier-tab="overview">Overview</button>
                <button type="button" class="dossier-tab" role="tab" id="dos-tab-activity" aria-controls="dos-panel-activity" data-dossier-tab="activity">Activity</button>
                <button type="button" class="dossier-tab" role="tab" id="dos-tab-notes" aria-controls="dos-panel-notes" data-dossier-tab="notes">Notes</button>
            </div>
            <div class="dossier-body" hidden>
              <div class="dossier-panel" role="tabpanel" id="dos-panel-overview" aria-labelledby="dos-tab-overview">
                <div>
                    <div class="dossier-section-title">Observed Community Engagement</div>
                    <div class="dossier-stats-grid">
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-msgs">0</div>
                            <div class="dossier-stat-lbl">Messages</div>
                        </div>
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-streams">0</div>
                            <div class="dossier-stat-lbl">Chat Days</div>
                        </div>
                        <div class="dossier-stat-card">
                            <div class="dossier-stat-val" id="dos-tenure">—</div>
                            <div class="dossier-stat-lbl">Observed Sub Months</div>
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
                <div id="dos-follow-section" hidden>
                    <div class="dossier-section-title">Twitch Following</div>
                    <div class="dossier-insight" id="dos-follow-value"></div>
                    <div class="dossier-insight-note">Based on the latest follower sync; refollows can change this date.</div>
                </div>
              </div>

              <div class="dossier-panel" role="tabpanel" id="dos-panel-activity" aria-labelledby="dos-tab-activity" hidden>
                <div id="dos-community-section">
                    <div class="dossier-section-title">Community Insights</div>
                    <div class="dossier-insights-grid" id="dos-community-grid"></div>
                    <div class="dossier-insight-note" id="dos-community-note"></div>
                </div>
                <div id="dos-emotes-section" hidden>
                    <div class="dossier-section-title">Most-used Emotes</div>
                    <div class="dossier-emotes" id="dos-emotes"></div>
                </div>
                <div>
                    <div class="dossier-section-title">Favorite Games &amp; Categories Watched</div>
                    <div class="dossier-games-list" id="dos-games">
                        <div style="font-size:0.8rem;color:var(--text-muted);">None recorded yet.</div>
                    </div>
                </div>
              </div>

              <div class="dossier-panel" role="tabpanel" id="dos-panel-notes" aria-labelledby="dos-tab-notes" hidden>
                <div>
                    <div class="dossier-section-title">
                        <span>Streamer Notes &amp; Info (Private)</span>
                        <span class="dossier-saved-hint" id="dos-saved-hint">Saved</span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                        <label for="dos-pronouns" style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Pronouns:</label>
                        <input type="text" id="dos-pronouns" placeholder="e.g. they/them, she/her, he/him" style="background:var(--bg-inset,#0d1117);border:1px solid var(--border,#30363d);border-radius:5px;padding:3px 8px;font-size:0.8rem;color:var(--text,#c9d1d9);width:200px;">
                    </div>
                    <textarea class="dossier-notes-textarea" id="dos-notes" placeholder="Write private notes about this member (e.g. VIP status, preferences, friendship, stream topics)..."></textarea>
                    <div style="margin-top:8px;">
                        <div class="dossier-tags-wrap" id="dos-tags-wrap"></div>
                    </div>
                </div>
              </div>
            </div>
            <div class="dossier-footer">
                <div class="dossier-actions">
                    <button type="button" class="dossier-btn" id="dos-search-btn">Search Chat Log</button>
                    <a class="dossier-btn" id="dos-twitch-btn" href="#" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.3rem;">Twitch Channel <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
                    <a class="dossier-btn" id="dos-viewercard-btn" href="#" target="_blank" rel="noopener" title="Open Twitch Viewer Card Popout" style="display:inline-flex;align-items:center;gap:0.3rem;">Viewer Card <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
                </div>
                <button type="button" class="dossier-btn primary" id="dos-done-btn">Done</button>
            </div>
        `;
        document.body.appendChild(dialog);

        const tabs = [...dialog.querySelectorAll('[data-dossier-tab]')];
        const selectTab = (name, focus = false) => {
            if (!tabs.some(tab => tab.dataset.dossierTab === name)) name = 'overview';
            for (const tab of tabs) {
                const selected = tab.dataset.dossierTab === name;
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
                document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
                if (selected && focus) tab.focus();
            }
            dialog.querySelector('.dossier-body').scrollTop = 0;
            try { localStorage.setItem('chatterDossierTab', name); } catch {}
        };
        let savedTab = 'overview';
        try { savedTab = localStorage.getItem('chatterDossierTab') || savedTab; } catch {}
        selectTab(savedTab);
        for (const tab of tabs) {
            tab.addEventListener('click', () => selectTab(tab.dataset.dossierTab));
            tab.addEventListener('keydown', event => {
                const index = tabs.indexOf(tab);
                let next;
                if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = tabs.length - 1;
                else return;
                event.preventDefault();
                selectTab(tabs[next].dataset.dossierTab, true);
            });
        }
        dialog.addEventListener('close', () => {
            if (saveNoteTimer) {
                clearTimeout(saveNoteTimer);
                saveNoteTimer = null;
                void saveCurrentNotes();
            }
            window.dispatchEvent(new CustomEvent('chatter-dossier-closed', { detail: { chatter: currentChatter } }));
        });
        document.getElementById('dos-close').addEventListener('click', () => dialog.close());
        document.getElementById('dos-done-btn').addEventListener('click', () => dialog.close());

        document.getElementById('dos-notes').addEventListener('input', () => {
            clearTimeout(saveNoteTimer);
            saveNoteTimer = setTimeout(saveCurrentNotes, 600);
        });

        document.getElementById('dos-pronouns').addEventListener('input', () => {
            clearTimeout(saveNoteTimer);
            const val = document.getElementById('dos-pronouns').value.trim();
            document.getElementById('dos-header-pronouns').textContent = val ? `(${val})` : '';
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
        clearTimeout(saveNoteTimer);
        saveNoteTimer = null;
        const chatter = currentChatter;
        const notes = document.getElementById('dos-notes').value;
        const pronouns = document.getElementById('dos-pronouns').value.trim();
        const tags = [...chatter.tags];
        try {
            const response = await fetch(`/api/chatters/${encodeURIComponent(chatter.username)}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes, pronouns, tags })
            });
            if (!response.ok) throw new Error('Unable to save notes');
            if (currentChatter === chatter) {
                const hint = document.getElementById('dos-saved-hint');
                hint.classList.add('show');
                setTimeout(() => hint.classList.remove('show'), 1500);
            }
            window.dispatchEvent(new CustomEvent('chatter-updated', { detail: { username: chatter.username, notes, pronouns, tags } }));
        } catch (e) {
            console.warn('[Chatter Dossier] Failed to save notes:', e);
        }
    }

    function renderTags() {
        const wrap = document.getElementById('dos-tags-wrap');
        const tags = currentChatter?.tags || [];
        wrap.replaceChildren();
        tags.forEach((tag, idx) => {
            const chip = document.createElement('span');
            chip.className = 'dossier-tag';
            chip.append(document.createTextNode(tag));
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dossier-tag-del';
            btn.style.cssText = 'background:none;border:0;padding:0;font:inherit;';
            btn.setAttribute('aria-label', `Remove ${tag} tag`);
            btn.textContent = '×';
            btn.addEventListener('click', () => {
                currentChatter.tags.splice(idx, 1);
                renderTags();
                void saveCurrentNotes();
            });
            chip.appendChild(btn);
            wrap.appendChild(chip);
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'dossier-add-tag-btn';
        add.textContent = '+ Add Tag';
        wrap.appendChild(add);
        add.addEventListener('click', () => {
            const tag = prompt('Enter a custom tag for this member (e.g. Artist, Collab, Friend, Speedrunner):');
            if (tag && tag.trim()) {
                currentChatter.tags.push(tag.trim().slice(0, 30));
                renderTags();
                void saveCurrentNotes();
            }
        });
    }

    async function openChatterDossier(username) {
        if (!username) return;
        createModal();
        if (saveNoteTimer) {
            clearTimeout(saveNoteTimer);
            saveNoteTimer = null;
            void saveCurrentNotes();
        }
        const sequence = ++loadSequence;
        currentChatter = null;
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.dossier-body').hidden = true;

        document.getElementById('dos-username').textContent = username;
        document.getElementById('dos-sub-info').textContent = 'Loading community history…';
        document.getElementById('dos-badges').innerHTML = '';
        document.getElementById('dos-header-pronouns').textContent = '';
        document.getElementById('dos-avatar').src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="%238b949e" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>';

        try {
            const res = await fetch(`/api/chatters/${encodeURIComponent(username)}`);
            if (!res.ok) throw new Error('Chatter history not found');
            const data = await res.json();
            if (sequence !== loadSequence || !dialog.open) return;
            data.tags = Array.isArray(data.tags) ? data.tags : [];
            currentChatter = data;

            if (data.chatimg) {
                document.getElementById('dos-avatar').src = data.chatimg;
            }
            document.getElementById('dos-username').textContent = data.username;
            document.getElementById('dos-header-pronouns').textContent = data.pronouns ? `(${data.pronouns})` : '';

            let badgesHtml = '';
            if (data.isMod || (data.tags || []).some(t => t.toLowerCase() === 'mod')) {
                badgesHtml += `<span class="dossier-badge mod">Mod</span>`;
            }
            if (data.isVip || (data.tags || []).some(t => t.toLowerCase() === 'vip')) {
                badgesHtml += `<span class="dossier-badge vip">VIP</span>`;
            }
            if (data.isSubscriber) {
                badgesHtml += `<span class="dossier-badge sub">${data.subMonths ? `${data.subMonths}m observed` : 'Sub observed'}</span>`;
            }
            document.getElementById('dos-badges').innerHTML = badgesHtml;

            const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString() : 'Unknown';
            const firstSeenStr = date(data.firstSeen);
            const lastSeenStr = date(data.lastSeen);
            document.getElementById('dos-sub-info').textContent = `First observed ${firstSeenStr} · Last observed ${lastSeenStr}`;

            document.getElementById('dos-msgs').textContent = Number(data.totalMessages || 0).toLocaleString();
            document.getElementById('dos-streams').textContent = Number(data.sessionsAttended || 0).toLocaleString();
            document.getElementById('dos-tenure').textContent = data.subMonths ? `${data.subMonths} mo` : '—';
            document.getElementById('dos-bits').textContent = Number(data.bitsTotal || 0).toLocaleString();
            document.getElementById('dos-gifts').textContent = Number(data.giftSubsTotal || 0).toLocaleString();
            document.getElementById('dos-raids').textContent = Number(data.raidsCount || 0).toLocaleString();

            const grid = document.getElementById('dos-community-grid');
            const note = document.getElementById('dos-community-note');
            const followSection = document.getElementById('dos-follow-section');
            const emoteSection = document.getElementById('dos-emotes-section');
            grid.replaceChildren();
            followSection.hidden = true;
            emoteSection.hidden = true;
            if (data.community) {
                const addInsight = (label, value) => {
                    const card = document.createElement('div');
                    card.className = 'dossier-insight';
                    const heading = document.createElement('div');
                    heading.className = 'dossier-insight-label';
                    heading.textContent = label;
                    const content = document.createElement('div');
                    content.textContent = value;
                    card.append(heading, content);
                    grid.appendChild(card);
                };
                const follow = data.community.follow;
                followSection.hidden = String(data.type || 'twitch').toLowerCase() !== 'twitch';
                document.getElementById('dos-follow-value').textContent = follow
                    ? `Following since ${date(follow.followedAt)} · ${follow.syncedAt ? `synced ${date(follow.syncedAt)}` : 'sync date unknown'}`
                    : 'Following date unavailable from the last Twitch follower sync.';
                const insights = data.community.insights;
                if (insights) {
                    const favorites = list => list.length ? list.map(item => `${item.name} (${item.count})`).join(', ') : 'None observed';
                    addInsight('Recorded streams chatted in', `≈ ${insights.streams}`);
                    addInsight('Consecutive recorded streams', `≈ ${insights.streak}`);
                    addInsight('First observed hashtag uses', String(insights.hashtagsStarted));
                    addInsight('Favorite hashtags', favorites(insights.hashtags));
                    emoteSection.hidden = false;
                    const emotes = document.getElementById('dos-emotes');
                    emotes.replaceChildren();
                    for (const item of insights.emotes || []) {
                        const chip = document.createElement('div');
                        chip.className = 'dossier-emote';
                        try {
                            const url = new URL(item.imageUrl);
                            if (url.protocol === 'https:' && !url.username && !url.password) {
                                const image = document.createElement('img');
                                image.alt = '';
                                image.loading = 'lazy';
                                image.decoding = 'async';
                                image.referrerPolicy = 'no-referrer';
                                image.addEventListener('error', () => image.remove(), { once: true });
                                image.src = url.href;
                                chip.appendChild(image);
                            }
                        } catch {}
                        const name = document.createElement('span');
                        name.textContent = item.name;
                        const count = document.createElement('span');
                        count.className = 'dossier-emote-count';
                        count.textContent = `× ${Number(item.count || 0).toLocaleString()}`;
                        chip.append(name, count);
                        emotes.appendChild(chip);
                    }
                    if (!emotes.childElementCount) emotes.textContent = 'None observed.';
                    if (insights.lastReturn) {
                        addInsight('Last return', `${date(insights.lastReturn.at)} after ${insights.lastReturn.absenceDays} days`);
                    }
                    note.textContent = 'Based on retained and newly observed activity; logs and emote markup may be incomplete. Attendance and streaks are approximate. Names may be shared across platforms.';
                } else {
                    const status = data.community.status;
                    note.textContent = status.phase === 'error'
                        ? `Historical indexing failed: ${status.error}. It will retry automatically.`
                        : `Indexing retained chat history (${status.progress?.completed || 0}/${status.progress?.total || 0} files). Reopen this dossier to refresh.`;
                }
            } else {
                note.textContent = 'Enable Community insights in Config Editor to see hashtags, emotes and recorded stream activity.';
            }

            document.getElementById('dos-notes').value = data.notes || '';
            document.getElementById('dos-pronouns').value = data.pronouns || '';
            renderTags();

            const gamesContainer = document.getElementById('dos-games');
            gamesContainer.replaceChildren();
            if (data.favoriteGames && data.favoriteGames.length) {
                for (const game of data.favoriteGames) {
                    const row = document.createElement('div');
                    row.className = 'dossier-game-row';
                    const name = document.createElement('span');
                    name.className = 'dossier-game-name';
                    name.textContent = game.category;
                    const meta = document.createElement('span');
                    meta.className = 'dossier-game-meta';
                    meta.textContent = `${game.sessions} stream${game.sessions === 1 ? '' : 's'} · ${game.messages} msgs`;
                    row.append(name, meta);
                    gamesContainer.appendChild(row);
                }
            } else {
                gamesContainer.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);padding:4px 0;">No category history recorded yet.</div>';
            }

            document.getElementById('dos-twitch-btn').href = `https://twitch.tv/${encodeURIComponent(data.username)}`;
            const broadcaster = data.broadcaster || 'jarbochov';
            const viewerCardBtn = document.getElementById('dos-viewercard-btn');
            if (viewerCardBtn) {
                viewerCardBtn.href = `https://www.twitch.tv/popout/${encodeURIComponent(broadcaster)}/viewercard/${encodeURIComponent(data.username)}?popout=`;
                viewerCardBtn.onclick = (e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                        e.preventDefault();
                        const w = 420, h = 680;
                        const left = Math.max(0, Math.round((window.screen.width - w) / 2));
                        const top = Math.max(0, Math.round((window.screen.height - h) / 2));
                        window.open(viewerCardBtn.href, `twitch_viewercard_${encodeURIComponent(data.username)}`, `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);
                    }
                };
            }
            dialog.querySelector('.dossier-body').hidden = false;
        } catch (e) {
            if (sequence === loadSequence && dialog.open) document.getElementById('dos-sub-info').textContent = 'New chatter or no historical data found.';
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
