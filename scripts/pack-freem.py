"""The package ふりーむ！ accepts, from the build that is allowed there.

ふりーむ！'s review rules forbid a browser game from opening another website
and from making any external request, and they require a ReadMe naming the
game and its author. So this is not the itch.io zip:

    MONSTERFUSION_BASE=./ MONSTERFUSION_SHARE=off npm run build
    python -I scripts/pack-freem.py

MONSTERFUSION_SHARE=off drops the X and LINE buttons and the share card's
meta tags, so no other site's address is left anywhere in the files. This
script checks that for itself before writing the zip, and refuses if it
finds one - the check is the point, not a formality.

Directory entries are written before the files they hold. A zip without
them extracts fine on Windows and arrives empty on a server; that mistake
cost a blank game on itch.io once already.
"""
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(HERE, "dist")
README = os.path.join(HERE, "scripts", "freem-readme.txt")
OUT = os.path.join(HERE, "monsterfusion-freem.zip")

# Addresses that would put the build in breach. w3.org is the SVG namespace
# and react.dev is the text of a React error; neither is ever requested.
FORBIDDEN = re.compile(rb"x\.com|line\.me|itch\.io|github\.io|supabase")
ALLOWED_HOSTS = {"http://www.w3.org", "https://react.dev"}

if not os.path.isdir(DIST):
    sys.exit("dist/ is missing - build first (see this file's docstring).")

text_ext = {".html", ".js", ".css", ".json", ".svg", ".txt"}
bad = []
hosts = set()
for root, _, names in os.walk(DIST):
    for n in names:
        if os.path.splitext(n)[1].lower() not in text_ext:
            continue
        path = os.path.join(root, n)
        blob = open(path, "rb").read()
        rel = os.path.relpath(path, DIST).replace(chr(92), "/")
        for m in FORBIDDEN.finditer(blob):
            bad.append(f"{rel}: {m.group().decode()}")
        for m in re.finditer(rb"https?://[a-zA-Z0-9._-]+", blob):
            hosts.add(m.group().decode())

strays = sorted(hosts - ALLOWED_HOSTS)
if bad or strays:
    for b in bad:
        print("  forbidden:", b)
    for h in strays:
        print("  outside address:", h)
    sys.exit("This build points somewhere else. Build with MONSTERFUSION_SHARE=off.")

sep = chr(92)
dirs = files = 0
# The ReadMe is opened in Notepad on a Japanese Windows more often than
# anywhere else, so it goes in as UTF-8 with a BOM and CRLF line endings -
# the one spelling that cannot come out as mojibake there.
readme = open(README, encoding='utf-8').read()
readme = readme.replace('\r\n', '\n').replace('\n', '\r\n')
readme = '\ufeff' + readme

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("ReadMe.txt", readme.encode("utf-8"))
    files += 1
    for root, dirnames, filenames in os.walk(DIST):
        dirnames.sort()
        filenames.sort()
        rel = os.path.relpath(root, DIST).replace(sep, "/")
        if rel != ".":
            z.writestr(zipfile.ZipInfo(rel + "/"), b"")
            dirs += 1
        for f in filenames:
            z.write(os.path.join(root, f), f if rel == "." else rel + "/" + f)
            files += 1

print(f"no outside addresses; allowed only {sorted(ALLOWED_HOSTS)}")
print(f"{OUT}  dir entries: {dirs} | files: {files} | {os.path.getsize(OUT):,} bytes")
