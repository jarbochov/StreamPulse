#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function printHeader() {
    console.log('\n============================================================');
    console.log('                 StreamPulse Setup Wizard');
    console.log('============================================================\n');
}

function runNpmInstall(args, title) {
    console.log(`\n--> Running: npm ${args.join(' ')}\n`);
    const result = spawnSync(npmCmd, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });

    if (result.status !== 0) {
        console.error(`\n[!] Installation encountered an error (exit code: ${result.status}).`);
        process.exit(result.status || 1);
    }

    console.log('\n============================================================');
    console.log(`  StreamPulse ${title} Setup Complete!`);
    console.log('============================================================');
}

async function main() {
    const rawArgs = process.argv.slice(2);

    if (rawArgs.includes('--server') || rawArgs.includes('--self-host') || rawArgs.includes('--omit=dev')) {
        printHeader();
        console.log('Selected Profile: Self-Hosted Web Server (Server Only)');
        runNpmInstall(['install', '--omit=dev'], 'Server');
        console.log('\nTo launch StreamPulse server:');
        console.log('  npm start\n');
        console.log('Then open http://localhost:3000 in your browser or OBS.\n');
        return;
    }

    if (rawArgs.includes('--desktop') || rawArgs.includes('--dev') || rawArgs.includes('--full')) {
        printHeader();
        console.log('Selected Profile: Desktop Development & Packaging');
        runNpmInstall(['install'], 'Desktop Development');
        console.log('\nTo launch desktop app in development:');
        console.log('  npm run desktop:dev\n');
        console.log('To package standalone installers (.dmg, .exe, .AppImage):');
        console.log('  npm run desktop:build\n');
        return;
    }

    printHeader();

    if (!input.isTTY) {
        console.log('Non-interactive terminal detected. Defaulting to Self-Hosted Web Server profile.');
        runNpmInstall(['install', '--omit=dev'], 'Server');
        console.log('\nTo launch StreamPulse server:');
        console.log('  npm start\n');
        return;
    }

    console.log('Choose an installation profile:\n');
    console.log('  [1] Self-Hosted Web Server (Recommended)');
    console.log('      Fast, lightweight installation (~7 packages).');
    console.log('      Installs runtime dependencies for local or remote server');
    console.log('      hosting, WebSockets, and OBS browser overlays.');
    console.log('      Skips Electron desktop runtime and packaging tools.\n');
    console.log('  [2] Desktop App Development & Packaging');
    console.log('      Full developer environment (~500 packages).');
    console.log('      Installs Electron desktop runtime and electron-builder');
    console.log('      for running desktop development mode and packaging binaries.\n');
    console.log('  [3] Cancel\n');

    const rl = createInterface({ input, output });

    try {
        const answer = (await rl.question('Enter selection [1-3] (default: 1): ')).trim();
        rl.close();

        if (answer === '2') {
            runNpmInstall(['install'], 'Desktop Development');
            console.log('\nTo launch desktop app in development mode:');
            console.log('  npm run desktop:dev\n');
            console.log('To package standalone installers:');
            console.log('  npm run desktop:build\n');
        } else if (answer === '3') {
            console.log('\nSetup cancelled. No changes made.\n');
        } else {
            // Default: 1
            runNpmInstall(['install', '--omit=dev'], 'Server');
            console.log('\nTo start your StreamPulse server:');
            console.log('  npm start\n');
            console.log('Then open http://localhost:3000 in your browser or OBS.\n');
        }
    } catch {
        rl.close();
        console.log('\nSetup aborted.\n');
    }
}

main();
