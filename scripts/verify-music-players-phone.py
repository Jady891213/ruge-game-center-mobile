#!/usr/bin/env python3
"""Same-signed DEV acceptance. Uses an existing private TMP snapshot; restores it in finally.

GAME_CENTER_SERIAL is required. Shared physical UI is operated serially. CDP
touches execute packaged controls; source solutions only choose Brain answers.
"""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
import websockets

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/Design Game Music Players and Brain UI'
BACKUP = ROOT / os.environ.get('GAME_CENTER_QA_SNAPSHOT', 'TMP to delete-436-phone-state.json')
spec = importlib.util.spec_from_file_location('brain_phone', ROOT / 'scripts/verify-brain-phone.py')
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
B.OUT = OUT

async def home(p):
    await p.evaluate("location.href='file:///android_asset/index.html'")
    await p.wait("location.pathname.endsWith('/android_asset/index.html')&&typeof RugePlayersUI!=='undefined'&&document.querySelector('#playerButton').dataset.mounted")
    await asyncio.sleep(.3)

async def restore(p, snapshot):
    await home(p)
    code='''(() => {const s=%s;
      RugeFeedback.setSound(s.feedback.sound);RugeFeedback.setVibration(s.feedback.vibration);
      RugeFeedback.setVolume(s.feedback.volume);RugeMusic.setEnabled(s.music.enabled);
      RugeMusic.setVolume(s.music.volume);RugeScreen.keepAwake(s.awake);
      const f=document.createElement('iframe');document.body.appendChild(f);
      const raw=f.contentWindow.Storage.prototype;
      for(const k of Object.keys(localStorage))if(!Object.hasOwn(s.storage,k))raw.removeItem.call(localStorage,k);
      for(const[k,v]of Object.entries(s.storage))raw.setItem.call(localStorage,k,v);
      f.remove();return true;})()''' % json.dumps(snapshot)
    await p.evaluate(code)
    await home(p)
    # Re-read establishes the restored player epoch. Restore raw global strings
    # once more because boot mirrors native float preferences into JSON.
    await p.evaluate(code)
    await asyncio.sleep(.6)
    actual = await p.evaluate('Object.fromEntries(Object.entries(localStorage))')
    assert actual == snapshot['storage'], 'Raw storage snapshot mismatch'
    native = await p.evaluate('({sound:RugeFeedback.soundEnabled(),vibration:RugeFeedback.vibrationEnabled(),volume:RugeFeedback.volume(),musicEnabled:RugeMusicNative.isEnabled(),musicVolume:RugeMusicNative.volume(),awake:RugeScreen.keepAwakeEnabled()})')
    assert native == {'sound':snapshot['feedback']['sound'], 'vibration':snapshot['feedback']['vibration'],
                      'volume':snapshot['feedback']['volume'], 'musicEnabled':snapshot['music']['enabled'],
                      'musicVolume':snapshot['music']['volume'], 'awake':snapshot['awake']}, native
    return {'exactRawStorage':True, 'keys':len(actual), 'nativePreferences':True}

async def create_player(p, name):
    await p.tap('#playerButton');await p.tap('#playerAdd')
    await p.evaluate("document.querySelector('#playerNameInput').value=" + json.dumps(name))
    # Hide the system keyboard before touching the actual save control.
    B.adb('shell','input','keyevent','111')
    before=await p.evaluate('performance.timeOrigin')
    await p.tap('#playerForm button[type=submit]')
    await p.wait('performance.timeOrigin!=='+str(before)+'&&document.querySelector("#playerName")?.textContent===' + json.dumps(name))

async def select_player(p, name):
    await p.tap('#playerButton')
    before=await p.evaluate('performance.timeOrigin')
    await p.tap('button[aria-label='+json.dumps(name+'，切换到这个玩家',ensure_ascii=False)+']')
    await p.wait('performance.timeOrigin!=='+str(before)+'&&document.querySelector("#playerName")?.textContent===' + json.dumps(name))

