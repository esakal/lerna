"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _async = require("async");

var _async2 = _interopRequireDefault(_async);

var _glob = require("glob");

var _glob2 = _interopRequireDefault(_glob);

var _npmlog = require("npmlog");

var _npmlog2 = _interopRequireDefault(_npmlog);

var _minimatch = require("minimatch");

var _minimatch2 = _interopRequireDefault(_minimatch);

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var _readPkg = require("read-pkg");

var _readPkg2 = _interopRequireDefault(_readPkg);

var _PackageGraph = require("./PackageGraph");

var _PackageGraph2 = _interopRequireDefault(_PackageGraph);

var _Package = require("./Package");

var _Package2 = _interopRequireDefault(_Package);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
* A predicate that determines if a given package name satisfies a glob.
*
* @param {!String} name The package name
* @param {String|Array<String>} glob The glob (or globs) to match a package name against
* @param {Boolean} negate Negate glob pattern matches
* @return {Boolean} The packages with a name matching the glob
*/
function filterPackage(name, glob, negate) {
  // If there isn't a filter then we can just return the package.
  if (!glob) return true;

  // Include/exlude with no arguments implies splat.
  // For example: `--hoist` is equivalent to `--hoist=**`.
  // The double star here is to account for scoped packages.
  if (glob === true) glob = "**";

  if (!Array.isArray(glob)) glob = [glob];

  if (negate) {
    return glob.every(function (glob) {
      return !(0, _minimatch2.default)(name, glob);
    });
  } else {
    return glob.some(function (glob) {
      return (0, _minimatch2.default)(name, glob);
    });
  }
}

