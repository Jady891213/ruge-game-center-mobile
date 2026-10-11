(function (root) {
  'use strict';

  const DIGITS = '0123456789';
  const LENGTHS = [2, 3, 4];

  function settings(length, pool) {
    if (!LENGTHS.includes(length) || typeof pool !== 'string' ||
        !/^[0-9]+$/.test(pool) || new Set(pool).size !== pool.length ||
        pool.length < length) {
      throw new RangeError('密码须为 2、3 或 4 位，数字池须包含足够的不重复数字。');
    }
  }

  function valid(code, length, pool) {
    try { settings(length, pool); } catch (_) { return false; }
    return typeof code === 'string' && code.length === length &&
      /^[0-9]+$/.test(code) && new Set(code).size === length &&
      Array.from(code).every(digit => pool.includes(digit));
  }

  function score(secret, guess) {
    if (typeof secret !== 'string' || !valid(secret, secret.length, DIGITS) ||
        !valid(guess, secret.length, DIGITS)) {
      throw new RangeError('密码和猜测须是相同长度、数字不重复的 2 至 4 位密码。');
    }
    return feedback(secret, guess);
  }

  function feedback(secret, guess) {
    let bulls = 0, cows = 0;
    for (let i = 0; i < secret.length; i++) {
      if (guess[i] === secret[i]) bulls++;
      else if (secret.includes(guess[i])) cows++;
    }
    return { bulls, cows, wrong: secret.length - bulls - cows };
  }

  function candidates(length, pool) {
    settings(length, pool);
    const codes = [];
    function visit(prefix) {
      if (prefix.length === length) { codes.push(prefix); return; }
      for (const digit of pool) {
        if (prefix.includes(digit)) continue;
        visit(prefix + digit);
      }
    }
    visit('');
    return codes;
  }

  function remaining(length, pool, history) {
    const all = candidates(length, pool);
    if (!Array.isArray(history)) throw new RangeError('猜测记录须为数组。');
    for (const row of history) {
      if (!row || typeof row !== 'object' || !valid(row.guess, length, pool) ||
          !Number.isInteger(row.bulls) || !Number.isInteger(row.cows) ||
          row.bulls < 0 || row.cows < 0 || row.bulls + row.cows > length ||
          !all.some(code => {
            const result = feedback(code, row.guess);
            return result.bulls === row.bulls && result.cows === row.cows;
          })) {
        throw new RangeError('猜测记录含无效数字或不可能的反馈。');
      }
    }
    return all.filter(code => history.every(row => {
      const result = feedback(code, row.guess);
      return result.bulls === row.bulls && result.cows === row.cows;
    }));
  }

  function randomCode(length, pool, random = Math.random) {
    const all = candidates(length, pool);
    if (typeof random !== 'function') throw new RangeError('随机源须为函数。');
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('随机源须返回大于等于 0、小于 1 的数。');
    }
    return all[Math.floor(sample * all.length)];
  }

  function hint(length, pool, history) {
    const possible = remaining(length, pool, history);
    const count = possible.length;
    const result = text => ({ text, candidates: count });
    if (!count) return result('这些线索互相冲突，请检查之前的猜测反馈。');
    // Every fact comes from the visible clues and candidate set, never a hidden answer.
    for (let i = 0; i < length; i++) {
      const digit = possible[0][i];
      if (possible.every(code => code[i] === digit)) {
        return result('根据已有线索，第 ' + (i + 1) + ' 位只能是 ' + digit + '。');
      }
    }
    for (const digit of pool) {
      if (possible.every(code => code.includes(digit))) {
        return result('根据已有线索，密码一定包含数字 ' + digit + '，再试试它的位置。');
      }
    }
    const zero = history.find(row => row.bulls === 0 && row.cows === 0);
    if (zero) return result('猜测 ' + zero.guess + ' 的数字都不在密码里，可以排除它们。');
    return result('还剩 ' + count + ' 种可能。先试不同数字，再根据“位置对”和“位置错”调整。');
  }

  const descriptions = [
    [2, '先排除两个数', '没有命中的数字，可以先排除。', '1234', '24', ['31'], 3],
    [2, '交换位置', '数字都对、位置都错，交换就能打开。', '1234', '31', ['13'], 2],
    [2, '留住正确位置', '保留位置正确的数字，再寻找另一个。', '12345', '42', ['45'], 4],
    [2, '逐组排除', '把没有命中的两组数字都排除。', '123456', '56', ['12', '34'], 3],
    [2, '认识数字零', '零和其他数字一样，可以放在任何位置。', '0123456', '60', ['61'], 5],
    [2, '两位小挑战', '数字变多了，认真利用每次反馈。', DIGITS, '87', ['90'], 7],
    [3, '多一位也不怕', '先分清数字不在密码里，还是位置放错了。', '12345', '425', ['123'], 5],
    [3, '三个数字换位置', '数字都找到了，接下来调整三个位置。', '123456', '362', ['236'], 4],
    [3, '守住两个位置', '把位置正确的两位留下，只替换剩下的一位。', '0123456', '504', ['501'], 5],
    [3, '先找对位置', '有些数字位置错了，有些数字需要替换。', '01234567', '716', ['170'], 6],
    [3, '排除后再组合', '没命中的三个数字，都可以排除。', DIGITS, '809', ['123'], 8],
    [3, '三位独立挑战', '自己选择第一次猜测，逐步缩小范围。', DIGITS, '274', [], 9],
    [4, '四位初体验', '逐步找齐四个不同数字。', '123456', '4251', ['1234'], 7],
    [4, '两位错了位置', '保留对的位置，交换放错的位置。', '01234567', '6073', ['6703'], 4],
    [4, '四位数字侦探', '同时分析正确位置、错误位置和需要排除的数字。', '012345678', '8205', ['8123'], 8],
    [4, '线索组合', '把多次猜测的反馈放在一起分析。', DIGITS, '1937', ['1023'], 9],
    [4, '四位独立挑战', '没有开场线索，也能从每次反馈中找到方向。', DIGITS, '5802', [], 10],
    [4, '密码小高手', '灵活使用排除、位置交换和保留正确位。', DIGITS, '9064', [], 10]
  ];
  const LEVELS = Object.freeze(descriptions.map((row, id) => Object.freeze({
    id, length: row[0], title: row[1], lesson: row[2], pool: row[3],
    secret: row[4], clues: Object.freeze(row[5]), par: row[6]
  })));

  root.RugeCodebreaker = Object.freeze({ LEVELS, score, valid, candidates, remaining, randomCode, hint });
})(typeof window !== 'undefined' ? window : globalThis);
