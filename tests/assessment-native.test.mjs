import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('专业朗读签名、参考文本与原生联网权限策略', () => {
  const script = fileURLToPath(new URL('./helpers/assessment-native.py', import.meta.url));
  const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || 'Native assessment helper checks failed');
});
