import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const source=readFileSync(resolve(root,'app/src/com/dsh/gamecenter/MainActivity.java'),'utf8');
// Extract the production Java classes/method, rather than translating their math to JS.
function block(marker){
  const start=source.indexOf(marker);assert.ok(start>=0,marker);
  let depth=0,quoted=null,escaped=false,line=false,comment=false;
  for(let i=source.indexOf('{',start);i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue}
    if(comment){if(c==='*'&&n==='/'){comment=false;i++}continue}
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quoted)quoted=null;continue}
    if(c==='/'&&n==='/'){line=true;i++;continue}
    if(c==='/'&&n==='*'){comment=true;i++;continue}
    if(c==='"'||c==="'"){quoted=c;continue}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('Unclosed production block '+marker);
}

test('native tilt: actual Java sample stays atomic; gravity, low-pass, rotations, age and reset agree',t=>{
  const configured=process.env.GAMECENTER_JAVA_HOME||process.env.JAVA_HOME;
  const binary=name=>configured?resolve(configured,'bin',name):name;
  const available=spawnSync(binary('javac'),['-version'],{encoding:'utf8'});
  if(available.error||available.status!==0){t.skip('JDK unavailable; Android build must verify native source');return}
  const temporary=mkdtempSync(resolve(root,'TMP to delete-native-tilt-'));
  try{
    const harness=`public class NativeTiltHarness {
      @interface JavascriptInterface {}
      static class SystemClock { static long now=1000; static long elapsedRealtime(){return now;} }
      final Object tiltLock=new Object(); final TiltReading tiltReading=new TiltReading();
      boolean foreground=true,tiltRegistered=true; int displayRotation=0; String tiltWhy="ok-gravity";
      ${block('static final class TiltReading {')}
      ${block('private class TiltBridge {')}
      ${block('private boolean tiltAvailableLocked(long age) {')}
      static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
      static void near(double a,double b,String message){check(Math.abs(a-b)<0.00001,message+" "+a+" != "+b);}
      public static void main(String[] args)throws Exception{
        NativeTiltHarness h=new NativeTiltHarness(); TiltReading r=h.tiltReading; TiltBridge b=h.new TiltBridge();
        check(!b.available(),"empty unavailable");check(r.ageMs(1000)==-1,"empty age");
        r.accept(2.943f,3.924f,9.81f,1000000000L,false);
        float[] xs={-.3f,.4f,.3f,-.4f},ys={.4f,.3f,-.4f,-.3f};
        for(int i=0;i<4;i++){h.displayRotation=i;near(b.gx(),xs[i],"rotation x");near(b.gy(),ys[i],"rotation y");System.out.println(b.sample());}
        near(b.gz(),1,"normalized z");check("screen-down-v1".equals(b.coordinateSystem()),"coordinate contract");
        SystemClock.now=2500;check(b.available(),"1500ms fresh");SystemClock.now=2501;check(!b.available(),"1501ms stale");
        check("stale-sample".equals(b.status()),"stale status");h.foreground=false;SystemClock.now=1000;check(!b.available(),"background unavailable");h.foreground=true;
        r.accept(-9.81f,0f,9.81f,1020000000L,false);near(r.x,-1,"gravity is not additionally filtered");
        r.accept(9.81f,0f,9.81f,1010000000L,false);near(r.x,-1,"out of order ignored");
        r.clear();r.accept(0,0,9.81f,1000000000L,true);r.accept(9.81f,0,9.81f,1020000000L,true);
        check(r.x>.10f&&r.x<.11f,"brief acceleration attenuated");check("accelerometer-lowpass".equals(r.source),"source");
        TiltReading a=new TiltReading(),c=new TiltReading();a.accept(0,0,9.81f,1000000000L,true);c.accept(0,0,9.81f,1000000000L,true);
        for(int i=1;i<=10;i++)a.accept(9.81f,0,9.81f,1000000000L+i*20000000L,true);
        for(int i=1;i<=20;i++)c.accept(9.81f,0,9.81f,1000000000L+i*10000000L,true);
        near(a.x,c.x,"dt based filtering independent of sample rate");
        check(!r.accept(Float.NaN,0,9.81f,1100000000L,true)&&!r.ready,"NaN invalidates");
        check(!r.accept(0,Float.POSITIVE_INFINITY,9.81f,1100000000L,true),"infinity invalidates");
        check(!r.accept(0,0,9.81f,0,true),"invalid timestamp");
        r.clear();near(r.x,0,"clear x");near(r.y,0,"clear y");near(r.z,1,"clear z");check(b.sampleAgeMs()==Long.MAX_VALUE,"legacy empty age");
        h.displayRotation=0;SystemClock.now=1000;
        Thread writer=new Thread(new Runnable(){public void run(){for(int i=1;i<=10000;i++)synchronized(h.tiltLock){r.accept(i*.0001f,i*.0002f,9.81f,1000000000L+i,false);}}});
        writer.start();for(int i=0;i<10000;i++){String sample=b.sample();String[] fields=sample.substring(1,sample.length()-1).split(",");float x=Float.parseFloat(fields[0].split(":")[1]),y=Float.parseFloat(fields[1].split(":")[1]);near(y,-2*x,"sample axes from same event");}writer.join();
        h.tiltRegistered=false;r.clear();System.out.println(b.sample());
      }
    }`;
    writeFileSync(resolve(temporary,'NativeTiltHarness.java'),harness);
    const compiled=spawnSync(binary('javac'),['-encoding','UTF-8',resolve(temporary,'NativeTiltHarness.java')],{encoding:'utf8'});
    assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
    const run=spawnSync(binary('java'),['-cp',temporary,'NativeTiltHarness'],{encoding:'utf8'});
    assert.equal(run.status,0,run.stdout+run.stderr);
    const samples=run.stdout.trim().split('\n').map(JSON.parse);
    assert.deepEqual(samples.slice(0,4).map(s=>s.rotation),[0,90,180,270]);
    assert.ok(samples.slice(0,4).every(s=>s.available&&s.age===0&&s.source==='gravity'));
    assert.deepEqual(samples.at(-1),{x:-0,y:0,z:1,age:-1,available:false,source:'none',rotation:0});
  }finally{rmSync(temporary,{recursive:true,force:true})}
});
