from pathlib import Path
import re,sys
r=Path(sys.argv[1])
for family in ['NotoSans','NotoSansMono']:
 d=r/'public/webfonts'/family
 s=(d/'stylesheet.css').read_text()
 blocks=re.findall(r'@font-face\s*\{[^}]+\}',s)
 keep=[b for b in blocks if 'regular.' in b.lower()]
 assert len(keep)==1,(family,len(keep))
 (d/'stylesheet.css').write_text('/* Research slice: retain regular face only; bold/italic synthesized by browser. */\n'+keep[0]+'\n')
 for p in d.iterdir():
  if p.suffix in ['.woff','.woff2','.ttf'] and 'regular.' not in p.name.lower():p.unlink()
