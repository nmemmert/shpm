#!/usr/bin/env python3
"""
Download new photos from Amazon Photos using browser-exported cookies.

Usage:
    amazon_sync.py <cookies.txt> <dest_dir>

cookies.txt must be in Netscape/Mozilla format. Export it from your browser
using an extension like "Get cookies.txt LOCALLY" while logged into amazon.com.
"""

import sys
import json
import time
import pathlib
import http.cookiejar
import urllib.request
import urllib.parse
import urllib.error

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


def build_opener(cookie_file):
    jar = http.cookiejar.MozillaCookieJar()
    try:
        jar.load(cookie_file, ignore_discard=True, ignore_expires=True)
    except FileNotFoundError:
        print(f"Error: cookie file not found: {cookie_file}", file=sys.stderr, flush=True)
        sys.exit(1)
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api_get(opener, url):
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=30) as r:
        return json.loads(r.read().decode())


def list_photos(opener, offset=0, limit=200):
    params = urllib.parse.urlencode({
        "filters": "kind:PHOTOS and contentProperties.contentType:(image*)",
        "sort": '["modifiedDate DESC"]',
        "limit": limit,
        "offset": offset,
        "asset": "ALL",
        "tempLink": "false",
    })
    return api_get(opener, f"https://www.amazon.com/drive/v1/nodes?{params}")


def download_node(opener, node_id, dest_path):
    url = f"https://www.amazon.com/drive/v1/nodes/{node_id}/content"
    req = urllib.request.Request(url, headers=HEADERS)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with opener.open(req, timeout=120) as r, open(dest_path, "wb") as f:
        while True:
            chunk = r.read(65536)
            if not chunk:
                break
            f.write(chunk)


def main():
    if len(sys.argv) < 3:
        print("Usage: amazon_sync.py <cookies.txt> <dest_dir>", file=sys.stderr, flush=True)
        sys.exit(1)

    cookie_file = sys.argv[1]
    dest_dir = pathlib.Path(sys.argv[2])
    dest_dir.mkdir(parents=True, exist_ok=True)

    opener = build_opener(cookie_file)
    downloaded = 0
    skipped = 0
    offset = 0

    print(f"Destination: {dest_dir}", flush=True)

    while True:
        print(f"Fetching photo list (offset={offset})…", flush=True)
        try:
            data = list_photos(opener, offset=offset)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                print(
                    "Authentication failed. Re-export your cookies from a logged-in amazon.com session.",
                    file=sys.stderr, flush=True,
                )
            else:
                print(f"HTTP {e.code}: {e.reason}", file=sys.stderr, flush=True)
            sys.exit(1)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr, flush=True)
            sys.exit(1)

        nodes = data.get("data", [])
        total_count = data.get("count", 0)

        if not nodes:
            break

        for node in nodes:
            name = node.get("name") or f"{node['id']}.jpg"
            dest = dest_dir / name
            if dest.exists():
                skipped += 1
                continue
            print(f"  Downloading {name}", flush=True)
            try:
                download_node(opener, node["id"], dest)
                downloaded += 1
                time.sleep(0.1)
            except Exception as e:
                print(f"  Error: {e}", file=sys.stderr, flush=True)

        offset += len(nodes)
        if offset >= total_count:
            break

        time.sleep(0.5)

    print(f"\nDone — {downloaded} downloaded, {skipped} already present.", flush=True)


if __name__ == "__main__":
    main()
