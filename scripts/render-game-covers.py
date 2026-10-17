#!/usr/bin/env python3
"""Render all collection covers from the games' actual offline cover views."""
import argparse
import importlib.util
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
GAMES = ('bear-snack-shop', 'forest-juice', 'code-breaker', 'pipe-flow', 'gravity-maze', 'tilt-star-box', 'hanzi-puzzle',
         'hanzi-typing', 'paint-mixing', 'flappy-bird', 'dino-runner', 'frog-pond')
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('cover_browser', ROOT/'scripts/render-action-covers.py')
browser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(browser)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chrome', help='Override the installed Chrome / Chromium executable')
    parser.add_argument('--games', nargs='+', choices=GAMES, default=GAMES)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='TMP to delete-game-covers-', dir=ROOT) as directory:
        for game in args.games:
            browser.render(browser.find_chrome(args.chrome), game, Path(directory))


if __name__ == '__main__':
    main()
