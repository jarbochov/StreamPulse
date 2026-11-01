'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function testGroups(scripts, name = 'test', ancestors = []) {
    if (!scripts[name] || ancestors.includes(name)) throw new Error(`Invalid test script: ${name}`);
    return scripts[name].split(/\s*&&\s*/).flatMap(command => {
        const args = command.trim().split(/\s+/);
        return args[0] === 'npm' && args[1] === 'run'
            ? testGroups(scripts, args[2], [...ancestors, name])
            : [args];
    });
}

function runGroups(groups, directory, run = spawnSync) {
    fs.mkdirSync(directory, { recursive: true });
    return groups.map((args, index) => {
        const command = args.join(' ');
        const file = path.join(directory, `${String(index + 1).padStart(2, '0')}.log`);
        const fd = fs.openSync(file, 'w');
        const started = Date.now();
        let result;
        try {
            const executable = args[0] === 'node' ? process.execPath : args[0];
            const parameters = args[0] === 'eslint'
                ? [path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js'), ...args.slice(1)]
                : args.slice(1);
            result = run(args[0] === 'eslint' ? process.execPath : executable, parameters, {
                stdio: ['ignore', fd, fd], timeout: 600_000
            });
        } catch (error) {
            result = { error };
        } finally {
            fs.closeSync(fd);
        }
        const exitCode = result.error ? 1 : (result.status ?? 1);
        console.log(`${exitCode === 0 ? 'PASS' : 'FAIL'} ${command}`);
        if (exitCode !== 0) {
            console.error(result.error?.message || result.signal || '');
            console.error(fs.readFileSync(file, 'utf8').split('\n').slice(-60).join('\n'));
        }
        return { command, exitCode, milliseconds: Date.now() - started, log: path.basename(file) };
    });
}

if (require.main === module) {
    const directory = path.resolve(process.argv[2] || 'release-diagnostics');
    const scripts = require('../package.json').scripts;
    const groups = runGroups(testGroups(scripts), directory);
    const summary = { sha: process.env.GITHUB_SHA || null, groups };
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(summary, null, 2));
    const failures = groups.filter(group => group.exitCode !== 0);
    console.log(`\n${groups.length - failures.length}/${groups.length} groups passed; ${failures.length} failed.`);
    process.exitCode = failures.length ? 1 : 0;
}

module.exports = { testGroups, runGroups };
