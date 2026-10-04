#!/usr/bin/env python3
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1]).resolve()
output = pathlib.Path(sys.argv[2]).resolve()
manifest = {}
for directory in ['dist', 'packages/sdk-typescript/dist']:
    paths = sorted((root / directory).rglob('*'))
    if not paths:
        raise SystemExit('Missing built runtime: ' + directory)
    manifest[directory] = [
        {'path': str(path.relative_to(root)), 'bytes': path.stat().st_size,
         'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        for path in paths if path.is_file()
    ]
output.write_text(json.dumps(manifest, indent=2) + '\n')
print(output)
