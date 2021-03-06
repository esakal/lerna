"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.builder = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.commandNameFromClassName = commandNameFromClassName;

var _lodash = require("lodash");

var _lodash2 = _interopRequireDefault(_lodash);

var _dedent = require("dedent");

var _dedent2 = _interopRequireDefault(_dedent);

var _npmlog = require("npmlog");

var _npmlog2 = _interopRequireDefault(_npmlog);

var _ChildProcessUtilities = require("./ChildProcessUtilities");

var _ChildProcessUtilities2 = _interopRequireDefault(_ChildProcessUtilities);

var _FileSystemUtilities = require("./FileSystemUtilities");

var _FileSystemUtilities2 = _interopRequireDefault(_FileSystemUtilities);

var _GitUtilities = require("./GitUtilities");

var _GitUtilities2 = _interopRequireDefault(_GitUtilities);

var _PackageUtilities = require("./PackageUtilities");

var _PackageUtilities2 = _interopRequireDefault(_PackageUtilities);

var _Repository = require("./Repository");

var _Repository2 = _interopRequireDefault(_Repository);

var _filterFlags = require("./utils/filterFlags");

var _filterFlags2 = _interopRequireDefault(_filterFlags);

var _writeLogFile = require("./utils/writeLogFile");

var _writeLogFile2 = _interopRequireDefault(_writeLogFile);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// handle log.success()
_npmlog2.default.addLevel("success", 3001, { fg: "green", bold: true });

var DEFAULT_CONCURRENCY = 4;

var builder = exports.builder = {
  "loglevel": {
    defaultDescription: "info",
    describe: "What level of logs to report.",
    type: "string"
  },
  "concurrency": {
    describe: "How many threads to use if lerna parallelises the tasks.",
    type: "number",
    requiresArg: true,
    default: DEFAULT_CONCURRENCY
  },
  "scope": {
    describe: _dedent2.default`
      Restricts the scope to package names matching the given glob.
      (Only for 'run', 'exec', 'clean', 'ls', and 'bootstrap' commands)
    `,
    type: "string",
    requiresArg: true
  },
  "ignore": {
    describe: _dedent2.default`
      Ignore packages with names matching the given glob.
      (Only for 'run', 'exec', 'clean', 'ls', and 'bootstrap' commands)
    `,
    type: "string",
    requiresArg: true
  },
  "include-filtered-dependencies": {
    describe: _dedent2.default`
      Include all transitive dependencies when running a command, regardless of --scope or --ignore.
    `
  },
  "registry": {
    describe: "Use the specified registry for all npm client operations.",
    type: "string",
    requiresArg: true
  },
  "sort": {
    describe: "Sort packages topologically (all dependencies before dependents)",
    type: "boolean",
    default: true
  },
  "max-buffer": {
    describe: "Set max-buffer(bytes) for Command execution",
    type: "number",
    requiresArg: true
  }
};

