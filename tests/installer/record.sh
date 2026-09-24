#!/usr/bin/env bash
# Records the NSIS installer UI under Wine (virtual display) and samples the progress bar,
# so installer progress behaviour can be checked without a Windows machine.
#   tests/installer/record.sh <installer.exe> <out-dir>
set -u
EXE="$1"; OUT="$2"
FFMPEG="${FFMPEG:-ffmpeg}"
export WINEDEBUG=-all DISPLAY=:82
mkdir -p "$OUT" && rm -f "$OUT"/*.png
Xvfb :82 -screen 0 1024x768x24 >/dev/null 2>&1 & XPID=$!
until [ -e /tmp/.X11-unix/X82 ]; do sleep 0.2; done
# Fresh install location each run.
wine "C:\\users\\root\\AppData\\Local\\Programs\\Lumina\\Uninstall Lumina.exe" /currentuser /S >/dev/null 2>&1
sleep 3
"$FFMPEG" -v error -f x11grab -framerate 20 -video_size 1024x768 -i :82 -t "${SECONDS_TO_RECORD:-45}" "$OUT/f%04d.png" &
FPID=$!
wine "$EXE" >/dev/null 2>&1 &
# Click through: license "I Agree", install-mode, directory, Install. Stop pressing once installing.
for i in $(seq 1 12); do
  sleep 1.5
  W=$(xdotool search --name "Lumina Setup" 2>/dev/null | tail -1)
  if [ -n "$W" ]; then xdotool windowactivate "$W" 2>/dev/null; xdotool windowfocus "$W" 2>/dev/null; sleep 0.2; xdotool key Return 2>/dev/null; fi
done
wait $FPID
wineserver -k >/dev/null 2>&1
kill $XPID 2>/dev/null
ls "$OUT" | wc -l
