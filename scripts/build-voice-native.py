#!/usr/bin/env python3
"""Rebuild the pinned Android arm64 keyword-only JNI; does not build or install APKs.

Requires NDK r27d, CMake 3.31.x and Ninja. Use --install only after reviewing the
reported native dependencies/exports. All intermediate files stay under the
project's TMP to delete-voice-build directory. No Gradle or global SDK mutation.
"""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
SOURCE_URL='https://codeload.github.com/k2-fsa/sherpa-onnx/tar.gz/refs/tags/v1.13.8'
SOURCE_SHA='b0374cc56dbc186d442ae73d5de743bb092470b640c4c50ce7b029044c0c4fa8'
NDK_REVISION='27.3.13750724'
NDK_URL='https://dl.google.com/android/repository/android-ndk-r27d-darwin.dmg'
NDK_SHA1='80f11292080fab4e869799f1d23caa88dcf3c709'
NDK_SHA256='0a0b76d927dcb202da6067ffefb2875bc3963ba9de22b89f9b1bdb299dfdf395'
HEADERS={'onnxruntime_session_options_config_keys.h': 'f3a80fcec7fa9e38de3191fc48714231892bc9c5dc8a06adecebf946a1937a29', 'onnxruntime_error_code.h': '5ce3b054e798eced8d14f5b86e98692fd33470463f96194ce0700a2d53dd8721', 'onnxruntime_run_options_config_keys.h': '973037c14b0f1af0854ae25cd676776f79dbcfd2a6791f6ee17a5374c2a62550', 'onnxruntime_float16.h': '88b242845d25981633a0bbd1c148e273cf8bfb016ea3f57c4af41a06530f72b0', 'onnxruntime_cxx_inline.h': '97f960b1bc4a372918893ef4c77102dee725ccfce0d76607f4570b03e7e28325', 'onnxruntime_cxx_api.h': 'c6bf005e4063b7db911d0a6b030452bcb9d4fc5e87530a39d94c4a5fcd311b61', 'onnxruntime_ep_c_api.h': 'db86df0f846b8d3bdbf429a5c76c5805293196575ca3c475878612591cd18e51', 'onnxruntime_c_api.h': 'b69a133143c0da61782b2b02cc8a620d21ac139231fd211719776d10385135c1'}
FLAGS={
 'BUILD_SHARED_LIBS':'ON','CMAKE_BUILD_TYPE':'MinSizeRel',
 'SHERPA_ONNX_ENABLE_JNI':'ON','SHERPA_ONNX_ENABLE_TTS':'OFF',
 'SHERPA_ONNX_ENABLE_SPEAKER_DIARIZATION':'OFF','SHERPA_ONNX_ENABLE_C_API':'OFF',
 'SHERPA_ONNX_ENABLE_PORTAUDIO':'OFF','SHERPA_ONNX_ENABLE_WEBSOCKET':'OFF',
 'SHERPA_ONNX_ENABLE_BINARY':'OFF','SHERPA_ONNX_BUILD_C_API_EXAMPLES':'OFF',
 'SHERPA_ONNX_ENABLE_PYTHON':'OFF','SHERPA_ONNX_ENABLE_TESTS':'OFF',
 'SHERPA_ONNX_ENABLE_CHECK':'OFF','SHERPA_ONNX_ENABLE_GPU':'OFF',
 'SHERPA_ONNX_ENABLE_RKNN':'OFF','SHERPA_ONNX_ENABLE_QNN':'OFF',
 'SHERPA_ONNX_ENABLE_AXERA':'OFF','SHERPA_ONNX_ENABLE_AXCL':'OFF',
 'SHERPA_ONNX_ENABLE_ASCEND_NPU':'OFF','SHERPA_ONNX_ENABLE_DIRECTML':'OFF',
 'ANDROID_ABI':'arm64-v8a','ANDROID_PLATFORM':'android-21','ANDROID_STL':'c++_static',
 'CMAKE_SHARED_LINKER_FLAGS':'-Wl,--gc-sections -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384',
}


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def fetch(url,path,expected):
    if not path.exists():
        print('Download '+url,flush=True)
        with urllib.request.urlopen(url,timeout=120) as src,path.open('wb') as out:shutil.copyfileobj(src,out)
    if sha(path)!=expected:raise RuntimeError('Source hash mismatch: '+path.name)


