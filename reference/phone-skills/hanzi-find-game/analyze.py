#!/usr/bin/env python3
"""
汉字找字小游戏 —— 笔画位置分析器

给一张截图 + 一个矩形区域，做行/列投影，找出横笔画和竖笔画的大致位置。

用法:
    python3 analyze.py <截图.png> <x0> <y0> <x1> <y1> [--thresh 0.45]

输出:
    - 笔画包围盒
    - 行投影（命中数高的行 = 横笔画所在）
    - 列投影（命中数高的列 = 竖笔画所在）

⚠️ 实测教训:
    这个手段在**稀疏区很准**（比如「王」的几根横竖），
    但在**密集区基本没用**（「鬼」的上半方框几十笔重叠，投影是一片糊）。
    密集区别硬上 —— 直接问用户答案集更快。

笔画颜色 ~ rgb(189,155,110)；卡片底 ~ rgb(249,250,238)。
"""
import sys
import zlib
import struct


def read_png(path):
    """极简 PNG 解码（8 位，非隔行）。返回 (w, h, channels, bytes)。"""
    d = open(path, 'rb').read()
    pos = 8
    idat = []
    w = h = bd = ct = None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos + 4])[0]
        typ = d[pos + 4:pos + 8]
        data = d[pos + 8:pos + 8 + ln]
        if typ == b'IHDR':
            w, h, bd, ct, _, _, inter = struct.unpack('>IIBBBBB', data)
            if bd != 8 or inter != 0:
                raise SystemExit("只支持 8 位非隔行 PNG")
        elif typ == b'IDAT':
            idat.append(data)
        elif typ == b'IEND':
            break
        pos += 12 + ln

    raw = zlib.decompress(b''.join(idat))
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    stride = w * ch
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, ch, bytes(out)


def make_hit(w, ch, buf):
    def hit(x, y):
        i = (y * w + x) * ch
        r, g, b = buf[i], buf[i + 1], buf[i + 2]
        return (r - b) > 35 and 140 < r < 235
    return hit


def bands(values, thresh):
    """把连续的达标索引合并成区间，返回 [(start, end, peak), ...]"""
    out, cur = [], None
    for i, c in values:
        ok = c >= thresh
        if ok and cur is None:
            cur = [i, i, c]
        elif ok:
            cur[1] = i
            cur[2] = max(cur[2], c)
        elif cur is not None:
            out.append(tuple(cur)); cur = None
    if cur is not None:
        out.append(tuple(cur))
    return out


def main():
    if len(sys.argv) < 6:
        print(__doc__)
        raise SystemExit(1)

    path = sys.argv[1]
    x0, y0, x1, y1 = (int(v) for v in sys.argv[2:6])
    thresh_ratio = 0.45
    if '--thresh' in sys.argv:
        thresh_ratio = float(sys.argv[sys.argv.index('--thresh') + 1])

    w, h, ch, buf = read_png(path)
    hit = make_hit(w, ch, buf)
    x0, x1 = max(0, x0), min(w, x1)
    y0, y1 = max(0, y0), min(h, y1)
    print(f"截图 {w}x{h}   分析区域 x {x0}~{x1}  y {y0}~{y1}")

    # 包围盒
    xs, ys = [], []
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            if hit(x, y):
                xs.append(x); ys.append(y)
    if not xs:
        raise SystemExit("这个区域里没找到笔画（换区域或调 --thresh）")
    print(f"笔画包围盒: x {min(xs)}~{max(xs)}   y {min(ys)}~{max(ys)}")

    rows = [(y, sum(1 for x in range(x0, x1) if hit(x, y))) for y in range(y0, y1)]
    cols = [(x, sum(1 for y in range(y0, y1) if hit(x, y))) for x in range(x0, x1)]
    rt = (x1 - x0) * thresh_ratio
    ct = (y1 - y0) * thresh_ratio

    print(f"\n横笔画候选（行命中 >= {rt:.0f}）:")
    rb = bands(rows, rt)
    for a, b, pk in rb:
        print(f"  y {a}~{b}   中心 y={(a + b) // 2}   峰值 {pk}")
    if not rb:
        print("  （无 —— 阈值调低试试，或这个区域没有横笔画）")

    print(f"\n竖笔画候选（列命中 >= {ct:.0f}）:")
    cb = bands(cols, ct)
    for a, b, pk in cb:
        print(f"  x {a}~{b}   中心 x={(a + b) // 2}   峰值 {pk}")
    if not cb:
        print("  （无）")

    print("\n提示：候选太多说明区域太密（几十笔重叠），投影会糊成一片。")
    print("      密集区别硬上 —— 直接问用户答案集更快。")


if __name__ == '__main__':
    main()
