#!/usr/bin/env python3
"""Replace the %%BASE_URL%% placeholder with the real site address.

The placeholder lives only in canonical tags, sitemap.xml and robots.txt.
All other links in the site are relative, so the site works at any base path.

Usage:
    python set_base_url.py https://USER.github.io/alexai-resume-help
    python set_base_url.py https://new.example.org --old https://USER.github.io/alexai-resume-help
    python set_base_url.py https://example.org --dry-run

Standard library only. Writes files in place, so commit first if you want a diff.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

PLACEHOLDER = "%%BASE_URL%%"
SUFFIXES = {".html", ".xml", ".txt"}
SKIP_DIRS = {".git", "tests", "node_modules"}


def normalize(url: str) -> str:
    """Return the URL without a trailing slash, or raise ValueError with a fix."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"'{url}' is not a full web address. Example: https://example.github.io/alexai-resume-help")
    if parsed.query or parsed.fragment:
        raise ValueError("The base URL must not include a query string or a #fragment.")
    if "%" in url or " " in url:
        raise ValueError("The base URL must not contain spaces or percent signs.")
    return url.rstrip("/")


def site_files(root: Path):
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in SUFFIXES:
            continue
        if SKIP_DIRS.intersection(path.relative_to(root).parts):
            continue
        yield path


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", help="Public base URL of the site, e.g. https://USER.github.io/alexai-resume-help")
    ap.add_argument("--old", help="Previously set base URL to swap out (use when the placeholder is already gone)")
    ap.add_argument("--dry-run", action="store_true", help="Report what would change and write nothing")
    args = ap.parse_args(argv)

    try:
        new = normalize(args.url)
        old = normalize(args.old) if args.old else None
    except ValueError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2

    needle = old if old else PLACEHOLDER
    root = Path(__file__).resolve().parent
    changed = 0
    total = 0
    for path in site_files(root):
        text = path.read_text(encoding="utf-8")
        count = text.count(needle)
        if not count:
            continue
        total += count
        changed += 1
        print(f"{'would update' if args.dry_run else 'updated'} {path.relative_to(root)} ({count})")
        if not args.dry_run:
            path.write_text(text.replace(needle, new), encoding="utf-8", newline="")

    if not total:
        hint = "" if old else " If you already ran this script, pass --old <the URL you used before>."
        print(f"error: nothing to replace; '{needle}' was not found.{hint}", file=sys.stderr)
        return 1
    print(f"{total} replacement(s) in {changed} file(s) -> {new}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
