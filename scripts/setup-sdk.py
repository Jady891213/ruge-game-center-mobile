#!/usr/bin/env python3
"""Install pinned official Android SDK archives for macOS/Linux without Android Studio."""
import argparse
import hashlib
import os
from pathlib import Path
import platform
import shutil
import stat
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://dl.google.com/android/repository/"
# Official repository2-1.xml checksums and sizes, verified 2026-10-04.
# API 35 base revision 2 is pinned; extension SDKs are intentionally not substituted.
BUILD_TOOLS = {
    "Darwin": ("build-tools_r35_macosx.zip", 76857898, "93ab8ce91230e067b5add4bfa79919c52b27f072"),
    "Linux": ("build-tools_r35_linux.zip", 61958799, "2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc"),
}
PLATFORM = ("platform-35_r02.zip", 64273788, "0bb560a90a7a2cbd0dd8348224d518b638fe7949")


def fetch_and_extract(package, temporary):
    filename, expected_size, expected_sha1 = package
    archive = temporary / filename
    digest = hashlib.sha1()
    size = 0
    print(f"Download {BASE}{filename}", flush=True)
    with urllib.request.urlopen(BASE + filename, timeout=45) as response, archive.open("wb") as output:
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            output.write(block)
            digest.update(block)
            size += len(block)
    if size != expected_size or digest.hexdigest() != expected_sha1:
        raise RuntimeError(f"Official checksum/size verification failed for {filename}")
    print(f"Official SHA-1 verified: {filename}", flush=True)
    extracted = temporary / filename.removesuffix(".zip")
    extracted.mkdir()
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            target = (extracted / entry.filename).resolve()
            if not target.is_relative_to(extracted.resolve()):
                raise RuntimeError(f"Invalid archive member: {entry.filename}")
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise RuntimeError(f"Unexpected symlink in official archive: {entry.filename}")
            bundle.extract(entry, extracted)
            if mode & 0o777:
                target.chmod(mode & 0o777)
    return extracted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk-root", type=Path, default=Path(os.environ.get("GAMECENTER_ANDROID_SDK_ROOT", str(ROOT / ".local-tools/android"))))
    parser.add_argument("--plan", action="store_true", help="Print the pinned downloads without changing files")
    args = parser.parse_args()
    system = platform.system()
    if system not in BUILD_TOOLS:
        raise RuntimeError("The build script currently supports macOS and Linux")
    sdk = args.sdk_root.resolve()
    tasks = [(BUILD_TOOLS[system], sdk / "build-tools/35.0.0", "aapt2"),
             (PLATFORM, sdk / "platforms/android-35", "android.jar")]
    for package, destination, marker in tasks:
        print(f"{BASE}{package[0]} -> {destination}\n  official SHA-1: {package[2]} / bytes: {package[1]}")
        if destination.exists() and not (destination / marker).is_file():
            raise RuntimeError(f"Incomplete SDK directory: {destination}")
    if args.plan:
        return
    pending = [task for task in tasks if not task[1].is_dir()]
    if not pending:
        print("Pinned SDK directories are already present")
        return
    temporary = ROOT / "TMP to delete-sdk-setup"
    temporary.mkdir()
    try:
        for package, destination, marker in pending:
            extracted = fetch_and_extract(package, temporary)
            found = list(extracted.rglob(marker))
            if len(found) != 1:
                raise RuntimeError(f"Unexpected official SDK archive layout: {package[0]}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(found[0].parent), destination)
            print(f"Installed {destination}", flush=True)
    finally:
        shutil.rmtree(temporary)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
