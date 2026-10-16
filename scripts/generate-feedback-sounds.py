#!/usr/bin/env python3
"""Generate original, short, soft game cues. No downloaded sound assets."""
from pathlib import Path
import math
import struct
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 24000
NOTES = {
    'tap': [(660,.04)], 'select': [(740,.045)], 'deselect': [(520,.035)],
    'undo': [(520,.045),(392,.06)], 'drop': [(880,.065)],
    'pour': [(440,.04),(660,.05),(520,.04),(880,.07)],
    'jump': [(440,.035),(660,.045)], 'land': [(294,.04)],
    'collect': [(988,.06),(1319,.10)], 'hint': [(659,.08),(784,.11)],
    'success': [(659,.08),(880,.09),(1109,.14)],
    'win': [(523,.09),(659,.09),(784,.09),(1047,.27)],
    'error': [(247,.09),(196,.12)]
}

def main():
    folder = ROOT/'app/res/raw'
    folder.mkdir(exist_ok=True)
    for name, notes in NOTES.items():
        length = sum(duration*.85 for _,duration in notes[:-1])+notes[-1][1]+.04
        samples = [0.] * int(length*RATE)
        offset = 0
        for frequency,duration in notes:
            for i in range(int(duration*RATE)):
                t=i/RATE
                envelope=min(1.,t/.006)*max(0.,1-t/duration)**1.6
                tone=math.sin(2*math.pi*frequency*t)+.12*math.sin(4*math.pi*frequency*t)*math.exp(-t*20)
                samples[offset+i]+=.24*envelope*tone
            offset+=int(duration*.85*RATE)
        with wave.open(str(folder/f'fx_{name}.wav'),'wb') as output:
            output.setparams((1,2,RATE,0,'NONE','not compressed'))
            output.writeframes(b''.join(struct.pack('<h',round(max(-.8,min(.8,s))*32767)) for s in samples))
        print(f'{name}: {len(samples)/RATE:.3f}s')

if __name__=='__main__':
    main()