def prepare_source(work):
    archive=work/'sherpa-onnx-v1.13.8.tar.gz'
    fetch(SOURCE_URL,archive,SOURCE_SHA)
    source=work/'sherpa-onnx-1.13.8'
    if not (source/'CMakeLists.txt').exists():
        with tarfile.open(archive) as tar:
            # Upstream examples contain absolute symlinks; none are build inputs.
            tar.extractall(work,members=[m for m in tar.getmembers() if m.isfile() or m.isdir()],filter='data')
    jni=source/'sherpa-onnx/jni'
    cmake=jni/'CMakeLists.txt'
    text=cmake.read_text()
    original=(work/'jni-CMakeLists.original.txt')
    if not original.exists():original.write_text(text)
    text=re.sub(r'set\(sources\n.*?\n\)', 'set(sources\n  common.cc\n  jni.cc\n  keyword-spotter.cc\n  online-stream.cc\n  game-online-model-config.cc\n  version.cc\n)',text,count=1,flags=re.S)
    text=text.replace('LINK_FLAGS "-Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/sherpa-onnx-symbols.lds"', 'LINK_FLAGS "-Wl,--version-script=\\\"${CMAKE_CURRENT_SOURCE_DIR}/sherpa-onnx-symbols.lds\\\""')
    cmake.write_text(text)
    upstream=(jni/'online-recognizer.cc').read_text()
    begin=upstream.index('OnlineModelConfig GetOnlineModelConfig(')
    brace=upstream.index('{',begin);depth=1;end=brace+1
    while depth:
        depth+=(upstream[end]=='{')-(upstream[end]=='}');end+=1
    copied='// Copyright (c) 2024 Xiaomi Corporation. Apache-2.0.\n// Exact upstream configuration reader retained for the keyword-only JNI.\n#include "sherpa-onnx/csrc/online-model-config.h"\n#include "sherpa-onnx/jni/common.h"\nnamespace sherpa_onnx {\n'+upstream[begin:end]+'\n}\n'
    (jni/'game-online-model-config.cc').write_text(copied)
    patch=''.join(difflib.unified_diff(original.read_text().splitlines(True),text.splitlines(True),fromfile='a/sherpa-onnx/jni/CMakeLists.txt',tofile='b/sherpa-onnx/jni/CMakeLists.txt'))
    patch+=''.join(difflib.unified_diff([],copied.splitlines(True),fromfile='/dev/null',tofile='b/sherpa-onnx/jni/game-online-model-config.cc'))
    (work/'native-kws.patch').write_text(patch)
    return source


