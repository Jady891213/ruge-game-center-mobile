#!/usr/bin/env python3
"""MIX 4 real WebView touch QA, preserving every existing localStorage value.

Requires the same-signed DEV APK foreground and GAME_CENTER_SERIAL. No answer
callbacks are called: CDP is used to read questions and dispatch real touch pairs.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import websockets

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/Design Brain School 20'
ADB = os.environ.get('GAME_CENTER_ADB', str(ROOT.parents[1] / '03-Android工具/platform-tools/adb'))
SERIAL = os.environ['GAME_CENTER_SERIAL']
BACKUP = ROOT / 'TMP to delete-brain-phone-progress.json'

def adb(*args, binary=False):
    return subprocess.check_output([ADB, '-s', SERIAL, *args], text=not binary).strip() if not binary else subprocess.check_output([ADB, '-s', SERIAL, *args])

class Phone:
    def __init__(self, ws):
        self.ws, self.serial, self.touches = ws, 0, 0

    async def call(self, method, params):
        self.serial += 1
        await self.ws.send(json.dumps({'id': self.serial, 'method': method, 'params': params}))
        while True:
            data = json.loads(await self.ws.recv())
            if data.get('id') == self.serial:
                if data.get('error') or data.get('result', {}).get('exceptionDetails'):
                    raise RuntimeError(str(data))
                return data.get('result', {})

    async def evaluate(self, code):
        data = await self.call('Runtime.evaluate', {'expression': code, 'returnByValue': True, 'awaitPromise': True})
        return data.get('result', {}).get('value')

    async def wait(self, expression, timeout=20):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                if await self.evaluate(expression):
                    return
            except RuntimeError:
                pass  # Navigation destroys the old execution context briefly.
            await asyncio.sleep(.1)
        raise RuntimeError('Timed out: ' + expression)

    async def tap(self, selector, index=0):
        position = await self.evaluate('''(() => {
          const e=document.querySelectorAll(%s)[%d];
          if(!e||e.disabled)throw Error('Missing/disabled touch control');
          e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
          if(!r.width||!r.height)throw Error('Hidden touch control');
          return {x:r.x+r.width/2,y:r.y+r.height/2};
        })()''' % (json.dumps(selector), index))
        await self.call('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [position]})
        await self.call('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        self.touches += 1
        await asyncio.sleep(.08)

async def solve(phone, game, level=1):
    await phone.evaluate('__brain.start(%s,%d,%d)' % (json.dumps(game), 41291 + level, level))
    await phone.wait("__brain.state().screen==='play'")
    q = await phone.evaluate('__brain.question()')
    answer = await phone.evaluate('__brain.definition().solution(__brain.question())')
    await asyncio.sleep(.15)
    (OUT / ('phone-' + ('high-' if level > 1 else '') + game + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    before = phone.touches
    if game == 'whack-match':
        found = set()
        for _ in range(120):
            visible = await phone.evaluate("[...document.querySelectorAll('.identify-hole')].map((e,i)=>({index:i,id:+e.querySelector('.symbol').dataset.symbol,caught:e.classList.contains('caught')}))")
            for item in visible:
                if not item['caught'] and item['id'] in q['targets'] and item['id'] not in found:
                    await phone.tap('.identify-hole', item['index'])
                    found.add(item['id'])
            if len(found) == len(q['targets']):
                break
            await asyncio.sleep(.15)
    elif game == 'species-spotlight':
        await phone.tap('.identify-dark')
        await phone.tap('#stage>.primary')
        await phone.tap('.choices .tile', q['species'].index(answer))
    elif game == 'frame-filler':
        await phone.tap('.identify-patch', answer)
    elif game == 'fast-focus':
        await asyncio.sleep(q['reveal'] / 1000)
        await phone.tap('.choices .tile', q['options'].index(answer))
    elif game in ('flash-memory', 'reverse-retention'):
        await phone.wait("!document.querySelector('#stage .choices .tile').disabled")
        pool = q.get('keys', q.get('pool'))
        for token in answer:
            await phone.tap('.choices .tile', pool.index(token))
    elif game == 'memo-random':
        await phone.tap('.memory-remember')
        for token in answer:
            await phone.tap('.memory-options .tile', q['pool'].index(token))
    elif game == 'covered-cages':
        await phone.wait("!document.querySelector('.memory-cage').disabled")
        for slot in answer:
            await phone.tap('button[aria-label="第%d个鸟笼"]' % (slot + 1))
    elif game in ('cube-count', 'heavyweight'):
        await phone.tap('.choices .tile', q['options'].index(answer) if game == 'cube-count' else q['items'].index(answer))
    elif game == 'match-blast':
        for piece in answer:
            await phone.tap('[data-piece="%s"]' % piece)
            await asyncio.sleep(.32)
            if (await phone.evaluate('__brain.state()'))['correct']:
                break
    elif game == 'speed-sorting':
        for item in answer:
            await phone.tap('.choices .tile', q['items'].index(item))
        if q['kind'] == 'category':
            await phone.tap('.analysis-submit')
    elif game == 'add-agency':
        for index in answer:
            await phone.tap('.choices .tile', index)
    elif game == 'mallet-math':
        for index, value in enumerate(q['values']):
            if index not in answer:
                await phone.tap('button[aria-label="敲掉数字%d 第%d块"]' % (value, index + 1))
                if (await phone.evaluate('__brain.state()'))['correct']:
                    break
    elif game == 'tick-tock':
        delta = q['delta']
        for amount in (60, 5):
            while abs(delta) >= amount:
                sign = 1 if delta > 0 else -1
                label = ('+' if sign > 0 else '−') + ('1时' if amount == 60 else '5分')
                await phone.tap('button[aria-label=%s]' % json.dumps(label, ensure_ascii=False))
                delta -= sign * amount
        await phone.tap('#stage>.primary')
    elif game == 'balloon-burst':
        for value in answer:
            await phone.tap('button[aria-label="气球%d"]' % value)
    elif game == 'shape-parts':
        for piece in answer:
            await phone.tap('button[aria-label="积木图形%d"]' % (piece + 1))
    elif game == 'shadow-shift':
        for item in answer:
            await phone.tap('.choices .tile', q['candidates'].index(item))
        await phone.tap('.visual-submit')
    elif game == 'train-turn':
        for turn in answer:
            await phone.wait("!document.querySelector('#stage .choices .tile').disabled")
            await phone.tap('.choices .tile', turn + 1)
            await asyncio.sleep(.1)
    elif game == 'true-view':
        await phone.tap('.visual-view-choice', answer)
    else:
        raise RuntimeError('Unverified game: ' + game)
    await phone.wait('__brain.state().correct===1', 20)
    state = await phone.evaluate('__brain.state()')
    assert state['score'] > 0 and state['mistakes'] == 0, (game, state)
    await phone.wait('__brain.state().round===2')
    await phone.tap('#pauseButton')
    paused = await phone.evaluate('__brain.state()')
    await asyncio.sleep(.3)
    assert (await phone.evaluate('__brain.state()'))['remaining'] == paused['remaining']
    await phone.tap('#resume')
    return {'id': game, 'level': level, 'touches': phone.touches - before, 'correct': state['correct'], 'score': state['score'], 'pause': True, 'next': True}

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pid = adb('shell', 'pidof', 'com.dsh.gamecenter').split()[0]
    port = adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid)
    report = {'results': [], 'gestures': [], 'progressRestored': False}
    try:
        for attempt in range(30):
            try:
                pages = json.load(urllib.request.urlopen('http://127.0.0.1:' + port + '/json', timeout=2))
                if pages:
                    break
            except OSError:
                pass
            await asyncio.sleep(.2)
        else:
            raise RuntimeError('WebView debug endpoint did not become ready')
        target = next(p for p in pages if p.get('type') == 'page')
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=8_000_000) as ws:
            phone = Phone(ws)
            original = json.loads(BACKUP.read_text()) if BACKUP.exists() else await phone.evaluate('Object.fromEntries(Object.entries(localStorage))')
            if not BACKUP.exists():
                BACKUP.write_text(json.dumps(original, ensure_ascii=False))
            try:
                await phone.evaluate("location.href='file:///android_asset/brain-school/index.html'")
                await phone.wait("typeof __brain!=='undefined'&&BrainSchool.games.size===20")
                games = os.environ.get('BRAIN_GAMES', '').split(',') if os.environ.get('BRAIN_GAMES') else await phone.evaluate('[...BrainSchool.games.keys()]')
                level = int(os.environ.get('BRAIN_LEVEL', '1'))
                for game in games:
                    result = await solve(phone, game, level)
                    report['results'].append(result)
                    print(json.dumps(result, ensure_ascii=False), flush=True)
                # Real edge gesture goes through Android's dispatcher and page hierarchy.
                await phone.evaluate("__brain.start('fast-focus',711)")
                dimensions = adb('shell', 'wm', 'size').split()[-1]
                width, height = map(int, dimensions.split('x'))
                for expected in ('pause', 'detail', 'hub', 'home'):
                    adb('shell', 'input', 'swipe', '2', str(height // 2), str(width // 2), str(height // 2), '220')
                    await asyncio.sleep(.65)
                    state = await phone.evaluate("({url:location.href,state:typeof __brain==='undefined'?null:__brain.state()})")
                    valid = state['url'].endswith('/android_asset/index.html') if expected == 'home' else state['state']['paused'] if expected == 'pause' else state['state']['screen'] == expected
                    assert valid, (expected, state)
                    report['gestures'].append(expected)
            finally:
                await phone.evaluate("location.href='file:///android_asset/index.html'")
                await phone.wait("location.href.endsWith('/android_asset/index.html')")
                await asyncio.sleep(.5)
                await phone.evaluate('''(() => {const saved=%s;for(const k of Object.keys(localStorage))if(!Object.hasOwn(saved,k))localStorage.removeItem(k);for(const [k,v]of Object.entries(saved))localStorage.setItem(k,v);return true;})()''' % json.dumps(original))
                await asyncio.sleep(.5)
                restored = await phone.evaluate('Object.fromEntries(Object.entries(localStorage))')
                report['progressRestored'] = original == restored
                report['originalKeys'] = len(original)
                report['progressSHA256'] = hashlib.sha256(json.dumps(restored, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                assert report['progressRestored']
    finally:
        subprocess.run([ADB, '-s', SERIAL, 'forward', '--remove', 'tcp:' + port], capture_output=True)
        (OUT / ('phone-review-high.json' if os.environ.get('BRAIN_GAMES') else 'phone-review.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    asyncio.run(main())