var PackageUtilities = function () {
  function PackageUtilities() {
    _classCallCheck(this, PackageUtilities);
  }

  _createClass(PackageUtilities, null, [{
    key: "isHoistedPackage",
    value: function isHoistedPackage(name, hoist, nohoist) {
      return filterPackage(name, hoist) && filterPackage(name, nohoist, true);
    }
  }, {
    key: "getPackages",
    value: function getPackages(_ref) {
      var packageConfigs = _ref.packageConfigs,
          rootPath = _ref.rootPath;

      var packages = [];
      var globOpts = {
        cwd: rootPath,
        strict: true,
        absolute: true
      };

      var hasNodeModules = packageConfigs.some(function (cfg) {
        return cfg.indexOf("node_modules") > -1;
      });
      var hasGlobStar = packageConfigs.some(function (cfg) {
        return cfg.indexOf("**") > -1;
      });

      if (hasGlobStar) {
        if (hasNodeModules) {
          var message = "An explicit node_modules package path does not allow globstars (**)";
          _npmlog2.default.error("EPKGCONFIG", message);
          throw new Error(message);
        }

        globOpts.ignore = [
        // allow globs like "packages/**",
        // but avoid picking up node_modules/**/package.json
        "**/node_modules/**"];
      }

      packageConfigs.forEach(function (globPath) {
        _glob2.default.sync(_path2.default.join(globPath, "package.json"), globOpts).forEach(function (globResult) {
          // https://github.com/isaacs/node-glob/blob/master/common.js#L104
          // glob always returns "\\" as "/" in windows, so everyone
          // gets normalized because we can't have nice things.
          var packageConfigPath = _path2.default.normalize(globResult);
          var packageDir = _path2.default.dirname(packageConfigPath);
          var packageJson = _readPkg2.default.sync(packageConfigPath, { normalize: false });
          packages.push(new _Package2.default(packageJson, packageDir));
        });
      });

      return packages;
    }
  }, {
    key: "getPackageGraph",
    value: function getPackageGraph(packages, depsOnly) {
      return new _PackageGraph2.default(packages, depsOnly);
    }

    /**
    * Takes a list of Packages and returns a list of those same Packages with any Packages
    * they depend on. i.e if packageA depended on packageB
    * `PackageUtilities.addDependencies([packageA], this.packageGraph)`
    * would return [packageA, packageB]
    * @param {!Array.<Package>} packages The packages to include dependencies for.
    * @param {!<PackageGraph>} packageGraph The package graph for the whole repository.
    * @return {Array.<Package>} The packages with any dependencies that were't already included.
    */

  }, {
    key: "addDependencies",
    value: function addDependencies(packages, packageGraph) {
      var dependentPackages = [];

      // the current list of packages we are expanding using breadth-first-search
      var fringe = packages.slice();
      var packageExistsInRepository = function packageExistsInRepository(packageName) {
        return !!packageGraph.get(packageName);
      };
      var packageAlreadyFound = function packageAlreadyFound(packageName) {
        return dependentPackages.some(function (pkg) {
          return pkg.name === packageName;
        });
      };
      var packageInFringe = function packageInFringe(packageName) {
        return fringe.some(function (pkg) {
          return pkg.name === packageName;
        });
      };

      while (fringe.length !== 0) {
        var pkg = fringe.shift();
        var pkgDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);

        Object.keys(pkgDeps).forEach(function (dep) {
          if (packageExistsInRepository(dep) && !packageAlreadyFound(dep) && !packageInFringe(dep)) {
            fringe.push(packageGraph.get(dep).package);
          }
        });

        dependentPackages.push(pkg);
      }

      return dependentPackages;
    }

    /**
    * Filters a given set of packages and returns all packages that match the scope glob
    * and do not match the ignore glob
    *
    * @param {!Array.<Package>} packagesToFilter The packages to filter
    * @param {Object} filters The scope and ignore filters.
    * @param {String} filters.scope glob The glob to match the package name against
    * @param {String} filters.ignore glob The glob to filter the package name against
    * @return {Array.<Package>} The packages with a name matching the glob
    * @throws when a given glob would produce an empty list of packages
    */

  }, {
    key: "filterPackages",
    value: function filterPackages(packagesToFilter, _ref2) {
      var scope = _ref2.scope,
          ignore = _ref2.ignore;

      var packages = packagesToFilter.slice();

      if (scope) {
        packages = packages.filter(function (pkg) {
          return filterPackage(pkg.name, scope);
        });

        if (!packages.length) {
          throw new Error(`No packages found that match scope '${scope}'`);
        }
      }

      if (ignore) {
        packages = packages.filter(function (pkg) {
          return filterPackage(pkg.name, ignore, true);
        });

        if (!packages.length) {
          throw new Error(`No packages remain after ignoring '${ignore}'`);
        }
      }

      return packages;
    }
  }, {
    key: "filterPackagesThatAreNotUpdated",
    value: function filterPackagesThatAreNotUpdated(packagesToFilter, packageUpdates) {
      return packageUpdates.map(function (update) {
        return update.package;
      }).filter(function (pkg) {
        return packagesToFilter.some(function (p) {
          return p.name === pkg.name;
        });
      });
    }
  }, {
    key: "topologicallyBatchPackages",
    value: function topologicallyBatchPackages(packagesToBatch) {
      var _ref3 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          depsOnly = _ref3.depsOnly;

      // We're going to be chopping stuff out of this array, so copy it.
      var packages = packagesToBatch.slice();
      var packageGraph = PackageUtilities.getPackageGraph(packages, depsOnly);

      // This maps package names to the number of packages that depend on them.
      // As packages are completed their names will be removed from this object.
      var refCounts = {};
      packages.forEach(function (pkg) {
        return packageGraph.get(pkg.name).dependencies.forEach(function (dep) {
          if (!refCounts[dep]) refCounts[dep] = 0;
          refCounts[dep]++;
        });
      });

      var batches = [];
      while (packages.length) {
        // Get all packages that have no remaining dependencies within the repo
        // that haven't yet been picked.
        var batch = packages.filter(function (pkg) {
          var node = packageGraph.get(pkg.name);
          return node.dependencies.filter(function (dep) {
            return refCounts[dep];
          }).length == 0;
        });

        // If we weren't able to find a package with no remaining dependencies,
        // then we've encountered a cycle in the dependency graph.  Run a
        // single-package batch with the package that has the most dependents.
        if (packages.length && !batch.length) {
          _npmlog2.default.warn("ECYCLE", "Encountered a cycle in the dependency graph. This may cause instability!");

          batch.push(packages.reduce(function (a, b) {
            return (refCounts[a.name] || 0) > (refCounts[b.name] || 0) ? a : b;
          }));
        }

        batches.push(batch);

        batch.forEach(function (pkg) {
          delete refCounts[pkg.name];
          packages.splice(packages.indexOf(pkg), 1);
        });
      }

      return batches;
    }
  }, {
    key: "runParallelBatches",
    value: function runParallelBatches(batches, makeTask, concurrency, callback) {
      _async2.default.series(batches.map(function (batch) {
        return function (cb) {
          _async2.default.parallelLimit(batch.map(makeTask), concurrency, cb);
        };
      }), callback);
    }
  }]);

  return PackageUtilities;
}();

exports.default = PackageUtilities;
module.exports = exports["default"];