(function(w){'use strict';
const STATUS=new Set(['ready','offline','loading','unconfigured','unsupported','error','stale']);
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
function timestamp(v){if(typeof v==='number'&&Number.isFinite(v)&&v>0)return v<1e12?v*1000:v;if(typeof v==='string'&&v.length<=40){const t=Date.parse(v);if(Number.isFinite(t))return t;}return null;}
function text(v,max=60){return typeof v==='string'?v.slice(0,max):'';}
function normalize(raw,now=Date.now()){
 let p;try{p=typeof raw==='string'?JSON.parse(raw):raw;}catch(_){p=null;}
 if(!p||typeof p!=='object'||!Array.isArray(p.services))return{version:'4.32',services:[],available:false};
 const ids=new Set(),services=[];
 for(const item of p.services.slice(0,12)){
  if(!item||typeof item.id!=='string'||!/^[-a-z0-9_]{1,40}$/.test(item.id)||ids.has(item.id))continue;ids.add(item.id);
  const configured=item.configured===true;let status=STATUS.has(item.status)?item.status:configured?'unsupported':'unconfigured';
  if(!configured&&status!=='offline')status='unconfigured';
  const updatedAt=timestamp(item.updatedAt),expiresAt=timestamp(item.quota?.expiresAt);if(status==='ready'&&expiresAt!==null&&expiresAt<=now)status='stale';
  let quota=null;const q=item.quota;
  if(status==='ready'&&q&&finite(q.remaining)&&typeof q.unit==='string'&&q.unit.length>0&&q.unit.length<=16&&(!('total'in q)||q.total===null||finite(q.total)&&q.remaining<=q.total)&&(!('weeklyRemaining'in q)||q.weeklyRemaining===null||finite(q.weeklyRemaining))&&(q.unit!=='%'||q.remaining<=100&&(!finite(q.weeklyRemaining)||q.weeklyRemaining<=100))){quota={remaining:q.remaining,total:finite(q.total)?q.total:null,unit:q.unit,expiresAt,weeklyRemaining:finite(q.weeklyRemaining)&&!(timestamp(q.weeklyExpiresAt)!==null&&timestamp(q.weeklyExpiresAt)<=now)?q.weeklyRemaining:null,weeklyTotal:finite(q.weeklyTotal)?q.weeklyTotal:null,weeklyExpiresAt:timestamp(q.weeklyExpiresAt),windowLabel:text(q.windowLabel,25),weeklyLabel:text(q.weeklyLabel,25),expiresLabel:text(q.expiresLabel,15)};}
  if(status==='ready'&&!quota)status='unsupported';
  services.push({id:item.id,name:text(item.name)||item.id,status,configured,quota,updatedAt,error:typeof item.error==='string'&&/^[a-z0-9_-]{1,50}$/.test(item.error)?item.error:'',offlineCount:status==='offline'&&Number.isInteger(item.offlineCount)&&item.offlineCount>=0?item.offlineCount:null,localOnly:false});
 }
 return{version:text(p.version,20)||'4.32',services,available:true};
}
function defaults(){return{version:'4.32',available:false,services:[{id:'tencent-soe',name:'腾讯专业评测',status:'unsupported',configured:false,quota:null,updatedAt:null,error:'',offlineCount:null},{id:'minimax-token-plan',name:'MiniMax 语音示范',status:'offline',configured:false,quota:null,updatedAt:null,error:'',offlineCount:101,localOnly:true}]};}
function statusText(s){return({ready:'已连接',offline:'网络未连接',loading:'正在查询',unconfigured:'尚未配置',unsupported:'暂未接入查询',error:'查询失败',stale:'数据已过期'})[s]||'暂无数据';}
function errorText(code){return({'service-auth':'认证失败，请检查家长配置','service-error':'服务暂不可用，请稍后再试','quota-unavailable':'服务暂未返回可用余量','quota-console-only':'请前往官方控制台查看',auth:'认证失败，请检查家长配置',permission:'没有查询权限',network:'网络未连接，请稍后再试',timeout:'查询超时，请重试',rate_limit:'查询太快，请稍后再试',balance:'服务余额不足',unsupported:'暂未接入自动查询'})[code]||'暂时无法获取数据';}
w.SettingsCore=Object.freeze({normalize,defaults,statusText,errorText,timestamp});
})(window);