async def run(p, report):
    await home(p)
    await p.wait('JSON.parse(RugeMusicNative.status()).playing===true')
    report['homeMusicPlaying'] = True
    await p.tap('#settingsLink');await p.wait("typeof __settings!=='undefined'")
    await p.tap('#musicVolume');await p.tap('#soundVolume')
    v=await p.evaluate('({m:RugeMusic.volume(),s:RugeFX.getVolume(),n:JSON.parse(RugeMusicNative.status()).volume})')
    assert .45<=v['m']<=.55 and .45<=v['s']<=.55 and abs(v['m']-v['n'])<.001, v
    await p.tap('#music');await p.wait('!JSON.parse(RugeMusicNative.status()).playing')
    assert await p.evaluate('RugeFX.enabled("sound")') is False
    await p.tap('#music');await p.wait('JSON.parse(RugeMusicNative.status()).playing')
    await p.tap('#sound');assert await p.evaluate('RugeFX.enabled("sound")') is True
    await p.tap('#sound');assert await p.evaluate('RugeMusic.enabled()') is True
    (OUT/'phone-settings.png').write_bytes(B.adb('exec-out','screencap','-p',binary=True))
    report['settings']={'realTouchSliders':v,'independentSwitches':True}
    await home(p);await create_player(p,'试玩甲')
    assert await p.evaluate('RugePlayers.progressKeys.every(k=>localStorage.getItem(k)===null)')
    await p.evaluate("location.href='file:///android_asset/code-breaker/index.html'")
    await p.wait("typeof __game!=='undefined'")
    await p.tap('button[aria-label="第1关，开始"]');await p.tap('button[aria-label="数字 1"]')
    draft=await p.evaluate('localStorage.getItem("rugeCodebreakerV1")');assert draft
    await home(p);await create_player(p,'试玩乙')
    assert await p.evaluate('localStorage.getItem("rugeCodebreakerV1")===null')
    await select_player(p,'试玩甲');assert await p.evaluate('localStorage.getItem("rugeCodebreakerV1")')==draft
    await p.tap('#playerButton');await p.tap('button[aria-label="编辑 试玩甲"]')
    B.adb('shell','input','keyevent','111');await asyncio.sleep(.4)
    await p.tap('#playerReset')
    await p.wait("!document.querySelector('#playersConfirm').hidden")
    assert '试玩甲' in await p.evaluate('document.querySelector("#playerResetName").textContent')
    await p.tap('#playerKeep');assert await p.evaluate('localStorage.getItem("rugeCodebreakerV1")')==draft
    B.adb('shell','input','keyevent','111');await asyncio.sleep(.4)
    await p.tap('#playerReset');await p.wait("!document.querySelector('#playersConfirm').hidden")
    before=await p.evaluate('performance.timeOrigin')
    await p.tap('#playerConfirmReset')
    await p.wait('performance.timeOrigin!=='+str(before)+'&&document.querySelector("#playerName")?.textContent==="试玩甲"&&localStorage.getItem("rugeCodebreakerV1")===null')
    (OUT/'phone-players.png').write_bytes(B.adb('exec-out','screencap','-p',binary=True))
    report['players']={'emptyNewPlayer':True,'actualGameDraftSeparated':True,'switchRestoresRawDraft':True,'namedResetCancelAndConfirm':True}
    await p.evaluate("location.href='file:///android_asset/hanzi-typing/speaking.html'")
    await p.wait("typeof DemoAudio!=='undefined'&&JSON.parse(RugeMusicNative.status()).playing")
    await p.tap('#readingSpeak')
    await p.wait('JSON.parse(RugeMusicNative.status()).suppressed&&!JSON.parse(RugeMusicNative.status()).playing')
    await p.evaluate('DemoAudio.stop()');await p.wait('JSON.parse(RugeMusicNative.status()).playing')
    report['demoMusicSuppression']=True
    await p.evaluate("location.href='file:///android_asset/voice-quest/index.html'")
    await p.wait("typeof __game!=='undefined'&&document.readyState==='complete'")
    await asyncio.sleep(.3)
    await p.tap('button[aria-label="第1关"]')
    await p.wait("RugeAudioInput.read().status==='listening'",20)
    assert await p.evaluate('JSON.parse(RugeMusicNative.status()).suppressed&&!JSON.parse(RugeMusicNative.status()).playing')
    await p.evaluate('RugeAudioInput.stop()');await p.wait('JSON.parse(RugeMusicNative.status()).playing')
    report['realMicrophoneSuppression']=True
    B.adb('shell','input','keyevent','3');await asyncio.sleep(.6)
    assert await p.evaluate('!JSON.parse(RugeMusicNative.status()).playing')
    B.adb('shell','am','start','-n','com.dsh.gamecenter/.MainActivity');await asyncio.sleep(.6)
    await p.wait('JSON.parse(RugeMusicNative.status()).playing')
    report['backgroundStopsForegroundResumes']=True
    await p.evaluate("location.href='file:///android_asset/brain-school/index.html'")
    await p.wait("typeof __brain!=='undefined'&&BrainSchool.games.size===20")
    (OUT/'phone-brain-hub.png').write_bytes(B.adb('exec-out','screencap','-p',binary=True))
    report['brain']=[]; tracks=set()
    for game in await p.evaluate('[...BrainSchool.games.keys()]'):
        result=await B.solve(p,game,1)
        await p.wait('JSON.parse(RugeMusicNative.status()).playing')
        tracks.add(await p.evaluate('RugeMusic.state().track'))
        report['brain'].append(result);print(json.dumps(result,ensure_ascii=False),flush=True)
    assert len(tracks)==5, tracks
    report['brainCategoryTracks']=sorted(tracks)
    for expected in ('pause','detail','hub','home'):
        dims=B.adb('shell','wm','size').split()[-1];width,height=map(int,dims.split('x'))
        B.adb('shell','input','swipe','2',str(height//2),str(width//2),str(height//2),'220')
        await asyncio.sleep(.6)
        valid=await p.evaluate("location.pathname==='/android_asset/index.html'" if expected=='home' else "__brain.state().paused" if expected=='pause' else "__brain.state().screen==='"+expected+"'")
        assert valid, expected
    report['androidLayeredBack']=True

async def main():
    snapshot=json.loads(BACKUP.read_text())
    pid=B.adb('shell','pidof','com.dsh.gamecenter').split()[0]
    port=B.adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid)
    report={'kind':'MIX 4 actual packaged DEV WebView; real touch controls','version':'4.36'}
    try:
        for attempt in range(30):
            try:
                pages=json.load(urllib.request.urlopen('http://127.0.0.1:'+port+'/json',timeout=2))
                if any(x.get('type')=='page' for x in pages):break
            except OSError:pass
            await asyncio.sleep(.2)
        else:raise RuntimeError('DEV WebView did not become ready')
        target=next(x for x in pages if x.get('type')=='page')
        async with websockets.connect(target['webSocketDebuggerUrl'],max_size=8_000_000) as ws:
            p=B.Phone(ws)
            try:await run(p,report)
            finally:
                report['restore']=await restore(p,snapshot)
                report['touches']=p.touches
    finally:
        subprocess.run([B.ADB,'-s',B.SERIAL,'forward','--remove','tcp:'+port],capture_output=True)
        (OUT/'phone-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':asyncio.run(main())
