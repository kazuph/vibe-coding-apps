// Browser bundle entry. geomagnetism 0.2.0 (Apache-2.0) + NOAA/BGS WMM2025.
// Use only WMM2025 and compute decimal years explicitly (including leap years).
const Model = require('geomagnetism/lib/model.js');
const data = require('geomagnetism/data/wmm-2025.json');
function field(date, lat, lon, altitudeKm = 0) {
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 2025 || year >= 2030 ||
      ![lat, lon, altitudeKm].every(Number.isFinite) || Math.abs(lat) > 90) return null;
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
  const elapsed = year - 2025 + (date.getTime() - start) / (end - start);
  const model = new Model({...data,
    main_field_coeff_g: data.main_field_coeff_g.map((v,i) => v + elapsed*data.secular_var_coeff_g[i]),
    main_field_coeff_h: data.main_field_coeff_h.map((v,i) => v + elapsed*data.secular_var_coeff_h[i])
  });
  return model.point([lat, lon, altitudeKm]);
}
function declination(date, lat, lon) {
  const result = field(date, lat, lon);
  // NOAA's blackout zone: horizontal intensity < 2000 nT cannot give a reliable compass direction.
  return result && result.h >= 2000 && Number.isFinite(result.decl) ? result.decl : null;
}
globalThis.Compass = {field, declination};
