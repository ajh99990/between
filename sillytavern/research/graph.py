import json,re,subprocess
from pathlib import Path
root=Path('/workspace/st-research/baseline');edges=[];nodes=[]
for folder in ['public','src']:
 for p in (root/folder).rglob('*.js'):
  text=p.read_text();rel=str(p.relative_to(root));nodes.append({'file':rel,'lines':len(text.splitlines()),'bytes':p.stat().st_size})
  for m in re.finditer(r'(?:from\s+|import\s*\()\s*[\'\"]([^\'\"]+)',text):
   spec=m[1];target=str((p.parent/spec).resolve().relative_to(root)) if spec.startswith('.') else spec
   edges.append({'from':rel,'to':target,'line':text[:m.start()].count('\n')+1,'kind':'local' if spec.startswith('.') else 'package'})
Path('/workspace/st-research/evidence/import-graph.json').write_text(json.dumps({'sha':'06bde939fb1e9c4c8d8641d810f0a916b5bce127','nodes':nodes,'edges':edges},indent=2))
