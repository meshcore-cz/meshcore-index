#!/usr/bin/env bash
# Regenerate site logo, favicons, and og.png from ninja-logo.png (project root).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/ninja-logo.png"
out="$root/static"
bg='#000000'

if [[ ! -f "$src" ]]; then
  echo "Missing $src" >&2
  exit 1
fi

command -v magick >/dev/null || { echo 'ImageMagick (magick) required' >&2; exit 1; }

cp "$src" "$out/logo.png"

# Favicons keep the logo's transparent background (xc:none). The apple-touch
# icon (180) gets a solid background because iOS flattens transparency to black
# behind a rounded mask, which looks worse than an explicit fill.
for spec in "16:12:none" "32:26:none" "180:150:$bg" "192:160:none" "512:430:none"; do
  IFS=: read -r size inner sbg <<<"$spec"
  magick -size "${size}x${size}" xc:"$sbg" \
    \( "$src" -resize "${inner}x${inner}" \) -gravity center -composite \
    "$out/favicon-${size}x${size}.png"
done

# Preserve the alpha channel when packing the .ico (default would drop it).
magick "$out/favicon-16x16.png" "$out/favicon-32x32.png" \
  -background none -define icon:auto-resize=16,32 "$out/favicon.ico"
cp "$out/favicon-180x180.png" "$out/apple-touch-icon.png"

cp "$out/favicon-192x192.png" "$out/pwa-192.png"
cp "$out/favicon-512x512.png" "$out/pwa-512.png"
# Maskable icon: solid background with logo in the ~80% safe zone.
magick -size 512x512 xc:"$bg" \
  \( "$src" -resize 410x410 \) -gravity center -composite \
  "$out/pwa-maskable-512.png"

magick -size 1200x630 xc:"$bg" \
  \( "$src" -resize 420x420 \) -gravity center -composite \
  "$out/og.png"

echo "✓ Wrote logo, favicons, apple-touch-icon, PWA icons, and og.png under static/"
