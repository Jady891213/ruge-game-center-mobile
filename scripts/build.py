#!/usr/bin/env python3
"""Build the local WebView APK with the official Android build tools; never install it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ANDROID = "{http://schemas.android.com/apk/res/android}"
PACKAGE = "com.dsh.gamecenter"
ET.register_namespace("android", "http://schemas.android.com/apk/res/android")


def run(label, command, environment):
    print(label, flush=True)
    result = subprocess.run([str(arg) for arg in command], env=environment,
                            text=True, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f"{label} failed ({result.returncode})\n{result.stdout}")
    return result.stdout.strip()


def java_default():
    configured = os.environ.get("GAMECENTER_JAVA_HOME") or os.environ.get("JAVA_HOME")
    if configured:
        return Path(configured)
    mac_jdk = Path.home() / "Library/Java/JavaVirtualMachines/openjdk-18.0.2.1/Contents/Home"
    if mac_jdk.is_dir():
        return mac_jdk
    javac = shutil.which("javac")
    return Path(javac).resolve().parents[1] if javac else Path("/missing-jdk")


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dev", action="store_true", help="External dev pages and WebView debugging")
    parser.add_argument("--java-home", type=Path, default=java_default())
    parser.add_argument("--sdk-root", type=Path, default=Path(os.environ.get("GAMECENTER_ANDROID_SDK_ROOT", os.environ.get("ANDROID_SDK_ROOT", str(ROOT / ".local-tools/android")))))
    parser.add_argument("--build-tools", type=Path, default=os.environ.get("GAMECENTER_BUILD_TOOLS"))
    parser.add_argument("--android-jar", type=Path, default=os.environ.get("GAMECENTER_ANDROID_JAR"))
    signing = ROOT.parents[1] / "04-私有签名" / "Game-Center"
    parser.add_argument("--keystore", type=Path, default=Path(os.environ.get("GAMECENTER_KEYSTORE", str(signing / "release.keystore"))))
    parser.add_argument("--password-file", type=Path, default=Path(os.environ.get("GAMECENTER_PASSWORD_FILE", str(signing / "store-password.txt"))))
    parser.add_argument("--key-password-file", type=Path, default=os.environ.get("GAMECENTER_KEY_PASSWORD_FILE"))
    parser.add_argument("--key-alias", default=os.environ.get("GAMECENTER_KEY_ALIAS", "flappy"))
    parser.add_argument("--version-name", help="Defaults to app/AndroidManifest.xml")
    parser.add_argument("--version-code", type=int, help="Defaults to app/AndroidManifest.xml")
    return parser.parse_args()


def choose_toolchain(args):
    standard = args.sdk_root / "build-tools/35.0.0"
    args.build_tools = (args.build_tools or (standard if standard.is_dir() else args.sdk_root / "android-15")).resolve()
    platform = args.sdk_root / "platforms/android-35/android.jar"
    args.android_jar = (args.android_jar or (platform if platform.is_file() else args.sdk_root / "android.jar")).resolve()
    args.java_home = args.java_home.resolve()
    args.keystore = args.keystore.resolve()
    args.password_file = args.password_file.resolve()
    args.key_password_file = (args.key_password_file or args.password_file).resolve()
    needed = [args.android_jar, args.java_home / "bin/javac", args.java_home / "bin/java",
              args.keystore, args.password_file, args.key_password_file]
    needed += [args.build_tools / name for name in ("aapt2", "d8", "zipalign", "apksigner")]
    for file in needed:
        if not file.is_file():
            raise RuntimeError(f"Missing build input: {file}")
    env = os.environ.copy()
    env["JAVA_HOME"] = str(args.java_home)
    env["PATH"] = str(args.java_home / "bin") + os.pathsep + env.get("PATH", "")
    return env


def assemble(base, dex_directory, target):
    """Normalize ZIP order/time and store resources.arsc/DEX for official zipalign."""
    with zipfile.ZipFile(base) as source, zipfile.ZipFile(target, "w") as output:
        entries = {entry.filename: (source.read(entry), entry.compress_type)
                   for entry in source.infolist() if not entry.is_dir()}
        entries.update({file.name: (file.read_bytes(), zipfile.ZIP_STORED)
                        for file in sorted(dex_directory.glob("*.dex"))})
        if "classes.dex" not in entries:
            raise RuntimeError("D8 did not emit classes.dex")
        for name in sorted(entries):
            content, compression = entries[name]
            entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_STORED if name == "resources.arsc" else compression
            entry.external_attr = 0o100644 << 16
            output.writestr(entry, content)


def build(args, env, temporary):
    # A per-build snapshot prevents later editor changes from changing packaged inputs.
    app = temporary / "app"
    shutil.copytree(ROOT / "app", app, ignore=shutil.ignore_patterns(".DS_Store", "__pycache__"))
    manifest_file = app / "AndroidManifest.xml"
    tree = ET.parse(manifest_file)
    manifest = tree.getroot()
    if manifest.get("package") != PACKAGE:
        raise RuntimeError("The original application package must remain com.dsh.gamecenter")
    version = args.version_name or manifest.get(ANDROID + "versionName", "4.2")
    if not re.fullmatch(r"[0-9A-Za-z_.-]+", version):
        raise RuntimeError("Version name must contain only letters, digits, dots, underscores and hyphens")
    code = args.version_code if args.version_code is not None else int(manifest.get(ANDROID + "versionCode", "25"))
    if code < 1:
        raise RuntimeError("Version code must be positive")
    if args.dev and not version.endswith("-dev"):
        version += "-dev"
    manifest.set(ANDROID + "versionName", version)
    manifest.set(ANDROID + "versionCode", str(code))
    application = manifest.find("application")
    if application is None:
        raise RuntimeError("Missing application in manifest")
    application.set(ANDROID + "debuggable", "true" if args.dev else "false")
    if any(item.get(ANDROID + "name") == "android.permission.INTERNET" for item in manifest.findall("uses-permission")):
        raise RuntimeError("This offline application must not request INTERNET permission")
    sdk = manifest.find("uses-sdk")
    minimum = sdk.get(ANDROID + "minSdkVersion", "21") if sdk is not None else "21"
    tree.write(manifest_file, encoding="utf-8", xml_declaration=True)

    generated = temporary / "generated/com/dsh/gamecenter/BuildConfig.java"
    generated.parent.mkdir(parents=True)
    generated.write_text("package com.dsh.gamecenter;\npublic final class BuildConfig { public static final boolean DEV = " + ("true" if args.dev else "false") + "; }\n", encoding="utf-8")
    classes = temporary / "classes"
    dex = temporary / "dex"
    classes.mkdir()
    dex.mkdir()
    tools = args.build_tools
    run("1/7 Compile Android resources", [tools / "aapt2", "compile", "--dir", app / "res", "-o", temporary / "compiled.zip"], env)
    run("2/7 Link manifest/resources/assets", [tools / "aapt2", "link", "-o", temporary / "base.apk", "-I", args.android_jar,
         "--manifest", manifest_file, "-R", temporary / "compiled.zip", "--auto-add-overlay", "-A", app / "assets", "-0", "arsc"], env)
    java_sources = [file for file in sorted((app / "src").rglob("*.java")) if file.name != "BuildConfig.java"]
    compile_log = run("3/7 Compile Java", [args.java_home / "bin/javac", "-source", "8", "-target", "8", "-encoding", "UTF-8",
         "-bootclasspath", args.android_jar, "-d", classes, *java_sources, generated], env)
    if compile_log:
        print(compile_log)
    run("4/7 Convert Java bytecode to DEX", [tools / "d8", "--debug" if args.dev else "--release", "--min-api", minimum,
         "--lib", args.android_jar, "--output", dex, *sorted(classes.rglob("*.class"))], env)
    print("5/7 Assemble and align APK", flush=True)
    assemble(temporary / "base.apk", dex, temporary / "unsigned.apk")
    run("zipalign", [tools / "zipalign", "-P", "16", "-f", "4", temporary / "unsigned.apk", temporary / "aligned.apk"], env)
    signed = temporary / "signed.apk"
    signing = [tools / "apksigner", "sign", "--ks", args.keystore,
               "--ks-key-alias", args.key_alias, "--ks-pass", "file:" + str(args.password_file)]
    # apksigner consumes a new line each time the same password file is passed.
    # Omitting key-pass uses the store password, avoiding a second read of a one-line file.
    if args.key_password_file != args.password_file:
        signing += ["--key-pass", "file:" + str(args.key_password_file)]
    signing += ["--min-sdk-version", minimum, "--v4-signing-enabled", "false", "--out", signed, temporary / "aligned.apk"]
    run("6/7 Sign with existing certificate", signing, env)
    verification = run("7/7 Verify APK signature", [tools / "apksigner", "verify", "--verbose", "--print-certs", signed], env)
    run("Verify ZIP alignment", [tools / "zipalign", "-c", "-P", "16", "4", signed], env)
    badging = run("Verify package and version", [tools / "aapt2", "dump", "badging", signed], env)
    expected = f"package: name='{PACKAGE}' versionCode='{code}' versionName='{version}'"
    if not badging.startswith(expected):
        raise RuntimeError("The packaged APK has an unexpected application ID or version")
    asset_hashes = {}
    with zipfile.ZipFile(signed) as apk:
        if apk.getinfo("resources.arsc").compress_type != zipfile.ZIP_STORED:
            raise RuntimeError("resources.arsc must be uncompressed")
        dex_has_debugging = b"setWebContentsDebuggingEnabled" in apk.read("classes.dex")
        if dex_has_debugging != args.dev:
            raise RuntimeError("Development-only WebView debugging did not match build type")
        for file in sorted((app / "assets").rglob("*")):
            if file.is_file():
                name = "assets/" + file.relative_to(app / "assets").as_posix()
                data = file.read_bytes()
                if apk.read(name) != data:
                    raise RuntimeError(f"Packaged asset differs from build snapshot: {name}")
                asset_hashes[name] = hashlib.sha256(data).hexdigest()
    output_dir = ROOT / "out"
    output_dir.mkdir(exist_ok=True)
    output = output_dir / f"game-center-v{version}.apk"
    apk_hash = hashlib.sha256(signed.read_bytes()).hexdigest()
    os.replace(signed, output)
    info = {"package": PACKAGE, "versionName": version, "versionCode": code, "development": args.dev,
            "apkSha256": apk_hash, "assetSha256": asset_hashes,
            "aapt2": run("Record toolchain version", [tools / "aapt2", "version"], env),
            "javac": run("Record Java version", [args.java_home / "bin/javac", "-version"], env),
            "signatureVerification": verification}
    output.with_suffix(".json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(badging.splitlines()[0])
    print(verification)
    print(f"APK: {output}\nSHA-256: {apk_hash}")


def main():
    temporary = ROOT / "TMP to delete-build"
    try:
        args = arguments()
        env = choose_toolchain(args)
        try:
            temporary.mkdir()
        except FileExistsError:
            raise RuntimeError("TMP to delete-build already exists; another build may be running")
        try:
            build(args, env, temporary)
        finally:
            shutil.rmtree(temporary)
    except (RuntimeError, OSError, ET.ParseError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
