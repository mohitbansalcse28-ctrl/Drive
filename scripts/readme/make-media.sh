#!/usr/bin/env bash
# Builds the demo library used for README screenshots from the painted scenes.
#   scripts/readme/make-media.sh <scenes-dir> <library-dir>
set -eu
SC="$1"; LIB="$2"; FFMPEG="${FFMPEG:-ffmpeg}"
mk() { # scene, "Collection/Title", seconds, WxH
  local out="$LIB/$2.mp4"; [ -f "$out" ] && return 0
  mkdir -p "$(dirname "$out")"
  local frames=$(( $3 * 10 ))
  "$FFMPEG" -v error -y -i "$SC/$1.png" -vf "zoompan=z='1+0.12*on/$frames':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$frames:s=$4:fps=10,format=yuv420p" \
    -c:v libx264 -preset ultrafast -tune stillimage -crf 30 -movflags +faststart "$out"
}
jobs=(
  "aurora|Travel/Iceland - Northern Lights|184|1920x1080"
  "neon_city|Travel/Tokyo Nights|247|1280x720"
  "sunset_sea|Travel/Santorini Sunset|131|1280x720"
  "beach|Travel/Bali Beach Morning|96|1280x720"
  "alps|Travel/Swiss Alps at Dawn|212|1920x1080"
  "ocean|Nature/Deep Ocean|305|1280x720"
  "forest|Nature/Forest Rain|158|1280x720"
  "desert|Nature/Sahara Dunes|124|1280x720"
  "nebula|Space/Nebula Journey|421|1920x1080"
  "galaxy|Space/Galaxy Spiral|187|1280x720"
  "synthwave|Music/Synthwave Drive|233|1920x1080"
  "lofi|Music/Lo-fi Beats to Relax|356|1280x720"
  "neon_rings|Music/Neon Dreams|201|1280x720"
  "color_grading|Tutorials/Color Grading 101|734|1280x720"
  "cinematic|Tutorials/Cinematic Shots Masterclass|612|1920x1080"
  "party|Family/Mia's 5th Birthday|143|1280x720"
  "picnic|Family/Weekend Picnic|97|1280x720"
  "vertical_city|Shorts/City Lights|38|1080x1920"
)
for j in "${jobs[@]}"; do
  IFS='|' read -r s t d r <<< "$j"
  mk "$s" "$t" "$d" "$r" &
  while [ "$(jobs -rp | wc -l)" -ge 4 ]; do sleep 0.5; done
done
wait
echo "library ready: $(find "$LIB" -name '*.mp4' | wc -l) videos"
