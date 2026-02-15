#!/usr/bin/env bash
set -euo pipefail

PORT_DEFAULT=""
if [[ $# -gt 0 ]]; then
  PORT_DEFAULT="$1"
else
  shopt -s nullglob
  ports=(/dev/cu.usbmodem* /dev/tty.usbmodem*)
  if (( ${#ports[@]} > 0 )); then
    PORT_DEFAULT="${ports[0]}"
  fi
fi

PORT="${PORT_DEFAULT:?no serial port found. connect USB and/or specify /dev/.../tty path explicitly}"

cd "$(dirname "$0")/.."

echo "[upload_loop] target: $PORT"
echo "[upload_loop] If upload fails with 'No serial data received':"
echo "  - Put AtomS3R into download mode (often: hold RESET ~2s, release; green LED on), then it will catch."
echo "  - Keep USB connected; this script retries every 2s."

while true; do
  echo "[upload_loop] $(date '+%H:%M:%S') uploading..."
  if pio run -t upload --upload-port "$PORT"; then
    echo "[upload_loop] SUCCESS"
    exit 0
  fi
  echo "[upload_loop] retrying in 2s..."
  sleep 2
done
