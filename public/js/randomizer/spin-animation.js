import { getWheelGeometry } from './wheel.js';
import { createAnimationScope } from './animation-scope.js';

export function createSpinAnimator({ $, AudioFX, drawWheel, getDeckPatternHtml, getDeckWatermarkHtml, getRollerIndex, setRollerIndex, onFinish }) {
    let scope = null;
    function cancel() {
        scope?.cancel();
        scope = null;
        const pointer = $('wheel-pointer');
        if (pointer) pointer.style.transform = 'translateX(-50%) rotate(0deg)';
    }
    function play({ mode, list, weightsMap, winner, winnerIdx, totalDurationMs, isTricky, suspense, winnerHeader, winnerSub, autohide }) {
        cancel();
        scope = createAnimationScope();
        const { setTimeout, requestAnimationFrame } = scope;
        const finishSpin = (...args) => {
            cancel();
            onFinish(...args);
        };
        if (mode === 'roller') {
            $('wheel-view').style.display = 'none';
            $('deck-view').style.display = 'none';
            $('roller-view').style.display = 'block';
            const rollerBox = $('roller-view');
            const track = $('roller-track');
            rollerBox.classList.remove('tricky-suspense');

            const startIdx = getRollerIndex();
            let nudgeSteps = 0;
            let targetIdxInList = winnerIdx;

            if (isTricky) {
                nudgeSteps = Math.floor(Math.random() * 2) + 1;
                targetIdxInList = (winnerIdx - nudgeSteps + list.length * 1000) % list.length;
            }

            const minRollItems = Math.max(32, Math.floor(totalDurationMs / 105));
            const diff = (targetIdxInList - (startIdx % list.length) + list.length) % list.length;
            const cycles = Math.ceil((minRollItems - diff) / list.length);
            let finalStepCount = cycles * list.length + diff;
            if (finalStepCount < minRollItems) finalStepCount += list.length;

            track.innerHTML = '';
            const totalItemsToRender = finalStepCount + nudgeSteps + 5;
            for (let i = 0; i < totalItemsToRender; i++) {
                const itemText = list[(startIdx + i) % list.length];
                const div = document.createElement('div');
                div.className = 'roller-item';
                if (i === 0) div.className = 'roller-item active-winner';
                div.textContent = itemText;
                track.appendChild(div);
            }

            const boxHeight = rollerBox.clientHeight || 240;
            const centerOffset = (boxHeight - 56) / 2;
            track.style.transform = `translateY(${centerOffset}px)`;
            const totalDistance = finalStepCount * 56;
            const startAt = performance.now();
            let lastTickIdx = 0;

            function stepRoll(now) {
                const elapsed = now - startAt;
                const progress = Math.min(1, elapsed / totalDurationMs);
                const ease = 1 - Math.pow(1 - progress, 3.8);
                const currentTranslate = centerOffset - ease * totalDistance;
                track.style.transform = `translateY(${currentTranslate.toFixed(1)}px)`;

                const currentItem = Math.round((centerOffset - currentTranslate) / 56);
                if (currentItem !== lastTickIdx && currentItem >= 0 && currentItem < track.children.length) {
                    lastTickIdx = currentItem;
                    AudioFX.tick(Math.max(0.35, 1 - progress * 0.65));

                    for (let offset = -2; offset <= 2; offset++) {
                        const node = track.children[currentItem + offset];
                        if (node) {
                            if (offset === 0) node.className = 'roller-item active-winner';
                            else if (Math.abs(offset) === 1) node.className = 'roller-item secondary';
                            else node.className = 'roller-item tertiary';
                        }
                    }
                }

                if (progress < 1) {
                    requestAnimationFrame(stepRoll);
                } else {
                    track.style.transform = `translateY(${centerOffset - totalDistance}px)`;
                    setRollerIndex(targetIdxInList);

                    if (isTricky) {
                        rollerBox.classList.add('tricky-suspense');
                        setTimeout(() => {
                            let nudgeDone = 0;
                            function doNudge() {
                                if (nudgeDone < nudgeSteps) {
                                    nudgeDone++;
                                    const fromY = centerOffset - (finalStepCount + nudgeDone - 1) * 56;
                                    const toY = centerOffset - (finalStepCount + nudgeDone) * 56;
                                    const nStart = performance.now();
                                    const nDuration = 220;
                                    AudioFX.tick(0.45);

                                    function animNudge(nNow) {
                                        const np = Math.min(1, (nNow - nStart) / nDuration);
                                        const ne = 1 - Math.pow(1 - np, 2.5);
                                        const curY = fromY + (toY - fromY) * ne;
                                        track.style.transform = `translateY(${curY.toFixed(1)}px)`;

                                        if (np < 1) {
                                            requestAnimationFrame(animNudge);
                                        } else {
                                            track.style.transform = `translateY(${toY}px)`;
                                            const curItem = finalStepCount + nudgeDone;
                                            track.children[curItem - 1]?.classList.remove('active-winner');
                                            track.children[curItem]?.classList.add('active-winner');

                                            if (nudgeDone < nudgeSteps) {
                                                setTimeout(doNudge, 180);
                                            } else {
                                                rollerBox.classList.remove('tricky-suspense');
                                                setRollerIndex(winnerIdx);
                                                finishSpin(winner, winnerHeader, winnerSub, autohide);
                                            }
                                        }
                                    }
                                    requestAnimationFrame(animNudge);
                                }
                            }
                            doNudge();
                        }, 650);
                    } else {
                        setRollerIndex(winnerIdx);
                        finishSpin(winner, winnerHeader, winnerSub, autohide);
                    }
                }
            }
            requestAnimationFrame(stepRoll);

        } else if (mode === 'wheel') {
            $('roller-view').style.display = 'none';
            $('deck-view').style.display = 'none';
            $('wheel-view').style.display = 'flex';

            const effWeights = weightsMap || {};
            const n = list.length;
            const { sliceSpans, cumulativeAngles } = getWheelGeometry(list, effWeights);

            let targetIdxInList = winnerIdx;
            let nudgeSteps = 0;

            if (isTricky) {
                nudgeSteps = Math.floor(Math.random() * 2) + 1;
                targetIdxInList = (winnerIdx - nudgeSteps + list.length * 1000) % list.length;
            }

            const targetSliceCenter = cumulativeAngles[targetIdxInList] + sliceSpans[targetIdxInList] / 2;
            const normalizedTarget = (Math.PI * 1.5 - targetSliceCenter) % (Math.PI * 2);
            const positiveTarget = (normalizedTarget + Math.PI * 2) % (Math.PI * 2);
            const extraRotations = 6 * Math.PI * 2;
            const totalRotation = extraRotations + positiveTarget;

            const startAt = performance.now();
            let lastTickKey = -1;

            function stepWheel(now) {
                const elapsed = now - startAt;
                const progress = Math.min(1, elapsed / totalDurationMs);
                const ease = 1 - Math.pow(1 - progress, 3.8);
                const currentRot = ease * totalRotation;

                drawWheel(currentRot, list, effWeights);

                const localAngle = (Math.PI * 1.5 - (currentRot % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2);
                let curSlice = 0;
                for (let s = 0; s < n; s++) {
                    if (localAngle >= cumulativeAngles[s] && localAngle < cumulativeAngles[s + 1]) {
                        curSlice = s;
                        break;
                    }
                }
                const fullRevs = Math.floor(currentRot / (Math.PI * 2));
                const tickKey = fullRevs * n + curSlice;

                if (tickKey !== lastTickKey) {
                    lastTickKey = tickKey;
                    AudioFX.tick(Math.max(0.35, 1 - progress * 0.65));
                    const ptr = $('wheel-pointer');
                    if (ptr) {
                        ptr.style.transform = `translateX(-50%) rotate(${Math.sin(currentRot * 10) * 16}deg)`;
                        setTimeout(() => { ptr.style.transform = 'translateX(-50%) rotate(0deg)'; }, 40);
                    }
                }

                if (progress < 1) {
                    requestAnimationFrame(stepWheel);
                } else {
                    drawWheel(totalRotation, list, effWeights);

                    if (isTricky) {
                        setTimeout(() => {
                            let curNudge = 0;
                            function doWheelNudge() {
                                if (curNudge < nudgeSteps) {
                                    curNudge++;
                                    const curNudgeTargetIdx = (targetIdxInList + curNudge) % list.length;
                                    const nudgeSliceCenter = cumulativeAngles[curNudgeTargetIdx] + sliceSpans[curNudgeTargetIdx] / 2;
                                    const nudgeNorm = (Math.PI * 1.5 - nudgeSliceCenter) % (Math.PI * 2);
                                    const nudgePos = (nudgeNorm + Math.PI * 2) % (Math.PI * 2);
                                    const nudgeRot = extraRotations + nudgePos;

                                    drawWheel(nudgeRot, list, effWeights);
                                    AudioFX.tick(0.45);
                                    const ptr = $('wheel-pointer');
                                    if (ptr) {
                                        ptr.style.transform = 'translateX(-50%) rotate(18deg)';
                                        setTimeout(() => { ptr.style.transform = 'translateX(-50%) rotate(0deg)'; }, 60);
                                    }
                                    if (curNudge < nudgeSteps) {
                                        setTimeout(doWheelNudge, 220);
                                    } else {
                                        finishSpin(winner, winnerHeader, winnerSub, autohide);
                                    }
                                }
                            }
                            doWheelNudge();
                        }, 650);
                    } else {
                        finishSpin(winner, winnerHeader, winnerSub, autohide);
                    }
                }
            }
            requestAnimationFrame(stepWheel);
        } else {
            $('roller-view').style.display = 'none';
            $('wheel-view').style.display = 'none';
            $('deck-view').style.display = 'flex';

            const stack = $('deck-stack');
            const activeCard = $('deck-active-card');
            const cardInner = $('deck-card-inner');
            const tray = $('deck-shuffle-tray');
            const cutPacket = $('deck-cut-packet');
            const splitLeft = $('deck-split-left');
            const splitRight = $('deck-split-right');
            const badge = $('deck-count-badge');

            if (badge) badge.textContent = `${list.length} CARDS`;
            if (tray) tray.innerHTML = '';
            if (cutPacket) cutPacket.classList.remove('cutting');
            if (splitLeft) splitLeft.style.display = 'none';
            if (splitRight) splitRight.style.display = 'none';
            if (stack) {
                stack.classList.remove('dealing', 'squaring');
                stack.style.display = 'flex';
            }

            // Reset active card
            activeCard.style.display = 'none';
            activeCard.classList.remove('is-flipped', 'tricky-suspense', 'hovering');
            activeCard.style.opacity = '1';
            cardInner.style.transform = '';
            activeCard.style.transform = '';

            // Set card face values (Choice ONLY - no repeated winner banner)
            $('card-front-name').textContent = winner;
            const rank = (winnerIdx >= 0 && winnerIdx < 13) ? ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][winnerIdx] : `#${winnerIdx + 1}`;
            $('card-front-rank-tl').textContent = rank;
            $('card-front-rank-br').textContent = rank;

            if (suspense === 'instant') {
                AudioFX.cardSlide();
                activeCard.style.display = 'block';
                activeCard.style.transform = 'translate3d(0, 0, 40px) scale(1.05)';
                setTimeout(() => {
                    AudioFX.cardFlip();
                    activeCard.classList.add('is-flipped');
                    setTimeout(() => {
                        finishSpin(winner, winnerHeader, winnerSub, autohide);
                    }, 550);
                }, 120);
            } else {
                // Physical 4-Phase Duration-Scaled Deck Shuffle & Deal
                const tTotal = totalDurationMs;
                const phase1End = tTotal * 0.18;
                const phase2End = tTotal * 0.64;
                const phase3End = tTotal * 0.84;

                // Phase 1: 3D Deck Cut & Split
                if (cutPacket) {
                    cutPacket.classList.add('cutting');
                    AudioFX.cardSlide();
                }

                setTimeout(() => {
                    if (cutPacket) cutPacket.classList.remove('cutting');
                    if (splitLeft) {
                        splitLeft.classList.remove('retracting');
                        splitLeft.style.display = 'flex';
                        splitLeft.style.opacity = '1';
                    }
                    if (splitRight) {
                        splitRight.classList.remove('retracting');
                        splitRight.style.display = 'flex';
                        splitRight.style.opacity = '1';
                    }
                    if (stack) stack.classList.add('dealing');

                    // Phase 2: Tactile Riffle Interleave Cascade with decelerating tick intervals
                    const riffleDuration = phase2End - phase1End;
                    const cardCount = Math.max(10, Math.min(26, Math.round(riffleDuration / 115)));
                    let cIndex = 0;

                    function scheduleNextRiffleCard() {
                        if (cIndex >= cardCount) return;
                        const progress = cIndex / cardCount;
                        const isLeft = cIndex % 2 === 0;
                        cIndex++;

                        const card = document.createElement('div');
                        card.className = `deck-riffle-card ${isLeft ? 'left' : 'right'}`;
                        const randRot = (Math.random() * 4 - 2).toFixed(1);
                        const stackZ = Math.round(progress * 14 + 4);
                        card.style.setProperty('--card-rot', `${randRot}deg`);
                        card.style.setProperty('--card-z', `${stackZ}px`);

                        card.innerHTML = `
                            <div class="deck-card-border-ornament"></div>
                            <div class="deck-card-pattern">
                                ${getDeckPatternHtml()}
                            </div>
                            ${getDeckWatermarkHtml()}
                        `;
                        if (tray) tray.appendChild(card);
                        AudioFX.tick(Math.max(0.35, 0.9 - progress * 0.5));

                        // Note: cards accumulate cleanly in tray without flashing or disappearing

                        if (cIndex < cardCount) {
                            const baseInterval = (riffleDuration / cardCount) * 0.55;
                            const addedDelay = (riffleDuration / cardCount) * 0.9 * Math.pow(progress, 1.8);
                            setTimeout(scheduleNextRiffleCard, baseInterval + addedDelay);
                        }
                    }
                    scheduleNextRiffleCard();
                }, phase1End * 0.7);

                // Phase 3: Square Up Deck & Center Stage Deal with Suspense Hover
                setTimeout(() => {
                    if (splitLeft) splitLeft.classList.add('retracting');
                    if (splitRight) splitRight.classList.add('retracting');
                    setTimeout(() => {
                        if (splitLeft) splitLeft.style.display = 'none';
                        if (splitRight) splitRight.style.display = 'none';
                    }, 320);

                    if (stack) {
                        stack.classList.remove('dealing');
                        stack.classList.add('squaring');
                    }
                    AudioFX.cardSlide();

                    // Hand off: Clear riffle tray right when the deck squares up
                    if (tray) tray.innerHTML = '';

                    // Slide top card to center stage
                    activeCard.style.display = 'block';
                    activeCard.style.transform = 'translate3d(-52px, -8px, 0) scale(0.92)';
                    AudioFX.cardSlide();

                    requestAnimationFrame(() => {
                        activeCard.style.transition = 'transform 0.55s cubic-bezier(0.2, 0.85, 0.32, 1.2)';
                        activeCard.style.transform = 'translate3d(0, 0, 48px) scale(1.05)';
                        setTimeout(() => {
                            activeCard.classList.add('hovering');
                        }, 550);
                    });

                    if (isTricky) {
                        const trickyDelay = Math.max(200, (phase3End - phase2End) * 0.35);
                        setTimeout(() => {
                            activeCard.classList.remove('hovering');
                            activeCard.classList.add('tricky-suspense');
                            AudioFX.tick(0.6);

                            setTimeout(() => {
                                activeCard.classList.remove('tricky-suspense');
                                activeCard.style.transition = 'transform 0.32s ease-in, opacity 0.32s';
                                activeCard.style.transform = 'translate3d(180px, -40px, 0) rotate(26deg) scale(0.85)';
                                activeCard.style.opacity = '0';
                                AudioFX.cardSlide();

                                setTimeout(() => {
                                    activeCard.style.transition = 'none';
                                    activeCard.style.opacity = '1';
                                    activeCard.style.transform = 'translate3d(-52px, -8px, 0) scale(0.92)';
                                    void activeCard.offsetHeight;

                                    AudioFX.cardSlide();
                                    activeCard.style.transition = 'transform 0.45s cubic-bezier(0.2, 0.85, 0.32, 1.2)';
                                    activeCard.style.transform = 'translate3d(0, 0, 48px) scale(1.05)';
                                    setTimeout(() => {
                                        activeCard.classList.add('hovering');
                                    }, 450);
                                }, 280);
                            }, 450);
                        }, trickyDelay);
                    }
                }, phase2End);

                // Phase 4: 3D Flip, Sheen Sweep & Fanfare Reveal
                setTimeout(() => {
                    activeCard.classList.remove('hovering');
                    AudioFX.cardFlip();
                    activeCard.classList.add('is-flipped');
                }, phase3End);

                // Exact Duration Completion (Syncs precisely with Wheel and Roller)
                setTimeout(() => {
                    if (stack) stack.classList.remove('squaring');
                    if (cutPacket) cutPacket.classList.remove('cutting');
                    if (tray) tray.innerHTML = '';
                    finishSpin(winner, winnerHeader, winnerSub, autohide);
                }, tTotal);
            }
        }
    }
    return { play, cancel };
}
