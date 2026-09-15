The Clans of Caine — Layer IIIa (The Playable Clans)
HTML export of the Gamma deck, rebuilt as a hosting-ready web page.

CONTENTS
  index.html        The page. All CSS is inline; no build step, no framework.
  fetch-images.sh   One-time script that downloads the eleven artwork files.
  images/           Where the artwork lands (empty until you run the script).

HOW TO USE
  1. Open a terminal in this folder and run:

         bash fetch-images.sh

     (On Windows, use Git Bash or WSL; alternatively see MANUAL DOWNLOAD below.)

  2. Open index.html in a browser to confirm the eleven images appear.

  3. Upload index.html and the images/ folder together to your web host,
     keeping the folder structure intact. That is the whole deployment.

MANUAL DOWNLOAD
  If you would rather not run the script, open each URL below, save the file
  under the filename given, and place all eleven inside images/.

  Base URL: https://cdn.gamma.app/l1wx6zlr8eymj25

    00-title.png      /generated-images/VL6x8wgLLRyZt-9gbRE-H.png
    01-ventrue.png    /edited-images/-ZcJoUSii3eGGxO6.png
    02-tremere.png    /edited-images/FTl7rXd042wb9HYL.png
    03-nosferatu.png  /generated-images/WWOQuQ6886R7c9pjLPn0M.png
    04-lasombra.png   /generated-images/oX59QbQIUoRzK1ukhoRPa.png
    05-toreador.png   /edited-images/9LVOcnHBjzx9ujfE.png
    06-gangrel.png    /generated-images/6Xk2gX0XUywWnrBOHOGm-.png
    07-malkavian.png  /generated-images/MLroh84J7VfeXG-mkh_iO.png
    08-brujah.png     /generated-images/GZo5CoPTjYs7frCjHPM-i.png
    09-ravnos.png     /generated-images/mgNPLbNWp8MCkxWSF1vYA.png
    10-giovanni.png   /generated-images/m8jDQUAjJdwZ8cwg32-x3.png

NOTES
  · The page is a single scrolling document: masthead, a jump-list of the ten
    clans, then one full section per clan with portrait, disciplines, bane and
    backgrounds. It reflows to a single column below 900px.
  · Typography loads Cinzel and EB Garamond from Google Fonts. If you would
    rather have no external requests at all, delete the three <link> tags in
    <head> — the page falls back to Georgia/Palatino and still reads well.
  · Colours, spacing and fonts are defined as CSS custom properties in the
    :root block at the top of the <style> element. Change them there once and
    the whole page follows.
  · The clan text is reproduced verbatim from the Gamma deck.
