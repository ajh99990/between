import os,sys,json,subprocess
from pathlib import Path
root=Path(sys.argv[1]); label=sys.argv[2]
tracked=subprocess.check_output(['git','-C',str(root),'ls-files','-z']).decode().split('\0')
files=[root/p for p in tracked if p and not p.startswith('research/') and (root/p).is_file()]
code=[p for p in files if p.suffix in ('.js','.mjs','.cjs','.ts','.html','.css','.json','.yaml','.yml')]
def tree(d):
 a=[p for p in d.rglob('*') if p.is_file()] if d.exists() else []
 return dict(files=len(a),bytes=sum(p.stat().st_size for p in a))
nm=tree(root/'node_modules');nm['installed_packages']=sum(1 for p in (root/'node_modules').rglob('package.json') if p.is_file() and (p.parent.parent.name=='node_modules' or p.parent.parent.name.startswith('@') and p.parent.parent.parent.name=='node_modules'))
lock=json.loads((root/'package-lock.json').read_text());nm['lock_packages']=len(lock.get('packages',{}))-1
v=dict(label=label,tracked=dict(files=len(files),bytes=sum(p.stat().st_size for p in files)),source=dict(files=len(code),lines=sum(len(p.read_bytes().splitlines()) for p in code),bytes=sum(p.stat().st_size for p in code)),dependencies=nm,build=tree(root/'dist'),direct_dependencies=len(json.loads((root/'package.json').read_text()).get('dependencies',{})))
print(json.dumps(v,indent=2))
