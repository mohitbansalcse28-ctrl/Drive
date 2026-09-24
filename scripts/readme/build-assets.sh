#!/usr/bin/env bash
# Regenerates every README visual: paints demo scenes, builds a demo library, drives the real app
# to capture screenshots + a demo recording, then composes the hero, frames and theme gallery.
#   npm run readme:assets        (Linux; needs ffmpeg, python3 + Pillow, Xvfb)
set -eu
cd "$(dirname "$0")/../.."
WORK=tests/e2e/.tmp/readme
FFMPEG="${FFMPEG:-ffmpeg}"
python3 scripts/readme/scenes.py "$WORK/scenes"
FFMPEG="$FFMPEG" scripts/readme/make-media.sh "$WORK/scenes" "$WORK/library"
npm run build
xvfb-run -a -s "-screen 0 2400x1600x24" node scripts/readme/capture.mjs "$WORK/library" "$WORK/shots"
node scripts/readme/compose.mjs "$WORK/shots" docs
"$FFMPEG" -v error -y -f concat -safe 0 -i "$WORK/shots/.frames/list.txt" \
  -vf "fps=15,scale=960:-1:flags=lanczos" -c:v libwebp_anim -lossless 0 -q:v 65 -compression_level 6 -loop 0 docs/demo.webp
echo "README assets updated in docs/"
