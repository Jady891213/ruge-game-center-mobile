"""Execute real pure GameServices parser/console methods, no network or credentials."""
from pathlib import Path
import shutil,subprocess,sys,tempfile,unittest
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'));import build
class NativeServices(unittest.TestCase):
 def test_parser_and_exact_console_targets(self):
  tmp=Path(tempfile.mkdtemp(prefix='TMP to delete-services-tests-',dir=ROOT))
  try:
   java=(ROOT/'app/src/com/dsh/gamecenter/GameServices.java').read_text();a=java.index('    static JSONObject parseMiniMaxQuota(');b=java.index('    @JavascriptInterface public boolean openConsole',a);methods=java[a:b];a=java.index('    static String consoleUrl(');b=java.index('    synchronized void cancelInternal',a);methods+=java[a:b]
   source='''import java.util.*;
class JSONObject {final Map<String,Object> m=new HashMap<String,Object>(); JSONObject put(String k,Object v){m.put(k,v);return this;}JSONArray optJSONArray(String k){return m.get(k) instanceof JSONArray?(JSONArray)m.get(k):null;}int optInt(String k,int fallback){return m.get(k) instanceof Number?((Number)m.get(k)).intValue():fallback;}long optLong(String k,long fallback){return m.get(k) instanceof Number?((Number)m.get(k)).longValue():fallback;}Object opt(String k){return m.get(k);}String optString(String k){return m.get(k) instanceof String?(String)m.get(k):"";}}
class JSONArray {final List<JSONObject> a=new ArrayList<JSONObject>();JSONArray put(JSONObject x){a.add(x);return this;}int length(){return a.size();}JSONObject optJSONObject(int n){return n>=0&&n<a.size()?a.get(n):null;}}
public class ServicesHarness {
static final String TENCENT_CONSOLE="https://console.cloud.tencent.com/soenew",MINIMAX_CONSOLE="https://platform.minimax.cn/user-center/payment/token-plan";
'''+methods+'''
static void check(boolean b){if(!b)throw new AssertionError();}
public static void main(String[]args)throws Exception {
 JSONObject item=new JSONObject().put("model_name","general").put("current_interval_remaining_percent",99).put("current_weekly_remaining_percent",2).put("end_time",1792343603240L).put("weekly_end_time",1792433106270L).put("current_interval_total_count",0).put("current_interval_usage_count",0);
 JSONObject response=new JSONObject().put("model_remains",new JSONArray().put(item));JSONObject q=parseMiniMaxQuota(response);
 check(q.optInt("remaining",-1)==99&&q.optInt("total",-1)==100&&q.optInt("weeklyRemaining",-1)==2&&q.optString("unit").equals("%"));
 check(q.optLong("expiresAt",0)==1792343603240L&&q.optString("expiresLabel").equals("重置"));
 check(parseMiniMaxQuota(new JSONObject().put("model_remains",new JSONArray().put(new JSONObject().put("model_name","unknown-model"))))==null);
 check(parseMiniMaxQuota(new JSONObject())==null);check(parseMiniMaxQuota(new JSONObject().put("model_remains",new JSONArray()))==null);
 for(Object bad:new Object[]{"99",99.5,Double.NaN,Double.POSITIVE_INFINITY}){item.put("current_weekly_remaining_percent",bad);check(parseMiniMaxQuota(response)==null);}
 item.put("current_weekly_remaining_percent",101);check(parseMiniMaxQuota(response)==null);item.put("current_weekly_remaining_percent",2);item.m.remove("current_interval_remaining_percent");check(parseMiniMaxQuota(response)==null);item.put("current_interval_remaining_percent",99);item.put("end_time",0);check(parseMiniMaxQuota(response)==null);
 check(consoleUrl("tencent-soe").equals(TENCENT_CONSOLE));check(consoleUrl("minimax-token-plan").equals(MINIMAX_CONSOLE));for(String input:new String[]{"https://evil.invalid","tencent-soe?redirect=evil","","billing"})check(consoleUrl(input)==null);
 System.out.print("actual native quota parser and exact console allowlist passed");
}}
'''
   f=tmp/'ServicesHarness.java';f.write_text(source);jdk=build.java_default();r=subprocess.run([str(jdk/'bin/javac'),'-encoding','UTF-8',str(f)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr);r=subprocess.run([str(jdk/'bin/java'),'-cp',str(tmp),'ServicesHarness'],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr)
  finally:shutil.rmtree(tmp)
if __name__=='__main__':unittest.main(verbosity=2)
