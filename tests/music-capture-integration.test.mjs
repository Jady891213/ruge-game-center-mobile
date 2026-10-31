import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness(native){
  const holds=new Set(),events=new Map(),audios=[],pending=[];
  const window={RugeMusic:{suspend:r=>holds.add(r),resume:r=>holds.delete(r)},
    RugeDemoClips:{one:'a'.repeat(18)+'.mp3'},addEventListener:(n,f)=>events.set(n,f)};
  if(native)window.RugeAudioNative=native;
  window.Audio=class{constructor(){audios.push(this);}play(){return Promise.resolve();}pause(){}removeAttribute(){}load(){}};
  const context=vm.createContext({window,document:{hidden:false,addEventListener(){}},location:{search:''},
    navigator:{mediaDevices:{getUserMedia:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}},
    Float32Array,URL,Uint8Array,setTimeout,clearTimeout,Date});
  const run=name=>vm.runInContext(fs.readFileSync(new URL('../app/assets/shared/'+name,import.meta.url),'utf8'),context);
  run('demo-audio.js');run('audio-input.js');run('assessment.js');
  return{window,holds,audios,pending,events};
}

test('示范朗读和麦克风重叠：迟到旧音频回调不能解除当前录音或新朗读',async()=>{
  const g=harness({read:()=>JSON.stringify({status:'idle'}),start(){},stop(){}});
  await g.window.DemoAudio.play('one');const old=g.audios[0];
  await g.window.RugeAudioInput.start('pitch');
  assert.deepEqual([...g.holds].sort(),['demo','microphone']);
  await g.window.DemoAudio.play('one');old.onended();
  assert.equal(g.holds.has('demo'),true);
  g.audios[1].onended();assert.deepEqual([...g.holds],['microphone']);
  g.window.RugeAudioInput.stop();assert.equal(g.holds.size,0);
});

test('浏览器录音：旧授权失败不解除新请求的音乐保护，当前失败会解除',async()=>{
  const g=harness(),a=g.window.RugeAudioInput.start('pitch');
  g.window.RugeAudioInput.stop();const b=g.window.RugeAudioInput.start('pitch');
  g.pending[0].reject(Error('old permission'));assert.equal(await a,false);
  assert.equal(g.holds.has('microphone'),true);
  g.pending[1].reject(Error('current permission'));assert.equal(await b,false);
  assert.equal(g.holds.has('microphone'),false);
});

test('原生录音启动抛错或状态错误均恢复音乐，保留其它占用理由',async()=>{
  let broken=true;
  const g=harness({read:()=>JSON.stringify({status:broken?'idle':'denied'}),start(){if(broken)throw Error('denied');},stop(){}});
  g.holds.add('demo');assert.equal(await g.window.RugeAudioInput.start('pitch'),false);
  assert.deepEqual([...g.holds],['demo']);broken=false;
  assert.equal(await g.window.RugeAudioInput.start('pitch'),true);
  assert.equal(g.holds.has('microphone'),true);
  g.window.RugeAudioInput.read();assert.deepEqual([...g.holds],['demo']);
});

test('专业评测取消和启动失败只解除自己的音乐保护，不触发网络',async()=>{
  const g=harness();let fail=false;
  const engine=g.window.GameAssessment.create({native:{available:()=>true,configured:()=>true,
    begin(){if(fail)throw Error('record unavailable');},cancel(){}},Socket:class{constructor(){throw Error('network should not start');}}});
  g.holds.add('demo');const pending=engine.start({reference:'ban1',evalMode:0});
  assert.equal(g.holds.has('assessment'),true);engine.cancel();
  await assert.rejects(pending,e=>e.code==='cancelled');assert.deepEqual([...g.holds],['demo']);
  fail=true;await assert.rejects(engine.start({reference:'ban1',evalMode:0}),e=>e.code==='unavailable');
  assert.deepEqual([...g.holds],['demo']);
});
