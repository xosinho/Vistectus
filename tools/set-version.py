"""Give every script and stylesheet of the site the same ?v= marker.

Browsers keep their copy of a script or stylesheet until its address
changes. After changing any .js or .css file, run this once from the
site's folder:

    python tools/set-version.py

and every page asks for the new copies (the marker is the date and time
it was run). It rewrites:
  - every local <script src> and <link href> to a .js or .css file, in
    every .html page (a missing marker is added);
  - every "...js?v=..." / "...css?v=..." address written inside a .js
    file (scripts that load other scripts).
Addresses on other sites (cdnjs, jsDelivr) are left alone: those are
pinned by version and integrity hash instead.
"""
import os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = sys.argv[1] if len(sys.argv) > 1 else time.strftime("%Y%m%d%H%M")
SKIP = {".git", "private", "node_modules"}

TAG = re.compile(r'((?:src|href)=")((?!https?:|//|data:)[^"?#]+\.(?:js|css))(?:\?v=[0-9a-z]+)?(")')
IN_JS = re.compile(r'(["\'])([^"\'\s]+\.(?:js|css))\?v=[0-9a-z]+(["\'])')

pages = scripts = 0
for top, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for name in files:
        path = os.path.join(top, name)
        if name.endswith(".html"):
            pattern, repl = TAG, r"\1\2?v=" + VERSION + r"\3"
        elif name.endswith(".js"):
            pattern, repl = IN_JS, r"\1\2?v=" + VERSION + r"\3"
        else:
            continue
        with open(path, encoding="utf-8") as f:
            text = f.read()
        new = pattern.sub(repl, text)
        if new != text:
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(new)
            if name.endswith(".html"): pages += 1
            else: scripts += 1
print("?v=%s on %d pages and %d scripts" % (VERSION, pages, scripts))
