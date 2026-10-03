#!/usr/bin/env python3
"""数「找字」游戏顶部格子填了几个 —— 用像素判据，比人眼看图便宜得多。
   用法: slots.py <截图.png>"""
import sys, zlib, struct

def read_png(path):
    d=open(path,'rb').read(); pos=8; idat=[]; w=h=ct=None
    while pos<len(d):
        ln=struct.unpack('>I',d[pos:pos+4])[0]; typ=d[pos+4:pos+8]; data=d[pos+8:pos+8+ln]
        if typ==b'IHDR': w,h,bd,ct,_,_,inter=struct.unpack('>IIBBBBB',data)
        elif typ==b'IDAT': idat.append(data)
        elif typ==b'IEND': break
        pos+=12+ln
    raw=zlib.decompress(b''.join(idat)); ch={0:1,2:3,3:1,4:2,6:4}[ct]
    stride=w*ch; out=bytearray(h*stride); prev=bytearray(stride); p=0
    for y in range(h):
        f=raw[p]; p+=1; line=bytearray(raw[p:p+stride]); p+=stride
        if f==1:
            for i in range(ch,stride): line[i]=(line[i]+line[i-ch])&255
        elif f==2:
            for i in range(stride): line[i]=(line[i]+prev[i])&255
        elif f==3:
            for i in range(stride):
                a=line[i-ch] if i>=ch else 0
                line[i]=(line[i]+((a+prev[i])>>1))&255
        elif f==4:
            for i in range(stride):
                a=line[i-ch] if i>=ch else 0; b=prev[i]; c=prev[i-ch] if i>=ch else 0
                pa,pb,pc=abs(b-c),abs(a-c),abs(a+b-2*c)
                pr=a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
                line[i]=(line[i]+pr)&255
        out[y*stride:(y+1)*stride]=line; prev=line
    return w,h,ch,bytes(out)

# 格子几何（设备像素，1080x2400）—— 第一行 8 个，第二行 6 个
ROW1_Y, ROW2_Y, SZ = 365, 516, 92
ROW1_X = [129, 258, 387, 516, 645, 774, 903, 1032]
ROW2_X = [245, 374, 503, 631, 760, 889]

w,h,ch,buf = read_png(sys.argv[1])
def dark_count(cx, cy):
    n = 0
    for y in range(cy - SZ//2 + 8, cy + SZ//2 - 8):
        for x in range(cx - SZ//2 + 8, cx + SZ//2 - 8):
            i = (y*w + x)*ch
            r,g,b = buf[i], buf[i+1], buf[i+2]
            if r < 130 and g < 130 and b < 130: n += 1
    return n

cells = [(i+1, x, ROW1_Y) for i,x in enumerate(ROW1_X)] + \
        [(i+9, x, ROW2_Y) for i,x in enumerate(ROW2_X)]
filled, empty = [], []
for idx, x, y in cells:
    n = dark_count(x, y)
    (filled if n > 120 else empty).append((idx, n))
print("已填: %d / 14" % len(filled))
if filled: print("  格子:", " ".join(str(i) for i,_ in filled))
if empty:  print("  空的:", " ".join(str(i) for i,_ in empty))
print("  暗像素样本:", " ".join(f"{i}:{n}" for i,_,_ in [] ) or " ".join("%d:%d"%(i,dark_count(x,y)) for i,x,y in cells[:4]))
