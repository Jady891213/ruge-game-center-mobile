#!/usr/bin/env python3
"""Private Tencent SOE configuration. Never repr/log returned values or signed URLs."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
def read_configuration(path=None):
    path=Path(path) if path else ROOT/'.local-voice/tencent-assessment.env'
    values={}
    for line in path.read_text().splitlines():
        line=line.strip()
        if not line or line.startswith('#'): continue
        key,sep,value=line.partition('=')
        if not sep: raise ValueError('Invalid private configuration format')
        value=value.strip().strip('\"\'')
        values[key.strip()]=value
    result={name:values.get(key,'') for name,key in [('appId','TENCENTCLOUD_APP_ID'),('secretId','TENCENTCLOUD_SECRET_ID'),('secretKey','TENCENTCLOUD_SECRET_KEY')]}
    if not re.fullmatch(r'[0-9]{5,20}',result['appId']) or not re.fullmatch(r'[A-Za-z0-9]{8,128}',result['secretId']) or not re.fullmatch(r'[A-Za-z0-9+/=_-]{8,256}',result['secretKey']):
        raise ValueError('Private configuration is missing or invalid; values redacted')
    return result
