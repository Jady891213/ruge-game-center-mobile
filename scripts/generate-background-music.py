#!/usr/bin/env python3
"""Render original, sample-free looping scores; requires NumPy and local FFmpeg only.

No model/network API, downloaded recording, MIDI file or third-party sample is used.
Every note, timbre, mix and circular reverb is specified here. The 16-bar pieces
use distinct original phrases over conventional harmony, with a small and soft
instrument palette. --check decodes the shipped OGGs and validates their manifest.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'app/assets/shared/music'
RATE = 32000
SCALE = [0, 2, 4, 5, 7, 9, 11]
PIECES = {
    'meadow': dict(title='薄荷小花园', bpm=100, root=60, instrument='glock',
                   style='柔和钟琴、拨弦分解和弦与轻键', chords=[0,3,5,4,0,5,3,4,0,3,1,4,5,3,4,0],
                   phrases=[[4,2,1,4,6,5],[2,4,3,1,0],[5,4,2,4,1,2],[3,1,4,2],
                            [2,4,6,4,1],[5,2,3,5,4],[3,4,1,0,2],[4,2,1,3],
                            [6,4,2,1,4,5],[3,1,2,4,0],[2,4,5,2,1],[1,3,4,2],
                            [5,6,4,2,3],[4,1,0,2,4],[3,1,4,2,1],[4,2,1,0]]),
    'orchard': dict(title='木果小步舞', bpm=112, root=62, instrument='wood',
                    style='木琴、短拨弦与柔和中音根音', chords=[0,4,5,3,0,3,1,4,5,3,0,4,3,1,4,0],
                    phrases=[[0,2,4,1,2,5],[4,1,3,4,2],[2,5,4,2,6],[1,3,2,0],
                             [4,2,0,2,4,6],[3,1,4,3,2],[1,4,2,5,3],[4,3,1,2],
                             [5,2,4,6,4],[3,0,2,3,5],[2,4,1,0,2,4],[1,4,3,2],
                             [3,5,2,1,4],[2,1,4,3,1],[4,2,3,1,2],[2,4,1,0]]),
    'paper': dict(title='纸船拨弦', bpm=104, root=65, instrument='pluck',
                  style='温暖拨弦、轻柔琶音与稀疏和弦', chords=[0,5,3,4,1,4,0,3,5,3,1,4,0,3,4,0],
                  phrases=[[2,0,4,2,5],[5,4,1,2],[3,1,4,6,3],[4,2,1,3,2],
                           [1,4,2,0,3],[4,1,3,5],[2,4,0,1,2],[3,5,4,2,1],
                           [5,2,4,1,6],[3,4,1,2],[1,3,5,2,4],[4,3,2,1],
                           [2,4,1,5,4],[3,1,2,4,0],[1,4,2,3,1],[2,0,4,0]]),
    'cloud': dict(title='云朵慢慢想', bpm=92, root=60, instrument='soft',
                  style='柔软合成轻键、绵长和弦与点状钟音', chords=[0,3,5,4,0,1,3,4,5,3,0,4,1,3,4,0],
                  phrases=[[4,1,2,5],[3,0,4,2],[5,4,2,6],[4,2,1],
                           [2,4,1,0],[1,3,5,2],[3,4,1,2],[4,3,1],
                           [5,2,4,6],[3,1,0,4],[2,4,5,1],[4,1,3],
                           [1,4,3,2],[3,2,4,0],[4,2,3,1],[2,4,1,0]]),
    'starlight': dict(title='星星小机关', bpm=108, root=67, instrument='celeste',
                      style='圆润八音盒、木琴应答与轻巧拨弦', chords=[0,4,3,0,5,3,1,4,0,3,5,4,1,3,4,0],
                      phrases=[[4,1,2,4,0,3],[1,3,4,2,5],[3,0,2,4,1],[2,4,5,2],
                               [5,2,6,4,3],[3,4,1,2,0],[1,4,3,5,2],[4,2,1,3],
                               [2,4,1,5,4,2],[3,1,4,0,2],[5,4,2,6,3],[4,3,1,2],
                               [1,3,2,4,5],[3,0,4,2,1],[4,1,3,2,4],[2,4,1,0]])
}


def degree(root, value):
    return root + SCALE[value % 7] + (value // 7) * 12


def voice(midi, seconds, kind):
    n = max(1, int(seconds * RATE))
    t = np.arange(n, dtype=np.float64) / RATE
    f = 440 * 2 ** ((midi - 69) / 12)
    # Low partial count and finite attacks avoid brittle/aliasing transients.
    partials = {'glock': [(1,.86),(2.002,.10),(3.01,.035),(4.1,.005)],
                'wood': [(1,.9),(3,.085),(7,.015)],
                'pluck': [(1,.80),(2,.14),(3,.045),(4,.015)],
                'soft': [(1,.9),(2,.085),(3,.015)],
                'celeste': [(1,.9),(2.001,.085),(4.01,.015)],
                'pad': [(1,.96),(2,.035),(3,.005)],
                'bass': [(1,.97),(2,.03)]}[kind]
    y = np.zeros(n)
    for harmonic, amount in partials:
        damping = np.exp(-t * (1.4 + harmonic * .6) / max(.15, seconds))
        y += np.sin(2*np.pi*f*harmonic*t)*amount*damping
    attack = .07 if kind in ('pad','soft') else .012 if kind == 'bass' else .007
    envelope = (1-np.exp(-t/attack)) * np.minimum(1, (seconds-t)/max(.035, seconds*.14))
    # Exact zero final sample; circularly wrapped release tails preserve continuity.
    envelope[-1] = 0
    return y * np.maximum(0, envelope)


def add_note(mix, start, seconds, midi, kind, gain, pan):
    wave = voice(midi, seconds, kind) * gain
    pos = (int(start * RATE) + np.arange(len(wave))) % len(mix)
    angle = (pan + 1) * np.pi / 4
    np.add.at(mix[:, 0], pos, wave * np.cos(angle))
    np.add.at(mix[:, 1], pos, wave * np.sin(angle))


def render(piece):
    # Vorbis blocks end on a 128-frame boundary. Fit the musical bar grid to the
    # exact frame count rather than introducing encoder padding at the loop seam.
    frames = round(64 * 60 / piece['bpm'] * RATE / 128) * 128
    beat = frames / (64 * RATE)
    mix = np.zeros((frames, 2), dtype=np.float64)
    score = []
    # Not a repeated four-note ostinato: 16 separately specified melody phrases.
    for bar, chord in enumerate(piece['chords']):
        at = bar * 4 * beat
        root = piece['root']
        # Gentle mid-bass, no sub-bass, kick or noise-based percussion.
        for offset, d in ((0,chord), (2,chord+4)):
            add_note(mix, at+offset*beat, beat*1.65, degree(root-12,d), 'bass', .18, 0)
        for d in (chord, chord+2, chord+4):
            add_note(mix, at, beat*4.5, degree(root,d), 'pad', .055, -.13)
        # Alternating six- and eight-step figures, small rests and warm articulations.
        offsets = [0,.75,1.5,2,2.75,3.5] if bar % 2 else [0,.5,1,1.5,2,2.5,3,3.5]
        for j, offset in enumerate(offsets):
            d = chord + [0,4,2,4,0,2,4,2][(j+bar%3)%8]
            add_note(mix, at+offset*beat, beat*.68, degree(root,d), 'pluck', .105, -.33)
        phrase = piece['phrases'][bar]
        # Vary phrase lengths, spacing and endings without changing the loop's meter.
        slots = {3:[.5,1.75,3],4:[.25,1,2,3],5:[0,.75,1.5,2.5,3.25],6:[0,.5,1.25,2,2.75,3.5]}[len(phrase)]
        for j, (d, offset) in enumerate(zip(phrase,slots)):
            midi=degree(root+(12 if root<65 else 0),d)
            duration=beat*(1.05 if j==len(phrase)-1 else .78)
            gain=.23 if piece['instrument']=='soft' else .27
            add_note(mix,at+offset*beat,duration,midi,piece['instrument'],gain,.18)
            score.append([bar,offset,midi,round(duration,6)])
        if bar % 4 in (1,3):
            d=chord+[2,4][bar%2]
            add_note(mix,at+2.5*beat,beat*.95,degree(root,d),'wood',.12,.4)
    # Circular room reflections: the last note's release is already in the first samples.
    dry=mix.copy()
    for seconds,gain in ((.127,.12),(.263,.07),(.419,.035)):
        mix += np.roll(dry,round(seconds*RATE),axis=0)*gain
    mix -= np.mean(mix,axis=0)
    rms=float(np.sqrt(np.mean(mix*mix)))
    mix *= .102/rms
    peak=float(np.max(np.abs(mix)))
    if peak>.43:mix*=.43/peak
    return mix.astype('<f4'),score


def run(command, data=None):
    result=subprocess.run(command,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:raise RuntimeError(result.stderr.decode('utf-8','replace'))
    return result.stdout


def inspect(ffmpeg, path):
    pcm=run([ffmpeg,'-v','error','-i',str(path),'-f','f32le','-ar',str(RATE),'-ac','2','pipe:1'])
    samples=np.frombuffer(pcm,dtype='<f4').reshape(-1,2)
    rms=float(np.sqrt(np.mean(samples.astype(np.float64)**2)))
    peak=float(np.max(np.abs(samples)))
    step=float(np.max(np.abs(samples[-1]-samples[0])))
    return dict(duration_seconds=round(len(samples)/RATE,6),frames=len(samples),
                decoded_peak=round(peak,8),decoded_rms=round(rms,8),
                decoded_rms_dbfs=round(20*np.log10(max(rms,1e-12)),3),
                loop_boundary_max_step=round(step,8),
                adjacent_step_p99=round(float(np.quantile(np.abs(np.diff(samples,axis=0)),.99)),8))


def verify(ffmpeg):
    manifest=json.loads((DEST/'manifest.json').read_text())
    assert {p['id'] for p in manifest['tracks']}==set(PIECES)
    for item in manifest['tracks']:
        path=DEST/item['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256'],path
        metrics=inspect(ffmpeg,path)
        assert 32<=metrics['duration_seconds']<=48,metrics
        assert .05<metrics['decoded_rms']<.15,metrics
        assert metrics['decoded_peak']<.55,metrics
        assert metrics['loop_boundary_max_step']<.035,metrics
        assert metrics['loop_boundary_max_step']<max(.006,metrics['adjacent_step_p99']*2),metrics
        for key in metrics:assert abs(metrics[key]-item[key])<.00002,(key,metrics,item)
        print(item['id'],json.dumps(metrics,ensure_ascii=False))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg',default=shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg')
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    if args.check:return verify(args.ffmpeg)
    DEST.mkdir(parents=True,exist_ok=True)
    encoders=run([args.ffmpeg,'-hide_banner','-encoders']).decode()
    encoder='libvorbis' if 'libvorbis' in encoders else 'vorbis'
    encoding=['-c:a',encoder,'-q:a','4']
    if encoder=='vorbis':encoding+=['-strict','-2']
    items=[]
    for ident,piece in PIECES.items():
        mix,score=render(piece)
        path=DEST/(ident+'.ogg')
        run([args.ffmpeg,'-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','2','-i','pipe:0',
             '-map_metadata','-1',*encoding,'-fflags','+bitexact','-flags:a','+bitexact',str(path)],mix.tobytes())
        item=dict(id=ident,title=piece['title'],file=path.name,bpm=piece['bpm'],bars=16,beats_per_bar=4,
                  style=piece['style'],codec='Vorbis',encoder=encoder,container='Ogg',sample_rate=RATE,channels=2,
                  sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size,
                  original_melody_score=score,**inspect(args.ffmpeg,path))
        items.append(item)
    manifest=dict(schema=1,source='Original programmatically composed and DSP-synthesized for Game Center; no external samples, recordings, known melody or network generation API.',
                  generator='scripts/generate-background-music.py',generator_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  license='CC0-1.0',ffmpeg_version=run([args.ffmpeg,'-version']).decode().splitlines()[0],tracks=items)
    (DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    verify(args.ffmpeg)


if __name__=='__main__':main()
