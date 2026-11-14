"""
Syntax check of the repo's Python (review R2-004): compiles every file under props/, characters/ and stickers/renderer/ in
memory, with no bpy and no Blender, and exits 1 listing each file that does not compile. Nothing is run or written.
Usage (from the repo root): python3 tools/check-python.py   (npm run check runs it with the other checks)
"""
import glob, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = sorted({f for p in ("props/**/*.py", "characters/**/*.py", "stickers/renderer/*.py")
                for f in glob.glob(os.path.join(ROOT, p), recursive=True)})
bad = []
for f in files:
    try:
        with open(f, encoding="utf-8") as fh:
            compile(fh.read(), f, "exec")
    except (SyntaxError, ValueError, UnicodeDecodeError) as e:
        bad.append(f"{os.path.relpath(f, ROOT)}: {e}")
if bad:
    print(f"{len(bad)} problem(s):\n  " + "\n  ".join(bad), file=sys.stderr)
    sys.exit(1)
print(f"check-python: {len(files)} files compile")
