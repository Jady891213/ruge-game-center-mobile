#!/usr/bin/env python3
"""Render covers from each game's actual Canvas drawing functions.

Run: python3 scripts/render-action-covers.py
Requires local Google Chrome / Chromium; --chrome can override its location.
No game rules or artwork are duplicated here. The packaged HTML's ?cover=1
mode calls the same drawPreview used by its intro, which calls its live renderer.
"""

import argparse
import os
from pathlib import Path
import shutil
import signal
import struct
import subprocess
import tempfile
import time


PROJECT = Path(__file__).resolve().parent.parent
GAMES = ("flappy-bird", "dino-runner", "frog-pond")


def find_chrome(explicit):
    candidates = [explicit, os.environ.get("CHROME_BIN"),
                  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                  shutil.which("google-chrome"), shutil.which("chromium"),
                  shutil.which("chromium-browser")]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    raise SystemExit("Google Chrome / Chromium was not found; pass --chrome /path/to/browser")


def stop_owned_browser(process, profile):
    """Close our browser group and any Chrome child retaining this unique profile."""
    if process is not None and process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
            except ProcessLookupError:
                pass
    listing = subprocess.run(["ps", "-ax", "-o", "pid=,command="], capture_output=True, text=True)
    for line in listing.stdout.splitlines():
        fields = line.strip().split(None, 1)
        if len(fields) != 2 or str(profile) not in fields[1]:
            continue
        if "chrome" not in fields[1].lower() and "chromium" not in fields[1].lower():
            continue
        try:
            os.kill(int(fields[0]), signal.SIGTERM)
        except ProcessLookupError:
            pass


def render(browser, game, temporary_root):
    output = PROJECT / "app" / "assets" / "shared" / f"{game}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    profile = temporary_root / game
    temporary_png = temporary_root / f"{game}.png"
    page = (PROJECT / "app" / "assets" / game / "index.html").as_uri()
    command = [browser, "--headless=new", "--disable-gpu", "--no-first-run",
               "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
               "--disable-background-networking", "--mute-audio", "--window-size=600,360",
               "--force-device-scale-factor=2", "--virtual-time-budget=1200",
               f"--user-data-dir={profile}", f"--screenshot={temporary_png}",
               page + "?cover=1&w=600&h=360"]
    process = None
    log = temporary_root / f"{game}.log"
    with log.open("wb") as errors:
        try:
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=errors,
                                       start_new_session=True)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if temporary_png.exists():
                    png = temporary_png.read_bytes()
                    if (len(png) > 24 and png[:8] == b"\x89PNG\r\n\x1a\n"
                            and png[-8:] == b"IEND\xaeB`\x82"):
                        if struct.unpack(">II", png[16:24]) != (1200, 720):
                            raise RuntimeError(f"{game}: unexpected PNG dimensions")
                        os.replace(temporary_png, output)
                        print(f"{game}: {output.relative_to(PROJECT)} (1200 × 720)", flush=True)
                        return
                if process.poll() is not None:
                    break
                time.sleep(.1)
            raise RuntimeError(f"{game}: no complete PNG was produced\n{log.read_text(errors='replace')[-2000:]}")
        finally:
            # Some macOS Chrome builds keep utility processes alive after writing
            # the screenshot; completion is the full PNG, followed by explicit close.
            stop_owned_browser(process, profile)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", help="Google Chrome / Chromium executable")
    args = parser.parse_args()
    browser = find_chrome(args.chrome)
    with tempfile.TemporaryDirectory(prefix="TMP to delete-action-covers-", dir=PROJECT) as directory:
        for game in GAMES:
            render(browser, game, Path(directory))


if __name__ == "__main__":
    main()
