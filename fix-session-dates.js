#!/usr/bin/env node
// Fix session archive filenames to use local time instead of UTC.
// Run from the project root: node fix-session-dates.js
// Add --dry-run to preview changes without renaming.

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, 'data', 'sessions');
const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(SESSIONS_DIR)) {
    console.log('No sessions directory found at', SESSIONS_DIR);
    process.exit(0);
}


function localDateTimeStr(isoStr) {
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}-${mi}`;
}

const sessionFiles = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.startsWith('chat-') && f.endsWith('.json'))
    .sort();

if (sessionFiles.length === 0) {
    console.log('No session files found.');
    process.exit(0);
}

console.log(`Found ${sessionFiles.length} session file(s). ${dryRun ? '(DRY RUN)' : ''}\n`);

let renamed = 0;
let skipped = 0;

for (const file of sessionFiles) {
    const filePath = path.join(SESSIONS_DIR, file);
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!data.startedAt) {
            console.log(`  SKIP  ${file} — no startedAt field`);
            skipped++;
            continue;
        }

        const correctName = `chat-${localDateTimeStr(data.startedAt)}.json`;

        if (file === correctName) {
            console.log(`  OK    ${file}`);
            skipped++;
            continue;
        }

        // Handle collision (unlikely but safe)
        let finalName = correctName;
        let counter = 2;
        while (fs.existsSync(path.join(SESSIONS_DIR, finalName)) && finalName !== file) {
            finalName = correctName.replace('.json', `-${counter}.json`);
            counter++;
        }

        console.log(`  RENAME  ${file}  →  ${finalName}`);

        if (!dryRun) {
            fs.renameSync(filePath, path.join(SESSIONS_DIR, finalName));
        }

        // Also rename matching chatlog file if it exists
        const oldLogName = file.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
        const newLogName = finalName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
        const oldLogPath = path.join(SESSIONS_DIR, oldLogName);
        if (fs.existsSync(oldLogPath)) {
            console.log(`  RENAME  ${oldLogName}  →  ${newLogName}`);
            if (!dryRun) {
                fs.renameSync(oldLogPath, path.join(SESSIONS_DIR, newLogName));
            }
        }

        renamed++;
    } catch (err) {
        console.log(`  ERROR ${file} — ${err.message}`);
    }
}

console.log(`\nDone. ${renamed} renamed, ${skipped} unchanged.${dryRun ? ' (dry run — no files changed)' : ''}`);
