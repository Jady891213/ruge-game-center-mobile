import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),source=readFileSync(resolve(root,'app/src/com/dsh/gamecenter/MainActivity.java'),'utf8');
const candidate=process.env.JAVA_HOME||resolve(homedir(),'Library/Java/JavaVirtualMachines/openjdk-18.0.2.1/Contents/Home');
const bin=n=>existsSync(resolve(candidate,'bin',n))?resolve(candidate,'bin',n):n;
test('真实原生返回方法等待页内结果、防重入、旧页/迟到结果和超时误退；首页才能退出',t=>{
 if(spawnSync(bin('javac'),['-version']).status!==0){t.skip('JDK unavailable');return;}
 const body=source.slice(source.indexOf('    public void onBackPressed() {'),source.indexOf('    @Override\n    protected void onPause()'));
 assert.match(source,/protected void onPause\(\)[^]*?foreground = false;\s*backGeneration\+\+;\s*backPending = false;/);
 assert.match(source,/backRequestActive\(long generation\)[^]*?!destroyed && foreground && backPending && generation == backGeneration/);
 assert.match(source,/evaluateJavascript\([^]*?backRequestActive\(/);
 assert.match(source,/onPageStarted[^]*?backGeneration\+\+;\s*backPending = false;/);
 const temp=mkdtempSync(resolve(root,'TMP to delete-native-back-'));
 const java=`import java.util.*;
interface ValueCallback<T>{void onReceiveValue(T value);}
class android {static class net {static class Uri {String s;Uri(String s){this.s=s;}static Uri parse(String s){return new Uri(s);}String getPath(){return java.net.URI.create(s).getPath();}}}}
public class BackHarness {
 boolean destroyed=false,foreground=true,backPending=false;long backGeneration=0,lastBackAt=0;Web web=new Web();int finished=0,orientation=0;
 static class SystemClock {static long now=1000;static long uptimeMillis(){return now;}}
 static class ActivityInfo {static int SCREEN_ORIENTATION_SENSOR_PORTRAIT=7;}
 static class Web {String url="file:///android_asset/hanzi-library/index.html";int evaluations=0,loads=0;ValueCallback<String> callback;List<Runnable> timers=new ArrayList<>();String getUrl(){return url;}void evaluateJavascript(String script,ValueCallback<String> c){if(!script.contains(url.equals("file:///android_asset/index.html")?"window.onRugeBack()":"RugeBack.handle"))throw new AssertionError("must dispatch the correct page hierarchy");evaluations++;callback=c;}void loadUrl(String u){url=u;loads++;}void postDelayed(Runnable r,long n){timers.add(r);}}
 String startUrl(){return "file:///android_asset/index.html";}void finish(){finished++;}void setRequestedOrientation(int o){orientation=o;}
 ${body}
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 static BackHarness fresh(){SystemClock.now+=2000;return new BackHarness();}
 public static void main(String[] args){
 BackHarness h=fresh();h.onBackPressed();check(h.backPending&&h.web.evaluations==1&&h.web.loads==0,"wait for internal page");h.onBackPressed();check(h.web.evaluations==1,"pending gesture cannot double dispatch");h.web.callback.onReceiveValue("true");check(!h.backPending&&h.web.loads==0,"consumed back stays in game");SystemClock.now+=100;h.onBackPressed();check(h.web.evaluations==1,"duplicate callback burst debounced");SystemClock.now+=200;h.onBackPressed();h.web.callback.onReceiveValue("false");check(h.web.loads==1&&h.web.url.equals(h.startUrl()),"missing protocol falls back to collection");check(h.orientation==7,"fallback restores portrait");SystemClock.now+=300;h.onBackPressed();check(h.finished==0&&h.backPending,"collection also waits for its player layers");h.web.callback.onReceiveValue("true");check(h.finished==0,"player layer consumes back without leaving collection");SystemClock.now+=300;h.onBackPressed();h.web.callback.onReceiveValue("false");check(h.finished==1,"only unconsumed collection root finishes activity");
 h=fresh();h.onBackPressed();h.web.url="file:///android_asset/hanzi-typing/index.html";h.web.callback.onReceiveValue("false");check(h.web.loads==0,"callback cannot navigate another URL");
 h=fresh();h.onBackPressed();h.backGeneration++;h.backPending=false;h.web.callback.onReceiveValue("false");check(h.web.loads==0,"page-start invalidates original dispatch");
 h=fresh();h.onBackPressed();ValueCallback<String> delayed=h.web.callback;h.web.timers.get(0).run();check(!h.backPending&&h.web.loads==0,"timeout permits retry without navigating");delayed.onReceiveValue("false");check(h.web.loads==0,"late timeout result cannot exit");SystemClock.now+=1300;h.onBackPressed();check(h.web.evaluations==2,"retry works after hung JS");
 h=fresh();h.onBackPressed();h.foreground=false;h.web.callback.onReceiveValue("false");check(h.web.loads==0,"background callback cannot navigate");h.onBackPressed();check(h.web.evaluations==1,"background gesture ignored");
 h=fresh();h.onBackPressed();h.foreground=false;h.backGeneration++;h.backPending=false;h.foreground=true;h.web.callback.onReceiveValue("false");check(h.web.loads==0,"pause-resume same URL cancels stale callback");
 h=fresh();h.destroyed=true;h.onBackPressed();check(h.web.evaluations==0,"destroyed activity ignores back");
 }
}`;
 try{writeFileSync(resolve(temp,'BackHarness.java'),java);let r=spawnSync(bin('javac'),['-encoding','UTF-8','-d',temp,resolve(temp,'BackHarness.java')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);r=spawnSync(bin('java'),['-cp',temp,'BackHarness'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}finally{rmSync(temp,{recursive:true,force:true});}
});
