#!/bin/sh
# Local review only. Bind loopback, port 18092 (not 18082/18083/18090/18091).
cd "$(dirname "$0")/.."
exec python3 -m http.server 18092 --bind 127.0.0.1
