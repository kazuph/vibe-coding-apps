"""Regenerate independent fixtures: Python + skyfield==1.55 + pyerfa==2.0.1.5.

Usage: python generate-reference.py /path/to/de421.bsp
DE421: https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp
No application calculations are used; only its J2000 catalog is input.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import erfa
import numpy as np
from skyfield.api import Star, load, load_file, wgs84

root = Path(__file__).resolve().parents[2]
catalog = json.loads(subprocess.check_output([
    'node', '-e', "require('./docs/hoshizora/astro.js'); console.log(JSON.stringify(Astro.stars))"
], cwd=root))
kernel = Path(sys.argv[1])
ephemeris = load_file(str(kernel))
ts = load.timescale(builtin=True)
dates = ['2000-01-01T12:00:00Z', '2024-02-29T23:59:59Z',
         '2024-03-01T00:00:00Z', '2025-12-31T23:59:59Z',
         '2026-01-01T00:00:00Z', '2030-06-21T12:00:00Z',
         '2050-01-01T00:00:00Z']
dates += [f'2026-{month:02}-21T{hour:02}:00:00Z'
          for month in [3, 6, 9, 12] for hour in [0, 6, 12, 18]]
dates += ['2026-10-03T11:59:59Z', '2026-10-03T12:00:00Z',
          '2026-10-03T14:59:59Z', '2026-10-03T15:00:00Z']
from datetime import datetime
times = ts.from_datetimes([datetime.fromisoformat(d.replace('Z', '+00:00')) for d in dates])
locations = [('Niigata', 37.916, 139.036), ('Sydney', -33.8688, 151.2093),
             ('NewYork', 40.7128, -74.006), ('Greenwich', 51.4779, 0),
             ('EquatorEast', 0, 180), ('EquatorWest', 0, -180),
             ('NorthPole', 90, 0), ('SouthPole', -90, 0)]
targets = {key: ephemeris[value] for key, value in [
    ('sun', 'sun'), ('moon', 'moon'), ('mercury', 'mercury'), ('venus', 'venus'),
    ('mars', 'mars'), ('jupiter', 'jupiter barycenter'), ('saturn', 'saturn barycenter')]}
# All catalog stars: includes pole-adjacent Polaris and RA-wrap cases.
targets.update({s['id']: Star(ra_hours=s['ra']/15, dec_degrees=s['dec']) for s in catalog})
rows = []
for name, lat, lon in locations:
    observer = (ephemeris['earth'] + wgs84.latlon(lat, lon)).at(times)
    for key, target in targets.items():
        apparent = observer.observe(target).apparent()
        alt, az, _ = apparent.altaz()
        # Standard atmosphere; explicitly separate from unrefracted direction.
        refracted, _, _ = apparent.altaz(temperature_C=10, pressure_mbar=1010)
        for index, date in enumerate(dates):
            rows.append([date, name, key, round(float(alt.degrees[index]), 9),
                         round(float(az.degrees[index]), 9), round(float(refracted.degrees[index]), 9)])
precession = []
for years in [-100, 0, 26.75, 50, 100]:
    matrix = erfa.pmat76(2451545.0, years * 365.25)
    for s in catalog:
        xyz = erfa.s2c(np.deg2rad(s['ra']), np.deg2rad(s['dec']))
        ra, dec = erfa.c2s(matrix @ xyz)
        precession.append([years, s['id'], float(np.rad2deg(ra) % 360), float(np.rad2deg(dec))])
result = {'source': {'skyfield': '1.55', 'pyerfa': erfa.__version__,
                    'ephemeris': kernel.name, 'sha256': hashlib.sha256(kernel.read_bytes()).hexdigest(),
                    'stars': 'Application J2000 catalog; no proper motion. Tests coordinate transform, not catalog accuracy.',
                    'atmosphere': '10 C, 1010 mbar, elevation 0 m; Skyfield standard refraction'},
          'locations': locations, 'rows': rows, 'precession': precession}
(Path(__file__).parent / 'reference.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'{len(rows)} apparent directions; {len(precession)} ERFA precession cases')
