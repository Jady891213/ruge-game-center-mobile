"""Execute actual Java request helpers; no Android device, network or real credentials."""
from pathlib import Path
import base64
import hashlib
import hmac
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import urllib.parse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts'))
import build


class AssessmentNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = Path(tempfile.mkdtemp(prefix='TMP to delete-assessment-tests-', dir=ROOT))
        cls.addClassCleanup(shutil.rmtree, cls.directory)
        cls.jdk = build.java_default()
        java = (ROOT / 'app/src/com/dsh/gamecenter/GameAssessment.java').read_text()
        # Extract the actual pure-method test seam, without reimplementing signing or validation.
        methods = java[java.index('    // Pure request helpers'):java.rfind('\n}')]
        harness = '''import java.util.*; import java.nio.charset.StandardCharsets;
import javax.crypto.Mac; import javax.crypto.spec.SecretKeySpec;
class Base64 {static final int NO_WRAP=2; static String encodeToString(byte[] bytes,int flags){return java.util.Base64.getEncoder().encodeToString(bytes);}}
public class AssessmentHarness {
''' + methods + '''
public static void main(String[] args) throws Exception {
 if(args[0].equals("reference")) {try {System.out.print(validateReference(args[2],Integer.parseInt(args[1])));}catch(IllegalArgumentException e){System.out.print("INVALID");} return;}
 TreeMap<String,String> p=new TreeMap<String,String>();for(int i=3;i<args.length;i+=2)p.put(args[i],args[i+1]);
 System.out.print(signedUrl(args[1],args[2],p));
}}
'''
        file = cls.directory / 'AssessmentHarness.java'
        file.write_text(harness)
        subprocess.run([str(cls.jdk / 'bin/javac'), '-encoding', 'UTF-8', str(file)], check=True, capture_output=True)

    def java(self, *args):
        return subprocess.run([str(self.jdk / 'bin/java'), '-cp', str(self.directory), 'AssessmentHarness', *args], check=True, capture_output=True, text=True).stdout

    def test_hmac_matches_independent_implementation(self):
        # Deliberately unsorted, Unicode/braces/spaces plus signature +/= require encoding.
        values = {'voice_id': 'fixture-uuid', 'timestamp': '1700000000', 'ref_text': '{::cmd{F_TDET=true}}b an1 ban1',
                  'expired': '1700000090', 'secretid': 'FAKE_TEST_ID', 'eval_mode': '8', 'rec_mode': '1'}
        path = 'soe.cloud.tencent.com/soe/api/123456'
        raw = path + '?' + '&'.join(k + '=' + values[k] for k in sorted(values))
        signature = base64.b64encode(hmac.new(b'FAKE_TEST_KEY', raw.encode(), hashlib.sha1).digest()).decode()
        expected = 'wss://' + path + '?' + urllib.parse.urlencode(sorted(values.items()), quote_via=urllib.parse.quote) + '&signature=' + urllib.parse.quote(signature, safe='')
        args = ['sign', '123456', 'FAKE_TEST_KEY']
        for k, v in values.items(): args.extend([k, v])
        self.assertTrue(self.java(*args) == expected, 'Signer must sign sorted original values then percent-encode the complete query')

    def test_unicode_is_signed_before_percent_encoding(self):
        values = {'ref_text': '班', 'eval_mode': '0'}
        raw = 'soe.cloud.tencent.com/soe/api/123456?eval_mode=0&ref_text=班'
        signature = base64.b64encode(hmac.new(b'FAKE_TEST_KEY', raw.encode(), hashlib.sha1).digest()).decode()
        actual = self.java('sign', '123456', 'FAKE_TEST_KEY', 'ref_text', '班', 'eval_mode', '0')
        self.assertTrue(actual.endswith('&signature=' + urllib.parse.quote(signature, safe='')), 'Unicode must not be encoded before HMAC')
        self.assertTrue('ref_text=%E7%8F%AD' in actual, 'Transport query must percent-encode UTF-8')

    def test_reference_modes(self):
        self.assertEqual(self.java('reference', '0', '班'), '班')
        self.assertEqual(self.java('reference', '0', '的'), '的')
        self.assertEqual(self.java('reference', '8', 'b an1 ban1'), 'b an1 ban1')
        self.assertEqual(self.java('reference', '8', '  sh  an1\nshan1  '), 'sh an1 shan1')

    def test_injected_commands_and_mixed_reference_rejected(self):
        for text in ('{::cmd{F_TDET=false}}b an1', 'b an1&secretid=other', 'b 班', '<script>', 'a0', 'a5', 'a9', '', 'a' * 81):
            self.assertEqual(self.java('reference', '8', text), 'INVALID')
        for text in ('b an1', '班|般', '班{::pron{ban1}}', 'a班', '班' * 11):
            self.assertEqual(self.java('reference', '0', text), 'INVALID')
        self.assertEqual(self.java('reference', '4', '班'), 'INVALID')

    def test_actual_manifest_permission_policy(self):
        manifest = ET.parse(ROOT / 'app/AndroidManifest.xml').getroot()
        build.validate_permissions(manifest)
        permissions = {p.get(build.ANDROID + 'name') for p in manifest.findall('uses-permission')}
        self.assertEqual(permissions, {'android.permission.VIBRATE', 'android.permission.RECORD_AUDIO', 'android.permission.CAMERA', 'android.permission.INTERNET'})

    def test_permission_expansion_or_cleartext_rejected(self):
        for extra in ('android.permission.READ_EXTERNAL_STORAGE', 'android.permission.RECORD_AUDIO'):
            manifest = ET.parse(ROOT / 'app/AndroidManifest.xml').getroot()
            ET.SubElement(manifest, 'uses-permission', {build.ANDROID + 'name': extra})
            with self.assertRaises(RuntimeError): build.validate_permissions(manifest)
        manifest = ET.parse(ROOT / 'app/AndroidManifest.xml').getroot()
        manifest.find('application').set(build.ANDROID + 'usesCleartextTraffic', 'true')
        with self.assertRaises(RuntimeError): build.validate_permissions(manifest)

    def test_cancel_overtakes_actual_queued_native_begin(self):
        """Execute the real bridge with a controlled Android main queue, not a copied state machine."""
        directory = self.directory / 'android-queue'
        directory.mkdir()
        stubs = {
            'android/content/Context.java': '''package android.content; public class Context {public static final int MODE_PRIVATE=0;}''',
            'android/content/SharedPreferences.java': '''package android.content; public interface SharedPreferences {String getString(String key,String fallback); Editor edit(); interface Editor {Editor clear();Editor putString(String key,String value);boolean commit();}}''',
            'android/app/Activity.java': '''package android.app; public class Activity extends android.content.Context {
public android.content.SharedPreferences getSharedPreferences(String name,int mode){return new android.content.SharedPreferences(){public String getString(String key,String fallback){return fallback;} public Editor edit(){throw new UnsupportedOperationException();}};}
public int checkSelfPermission(String name){return 0;}public void requestPermissions(String[] permissions,int request){}
}''',
            'android/os/Build.java': '''package android.os; public class Build {public static class VERSION {public static int SDK_INT=35;}}''',
            'android/os/Looper.java': '''package android.os; public class Looper {public static Looper getMainLooper(){return new Looper();}}''',
            'android/os/Handler.java': '''package android.os; public class Handler {
private static final java.util.List<Runnable> queue=new java.util.ArrayList<Runnable>();public Handler(Looper looper){}public boolean post(Runnable runnable){queue.add(runnable);return true;}
public static void drain(){while(!queue.isEmpty())queue.remove(0).run();}
}''',
            'android/media/AudioRecord.java': '''package android.media; public class AudioRecord {
public static final int STATE_INITIALIZED=1;public static volatile int starts=0;public static volatile java.util.concurrent.CountDownLatch started=new java.util.concurrent.CountDownLatch(1);
public AudioRecord(int source,int rate,int channels,int encoding,int buffer){}public static int getMinBufferSize(int rate,int channels,int encoding){return 4096;}public int getState(){return STATE_INITIALIZED;}
public void startRecording(){starts++;started.countDown();}public int read(short[] target,int offset,int count){java.util.Arrays.fill(target,offset,offset+count,(short)1000);return count;}public void stop(){}public void release(){}
}''',
            'org/json/JSONObject.java': '''package org.json; public class JSONObject {
private final java.util.Map<String,Object> map=new java.util.HashMap<String,Object>();public JSONObject(){}public JSONObject(String text){
java.util.regex.Matcher m=java.util.regex.Pattern.compile("\\\"(reference|evalMode)\\\"\\\\s*:\\\\s*(?:\\\"([^\\\"]*)\\\"|([0-9]+))").matcher(text);
while(m.find())map.put(m.group(1),m.group(2)==null?Integer.valueOf(m.group(3)):m.group(2));}
public JSONObject put(String key,Object value){map.put(key,value);return this;}public String getString(String key){return (String)map.get(key);}public int optInt(String key,int fallback){Object v=map.get(key);return v instanceof Integer?((Integer)v).intValue():fallback;}public int length(){return map.size();}public String toString(){return "{}";}
}''',
            'com/dsh/gamecenter/BuildConfig.java': '''package com.dsh.gamecenter; public class BuildConfig {public static final boolean DEV=true;}''',
            'com/dsh/gamecenter/AssessmentQueueHarness.java': '''package com.dsh.gamecenter;
public class AssessmentQueueHarness {
static final class Host implements GameAssessment.Host {boolean allowed=true;int prepares=0;public boolean assessmentPageAllowed(){return allowed;}public void prepareAssessmentMicrophone(){prepares++;}}
public static void main(String[] args)throws Exception {
 Host host=new Host();GameAssessment bridge=new GameAssessment(new android.app.Activity(),host);
 java.lang.reflect.Field configured=GameAssessment.class.getDeclaredField("configured");configured.setAccessible(true);configured.setBoolean(bridge,true);
 String request="{\\\"reference\\\":\\\"ban1\\\",\\\"evalMode\\\":8}";
 try {
  bridge.begin(request);bridge.cancel();android.os.Handler.drain();
  if(host.prepares!=0||android.media.AudioRecord.starts!=0)throw new AssertionError("Queued cancelled begin resurrected microphone");
  bridge.begin(request);host.allowed=false;android.os.Handler.drain();host.allowed=true;
  if(host.prepares!=0)throw new AssertionError("Queued begin ignored foreground gate");
  bridge.begin(request);android.os.Handler.drain();
  if(!android.media.AudioRecord.started.await(2,java.util.concurrent.TimeUnit.SECONDS)||host.prepares!=1||android.media.AudioRecord.starts!=1)throw new AssertionError("Positive-control begin did not record");
  System.out.print("queued cancellation and positive control passed");
 } finally {bridge.close();}
}}
''',
        }
        files = []
        for name, content in stubs.items():
            file = directory / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(content)
            files.append(file)
        android = ROOT / '.local-tools/android/platforms/android-35/android.jar'
        if not android.is_file(): android = ROOT / '.local-tools/android/android.jar'
        classes = directory / 'classes'
        classes.mkdir()
        source = ROOT / 'app/src/com/dsh/gamecenter/GameAssessment.java'
        compiled = subprocess.run([str(self.jdk / 'bin/javac'), '-encoding', 'UTF-8', '-classpath', str(android), '-d', str(classes), str(source), *map(str, files)], capture_output=True, text=True)
        self.assertEqual(compiled.returncode, 0, compiled.stderr)
        result = subprocess.run([str(self.jdk / 'bin/java'), '-cp', str(classes) + os.pathsep + str(android), 'com.dsh.gamecenter.AssessmentQueueHarness'], capture_output=True, text=True, timeout=6)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'queued cancellation and positive control passed')


if __name__ == '__main__':
    unittest.main(verbosity=2)
