from pathlib import Path
import shutil,json
r=Path('/workspace/st-research/slice')
removed=[]
def delete(p):
 if p.exists():
  removed.append(str(p.relative_to(r)))
  if p.is_dir():shutil.rmtree(p)
  else:p.unlink()
for p in (r/'public/scripts/extensions').iterdir():
 if p.name not in ['regex','shared.js','third-party']:delete(p)
for p in (r/'public/scripts/extensions/regex').iterdir():
 if p.name!='engine.js':delete(p)
for p in (r/'public/locales').glob('*.json'):
 if p.name not in ['en.json','lang.json']:delete(p)
(r/'public/locales/lang.json').write_text('[]\n')
for name in ['backgrounds','Seraphina','default_Seraphina.png','Eldoria.json','Default_Comfy_Workflow.json','Char_Avatar_Comfy_Workflow.json','themes']:
 delete(r/'default/content'/name)
p=r/'default/content/index.json';items=json.loads(p.read_text());p.write_text(json.dumps([i for i in items if (p.parent/i['filename']).exists()],indent=2)+'\n')
for p in (r/'public/webfonts').iterdir():
 if p.is_dir():
  for q in p.iterdir():
   if q.suffix in ['.woff2','.ttf'] and 'Regular' not in q.name:delete(q)
# Keep fonts referenced by CSS; losing weights affects visual polish only.
Path('/workspace/st-research/stage1-removals.json').write_text(json.dumps(removed,indent=2))
