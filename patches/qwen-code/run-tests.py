#!/usr/bin/env python3
"""Run the focused suite with no inherited credentials and pre-import network denial."""
import pathlib, shutil, subprocess, sys, tempfile
root = pathlib.Path(__file__).resolve().parent
repo = pathlib.Path(sys.argv[1]).resolve()
evidence = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else repo.parent / 'managed-test-evidence'
evidence.mkdir(parents=True, exist_ok=True)
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js is required')
with tempfile.TemporaryDirectory(prefix='managed-test-home-', dir=evidence) as home:
    env = {
        'PATH': str(pathlib.Path(node).parent) + ':/usr/bin:/bin',
        'HOME': home,
        'QWEN_HOME': home,
        'QWEN_RUNTIME_DIR': home,
        'TMPDIR': home,
        'LANG': 'C.UTF-8',
        'QWEN_TEST_NETWORK_LOG': str(evidence / 'network-attempts.jsonl'),
    }
    result = subprocess.run(['/bin/bash', str(root / 'test.sh'), str(repo)], cwd=repo, env=env)
    raise SystemExit(result.returncode)
