"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.builder = exports.describe = exports.command = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.handler = handler;

var _os = require("os");

var _async = require("async");

var _async2 = _interopRequireDefault(_async);

var _chalk = require("chalk");

var _chalk2 = _interopRequireDefault(_chalk);

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var _semver = require("semver");

var _semver2 = _interopRequireDefault(_semver);

var _writeJsonFile = require("write-json-file");

var _writeJsonFile2 = _interopRequireDefault(_writeJsonFile);

var _writePkg = require("write-pkg");

var _writePkg2 = _interopRequireDefault(_writePkg);

var _Command2 = require("../Command");

var _Command3 = _interopRequireDefault(_Command2);

var _ConventionalCommitUtilities = require("../ConventionalCommitUtilities");

var _ConventionalCommitUtilities2 = _interopRequireDefault(_ConventionalCommitUtilities);

var _FileSystemUtilities = require("../FileSystemUtilities");

var _FileSystemUtilities2 = _interopRequireDefault(_FileSystemUtilities);

var _GitUtilities = require("../GitUtilities");

var _GitUtilities2 = _interopRequireDefault(_GitUtilities);

var _NpmUtilities = require("../NpmUtilities");

var _NpmUtilities2 = _interopRequireDefault(_NpmUtilities);

var _output = require("../utils/output");

var _output2 = _interopRequireDefault(_output);

var _PackageUtilities = require("../PackageUtilities");

var _PackageUtilities2 = _interopRequireDefault(_PackageUtilities);

var _PromptUtilities = require("../PromptUtilities");

var _PromptUtilities2 = _interopRequireDefault(_PromptUtilities);

var _UpdatedPackagesCollector = require("../UpdatedPackagesCollector");

