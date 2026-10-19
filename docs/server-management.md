# Server Management (Shell Script Reference)

## Start & Stop with PID File

```bash
# Start
node server.js & echo $! > .server.pid

# Stop
kill $(cat .server.pid) && rm .server.pid
```

## Start & Stop with Inline PID

```bash
node server.js &
PID=$!

# later...
kill $PID
```

## Find & Kill by Port

```bash
# Find what's running on port 8080
lsof -ti:8080

# Kill it
lsof -ti:8080 | xargs kill
```

## Companion-Style Script Example

```bash
#!/bin/bash
cd /path/to/streampulse

case "$1" in
  start)
    node server.js & echo $! > .server.pid
    echo "Server started (PID: $(cat .server.pid))"
    ;;
  stop)
    if [ -f .server.pid ]; then
      kill $(cat .server.pid) && rm .server.pid
      echo "Server stopped"
    else
      echo "No PID file found, trying port lookup..."
      lsof -ti:8080 | xargs kill 2>/dev/null && echo "Killed" || echo "Nothing running"
    fi
    ;;
  restart)
    $0 stop
    sleep 1
    $0 start
    ;;
  *)
    echo "Usage: $0 {start|stop|restart}"
    ;;
esac
```

Usage:
```bash
./manage.sh start
./manage.sh stop
./manage.sh restart
```

The in-app updater does not require this shell script. It is cross-platform and can restart the Node server after a manual update when StreamPulse was launched with `npm start`; Git and Node.js/npm must be installed and the checkout must be writable. Windows uses `npm.cmd` automatically. For unattended process supervision, use a platform service or process manager so the server is relaunched if it exits unexpectedly.

Use the **Restart StreamPulse** button on the dashboard when restarting after an outage or configuration issue. It saves the active session, waits for a new process instance, and confirms that the restarted process resumes it; use **End Session** when you intentionally want to archive and start a new session. The **Update** page uses the same verification before reporting that an update completed.

## Backup & Restore

Use the **Backup & Restore** studio to download a full ZIP (`GET /api/backup`), restore one (`POST /api/restore`), or download a saved automatic backup from `/api/backups`. A `HEAD /api/backup` request builds the same archive and returns its download headers without sending its contents.

Full backups contain `config.json`, the existing curated set of session/statistics, timer, highlight, clip-candidate, overlay, asset-metadata, Game Plan, and alert files, plus the `data/sessions/`, `data/custom-overlay-assets/`, and `data/custom-overlay-history/` folders. Missing optional files are skipped. They are **not** copies of the entire data directory: Twitch token files and the backup directory itself are excluded. Configuration and chat data can still contain sensitive information; keep backup ZIPs private.

When `auto_backup_on_session_end` is enabled, **End Session** archives and backs up the finished session **before** resetting live data. The ten newest `backup-*.zip` files are retained in the configured data directory's `backups/` folder; other ZIP filenames are not pruned. Repeated backups within the same minute replace that minute's backup, matching the existing naming convention. Updates await a forced backup before replacing application files. A failed backup is reported as an error rather than silently allowing the reset or update to proceed. Shutdown and embedded desktop restart wait for outstanding backup operations before changing session files.

### Background processing and limits

- Full ZIP creation, compression, archive parsing, CRC checks, and restore decompression run in a short-lived Node worker thread, not the server/Electron main event loop. Manual downloads stream the completed ZIP from disk. Restore uploads stream to disk rather than being concatenated into a large main-thread buffer.
- Manual backups, automatic backups, and full restores share **one active operation and at most two waiting operations**. Excess requests receive HTTP **503**; retry once current work finishes. Slow uploads/downloads also occupy that operation slot. There is no persistent idle worker.
- Each operation uses a private `.backup-work-*` directory inside `data/backups/` (or the configured data directory). Normal completion, handled failures, cancellation, worker errors, and timeouts remove it. Force-killing the application or a power loss can leave one behind; stop StreamPulse before removing an abandoned directory. Completed automatic ZIPs are published before retention removes older backups.
- Full restore preserves the existing **600 MiB compressed upload limit**. There are no newly imposed entry-count, expanded-size, worker heap, or default worker runtime caps. A service caller can explicitly opt into a worker timeout; normal HTTP/automatic operations do not. Selective share-package APIs keep their existing behavior; they are not moved to this worker pipeline.
- Bounded concurrency prevents multiple simultaneous ZIP heaps but does not reduce the work of one archive: `adm-zip` still holds file/ZIP buffers in memory, and compression consumes CPU, disk space, and I/O. Large media libraries can need substantial RAM and free disk space. Runtime and available memory/filesystem capacity still constrain accepted archives; this is not a total memory/CPU limit or a promise of lower overall resource usage.

Restore requires `data/stats.json` (or the legacy `stats.json` marker), restores `config.json` and eligible `data/` entries, and ignores unrelated or traversal paths. Archive-controlled destinations cannot pass through symbolic links. Selected entries are completely staged and checked before live files are touched, then published using asynchronous, per-file atomic replacements. The existing reload callback runs before the success response; restored connection/startup settings are returned in `restartFields` with `restartRequired: true`.

This is **not** a transactional, point-in-time snapshot or an all-files atomic restore. Live events may change files while a backup reads them. A failure during final restore publication or reload can leave some files restored; inspect the error and restore again if needed. Restore while off-air, keep an independent known-good backup, and restart when prompted. Configuration/data reload parsing still occurs on the main thread; moving archive work does not make every disk or JSON operation asynchronous.

Events arriving while **End Session** waits for compression remain in the ending session. Before resetting, StreamPulse synchronously flushes chat, statistics, and the chat log again and refreshes that session archive; the ZIP may predate these last arrivals, but the local archive and lifetime statistics retain them. A backup failure leaves live data intact for retry, and the same session archive is updated rather than creating another session. Disconnecting a restore client cancels upload/decompression before publication; once publication starts, it completes file replacement and reload even if the client has gone away.

The isolated regression is `node --test scripts/test-backup-worker.cjs`. It uses fictional project-local fixtures, verifies ZIP contents, restore/reload behavior, retention, failures, cancellation, bounded queuing, backup-before-reset, shutdown/restart waiting, and checks timer/local HTTP responsiveness while archiving and restoring 16 MiB of random media. Printed timings are measurements of that bounded fixture on the test machine, not production CPU/RAM savings or performance guarantees.