var Command = function () {
  function Command(input, flags, cwd) {
    _classCallCheck(this, Command);

    _npmlog2.default.pause();
    _npmlog2.default.heading = "lerna";

    if (flags.loglevel) {
      _npmlog2.default.level = flags.loglevel;
    }

    this.input = input;
    this._flags = flags;

    _npmlog2.default.silly("input", input);
    _npmlog2.default.silly("flags", (0, _filterFlags2.default)(flags));

    this.lernaVersion = require("../package.json").version;
    this.repository = new _Repository2.default(cwd);
    this.logger = _npmlog2.default.newGroup(this.name);

    _npmlog2.default.resume();
  }

  _createClass(Command, [{
    key: "run",
    value: function run() {
      _npmlog2.default.info("version", this.lernaVersion);

      if (this.repository.isIndependent()) {
        _npmlog2.default.info("versioning", "independent");
      }

      this.runValidations();
      this.runPreparations();
      this.runCommand();
    }
  }, {
    key: "runValidations",
    value: function runValidations() {
      if (this.requiresGit && !_GitUtilities2.default.isInitialized(this.execOpts)) {
        _npmlog2.default.error("ENOGIT", "This is not a git repository, did you already run `git init` or `lerna init`?");
        this._complete(null, 1);
        return;
      }

      if (!this.repository.packageJson) {
        _npmlog2.default.error("ENOPKG", "`package.json` does not exist, have you run `lerna init`?");
        this._complete(null, 1);
        return;
      }

      if (!this.repository.initVersion) {
        _npmlog2.default.error("ENOLERNA", "`lerna.json` does not exist, have you run `lerna init`?");
        this._complete(null, 1);
        return;
      }

      if (this.options.independent && !this.repository.isIndependent()) {
        _npmlog2.default.error("EVERSIONMODE", "You ran lerna with `--independent` or `-i`, but the repository is not set to independent mode. " + "To use independent mode you need to set your `lerna.json` \"version\" to \"independent\". " + "Then you won't need to pass the `--independent` or `-i` flags.");
        this._complete(null, 1);
        return;
      }

      if (process.env.NODE_ENV !== "lerna-test" && !this.repository.isCompatibleLerna(this.lernaVersion)) {
        _npmlog2.default.error("EMISMATCH", `Lerna major version mismatch: The current version of lerna is ${this.lernaVersion}, ` + `but the Lerna version in \`lerna.json\` is ${this.repository.initVersion}. ` + `You can either run \`lerna init\` again or install \`lerna@${this.repository.initVersion}\`.`);
        this._complete(null, 1);
        return;
      }

      /* eslint-disable max-len */
      // TODO: remove these warnings eventually
      if (_FileSystemUtilities2.default.existsSync(this.repository.versionLocation)) {
        _npmlog2.default.warn("You have a `VERSION` file in your repository, this is leftover from a previous version. Please run `lerna init` to update.");
        this._complete(null, 1);
        return;
      }

      if (process.env.NPM_DIST_TAG !== undefined) {
        _npmlog2.default.warn("`NPM_DIST_TAG=[tagname] lerna publish` is deprecated, please use `lerna publish --tag [tagname]` instead.");
        this._complete(null, 1);
        return;
      }

      if (process.env.FORCE_VERSION !== undefined) {
        _npmlog2.default.warn("`FORCE_VERSION=[package/*] lerna updated/publish` is deprecated, please use `lerna updated/publish --force-publish [package/*]` instead.");
        this._complete(null, 1);
        return;
      }

      if (this.options.onlyExplicitUpdates) {
        _npmlog2.default.warn("`--only-explicit-updates` has been removed. This flag was only ever added for Babel and we never should have exposed it to everyone.");
        this._complete(null, 1);
        return;
      }
      /* eslint-enable max-len */
    }
  }, {
    key: "runPreparations",
    value: function runPreparations() {
      var _options = this.options,
          scope = _options.scope,
          ignore = _options.ignore,
          registry = _options.registry;


      if (scope) {
        _npmlog2.default.info("scope", scope);
      }

      if (ignore) {
        _npmlog2.default.info("ignore", ignore);
      }

      if (registry) {
        this.npmRegistry = registry;
      }

      try {
        this.repository.buildPackageGraph();
        this.packages = this.repository.packages;
        this.packageGraph = this.repository.packageGraph;
        this.filteredPackages = _PackageUtilities2.default.filterPackages(this.packages, { scope, ignore });

        if (this.options.includeFilteredDependencies) {
          this.filteredPackages = _PackageUtilities2.default.addDependencies(this.filteredPackages, this.packageGraph);
        }
      } catch (err) {
        _npmlog2.default.error("EPACKAGES", "Errored while collecting packages and package graph", err);
        this._complete(null, 1);
        throw err;
      }
    }
  }, {
    key: "runCommand",
    value: function runCommand(callback) {
      var _this = this;

      this._attempt("initialize", function () {
        _this._attempt("execute", function () {
          _this._complete(null, 0, callback);
        }, callback);
      }, callback);
    }
  }, {
    key: "_attempt",
    value: function _attempt(method, next, callback) {
      var _this2 = this;

      try {
        _npmlog2.default.silly(method, "attempt");

        this[method](function (err, completed) {
          if (err) {
            _npmlog2.default.error(method, "callback with error\n", err);
            _this2._complete(err, 1, callback);
          } else if (!completed) {
            _npmlog2.default.verbose(method, "exited early");
            _this2._complete(null, 1, callback);
          } else {
            _npmlog2.default.silly(method, "success");
            next();
          }
        });
      } catch (err) {
        _npmlog2.default.error(method, "caught error\n", err);
        this._complete(err, 1, callback);
      }
    }
  }, {
    key: "_complete",
    value: function _complete(err, code, callback) {
      if (code !== 0) {
        (0, _writeLogFile2.default)(this.repository.rootPath);
      }

      var finish = function finish() {
        if (callback) {
          callback(err, code);
        }

        if (process.env.NODE_ENV !== "lerna-test") {
          // TODO: don't call process.exit()
          // eslint-disable-next-line no-process-exit
          process.exit(code);
        }
      };

      var childProcessCount = _ChildProcessUtilities2.default.getChildProcessCount();
      if (childProcessCount > 0) {
        _npmlog2.default.warn("complete", `Waiting for ${childProcessCount} child ` + `process${childProcessCount === 1 ? "" : "es"} to exit. ` + "CTRL-C to exit immediately.");
        _ChildProcessUtilities2.default.onAllExited(finish);
      } else {
        finish();
      }
    }
  }, {
    key: "_legacyOptions",
    value: function _legacyOptions() {
      var _this3 = this;

      return ["bootstrap", "publish"].reduce(function (opts, command) {
        if (_this3.name === command && _this3.repository.lernaJson[`${command}Config`]) {
          _npmlog2.default.warn("deprecated", `\`${command}Config.ignore\` has been replaced by \`command.${command}.ignore\`.`);
          opts.ignore = _this3.repository.lernaJson[`${command}Config`].ignore;
        }
        return opts;
      }, {});
    }
  }, {
    key: "initialize",
    value: function initialize() {
      throw new Error("command.initialize() needs to be implemented.");
    }
  }, {
    key: "execute",
    value: function execute() {
      throw new Error("command.execute() needs to be implemented.");
    }
  }, {
    key: "concurrency",
    get: function get() {
      if (!this._concurrency) {
        var concurrency = this.options.concurrency;

        this._concurrency = Math.max(1, +concurrency || DEFAULT_CONCURRENCY);
      }

      return this._concurrency;
    }
  }, {
    key: "toposort",
    get: function get() {
      if (!this._toposort) {
        var sort = this.options.sort;
        // If the option isn't present then the default is to sort.

        this._toposort = sort == null || sort;
      }

      return this._toposort;
    }
  }, {
    key: "name",
    get: function get() {
      // For a class named "FooCommand" this returns "foo".
      return commandNameFromClassName(this.className);
    }
  }, {
    key: "className",
    get: function get() {
      return this.constructor.name;
    }
  }, {
    key: "execOpts",
    get: function get() {
      if (!this._execOpts) {
        this._execOpts = {
          cwd: this.repository.rootPath
        };

        if (this.options.maxBuffer) {
          this._execOpts.maxBuffer = this.options.maxBuffer;
        }
      }

      return this._execOpts;
    }
  }, {
    key: "requiresGit",
    get: function get() {
      return true;
    }

    // Override this to inherit config from another command.
    // For example `updated` inherits config from `publish`.

  }, {
    key: "otherCommandConfigs",
    get: function get() {
      return [];
    }
  }, {
    key: "options",
    get: function get() {
      if (!this._options) {
        // Command config object is either "commands" or "command".
        var _repository$lernaJson = this.repository.lernaJson,
            commands = _repository$lernaJson.commands,
            command = _repository$lernaJson.command;

        // The current command always overrides otherCommandConfigs

        var lernaCommandOverrides = [this.name].concat(_toConsumableArray(this.otherCommandConfigs)).map(function (name) {
          return (commands || command || {})[name];
        });

        this._options = _lodash2.default.defaults.apply(_lodash2.default, [{},
        // CLI flags, which if defined overrule subsequent values
        this._flags].concat(_toConsumableArray(lernaCommandOverrides), [
        // Global options from `lerna.json`
        this.repository.lernaJson,
        // Deprecated legacy options in `lerna.json`
        this._legacyOptions()]));
      }

      return this._options;
    }
  }]);

  return Command;
}();

exports.default = Command;
function commandNameFromClassName(className) {
  return className.replace(/Command$/, "").toLowerCase();
}