#!/usr/bin/env python3
"""Render the password game's real board as the collection cover, without separate artwork."""
import argparse
import importlib.util
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cover_browser', ROOT / 'scripts/render-action-covers.py')
browser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(browser)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chrome', help='Override the installed Google Chrome / Chromium executable')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='TMP to delete-codebreaker-cover-', dir=ROOT) as directory:
        browser.render(browser.find_chrome(args.chrome), 'code-breaker', Path(directory))


if __name__ == '__main__':
    main()
