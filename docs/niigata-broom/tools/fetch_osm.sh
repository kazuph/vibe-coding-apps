#!/bin/sh
# OpenStreetMap（Overpass API）から水域・土地利用・道路・鉄道・橋・防波堤・中央区の区界を取得する
curl -s -A "vibe-coding-apps/1.0" --data-urlencode data@q.txt https://overpass-api.de/api/interpreter -o osm_raw.json
