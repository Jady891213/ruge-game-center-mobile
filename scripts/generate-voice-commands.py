#!/usr/bin/env python3
"""Generate actual KWS rows and visible command phrases from one reviewed manifest."""
from pathlib import Path
import argparse,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
BEGIN='// BEGIN GENERATED COMMAND PHRASES';END='// END GENERATED COMMAND PHRASES'
def outputs():
 m=json.loads((ROOT/'app/assets/voice-model/commands.json').read_text());tokens={line.rsplit(' ',1)[0]for line in(ROOT/'app/assets/voice-model/tokens.txt').read_text().splitlines()};seen={};rows=[];phrases={}
 for c in m['commands']:
  if len(c['phrases'])<5:raise ValueError('At least five actual phrases per action are required')
  phrases[c['id']]=[p['text']for p in c['phrases']]
  for p in c['phrases']:
   if len(p['text'])<2 or p['text']in seen:raise ValueError('Single-character or duplicate command')
   seen[p['text']]=c['id']
   for sequence in p['tokens']:
    if any(t not in tokens for t in sequence):raise ValueError('Unknown model token in '+p['text'])
    rows.append(' '.join(sequence)+' :'+str(p['score'])+' #'+str(p['threshold'])+' @'+c['id'])
 for p in m.get('ignoredPhrases',[]):
  for sequence in p['tokens']:
   if any(t not in tokens for t in sequence):raise ValueError('Unknown ignored phrase token')
   rows.append(' '.join(sequence)+' :'+str(p['score'])+' #'+str(p['threshold'])+' @__ignore__')
 js=BEGIN+'\nconst commandPhrases=Object.freeze('+json.dumps(phrases,ensure_ascii=False,separators=(',',':'))+');\n'+END
 p=ROOT/'app/assets/shared/audio-input.js';audio=p.read_text()
 if BEGIN in audio:audio=audio[:audio.index(BEGIN)]+js+audio[audio.index(END)+len(END):]
 else:audio=audio.replace("'use strict';", "'use strict';\n"+js,1)
 return{ROOT/'app/assets/voice-model/keywords.txt':'\n'.join(rows)+'\n',p:audio}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');a=p.parse_args()
 for path,text in outputs().items():
  if a.check:
   if path.read_text()!=text:raise SystemExit('Generated voice inputs are stale')
  else:path.write_text(text)
 if not a.check:
  p=ROOT/'vendor/voice/sources.json';data=json.loads(p.read_text());model=ROOT/'app/assets/voice-model/commands.json'
  if not any(x['path']==model.relative_to(ROOT).as_posix()for x in data['models']):data['models'].append({'path':model.relative_to(ROOT).as_posix()})
  for e in data['models']:
   if e['path'] in ['app/assets/voice-model/keywords.txt','app/assets/voice-model/commands.json']:
    b=(ROOT/e['path']).read_bytes();e['bytes']=len(b);e['sha256']=hashlib.sha256(b).hexdigest()
  p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 print('command manifest / actual KWS / visible phrase data match')
if __name__=='__main__':main()
