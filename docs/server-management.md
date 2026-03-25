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
