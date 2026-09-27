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

  <section class="hero" style="--hero: url('/htr/brooklyn/art/hero.jpg')">
  <article class="card" style="--art: url('/htr/brooklyn/art/red-hook.jpg')">
  <div class="band" style="--art: url('/htr/brooklyn/art/docks.jpg')"></div>

On one page, behind everything:

  <body style="--page-art: url('/htr/brooklyn/art/paper.jpg')">

For every page of a world, in that world's world.css:

  :root {
    --page-art:  url('/htr/brooklyn/art/paper.jpg');
    --page-veil: .86;
  }

--page-veil is how heavily the background is dimmed, from 0 (the raw
picture) to 1 (hidden). It defaults to .82. Backgrounds compete with
text, so start high and come down until it reads.


PATHS - ALWAYS START WITH A SLASH

Every picture set through --hero, --art, --page-art or --logo must be
written from the root of the site, starting with a slash:

  RIGHT   url('/vtda/hungary-1242/art/crown.jpg')
  WRONG   url('art/crown.jpg')
  WRONG   url('vtda/hungary-1242/art/crown.jpg')

Why: these slots are CSS variables, and browsers do not agree on what a
relative path inside a variable is relative to. Chrome resolves it
against style.css (the site root), not against the page you wrote it
in - so 'art/crown.jpg' on a world page quietly looks for /art/crown.jpg
and shows the empty gradient instead. A leading slash means the site
root in every browser, so it cannot go wrong.

Spaces in filenames are fine inside the quotes, but %20 is safer:
'/art/World%20Image.jpg'.

One side effect: opening a page straight from disk (file://) will not
show these pictures, because "/" is then the root of your drive. View
the site through a local web server, or the live site, to check art.

Ordinary <img src="..."> and <a href="..."> are NOT affected: those are
relative to their own page, as usual.


SIZES

  hero        1920x1080 or wider, and remember the bottom third sits
              under a dark scrim where the title goes
  card art    16:9, around 800x450
  portraits   3:4, around 600x800
  page-art    large and low-contrast; busy pictures fight the text
