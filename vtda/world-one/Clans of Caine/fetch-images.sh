#!/usr/bin/env bash
# Downloads the eleven artwork files from Gamma's CDN into ./images/
# Run once, from this folder:   bash fetch-images.sh
set -euo pipefail

CDN="https://cdn.gamma.app/l1wx6zlr8eymj25"
mkdir -p images

download() {
  local name="$1" url="$2"
  if [ -s "images/$name" ]; then
    echo "  = images/$name (already present)"
    return
  fi
  echo "  + images/$name"
  curl -fSL --retry 3 -o "images/$name" "$url"
}

echo "Fetching artwork into ./images/ ..."
download 00-title.png     "$CDN/generated-images/VL6x8wgLLRyZt-9gbRE-H.png"
download 01-ventrue.png   "$CDN/edited-images/-ZcJoUSii3eGGxO6.png"
download 02-tremere.png   "$CDN/edited-images/FTl7rXd042wb9HYL.png"
download 03-nosferatu.png "$CDN/generated-images/WWOQuQ6886R7c9pjLPn0M.png"
download 04-lasombra.png  "$CDN/generated-images/oX59QbQIUoRzK1ukhoRPa.png"
download 05-toreador.png  "$CDN/edited-images/9LVOcnHBjzx9ujfE.png"
download 06-gangrel.png   "$CDN/generated-images/6Xk2gX0XUywWnrBOHOGm-.png"
download 07-malkavian.png "$CDN/generated-images/MLroh84J7VfeXG-mkh_iO.png"
download 08-brujah.png    "$CDN/generated-images/GZo5CoPTjYs7frCjHPM-i.png"
download 09-ravnos.png    "$CDN/generated-images/mgNPLbNWp8MCkxWSF1vYA.png"
download 10-giovanni.png  "$CDN/generated-images/m8jDQUAjJdwZ8cwg32-x3.png"

echo
echo "Done. Open index.html to check, then upload index.html + images/ to your site."
