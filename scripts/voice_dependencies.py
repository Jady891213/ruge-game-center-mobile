"""Vendored, pinned offline KWS inputs for the existing aapt2/javac/d8 pipeline.

Integration in build.py:
  voice_jars = java_dependencies(ROOT)
  javac ... -classpath os.pathsep.join(map(str, voice_jars)) ...
  d8 ... classes ... *voice_jars
  assemble entries.update(native_entries(ROOT)) before writing the aligned APK.
No downloads, Gradle, credentials or host-global mutations occur during a build.
"""
from pathlib import Path
import hashlib
import json
import zipfile


def java_dependencies(root):
    root = Path(root)
    directory = root / 'vendor/voice'
    manifest = json.loads((directory / 'sources.json').read_text(encoding='utf-8'))
    for entry in manifest['files'] + manifest['models']:
        path = root / entry['path']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise RuntimeError('Voice dependency is missing or changed: ' + entry['path'])
    return [directory / 'classes.jar', directory / 'kotlin-stdlib-2.2.21.jar']


def native_entries(root):
    root = Path(root)
    directory = root / 'vendor/voice/jni'
    manifest = json.loads((root / 'vendor/voice/sources.json').read_text(encoding='utf-8'))
    declared = {entry['path'] for entry in manifest['files'] if entry['path'].endswith('.so')}
    actual = {path.relative_to(root).as_posix() for path in directory.rglob('*.so')}
    expected = {'vendor/voice/jni/arm64-v8a/libonnxruntime.so',
                'vendor/voice/jni/arm64-v8a/libsherpa-onnx-jni.so'}
    if actual != declared or actual != expected:
        raise RuntimeError('Unexpected native voice library; only the reviewed KWS JNI and ONNX Runtime may ship')
    entries = {}
    for entry in manifest['files']:
        if entry['path'] not in expected:
            continue
        path = root / entry['path']
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise RuntimeError('Native voice library changed during the build: ' + entry['path'])
        entries['lib/' + path.relative_to(directory).as_posix()] = (data, zipfile.ZIP_STORED)
    return entries
