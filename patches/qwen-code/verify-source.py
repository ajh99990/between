#!/usr/bin/env python3
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1]).resolve()
manifest = json.loads(pathlib.Path(__file__).with_name('source-manifest.json').read_text())
for item in manifest['files']:
    data = (root / item['path']).read_bytes()
    if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
        raise SystemExit('Source mismatch: ' + item['path'])
print('Verified source files:', len(manifest['files']))
