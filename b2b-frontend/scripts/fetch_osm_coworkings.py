#!/usr/bin/env python3
"""
Fetch coworking points in Almaty from OpenStreetMap via Overpass API.

Usage:
  python scripts/fetch_osm_coworkings.py

Output:
  src/data/almaty-coworkings.osm.json
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]

# Almaty bbox: south, west, north, east
BBOX = "43.14,76.74,43.40,77.08"

QUERY = f"""
[out:json][timeout:120];
(
  node["office"~"coworking|co-working",i]({BBOX});
  way["office"~"coworking|co-working",i]({BBOX});
  relation["office"~"coworking|co-working",i]({BBOX});

  node["amenity"="coworking_space"]({BBOX});
  way["amenity"="coworking_space"]({BBOX});
  relation["amenity"="coworking_space"]({BBOX});

  node["name"~"cowork|co-working|коворк",i]({BBOX});
  way["name"~"cowork|co-working|коворк",i]({BBOX});
  relation["name"~"cowork|co-working|коворк",i]({BBOX});
);
out center tags;
"""


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "coworking"


def _fetch_overpass() -> dict:
    payload = urllib.parse.urlencode({"data": QUERY}).encode("utf-8")
    last_err: Exception | None = None
    for url in OVERPASS_URLS:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"User-Agent": "coworkwise-diploma/1.0 (osm overpass fetch)"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            last_err = e
            time.sleep(1.5)
            continue
    raise RuntimeError(f"Failed to fetch from Overpass mirrors: {last_err}")


def _name_from_tags(tags: dict, fallback_idx: int) -> str:
    candidates = [
        tags.get("name"),
        tags.get("brand"),
        tags.get("operator"),
        tags.get("name:en"),
    ]
    for c in candidates:
        if c and str(c).strip():
            return str(c).strip()
    return f"Coworking #{fallback_idx}"


def _element_lat_lng(el: dict) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    center = el.get("center") or {}
    if "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def main() -> int:
    data = _fetch_overpass()
    elements = data.get("elements", [])
    points: list[dict] = []
    dedup: set[tuple[str, float, float]] = set()

    for i, el in enumerate(elements, start=1):
        ll = _element_lat_lng(el)
        if not ll:
            continue
        lat, lng = ll
        tags = el.get("tags") or {}
        name = _name_from_tags(tags, i)
        key = (name.lower(), round(lat, 5), round(lng, 5))
        if key in dedup:
            continue
        dedup.add(key)
        el_id = str(el.get("id", i))
        points.append(
            {
                "id": f"osm-{_slug(name)}-{el_id}",
                "name": name,
                "lat": round(lat, 6),
                "lng": round(lng, 6),
            }
        )

    points.sort(key=lambda x: x["name"].lower())

    out_path = pathlib.Path(__file__).resolve().parents[1] / "src" / "data" / "almaty-coworkings.osm.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(points, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(points)} coworkings to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