def run(command,env,log):
    print('Run '+str(command[0])+' '+str(command[1]) if len(command)>1 else str(command),flush=True)
    with log.open('w') as output:
        process=subprocess.run(list(map(str,command)),env=env,stdout=output,stderr=subprocess.STDOUT)
    if process.returncode:raise RuntimeError(log.read_text(errors='replace')[-6000:])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ndk',type=Path,required=True)
    parser.add_argument('--cmake',type=Path,required=True)
    parser.add_argument('--ninja',type=Path,required=True)
    parser.add_argument('--work-dir',type=Path,default=ROOT/'TMP to delete-voice-build')
    parser.add_argument('--jobs',type=int,default=4)
    parser.add_argument('--install',action='store_true')
    args=parser.parse_args();work=args.work_dir.resolve();work.mkdir(exist_ok=True)
    ndk=args.ndk.resolve();revision=(ndk/'source.properties').read_text()
    if not re.search(r'Pkg.Revision\s*=\s*'+re.escape(NDK_REVISION),revision):raise RuntimeError('Use the pinned NDK r27d')
    source=prepare_source(work)
    dependencies=[('kaldi-native-fbank-1.22.3.tar.gz', 'https://codeload.github.com/csukuangfj/kaldi-native-fbank/tar.gz/refs/tags/v1.22.3', '9176cc66fc7ce1edf85cf355b06e320c57db6297df74277f575183468893cf61'), ('kaldi-decoder-0.3.0.tar.gz', 'https://codeload.github.com/k2-fsa/kaldi-decoder/tar.gz/refs/tags/v0.3.0', 'b9f34cfb4fd3b1344100eead79ef4d37aa15962274b9e3056de345021f76a1b0'), ('simple-sentencepiece-0.7.tar.gz', 'https://codeload.github.com/pkufool/simple-sentencepiece/tar.gz/refs/tags/v0.7', '1748a822060a35baa9f6609f84efc8eb54dc0e74b9ece3d82367b7119fdc75af'), ('json-3.12.0.tar.gz', 'https://codeload.github.com/nlohmann/json/tar.gz/refs/tags/v3.12.0', '4b92eb0c06d10683f7447ce9406cb97cd4b453be18d7279320f7b2f025c10187'), ('kaldifst-1.8.0.tar.gz', 'https://codeload.github.com/k2-fsa/kaldifst/tar.gz/refs/tags/v1.8.0', '3f247b7e5a2409071202f5e2bc6200060f66728c0a3443c03923ad2723e040b3'), ('kissfft-febd4caeed32e33ad8b2e0bb5ea77542c40f18ec.zip', 'https://codeload.github.com/mborgerding/kissfft/zip/febd4caeed32e33ad8b2e0bb5ea77542c40f18ec', '497103e664168ebe39580b757adbe616f6cf85a16572af581ca7bc42d0ab13fd'), ('eigen-3.4.0.tar.gz', 'https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.gz', '8586084f71f9bde545ee7fa6d00288b264a2b7ac3607b974e54d13e7162c1c72'), ('openfst-1.8.5-2026-07-09.tar.gz', 'https://codeload.github.com/csukuangfj/openfst/tar.gz/refs/tags/v1.8.5-2026-07-09', '2ff712a32952fcb01d351121a6bc8ccf4fdc6b2aa06ce8df2b3095dedd518c0e')]
    for name,url,digest in dependencies:fetch(url,source/name,digest)
    headers=work/'onnxruntime-headers';headers.mkdir(exist_ok=True)
    for name in HEADERS:
        target=headers/name
        fetch('https://raw.githubusercontent.com/microsoft/onnxruntime/v1.28.2/include/onnxruntime/core/session/'+name,target,HEADERS[name])
    env=os.environ.copy();env['SHERPA_ONNXRUNTIME_INCLUDE_DIR']=str(headers);env['SHERPA_ONNXRUNTIME_LIB_DIR']=str(ROOT/'vendor/voice/jni/arm64-v8a')
    build=work/'build';command=[args.cmake.resolve(),'-S',source,'-B',build,'-G','Ninja','-DCMAKE_MAKE_PROGRAM='+str(args.ninja.resolve()),'-DCMAKE_TOOLCHAIN_FILE='+str(ndk/'build/cmake/android.toolchain.cmake')]+['-D'+k+'='+v for k,v in FLAGS.items()]
    run(command,env,work/'configure.log')
    run([args.cmake.resolve(),'--build',build,'--target','sherpa-onnx-jni','--parallel',str(args.jobs)],env,work/'compile.log')
    host=ndk/'toolchains/llvm/prebuilt/darwin-x86_64/bin'
    library=build/'lib/libsherpa-onnx-jni.so';subprocess.run([host/'llvm-strip','--strip-unneeded',library],check=True)
    dynamic=subprocess.check_output([host/'llvm-readelf','-d',library],text=True)
    symbols=subprocess.check_output([host/'llvm-nm','-D','--defined-only',library],text=True)
    exports=[line.split()[-1] for line in symbols.splitlines() if 'Java_' in line]
    if not any('KeywordSpotter_newFromAsset' in name for name in exports):raise RuntimeError('KWS JNI export is missing')
    if any(word in library.read_bytes().lower() for word in [b'espeak',b'piper',b'phonemize']):raise RuntimeError('Unwanted TTS code remains')
    if any('OfflineTts' in name or 'OfflineRecognizer' in name or 'OnlineRecognizer' in name for name in exports):raise RuntimeError('Unwanted JNI methods remain')
    report={'sourceUrl':SOURCE_URL,'sourceSha256':SOURCE_SHA,'ndkRevision':NDK_REVISION,'ndkUrl':NDK_URL,'ndkSha1':NDK_SHA1,'ndkSha256':NDK_SHA256,'tools':{'cmake':'3.31.6','ninja':'1.11.1.4'},'flags':FLAGS,'dependencies':[{'name':n,'url':u,'sha256':h} for n,u,h in dependencies],'patchSha256':sha(work/'native-kws.patch'),'jniSha256':sha(library),'jniBytes':library.stat().st_size,'dynamicSection':dynamic,'jniExports':exports,'headers':{x.name:sha(x) for x in headers.glob('*.h')}}
    (work/'native-build.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'jniBytes':report['jniBytes'],'jniSha256':report['jniSha256'],'jniExports':len(exports)},indent=2))
    if args.install:
        if (ROOT/'TMP to delete-build').exists():raise RuntimeError('Wait for the active APK build before replacing native inputs')
        vendor=ROOT/'vendor/voice';directory=vendor/'jni/arm64-v8a'
        # Only the reviewed KWS JNI and existing ONNX Runtime remain.
        for old in directory.glob('libsherpa-onnx*.so'):old.unlink()
        shutil.copyfile(library,directory/library.name)
        shutil.copyfile(work/'native-kws.patch',vendor/'native-kws.patch')
        shutil.copyfile(work/'native-build.json',vendor/'native-build.json')
        licenses={
          'LICENSE-kaldi-native-fbank.txt':build/'_deps/kaldi_native_fbank-src/LICENSE',
          'LICENSE-kaldi-decoder.txt':build/'_deps/kaldi_decoder-src/LICENSE',
          'LICENSE-kaldifst.txt':build/'_deps/kaldifst-src/LICENSE',
          'LICENSE-openfst.txt':build/'_deps/openfst-src/COPYING',
          'LICENSE-kissfft.txt':build/'_deps/kissfft-src/COPYING',
          'LICENSE-simple-sentencepiece.txt':build/'_deps/simple-sentencepiece-src/LICENSE',
          'LICENSE-nlohmann-json.txt':build/'_deps/json-src/LICENSE.MIT',
          'LICENSE-eigen-MPL2.txt':build/'_deps/eigen-src/COPYING.MPL2',
          'NOTICE-eigen.txt':build/'_deps/eigen-src/COPYING.README',
          'NOTICE-Android-NDK-toolchain.txt':ndk/'toolchains/llvm/prebuilt/darwin-x86_64/NOTICE',
        }
        for name,origin in licenses.items():shutil.copyfile(origin,vendor/name)
        assets=ROOT/'app/assets/voice-model/licenses'
        assets.mkdir(exist_ok=True)
        for name in ['LICENSE-espeak-ng.txt','LICENSE-piper-phonemize.txt']:
            for old in [vendor/name,assets/name]:
                if old.exists():old.unlink()
        for file in vendor.glob('*.txt'):shutil.copyfile(file,assets/file.name)
        manifest=vendor/'sources.json'
        metadata=json.loads(manifest.read_text())
        metadata['nativeBuild']=report
        metadata['nativeProvenance']='Only libonnxruntime.so is extracted from the official AAR; keyword-only JNI is rebuilt from pinned v1.13.8 sources, see native-build.json and native-kws.patch.'
        metadata['files']=[{'path':f.relative_to(ROOT).as_posix(),'bytes':f.stat().st_size,'sha256':sha(f)} for f in sorted(vendor.rglob('*')) if f.is_file() and f.suffix in ['.jar','.so']]
        metadata['models']=[{'path':f.relative_to(ROOT).as_posix(),'bytes':f.stat().st_size,'sha256':sha(f)} for f in sorted((ROOT/'app/assets/voice-model').rglob('*')) if f.is_file()]
        manifest.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')




if __name__=='__main__':main()
