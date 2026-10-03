#!/usr/bin/env python3
"""Inspect the installed development APK's WebView; forwards are always removed."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
import websockets

ROOT = Path(__file__).resolve().parents[1]
ADB = os.environ.get('GAME_CENTER_ADB', str(ROOT.parents[1] / '03-Android工具/platform-tools/adb'))
SERIAL = os.environ.get('GAME_CENTER_SERIAL')

def adb(*args):
    command = [ADB] + (['-s', SERIAL] if SERIAL else []) + list(args)
    return subprocess.check_output(command, text=True).strip()

async def call(method, params):
    pid = adb('shell', 'pidof', 'com.dsh.gamecenter').split()[0]
    port = adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid)
    try:
        pages = json.load(urllib.request.urlopen('http://127.0.0.1:' + port + '/json', timeout=5))
        target = next(p for p in pages if p.get('type') == 'page')
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=8_000_000) as ws:
            await ws.send(json.dumps({'id': 1, 'method': method, 'params': params}))
            while True:
                result = json.loads(await ws.recv())
                if result.get('id') == 1:
                    if 'exceptionDetails' in result.get('result', {}):
                        raise RuntimeError(json.dumps(result['result']['exceptionDetails']))
                    if 'error' in result:
                        raise RuntimeError(json.dumps(result['error']))
                    return result.get('result', {})
    finally:
        subprocess.run([ADB] + (['-s', SERIAL] if SERIAL else []) + ['forward', '--remove', 'tcp:' + port],
                       check=False, capture_output=True)

async def evaluate(expression):
    result = await call('Runtime.evaluate', {
        'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    return result.get('result', {}).get('value')

if __name__ == '__main__':
    expression = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    print(json.dumps(asyncio.run(evaluate(expression)), ensure_ascii=False))
