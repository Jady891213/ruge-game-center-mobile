#!/usr/bin/env python3
"""Export the currently open development WebView's actual action-game renderer.

This never navigates, starts a game, installs an APK, or changes a saved score.
Open the requested game first; uses phone-cdp.py and its automatic ADB cleanup.
"""
import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
import runpy
import struct
import tempfile

PROJECT = Path(__file__).resolve().parents[1]
GAMES = ("flappy-bird", "dino-runner", "frog-pond")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game", choices=GAMES)
    args = parser.parse_args()
    expression = """(() => {
      const expected = %s;
      const actual = location.pathname.split('/').slice(-2, -1)[0];
      if (actual !== expected) throw new Error('Open ' + expected + ' first; current page: ' + actual);
      if (!window.__actionPreview) throw new Error('This APK does not include the action preview renderer');
      return window.__actionPreview.export(1200, 720);
    })()""" % json.dumps(args.game)
    phone = runpy.run_path(str(PROJECT / "scripts" / "phone-cdp.py"))
    data_url = asyncio.run(phone["evaluate"](expression))
    if not isinstance(data_url, str) or not data_url.startswith("data:image/png;base64,"):
        raise RuntimeError("The WebView did not return a PNG")
    png = base64.b64decode(data_url.split(",", 1)[1], validate=True)
    if (len(png) < 24 or png[:8] != b"\x89PNG\r\n\x1a\n"
            or png[-8:] != b"IEND\xaeB`\x82"
            or struct.unpack(">II", png[16:24]) != (1200, 720)):
        raise RuntimeError("The WebView returned an incomplete PNG or an unexpected size")
    output = PROJECT / "app" / "assets" / "shared" / f"{args.game}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix="TMP to delete-action-cover-", suffix=".png",
                                         dir=PROJECT, delete=False) as file:
            temporary = Path(file.name)
            file.write(png)
        os.replace(temporary, output)
        print(f"{args.game}: {output.relative_to(PROJECT)} (1200 × 720)")
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
