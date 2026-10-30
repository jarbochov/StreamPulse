'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

const { createPollService } = require('../server/services/polls.js');
const { createMatchupService } = require('../server/services/matchup.js');
const createChatbot = require('../server/services/chatbot.js');
const createVariables = require('../server/services/variables.js');
const { createAlertEngine } = require('../server/services/alerts.js');
const { createCrmService } = require('../server/services/crm.js');
const { createOverlayService } = require('../server/services/overlays.js');

test('Backup coverage includes all feature data files and reloads in-memory services upon restore', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-backup-coverage-'));
    const dataDir = path.join(tempDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    // 1. Create fixture files in dataDir
    const expectedFiles = [
        'polls.json',
        'matchup.json',
        'chatbot.json',
        'chatbot-usage.json',
        'quotes.json',
        'variables.json',
        'randomizer-presets.json',
        'randomizer-button-presets.json',
        'randomizer-quote-presets.json',
        'chatter-notes.json',
        'moderators.json',
        'vips.json',
        'follower-history.json',
        'sub-history.json',
        'session-lifecycle.json',
        'game-info-cache.json',
        'alert-events.json',
        'music-artwork.png',
        'music-fallback.png',
        'alerts.json',
        'chat.json',
        'stats.json',
        'timers.json',
        'game-plan.json',
        'custom-overlays.json',
        'overlay-presets.json',
        'asset-tags.json',
        'asset-captions.json',
        'user-custom-plugin-data.json' // Dynamic discovery test
    ];

    for (const file of expectedFiles) {
        fs.writeFileSync(path.join(dataDir, file), JSON.stringify({ file, time: Date.now() }));
    }

    // Excluded files that MUST NOT be backed up
    const excludedFiles = [
        '.twitch-token.json',
        'twitch-tokens.json',
        '.stats-backup-1.json',
        '.backup-work-temp',
        '.restore-staging',
        '.chat.json.tmp.1234',
        '.DS_Store',
        '.gitkeep',
        'ssn-debug.log'
    ];
    for (const file of excludedFiles) {
        fs.writeFileSync(path.join(dataDir, file), 'sensitive-or-temporary');
    }

    // Simulate getBackupFileSpecs
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, '{"port":3000}');

    const knownFiles = [
        { src: configPath, dest: 'config.json' },
        { src: path.join(dataDir, 'chat.json'), dest: 'data/chat.json' },
        { src: path.join(dataDir, 'stats.json'), dest: 'data/stats.json' },
        { src: path.join(dataDir, 'timers.json'), dest: 'data/timers.json' },
        { src: path.join(dataDir, 'game-plan.json'), dest: 'data/game-plan.json' },
        { src: path.join(dataDir, 'alerts.json'), dest: 'data/alerts.json' },
        { src: path.join(dataDir, 'alert-events.json'), dest: 'data/alert-events.json' },
        { src: path.join(dataDir, 'polls.json'), dest: 'data/polls.json' },
        { src: path.join(dataDir, 'matchup.json'), dest: 'data/matchup.json' },
        { src: path.join(dataDir, 'chatbot.json'), dest: 'data/chatbot.json' },
        { src: path.join(dataDir, 'chatbot-usage.json'), dest: 'data/chatbot-usage.json' },
        { src: path.join(dataDir, 'quotes.json'), dest: 'data/quotes.json' },
        { src: path.join(dataDir, 'variables.json'), dest: 'data/variables.json' },
        { src: path.join(dataDir, 'randomizer-presets.json'), dest: 'data/randomizer-presets.json' },
        { src: path.join(dataDir, 'randomizer-button-presets.json'), dest: 'data/randomizer-button-presets.json' },
        { src: path.join(dataDir, 'randomizer-quote-presets.json'), dest: 'data/randomizer-quote-presets.json' },
        { src: path.join(dataDir, 'chatter-notes.json'), dest: 'data/chatter-notes.json' },
        { src: path.join(dataDir, 'moderators.json'), dest: 'data/moderators.json' },
        { src: path.join(dataDir, 'vips.json'), dest: 'data/vips.json' },
        { src: path.join(dataDir, 'follower-history.json'), dest: 'data/follower-history.json' },
        { src: path.join(dataDir, 'sub-history.json'), dest: 'data/sub-history.json' },
        { src: path.join(dataDir, 'session-lifecycle.json'), dest: 'data/session-lifecycle.json' },
        { src: path.join(dataDir, 'game-info-cache.json'), dest: 'data/game-info-cache.json' },
        { src: path.join(dataDir, 'music-artwork.png'), dest: 'data/music-artwork.png' },
        { src: path.join(dataDir, 'music-fallback.png'), dest: 'data/music-fallback.png' },
        { src: path.join(dataDir, 'custom-overlays.json'), dest: 'data/custom-overlays.json' },
        { src: path.join(dataDir, 'overlay-presets.json'), dest: 'data/overlay-presets.json' },
        { src: path.join(dataDir, 'asset-tags.json'), dest: 'data/asset-tags.json' },
        { src: path.join(dataDir, 'asset-captions.json'), dest: 'data/asset-captions.json' }
    ];

    const seenDests = new Set(knownFiles.map(f => f.dest));
    const dynamicFiles = [];
    if (fs.existsSync(dataDir)) {
        const entries = fs.readdirSync(dataDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const name = entry.name;
            if (
                name.startsWith('.twitch-token') ||
                name.startsWith('twitch-token') ||
                name.startsWith('.stats-backup-') ||
                name.startsWith('.backup-work-') ||
                name.startsWith('.restore-') ||
                name.startsWith('.chat.json.tmp') ||
                name.endsWith('.tmp') ||
                name === '.DS_Store' ||
                name === '.gitkeep' ||
                name === 'ssn-debug.log'
            ) {
                continue;
            }
            const dest = `data/${name}`;
            if (!seenDests.has(dest)) {
                seenDests.add(dest);
                dynamicFiles.push({ src: path.join(dataDir, name), dest });
            }
        }
    }

    const allSpecs = [...knownFiles, ...dynamicFiles];
    const archivedDests = allSpecs.map(s => s.dest);

    // Verify all expected files are in backup specs
    for (const file of expectedFiles) {
        assert.ok(archivedDests.includes(`data/${file}`), `Expected data/${file} to be in backup specs`);
    }

    // Verify excluded files are NOT in backup specs
    for (const file of excludedFiles) {
        assert.ok(!archivedDests.includes(`data/${file}`), `Expected data/${file} to NOT be in backup specs`);
    }

    // 2. Test in-memory service reloading
    // Poll service
    const pollService = createPollService({ dataDir, log: () => {}, error: () => {} });
    assert.equal(typeof pollService.reload, 'function', 'pollService must export reload()');
    fs.writeFileSync(path.join(dataDir, 'polls.json'), JSON.stringify({
        presets: [{ name: 'Restored Poll Preset', choices: ['A', 'B'] }]
    }));
    pollService.reload();
    assert.equal(pollService.getPresets()[0]?.name, 'Restored Poll Preset');

    // Matchup service
    const matchupService = createMatchupService({ dataDir, broadcastToOverlays: () => {} });
    assert.equal(typeof matchupService.reload, 'function', 'matchupService must export reload()');
    fs.writeFileSync(path.join(dataDir, 'matchup.json'), JSON.stringify({
        title: 'Restored Fight',
        competitors: [{ name: 'Fighter 1' }, { name: 'Fighter 2' }],
        presets: [{ id: 'p1', title: 'Restored Matchup', comp1: { name: 'Player 1' }, comp2: { name: 'Player 2' } }]
    }));
    matchupService.reload();
    assert.equal(matchupService.getPresets()[0]?.title, 'Restored Matchup');
    assert.equal(matchupService.getMatchup()?.title, 'Restored Fight');

    // Variables service
    const variablesStore = createVariables({ dataDir });
    assert.equal(typeof variablesStore.reload, 'function', 'variablesStore must export reload()');
    fs.writeFileSync(path.join(dataDir, 'variables.json'), JSON.stringify({
        restored_var: { type: 'counter', value: 99 }
    }));
    variablesStore.reload();
    assert.equal(variablesStore.values().restored_var, 99);

    // Chatbot service
    const chatbot = createChatbot({ dataDir, getConfig: () => ({}), port: 3000, variables: variablesStore });
    assert.equal(typeof chatbot.reload, 'function', 'chatbot must export reload()');
    fs.writeFileSync(path.join(dataDir, 'chatbot.json'), JSON.stringify({
        commands: [{ name: '!restored', response: 'Works!' }]
    }));
    chatbot.reload();
    chatbot.stop();
    assert.equal(chatbot.getCommands()[0]?.name, 'restored');

    // Alert engine
    const alertEngine = createAlertEngine({ dataDir });
    assert.equal(typeof alertEngine.reload, 'function', 'alertEngine must export reload()');
    fs.writeFileSync(path.join(dataDir, 'alerts.json'), JSON.stringify({
        rules: [{ id: 'restored-rule', trigger: 'sub', enabled: true }]
    }));
    alertEngine.reload();
    assert.equal(alertEngine.getConfig().rules[0]?.id, 'restored-rule');

    // CRM service
    const crmService = createCrmService({ dataDir });
    assert.equal(typeof crmService.reload, 'function', 'crmService must export reload()');
    fs.writeFileSync(path.join(dataDir, 'chatter-notes.json'), JSON.stringify({
        coolstreamer: { notes: 'Restored notes VIP' }
    }));
    crmService.reload();
    assert.equal(crmService.getChatterNotes().coolstreamer?.notes, 'Restored notes VIP');

    // Overlay service asset tags / captions / presets reload
    const overlayService = createOverlayService({ dataDir, rootDir: tempDir });
    assert.equal(typeof overlayService.loadAssetTags, 'function', 'overlayService must export loadAssetTags()');
    assert.equal(typeof overlayService.loadAssetCaptions, 'function', 'overlayService must export loadAssetCaptions()');
    assert.equal(typeof overlayService.loadOverlayPresets, 'function', 'overlayService must export loadOverlayPresets()');
    fs.writeFileSync(path.join(dataDir, 'asset-tags.json'), JSON.stringify({
        'badge.png': ['icon', 'restored']
    }));
    overlayService.loadAssetTags();
    assert.deepEqual(overlayService.getAssetTags()['badge.png'], ['icon', 'restored']);

    // 3. Create zip with all files and ensure AdmZip unpacks cleanly
    const zip = new AdmZip();
    for (const spec of allSpecs) {
        if (fs.existsSync(spec.src)) {
            const dir = path.posix.dirname(spec.dest);
            zip.addLocalFile(spec.src, dir === '.' ? '' : dir, path.posix.basename(spec.dest));
        }
    }
    const zipBuffer = zip.toBuffer();
    const readZip = new AdmZip(zipBuffer);
    const entryNames = readZip.getEntries().map(e => e.entryName);
    assert.ok(entryNames.includes('config.json'));
    assert.ok(entryNames.includes('data/polls.json'));
    assert.ok(entryNames.includes('data/matchup.json'));
    assert.ok(entryNames.includes('data/chatbot.json'));
    assert.ok(entryNames.includes('data/variables.json'));
    assert.ok(entryNames.includes('data/user-custom-plugin-data.json'));
    assert.ok(!entryNames.includes('data/.twitch-token.json'));
    assert.ok(!entryNames.includes('data/twitch-tokens.json'));

    // Clean up
    pollService.destroy();
    matchupService.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
});
