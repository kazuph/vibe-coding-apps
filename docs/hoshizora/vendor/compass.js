/* Generated from geomagnetism 0.2.0 + NOAA/BGS WMM2025. Apache-2.0; see geomagnetism-LICENSE.txt.
   hoshizora wrapper changes decimal-year calculation and validity handling; rebuild: npm --prefix tests/hoshizora run build */
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // node_modules/geomagnetism/lib/coords/cartesian.js
  var require_cartesian = __commonJS({
    "node_modules/geomagnetism/lib/coords/cartesian.js"(exports, module) {
      var GeodeticCoord = require_geodetic();
      module.exports = CartesianCoord;
      function CartesianCoord(options) {
        this.x = options.x;
        this.y = options.y;
        this.z = options.z;
      }
      CartesianCoord.prototype.toGeodetic = function(ellipsoid) {
        var modified_b = this.z < 0 ? -ellipsoid.b : ellipsoid.b;
        var x = this.x;
        var y = this.y;
        var z = this.z;
        var r = Math.sqr(x * x + y * y);
        var e = (modified_b * z - (ellipsoid.a * ellipsoid.a - modified_b * modified_b)) / (ellipsoid.a * r);
        var f = (modified_b * z + (ellipsoid.a * ellipsoid.a - modified_b * modified_b)) / (ellipsoid.a * r);
        var p = 4 / 3 * (e * f + 1);
        var q = 2 * (e * e + f * f);
        var d = p * p * p + q * q;
        var v;
        if (d > 0) {
          v = Math.pow(Math.sqrt(d) - q, 1 / 3) - Math.pow(Math.sqrt(d) + q, 1 / 3);
        } else {
          v = 2 * Math.sqrt(-p) * Math.cos(Math.acos(q / (p * Math.sqrt(-p))) / 3);
        }
        if (v * v < Math.abs(p)) {
          v = -(v * v * v + 2 * q) / 3 * p;
        }
        var g = (Math.sqrt(e * e + v) + e) / 2;
        var t = Math.sqrt(g * g + (f - v * g) / (2 * g - e)) - g;
        var rlat = Math.atan(ellipsoid.a * (1 - t * t) / (2 * modified_b * t));
        var zlong = Math.atan2(y, x);
        if (zlong < 0) zlong += 2 * Math.PI;
        var height_above_ellipsoid = (r - ellipsoid.a * t) * Math.cos(rlat) + (z - modified_b) * Math.sin(rlat);
        var lambda = zlong * Math.PI / 180;
        if (lambda > 180) lambda -= 360;
        return new GeodeticCoord({
          lambda,
          phi: rlat * Math.PI / 180,
          height_above_ellipsoid,
          ellipsoid
        });
      };
    }
  });

  // node_modules/geomagnetism/lib/legendre.js
  var require_legendre = __commonJS({
    "node_modules/geomagnetism/lib/legendre.js"(exports, module) {
      module.exports = LegendreFunction;
      function LegendreFunction(coord_spherical, n_max) {
        var sin_phi = Math.sin(Math.PI / 180 * coord_spherical.phig);
        var result;
        if (n_max <= 16 || 1 - Math.abs(sin_phi) < 1e-10) {
          result = PcupLow(sin_phi, n_max);
        } else {
          result = PcupHigh(sin_phi, n_max);
        }
        this.pcup = result.pcup;
        this.dpcup = result.dpcup;
      }
      function PcupLow(x, n_max) {
        var k, z, n, m, i, i1, i2, num_terms;
        var schmidt_quasi_norm = [1];
        var pcup = [1];
        var dpcup = [0];
        z = Math.sqrt((1 - x) * (1 + x));
        num_terms = (n_max + 1) * (n_max + 2) / 2;
        for (n = 1; n <= n_max; n++) {
          for (m = 0; m <= n; m++) {
            i = n * (n + 1) / 2 + m;
            if (n == m) {
              i1 = (n - 1) * n / 2 + m - 1;
              pcup[i] = z * pcup[i1];
              dpcup[i] = z * dpcup[i1] + x * pcup[i1];
            } else if (n == 1 && m == 0) {
              i1 = (n - 1) * n / 2 + m;
              pcup[i] = x * pcup[i1];
              dpcup[i] = x * dpcup[i1] - z * pcup[i1];
            } else if (n > 1 && n != m) {
              i1 = (n - 2) * (n - 1) / 2 + m;
              i2 = (n - 1) * n / 2 + m;
              if (m > n - 2) {
                pcup[i] = x * pcup[i2];
                dpcup[i] = x * dpcup[i2] - z * pcup[i2];
              } else {
                k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
                pcup[i] = x * pcup[i2] - k * pcup[i1];
                dpcup[i] = x * dpcup[i2] - z * pcup[i2] - k * dpcup[i1];
              }
            }
          }
        }
        for (n = 1; n <= n_max; n++) {
          i = n * (n + 1) / 2;
          i1 = (n - 1) * n / 2;
          schmidt_quasi_norm[i] = schmidt_quasi_norm[i1] * (2 * n - 1) / n;
          for (m = 1; m <= n; m++) {
            i = n * (n + 1) / 2 + m;
            i1 = n * (n + 1) / 2 + m - 1;
            schmidt_quasi_norm[i] = schmidt_quasi_norm[i1] * Math.sqrt((n - m + 1) * (m == 1 ? 2 : 1) / (n + m));
          }
        }
        for (n = 1; n <= n_max; n++) {
          for (m = 0; m <= n; m++) {
            i = n * (n + 1) / 2 + m;
            pcup[i] *= schmidt_quasi_norm[i];
            dpcup[i] *= -schmidt_quasi_norm[i];
          }
        }
        return {
          pcup,
          dpcup
        };
      }
      function PcupHigh(x, n_max) {
        if (Math.abs(x) == 1) {
          throw new Error("Error in PcupHigh: derivative cannot be calculated at poles");
        }
        var n, m, k;
        var num_terms = (n_max + 1) * (n_max + 2) / 2;
        var f1 = [];
        var f2 = [];
        var pre_sqr = [];
        var scalef = 1e-280;
        for (n = 0; n <= 2 * n_max + 1; ++n) {
          pre_sqr[n] = Math.sqrt(n);
        }
        k = 2;
        for (n = 0; n <= n_max; n++) {
          k++;
          f1[k] = (2 * n - 1) / n;
          f2[k] = (n - 1) / n;
          for (m = 1; m <= n - 2; m++) {
            k++;
            f1[k] = (2 * n - 1) / pre_sqr[n + m] / pre_sqr[n - m];
            f2[k] = pre_sqr[n - m - 1] * pre_sqr[n + m - 1] / pre_sqr[n + m] / pre_sqr[n - m];
          }
          k += 2;
        }
        var z = Math.sqrt((1 - x) * (1 + x));
        var plm;
        var pm1 = x;
        var pm2 = 1;
        var pcup = [1, pm1];
        var dpcup = [0, z];
        if (n_max == 0) {
          throw new Error("Error in PcupHigh: n_max must be greater than 0");
        }
        k = 1;
        for (n = 2; n <= n_max; n++) {
          k = k + n;
          plm = f1[k] * x * pm1 - f2[k] * pm2;
          pcup[k] = plm;
          dpcup[k] = n * (pm1 - x * plm) / z;
          pm2 = pm1;
          pm1 = plm;
        }
        var pmm = pre_sqr[2] * scalef;
        var rescalem = 1 / scalef;
        var kstart = 0;
        for (var m = 1; m <= n_max - 1; ++m) {
          rescalem *= z;
          kstart = kstart + m + 1;
          pmm = pmm * pre_sqr[2 * m + 1] / pre_sqr[2 * m];
          pcup[kstart] = pmm * rescalem / pre_sqr[2 * m + 1];
          dpcup[kstart] = -(m * x * pcup[kstart] / z);
          pm2 = pmm / pre_sqr[2 * m + 1];
          k = kstart + m + 1;
          pm1 = x * pre_sqr[2 * m + 1] * pm2;
          pcup[k] = pm1 * rescalem;
          dpcup[k] = (pm2 * rescalem * pre_sqr[2 * m + 1] - x * (m + 1) * pcup[k]) / z;
          for (n = m + 2; n <= n_max; ++n) {
            k = k + n;
            plm = x * f1[k] * pm1 - f2[k] * pm2;
            pcup[k] = plm * rescalem;
            dpcup[k] = (pre_sqr[n + m] * pre_sqr[n - m] * pm1 * rescalem - n * x * pcup[k]) / z;
            pm2 = pm1;
            pm1 = plm;
          }
        }
        rescalem = rescalem * z;
        kstart = kstart + m + 1;
        pmm = pmm / pre_sqr[2 * n_max];
        pcup[kstart] = pmm * rescalem;
        dpcup[kstart] = -n_max * x * pcup[kstart] / z;
        return {
          pcup,
          dpcup
        };
      }
    }
  });

  // node_modules/geomagnetism/lib/coords/spherical.js
  var require_spherical = __commonJS({
    "node_modules/geomagnetism/lib/coords/spherical.js"(exports, module) {
      var CartesianCoord = require_cartesian();
      var LegendreFunction = require_legendre();
      module.exports = SphericalCoord;
      function SphericalCoord(options) {
        this.lambda = options.lambda;
        this.phig = options.phig;
        this.r = options.r;
      }
      SphericalCoord.prototype.toCartesian = function() {
        var radphi = this.phig * Math.PI / 180;
        var radlambda = this.lambda * Math.PI / 180;
        return new CartesianCoord({
          x: this.r * cos(radphi) * cos(radlambda),
          y: this.r * cos(radphi) * sin(radlambda),
          z: this.r * sin(radphi)
        });
      };
      SphericalCoord.prototype.toGeodetic = function(ellipsoid) {
        return this.toCartesian().toGeodetic(ellipsoid);
      };
      SphericalCoord.prototype.getHarmonicVariables = function(ellipsoid, n_max) {
        var m, n;
        var cos_lambda = Math.cos(Math.PI / 180 * this.lambda);
        var sin_lambda = Math.sin(Math.PI / 180 * this.lambda);
        var cos_mlambda = [1, cos_lambda];
        var sin_mlambda = [0, sin_lambda];
        var relative_radius_power = [
          ellipsoid.re / this.r * (ellipsoid.re / this.r)
        ];
        for (n = 1; n <= n_max; n++) {
          relative_radius_power[n] = relative_radius_power[n - 1] * (ellipsoid.re / this.r);
        }
        for (m = 2; m <= n_max; m++) {
          cos_mlambda[m] = cos_mlambda[m - 1] * cos_lambda - sin_mlambda[m - 1] * sin_lambda;
          sin_mlambda[m] = cos_mlambda[m - 1] * sin_lambda + sin_mlambda[m - 1] * cos_lambda;
        }
        return {
          relative_radius_power,
          cos_mlambda,
          sin_mlambda
        };
      };
      SphericalCoord.prototype.getLegendreFunction = function(n_max) {
        return new LegendreFunction(this, n_max);
      };
    }
  });

  // node_modules/geomagnetism/lib/ellipsoid.js
  var require_ellipsoid = __commonJS({
    "node_modules/geomagnetism/lib/ellipsoid.js"(exports, module) {
      module.exports = Ellipsoid;
      function Ellipsoid(options) {
        options = options || {
          a: 6378.137,
          b: 6356.7523142,
          fla: 1 / 298.257223563,
          re: 6371.2
        };
        this.a = options.a;
        this.b = options.b;
        this.fla = options.fla;
        this.re = options.re;
        this.eps = Math.sqrt(1 - this.b * this.b / (this.a * this.a));
        this.epssq = this.eps * this.eps;
      }
    }
  });

  // node_modules/geomagnetism/lib/coords/geodetic.js
  var require_geodetic = __commonJS({
    "node_modules/geomagnetism/lib/coords/geodetic.js"(exports, module) {
      var SphericalCoord = require_spherical();
      var Ellipsoid = require_ellipsoid();
      module.exports = GeodeticCoord;
      function GeodeticCoord(options) {
        this.options = options;
        this.lambda = options.lambda || options.lon;
        this.phi = options.phi || options.lat;
        this.height_above_ellipsoid = options.height_above_ellipsoid || 0;
        this.ellipsoid = options.ellipsoid || new Ellipsoid();
      }
      GeodeticCoord.prototype.toSpherical = function() {
        var ellipsoid = this.ellipsoid;
        var coslat = Math.cos(this.phi * Math.PI / 180);
        var sinlat = Math.sin(this.phi * Math.PI / 180);
        var rc = ellipsoid.a / Math.sqrt(1 - ellipsoid.epssq * sinlat * sinlat);
        var xp = (rc + this.height_above_ellipsoid) * coslat;
        var zp = (rc * (1 - ellipsoid.epssq) + this.height_above_ellipsoid) * sinlat;
        var r = Math.sqrt(xp * xp + zp * zp);
        return new SphericalCoord({
          r,
          phig: 180 / Math.PI * Math.asin(zp / r),
          lambda: this.lambda
        });
      };
      GeodeticCoord.prototype.clone = function() {
        return new GeodeticCoord(this.options);
      };
    }
  });

  // node_modules/geomagnetism/lib/magnetic_elements.js
  var require_magnetic_elements = __commonJS({
    "node_modules/geomagnetism/lib/magnetic_elements.js"(exports, module) {
      module.exports = MagneticElements;
      function MagneticElements(options) {
        this.x = options.x;
        this.y = options.y;
        this.z = options.z;
        this.h = options.h;
        this.f = options.f;
        this.incl = options.incl;
        this.decl = options.decl;
        this.gv = options.gv;
        this.xdot = options.xdot;
        this.ydot = options.ydot;
        this.zdot = options.zdot;
        this.hdot = options.hdot;
        this.fdot = options.fdot;
        this.incldot = options.incldot;
        this.decldot = options.decldot;
        this.gvdot = options.gvdot;
      }
      MagneticElements.prototype.clone = function() {
        return new MagneticElements(this);
      };
      MagneticElements.prototype.scale = function(factor) {
        return new MagneticElements({
          x: this.x * factor,
          y: this.y * factor,
          z: this.z * factor,
          h: this.h * factor,
          f: this.f * factor,
          incl: this.incl * factor,
          decl: this.decl * factor,
          gv: this.gv * factor,
          xdot: this.xdot * factor,
          ydot: this.ydot * factor,
          zdot: this.zdot * factor,
          hdot: this.hdot * factor,
          fdot: this.fdot * factor,
          incldot: this.incldot * factor,
          decldot: this.decldot * factor,
          gvdot: this.gvdot * factor
        });
      };
      MagneticElements.prototype.subtract = function(subtrahend) {
        return new MagneticElements({
          x: this.x - subtrahend.x,
          y: this.y - subtrahend.y,
          z: this.z - subtrahend.z,
          h: this.h - subtrahend.h,
          f: this.f - subtrahend.f,
          incl: this.incl - subtrahend.incl,
          decl: this.decl - subtrahend.decl,
          gv: this.gv - subtrahend.gv,
          xdot: this.xdot - subtrahend.xdot,
          ydot: this.ydot - subtrahend.ydot,
          zdot: this.zdot - subtrahend.zdot,
          hdot: this.hdot - subtrahend.hdot,
          fdot: this.fdot - subtrahend.fdot,
          incldot: this.incldot - subtrahend.incldot,
          decldot: this.decldot - subtrahend.decldot,
          gvdot: this.gvdot - subtrahend.gvdot
        });
      };
      MagneticElements.fromGeoMagneticVector = function(magnetic_vector) {
        var bx = magnetic_vector.bx;
        var by = magnetic_vector.by;
        var bz = magnetic_vector.bz;
        var h = Math.sqrt(bx * bx + by * by);
        return new MagneticElements({
          x: bx,
          y: by,
          z: bz,
          h,
          f: Math.sqrt(h * h + bz * bz),
          decl: 180 / Math.PI * Math.atan2(by, bx),
          incl: 180 / Math.PI * Math.atan2(bz, h)
        });
      };
      MagneticElements.fromSecularVariationVector = function(magnetic_variation) {
        var bx = magnetic_variation.bx;
        var by = magnetic_variation.by;
        var bz = magnetic_variation.bz;
        return new MagneticElements({
          xdot: bx,
          ydot: by,
          zdot: bz,
          hdot: (this.x * bx + this.y * by) / this.h,
          fdot: (this.x * bx + this.y * by + this.z * bz) / this.f,
          decldot: 180 / Math.PI * (this.x * this.ydot - this.y * this.xdot) / (this.h * this.h),
          incldot: 180 / Math.PI * (this.h * this.zdot - this.z * this.hdot) / (this.f * this.f),
          gvdot: this.decldot
        });
      };
    }
  });

  // node_modules/geomagnetism/lib/magnetic_vector.js
  var require_magnetic_vector = __commonJS({
    "node_modules/geomagnetism/lib/magnetic_vector.js"(exports, module) {
      module.exports = MagneticVector;
      function MagneticVector(options) {
        this.bx = options.bx;
        this.by = options.by;
        this.bz = options.bz;
      }
      MagneticVector.prototype.rotate = function(coord_spherical, coord_geodetic) {
        var psi = Math.PI / 180 * (coord_spherical.phig - coord_geodetic.phi);
        return new MagneticVector({
          bz: this.bx * Math.sin(psi) + this.bz * Math.cos(psi),
          bx: this.bx * Math.cos(psi) - this.bz * Math.sin(psi),
          by: this.by
        });
      };
    }
  });

  // node_modules/geomagnetism/lib/model.js
  var require_model = __commonJS({
    "node_modules/geomagnetism/lib/model.js"(exports, module) {
      var GeodeticCoord = require_geodetic();
      var MagneticElements = require_magnetic_elements();
      var MagneticVector = require_magnetic_vector();
      module.exports = Model;
      function Model(options) {
        this.epoch = options.epoch;
        this.start_date = new Date(options.start_date);
        this.end_date = new Date(options.end_date);
        this.name = options.name || "";
        this.main_field_coeff_g = options.main_field_coeff_g || [0];
        this.main_field_coeff_h = options.main_field_coeff_h || [0];
        this.secular_var_coeff_g = options.secular_var_coeff_g || [0];
        this.secular_var_coeff_h = options.secular_var_coeff_h || [0];
        this.n_max = options.n_max || 0;
        this.n_max_sec_var = options.n_max_sec_var || 0;
        this.num_terms = this.n_max * (this.n_max + 1) / 2 + this.n_max;
      }
      Model.prototype.getTimedModel = function(date, allowOutOfBoundsModel = false) {
        var year_int = date.getUTCFullYear();
        var fractional_year = (date.valueOf() - Date.UTC(year_int)) / (1e3 * 3600 * 24 * 365);
        var year = year_int + fractional_year;
        var dyear = year - this.epoch;
        if (date < this.start_date || date > this.end_date) {
          if (allowOutOfBoundsModel) {
            console.error("Model is only valid from " + this.start_date.toDateString() + " to " + this.end_date.toDateString());
          } else {
            throw new Error("Model is only valid from " + this.start_date.toDateString() + " to " + this.end_date.toDateString());
          }
        }
        var model = new Model({
          epoch: this.epoch,
          n_max: this.n_max,
          n_max_sec_var: this.n_max_sec_var,
          name: this.name,
          start_date: this.start_date,
          end_date: this.end_date
        });
        var a = model.n_max_sec_var;
        var b = a * (a + 1) / 2 + a;
        for (var n = 1; n <= this.n_max; n++) {
          for (var m = 0; m <= n; m++) {
            var i = n * (n + 1) / 2 + m;
            var hnm = this.main_field_coeff_h[i];
            var gnm = this.main_field_coeff_g[i];
            var dhnm = this.secular_var_coeff_h[i];
            var dgnm = this.secular_var_coeff_g[i];
            if (i <= b) {
              model.main_field_coeff_h[i] = hnm + dyear * dhnm;
              model.main_field_coeff_g[i] = gnm + dyear * dgnm;
              model.secular_var_coeff_h[i] = dhnm;
              model.secular_var_coeff_g[i] = dgnm;
            } else {
              model.main_field_coeff_h[i] = hnm;
              model.main_field_coeff_g[i] = gnm;
            }
          }
        }
        return model;
      };
      Model.prototype.getSummation = function(legendre, sph_variables, coord_spherical) {
        var bx = 0;
        var by = 0;
        var bz = 0;
        var n, m, i, k;
        var relative_radius_power = sph_variables.relative_radius_power;
        var cos_mlambda = sph_variables.cos_mlambda;
        var sin_mlambda = sph_variables.sin_mlambda;
        var g = this.main_field_coeff_g;
        var h = this.main_field_coeff_h;
        for (n = 1; n <= this.n_max; n++) {
          for (m = 0; m <= n; m++) {
            i = n * (n + 1) / 2 + m;
            bz -= relative_radius_power[n] * (g[i] * cos_mlambda[m] + h[i] * sin_mlambda[m]) * (n + 1) * legendre.pcup[i];
            by += relative_radius_power[n] * (g[i] * sin_mlambda[m] - h[i] * cos_mlambda[m]) * m * legendre.pcup[i];
            bx -= relative_radius_power[n] * (g[i] * cos_mlambda[m] + h[i] * sin_mlambda[m]) * legendre.dpcup[i];
          }
        }
        var cos_phi = Math.cos(Math.PI / 180 * coord_spherical.phig);
        if (Math.abs(cos_phi) > 1e-10) {
          by = by / cos_phi;
        } else {
          by = 0;
          var schmidt_quasi_norm1 = 1, schmidt_quasi_norm2, schmidt_quasi_norm3;
          var pcup_s = [1];
          var sin_phi = Math.sin(Math.PI / 180 * coord_spherical.phig);
          for (n = 1; n <= this.n_max; n++) {
            i = n * (n + 1) / 2 + 1;
            schmidt_quasi_norm2 = schmidt_quasi_norm1 * (2 * n - 1) / n;
            schmidt_quasi_norm3 = schmidt_quasi_norm2 * Math.sqrt(2 * n / (n + 1));
            schmidt_quasi_norm1 = schmidt_quasi_norm2;
            if (n == 1) {
              pcup_s[n] = pcup_s[n - 1];
            } else {
              k = ((n - 1) * (n - 1) - 1) / ((2 * n - 1) * (2 * n - 3));
              pcup_s[n] = sin_phi * pcup_s[n - 1] - k * pcup_s[n - 2];
            }
            by += relative_radius_power[n] * (g[i] * sin_mlambda[1] - h[i] * cos_mlambda[1]) * pcup_s[n] * schmidt_quasi_norm3;
          }
        }
        return new MagneticVector({
          bx,
          by,
          bz
        });
      };
      Model.prototype.point = function(coords) {
        var altitude = coords.length > 2 && typeof coords[2] === "number" ? coords[2] : 0;
        var coord_geodetic = new GeodeticCoord({
          lat: coords[0],
          lon: coords[1],
          height_above_ellipsoid: altitude
        });
        var coord_spherical = coord_geodetic.toSpherical();
        var legendre = coord_spherical.getLegendreFunction(this.n_max);
        var harmonic_variables = coord_spherical.getHarmonicVariables(coord_geodetic.ellipsoid, this.n_max);
        var magnetic_vector_sph = this.getSummation(legendre, harmonic_variables, coord_spherical);
        var magnetic_vector_geo = magnetic_vector_sph.rotate(coord_spherical, coord_geodetic);
        return MagneticElements.fromGeoMagneticVector(magnetic_vector_geo);
      };
    }
  });

  // node_modules/geomagnetism/data/wmm-2025.json
  var require_wmm_2025 = __commonJS({
    "node_modules/geomagnetism/data/wmm-2025.json"(exports, module) {
      module.exports = {
        main_field_coeff_g: [
          0,
          -29351.8,
          -1410.8,
          -2556.6,
          2951.1,
          1649.3,
          1361,
          -2404.1,
          1243.8,
          453.6,
          895,
          799.5,
          55.7,
          -281.1,
          12.1,
          -233.2,
          368.9,
          187.2,
          -138.7,
          -142,
          20.9,
          64.4,
          63.8,
          76.9,
          -115.7,
          -40.9,
          14.9,
          -60.7,
          79.5,
          -77,
          -8.8,
          59.3,
          15.8,
          2.5,
          -11.1,
          14.2,
          23.2,
          10.8,
          -17.5,
          2,
          -21.7,
          16.9,
          15,
          -16.8,
          0.9,
          4.6,
          7.8,
          3,
          -0.2,
          -2.5,
          -13.1,
          2.4,
          8.6,
          -8.7,
          -12.9,
          -1.3,
          -6.4,
          0.2,
          2,
          -1,
          -0.6,
          -0.9,
          1.5,
          0.9,
          -2.7,
          -3.9,
          2.9,
          -1.5,
          -2.5,
          2.4,
          -0.6,
          -0.1,
          -0.6,
          -0.1,
          1.1,
          -1,
          -0.2,
          2.6,
          -2,
          -0.2,
          0.3,
          1.2,
          -1.3,
          0.6,
          0.6,
          0.5,
          -0.1,
          -0.4,
          -0.2,
          -1.3,
          -0.7
        ],
        main_field_coeff_h: [
          0,
          0,
          4545.4,
          0,
          -3133.6,
          -815.1,
          0,
          -56.6,
          237.5,
          -549.5,
          0,
          278.6,
          -133.9,
          212,
          -375.6,
          0,
          45.4,
          220.2,
          -122.9,
          43,
          106.1,
          0,
          -18.4,
          16.8,
          48.8,
          -59.8,
          10.9,
          72.7,
          0,
          -48.9,
          -14.4,
          -1,
          23.4,
          -7.4,
          -25.1,
          -2.3,
          0,
          7.1,
          -12.6,
          11.4,
          -9.7,
          12.7,
          0.7,
          -5.2,
          3.9,
          0,
          -24.8,
          12.2,
          8.3,
          -3.3,
          -5.2,
          7.2,
          -0.6,
          0.8,
          10,
          0,
          3.3,
          0,
          2.4,
          5.3,
          -9.1,
          0.4,
          -4.2,
          -3.8,
          0.9,
          -9.1,
          0,
          0,
          2.9,
          -0.6,
          0.2,
          0.5,
          -0.3,
          -1.2,
          -1.7,
          -2.9,
          -1.8,
          -2.3,
          0,
          -1.3,
          0.7,
          1,
          -1.4,
          0,
          0.6,
          -0.1,
          0.8,
          0.1,
          -1,
          0.1,
          0.2
        ],
        secular_var_coeff_g: [
          0,
          12,
          9.7,
          -11.6,
          -5.2,
          -8,
          -1.3,
          -4.2,
          0.4,
          -15.6,
          -1.6,
          -2.4,
          -6,
          5.6,
          -7,
          0.6,
          1.4,
          0,
          0.6,
          2.2,
          0.9,
          -0.2,
          -0.4,
          0.9,
          1.2,
          -0.9,
          0.3,
          0.9,
          0,
          -0.1,
          -0.1,
          0.5,
          -0.1,
          -0.8,
          -0.8,
          0.8,
          -0.1,
          0.2,
          0,
          0.5,
          -0.1,
          0.3,
          0.2,
          0,
          0.2,
          0,
          -0.1,
          0.1,
          0.3,
          -0.3,
          0,
          0.3,
          -0.1,
          0.1,
          -0.1,
          0.1,
          0,
          0.1,
          0.1,
          0,
          -0.3,
          0,
          -0.1,
          -0.1,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          -0.1,
          0,
          0,
          -0.1,
          -0.1,
          -0.1,
          -0.1,
          0,
          0,
          0,
          0,
          0,
          0,
          0.1,
          0,
          0,
          0,
          -0.1,
          0,
          -0.1
        ],
        secular_var_coeff_h: [
          0,
          0,
          -21.5,
          0,
          -27.7,
          -12.1,
          0,
          4,
          -0.3,
          -4.1,
          0,
          -1.1,
          4.1,
          1.6,
          -4.4,
          0,
          -0.5,
          2.2,
          0.4,
          1.7,
          1.9,
          0,
          0.3,
          -1.6,
          -0.4,
          0.9,
          0.7,
          0.9,
          0,
          0.6,
          0.5,
          -0.8,
          0,
          -1,
          0.6,
          -0.2,
          0,
          -0.2,
          0.5,
          -0.4,
          0.4,
          -0.5,
          -0.6,
          0.3,
          0.2,
          0,
          -0.3,
          0.3,
          -0.3,
          0.3,
          0.2,
          -0.1,
          -0.2,
          0.4,
          0.1,
          0,
          0,
          0,
          -0.2,
          0.1,
          -0.1,
          0.1,
          0,
          -0.1,
          0.2,
          0,
          0,
          0,
          0.1,
          0,
          0.1,
          0,
          0,
          0.1,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          -0.1,
          0.1,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          -0.1
        ],
        n_max: 12,
        n_max_sec_var: 12,
        epoch: 2025,
        name: "WMM-2025",
        start_date: "2024-11-13T03:00:00.000Z",
        end_date: "2029-11-13T03:00:00.000Z"
      };
    }
  });

  // compass-entry.cjs
  var require_compass_entry = __commonJS({
    "compass-entry.cjs"() {
      var Model = require_model();
      var data = require_wmm_2025();
      function field(date, lat, lon, altitudeKm = 0) {
        const year = date.getUTCFullYear();
        if (!Number.isFinite(date.getTime()) || year < 2025 || year >= 2030 || ![lat, lon, altitudeKm].every(Number.isFinite) || Math.abs(lat) > 90) return null;
        const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
        const elapsed = year - 2025 + (date.getTime() - start) / (end - start);
        const model = new Model({
          ...data,
          main_field_coeff_g: data.main_field_coeff_g.map((v, i) => v + elapsed * data.secular_var_coeff_g[i]),
          main_field_coeff_h: data.main_field_coeff_h.map((v, i) => v + elapsed * data.secular_var_coeff_h[i])
        });
        return model.point([lat, lon, altitudeKm]);
      }
      function declination(date, lat, lon) {
        const result = field(date, lat, lon);
        return result && result.h >= 2e3 && Number.isFinite(result.decl) ? result.decl : null;
      }
      globalThis.Compass = { field, declination };
    }
  });
  require_compass_entry();
})();
