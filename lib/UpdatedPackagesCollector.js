"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require("lodash");

var _lodash2 = _interopRequireDefault(_lodash);

var _minimatch = require("minimatch");

var _minimatch2 = _interopRequireDefault(_minimatch);

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var _GitUtilities = require("./GitUtilities");

var _GitUtilities2 = _interopRequireDefault(_GitUtilities);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Update = function Update(pkg) {
  _classCallCheck(this, Update);

  this.package = pkg;
};

function getForcedPackages(_ref) {
  var forcePublish = _ref.forcePublish;

  // new Set(null) is equivalent to new Set([])
  // i.e., an empty Set
  var inputs = null;

  if (forcePublish === true) {
    // --force-publish
    inputs = ["*"];
  } else if (typeof forcePublish === "string") {
    // --force-publish=*
    // --force-publish=foo
    // --force-publish=foo,bar
    inputs = forcePublish.split(",");
  } else if (Array.isArray(forcePublish)) {
    // --force-publish foo --force-publish baz
    inputs = [].concat(_toConsumableArray(forcePublish));
  }

  return new Set(inputs);
}

var UpdatedPackagesCollector = function () {
  function UpdatedPackagesCollector(command) {
    _classCallCheck(this, UpdatedPackagesCollector);

    this.execOpts = command.execOpts;
    this.logger = command.logger;
    this.repository = command.repository;
    this.packages = command.filteredPackages;
    this.packageGraph = command.repository.packageGraph;
    this.options = command.options;
  }

  _createClass(UpdatedPackagesCollector, [{
    key: "getUpdates",
    value: function getUpdates() {
      this.logger.silly("getUpdates");

      this.updatedPackages = this.collectUpdatedPackages();
      this.dependents = this.collectDependents();
      return this.collectUpdates();
    }
  }, {
    key: "collectUpdatedPackages",
    value: function collectUpdatedPackages() {
      var _this = this;

      this.logger.info("", "Checking for updated packages...");

      var hasTags = _GitUtilities2.default.hasTags(this.execOpts);

      if (hasTags) {
        var tag = _GitUtilities2.default.getLastTag(this.execOpts);
        this.logger.info("", "Comparing with tag " + tag);
      } else {
        this.logger.warn("", "No tags found!");
        this.logger.info("", "Comparing with initial commit.");
      }

      var commits = void 0;

      if (this.options.canary) {
        var currentSHA = void 0;

        if (this.options.canary !== true) {
          currentSHA = this.options.canary;
        } else {
          currentSHA = _GitUtilities2.default.getCurrentSHA(this.execOpts);
        }

        commits = this.getAssociatedCommits(currentSHA);
      } else if (hasTags) {
        commits = _GitUtilities2.default.describeTag(_GitUtilities2.default.getLastTaggedCommitInBranch(this.execOpts), this.execOpts);
      }

      var updatedPackages = {};

      var registerUpdated = function registerUpdated(pkg) {
        _this.logger.verbose("updated", pkg.name);
        updatedPackages[pkg.name] = pkg;
      };

      var forced = getForcedPackages(this.options);

      if (!hasTags || forced.has("*")) {
        this.packages.forEach(registerUpdated);
      } else {
        this.packages.filter(function (pkg) {
          if (forced.has(pkg.name)) {
            return true;
          } else {
            return _this.hasDiffSinceThatIsntIgnored(pkg, commits);
          }
        }).forEach(registerUpdated);
      }

      return updatedPackages;
    }
  }, {
    key: "isPackageDependentOf",
    value: function isPackageDependentOf(packageName, dependency) {
      var _this2 = this;

      this.logger.silly("isPackageDependentOf", packageName, dependency);

      if (!this.cache[packageName]) {
        this.cache[packageName] = {};
      }

      if (this.cache[packageName][dependency] === "dependent") {
        return true;
      } else if (this.cache[packageName][dependency] === "visited") {
        return false;
      }

      var dependencies = this.packageGraph.get(packageName).dependencies;

      if (dependencies.indexOf(dependency) > -1) {
        this.cache[packageName][dependency] = "dependent";
        return true;
      }

      this.cache[packageName][dependency] = "visited";

      var hasSubDependents = false;

      dependencies.forEach(function (dep) {
        if (_this2.isPackageDependentOf(dep, dependency)) {
          _this2.cache[packageName][dependency] = "dependent";
          hasSubDependents = true;
        }
      });

      return hasSubDependents;
    }
  }, {
    key: "collectDependents",
    value: function collectDependents() {
      var _this3 = this;

      this.logger.silly("collectDependents");

      var dependents = {};
      this.cache = {};

      this.packages.forEach(function (pkg) {
        Object.keys(_this3.updatedPackages).forEach(function (dependency) {
          if (_this3.isPackageDependentOf(pkg.name, dependency)) {
            _this3.logger.verbose("dependent", "%s depends on %s", pkg.name, dependency);
            dependents[pkg.name] = pkg;
          }
        });
      });

      return dependents;
    }
  }, {
    key: "collectUpdates",
    value: function collectUpdates() {
      var _this4 = this;

      this.logger.silly("collectUpdates");

      return this.packages.filter(function (pkg) {
        return _this4.updatedPackages[pkg.name] || (_this4.options[SECRET_FLAG] ? false : _this4.dependents[pkg.name]) || _this4.options.canary;
      }).map(function (pkg) {
        _this4.logger.verbose("has filtered update", pkg.name);
        return new Update(pkg);
      });
    }
  }, {
    key: "getAssociatedCommits",
    value: function getAssociatedCommits(sha) {
      // if it's a merge commit, it will return all the commits that were part of the merge
      // ex: If `ab7533e` had 2 commits, ab7533e^..ab7533e would contain 2 commits + the merge commit
      return sha.slice(0, 8) + "^.." + sha.slice(0, 8);
    }
  }, {
    key: "hasDiffSinceThatIsntIgnored",
    value: function hasDiffSinceThatIsntIgnored(pkg, commits) {
      var _this5 = this;

      var folder = _path2.default.relative(this.repository.rootPath, pkg.location);
      var diff = _GitUtilities2.default.diffSinceIn(commits, pkg.location, this.execOpts);

      if (diff === "") {
        return false;
      }

      var changedFiles = diff.split("\n").map(function (file) {
        return file.replace(folder + _path2.default.sep, "");
      });

      if (this.options.ignore) {
        changedFiles = changedFiles.filter(function (file) {
          return !_lodash2.default.find(_this5.options.ignore, function (pattern) {
            return (0, _minimatch2.default)(file, pattern, { matchBase: true });
          });
        });
      }

      return !!changedFiles.length;
    }
  }]);

  return UpdatedPackagesCollector;
}();

// TODO: remove this when we _really_ remove support for SECRET_FLAG


exports.default = UpdatedPackagesCollector;
var Buffer = require("safe-buffer").Buffer;
// eslint-disable-next-line max-len
var SECRET_FLAG = Buffer.from("ZGFuZ2Vyb3VzbHlPbmx5UHVibGlzaEV4cGxpY2l0VXBkYXRlc1RoaXNJc0FDdXN0b21GbGFnRm9yQmFiZWxBbmRZb3VTaG91bGROb3RCZVVzaW5nSXRKdXN0RGVhbFdpdGhNb3JlUGFja2FnZXNCZWluZ1B1Ymxpc2hlZEl0SXNOb3RBQmlnRGVhbA==", "base64").toString("ascii");
module.exports = exports["default"];