#!/bin/sh
set -eu
mkdir -p /tmp/humming-tor
printf 'SocksPort 127.0.0.1:9050\nDataDirectory /tmp/humming-tor\nLog notice stdout\n' > /tmp/humming-torrc
tor -f /tmp/humming-torrc &
python3 -m wisp.server --host 127.0.0.1 --port 8765 --proxy socks5h://127.0.0.1:9050 --block-udp --limits &
exec node dist/server.js
