(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.StreamPulseStateMachine = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createStateMachine(config = {}) {
        const id = String(config.id || 'anonymous-machine');
        const states = config.states || {};
        let currentState = config.initial || Object.keys(states)[0] || 'IDLE';
        const context = config.context ? { ...config.context } : {};
        const subscribers = new Set();
        const history = [];
        const maxHistory = Math.max(5, Number(config.maxHistory) || 25);

        if (!states[currentState]) {
            throw new Error(`[StateMachine:${id}] Initial state "${currentState}" is not defined in states table.`);
        }

        function resolveTransition(eventName, payload) {
            const stateDef = states[currentState];
            if (!stateDef || !stateDef.on) return null;

            const rawHandler = stateDef.on[eventName];
            if (!rawHandler) return null;

            const event = { type: eventName, payload };

            if (typeof rawHandler === 'string') {
                return {
                    target: rawHandler,
                    guard: null,
                    action: null,
                    event
                };
            }

            if (typeof rawHandler === 'object' && rawHandler !== null) {
                const target = rawHandler.target !== undefined ? rawHandler.target : currentState;
                const guard = typeof rawHandler.guard === 'function' ? rawHandler.guard : null;
                const action = typeof rawHandler.action === 'function' ? rawHandler.action : null;
                return {
                    target,
                    guard,
                    action,
                    event
                };
            }

            return null;
        }

        function can(eventName, payload) {
            const transition = resolveTransition(eventName, payload);
            if (!transition) return false;

            if (transition.guard) {
                try {
                    if (!transition.guard(context, transition.event)) return false;
                } catch {
                    return false;
                }
            }

            if (transition.target && !states[transition.target]) {
                return false;
            }

            return true;
        }

        function getValidTransitions() {
            const stateDef = states[currentState];
            if (!stateDef || !stateDef.on) return [];
            return Object.keys(stateDef.on).filter(eventName => can(eventName));
        }

        function send(eventName, payload) {
            const transition = resolveTransition(eventName, payload);
            if (!transition) {
                return {
                    transitioned: false,
                    reason: `Event "${eventName}" is not permitted from state "${currentState}".`,
                    state: currentState,
                    context
                };
            }

            if (transition.guard) {
                let passed = false;
                try {
                    passed = Boolean(transition.guard(context, transition.event));
                } catch (err) {
                    return {
                        transitioned: false,
                        reason: `Guard for "${eventName}" threw an error: ${err.message}`,
                        state: currentState,
                        context
                    };
                }
                if (!passed) {
                    return {
                        transitioned: false,
                        reason: `Guard rejected event "${eventName}" from state "${currentState}".`,
                        state: currentState,
                        context
                    };
                }
            }

            const targetState = transition.target || currentState;
            if (!states[targetState]) {
                return {
                    transitioned: false,
                    reason: `Target state "${targetState}" does not exist in machine "${id}".`,
                    state: currentState,
                    context
                };
            }

            const fromState = currentState;
            const stateDef = states[fromState];
            const nextStateDef = states[targetState];
            const isStateChange = fromState !== targetState;

            // 1. Transition action
            if (transition.action) {
                try {
                    transition.action(context, transition.event);
                } catch (err) {
                    console.error(`[StateMachine:${id}] Transition action error on "${eventName}":`, err);
                }
            }

            // 2. State exit hook
            if (isStateChange && stateDef?.onExit) {
                try {
                    stateDef.onExit(context, transition.event);
                } catch (err) {
                    console.error(`[StateMachine:${id}] onExit error on state "${fromState}":`, err);
                }
            }

            // 3. State transition
            currentState = targetState;

            // 4. State entry hook
            if (isStateChange && nextStateDef?.onEntry) {
                try {
                    nextStateDef.onEntry(context, transition.event);
                } catch (err) {
                    console.error(`[StateMachine:${id}] onEntry error on state "${targetState}":`, err);
                }
            }

            const transitionRecord = {
                id,
                from: fromState,
                to: targetState,
                event: eventName,
                payload,
                timestamp: new Date().toISOString()
            };

            history.unshift(transitionRecord);
            if (history.length > maxHistory) history.length = maxHistory;

            // 5. Notify subscribers
            for (const sub of subscribers) {
                try {
                    sub({
                        id,
                        from: fromState,
                        to: targetState,
                        event: eventName,
                        payload,
                        context,
                        validTransitions: getValidTransitions()
                    });
                } catch (err) {
                    console.error(`[StateMachine:${id}] Subscriber callback failed:`, err);
                }
            }

            return {
                transitioned: true,
                from: fromState,
                to: targetState,
                event: eventName,
                payload,
                context
            };
        }

        function matches(...stateNames) {
            return stateNames.includes(currentState);
        }

        function subscribe(fn) {
            if (typeof fn === 'function') {
                subscribers.add(fn);
                return () => subscribers.delete(fn);
            }
            return () => {};
        }

        function toSnapshot() {
            return {
                id,
                state: currentState,
                validTransitions: getValidTransitions(),
                context: { ...context },
                history: history.slice(0, 10),
                updatedAt: history[0]?.timestamp || null
            };
        }

        return {
            id,
            getState: () => currentState,
            getContext: () => context,
            can,
            getValidTransitions,
            send,
            matches,
            subscribe,
            toSnapshot
        };
    }

    return {
        createStateMachine
    };
}));
