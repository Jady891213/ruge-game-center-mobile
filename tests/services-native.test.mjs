import test from 'node:test';import assert from 'node:assert/strict';import{spawnSync}from'node:child_process';import{readFileSync}from'node:fs';import{fileURLToPath}from'node:url';
test('真实原生余量解析保留MiniMax双窗口百分比，零count不冒充次数，控制台目标固定',()=>{const r=spawnSync('python3',[fileURLToPath(new URL('./helpers/services-native.py',import.meta.url))],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr||r.stdout);});
test('服务桥只授予包内设置页，后台及导航取消，设置不获得录音签名',()=>{
 const main=readFileSync(new URL('../app/src/com/dsh/gamecenter/MainActivity.java',import.meta.url),'utf8');
 assert.match(main,/servicesPage = "file:\/\/\/android_asset\/settings\/index\.html"\.equals\(url\) && url\.equals\(view\.getUrl\(\)\)/);
 assert.match(main,/servicesPageAllowed\(\) \{ return foreground && !destroyed && servicesPage;/);assert.match(main,/servicesPage = false;\s*if \(services != null\) services.cancelInternal\(\)/);
 const assessmentGate=main.slice(main.indexOf('assessmentPage = ("file:'),main.indexOf('servicesPage = "file:'));assert.doesNotMatch(assessmentGate,/settings/);
 const s=readFileSync(new URL('../app/src/com/dsh/gamecenter/GameServices.java',import.meta.url),'utf8');
 assert.match(s,/setInstanceFollowRedirects\(false\)/);assert.match(s,/setRequestMethod\("GET"\)/);assert.match(s,/now - lastRefresh < 30000L/);assert.match(s,/request == generation && allowed\(\)/);assert.match(s,/bytes\.size\(\) \+ count > 65536/);assert.doesNotMatch(s,/getErrorStream|printStackTrace|android\.util\.Log|JSONObject.*secretKey/);
});
