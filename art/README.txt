Artwork folder.

logo.svg  — the site logo. Replace this file with your own and every
            page picks it up; nothing else needs editing. A PNG or JPG
            works too: drop it in here, then change the one --logo line
            near the top of ../style.css to point at the new filename.

Also the home for hero images, card art and band strips. Reference them
from a page like this:

  <section class="hero" style="--hero: url(art/hero.jpg)">
  <article class="card" style="--art: url(art/world-name.jpg)">

From a system page the path is ../art/..., from a world page ../../art/...
or just art/ if you keep that world's pictures in its own folder.
