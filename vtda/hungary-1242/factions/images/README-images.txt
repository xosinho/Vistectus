IMAGES USED BY index.html
=========================

index.html expects seven files in this folder, one per faction. Portrait art
is displayed at 3:4; save it at roughly 900 x 1200 px. JPEG, quality ~80, is
ample.

    The Fiends.jpg              The Carpathian Tzimisce   - the ancient claim
    The Bohemian Court.jpg      The Bohemian Court        - the patient rival
    The Shadow Horde.jpg        The Shadow Horde & Cumans - the eyes left behind
    The Empty Seat.jpg          The Papal States          - the faith of the kingdom
    The Holy Roma Empire.jpg    The Holy Roman Empire     - the pressure from every side
    Byzantium.jpg               The Eastern Empire        - the undefended flank
    The Priors.jpg              The Rus Nosferatu         - the price of knowing

Until a file exists, its frame shows a dark gradient drawn in CSS plus the
alt text, at the correct size and proportion. Nothing shifts when the real
picture arrives, and no section looks broken in the meantime. Each <img> in
index.html carries a comment naming the file it is waiting for, and the alt
text describes the intended subject - a usable brief if you are generating
the art.

Filenames must match the names exactly as listed above. Windows does not care
about capitalisation but the live host does.
frame with no obvious cause.

An eighth image is optional: the hero currently uses the same CSS gradient as
the clans page. To put art behind the title instead, add hero.jpg (about
1600 px on the long edge) and one line inside .hero__art in index.html:

    <img src="images/hero.jpg" alt="">

The scrim above it is already in the stylesheet, so the title stays readable
over any picture.
