// StreamPulse — Shared Tournament Overlay Engine
// Powers both Versus Tournament (/tournament.html) and Poll Tournament (/poll-tournament.html) overlays.
(function(window) {
    'use strict';

    function esc(str) {
        return String(str || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // Sample 1: Esports / Fighting Game / Versus Tournament (Default for Versus Studio)
    const SAMPLE_VERSUS_TOURNAMENT = {
        id: 'sample-versus-tourney',
        title: 'Retro Community Championship',
        format: 'single',
        bracketSize: 8,
        roundCount: 3,
        progressionMode: 'manual',
        bestOf: 3,
        roundsBestOf: 3,
        targetScore: 2,
        status: 'IN_PROGRESS',
        activeMatchId: 'm_2_1',
        matches: [
            // Round 1
            { id: 'm_1_1', round: 1, roundName: 'Quarterfinals', entrant1: { name: 'Chrono Trigger', tag: 'Square', seed: 1, score: 2, rounds: 0 }, entrant2: { name: 'Secret of Mana', tag: 'Square', seed: 8, score: 0, rounds: 0 }, scores: [2, 0], status: 'COMPLETED', winner: 'Chrono Trigger', bestOf: 3, targetScore: 2 },
            { id: 'm_1_2', round: 1, roundName: 'Quarterfinals', entrant1: { name: 'EarthBound', tag: 'Ape', seed: 4, score: 2, rounds: 0 }, entrant2: { name: 'Super Mario RPG', tag: 'Square', seed: 5, score: 1, rounds: 0 }, scores: [2, 1], status: 'COMPLETED', winner: 'EarthBound', bestOf: 3, targetScore: 2 },
            { id: 'm_1_3', round: 1, roundName: 'Quarterfinals', entrant1: { name: 'Final Fantasy VI', tag: 'Square', seed: 2, score: 2, rounds: 0 }, entrant2: { name: 'Breath of Fire II', tag: 'Capcom', seed: 7, score: 0, rounds: 0 }, scores: [2, 0], status: 'COMPLETED', winner: 'Final Fantasy VI', bestOf: 3, targetScore: 2 },
            { id: 'm_1_4', round: 1, roundName: 'Quarterfinals', entrant1: { name: 'Lufia II', tag: 'Neverland', seed: 3, score: 2, rounds: 0 }, entrant2: { name: 'Dragon Quest V', tag: 'Chunsoft', seed: 6, score: 1, rounds: 0 }, scores: [2, 1], status: 'COMPLETED', winner: 'Lufia II', bestOf: 3, targetScore: 2 },
            // Round 2 (Semifinals)
            { id: 'm_2_1', round: 2, roundName: 'Semifinals', entrant1: { name: 'Chrono Trigger', tag: 'Square', seed: 1, score: 1, rounds: 1 }, entrant2: { name: 'EarthBound', tag: 'Ape', seed: 4, score: 1, rounds: 0 }, scores: [1, 1], status: 'ACTIVE', matchDetails: 'Game 3 · Decider', bestOf: 3, targetScore: 2, roundsBestOf: 3 },
            { id: 'm_2_2', round: 2, roundName: 'Semifinals', entrant1: { name: 'Final Fantasy VI', tag: 'Square', seed: 2, score: 0, rounds: 0 }, entrant2: { name: 'Lufia II', tag: 'Neverland', seed: 3, score: 0, rounds: 0 }, scores: [0, 0], status: 'PENDING', bestOf: 3, targetScore: 2 },
            // Finals
            { id: 'm_3_1', round: 3, roundName: 'Grand Finals', entrant1: { name: 'TBD', seed: 0, score: 0, rounds: 0 }, entrant2: { name: 'TBD', seed: 0, score: 0, rounds: 0 }, scores: [0, 0], status: 'PENDING', bestOf: 3, targetScore: 2 }
        ]
    };

    // Sample 2: Audience Chat Poll Tournament (Default for Poll Manager)
    const SAMPLE_POLL_TOURNAMENT = {
        id: 'sample-poll-tourney',
        title: 'Audience Choice Showdown',
        format: 'single',
        bracketSize: 8,
        roundCount: 3,
        progressionMode: 'vote',
        bestOf: 0,
        roundsBestOf: 0,
        targetScore: 0,
        status: 'IN_PROGRESS',
        activeMatchId: 'm_2_1',
        matches: [
            // Round 1
            { id: 'm_1_1', round: 1, roundName: 'Quarterfinals', entrant1: { name: 'Chrono Trigger', tag: 'SNES', seed: 1, votes: 142, percent: 68 }, entrant2: { name: 'Secret of Mana', tag: 'SNES', seed: 8, votes: 67, percent: 32 }, status: 'COMPLETED', winner: 'Chrono Trigger' },
            { id: 'm_1_2', round: 1, roundName: 'Quarterfinals', entrant1: { name: 'EarthBound', tag: 'SNES', seed: 4, votes: 118, percent: 56 }, entrant2: { name: 'Super Mario RPG', tag: 'SNES', seed: 5, votes: 92, percent: 44 }, status: 'COMPLETED', winner: 'EarthBound' },
            { id: 'm_1_3', round: 1, roundName: 'Quarterfinals', entrant1: { name: 'Final Fantasy VI', tag: 'SNES', seed: 2, votes: 155, percent: 74 }, entrant2: { name: 'Breath of Fire II', tag: 'SNES', seed: 7, votes: 54, percent: 26 }, status: 'COMPLETED', winner: 'Final Fantasy VI' },
            { id: 'm_1_4', round: 1, roundName: 'Quarterfinals', entrant1: { name: 'Lufia II', tag: 'SNES', seed: 3, votes: 109, percent: 53 }, entrant2: { name: 'Dragon Quest V', tag: 'SFC', seed: 6, votes: 96, percent: 47 }, status: 'COMPLETED', winner: 'Lufia II' },
            // Round 2 (Semifinals)
            { id: 'm_2_1', round: 2, roundName: 'Semifinals', entrant1: { name: 'Chrono Trigger', tag: 'SNES', seed: 1, votes: 94, percent: 58 }, entrant2: { name: 'EarthBound', tag: 'SNES', seed: 4, votes: 68, percent: 42 }, status: 'ACTIVE', matchDetails: 'Chat Voting Live' },
            { id: 'm_2_2', round: 2, roundName: 'Semifinals', entrant1: { name: 'Final Fantasy VI', tag: 'SNES', seed: 2, votes: 0, percent: 0 }, entrant2: { name: 'Lufia II', tag: 'SNES', seed: 3, votes: 0, percent: 0 }, status: 'PENDING' },
            // Finals
            { id: 'm_3_1', round: 3, roundName: 'Grand Finals', entrant1: { name: 'TBD', seed: 0, votes: 0, percent: 0 }, entrant2: { name: 'TBD', seed: 0, votes: 0, percent: 0 }, status: 'PENDING' }
        ]
    };

    // Sample 3: Round Robin League
    const SAMPLE_RR_TOURNAMENT = {
        id: 'sample-rr-tourney',
        title: 'Community Championship League',
        format: 'roundRobin',
        bracketSize: 4,
        roundCount: 3,
        progressionMode: 'manual',
        bestOf: 3,
        targetScore: 2,
        status: 'IN_PROGRESS',
        activeMatchId: 'rr_2_1',
        standings: [
            { name: 'Daigo', tag: 'Ken', seed: 1, played: 2, won: 2, lost: 0, draws: 0, scoreFor: 4, scoreAgainst: 1, diff: 3, points: 6 },
            { name: 'Punk', tag: 'Cammy', seed: 2, played: 2, won: 1, lost: 1, draws: 0, scoreFor: 3, scoreAgainst: 2, diff: 1, points: 3 },
            { name: 'Tokido', tag: 'Akuma', seed: 3, played: 2, won: 1, lost: 1, draws: 0, scoreFor: 2, scoreAgainst: 3, diff: -1, points: 3 },
            { name: 'MenaRD', tag: 'Blanka', seed: 4, played: 2, won: 0, lost: 2, draws: 0, scoreFor: 1, scoreAgainst: 4, diff: -3, points: 0 }
        ],
        matches: [
            { id: 'rr_1_1', round: 1, roundName: 'Round 1', entrant1: { name: 'Daigo', tag: 'Ken', seed: 1, score: 2 }, entrant2: { name: 'Punk', tag: 'Cammy', seed: 2, score: 1 }, scores: [2, 1], status: 'COMPLETED', winner: 'Daigo' },
            { id: 'rr_1_2', round: 1, roundName: 'Round 1', entrant1: { name: 'Tokido', tag: 'Akuma', seed: 3, score: 2 }, entrant2: { name: 'MenaRD', tag: 'Blanka', seed: 4, score: 0 }, scores: [2, 0], status: 'COMPLETED', winner: 'Tokido' },
            { id: 'rr_2_1', round: 2, roundName: 'Round 2', entrant1: { name: 'Daigo', tag: 'Ken', seed: 1, score: 1 }, entrant2: { name: 'Tokido', tag: 'Akuma', seed: 3, score: 0 }, scores: [1, 0], status: 'ACTIVE' },
            { id: 'rr_2_2', round: 2, roundName: 'Round 2', entrant1: { name: 'Punk', tag: 'Cammy', seed: 2, score: 2 }, entrant2: { name: 'MenaRD', tag: 'Blanka', seed: 4, score: 1 }, scores: [2, 1], status: 'COMPLETED', winner: 'Punk' }
        ]
    };

    function initTournamentOverlay(config = {}) {
        const params = (typeof overlayParams === 'function') ? overlayParams() : new URLSearchParams(window.location.search);
        const stage = document.getElementById('stage');
        const container = document.getElementById('tournament-container');
        const confettiCanvas = document.getElementById('confetti-canvas');
        let currentTournament = null;
        let lastCelebratedChampion = null;

        // Overlay Identity & Mode
        const paramSource = (params.get('source') || '').toLowerCase();
        const isPollMode = paramSource === 'poll' || paramSource === 'polls' || (config.overlayType === 'poll' && paramSource !== 'versus' && paramSource !== 'tournament');
        const tourneyEndpoint = isPollMode ? '/api/polls/tournament' : (config.defaultEndpoint || '/api/tournament');
        const tourneyWsEvent = isPollMode ? 'poll-tournament-update' : (config.defaultWsEvent || 'tournament-update');
        const tourneySourceKey = isPollMode ? 'tournament-poll' : (config.overlaySourceKey || 'tournament');

        const forceSample = params.get('sample') === '1';
        const isPreview = params.get('preview') === '1' || params.get('sample') === '1';
        const layoutMode = (params.get('layout') || params.get('mode') || 'tree').toLowerCase(); // 'tree' | 'active' | 'hud' | 'compact'
        const showScoresParam = params.get('showscores') !== '0' && params.get('scores') !== '0';
        const showTitle = params.get('showtitle') !== '0' && params.get('title') !== '0' && params.get('header') !== '0';
        const showLogo = params.get('showlogo') !== '0' && params.get('logo') !== '0';
        const paramLogo = (params.get('logo') && params.get('logo') !== '0' && params.get('logo') !== '1') ? params.get('logo').trim() : '';
        const paramLogoSize = (params.get('logosize') || '').trim();
        const showMeta = params.get('showmeta') !== '0' && params.get('meta') !== '0';
        const showFormat = params.get('showformat') !== '0' && params.get('format') !== '0';
        const showMode = params.get('showmode') !== '0' && params.get('mode') !== '0';
        const showEntrants = params.get('showentrants') !== '0' && params.get('entrants') !== '0' && params.get('participants') !== '0';
        const showStatus = params.get('showstatus') !== '0' && params.get('status') !== '0';
        const showRounds = params.get('showrounds') !== '0' && params.get('roundheaders') !== '0' && params.get('roundheaders') !== 'none';
        const showSeeds = params.get('showseeds') !== '0' && params.get('seeds') !== '0';
        const showTags = params.get('showtags') !== '0' && params.get('tags') !== '0';
        const showBadges = params.get('showbadges') !== '0' && params.get('badges') !== '0' && params.get('badge') !== '0';
        const showHighlight = params.get('highlight') !== '0' && params.get('showlive') !== '0' && params.get('highlightlive') !== '0';
        const showCenter = params.get('center') !== '0' && params.get('showcenter') !== '0' && params.get('vs') !== '0';
        const customGap = (params.get('gap') || params.get('centerspace') || '').trim().toLowerCase();
        const showRoundPips = !isPollMode && params.get('roundpips') !== '0' && params.get('rounds') !== '0' && params.get('showroundpips') !== '0';
        const pipStyle = (params.get('pipstyle') || params.get('pips_style') || 'circle').toLowerCase();
        const roundPipStyle = (params.get('roundpipstyle') || params.get('round_pipstyle') || 'diamond').toLowerCase();
        const showChampion = params.get('champion') !== '0' && params.get('showchampion') !== '0';
        const showStandings = params.get('showstandings') !== '0' && params.get('standings') !== '0';
        const showMatches = params.get('showmatches') !== '0' && params.get('matches') !== '0';
        const showLines = params.get('lines') !== 'none' && params.get('showlines') !== '0';
        const enableConfetti = params.get('confetti') === '1' || params.get('confetti') === 'true';
        window.enableConfetti = enableConfetti;
        const scaleVal = parseFloat(params.get('scale') || params.get('fontscale') || '1');
        const customAccent = params.get('accent');
        const customWinner = params.get('winner');
        const customBadgeColor = params.get('badgecolor') || params.get('centerbadge') || params.get('badge_color');
        const cardWidthParam = (params.get('cardwidth') || params.get('roundwidth') || params.get('matchwidth') || '').trim();
        const isWide = params.get('wide') === '1' || params.get('wide') === 'true';

        if (!showCenter) {
            document.body.classList.add('no-center-badge');
        }
        if (customGap && customGap !== '0' && customGap !== 'none' && customGap !== 'auto') {
            const gapCss = (customGap === 'intact' || customGap === 'keep') ? '160px' : (/^\d+$/.test(customGap) ? `${customGap}px` : customGap);
            document.documentElement.style.setProperty('--tourney-center-gap', gapCss);
            document.body.classList.add('has-center-gap');
        }

        if (cardWidthParam) {
            const cardWidthCss = /^\d+$/.test(cardWidthParam) ? `${cardWidthParam}px` : cardWidthParam;
            document.documentElement.style.setProperty('--round-min-width', cardWidthCss);
            document.documentElement.style.setProperty('--round-max-width', cardWidthCss);
        } else if (isWide) {
            document.documentElement.style.setProperty('--round-min-width', '280px');
            document.documentElement.style.setProperty('--round-max-width', 'clamp(440px, 36vw, 680px)');
        }

        if (scaleVal && Number.isFinite(scaleVal) && scaleVal > 0) {
            document.documentElement.style.setProperty('--tourney-scale', scaleVal);
        }
        if (!showRounds) document.body.classList.add('roundheaders-hidden');
        if (customAccent) document.documentElement.style.setProperty('--tourney-accent', customAccent);
        if (customWinner) document.documentElement.style.setProperty('--tourney-winner', customWinner);
        if (customBadgeColor) {
            document.documentElement.style.setProperty('--tourney-badge-bg', customBadgeColor);
            document.documentElement.style.setProperty('--tourney-badge-color', '#0d1117');
        }

        function applyStyling() {
            let overlayVal = (params.get('overlay') || params.get('theme') || '').trim();
            const bgVal = (params.get('bg') || '').trim();
            const hashVal = (window.location.hash || '').replace(/^#/, '').trim();

            if (!overlayVal && hashVal && !hashVal.includes('=')) {
                overlayVal = hashVal;
            }

            if (overlayVal === 'glass') document.body.classList.add('theme-glass');
            else if (overlayVal === 'solid') document.body.classList.add('theme-solid');
            else if (overlayVal === 'transparent' || overlayVal === 'clean' || overlayVal === 'none') document.body.classList.add('theme-transparent');
            else if (overlayVal === 'pill') document.body.classList.add('theme-pill');
            else if (overlayVal === 'neon') document.body.classList.add('theme-neon');
            else if (overlayVal === 'retro') document.body.classList.add('theme-retro');
            else if (overlayVal === 'championship' || overlayVal === 'gold') document.body.classList.add('theme-championship');
            else if (overlayVal === 'cyber' || overlayVal === 'cyberpunk') document.body.classList.add('theme-cyber');
            else if (overlayVal === 'fgc-evo' || overlayVal === 'evo') document.body.classList.add('theme-fgc-evo');
            else if (overlayVal === 'clean-light' || overlayVal === 'light') document.body.classList.add('theme-clean-light');
            else if (overlayVal === 'minimal-dark' || overlayVal === 'dark') document.body.classList.add('theme-minimal-dark');
            else if (overlayVal === 'ember') document.body.classList.add('theme-ember');
            else if (overlayVal === 'aurora') document.body.classList.add('theme-aurora');
            else if (overlayVal === 'ocean') document.body.classList.add('theme-ocean');
            else if (overlayVal === 'sunset') document.body.classList.add('theme-sunset');
            else if (overlayVal === 'violet') document.body.classList.add('theme-violet');
            else if (overlayVal === 'forest') document.body.classList.add('theme-forest');
            else if (overlayVal === 'border') document.body.classList.add('theme-border');

            const spacing = (params.get('spacing') || 'normal').toLowerCase();
            if (spacing === 'compact') document.body.classList.add('spacing-compact');
            else if (spacing === 'spacious') document.body.classList.add('spacing-spacious');

            const lines = (params.get('lines') || 'glow').toLowerCase();
            if (lines) document.body.classList.add('lines-' + lines);

            const rh = (params.get('roundheaders') || '').toLowerCase();
            if (rh) document.body.classList.add('roundheaders-' + rh);

            const col = bgVal || overlayVal;
            if (col) {
                let clean = col;
                if (/^[0-9a-fA-F]{3,8}$/.test(clean)) clean = '#' + clean;
                if (/^#[0-9a-fA-F]{3,8}$/.test(clean) || /^rgba?\(.+\)$/.test(clean) || /^[a-zA-Z]{3,20}$/.test(clean)) {
                    document.documentElement.style.setProperty('--tourney-bg', clean);
                }
            }
        }
        applyStyling();

        function getFallbackSample() {
            if (isPollMode) return SAMPLE_POLL_TOURNAMENT;
            if (layoutMode === 'roundrobin' || layoutMode === 'rr' || params.get('format') === 'roundRobin') {
                return SAMPLE_RR_TOURNAMENT;
            }
            return SAMPLE_VERSUS_TOURNAMENT;
        }

        function renderTournament(tournament) {
            if (!tournament || !Array.isArray(tournament.matches)) {
                if (isPreview) {
                    tournament = getFallbackSample();
                } else {
                    const emptyTitle = isPollMode ? 'No active audience bracket' : 'No active tournament bracket';
                    const emptyHint = isPollMode ? 'Open Poll Manager to launch a tournament' : 'Open Versus Studio to launch a tournament';
                    container.innerHTML = `
                        <div class="empty-placeholder">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin-bottom: 0.6rem; opacity: 0.6;"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
                            <p>${esc(emptyTitle)}</p>
                            <span style="font-size: 0.8rem; opacity: 0.7;">${esc(emptyHint)}</span>
                        </div>
                    `;
                    return;
                }
            }

            currentTournament = tournament;

            // Trigger Champion celebration once
            if (tournament.status === 'COMPLETED' && tournament.champion && lastCelebratedChampion !== tournament.champion) {
                lastCelebratedChampion = tournament.champion;
                if (enableConfetti) burstConfetti();
            }

            // Check layout mode: HUD / Active match vs Bracket Tree
            if (layoutMode === 'active' || layoutMode === 'hud' || layoutMode === 'match') {
                renderActiveMatchHud(tournament);
            } else if (tournament.format === 'roundRobin' || layoutMode === 'roundrobin' || layoutMode === 'rr') {
                renderRoundRobinView(tournament);
            } else {
                renderBracketTree(tournament);
            }
            adjustScaleAndFit();
        }

        function adjustScaleAndFit() {
            if (layoutMode === 'active' || layoutMode === 'hud' || layoutMode === 'match') {
                stage.style.transform = '';
                return;
            }
            const autoFit = params.get('fit') === '1' || params.get('autoscale') === '1' || params.get('fit') === 'all';
            if (autoFit) {
                stage.style.transform = '';
                stage.style.width = 'max-content';
                stage.style.maxWidth = 'none';
                const winW = window.innerWidth;
                const winH = window.innerHeight;
                const stageW = stage.scrollWidth || stage.offsetWidth;
                const stageH = stage.scrollHeight || stage.offsetHeight;
                if (stageW > 0 && stageH > 0) {
                    const pad = 24;
                    const scale = Math.min(1, (winW - pad) / stageW, (winH - pad) / stageH);
                    stage.style.transform = `scale(${scale})`;
                    stage.style.transformOrigin = 'center center';
                }
            } else if (scaleVal && Number.isFinite(scaleVal) && scaleVal > 0 && scaleVal !== 1) {
                stage.style.transform = `scale(${scaleVal})`;
                stage.style.transformOrigin = 'center center';
            }
            requestAnimationFrame(drawBracketConnectors);
        }
        window.addEventListener('resize', () => {
            adjustScaleAndFit();
            drawBracketConnectors();
        });

        // Render Active Match HUD
        function renderActiveMatchHud(tournament) {
            const matches = tournament.matches || [];
            let activeMatch = matches.find(m => m.id === tournament.activeMatchId) ||
                              matches.find(m => m.status === 'ACTIVE') ||
                              matches.find(m => m.status === 'PENDING' && m.entrant1?.name !== 'TBD' && m.entrant2?.name !== 'TBD') ||
                              matches[matches.length - 1];

            if (!activeMatch) {
                container.innerHTML = '<div class="empty-placeholder">No active matchup to display.</div>';
                return;
            }

            const e1 = activeMatch.entrant1 || { name: 'TBD', seed: 0, score: 0, rounds: 0, votes: 0 };
            const e2 = activeMatch.entrant2 || { name: 'TBD', seed: 0, score: 0, rounds: 0, votes: 0 };
            const bestOf = activeMatch.bestOf || tournament.bestOf || 0;
            const targetScore = activeMatch.targetScore || (bestOf > 0 ? Math.ceil(bestOf / 2) : 0);
            const rb = activeMatch.roundsBestOf || tournament.roundsBestOf || 0;
            const targetRounds = rb > 0 ? Math.ceil(rb / 2) : 0;
            const isVote = tournament.progressionMode === 'vote' || isPollMode;
            const totalVotes = (Number(e1.votes) || 0) + (Number(e2.votes) || 0);
            const e1Pct = totalVotes > 0 ? Math.round(((Number(e1.votes) || 0) / totalVotes) * 100) : 50;

            function renderPips(score, color) {
                if (!targetScore) return '';
                if (pipStyle === 'digit' || pipStyle === 'number') {
                    return `<span class="score-badge" style="margin-left:0.35rem;${color ? `color:${color};` : ''}">${score}/${targetScore}</span>`;
                }
                const pipClass = (pipStyle === 'diamond' || pipStyle === 'diamonds') ? ' pip-diamond' : ((pipStyle === 'bar' || pipStyle === 'block') ? ' pip-bar' : ' pip-circle');
                let pips = '<div class="win-pips" title="Game wins">';
                for (let i = 0; i < targetScore; i++) {
                    const isWon = i < score;
                    pips += `<span class="win-pip${pipClass}${isWon ? ' won' : ''}" style="${isWon && color ? `background:${color};border-color:${color};box-shadow:0 0 6px ${color};` : ''}"></span>`;
                }
                pips += '</div>';
                return pips;
            }

            function renderHudRoundPips(rounds, color) {
                if (!showRoundPips || !targetRounds) return '';
                if (roundPipStyle === 'digit' || roundPipStyle === 'number') {
                    return `<span class="score-badge" style="font-size:0.7em;margin-top:0.25rem;display:inline-block;${color ? `color:${color};` : ''}">◆ ${rounds}/${targetRounds}</span>`;
                }
                const pipClass = (roundPipStyle === 'circle' || roundPipStyle === 'circles') ? ' pip-circle' : ((roundPipStyle === 'bar' || roundPipStyle === 'block') ? ' pip-bar' : ' pip-diamond');
                let p = '<div class="match-round-pips" style="margin-top:0.25rem;" title="Rounds won">';
                for (let i = 0; i < targetRounds; i++) {
                    const isWon = i < rounds;
                    p += `<span class="match-round-pip${pipClass}${isWon ? ' won' : ''}" style="${isWon && color ? `background:${color};border-color:${color};box-shadow:0 0 6px ${color};` : ''}"></span>`;
                }
                p += '</div>';
                return p;
            }

            container.innerHTML = `
                <div class="hud-stage">
                    <div class="match-hud-card">
                        <div class="hud-header">
                            <span>${esc(activeMatch.roundName)} ${bestOf > 0 ? `· Best of ${bestOf}` : ''}</span>
                            <span>${activeMatch.matchDetails ? esc(activeMatch.matchDetails) : esc(tournament.title)}</span>
                        </div>
                        <div class="hud-match-grid" style="gap: var(--tourney-center-gap, 1rem);${!showCenter ? ' grid-template-columns: 1fr 1fr;' : ''}">
                            <div class="hud-entrant e1" style="${e1.color ? `border-left: 4px solid ${e1.color};` : ''}">
                                <div class="hud-score-display">${isVote ? (e1.votes || 0) : (showScoresParam ? (e1.score || 0) : '')}</div>
                                <div>
                                    <div class="hud-entrant-name" title="${esc(e1.name)}" style="${e1.color ? `color:${e1.color};` : ''}">${esc(e1.name)}</div>
                                    ${showTags && e1.tag ? `<div class="hud-entrant-tag">${esc(e1.tag)}</div>` : ''}
                                    ${!isVote && targetScore > 0 ? renderPips(e1.score || 0, e1.color) : ''}
                                    ${!isVote && targetRounds > 0 ? renderHudRoundPips(e1.rounds || 0, e1.color) : ''}
                                </div>
                            </div>
                            ${showCenter ? '<div class="hud-vs-pill">VS</div>' : ''}
                            <div class="hud-entrant e2" style="${e2.color ? `border-right: 4px solid ${e2.color};` : ''}">
                                <div class="hud-score-display">${isVote ? (e2.votes || 0) : (showScoresParam ? (e2.score || 0) : '')}</div>
                                <div>
                                    <div class="hud-entrant-name" title="${esc(e2.name)}" style="${e2.color ? `color:${e2.color};` : ''}">${esc(e2.name)}</div>
                                    ${showTags && e2.tag ? `<div class="hud-entrant-tag">${esc(e2.tag)}</div>` : ''}
                                    ${!isVote && targetScore > 0 ? renderPips(e2.score || 0, e2.color) : ''}
                                    ${!isVote && targetRounds > 0 ? renderHudRoundPips(e2.rounds || 0, e2.color) : ''}
                                </div>
                            </div>
                        </div>
                        ${isVote ? `
                            <div class="hud-vote-bar-wrap">
                                <div class="hud-vote-fill" style="width: ${e1Pct}%;"></div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // Render Bracket Tree
        function renderBracketTree(tournament) {
            const matches = tournament.matches || [];
            const maxRound = Math.max(...matches.map(m => m.round || 1));
            const formatLabel = tournament.format === 'double' ? 'Double Elimination' : 'Single Elimination';
            const modeLabel = tournament.progressionMode === 'manual' ? (tournament.bestOf > 0 ? `Best of ${tournament.bestOf}` : 'Scored Bracket') : 'Chat Vote';

            const roundsMap = new Map();
            for (let r = 1; r <= maxRound; r++) {
                roundsMap.set(r, matches.filter(m => m.round === r));
            }

            function renderMatchRoundPips(roundsWon, rTarget, color) {
                if (!showRoundPips || !rTarget || rTarget <= 0) return '';
                if (roundPipStyle === 'digit' || roundPipStyle === 'number') {
                    return `<span class="score-badge" style="font-size:0.68em;margin-right:0.35rem;${color ? `color:${color};` : ''}">R ${roundsWon}/${rTarget}</span>`;
                }
                const pipClass = (roundPipStyle === 'circle' || roundPipStyle === 'circles') ? ' pip-circle' : ((roundPipStyle === 'bar' || roundPipStyle === 'block') ? ' pip-bar' : ' pip-diamond');
                let p = '<div class="match-round-pips" title="Rounds won">';
                for (let i = 0; i < rTarget; i++) {
                    const isWon = i < roundsWon;
                    p += `<span class="match-round-pip${pipClass}${isWon ? ' won' : ''}" style="${isWon && color ? `background:${color};border-color:${color};box-shadow:0 0 6px ${color};` : ''}"></span>`;
                }
                p += '</div>';
                return p;
            }

            const logoUrl = showLogo ? (paramLogo || tournament.logo || '') : '';
            const rawLogoSize = paramLogoSize || tournament.logoSize || '56px';
            const logoHeightCss = /^\d+$/.test(rawLogoSize) ? `${rawLogoSize}px` : rawLogoSize;
            const hasHeaderContent = showTitle || Boolean(logoUrl);

            let html = hasHeaderContent ? `
                <div class="tournament-header">
                    ${logoUrl ? `
                    <div class="tournament-logo-wrap">
                        <img src="${esc(logoUrl)}" alt="" class="tournament-logo" style="max-height: calc(${esc(logoHeightCss)} * var(--tourney-scale));" onload="if (typeof adjustScaleAndFit === 'function') adjustScaleAndFit();" onerror="this.parentElement.style.display='none'">
                    </div>
                    ` : ''}
                    ${showTitle ? `
                    <div class="tournament-title">
                        ${!logoUrl ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>` : ''}
                        ${esc(tournament.title)}
                    </div>
                    ` : ''}
                    ${showTitle && showMeta ? `
                    <div class="tournament-meta">
                        ${showFormat ? `<span class="meta-pill">${formatLabel}</span>` : ''}
                        ${showMode ? `<span class="meta-pill">${modeLabel}</span>` : ''}
                        ${showEntrants ? `<span>${tournament.entrantCount || tournament.bracketSize} Participants</span>` : ''}
                        ${showStatus ? (tournament.status === 'COMPLETED' ? '<span style="color: var(--tourney-winner);">Finished</span>' : '<span>In Progress</span>') : ''}
                    </div>
                    ` : ''}
                </div>
            ` : '';

            // If Champion declared
            if (showChampion && tournament.status === 'COMPLETED' && tournament.champion) {
                html += `
                    <div class="champion-card">
                        <div class="champion-title">Tournament Champion</div>
                        <div class="champion-name">${esc(tournament.champion)}</div>
                    </div>
                `;
            }

            function renderMatchCardHtml(match) {
                if (match.isBye) {
                    const real = match.entrant1?.name !== 'BYE' ? match.entrant1 : match.entrant2;
                    return `
                        <div class="match-card bye-card" data-match-id="${match.id}">
                            <div class="entrant-row winner">
                                <div class="entrant-info">
                                    ${showSeeds && real?.seed > 0 ? `<span class="seed-pill">#${real.seed}</span>` : ''}
                                    <span class="entrant-name" title="${esc(real?.name || 'BYE')}">${esc(real?.name || 'BYE')}</span>
                                    ${showTags && real?.tag ? `<span class="entrant-tag">${esc(real.tag)}</span>` : ''}
                                </div>
                                <span class="bye-badge">1st Round BYE</span>
                            </div>
                        </div>
                    `;
                }

                const isActive = showHighlight && tournament.highlightLive !== false && (
                    Object.prototype.hasOwnProperty.call(tournament, 'activeMatchId')
                        ? Boolean(tournament.activeMatchId) && match.id === tournament.activeMatchId
                        : match.status === 'ACTIVE'
                );
                const isCompleted = match.status === 'COMPLETED';
                const hasWinner = match.winner;

                const e1 = match.entrant1 || { name: 'TBD', seed: 0, score: 0, rounds: 0, votes: 0, percent: 0 };
                const e2 = match.entrant2 || { name: 'TBD', seed: 0, score: 0, rounds: 0, votes: 0, percent: 0 };
                const isVote = tournament.progressionMode === 'vote' || isPollMode;
                const rb = (!isVote && !isPollMode) ? (match.roundsBestOf || tournament.roundsBestOf || 0) : 0;
                const rTarget = rb > 0 ? Math.ceil(rb / 2) : 0;

                const e1Winner = isCompleted && hasWinner === e1.name;
                const e2Winner = isCompleted && hasWinner === e2.name;
                const e1Loser = isCompleted && hasWinner && hasWinner !== e1.name;
                const e2Loser = isCompleted && hasWinner && hasWinner !== e2.name;

                return `
                    <div class="match-card${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}" data-match-id="${match.id}">
                        ${showBadges && isActive ? `<span class="match-card-badge">${isVote ? 'Voting' : 'Live'}</span>` : ''}
                        
                        <div class="entrant-row${e1Winner ? ' winner' : ''}${e1Loser ? ' loser' : ''}" style="${e1.color ? `border-left: 3px solid ${e1.color};` : ''}">
                            ${isActive && isVote ? `<div class="vote-fill-bar" style="width: ${e1.percent || 0}%;"></div>` : ''}
                            <div class="entrant-info">
                                ${e1.color ? `<span class="entrant-color-dot" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${e1.color}; flex-shrink:0;"></span>` : ''}
                                ${showSeeds && e1.seed > 0 ? `<span class="seed-pill">#${e1.seed}</span>` : ''}
                                <span class="entrant-name" title="${esc(e1.name)}">${esc(e1.name)}</span>
                                ${showTags && e1.tag ? `<span class="entrant-tag">${esc(e1.tag)}</span>` : ''}
                            </div>
                            <div class="entrant-score-box">
                                ${!isVote && rTarget > 0 ? renderMatchRoundPips(e1.rounds || 0, rTarget, e1.color) : ''}
                                ${showScoresParam ? `
                                    ${isVote ? (isActive || isCompleted ? `<span class="score-badge">${e1.votes || 0}</span><span class="entrant-pct">${e1.percent || 0}%</span>` : '') : `
                                        <span class="score-badge">${e1.score || 0}</span>
                                    `}
                                ` : ''}
                            </div>
                        </div>

                        <div class="entrant-row${e2Winner ? ' winner' : ''}${e2Loser ? ' loser' : ''}" style="${e2.color ? `border-left: 3px solid ${e2.color};` : ''}">
                            ${isActive && isVote ? `<div class="vote-fill-bar" style="width: ${e2.percent || 0}%;"></div>` : ''}
                            <div class="entrant-info">
                                ${e2.color ? `<span class="entrant-color-dot" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${e2.color}; flex-shrink:0;"></span>` : ''}
                                ${showSeeds && e2.seed > 0 ? `<span class="seed-pill">#${e2.seed}</span>` : ''}
                                <span class="entrant-name" title="${esc(e2.name)}">${esc(e2.name)}</span>
                                ${showTags && e2.tag ? `<span class="entrant-tag">${esc(e2.tag)}</span>` : ''}
                            </div>
                            <div class="entrant-score-box">
                                ${!isVote && rTarget > 0 ? renderMatchRoundPips(e2.rounds || 0, rTarget, e2.color) : ''}
                                ${showScoresParam ? `
                                    ${isVote ? (isActive || isCompleted ? `<span class="score-badge">${e2.votes || 0}</span><span class="entrant-pct">${e2.percent || 0}%</span>` : '') : `
                                        <span class="score-badge">${e2.score || 0}</span>
                                    `}
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }

            function renderTreeHtml(matchesList, treeClass = '') {
                const roundsMap = new Map();
                const rounds = Array.from(new Set(matchesList.map(m => m.round || 1))).sort((a, b) => a - b);
                for (const r of rounds) {
                    roundsMap.set(r, matchesList.filter(m => m.round === r));
                }
                let treeHtml = `<div class="bracket-tree ${treeClass}"><svg class="bracket-connectors"></svg>`;
                for (const r of rounds) {
                    const roundMatches = roundsMap.get(r) || [];
                    const roundTitle = roundMatches[0]?.roundName || `Round ${r}`;
                    treeHtml += `
                        <div class="bracket-round">
                            ${showRounds ? `<div class="round-header">${esc(roundTitle)}</div>` : ''}
                    `;
                    for (const match of roundMatches) {
                        treeHtml += renderMatchCardHtml(match);
                    }
                    treeHtml += `</div>`;
                }
                treeHtml += `</div>`;
                return treeHtml;
            }

            const isDouble = tournament.format === 'double';
            if (isDouble) {
                const winnersMatches = matches.filter(m => m.bracket === 'winners' || (!m.bracket && !m.id.startsWith('lb_') && m.id !== 'gf_1'));
                const losersMatches = matches.filter(m => m.bracket === 'losers' || m.id.startsWith('lb_'));
                const gfMatches = matches.filter(m => m.bracket === 'grand_finals' || m.id === 'gf_1');

                html += `<div class="double-elim-container">`;
                html += `
                    <div class="double-elim-section double-elim-winners">
                        <div class="bracket-section-header">Winners Bracket</div>
                        ${renderTreeHtml(winnersMatches, 'bracket-tree-winners')}
                    </div>
                `;
                if (losersMatches.length > 0) {
                    html += `
                        <div class="double-elim-section double-elim-losers">
                            <div class="bracket-section-header">Losers Bracket</div>
                            ${renderTreeHtml(losersMatches, 'bracket-tree-losers')}
                        </div>
                    `;
                }
                if (gfMatches.length > 0) {
                    html += `
                        <div class="double-elim-section double-elim-gf">
                            <div class="bracket-section-header">Grand Finals</div>
                            <div class="gf-card-wrap">
                                ${gfMatches.map(m => renderMatchCardHtml(m)).join('')}
                            </div>
                        </div>
                    `;
                }
                html += `</div>`;
            } else {
                html += renderTreeHtml(matches);
            }

            container.innerHTML = html;
            requestAnimationFrame(drawBracketConnectors);
            setTimeout(drawBracketConnectors, 60);
        }

        function drawBracketConnectors() {
            if (!showLines || params.get('lines') === 'none') return;
            const trees = Array.from(document.querySelectorAll('.bracket-tree'));
            if (!trees.length) return;

            trees.forEach(tree => {
                let svg = tree.querySelector('.bracket-connectors') || tree.querySelector('#bracket-connectors');
                if (!svg) {
                    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('class', 'bracket-connectors');
                    svg.id = tree.id ? `${tree.id}-connectors` : 'bracket-connectors';
                    tree.insertBefore(svg, tree.firstChild);
                }
                svg.innerHTML = '';
                const treeRect = tree.getBoundingClientRect();
                if (!treeRect.width || !treeRect.height) return;

                svg.setAttribute('viewBox', `0 0 ${treeRect.width} ${treeRect.height}`);

                const rounds = Array.from(tree.querySelectorAll('.bracket-round'));
                if (rounds.length < 2) return;

                for (let r = 0; r < rounds.length - 1; r++) {
                    const curRoundEl = rounds[r];
                    const nextRoundEl = rounds[r + 1];

                    const curCards = Array.from(curRoundEl.querySelectorAll('.match-card'));
                    const nextCards = Array.from(nextRoundEl.querySelectorAll('.match-card'));

                    curCards.forEach((fromCard, idx) => {
                        const fromId = fromCard.dataset.matchId;
                        const matchObj = currentTournament?.matches?.find(m => m.id === fromId);

                        let toCard = null;
                        if (matchObj && matchObj.nextMatchId) {
                            toCard = nextRoundEl.querySelector(`.match-card[data-match-id="${matchObj.nextMatchId}"]`);
                        }
                        if (!toCard) {
                            const nextIdx = Math.floor(idx / 2);
                            toCard = nextCards[nextIdx];
                        }
                        if (!toCard) return;

                        const fromRect = fromCard.getBoundingClientRect();
                        const toRect = toCard.getBoundingClientRect();

                        const x1 = fromRect.right - treeRect.left;
                        const y1 = fromRect.top + fromRect.height / 2 - treeRect.top;

                        const x2 = toRect.left - treeRect.left;
                        const isUpper = (matchObj?.nextSlot === 1 || (idx % 2 === 0));
                        const y2 = toRect.top + (isUpper ? toRect.height * 0.32 : toRect.height * 0.68) - treeRect.top;

                        const xm = x1 + (x2 - x1) * 0.5;

                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        path.setAttribute('d', `M ${x1} ${y1} H ${xm} V ${y2} H ${x2}`);

                        const isActive = matchObj?.status === 'ACTIVE' || fromCard.classList.contains('active');

                        let cls = 'bracket-line';
                        if (matchObj?.winner) cls += ' winner-line';
                        else if (isActive) cls += ' active-line';
                        path.setAttribute('class', cls);

                        svg.appendChild(path);
                    });
                }
            });
        }

        // Render Round Robin View
        function renderRoundRobinView(tournament) {
            const standings = tournament.standings || [];
            const matches = tournament.matches || [];

            const logoUrl = showLogo ? (paramLogo || tournament.logo || '') : '';
            const rawLogoSize = paramLogoSize || tournament.logoSize || '56px';
            const logoHeightCss = /^\d+$/.test(rawLogoSize) ? `${rawLogoSize}px` : rawLogoSize;
            const hasHeaderContent = showTitle || Boolean(logoUrl);

            let html = hasHeaderContent ? `
                <div class="tournament-header">
                    ${logoUrl ? `
                    <div class="tournament-logo-wrap">
                        <img src="${esc(logoUrl)}" alt="" class="tournament-logo" style="max-height: calc(${esc(logoHeightCss)} * var(--tourney-scale));" onload="if (typeof adjustScaleAndFit === 'function') adjustScaleAndFit();" onerror="this.parentElement.style.display='none'">
                    </div>
                    ` : ''}
                    ${showTitle ? `
                    <div class="tournament-title">
                        ${!logoUrl ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>` : ''}
                        ${esc(tournament.title)}
                    </div>
                    ` : ''}
                    ${showTitle && showMeta ? `
                    <div class="tournament-meta">
                        ${showFormat ? `<span class="meta-pill">Round Robin (All vs All)</span>` : ''}
                        ${showMode ? `<span class="meta-pill">${tournament.bestOf > 0 ? `Best of ${tournament.bestOf}` : 'Scored'}</span>` : ''}
                        ${showEntrants ? `<span>${tournament.entrantCount || standings.length} Participants</span>` : ''}
                        ${showStatus ? (tournament.status === 'COMPLETED' ? '<span style="color: var(--tourney-winner);">Finished</span>' : '<span>In Progress</span>') : ''}
                    </div>
                    ` : ''}
                </div>
            ` : '';

            if (showChampion && tournament.status === 'COMPLETED' && tournament.champion) {
                html += `
                    <div class="champion-card">
                        <div class="champion-title">Tournament Champion</div>
                        <div class="champion-name">${esc(tournament.champion)}</div>
                    </div>
                `;
            }

            html += `
                <div class="rr-stage">
                    ${showStandings ? `
                    <div class="rr-standings-card">
                        <table class="rr-table">
                            <thead>
                                <tr>
                                    <th style="width: 40px; text-align: center;">#</th>
                                    <th>Participant</th>
                                    <th style="text-align: center;">P</th>
                                    <th style="text-align: center;">W</th>
                                    <th style="text-align: center;">D</th>
                                    <th style="text-align: center;">L</th>
                                    <th style="text-align: center;">Diff</th>
                                    <th style="text-align: right; padding-right: 1.25rem;">PTS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${standings.map((s, idx) => `
                                    <tr class="${idx === 0 && s.played > 0 ? 'leader' : ''}">
                                        <td style="text-align: center;">
                                            <span class="rr-rank-badge">${idx + 1}</span>
                                        </td>
                                        <td>
                                            <div style="display: flex; align-items: center; gap: 0.4rem;">
                                                ${showSeeds && s.seed > 0 ? `<span class="seed-pill">#${s.seed}</span>` : ''}
                                                <span style="font-weight: 700;">${esc(s.name)}</span>
                                                ${showTags && s.tag ? `<span class="entrant-tag">${esc(s.tag)}</span>` : ''}
                                            </div>
                                        </td>
                                        <td style="text-align: center;">${s.played}</td>
                                        <td style="text-align: center; color: var(--tourney-winner); font-weight: 700;">${s.won}</td>
                                        <td style="text-align: center; color: var(--tourney-muted);">${s.draws || 0}</td>
                                        <td style="text-align: center; opacity: 0.7;">${s.lost}</td>
                                        <td style="text-align: center; font-variant-numeric: tabular-nums;">${s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                                        <td style="text-align: right; padding-right: 1.25rem; font-weight: 800; color: var(--tourney-accent); font-size: 1.05rem;">
                                            ${s.points}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ` : ''}

                    ${showMatches ? `
                    <div class="rr-matches-card">
                        <div class="rr-matches-header">
                            <span style="font-weight: 800; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tourney-muted);">
                                Match Schedule &amp; Results (${matches.filter(m => m.status === 'COMPLETED').length}/${matches.length})
                            </span>
                        </div>
                        <div class="rr-matches-grid">
                            ${matches.map(m => {
                                const isAct = showHighlight && tournament.highlightLive !== false && (
                                    Object.prototype.hasOwnProperty.call(tournament, 'activeMatchId')
                                        ? Boolean(tournament.activeMatchId) && m.id === tournament.activeMatchId
                                        : m.status === 'ACTIVE'
                                );
                                const isComp = m.status === 'COMPLETED';
                                const e1 = m.entrant1 || { name: 'TBD', score: 0 };
                                const e2 = m.entrant2 || { name: 'TBD', score: 0 };
                                const s1 = e1.score ?? (Array.isArray(m.scores) ? m.scores[0] : 0) ?? 0;
                                const s2 = e2.score ?? (Array.isArray(m.scores) ? m.scores[1] : 0) ?? 0;
                                const seed1 = e1.seed || (standings.find(s => s.name === e1.name)?.seed) || (Array.isArray(tournament.entrants) ? tournament.entrants.findIndex(x => (x.name || x) === e1.name) + 1 : 0);
                                const seed2 = e2.seed || (standings.find(s => s.name === e2.name)?.seed) || (Array.isArray(tournament.entrants) ? tournament.entrants.findIndex(x => (x.name || x) === e2.name) + 1 : 0);

                                return `
                                    <div class="rr-match-item${isAct ? ' active' : ''}${isComp ? ' completed' : ''}">
                                        <div class="rr-match-header">
                                            <span>${esc(m.roundName || ('Round ' + m.round))}</span>
                                            ${showBadges && isAct ? '<span class="rr-badge-live">LIVE</span>' : ''}
                                            ${isComp ? (m.winner === 'DRAW' ? '<span class="rr-badge-draw">DRAW</span>' : `<span class="rr-badge-win">WIN: ${esc(m.winner)}</span>`) : ''}
                                        </div>
                                        <div class="rr-match-row">
                                            <div class="rr-entrant rr-entrant-1${m.winner === e1.name ? ' winner' : ''}">
                                                ${showSeeds && seed1 > 0 ? `<span class="seed-pill">#${seed1}</span>` : ''}
                                                <span class="entrant-name">${esc(e1.name)}</span>
                                                ${showTags && e1.tag ? `<span class="entrant-tag">${esc(e1.tag)}</span>` : ''}
                                            </div>
                                            <div class="rr-score-wrap">
                                                ${showScoresParam ? `<span class="rr-score-pill">${s1} — ${s2}</span>` : '<span class="rr-vs-pill">vs</span>'}
                                            </div>
                                            <div class="rr-entrant rr-entrant-2${m.winner === e2.name ? ' winner' : ''}">
                                                ${showSeeds && seed2 > 0 ? `<span class="seed-pill">#${seed2}</span>` : ''}
                                                <span class="entrant-name">${esc(e2.name)}</span>
                                                ${showTags && e2.tag ? `<span class="entrant-tag">${esc(e2.tag)}</span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
            container.innerHTML = html;
        }

        // Particle Confetti
        function burstConfetti() {
            if (!confettiCanvas) return;
            const ctx = confettiCanvas.getContext('2d');
            const w = confettiCanvas.width = window.innerWidth;
            const h = confettiCanvas.height = window.innerHeight;
            const count = 75;
            const pieces = [];
            const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#ef4444'];

            for (let i = 0; i < count; i++) {
                pieces.push({
                    x: w / 2,
                    y: h * 0.4,
                    vx: (Math.random() - 0.5) * 16,
                    vy: (Math.random() - 0.7) * 18,
                    size: Math.random() * 8 + 5,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    rot: Math.random() * 360,
                    vRot: (Math.random() - 0.5) * 12
                });
            }

            let start = Date.now();
            function frame() {
                const elapsed = Date.now() - start;
                if (elapsed > 4000) {
                    ctx.clearRect(0, 0, w, h);
                    return;
                }
                ctx.clearRect(0, 0, w, h);
                pieces.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.35;
                    p.rot += p.vRot;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate((p.rot * Math.PI) / 180);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                    ctx.restore();
                });
                requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        }

        // Initial Data Fetch
        async function loadInitial() {
            const fallbackSample = getFallbackSample();
            if (forceSample) {
                renderTournament(fallbackSample);
                try {
                    const res = await fetch(tourneyEndpoint);
                    const data = await res.json();
                    if (data.tournament && (data.tournament.logo || data.tournament.logoSize)) {
                        renderTournament({ ...fallbackSample, logo: data.tournament.logo || '', logoSize: data.tournament.logoSize || '' });
                    }
                } catch {}
                return;
            }
            try {
                const res = await fetch(tourneyEndpoint);
                const data = await res.json();
                if (data.tournament) {
                    currentTournament = data.tournament;
                    renderTournament(currentTournament);
                    return;
                }
            } catch (err) {
                console.warn('[Tournament Overlay] Error fetching initial state:', err);
            }
            if (isPreview) renderTournament(fallbackSample);
        }
        loadInitial();

        // WebSocket Connection
        function connectWs() {
            const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${proto}//${location.host}/ws`);

            ws.onopen = () => {
                if (window.self === window.top && !isPreview) {
                    ws.send(JSON.stringify({ type: 'overlay-source', key: tourneySourceKey }));
                }
            };

            ws.onmessage = (event) => {
                if (forceSample) return;
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === tourneyWsEvent) {
                        currentTournament = msg.data;
                        renderTournament(currentTournament);
                    } else if (isPollMode && msg.type === 'poll-update' && currentTournament) {
                        const poll = msg.data;
                        if (poll && poll.tournamentMatchId) {
                            const match = currentTournament.matches.find(m => m.id === poll.tournamentMatchId);
                            if (match && poll.choices && poll.choices.length >= 2) {
                                match.entrant1.votes = poll.choices[0].votes;
                                match.entrant1.percent = poll.choices[0].percent;
                                match.entrant2.votes = poll.choices[1].votes;
                                match.entrant2.percent = poll.choices[1].percent;
                                renderTournament(currentTournament);
                            }
                        }
                    }
                } catch { /* ignore parse error */ }
            };

            ws.onclose = () => setTimeout(connectWs, 2000);
        }
        connectWs();

        return {
            renderTournament,
            adjustScaleAndFit,
            burstConfetti,
            getFallbackSample,
            getCurrentTournament: () => currentTournament
        };
    }

    window.TournamentShared = {
        esc,
        SAMPLE_VERSUS_TOURNAMENT,
        SAMPLE_POLL_TOURNAMENT,
        SAMPLE_RR_TOURNAMENT,
        initTournamentOverlay
    };
})(typeof window !== 'undefined' ? window : this);
