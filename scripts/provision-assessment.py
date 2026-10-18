#!/usr/bin/env python3
"""DEV-only private Keystore provisioning. Explicit serial required. Never logs credentials."""
import argparse,asyncio,importlib.util,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
async def provision():
    private=module('assessment_private',ROOT/'scripts/assessment-private.py');phone=module('phone_cdp',ROOT/'scripts/phone-cdp.py')
    ready=await phone.evaluate("({url:location.href,allowed:!!window.RugeAssessment?.available()})")
    if not ready or ready.get('url')!='file:///android_asset/hanzi-typing/speaking.html' or not ready.get('allowed'):raise ValueError('Open the packaged Chinese speaking page in the foreground DEV APK')
    config=private.read_configuration()
    minimaxPath=ROOT/'.local-voice/minimax-tts.env'
    if minimaxPath.exists():
        tts=module('demo_tts',ROOT/'scripts/generate-demo-audio.py')
        config['minimaxToken']=tts.read_key()
    try:
        # Only boolean output crosses back. Do not print the expression or CDP exception details.
        expression='(()=>{try{return RugeAssessment.configure('+json.dumps(json.dumps(config))+')===true&&RugeAssessment.configured()===true}catch(_){return false}})()'
        ok=await phone.evaluate(expression)
        if ok is not True:raise ValueError('Device did not accept private configuration')
        return {'configured':True,'storage':'Android Keystore AES-GCM; credentials not embedded in APK'}
    finally:config.clear()
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--serial',required=True);p.add_argument('--adb');args=p.parse_args();os.environ['GAME_CENTER_SERIAL']=args.serial
    if args.adb:os.environ['GAME_CENTER_ADB']=args.adb
    try:print(json.dumps(asyncio.run(provision())));return 0
    except Exception:print('Private provisioning failed; details redacted. Check DEV APK, packaged speaking page, foreground and local configuration.',file=sys.stderr);return 1
if __name__=='__main__':raise SystemExit(main())
