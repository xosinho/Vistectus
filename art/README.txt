ARTWORK — where pictures live, and how pages use them
=====================================================

WHERE TO PUT A PICTURE

  art/                          site-wide: the logo, the hub hero, shared
                                background images used on several pages
  art/backgrounds/              full-page background images for the hub
  <system>/<world>/art/         pictures for one world
  <system>/<world>/<chronicle>/art/   pictures for one chronicle

Keep each picture next to the pages that use it. The only files that
belong in this top folder are ones the whole site shares.

logo.svg is the site logo. Replace it with your own and every page picks
it up, including the browser-tab icon. A PNG or JPG works too: drop it
in here and change the one --logo line near the top of ../style.css.


HOW A PAGE USES A PICTURE

There are four slots. Each is a CSS variable you set either on one
element, on one page, or for a whole world in its world.css.

  --hero       the big picture behind a page title
  --art        a card tile, a portrait, or a full-bleed band
  --page-art   a picture behind the WHOLE page, fixed while you scroll
  --logo       the site logo

On one element:

  <section class="hero" style="--hero: url(art/hero.jpg)">
  <article class="card" style="--art: url(art/red-hook.jpg)">
  <div class="band" style="--art: url(art/docks.jpg)"></div>

On one page, behind everything:

  <body style="--page-art: url(art/paper.jpg)">

For every page of a world, in that world's world.css:

  :root {
    --page-art:  url(art/paper.jpg);
    --page-veil: .86;
  }

--page-veil is how heavily the background is dimmed, from 0 (the raw
picture) to 1 (hidden). It defaults to .82. Backgrounds compete with
text, so start high and come down until it reads.


PATHS

A path in a page is relative to THAT page. A path in a stylesheet is
relative to THAT stylesheet. So art/hero.jpg inside dead-hand/world.css
means dead-hand/art/hero.jpg, and the same text inside a chronicle page
means that chronicle's own art folder. This is why each level has its
own art folder: the short path always means "mine".


SIZES

  hero        1920x1080 or wider, and remember the bottom third sits
              under a dark scrim where the title goes
  card art    16:9, around 800x450
  portraits   3:4, around 600x800
  page-art    large and low-contrast; busy pictures fight the text