var _UpdatedPackagesCollector2 = _interopRequireDefault(_UpdatedPackagesCollector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function handler(argv) {
  return new PublishCommand(argv._, argv).run();
}

var command = exports.command = "publish";

var describe = exports.describe = "Publish packages in the current project.";

var builder = exports.builder = {
  "canary": {
    group: "Command Options:",
    describe: "Publish packages after every successful merge using the sha as part of the tag.",
    alias: "c"
  },
  "cd-version": {
    group: "Command Options:",
    describe: "Skip the version selection prompt and increment semver 'major', 'minor', or 'patch'.",
    type: "string",
    requiresArg: true,
    coerce: function coerce(choice) {
      if (!["major", "minor", "patch"].some(function (inc) {
        return choice === inc;
      })) {
        throw new Error(`--cd-version must be one of 'major', 'minor', or 'patch', got '${choice}'`);
      }
      return choice;
    }
  },
  "conventional-commits": {
    group: "Command Options:",
    describe: "Use angular conventional-commit format to determine version bump and generate CHANGELOG."
  },
  "exact": {
    group: "Command Options:",
    describe: "Specify cross-dependency version numbers exactly rather than with a caret (^)."
  },
  "git-remote": {
    group: "Command Options:",
    defaultDescription: "origin",
    describe: "Push git changes to the specified remote instead of 'origin'.",
    type: "string",
    requiresArg: true
  },
  "yes": {
    group: "Command Options:",
    describe: "Skip all confirmation prompts."
  },
  "message": {
    group: "Command Options:",
    describe: "Use a custom commit message when creating the publish commit.",
    alias: "m",
    type: "string",
    requiresArg: true
  },
  "npm-tag": {
    group: "Command Options:",
    describe: "Publish packages with the specified npm dist-tag",
    type: "string",
    requiresArg: true
  },
  "repo-version": {
    group: "Command Options:",
    describe: "Specify repo version to publish.",
    type: "string",
    requiresArg: true
  },
  "skip-git": {
    group: "Command Options:",
    describe: "Skip commiting, tagging, and pushing git changes."
  },
  "skip-npm": {
    group: "Command Options:",
    describe: "Stop before actually publishing change to npm."
  },
  "temp-tag": {
    group: "Command Options:",
    describe: "Create a temporary tag while publishing."
  }
};

var PublishCommand = function (_Command) {
  _inherits(PublishCommand, _Command);

  function PublishCommand() {
    _classCallCheck(this, PublishCommand);

    return _possibleConstructorReturn(this, (PublishCommand.__proto__ || Object.getPrototypeOf(PublishCommand)).apply(this, arguments));
  }

  _createClass(PublishCommand, [{
    key: "initialize",
    value: function initialize(callback) {
      var _this2 = this;

      this.gitRemote = this.options.gitRemote || "origin";
      this.gitEnabled = !(this.options.canary || this.options.skipGit);

      if (this.options.canary) {
        this.logger.info("canary", "enabled");
      }

      if (!this.repository.isIndependent()) {
        this.globalVersion = this.repository.version;
        this.logger.info("current version", this.globalVersion);
      }

      this.updates = new _UpdatedPackagesCollector2.default(this).getUpdates();

      this.packagesToPublish = this.updates.map(function (update) {
        return update.package;
      }).filter(function (pkg) {
        return !pkg.isPrivate();
      });

      this.packagesToPublish.forEach(function (pkg) {
        var publishDirectoryPackage = pkg.getPublishDirectoryPackage();
        if (pkg.name !== publishDirectoryPackage.name || pkg.version !== publishDirectoryPackage.version) {
          var message = "Package " + pkg.name + " version is " + pkg.name + "@" + pkg.version + " " + "doesn't match version of the custom publish 'package.json' file " + pkg.publishDirectoryPackage.name + " version is " + pkg.publishDirectoryPackage.name + "@" + pkg.version;
          _this2.logger.error(message);
          throw new Error(message);
        }
      });

      this.packagesToPublishCount = this.packagesToPublish.length;
      this.batchedPackagesToPublish = this.toposort ? _PackageUtilities2.default.topologicallyBatchPackages(this.packagesToPublish, {
        // Don't sort based on devDependencies because that would increase the chance of dependency cycles
        // causing less-than-ideal a publishing order.
        depsOnly: true
      }) : [this.packagesToPublish];

      if (!this.updates.length) {
        this.logger.info("No updated packages to publish.");
        callback(null, true);
        return;
      }

      this.getVersionsForUpdates(function (err, results) {
        if (err) {
          callback(err);
          return;
        }

        var version = results.version;
        var versions = results.versions;

        if (!versions) {
          versions = {};
          _this2.updates.forEach(function (update) {
            versions[update.package.name] = version;
          });
        }

        _this2.masterVersion = version;
        _this2.updatesVersions = versions;

        _this2.confirmVersions(callback);
      });
    }
  }, {
    key: "execute",
    value: function execute(callback) {
      try {
        if (this.gitEnabled && _GitUtilities2.default.isDetachedHead(this.execOpts)) {
          throw new Error("Detached git HEAD, please checkout a branch to publish changes.");
        }

        if (!this.repository.isIndependent() && !this.options.canary) {
          this.updateVersionInLernaJson();
        }

        this.updateUpdatedPackages();

        if (this.gitEnabled) {
          this.commitAndTagUpdates();
        }
      } catch (err) {
        callback(err);
        return;
      }

      if (this.options.skipNpm) {
        callback(null, true);
      } else {
        this.publishPackagesToNpm(callback);
      }
    }
  }, {
    key: "publishPackagesToNpm",
    value: function publishPackagesToNpm(callback) {
      var _this3 = this;

      this.logger.info("publish", "Publishing packages to npm...");

      this.npmPublishAsPrerelease(function (err) {
        if (err) {
          callback(err);
          return;
        }

        if (_this3.options.canary) {
          _this3.logger.info("canary", "Resetting git state");
          // reset since the package.json files are changed
          _GitUtilities2.default.checkoutChanges("packages/*/package.json", _this3.execOpts);
        }

        _this3.npmUpdateAsLatest(function (err) {
          if (err) {
            callback(err);
            return;
          }

          if (_this3.gitEnabled) {
            _this3.logger.info("git", "Pushing tags...");
            _GitUtilities2.default.pushWithTags(_this3.gitRemote, _this3.tags, _this3.execOpts);
          }

          var message = _this3.packagesToPublish.map(function (pkg) {
            return ` - ${pkg.name}@${pkg.version}`;
          });

          (0, _output2.default)("Successfully published:");
          (0, _output2.default)(message.join(_os.EOL));

          _this3.logger.success("publish", "finished");
          callback(null, true);
        });
      });
    }
  }, {
    key: "getVersionsForUpdates",
    value: function getVersionsForUpdates(callback) {
      var _this4 = this;

      if (this.options.cdVersion) {
        // If the version is independent then send versions
        if (this.repository.isIndependent()) {
          var versions = {};

          this.updates.forEach(function (update) {
            versions[update.package.name] = _semver2.default.inc(update.package.version, _this4.options.cdVersion);
          });

          return callback(null, { versions });
        }

        // Otherwise bump the global version
        var version = _semver2.default.inc(this.globalVersion, this.options.cdVersion);
        return callback(null, { version });
      }

      if (this.options.repoVersion) {
        return callback(null, {
          version: this.options.repoVersion
        });
      }

      // Non-Independent Canary Mode
      if (!this.repository.isIndependent() && this.options.canary) {
        var _version = this.globalVersion + this.getCanaryVersionSuffix();
        callback(null, { version: _version });

        // Non-Independent Non-Canary Mode
      } else if (!this.repository.isIndependent()) {
        this.promptVersion(null, this.globalVersion, function (err, version) {
          if (err) {
            callback(err);
          } else {
            callback(null, { version });
          }
        });

        // Independent Canary Mode
      } else if (this.options.canary) {
        var _versions = {};
        var canaryVersionSuffix = this.getCanaryVersionSuffix();

        this.updates.forEach(function (update) {
          _versions[update.package.name] = update.package.version + canaryVersionSuffix;
        });

        callback(null, { versions: _versions });

        // Independent Conventional-Commits Mode
      } else if (this.options.conventionalCommits) {
        var _versions2 = {};
        this.updates.map(function (update) {
          _versions2[update.package.name] = _ConventionalCommitUtilities2.default.recommendVersion({
            name: update.package.name,
            version: update.package.version,
            location: update.package.location
          }, _this4.execOpts);
        });
        callback(null, { versions: _versions2 });

        // Independent Non-Canary Mode
      } else {
        _async2.default.mapLimit(this.updates, 1, function (update, cb) {
          _this4.promptVersion(update.package.name, update.package.version, cb);
        }, function (err, versions) {
          if (err) {
            return callback(err);
          }

          _this4.updates.forEach(function (update, index) {
            versions[update.package.name] = versions[index];
          });

          callback(null, { versions });
        });
      }
    }
  }, {
    key: "getCanaryVersionSuffix",
    value: function getCanaryVersionSuffix() {
      return "-alpha." + _GitUtilities2.default.getCurrentSHA(this.execOpts).slice(0, 8);
    }
  }, {
    key: "promptVersion",
    value: function promptVersion(packageName, currentVersion, callback) {
      var patch = _semver2.default.inc(currentVersion, "patch");
      var minor = _semver2.default.inc(currentVersion, "minor");
      var major = _semver2.default.inc(currentVersion, "major");
      var prepatch = _semver2.default.inc(currentVersion, "prepatch");
      var preminor = _semver2.default.inc(currentVersion, "preminor");
      var premajor = _semver2.default.inc(currentVersion, "premajor");

      var message = "Select a new version";
      if (packageName) message += ` for ${packageName}`;
      message += ` (currently ${currentVersion})`;

      _PromptUtilities2.default.select(message, {
        choices: [{ value: patch, name: `Patch (${patch})` }, { value: minor, name: `Minor (${minor})` }, { value: major, name: `Major (${major})` }, { value: prepatch, name: `Prepatch (${prepatch})` }, { value: preminor, name: `Preminor (${preminor})` }, { value: premajor, name: `Premajor (${premajor})` }, { value: "PRERELEASE", name: "Prerelease" }, { value: "CUSTOM", name: "Custom" }]
      }, function (choice) {
        switch (choice) {

          case "CUSTOM":
            {
              _PromptUtilities2.default.input("Enter a custom version", {
                filter: _semver2.default.valid,
                validate: function validate(v) {
                  return v !== null || "Must be a valid semver version";
                }
              }, function (input) {
                callback(null, input);
              });
              break;
            }

          case "PRERELEASE":
            {
              var components = _semver2.default.prerelease(currentVersion);
              var existingId = null;
              if (components && components.length === 2) {
                existingId = components[0];
              }
              var defaultVersion = _semver2.default.inc(currentVersion, "prerelease", existingId);
              var prompt = `(default: ${existingId ? `"${existingId}"` : "none"}, yielding ${defaultVersion})`;

              _PromptUtilities2.default.input(`Enter a prerelease identifier ${prompt}`, {
                filter: function filter(v) {
                  var prereleaseId = v ? v : existingId;
                  return _semver2.default.inc(currentVersion, "prerelease", prereleaseId);
                }
              }, function (input) {
                callback(null, input);
              });
              break;
            }

          default:
            {
              callback(null, choice);
              break;
            }

        }
      });
    }
  }, {
    key: "confirmVersions",
    value: function confirmVersions(callback) {
      var _this5 = this;

      var changes = this.updates.map(function (update) {
        var pkg = update.package;
        var line = ` - ${pkg.name}: ${pkg.version} => ${_this5.updatesVersions[pkg.name]}`;
        if (pkg.isPrivate()) {
          line += ` (${_chalk2.default.red("private")})`;
        }
        return line;
      });

      (0, _output2.default)("");
      (0, _output2.default)("Changes:");
      (0, _output2.default)(changes.join(_os.EOL));
      (0, _output2.default)("");

      if (this.options.yes) {
        this.logger.info("auto-confirmed");
        callback(null, true);
      } else {
        _PromptUtilities2.default.confirm("Are you sure you want to publish the above changes?", function (confirm) {
          callback(null, confirm);
        });
      }
    }
  }, {
    key: "updateVersionInLernaJson",
    value: function updateVersionInLernaJson() {
      this.repository.lernaJson.version = this.masterVersion;
      _writeJsonFile2.default.sync(this.repository.lernaJsonLocation, this.repository.lernaJson, { indent: 2 });

      if (!this.options.skipGit) {
        _GitUtilities2.default.addFile(this.repository.lernaJsonLocation, this.execOpts);
      }
    }
  }, {
    key: "updatePackageJson",
    value: function updatePackageJson(pkg) {
      var exact = this.options.exact;

      var packageLocation = pkg.location;
      var packageJsonLocation = _path2.default.join(packageLocation, "package.json");

      // set new version
      pkg.version = this.updatesVersions[pkg.name] || pkg.version;

      // update pkg dependencies
      this.updatePackageDepsObject(pkg, "dependencies", exact);
      this.updatePackageDepsObject(pkg, "devDependencies", exact);
      this.updatePackageDepsObject(pkg, "peerDependencies", exact);

      // write new package
      _writePkg2.default.sync(packageJsonLocation, pkg.toJSON());
      // NOTE: Object.prototype.toJSON() is normally called when passed to
      // JSON.stringify(), but write-pkg iterates Object.keys() before serializing
      // so it has to be explicit here (otherwise it mangles the instance properties)
    }
  }, {
    key: "updateUpdatedPackages",
    value: function updateUpdatedPackages() {
      var _this6 = this;

      var changedFiles = [];

      this.updates.forEach(function (update) {
        var pkg = update.package;
        var packageLocation = pkg.location;
        var packageJsonLocation = _path2.default.join(packageLocation, "package.json");

        _this6.updatePackageJson(pkg);
        var publishDirectoryPkg = pkg.getPublishDirectoryPackage();
        if (publishDirectoryPkg) {
          // update publish package json as well
          _this6.updatePackageJson(publishDirectoryPkg);
        }

        // we can now generate the Changelog, based on the
        // the updated version that we're about to release.
        if (_this6.options.conventionalCommits) {
          _ConventionalCommitUtilities2.default.updateChangelog({
            name: pkg.name,
            location: pkg.location
          }, _this6.execOpts);
          changedFiles.push(_ConventionalCommitUtilities2.default.changelogLocation(pkg));
        }

        // push to be git committed
        changedFiles.push(packageJsonLocation);
      });

      if (this.gitEnabled) {
        changedFiles.forEach(function (file) {
          return _GitUtilities2.default.addFile(file, _this6.execOpts);
        });
      }
    }
  }, {
    key: "updatePackageDepsObject",
    value: function updatePackageDepsObject(pkg, depsKey, exact) {
      var _this7 = this;

      var deps = pkg[depsKey];

      if (!deps) {
        return;
      }

      this.packageGraph.get(pkg.name).dependencies.forEach(function (depName) {
        var version = _this7.updatesVersions[depName];

        if (deps[depName] && version) {
          deps[depName] = exact ? version : "^" + version;
        }
      });
    }
  }, {
    key: "commitAndTagUpdates",
    value: function commitAndTagUpdates() {
      if (this.repository.isIndependent()) {
        this.tags = this.gitCommitAndTagVersionForUpdates();
      } else {
        this.tags = [this.gitCommitAndTagVersion(this.masterVersion)];
      }
    }
  }, {
    key: "gitCommitAndTagVersionForUpdates",
    value: function gitCommitAndTagVersionForUpdates() {
      var _this8 = this;

      var tags = this.updates.map(function (_ref) {
        var name = _ref.package.name;
        return `${name}@${_this8.updatesVersions[name]}`;
      });
      var subject = this.options.message || "Publish";
      var message = tags.reduce(function (msg, tag) {
        return msg + `${_os.EOL} - ${tag}`;
      }, `${subject}${_os.EOL}`);

      _GitUtilities2.default.commit(message, this.execOpts);
      tags.forEach(function (tag) {
        return _GitUtilities2.default.addTag(tag, _this8.execOpts);
      });

      return tags;
    }
  }, {
    key: "gitCommitAndTagVersion",
    value: function gitCommitAndTagVersion(version) {
      var tag = "v" + version;
      var message = this.options.message && this.options.message.replace(/%s/g, tag) || tag;

      _GitUtilities2.default.commit(message, this.execOpts);
      _GitUtilities2.default.addTag(tag, this.execOpts);

      return tag;
    }
  }, {
    key: "execScript",
    value: function execScript(pkg, script) {
      var scriptLocation = _path2.default.join(pkg.location, "scripts", script + ".js");

      if (_FileSystemUtilities2.default.existsSync(scriptLocation)) {
        require(scriptLocation);
      } else {
        this.logger.verbose("execScript", `No ${script} script found at ${scriptLocation}`);
      }
    }
  }, {
    key: "npmPublishAsPrerelease",
    value: function npmPublishAsPrerelease(callback) {
      var _this9 = this;

      var tracker = this.logger.newItem("npmPublishAsPrerelease");

      // if we skip temp tags we should tag with the proper value immediately
      // therefore no updates will be needed
      var tag = this.options.tempTag ? "lerna-temp" : this.getDistTag();

      this.updates.forEach(function (update) {
        _this9.execScript(update.package, "prepublish");
      });

      tracker.addWork(this.packagesToPublishCount);

      _PackageUtilities2.default.runParallelBatches(this.batchedPackagesToPublish, function (pkg) {
        var attempts = 0;

        var run = function run(cb) {
          tracker.verbose("publishing", pkg.name);
          var publishLocation = pkg.location;

          if (pkg.publishDirectoryLocation) {
            publishLocation = pkg.publishDirectoryLocation;
            tracker.verbose("publishing from custom directory", publishLocation);
          }

          _NpmUtilities2.default.publishTaggedInDir(tag, publishLocation, _this9.npmRegistry, function (err) {
            err = err && err.stack || err;

            if (!err ||
            // publishing over an existing package which is likely due to a timeout or something
            err.indexOf("You cannot publish over the previously published version") > -1) {
              tracker.info("published", pkg.name);
              tracker.completeWork(1);
              _this9.execScript(pkg, "postpublish");
              cb();
              return;
            }

            attempts++;

            if (attempts < 5) {
              _this9.logger.error("publish", "Retrying failed publish:", pkg.name);
              _this9.logger.verbose("publish error", err);
              run(cb);
            } else {
              _this9.logger.error("publish", "Ran out of retries while publishing", pkg.name, err);
              cb(err);
            }
          });
        };

        return run;
      }, this.concurrency, function (err) {
        tracker.finish();
        callback(err);
      });
    }
  }, {
    key: "npmUpdateAsLatest",
    value: function npmUpdateAsLatest(callback) {
      var _this10 = this;

      if (!this.options.tempTag) {
        return callback();
      }

      var tracker = this.logger.newItem("npmUpdateAsLatest");
      tracker.addWork(this.packagesToPublishCount);

      _PackageUtilities2.default.runParallelBatches(this.batchedPackagesToPublish, function (pkg) {
        return function (cb) {
          var attempts = 0;

          while (true) {
            attempts++;

            try {
              _this10.updateTag(pkg);
              tracker.info("latest", pkg.name);
              tracker.completeWork(1);
              cb();
              break;
            } catch (err) {
              if (attempts < 5) {
                _this10.logger.error("publish", "Error updating version as latest", err);
                continue;
              } else {
                cb(err);
                return;
              }
            }
          }
        };
      }, 4, function (err) {
        tracker.finish();
        callback(err);
      });
    }
  }, {
    key: "updateTag",
    value: function updateTag(pkg) {
      var distTag = this.getDistTag();

      if (_NpmUtilities2.default.checkDistTag(pkg.location, pkg.name, "lerna-temp", this.npmRegistry)) {
        _NpmUtilities2.default.removeDistTag(pkg.location, pkg.name, "lerna-temp", this.npmRegistry);
      }

      /* eslint-disable max-len */
      // TODO: fix this API to be less verbose with parameters
      if (this.options.npmTag) {
        _NpmUtilities2.default.addDistTag(pkg.location, pkg.name, this.updatesVersions[pkg.name], distTag, this.npmRegistry);
      } else if (this.options.canary) {
        _NpmUtilities2.default.addDistTag(pkg.location, pkg.name, pkg.version, distTag, this.npmRegistry);
      } else {
        _NpmUtilities2.default.addDistTag(pkg.location, pkg.name, this.updatesVersions[pkg.name], distTag, this.npmRegistry);
      }
      /* eslint-enable max-len */
    }
  }, {
    key: "getDistTag",
    value: function getDistTag() {
      return this.options.npmTag || this.options.canary && "canary" || "latest";
    }
  }]);

  return PublishCommand;
}(_Command3.default);

exports.default = PublishCommand;