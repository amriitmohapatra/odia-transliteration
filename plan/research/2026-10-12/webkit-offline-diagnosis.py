"""Separate browser offline emulation from actual origin loss (Linux WebKit).

WEBKIT_EXECUTABLE_PATH=/path/to/launcher python3 webkit-offline-diagnosis.py \
  /path/to/Appv2/dist [--baseline /path/to/frozen/dist] [--output results.json]

Uses fresh loopback ports and contexts. Minimal controls contain no product code.
Records observations, not a replacement for the failing offline acceptance test.
"""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import tempfile
import threading
import urllib.request
from playwright.sync_api import sync_playwright

HTML = '''<!doctype html><meta charset="utf-8"><title>Offline control</title>
<p id="control">minimal service worker control</p>
<script>navigator.serviceWorker.register('./sw.js')</script>'''
DIRECT_SW = '''self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => e.respondWith(new Response(
  %s, {headers:{'Content-Type':'text/html'}})));''' % json.dumps(HTML)
CACHE_SW = '''self.addEventListener('install', e => e.waitUntil(
  caches.open('control').then(c => c.add('./')).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => e.respondWith(
  caches.open('control').then(c => c.match('./'))));'''


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def run(browser, label, root, mechanism):
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
        functools.partial(QuietHandler, directory=str(root)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    context.add_init_script("localStorage.setItem('odia.pref.seenIntro','1')")
    page = context.new_page()
    page.set_default_timeout(15000)
    record = {'target': label, 'mechanism': mechanism, 'origin': url}
    try:
        page.goto(url)
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        page.reload()
        page.wait_for_load_state('networkidle')
        record['before'] = page.evaluate('''async () => ({
          controlled: !!navigator.serviceWorker.controller,
          online: navigator.onLine,
          caches: await Promise.all((await caches.keys()).map(async key => ({
            key, entries: (await (await caches.open(key)).keys()).length
          })))
        })''')
        if mechanism == 'playwright-offline':
            context.set_offline(True)
        else:
            server.shutdown()
            server.server_close()
            try:
                urllib.request.urlopen(url, timeout=2)
                record['origin_unavailable'] = False
            except OSError:
                record['origin_unavailable'] = True
            assert record['origin_unavailable'], 'Stopped origin unexpectedly remains reachable'
        try:
            response = page.reload(timeout=15000)
            record['reload'] = 'success'
            record['status'] = response.status if response else None
            record['after'] = page.evaluate('''() => ({controlled: !!navigator.serviceWorker.controller,
              online: navigator.onLine, title: document.title})''')
            if label.startswith('minimal'):
                record['usable'] = page.locator('#control').inner_text() == 'minimal service worker control'
            else:
                editor = page.locator('#roman')
                editor.fill('')
                editor.press_sequentially('kemiti achha ', delay=35)
                record['typed'] = editor.input_value()
                record['usable'] = record['typed'].strip() == 'କେମିତି ଅଛ'
                if label == 'current':
                    page.locator('.dict-direction').select_option('english')
                    page.locator('.dict-search').fill('water')
                    page.wait_for_function("document.querySelector('.dict-english-entry')?.textContent.includes('water:')")
                    record['english_lookup'] = page.locator('.dict-word').inner_text()
                    assert record['english_lookup'] == 'ପାଣି', 'English water lookup has unexpected output'
                assert record['usable'], 'Typing failed after reload'
        except Exception as error:
            record['reload'] = 'failure'
            record['error'] = str(error).splitlines()[0]
    except Exception as error:
        record['setup_error'] = str(error)
    finally:
        context.close()
        server.shutdown()
        server.server_close()
    print(json.dumps(record, ensure_ascii=False), flush=True)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dist', type=Path)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    records = []
    with tempfile.TemporaryDirectory(prefix='odia-sw-diagnosis-') as tmp, sync_playwright() as pw:
        targets = []
        for label, script in [('minimal-direct-response', DIRECT_SW), ('minimal-cache', CACHE_SW)]:
            root = Path(tmp) / label
            root.mkdir()
            (root / 'index.html').write_text(HTML)
            (root / 'sw.js').write_text(script)
            targets.append((label, root))
        if args.baseline:
            targets.append(('baseline', args.baseline))
        targets.append(('current', args.dist))
        executable = os.environ.get('WEBKIT_EXECUTABLE_PATH')
        browser = pw.webkit.launch(**({'executable_path': executable} if executable else {}))
        try:
            for label, root in targets:
                for mechanism in ['playwright-offline', 'origin-stopped']:
                    records.append(run(browser, label, root.resolve(), mechanism))
        finally:
            browser.close()
    if args.output:
        args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    if any('setup_error' in record for record in records):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
