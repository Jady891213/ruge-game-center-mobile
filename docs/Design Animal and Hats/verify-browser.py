#!/usr/bin/env python3
"""Run the two games' real-browser check in one owned, finally-closed session."""
from pathlib import Path
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import subprocess
import tempfile
from threading import Thread

ROOT = Path(__file__).resolve().parents[2]
DOC = Path(__file__).resolve().parent
CLI = Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh'
SESSION = 'animal-hats-design-check'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--layout-only', action='store_true', help='Repeat screenshots and representative interaction after an art-only revision')
    args=parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT / 'app/assets')))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    with tempfile.TemporaryDirectory(prefix='TMP to delete-animal-hats-browser-', dir=ROOT) as scratch:
        def run(*args):
            result = subprocess.run([str(CLI), '-s=' + SESSION, *args], cwd=scratch,
                                    text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            print(result.stdout, flush=True)
            if result.returncode:
                raise RuntimeError('Playwright command failed: ' + args[0])
            return result.stdout
        try:
            run('open', 'http://127.0.0.1:' + str(server.server_port) + '/animal-balance/index.html',
                '--browser', 'chrome', '--idle-timeout', '120000')
            run('snapshot')
            code = (DOC / 'verify-browser.mjs').read_text().replace('__PROJECT_ROOT__', json.dumps(str(ROOT)))
            result = run('--raw', 'run-code', code)
            (DOC / 'browser-check-result.json').write_text(json.dumps(json.loads(result), ensure_ascii=False, indent=2) + '\n')
            if not args.layout_only:
                all_levels=[]
                for game in ('animal-balance', 'hat-trick'):
                    for start in range(0, 18, 6):
                        config={'game': game, 'first': start == 0, 'levels': list(range(start, start+6))}
                        code=(DOC / 'verify-all-levels.mjs').read_text().replace('__RUN_CONFIG__', json.dumps(config))
                        result=run('--raw', 'run-code', code)
                        all_levels.extend(json.loads(result)['results'])
                (DOC / 'browser-ui-all-levels.json').write_text(json.dumps({'pass': True, 'viewport': [320, 568], 'results': all_levels}, ensure_ascii=False, indent=2) + '\n')
        finally:
            subprocess.run([str(CLI), '-s=' + SESSION, 'close'], cwd=scratch,
                           text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    main()
