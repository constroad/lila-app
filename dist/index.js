var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports, module) {
    module.exports = {
      name: "dotenv",
      version: "16.6.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports, module) {
    var fs4 = __require("fs");
    var path8 = __require("path");
    var os = __require("os");
    var crypto = __require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs4.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path8.resolve(process.cwd(), ".env.vault");
      }
      if (fs4.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path8.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path8.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path9 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs4.readFileSync(path9, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path9} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (debug || !quiet) {
        const keysCount = Object.keys(parsedAll).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path8.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config2(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config: config2,
      decrypt,
      parse,
      populate
    };
    module.exports.configDotenv = DotenvModule.configDotenv;
    module.exports._configVault = DotenvModule._configVault;
    module.exports._parseVault = DotenvModule._parseVault;
    module.exports.config = DotenvModule.config;
    module.exports.decrypt = DotenvModule.decrypt;
    module.exports.parse = DotenvModule.parse;
    module.exports.populate = DotenvModule.populate;
    module.exports = DotenvModule;
  }
});

// node_modules/universalify/index.js
var require_universalify = __commonJS({
  "node_modules/universalify/index.js"(exports) {
    "use strict";
    exports.fromCallback = function(fn) {
      return Object.defineProperty(function(...args) {
        if (typeof args[args.length - 1] === "function") fn.apply(this, args);
        else {
          return new Promise((resolve, reject) => {
            args.push((err, res) => err != null ? reject(err) : resolve(res));
            fn.apply(this, args);
          });
        }
      }, "name", { value: fn.name });
    };
    exports.fromPromise = function(fn) {
      return Object.defineProperty(function(...args) {
        const cb = args[args.length - 1];
        if (typeof cb !== "function") return fn.apply(this, args);
        else {
          args.pop();
          fn.apply(this, args).then((r) => cb(null, r), cb);
        }
      }, "name", { value: fn.name });
    };
  }
});

// node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "node_modules/graceful-fs/polyfills.js"(exports, module) {
    var constants = __require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module.exports = patch;
    function patch(fs4) {
      if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs4);
      }
      if (!fs4.lutimes) {
        patchLutimes(fs4);
      }
      fs4.chown = chownFix(fs4.chown);
      fs4.fchown = chownFix(fs4.fchown);
      fs4.lchown = chownFix(fs4.lchown);
      fs4.chmod = chmodFix(fs4.chmod);
      fs4.fchmod = chmodFix(fs4.fchmod);
      fs4.lchmod = chmodFix(fs4.lchmod);
      fs4.chownSync = chownFixSync(fs4.chownSync);
      fs4.fchownSync = chownFixSync(fs4.fchownSync);
      fs4.lchownSync = chownFixSync(fs4.lchownSync);
      fs4.chmodSync = chmodFixSync(fs4.chmodSync);
      fs4.fchmodSync = chmodFixSync(fs4.fchmodSync);
      fs4.lchmodSync = chmodFixSync(fs4.lchmodSync);
      fs4.stat = statFix(fs4.stat);
      fs4.fstat = statFix(fs4.fstat);
      fs4.lstat = statFix(fs4.lstat);
      fs4.statSync = statFixSync(fs4.statSync);
      fs4.fstatSync = statFixSync(fs4.fstatSync);
      fs4.lstatSync = statFixSync(fs4.lstatSync);
      if (fs4.chmod && !fs4.lchmod) {
        fs4.lchmod = function(path8, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs4.lchmodSync = function() {
        };
      }
      if (fs4.chown && !fs4.lchown) {
        fs4.lchown = function(path8, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs4.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs4.rename = typeof fs4.rename !== "function" ? fs4.rename : (function(fs$rename) {
          function rename(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs4.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
          return rename;
        })(fs4.rename);
      }
      fs4.read = typeof fs4.read !== "function" ? fs4.read : (function(fs$read) {
        function read(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs4, fd, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs4, fd, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
        return read;
      })(fs4.read);
      fs4.readSync = typeof fs4.readSync !== "function" ? fs4.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs4, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs4.readSync);
      function patchLchmod(fs5) {
        fs5.lchmod = function(path8, mode, callback) {
          fs5.open(
            path8,
            constants.O_WRONLY | constants.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback) callback(err);
                return;
              }
              fs5.fchmod(fd, mode, function(err2) {
                fs5.close(fd, function(err22) {
                  if (callback) callback(err2 || err22);
                });
              });
            }
          );
        };
        fs5.lchmodSync = function(path8, mode) {
          var fd = fs5.openSync(path8, constants.O_WRONLY | constants.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs5.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs5.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs5.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs5) {
        if (constants.hasOwnProperty("O_SYMLINK") && fs5.futimes) {
          fs5.lutimes = function(path8, at, mt, cb) {
            fs5.open(path8, constants.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs5.futimes(fd, at, mt, function(er2) {
                fs5.close(fd, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs5.lutimesSync = function(path8, at, mt) {
            var fd = fs5.openSync(path8, constants.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs5.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs5.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs5.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs5.futimes) {
          fs5.lutimes = function(_a, _b, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs5.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target, mode, cb) {
          return orig.call(fs4, target, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target, mode) {
          try {
            return orig.call(fs4, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs4, target, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs4, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options ? orig.call(fs4, target, options, callback) : orig.call(fs4, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target, options) {
          var stats = options ? orig.call(fs4, target, options) : orig.call(fs4, target);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "node_modules/graceful-fs/legacy-streams.js"(exports, module) {
    var Stream = __require("stream").Stream;
    module.exports = legacy;
    function legacy(fs4) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path8, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path8, options);
        Stream.call(this);
        var self = this;
        this.path = path8;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs4.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err);
            self.readable = false;
            return;
          }
          self.fd = fd;
          self.emit("open", fd);
          self._read();
        });
      }
      function WriteStream(path8, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path8, options);
        Stream.call(this);
        this.path = path8;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs4.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "node_modules/graceful-fs/clone.js"(exports, module) {
    "use strict";
    module.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "node_modules/graceful-fs/graceful-fs.js"(exports, module) {
    var fs4 = __require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = __require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = /* @__PURE__ */ Symbol.for("graceful-fs.queue");
      previousSymbol = /* @__PURE__ */ Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs4[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs4, queue);
      fs4.close = (function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs4, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs4.close);
      fs4.closeSync = (function(fs$closeSync) {
        function closeSync(fd) {
          fs$closeSync.apply(fs4, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      })(fs4.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs4[gracefulQueue]);
          __require("assert").equal(fs4[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs4[gracefulQueue]);
    }
    module.exports = patch(clone(fs4));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs4.__patched) {
      module.exports = patch(fs4);
      fs4.__patched = true;
    }
    function patch(fs5) {
      polyfills(fs5);
      fs5.gracefulify = patch;
      fs5.createReadStream = createReadStream;
      fs5.createWriteStream = createWriteStream;
      var fs$readFile = fs5.readFile;
      fs5.readFile = readFile;
      function readFile(path8, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path8, options, cb);
        function go$readFile(path9, options2, cb2, startTime) {
          return fs$readFile(path9, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path9, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs5.writeFile;
      fs5.writeFile = writeFile;
      function writeFile(path8, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path8, data, options, cb);
        function go$writeFile(path9, data2, options2, cb2, startTime) {
          return fs$writeFile(path9, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path9, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs5.appendFile;
      if (fs$appendFile)
        fs5.appendFile = appendFile;
      function appendFile(path8, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path8, data, options, cb);
        function go$appendFile(path9, data2, options2, cb2, startTime) {
          return fs$appendFile(path9, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path9, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs5.copyFile;
      if (fs$copyFile)
        fs5.copyFile = copyFile;
      function copyFile(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs5.readdir;
      fs5.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path8, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path9, options2, cb2, startTime) {
          return fs$readdir(path9, fs$readdirCallback(
            path9,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path9, options2, cb2, startTime) {
          return fs$readdir(path9, options2, fs$readdirCallback(
            path9,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path8, options, cb);
        function fs$readdirCallback(path9, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path9, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs5);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs5.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs5.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs5, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs5, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs5, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs5, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path8, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path8, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path8, options) {
        return new fs5.ReadStream(path8, options);
      }
      function createWriteStream(path8, options) {
        return new fs5.WriteStream(path8, options);
      }
      var fs$open = fs5.open;
      fs5.open = open;
      function open(path8, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path8, flags, mode, cb);
        function go$open(path9, flags2, mode2, cb2, startTime) {
          return fs$open(path9, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path9, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs5;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs4[gracefulQueue].push(elem);
      retry2();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs4[gracefulQueue].length; ++i) {
        if (fs4[gracefulQueue][i].length > 2) {
          fs4[gracefulQueue][i][3] = now;
          fs4[gracefulQueue][i][4] = now;
        }
      }
      retry2();
    }
    function retry2() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs4[gracefulQueue].length === 0)
        return;
      var elem = fs4[gracefulQueue].shift();
      var fn = elem[0];
      var args = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args);
        var cb = args.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args);
          fn.apply(null, args.concat([startTime]));
        } else {
          fs4[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry2, 0);
      }
    }
  }
});

// node_modules/fs-extra/lib/fs/index.js
var require_fs = __commonJS({
  "node_modules/fs-extra/lib/fs/index.js"(exports) {
    "use strict";
    var u = require_universalify().fromCallback;
    var fs4 = require_graceful_fs();
    var api = [
      "access",
      "appendFile",
      "chmod",
      "chown",
      "close",
      "copyFile",
      "cp",
      "fchmod",
      "fchown",
      "fdatasync",
      "fstat",
      "fsync",
      "ftruncate",
      "futimes",
      "glob",
      "lchmod",
      "lchown",
      "lutimes",
      "link",
      "lstat",
      "mkdir",
      "mkdtemp",
      "open",
      "opendir",
      "readdir",
      "readFile",
      "readlink",
      "realpath",
      "rename",
      "rm",
      "rmdir",
      "stat",
      "statfs",
      "symlink",
      "truncate",
      "unlink",
      "utimes",
      "writeFile"
    ].filter((key) => {
      return typeof fs4[key] === "function";
    });
    Object.assign(exports, fs4);
    api.forEach((method) => {
      exports[method] = u(fs4[method]);
    });
    exports.exists = function(filename, callback) {
      if (typeof callback === "function") {
        return fs4.exists(filename, callback);
      }
      return new Promise((resolve) => {
        return fs4.exists(filename, resolve);
      });
    };
    exports.read = function(fd, buffer, offset, length, position, callback) {
      if (typeof callback === "function") {
        return fs4.read(fd, buffer, offset, length, position, callback);
      }
      return new Promise((resolve, reject) => {
        fs4.read(fd, buffer, offset, length, position, (err, bytesRead, buffer2) => {
          if (err) return reject(err);
          resolve({ bytesRead, buffer: buffer2 });
        });
      });
    };
    exports.write = function(fd, buffer, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs4.write(fd, buffer, ...args);
      }
      return new Promise((resolve, reject) => {
        fs4.write(fd, buffer, ...args, (err, bytesWritten, buffer2) => {
          if (err) return reject(err);
          resolve({ bytesWritten, buffer: buffer2 });
        });
      });
    };
    exports.readv = function(fd, buffers, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs4.readv(fd, buffers, ...args);
      }
      return new Promise((resolve, reject) => {
        fs4.readv(fd, buffers, ...args, (err, bytesRead, buffers2) => {
          if (err) return reject(err);
          resolve({ bytesRead, buffers: buffers2 });
        });
      });
    };
    exports.writev = function(fd, buffers, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs4.writev(fd, buffers, ...args);
      }
      return new Promise((resolve, reject) => {
        fs4.writev(fd, buffers, ...args, (err, bytesWritten, buffers2) => {
          if (err) return reject(err);
          resolve({ bytesWritten, buffers: buffers2 });
        });
      });
    };
    if (typeof fs4.realpath.native === "function") {
      exports.realpath.native = u(fs4.realpath.native);
    } else {
      process.emitWarning(
        "fs.realpath.native is not a function. Is fs being monkey-patched?",
        "Warning",
        "fs-extra-WARN0003"
      );
    }
  }
});

// node_modules/fs-extra/lib/mkdirs/utils.js
var require_utils = __commonJS({
  "node_modules/fs-extra/lib/mkdirs/utils.js"(exports, module) {
    "use strict";
    var path8 = __require("path");
    module.exports.checkPath = function checkPath(pth) {
      if (process.platform === "win32") {
        const pathHasInvalidWinCharacters = /[<>:"|?*]/.test(pth.replace(path8.parse(pth).root, ""));
        if (pathHasInvalidWinCharacters) {
          const error = new Error(`Path contains invalid characters: ${pth}`);
          error.code = "EINVAL";
          throw error;
        }
      }
    };
  }
});

// node_modules/fs-extra/lib/mkdirs/make-dir.js
var require_make_dir = __commonJS({
  "node_modules/fs-extra/lib/mkdirs/make-dir.js"(exports, module) {
    "use strict";
    var fs4 = require_fs();
    var { checkPath } = require_utils();
    var getMode = (options) => {
      const defaults = { mode: 511 };
      if (typeof options === "number") return options;
      return { ...defaults, ...options }.mode;
    };
    module.exports.makeDir = async (dir, options) => {
      checkPath(dir);
      return fs4.mkdir(dir, {
        mode: getMode(options),
        recursive: true
      });
    };
    module.exports.makeDirSync = (dir, options) => {
      checkPath(dir);
      return fs4.mkdirSync(dir, {
        mode: getMode(options),
        recursive: true
      });
    };
  }
});

// node_modules/fs-extra/lib/mkdirs/index.js
var require_mkdirs = __commonJS({
  "node_modules/fs-extra/lib/mkdirs/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var { makeDir: _makeDir, makeDirSync } = require_make_dir();
    var makeDir = u(_makeDir);
    module.exports = {
      mkdirs: makeDir,
      mkdirsSync: makeDirSync,
      // alias
      mkdirp: makeDir,
      mkdirpSync: makeDirSync,
      ensureDir: makeDir,
      ensureDirSync: makeDirSync
    };
  }
});

// node_modules/fs-extra/lib/path-exists/index.js
var require_path_exists = __commonJS({
  "node_modules/fs-extra/lib/path-exists/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs4 = require_fs();
    function pathExists(path8) {
      return fs4.access(path8).then(() => true).catch(() => false);
    }
    module.exports = {
      pathExists: u(pathExists),
      pathExistsSync: fs4.existsSync
    };
  }
});

// node_modules/fs-extra/lib/util/utimes.js
var require_utimes = __commonJS({
  "node_modules/fs-extra/lib/util/utimes.js"(exports, module) {
    "use strict";
    var fs4 = require_fs();
    var u = require_universalify().fromPromise;
    async function utimesMillis(path8, atime, mtime) {
      const fd = await fs4.open(path8, "r+");
      let closeErr = null;
      try {
        await fs4.futimes(fd, atime, mtime);
      } finally {
        try {
          await fs4.close(fd);
        } catch (e) {
          closeErr = e;
        }
      }
      if (closeErr) {
        throw closeErr;
      }
    }
    function utimesMillisSync(path8, atime, mtime) {
      const fd = fs4.openSync(path8, "r+");
      fs4.futimesSync(fd, atime, mtime);
      return fs4.closeSync(fd);
    }
    module.exports = {
      utimesMillis: u(utimesMillis),
      utimesMillisSync
    };
  }
});

// node_modules/fs-extra/lib/util/stat.js
var require_stat = __commonJS({
  "node_modules/fs-extra/lib/util/stat.js"(exports, module) {
    "use strict";
    var fs4 = require_fs();
    var path8 = __require("path");
    var u = require_universalify().fromPromise;
    function getStats(src, dest, opts) {
      const statFunc = opts.dereference ? (file) => fs4.stat(file, { bigint: true }) : (file) => fs4.lstat(file, { bigint: true });
      return Promise.all([
        statFunc(src),
        statFunc(dest).catch((err) => {
          if (err.code === "ENOENT") return null;
          throw err;
        })
      ]).then(([srcStat, destStat]) => ({ srcStat, destStat }));
    }
    function getStatsSync(src, dest, opts) {
      let destStat;
      const statFunc = opts.dereference ? (file) => fs4.statSync(file, { bigint: true }) : (file) => fs4.lstatSync(file, { bigint: true });
      const srcStat = statFunc(src);
      try {
        destStat = statFunc(dest);
      } catch (err) {
        if (err.code === "ENOENT") return { srcStat, destStat: null };
        throw err;
      }
      return { srcStat, destStat };
    }
    async function checkPaths(src, dest, funcName, opts) {
      const { srcStat, destStat } = await getStats(src, dest, opts);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path8.basename(src);
          const destBaseName = path8.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return { srcStat, destStat };
    }
    function checkPathsSync(src, dest, funcName, opts) {
      const { srcStat, destStat } = getStatsSync(src, dest, opts);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path8.basename(src);
          const destBaseName = path8.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return { srcStat, destStat };
    }
    async function checkParentPaths(src, srcStat, dest, funcName) {
      const srcParent = path8.resolve(path8.dirname(src));
      const destParent = path8.resolve(path8.dirname(dest));
      if (destParent === srcParent || destParent === path8.parse(destParent).root) return;
      let destStat;
      try {
        destStat = await fs4.stat(destParent, { bigint: true });
      } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return checkParentPaths(src, srcStat, destParent, funcName);
    }
    function checkParentPathsSync(src, srcStat, dest, funcName) {
      const srcParent = path8.resolve(path8.dirname(src));
      const destParent = path8.resolve(path8.dirname(dest));
      if (destParent === srcParent || destParent === path8.parse(destParent).root) return;
      let destStat;
      try {
        destStat = fs4.statSync(destParent, { bigint: true });
      } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return checkParentPathsSync(src, srcStat, destParent, funcName);
    }
    function areIdentical(srcStat, destStat) {
      return destStat.ino !== void 0 && destStat.dev !== void 0 && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev;
    }
    function isSrcSubdir(src, dest) {
      const srcArr = path8.resolve(src).split(path8.sep).filter((i) => i);
      const destArr = path8.resolve(dest).split(path8.sep).filter((i) => i);
      return srcArr.every((cur, i) => destArr[i] === cur);
    }
    function errMsg(src, dest, funcName) {
      return `Cannot ${funcName} '${src}' to a subdirectory of itself, '${dest}'.`;
    }
    module.exports = {
      // checkPaths
      checkPaths: u(checkPaths),
      checkPathsSync,
      // checkParent
      checkParentPaths: u(checkParentPaths),
      checkParentPathsSync,
      // Misc
      isSrcSubdir,
      areIdentical
    };
  }
});

// node_modules/fs-extra/lib/util/async.js
var require_async = __commonJS({
  "node_modules/fs-extra/lib/util/async.js"(exports, module) {
    "use strict";
    async function asyncIteratorConcurrentProcess(iterator, fn) {
      const promises = [];
      for await (const item of iterator) {
        promises.push(
          fn(item).then(
            () => null,
            (err) => err ?? new Error("unknown error")
          )
        );
      }
      await Promise.all(
        promises.map(
          (promise) => promise.then((possibleErr) => {
            if (possibleErr !== null) throw possibleErr;
          })
        )
      );
    }
    module.exports = {
      asyncIteratorConcurrentProcess
    };
  }
});

// node_modules/fs-extra/lib/copy/copy.js
var require_copy = __commonJS({
  "node_modules/fs-extra/lib/copy/copy.js"(exports, module) {
    "use strict";
    var fs4 = require_fs();
    var path8 = __require("path");
    var { mkdirs } = require_mkdirs();
    var { pathExists } = require_path_exists();
    var { utimesMillis } = require_utimes();
    var stat = require_stat();
    var { asyncIteratorConcurrentProcess } = require_async();
    async function copy(src, dest, opts = {}) {
      if (typeof opts === "function") {
        opts = { filter: opts };
      }
      opts.clobber = "clobber" in opts ? !!opts.clobber : true;
      opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
      if (opts.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0001"
        );
      }
      const { srcStat, destStat } = await stat.checkPaths(src, dest, "copy", opts);
      await stat.checkParentPaths(src, srcStat, dest, "copy");
      const include = await runFilter(src, dest, opts);
      if (!include) return;
      const destParent = path8.dirname(dest);
      const dirExists = await pathExists(destParent);
      if (!dirExists) {
        await mkdirs(destParent);
      }
      await getStatsAndPerformCopy(destStat, src, dest, opts);
    }
    async function runFilter(src, dest, opts) {
      if (!opts.filter) return true;
      return opts.filter(src, dest);
    }
    async function getStatsAndPerformCopy(destStat, src, dest, opts) {
      const statFn = opts.dereference ? fs4.stat : fs4.lstat;
      const srcStat = await statFn(src);
      if (srcStat.isDirectory()) return onDir(srcStat, destStat, src, dest, opts);
      if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src, dest, opts);
      if (srcStat.isSymbolicLink()) return onLink(destStat, src, dest, opts);
      if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src}`);
      if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src}`);
      throw new Error(`Unknown file: ${src}`);
    }
    async function onFile(srcStat, destStat, src, dest, opts) {
      if (!destStat) return copyFile(srcStat, src, dest, opts);
      if (opts.overwrite) {
        await fs4.unlink(dest);
        return copyFile(srcStat, src, dest, opts);
      }
      if (opts.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    async function copyFile(srcStat, src, dest, opts) {
      await fs4.copyFile(src, dest);
      if (opts.preserveTimestamps) {
        if (fileIsNotWritable(srcStat.mode)) {
          await makeFileWritable(dest, srcStat.mode);
        }
        const updatedSrcStat = await fs4.stat(src);
        await utimesMillis(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
      }
      return fs4.chmod(dest, srcStat.mode);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return fs4.chmod(dest, srcMode | 128);
    }
    async function onDir(srcStat, destStat, src, dest, opts) {
      if (!destStat) {
        await fs4.mkdir(dest);
      }
      await asyncIteratorConcurrentProcess(await fs4.opendir(src), async (item) => {
        const srcItem = path8.join(src, item.name);
        const destItem = path8.join(dest, item.name);
        const include = await runFilter(srcItem, destItem, opts);
        if (include) {
          const { destStat: destStat2 } = await stat.checkPaths(srcItem, destItem, "copy", opts);
          await getStatsAndPerformCopy(destStat2, srcItem, destItem, opts);
        }
      });
      if (!destStat) {
        await fs4.chmod(dest, srcStat.mode);
      }
    }
    async function onLink(destStat, src, dest, opts) {
      let resolvedSrc = await fs4.readlink(src);
      if (opts.dereference) {
        resolvedSrc = path8.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs4.symlink(resolvedSrc, dest);
      }
      let resolvedDest = null;
      try {
        resolvedDest = await fs4.readlink(dest);
      } catch (e) {
        if (e.code === "EINVAL" || e.code === "UNKNOWN") return fs4.symlink(resolvedSrc, dest);
        throw e;
      }
      if (opts.dereference) {
        resolvedDest = path8.resolve(process.cwd(), resolvedDest);
      }
      if (resolvedSrc !== resolvedDest) {
        if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
          throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
        }
        if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
          throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
        }
      }
      await fs4.unlink(dest);
      return fs4.symlink(resolvedSrc, dest);
    }
    module.exports = copy;
  }
});

// node_modules/fs-extra/lib/copy/copy-sync.js
var require_copy_sync = __commonJS({
  "node_modules/fs-extra/lib/copy/copy-sync.js"(exports, module) {
    "use strict";
    var fs4 = require_graceful_fs();
    var path8 = __require("path");
    var mkdirsSync = require_mkdirs().mkdirsSync;
    var utimesMillisSync = require_utimes().utimesMillisSync;
    var stat = require_stat();
    function copySync(src, dest, opts) {
      if (typeof opts === "function") {
        opts = { filter: opts };
      }
      opts = opts || {};
      opts.clobber = "clobber" in opts ? !!opts.clobber : true;
      opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
      if (opts.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0002"
        );
      }
      const { srcStat, destStat } = stat.checkPathsSync(src, dest, "copy", opts);
      stat.checkParentPathsSync(src, srcStat, dest, "copy");
      if (opts.filter && !opts.filter(src, dest)) return;
      const destParent = path8.dirname(dest);
      if (!fs4.existsSync(destParent)) mkdirsSync(destParent);
      return getStats(destStat, src, dest, opts);
    }
    function getStats(destStat, src, dest, opts) {
      const statSync = opts.dereference ? fs4.statSync : fs4.lstatSync;
      const srcStat = statSync(src);
      if (srcStat.isDirectory()) return onDir(srcStat, destStat, src, dest, opts);
      else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src, dest, opts);
      else if (srcStat.isSymbolicLink()) return onLink(destStat, src, dest, opts);
      else if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src}`);
      else if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src}`);
      throw new Error(`Unknown file: ${src}`);
    }
    function onFile(srcStat, destStat, src, dest, opts) {
      if (!destStat) return copyFile(srcStat, src, dest, opts);
      return mayCopyFile(srcStat, src, dest, opts);
    }
    function mayCopyFile(srcStat, src, dest, opts) {
      if (opts.overwrite) {
        fs4.unlinkSync(dest);
        return copyFile(srcStat, src, dest, opts);
      } else if (opts.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    function copyFile(srcStat, src, dest, opts) {
      fs4.copyFileSync(src, dest);
      if (opts.preserveTimestamps) handleTimestamps(srcStat.mode, src, dest);
      return setDestMode(dest, srcStat.mode);
    }
    function handleTimestamps(srcMode, src, dest) {
      if (fileIsNotWritable(srcMode)) makeFileWritable(dest, srcMode);
      return setDestTimestamps(src, dest);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return setDestMode(dest, srcMode | 128);
    }
    function setDestMode(dest, srcMode) {
      return fs4.chmodSync(dest, srcMode);
    }
    function setDestTimestamps(src, dest) {
      const updatedSrcStat = fs4.statSync(src);
      return utimesMillisSync(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
    }
    function onDir(srcStat, destStat, src, dest, opts) {
      if (!destStat) return mkDirAndCopy(srcStat.mode, src, dest, opts);
      return copyDir(src, dest, opts);
    }
    function mkDirAndCopy(srcMode, src, dest, opts) {
      fs4.mkdirSync(dest);
      copyDir(src, dest, opts);
      return setDestMode(dest, srcMode);
    }
    function copyDir(src, dest, opts) {
      const dir = fs4.opendirSync(src);
      try {
        let dirent;
        while ((dirent = dir.readSync()) !== null) {
          copyDirItem(dirent.name, src, dest, opts);
        }
      } finally {
        dir.closeSync();
      }
    }
    function copyDirItem(item, src, dest, opts) {
      const srcItem = path8.join(src, item);
      const destItem = path8.join(dest, item);
      if (opts.filter && !opts.filter(srcItem, destItem)) return;
      const { destStat } = stat.checkPathsSync(srcItem, destItem, "copy", opts);
      return getStats(destStat, srcItem, destItem, opts);
    }
    function onLink(destStat, src, dest, opts) {
      let resolvedSrc = fs4.readlinkSync(src);
      if (opts.dereference) {
        resolvedSrc = path8.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs4.symlinkSync(resolvedSrc, dest);
      } else {
        let resolvedDest;
        try {
          resolvedDest = fs4.readlinkSync(dest);
        } catch (err) {
          if (err.code === "EINVAL" || err.code === "UNKNOWN") return fs4.symlinkSync(resolvedSrc, dest);
          throw err;
        }
        if (opts.dereference) {
          resolvedDest = path8.resolve(process.cwd(), resolvedDest);
        }
        if (resolvedSrc !== resolvedDest) {
          if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
            throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
          }
          if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
            throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
          }
        }
        return copyLink(resolvedSrc, dest);
      }
    }
    function copyLink(resolvedSrc, dest) {
      fs4.unlinkSync(dest);
      return fs4.symlinkSync(resolvedSrc, dest);
    }
    module.exports = copySync;
  }
});

// node_modules/fs-extra/lib/copy/index.js
var require_copy2 = __commonJS({
  "node_modules/fs-extra/lib/copy/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    module.exports = {
      copy: u(require_copy()),
      copySync: require_copy_sync()
    };
  }
});

// node_modules/fs-extra/lib/remove/index.js
var require_remove = __commonJS({
  "node_modules/fs-extra/lib/remove/index.js"(exports, module) {
    "use strict";
    var fs4 = require_graceful_fs();
    var u = require_universalify().fromCallback;
    function remove(path8, callback) {
      fs4.rm(path8, { recursive: true, force: true }, callback);
    }
    function removeSync(path8) {
      fs4.rmSync(path8, { recursive: true, force: true });
    }
    module.exports = {
      remove: u(remove),
      removeSync
    };
  }
});

// node_modules/fs-extra/lib/empty/index.js
var require_empty = __commonJS({
  "node_modules/fs-extra/lib/empty/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs4 = require_fs();
    var path8 = __require("path");
    var mkdir = require_mkdirs();
    var remove = require_remove();
    var emptyDir = u(async function emptyDir2(dir) {
      let items;
      try {
        items = await fs4.readdir(dir);
      } catch {
        return mkdir.mkdirs(dir);
      }
      return Promise.all(items.map((item) => remove.remove(path8.join(dir, item))));
    });
    function emptyDirSync(dir) {
      let items;
      try {
        items = fs4.readdirSync(dir);
      } catch {
        return mkdir.mkdirsSync(dir);
      }
      items.forEach((item) => {
        item = path8.join(dir, item);
        remove.removeSync(item);
      });
    }
    module.exports = {
      emptyDirSync,
      emptydirSync: emptyDirSync,
      emptyDir,
      emptydir: emptyDir
    };
  }
});

// node_modules/fs-extra/lib/ensure/file.js
var require_file = __commonJS({
  "node_modules/fs-extra/lib/ensure/file.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path8 = __require("path");
    var fs4 = require_fs();
    var mkdir = require_mkdirs();
    async function createFile(file) {
      let stats;
      try {
        stats = await fs4.stat(file);
      } catch {
      }
      if (stats && stats.isFile()) return;
      const dir = path8.dirname(file);
      let dirStats = null;
      try {
        dirStats = await fs4.stat(dir);
      } catch (err) {
        if (err.code === "ENOENT") {
          await mkdir.mkdirs(dir);
          await fs4.writeFile(file, "");
          return;
        } else {
          throw err;
        }
      }
      if (dirStats.isDirectory()) {
        await fs4.writeFile(file, "");
      } else {
        await fs4.readdir(dir);
      }
    }
    function createFileSync(file) {
      let stats;
      try {
        stats = fs4.statSync(file);
      } catch {
      }
      if (stats && stats.isFile()) return;
      const dir = path8.dirname(file);
      try {
        if (!fs4.statSync(dir).isDirectory()) {
          fs4.readdirSync(dir);
        }
      } catch (err) {
        if (err && err.code === "ENOENT") mkdir.mkdirsSync(dir);
        else throw err;
      }
      fs4.writeFileSync(file, "");
    }
    module.exports = {
      createFile: u(createFile),
      createFileSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/link.js
var require_link = __commonJS({
  "node_modules/fs-extra/lib/ensure/link.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path8 = __require("path");
    var fs4 = require_fs();
    var mkdir = require_mkdirs();
    var { pathExists } = require_path_exists();
    var { areIdentical } = require_stat();
    async function createLink(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = await fs4.lstat(dstpath);
      } catch {
      }
      let srcStat;
      try {
        srcStat = await fs4.lstat(srcpath);
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureLink");
        throw err;
      }
      if (dstStat && areIdentical(srcStat, dstStat)) return;
      const dir = path8.dirname(dstpath);
      const dirExists = await pathExists(dir);
      if (!dirExists) {
        await mkdir.mkdirs(dir);
      }
      await fs4.link(srcpath, dstpath);
    }
    function createLinkSync(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = fs4.lstatSync(dstpath);
      } catch {
      }
      try {
        const srcStat = fs4.lstatSync(srcpath);
        if (dstStat && areIdentical(srcStat, dstStat)) return;
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureLink");
        throw err;
      }
      const dir = path8.dirname(dstpath);
      const dirExists = fs4.existsSync(dir);
      if (dirExists) return fs4.linkSync(srcpath, dstpath);
      mkdir.mkdirsSync(dir);
      return fs4.linkSync(srcpath, dstpath);
    }
    module.exports = {
      createLink: u(createLink),
      createLinkSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/symlink-paths.js
var require_symlink_paths = __commonJS({
  "node_modules/fs-extra/lib/ensure/symlink-paths.js"(exports, module) {
    "use strict";
    var path8 = __require("path");
    var fs4 = require_fs();
    var { pathExists } = require_path_exists();
    var u = require_universalify().fromPromise;
    async function symlinkPaths(srcpath, dstpath) {
      if (path8.isAbsolute(srcpath)) {
        try {
          await fs4.lstat(srcpath);
        } catch (err) {
          err.message = err.message.replace("lstat", "ensureSymlink");
          throw err;
        }
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      }
      const dstdir = path8.dirname(dstpath);
      const relativeToDst = path8.join(dstdir, srcpath);
      const exists = await pathExists(relativeToDst);
      if (exists) {
        return {
          toCwd: relativeToDst,
          toDst: srcpath
        };
      }
      try {
        await fs4.lstat(srcpath);
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureSymlink");
        throw err;
      }
      return {
        toCwd: srcpath,
        toDst: path8.relative(dstdir, srcpath)
      };
    }
    function symlinkPathsSync(srcpath, dstpath) {
      if (path8.isAbsolute(srcpath)) {
        const exists2 = fs4.existsSync(srcpath);
        if (!exists2) throw new Error("absolute srcpath does not exist");
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      }
      const dstdir = path8.dirname(dstpath);
      const relativeToDst = path8.join(dstdir, srcpath);
      const exists = fs4.existsSync(relativeToDst);
      if (exists) {
        return {
          toCwd: relativeToDst,
          toDst: srcpath
        };
      }
      const srcExists = fs4.existsSync(srcpath);
      if (!srcExists) throw new Error("relative srcpath does not exist");
      return {
        toCwd: srcpath,
        toDst: path8.relative(dstdir, srcpath)
      };
    }
    module.exports = {
      symlinkPaths: u(symlinkPaths),
      symlinkPathsSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/symlink-type.js
var require_symlink_type = __commonJS({
  "node_modules/fs-extra/lib/ensure/symlink-type.js"(exports, module) {
    "use strict";
    var fs4 = require_fs();
    var u = require_universalify().fromPromise;
    async function symlinkType(srcpath, type) {
      if (type) return type;
      let stats;
      try {
        stats = await fs4.lstat(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    function symlinkTypeSync(srcpath, type) {
      if (type) return type;
      let stats;
      try {
        stats = fs4.lstatSync(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    module.exports = {
      symlinkType: u(symlinkType),
      symlinkTypeSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/symlink.js
var require_symlink = __commonJS({
  "node_modules/fs-extra/lib/ensure/symlink.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path8 = __require("path");
    var fs4 = require_fs();
    var { mkdirs, mkdirsSync } = require_mkdirs();
    var { symlinkPaths, symlinkPathsSync } = require_symlink_paths();
    var { symlinkType, symlinkTypeSync } = require_symlink_type();
    var { pathExists } = require_path_exists();
    var { areIdentical } = require_stat();
    async function createSymlink(srcpath, dstpath, type) {
      let stats;
      try {
        stats = await fs4.lstat(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        const [srcStat, dstStat] = await Promise.all([
          fs4.stat(srcpath),
          fs4.stat(dstpath)
        ]);
        if (areIdentical(srcStat, dstStat)) return;
      }
      const relative = await symlinkPaths(srcpath, dstpath);
      srcpath = relative.toDst;
      const toType = await symlinkType(relative.toCwd, type);
      const dir = path8.dirname(dstpath);
      if (!await pathExists(dir)) {
        await mkdirs(dir);
      }
      return fs4.symlink(srcpath, dstpath, toType);
    }
    function createSymlinkSync(srcpath, dstpath, type) {
      let stats;
      try {
        stats = fs4.lstatSync(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        const srcStat = fs4.statSync(srcpath);
        const dstStat = fs4.statSync(dstpath);
        if (areIdentical(srcStat, dstStat)) return;
      }
      const relative = symlinkPathsSync(srcpath, dstpath);
      srcpath = relative.toDst;
      type = symlinkTypeSync(relative.toCwd, type);
      const dir = path8.dirname(dstpath);
      const exists = fs4.existsSync(dir);
      if (exists) return fs4.symlinkSync(srcpath, dstpath, type);
      mkdirsSync(dir);
      return fs4.symlinkSync(srcpath, dstpath, type);
    }
    module.exports = {
      createSymlink: u(createSymlink),
      createSymlinkSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/index.js
var require_ensure = __commonJS({
  "node_modules/fs-extra/lib/ensure/index.js"(exports, module) {
    "use strict";
    var { createFile, createFileSync } = require_file();
    var { createLink, createLinkSync } = require_link();
    var { createSymlink, createSymlinkSync } = require_symlink();
    module.exports = {
      // file
      createFile,
      createFileSync,
      ensureFile: createFile,
      ensureFileSync: createFileSync,
      // link
      createLink,
      createLinkSync,
      ensureLink: createLink,
      ensureLinkSync: createLinkSync,
      // symlink
      createSymlink,
      createSymlinkSync,
      ensureSymlink: createSymlink,
      ensureSymlinkSync: createSymlinkSync
    };
  }
});

// node_modules/jsonfile/utils.js
var require_utils2 = __commonJS({
  "node_modules/jsonfile/utils.js"(exports, module) {
    function stringify(obj, { EOL = "\n", finalEOL = true, replacer = null, spaces } = {}) {
      const EOF = finalEOL ? EOL : "";
      const str = JSON.stringify(obj, replacer, spaces);
      return str.replace(/\n/g, EOL) + EOF;
    }
    function stripBom(content) {
      if (Buffer.isBuffer(content)) content = content.toString("utf8");
      return content.replace(/^\uFEFF/, "");
    }
    module.exports = { stringify, stripBom };
  }
});

// node_modules/jsonfile/index.js
var require_jsonfile = __commonJS({
  "node_modules/jsonfile/index.js"(exports, module) {
    var _fs;
    try {
      _fs = require_graceful_fs();
    } catch (_) {
      _fs = __require("fs");
    }
    var universalify = require_universalify();
    var { stringify, stripBom } = require_utils2();
    async function _readFile(file, options = {}) {
      if (typeof options === "string") {
        options = { encoding: options };
      }
      const fs4 = options.fs || _fs;
      const shouldThrow = "throws" in options ? options.throws : true;
      let data = await universalify.fromCallback(fs4.readFile)(file, options);
      data = stripBom(data);
      let obj;
      try {
        obj = JSON.parse(data, options ? options.reviver : null);
      } catch (err) {
        if (shouldThrow) {
          err.message = `${file}: ${err.message}`;
          throw err;
        } else {
          return null;
        }
      }
      return obj;
    }
    var readFile = universalify.fromPromise(_readFile);
    function readFileSync(file, options = {}) {
      if (typeof options === "string") {
        options = { encoding: options };
      }
      const fs4 = options.fs || _fs;
      const shouldThrow = "throws" in options ? options.throws : true;
      try {
        let content = fs4.readFileSync(file, options);
        content = stripBom(content);
        return JSON.parse(content, options.reviver);
      } catch (err) {
        if (shouldThrow) {
          err.message = `${file}: ${err.message}`;
          throw err;
        } else {
          return null;
        }
      }
    }
    async function _writeFile(file, obj, options = {}) {
      const fs4 = options.fs || _fs;
      const str = stringify(obj, options);
      await universalify.fromCallback(fs4.writeFile)(file, str, options);
    }
    var writeFile = universalify.fromPromise(_writeFile);
    function writeFileSync(file, obj, options = {}) {
      const fs4 = options.fs || _fs;
      const str = stringify(obj, options);
      return fs4.writeFileSync(file, str, options);
    }
    module.exports = {
      readFile,
      readFileSync,
      writeFile,
      writeFileSync
    };
  }
});

// node_modules/fs-extra/lib/json/jsonfile.js
var require_jsonfile2 = __commonJS({
  "node_modules/fs-extra/lib/json/jsonfile.js"(exports, module) {
    "use strict";
    var jsonFile = require_jsonfile();
    module.exports = {
      // jsonfile exports
      readJson: jsonFile.readFile,
      readJsonSync: jsonFile.readFileSync,
      writeJson: jsonFile.writeFile,
      writeJsonSync: jsonFile.writeFileSync
    };
  }
});

// node_modules/fs-extra/lib/output-file/index.js
var require_output_file = __commonJS({
  "node_modules/fs-extra/lib/output-file/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs4 = require_fs();
    var path8 = __require("path");
    var mkdir = require_mkdirs();
    var pathExists = require_path_exists().pathExists;
    async function outputFile(file, data, encoding = "utf-8") {
      const dir = path8.dirname(file);
      if (!await pathExists(dir)) {
        await mkdir.mkdirs(dir);
      }
      return fs4.writeFile(file, data, encoding);
    }
    function outputFileSync(file, ...args) {
      const dir = path8.dirname(file);
      if (!fs4.existsSync(dir)) {
        mkdir.mkdirsSync(dir);
      }
      fs4.writeFileSync(file, ...args);
    }
    module.exports = {
      outputFile: u(outputFile),
      outputFileSync
    };
  }
});

// node_modules/fs-extra/lib/json/output-json.js
var require_output_json = __commonJS({
  "node_modules/fs-extra/lib/json/output-json.js"(exports, module) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFile } = require_output_file();
    async function outputJson(file, data, options = {}) {
      const str = stringify(data, options);
      await outputFile(file, str, options);
    }
    module.exports = outputJson;
  }
});

// node_modules/fs-extra/lib/json/output-json-sync.js
var require_output_json_sync = __commonJS({
  "node_modules/fs-extra/lib/json/output-json-sync.js"(exports, module) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFileSync } = require_output_file();
    function outputJsonSync(file, data, options) {
      const str = stringify(data, options);
      outputFileSync(file, str, options);
    }
    module.exports = outputJsonSync;
  }
});

// node_modules/fs-extra/lib/json/index.js
var require_json = __commonJS({
  "node_modules/fs-extra/lib/json/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var jsonFile = require_jsonfile2();
    jsonFile.outputJson = u(require_output_json());
    jsonFile.outputJsonSync = require_output_json_sync();
    jsonFile.outputJSON = jsonFile.outputJson;
    jsonFile.outputJSONSync = jsonFile.outputJsonSync;
    jsonFile.writeJSON = jsonFile.writeJson;
    jsonFile.writeJSONSync = jsonFile.writeJsonSync;
    jsonFile.readJSON = jsonFile.readJson;
    jsonFile.readJSONSync = jsonFile.readJsonSync;
    module.exports = jsonFile;
  }
});

// node_modules/fs-extra/lib/move/move.js
var require_move = __commonJS({
  "node_modules/fs-extra/lib/move/move.js"(exports, module) {
    "use strict";
    var fs4 = require_fs();
    var path8 = __require("path");
    var { copy } = require_copy2();
    var { remove } = require_remove();
    var { mkdirp } = require_mkdirs();
    var { pathExists } = require_path_exists();
    var stat = require_stat();
    async function move(src, dest, opts = {}) {
      const overwrite = opts.overwrite || opts.clobber || false;
      const { srcStat, isChangingCase = false } = await stat.checkPaths(src, dest, "move", opts);
      await stat.checkParentPaths(src, srcStat, dest, "move");
      const destParent = path8.dirname(dest);
      const parsedParentPath = path8.parse(destParent);
      if (parsedParentPath.root !== destParent) {
        await mkdirp(destParent);
      }
      return doRename(src, dest, overwrite, isChangingCase);
    }
    async function doRename(src, dest, overwrite, isChangingCase) {
      if (!isChangingCase) {
        if (overwrite) {
          await remove(dest);
        } else if (await pathExists(dest)) {
          throw new Error("dest already exists.");
        }
      }
      try {
        await fs4.rename(src, dest);
      } catch (err) {
        if (err.code !== "EXDEV") {
          throw err;
        }
        await moveAcrossDevice(src, dest, overwrite);
      }
    }
    async function moveAcrossDevice(src, dest, overwrite) {
      const opts = {
        overwrite,
        errorOnExist: true,
        preserveTimestamps: true
      };
      await copy(src, dest, opts);
      return remove(src);
    }
    module.exports = move;
  }
});

// node_modules/fs-extra/lib/move/move-sync.js
var require_move_sync = __commonJS({
  "node_modules/fs-extra/lib/move/move-sync.js"(exports, module) {
    "use strict";
    var fs4 = require_graceful_fs();
    var path8 = __require("path");
    var copySync = require_copy2().copySync;
    var removeSync = require_remove().removeSync;
    var mkdirpSync = require_mkdirs().mkdirpSync;
    var stat = require_stat();
    function moveSync(src, dest, opts) {
      opts = opts || {};
      const overwrite = opts.overwrite || opts.clobber || false;
      const { srcStat, isChangingCase = false } = stat.checkPathsSync(src, dest, "move", opts);
      stat.checkParentPathsSync(src, srcStat, dest, "move");
      if (!isParentRoot(dest)) mkdirpSync(path8.dirname(dest));
      return doRename(src, dest, overwrite, isChangingCase);
    }
    function isParentRoot(dest) {
      const parent = path8.dirname(dest);
      const parsedPath = path8.parse(parent);
      return parsedPath.root === parent;
    }
    function doRename(src, dest, overwrite, isChangingCase) {
      if (isChangingCase) return rename(src, dest, overwrite);
      if (overwrite) {
        removeSync(dest);
        return rename(src, dest, overwrite);
      }
      if (fs4.existsSync(dest)) throw new Error("dest already exists.");
      return rename(src, dest, overwrite);
    }
    function rename(src, dest, overwrite) {
      try {
        fs4.renameSync(src, dest);
      } catch (err) {
        if (err.code !== "EXDEV") throw err;
        return moveAcrossDevice(src, dest, overwrite);
      }
    }
    function moveAcrossDevice(src, dest, overwrite) {
      const opts = {
        overwrite,
        errorOnExist: true,
        preserveTimestamps: true
      };
      copySync(src, dest, opts);
      return removeSync(src);
    }
    module.exports = moveSync;
  }
});

// node_modules/fs-extra/lib/move/index.js
var require_move2 = __commonJS({
  "node_modules/fs-extra/lib/move/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    module.exports = {
      move: u(require_move()),
      moveSync: require_move_sync()
    };
  }
});

// node_modules/fs-extra/lib/index.js
var require_lib = __commonJS({
  "node_modules/fs-extra/lib/index.js"(exports, module) {
    "use strict";
    module.exports = {
      // Export promiseified graceful-fs:
      ...require_fs(),
      // Export extra methods:
      ...require_copy2(),
      ...require_empty(),
      ...require_ensure(),
      ...require_json(),
      ...require_mkdirs(),
      ...require_move2(),
      ...require_output_file(),
      ...require_path_exists(),
      ...require_remove()
    };
  }
});

// src/index.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";

// src/utils/logger.ts
import winston from "winston";
import path2 from "path";

// src/config/environment.ts
var import_dotenv = __toESM(require_main(), 1);
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
import_dotenv.default.config({ path: path.join(__dirname, "../../.env") });
var config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  // WhatsApp
  whatsapp: {
    sessionDir: process.env.WHATSAPP_SESSION_DIR || "./data/sessions",
    autoReconnect: process.env.WHATSAPP_AUTO_RECONNECT === "true",
    maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || "5", 10),
    qrTimeout: 6e4
    // 60 segundos
  },
  // Claude API
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  // Cron Jobs
  jobs: {
    storageFile: process.env.CRONJOBS_STORAGE || "./data/cronjobs.json",
    checkInterval: 1e4
    // Verificar cada 10s
  },
  // PDF
  pdf: {
    templatesDir: process.env.PDF_TEMPLATES_DIR || "./templates/pdf",
    uploadsDir: process.env.PDF_UPLOADS_DIR || "./uploads"
  },
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
    dir: process.env.LOG_DIR || "./logs"
  },
  // Security
  security: {
    apiSecretKey: process.env.API_SECRET_KEY || "dev-secret-key",
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW || "15m",
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "100", 10)
  },
  // Features
  features: {
    enablePDF: true,
    enableCron: true,
    enableHotReload: true
  }
};

// src/utils/logger.ts
var logDir = config.logging.dir;
var logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""}`;
    })
  ),
  defaultMeta: { service: "mvp-api" },
  transports: [
    new winston.transports.File({
      filename: path2.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880,
      // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path2.join(logDir, "combined.log"),
      maxsize: 5242880,
      // 5MB
      maxFiles: 10
    })
  ]
});
if (config.nodeEnv === "development") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      )
    })
  );
}
var logger_default = logger;

// src/api/middlewares/rateLimiter.ts
import rateLimit from "express-rate-limit";
var apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutos
  max: config.security.rateLimitMax,
  // límite de 100 requests por ventana
  message: "Demasiadas solicitudes desde esta IP, intenta m\xE1s tarde",
  standardHeaders: true,
  // Retornar información del rate limit en los `RateLimit-*` headers
  legacyHeaders: false,
  // Deshabilitar los headers `X-RateLimit-*`
  skip: (req) => {
    return req.headers["x-api-key"] === process.env.API_SECRET_KEY;
  }
});
var sessionLimiter = rateLimit({
  windowMs: 1 * 60 * 1e3,
  // 1 minuto
  max: 5,
  // máximo 5 conexiones por minuto
  keyGenerator: (req) => {
    return req.body?.phoneNumber || req.ip || "unknown";
  }
});
var jobsLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 minuto
  max: 10
});
var messageLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 minuto
  max: 100,
  keyGenerator: (req) => {
    return req.body?.chatId || req.ip || "unknown";
  }
});

// src/config/constants.ts
var CONVERSATION_TIMEOUT = 30 * 60 * 1e3;
var QR_EXPIRY_TIME = 60 * 1e3;
var HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};
var CLAUDE_MODEL = "claude-sonnet-4-20250514";
var CLAUDE_MAX_TOKENS = 1024;

// src/api/middlewares/errorHandler.ts
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
  const message = err.message || "Internal Server Error";
  logger_default.error("Error:", {
    statusCode,
    message,
    path: req.path,
    method: req.method,
    details: err.details
  });
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      ...process.env.NODE_ENV === "development" && { stack: err.stack }
    }
  });
}
function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.path}`);
  error.statusCode = HTTP_STATUS.NOT_FOUND;
  next(error);
}
function requestLogger(req, res, next) {
  const startTime = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    logger_default.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
}

// src/api/routes/session.routes.ts
import { Router } from "express";

// src/whatsapp/baileys/connection.manager.ts
var import_fs_extra2 = __toESM(require_lib(), 1);
import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path5 from "path";

// src/whatsapp/ai-agent/agent.service.ts
import Anthropic from "@anthropic-ai/sdk";

// src/whatsapp/ai-agent/prompts/asphalt-sales.prompt.ts
var SYSTEM_PROMPT = `# TU IDENTIDAD

Eres **Mar\xEDa**, asesora comercial experta de **CONSTROAD**, empresa l\xEDder en servicios de asfalto en Per\xFA con m\xE1s de 15 a\xF1os de experiencia.

---

## TU PERSONALIDAD

- **Profesional pero c\xE1lida**: Mantienes un equilibrio entre seriedad y cercan\xEDa
- **Proactiva**: No esperas a que te pregunten todo, gu\xEDas la conversaci\xF3n
- **Paciente**: Entiendes que no todos conocen de asfalto, explicas con claridad
- **Emp\xE1tica**: Te pones en el lugar del cliente y entiendes sus necesidades
- **Natural**: Hablas como una persona real, no como un robot
- **Peruana**: Usas expresiones locales apropiadas sin caer en informalidad excesiva

**Ejemplos de tu estilo:**
- \u2705 "\xA1Claro que s\xED! Con gusto te ayudo con eso"
- \u2705 "Perfecto, d\xE9jame hacerte un par de preguntas para darte la mejor opci\xF3n"
- \u2705 "Entiendo tu situaci\xF3n, es muy com\xFAn en proyectos como el tuyo"
- \u274C "Procedo a solicitar informaci\xF3n" (muy rob\xF3tico)
- \u274C "Perfecto perfecto perfecto" (muy repetitivo)

---

## TU MISI\xD3N PRINCIPAL

Ayudar a los clientes a encontrar la mejor soluci\xF3n de asfalto para su proyecto, recopilando informaci\xF3n clave de manera **natural, conversacional y eficiente**.

**No eres un formulario con patas**, eres una asesora que:
1. Escucha activamente
2. Hace preguntas inteligentes
3. Adapta la conversaci\xF3n al cliente
4. Recopila informaci\xF3n de forma org\xE1nica
5. Deriva cuando es necesario

---

# SERVICIOS QUE OFRECES

## 1. \u{1F6E3}\uFE0F VENTA DE ASFALTO

### Tipos disponibles:

#### **Asfalto en Caliente**
- El m\xE1s com\xFAn y vers\xE1til
- Ideal para tr\xE1fico vehicular
- Se aplica a temperaturas de 150-160\xB0C
- Mejor adherencia y durabilidad

#### **Asfalto en Fr\xEDo**
- Para reparaciones y parches
- Ideal para climas fr\xEDos o lluviosos
- No requiere maquinaria especializada
- Aplicaci\xF3n m\xE1s sencilla

#### **Asfalto Modificado**
- Mayor durabilidad (pol\xEDmeros)
- Para alto tr\xE1fico o condiciones extremas
- M\xE1s resistente a deformaciones
- Ideal para zonas industriales o avenidas principales

### Espesores disponibles:
- **1 pulgada (2.54 cm)**: Tr\xE1fico ligero, patios, estacionamientos peque\xF1os
- **2 pulgadas (5.08 cm)**: Tr\xE1fico medio, calles residenciales, estacionamientos
- **3 pulgadas (7.62 cm)**: Tr\xE1fico pesado, v\xEDas principales, zonas industriales

### Informaci\xF3n que necesitas recopilar:

1. **Tipo de proyecto** (para recomendar el asfalto adecuado)
   - "\xBFEs para una v\xEDa, estacionamiento, patio industrial, o qu\xE9 tipo de proyecto?"
   
2. **Tipo de tr\xE1fico esperado**
   - "\xBFQu\xE9 tipo de veh\xEDculos van a circular? \xBFAutos, camiones, maquinaria pesada?"
   
3. **Tipo de asfalto** (despu\xE9s de entender su necesidad)
   - Recomienda bas\xE1ndote en su proyecto
   
4. **Espesor requerido**
   - Sugiere seg\xFAn el tipo de tr\xE1fico
   
5. **Modalidad de entrega**
   - "\xBFLo necesitas puesto en planta (lo recoges t\xFA) o puesto en obra (te lo llevamos)?"
   - Si es en obra: "\xBFA qu\xE9 distrito o ubicaci\xF3n exacta?"
   
6. **Cantidad aproximada**
   - "\xBFCu\xE1ntos metros c\xFAbicos aproximadamente? Si no est\xE1s seguro, \xBFcu\xE1l es el \xE1rea en m\xB2?"

---

## 2. \u{1F6A7} COLOCACI\xD3N DE ASFALTO

### Informaci\xF3n que necesitas recopilar:

#### **1. \xC1rea y ubicaci\xF3n**
- "\xBFCu\xE1ntos metros cuadrados necesitas asfaltar?"
- "\xBFEn qu\xE9 distrito o ubicaci\xF3n exacta ser\xEDa la obra?"

#### **2. Espesor del asfalto**
- Sugiere seg\xFAn el uso

#### **3. Estado de la base**
- "\xBFYa cuentas con la base preparada o es terreno natural?"
- "\xBFEs una base nueva o es un pavimento existente que quieres recubrir?"

#### **4. Imprimaci\xF3n (preparaci\xF3n de superficie)**

**Si es base nueva:**
- Se requiere imprimaci\xF3n con **MC-30** (asfalto l\xEDquido de curado medio)
- "Para bases nuevas necesitamos aplicar MC-30 como imprimante"

**Si es pavimento existente:**
- Se requiere **riego de liga** (emulsi\xF3n asf\xE1ltica)
- "Como es sobre pavimento existente, aplicaremos riego de liga para que adhiera mejor"

#### **5. Fresado (opcional)**
- "\xBFNecesitas que removamos el asfalto viejo antes?"

#### **6. Tipo de terreno**
- "\xBFC\xF3mo es el \xE1rea? \xBFEs plana, tiene pendiente, son calles?"

---

## 3. \u{1F69B} SERVICIO DE TRANSPORTE

### Informaci\xF3n que necesitas:

1. **Punto de carga**: "\xBFDe d\xF3nde necesitas que recojamos el asfalto?"
2. **Punto de descarga**: "\xBFA d\xF3nde hay que llevarlo?"
3. **Tipo de asfalto**: "\xBFQu\xE9 tipo de asfalto vamos a transportar?"
4. **Cantidad**: "\xBFCu\xE1ntos metros c\xFAbicos son?"
5. **Consideraciones**: "\xBFHay restricci\xF3n de horario o zona de dif\xEDcil acceso?"

---

## 4. \u{1F3ED} SERVICIO DE FABRICACI\xD3N

**Para este servicio especializado, deriva INMEDIATAMENTE a un ingeniero.**

---

# REGLAS DE CONVERSACI\xD3N

## \u2705 SIEMPRE DEBES:

1. **Hacer preguntas inteligentes y contextuales**
   - M\xE1ximo 2-3 preguntas por mensaje
   - Adapta las preguntas seg\xFAn las respuestas previas

2. **Confirmar informaci\xF3n importante**
   - "Perfecto, entonces son 500 m\xB2 en San Isidro. \xBFEs correcto?"

3. **Celebrar el progreso**
   - "\xA1Perfecto!", "\xA1Excelente!", "\xA1Genial, vamos bien!"

4. **Adaptar tu lenguaje al cliente**
   - Cliente t\xE9cnico \u2192 M\xE1s t\xE9rminos especializados
   - Cliente general \u2192 Explicaciones simples

---

## \u274C NUNCA DEBES:

1. **Inventar informaci\xF3n**
   - \u274C No des precios espec\xEDficos
   - \u274C No prometas fechas exactas
   - \u274C No ofrezcas descuentos

2. **Ser rob\xF3tico**
   - \u274C "Procedo a recopilar datos"
   - \u2705 "Perfecto, d\xE9jame hacerte un par de preguntas"

3. **Abrumar con preguntas**
   - \u274C 5-6 preguntas en un mensaje
   - \u2705 2-3 preguntas m\xE1ximo

4. **Ignorar el contexto previo**
   - Si el cliente ya dijo algo, no lo vuelvas a preguntar

---

# DERIVACI\xD3N A HUMANO

## \u{1F6A8} Deriva INMEDIATAMENTE si:

1. El cliente lo pide expl\xEDcitamente
2. El cliente est\xE1 molesto o insatisfecho
3. Preguntas muy t\xE9cnicas o legales
4. Temas fuera de tu alcance
5. Servicios especializados (fabricaci\xF3n)

**Frase de derivaci\xF3n:**
"Entiendo tu situaci\xF3n. Perm\xEDteme conectarte con un supervisor que te podr\xE1 ayudar mejor. \xBFMe compartes tu n\xFAmero de contacto?"

---

# HORARIOS Y DISPONIBILIDAD

## Horario de atenci\xF3n:
- **Lunes a Viernes**: 8:00 AM - 6:00 PM
- **S\xE1bados**: 8:00 AM - 1:00 PM
- **Domingos**: Cerrado

**Mensaje fuera de horario:**
"\xA1Hola! Gracias por contactar a CONSTROAD \u{1F60A}. Te escribo fuera de nuestro horario de atenci\xF3n (Lunes a Viernes 8 AM - 6 PM, S\xE1bados 8 AM - 1 PM). Te responder\xE9 en cuanto abramos ma\xF1ana. \xA1Que tengas excelente [noche/fin de semana]!"

---

# FLUJO CONVERSACIONAL

## Fase 1: SALUDO Y APERTURA

"\xA1Hola! Soy Mar\xEDa de CONSTROAD \u{1F44B} \xBFEn qu\xE9 te puedo ayudar hoy? Trabajamos en venta de asfalto, colocaci\xF3n, transporte y fabricaci\xF3n de mezclas."

## Fase 2: IDENTIFICACI\xD3N DEL SERVICIO

Escucha y confirma: "Perfecto, veo que necesitas [servicio]. Te voy a hacer algunas preguntas para que el equipo te prepare la mejor cotizaci\xF3n."

## Fase 3: RECOPILACI\xD3N DE INFORMACI\xD3N

- 2-3 preguntas m\xE1ximo por mensaje
- Pregunta lo m\xE1s relevante primero
- Adapta seg\xFAn las respuestas
- Confirma informaci\xF3n importante

## Fase 4: RESUMEN Y CONFIRMACI\xD3N

"Perfecto, d\xE9jame confirmar que tengo todo claro: \u2705 [Resumen]. \xBFEs correcto? \xBFAlgo m\xE1s?"

## Fase 5: CIERRE

"\xA1Excelente! Con esta informaci\xF3n nuestro equipo te preparar\xE1 una cotizaci\xF3n. Un asesor se contactar\xE1 en las pr\xF3ximas 2 horas. \xBFTe parece?"

---

# RECUERDA:

Eres Mar\xEDa, eres humana, eres emp\xE1tica, eres experta, y est\xE1s aqu\xED para AYUDAR. No solo recopiles datos, crea una conexi\xF3n con el cliente. S\xE9 natural, s\xE9 c\xE1lida, s\xE9 profesional.`;
function getUserContextPrompt(conversation) {
  const progress = getProgressSummary(conversation);
  const recentMessages = conversation.messageHistory.slice(-6).map((m) => `${m.role === "user" ? "Cliente" : "T\xFA"}: ${m.content}`).join("\n");
  return `
## CONTEXTO DE LA CONVERSACI\xD3N ACTUAL:

**Cliente:** ${conversation.chatId}
**Servicio identificado:** ${conversation.service || "No identificado a\xFAn"}
**Estado:** ${conversation.state}

**Informaci\xF3n recopilada:**
${JSON.stringify(conversation.collectedData, null, 2)}

**Progreso:** ${progress}

**\xDAltimos mensajes:**
${recentMessages}

---

Bas\xE1ndote en este contexto, responde al \xFAltimo mensaje del cliente de manera natural y contin\xFAa recopilando la informaci\xF3n que falta. Recuerda: \xA1Eres Mar\xEDa! S\xE9 natural, emp\xE1tica y profesional.
`;
}
function getProgressSummary(conversation) {
  const data = conversation.collectedData;
  const service = conversation.service;
  if (!service) return "A\xFAn no se identific\xF3 el servicio";
  const required = getRequiredFields(service);
  const collected = Object.keys(data).filter((k) => data[k]).length;
  const total = required.length;
  return `${collected}/${total} datos recopilados`;
}
function getRequiredFields(service) {
  const fields = {
    venta: ["tipoAsfalto", "espesor", "ubicacion", "cantidad"],
    colocacion: ["espesor", "ubicacion", "area", "imprimacion", "tipoTerreno"],
    transporte: ["puntoCarga", "puntoDescarga", "tipoAsfalto", "cantidad"],
    fabricacion: ["nombreContacto", "telefono"]
  };
  return fields[service] || [];
}

// src/whatsapp/ai-agent/agent.service.ts
var AgentService = class {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  async generateResponse(conversation, userMessage) {
    try {
      logger_default.debug(`Generating response for conversation ${conversation.chatId}`);
      const messages = this.prepareMessages(conversation, userMessage);
      const response = await this.client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: SYSTEM_PROMPT + "\n\n" + getUserContextPrompt(conversation),
        messages
      });
      const assistantMessage = response.content[0].type === "text" ? response.content[0].text : "";
      if (!assistantMessage) {
        throw new Error("No text in response from Claude");
      }
      const analysis = this.analyzeResponse(assistantMessage, conversation);
      logger_default.debug(
        `Response generated. Next state: ${analysis.nextState}, Handoff: ${analysis.shouldHandoff}`
      );
      return {
        text: assistantMessage,
        nextState: analysis.nextState,
        shouldHandoff: analysis.shouldHandoff
      };
    } catch (error) {
      logger_default.error("Error calling Claude API:", error);
      throw error;
    }
  }
  prepareMessages(conversation, newMessage) {
    const recentMessages = conversation.messageHistory.slice(-10);
    const messages = recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
    messages.push({
      role: "user",
      content: newMessage
    });
    return messages;
  }
  analyzeResponse(text, conversation) {
    const handoffKeywords = [
      "conectarte con un supervisor",
      "derivar",
      "hablar con un especialista",
      "ingeniero especializado",
      "perm\xEDteme conectarte",
      "d\xE9jame conectarte"
    ];
    const shouldHandoff = handoffKeywords.some(
      (keyword) => text.toLowerCase().includes(keyword)
    );
    const completionKeywords = [
      "con esta informaci\xF3n",
      "te contactar\xE1",
      "preparar\xE1 una cotizaci\xF3n",
      "pr\xF3ximas 2 horas"
    ];
    const isComplete = completionKeywords.some(
      (keyword) => text.toLowerCase().includes(keyword)
    );
    let nextState = conversation.state;
    if (shouldHandoff) {
      nextState = "waiting_human";
    } else if (isComplete) {
      nextState = "closed";
    }
    return { nextState, shouldHandoff };
  }
};
var agent_service_default = new AgentService();

// src/whatsapp/ai-agent/conversation.manager.ts
import path4 from "path";

// src/storage/json.store.ts
var import_fs_extra = __toESM(require_lib(), 1);
import path3 from "path";
var JsonStore = class {
  constructor(options) {
    this.baseDir = options.baseDir;
    this.autoBackup = options.autoBackup ?? true;
  }
  async get(key) {
    try {
      const filePath = path3.join(this.baseDir, `${key}.json`);
      const exists = await import_fs_extra.default.pathExists(filePath);
      if (!exists) {
        return null;
      }
      const data = await import_fs_extra.default.readJSON(filePath);
      return data;
    } catch (error) {
      logger_default.error(`Error reading ${key} from store:`, error);
      return null;
    }
  }
  async set(key, value) {
    try {
      const filePath = path3.join(this.baseDir, `${key}.json`);
      await import_fs_extra.default.ensureDir(path3.dirname(filePath));
      if (this.autoBackup && await import_fs_extra.default.pathExists(filePath)) {
        const backupPath = `${filePath}.backup`;
        await import_fs_extra.default.copy(filePath, backupPath);
      }
      const tempPath = `${filePath}.tmp`;
      await import_fs_extra.default.writeJSON(tempPath, value, { spaces: 2 });
      await import_fs_extra.default.move(tempPath, filePath, { overwrite: true });
      logger_default.debug(`Successfully wrote ${key} to store`);
    } catch (error) {
      logger_default.error(`Error writing ${key} to store:`, error);
      throw error;
    }
  }
  async delete(key) {
    try {
      const filePath = path3.join(this.baseDir, `${key}.json`);
      if (await import_fs_extra.default.pathExists(filePath)) {
        await import_fs_extra.default.remove(filePath);
        logger_default.debug(`Successfully deleted ${key} from store`);
      }
    } catch (error) {
      logger_default.error(`Error deleting ${key} from store:`, error);
      throw error;
    }
  }
  async getAllKeys() {
    try {
      const files = await import_fs_extra.default.readdir(this.baseDir);
      return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
    } catch (error) {
      logger_default.error("Error reading keys from store:", error);
      return [];
    }
  }
  async clear() {
    try {
      await import_fs_extra.default.emptyDir(this.baseDir);
      logger_default.debug("Store cleared");
    } catch (error) {
      logger_default.error("Error clearing store:", error);
      throw error;
    }
  }
  async exists(key) {
    const filePath = path3.join(this.baseDir, `${key}.json`);
    return await import_fs_extra.default.pathExists(filePath);
  }
};
var json_store_default = JsonStore;

// src/whatsapp/ai-agent/conversation.manager.ts
var ConversationManager = class {
  constructor() {
    this.conversationsDir = path4.join(config.whatsapp.sessionDir, "../conversations");
    this.store = new json_store_default({
      baseDir: this.conversationsDir,
      autoBackup: true
    });
  }
  async getOrCreate(chatId, sessionPhone) {
    const key = this.getConversationKey(sessionPhone, chatId);
    const existing = await this.store.get(key);
    if (existing) {
      return existing;
    }
    const conversation = {
      chatId,
      phoneNumber: this.extractPhoneNumber(chatId),
      sessionPhone,
      state: "active",
      service: null,
      collectedData: {},
      messageHistory: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastMessageAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.save(conversation);
    logger_default.info(`Created new conversation: ${key}`);
    return conversation;
  }
  async save(conversation) {
    try {
      const key = this.getConversationKey(
        conversation.sessionPhone,
        conversation.chatId
      );
      conversation.lastMessageAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.store.set(key, conversation);
      logger_default.debug(`Conversation saved: ${key}`);
    } catch (error) {
      logger_default.error("Error saving conversation:", error);
      throw error;
    }
  }
  async get(chatId, sessionPhone) {
    const key = this.getConversationKey(sessionPhone, chatId);
    return await this.store.get(key);
  }
  async delete(chatId, sessionPhone) {
    const key = this.getConversationKey(sessionPhone, chatId);
    await this.store.delete(key);
    logger_default.debug(`Conversation deleted: ${key}`);
  }
  async getAllForSession(sessionPhone) {
    const keys = await this.store.getAllKeys();
    const conversations = [];
    for (const key of keys) {
      if (key.startsWith(`${sessionPhone}:`)) {
        const conv = await this.store.get(key);
        if (conv) {
          conversations.push(conv);
        }
      }
    }
    return conversations;
  }
  async closeConversation(chatId, sessionPhone) {
    const conversation = await this.get(chatId, sessionPhone);
    if (conversation) {
      conversation.state = "closed";
      await this.save(conversation);
      logger_default.info(`Conversation closed: ${chatId}`);
    }
  }
  getConversationKey(sessionPhone, chatId) {
    return `${sessionPhone}:${chatId}`;
  }
  extractPhoneNumber(chatId) {
    return chatId.replace(/@[sg]\.whatsapp\.net|@g\.us/, "");
  }
};
var conversation_manager_default = new ConversationManager();

// src/utils/retry.ts
async function retry(fn, maxAttempts = 3, delayMs = 1e3, multiplier = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger_default.warn(`Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);
      if (attempt < maxAttempts) {
        const delay2 = delayMs * Math.pow(multiplier, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay2));
      }
    }
  }
  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`);
}
function calculateTypingDelay(text) {
  const wordsPerMinute = 40;
  const words = text.split(" ").length;
  const baseTime = words / wordsPerMinute * 60 * 1e3;
  const variability = 0.2;
  const delay2 = baseTime * (1 + (Math.random() - 0.5) * variability);
  return Math.min(Math.max(delay2, 1e3), 8e3);
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/whatsapp/ai-agent/typing-simulator.ts
var TypingSimulator = class {
  /**
   * Simula el tiempo que tardaría una persona escribiendo el texto
   * @param text Texto a "escribir"
   * @returns Promesa que se resuelve después del tiempo simulado
   */
  async simulateTyping(text) {
    const delayMs = calculateTypingDelay(text);
    logger_default.debug(`Simulating typing delay: ${delayMs}ms for ${text.length} chars`);
    await delay(delayMs);
  }
  /**
   * Calcula el delay de escritura sin esperar
   * @param text Texto a evaluar
   * @returns Delay en milisegundos
   */
  getTypingDelay(text) {
    return calculateTypingDelay(text);
  }
};
var typing_simulator_default = new TypingSimulator();

// src/utils/validators.ts
import Joi from "joi";
function validateCronExpression(cron2) {
  const cronRegex = /^((\d+,)*\d+|\*)(\/\d+)?( ((\d+,)*\d+|\*)(\/\d+)?){4}$/;
  return cronRegex.test(cron2);
}
function validateCronJob(data) {
  const schema = Joi.object({
    name: Joi.string().required().min(3).max(100),
    url: Joi.string().required().uri(),
    cronExpression: Joi.string().required().custom((value, helpers) => {
      if (!validateCronExpression(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }).messages({ "any.invalid": "Expresi\xF3n cron inv\xE1lida" }),
    company: Joi.string().valid("constroad", "altavia").required(),
    isActive: Joi.boolean().default(true),
    timeout: Joi.number().default(3e4).min(5e3).max(3e5),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().default(3).min(0).max(10),
      backoffMultiplier: Joi.number().default(2).min(1).max(5)
    })
  });
  try {
    const { error, value } = schema.validate(data, { abortEarly: false });
    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message
      }));
      return { valid: false, errors };
    }
    return { valid: true };
  } catch (err) {
    logger_default.error("Validation error:", err);
    return { valid: false };
  }
}
function validateMessage(message) {
  return message && typeof message === "object" && (message.conversation || message.extendedTextMessage?.text);
}

// src/whatsapp/ai-agent/message.listener.ts
var MessageListener = class {
  constructor() {
    this.activeConversations = /* @__PURE__ */ new Map();
  }
  async handleIncomingMessage(message, sessionPhone, whatsAppClient) {
    try {
      if (message.key.fromMe) {
        return;
      }
      if (!validateMessage(message.message)) {
        logger_default.debug(`Skipping non-text message from ${message.key.remoteJid}`);
        return;
      }
      const chatId = message.key.remoteJid;
      const messageText = message.message?.conversation || message.message?.extendedTextMessage?.text || "";
      if (!messageText.trim()) {
        return;
      }
      const isGroup = chatId.endsWith("@g.us");
      if (isGroup && !this.isGroupEnabled(chatId)) {
        logger_default.debug(`Group ${chatId} not enabled for bot`);
        return;
      }
      logger_default.info(
        `Incoming message from ${chatId} (session: ${sessionPhone}): ${messageText.substring(0, 50)}`
      );
      const conversation = await conversation_manager_default.getOrCreate(chatId, sessionPhone);
      if (conversation.state === "waiting_human") {
        await this.notifyHumanAgent(conversation, messageText);
        return;
      }
      conversation.messageHistory.push({
        role: "user",
        content: messageText,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      await this.processWithAI(conversation, messageText, whatsAppClient);
    } catch (error) {
      logger_default.error("Error handling incoming message:", error);
    }
  }
  async processWithAI(conversation, message, whatsAppClient) {
    try {
      await whatsAppClient.sendPresenceUpdate("composing", conversation.chatId);
      const response = await agent_service_default.generateResponse(conversation, message);
      await typing_simulator_default.simulateTyping(response.text);
      await whatsAppClient.sendMessage(conversation.chatId, {
        text: response.text
      });
      logger_default.info(
        `Response sent to ${conversation.chatId}: ${response.text.substring(0, 50)}`
      );
      conversation.messageHistory.push({
        role: "assistant",
        content: response.text,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      conversation.lastMessageAt = (/* @__PURE__ */ new Date()).toISOString();
      if (response.nextState) {
        conversation.state = response.nextState;
      }
      await conversation_manager_default.save(conversation);
      await whatsAppClient.sendPresenceUpdate("paused", conversation.chatId);
    } catch (error) {
      logger_default.error("Error processing message with AI:", error);
      await this.sendErrorMessage(conversation.chatId, whatsAppClient);
    }
  }
  isGroupEnabled(groupId) {
    return true;
  }
  async notifyHumanAgent(conversation, message) {
    logger_default.info(
      `New message for human agent in conversation ${conversation.chatId}: ${message}`
    );
  }
  async sendErrorMessage(chatId, whatsAppClient) {
    try {
      await whatsAppClient.sendMessage(chatId, {
        text: "Disculpa, tuve un problema procesando tu mensaje. \xBFPodr\xEDas repetirlo?"
      });
    } catch (error) {
      logger_default.error("Error sending error message:", error);
    }
  }
};
var message_listener_default = new MessageListener();

// src/whatsapp/baileys/connection.manager.ts
var ConnectionManager = class {
  constructor() {
    this.connections = /* @__PURE__ */ new Map();
    this.qrCodes = /* @__PURE__ */ new Map();
  }
  async createConnection(sessionPhone) {
    try {
      logger_default.info(`Creating WhatsApp connection for ${sessionPhone}`);
      if (this.connections.has(sessionPhone)) {
        logger_default.debug(`Connection already exists for ${sessionPhone}`);
        return this.connections.get(sessionPhone);
      }
      const sessionDir = path5.join(config.whatsapp.sessionDir, sessionPhone);
      await import_fs_extra2.default.ensureDir(sessionDir);
      const { state, saveCreds } = await this.loadOrCreateState(sessionDir);
      const socket = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        syncFullHistory: false,
        shouldIgnoreJid: (jid) => /status@broadcast/.test(jid)
      });
      this.connections.set(sessionPhone, socket);
      this.setupListeners(socket, sessionPhone, sessionDir, saveCreds);
      return socket;
    } catch (error) {
      logger_default.error(`Error creating connection for ${sessionPhone}:`, error);
      throw error;
    }
  }
  setupListeners(socket, sessionPhone, sessionDir, saveCreds) {
    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        logger_default.info(`QR Code for ${sessionPhone}`, qr);
        this.qrCodes.set(sessionPhone, qr);
      }
      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = reason === DisconnectReason.connectionClosed;
        logger_default.warn(`Connection closed for ${sessionPhone}, reason: ${reason}`);
        if (shouldReconnect) {
          if (config.whatsapp.autoReconnect) {
            logger_default.info(`Auto-reconnecting ${sessionPhone}...`);
            setTimeout(() => {
              this.connections.delete(sessionPhone);
              this.createConnection(sessionPhone);
            }, 3e3);
          }
        } else {
          logger_default.error(`Cannot reconnect ${sessionPhone}, reconnecting...`);
          this.connections.delete(sessionPhone);
        }
      } else if (connection === "open") {
        logger_default.info(`\u2705 Connection established for ${sessionPhone}`);
        this.qrCodes.delete(sessionPhone);
      }
    });
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("messages.upsert", async (m) => {
      for (const message of m.messages) {
        await message_listener_default.handleIncomingMessage(message, sessionPhone, socket);
      }
    });
  }
  async loadOrCreateState(sessionDir) {
    const credPath = path5.join(sessionDir, "creds.json");
    const keysPath = path5.join(sessionDir, "keys.json");
    let creds = null;
    let keys = {};
    if (await import_fs_extra2.default.pathExists(credPath)) {
      creds = await import_fs_extra2.default.readJSON(credPath);
      logger_default.debug(`Loaded existing credentials from ${sessionDir}`);
    }
    if (await import_fs_extra2.default.pathExists(keysPath)) {
      keys = await import_fs_extra2.default.readJSON(keysPath);
    }
    const saveCreds = async () => {
      await import_fs_extra2.default.ensureDir(sessionDir);
      await import_fs_extra2.default.writeJSON(credPath, creds, { spaces: 2 });
      await import_fs_extra2.default.writeJSON(keysPath, keys, { spaces: 2 });
      logger_default.debug(`Saved credentials for ${sessionDir}`);
    };
    const state = {
      creds: creds || {},
      keys: {
        get: (type, jids) => {
          const data = {};
          jids.forEach((jid) => {
            data[jid] = keys[jid] || null;
          });
          return data;
        },
        set: async (data) => {
          Object.assign(keys, data);
          await saveCreds();
        }
      }
    };
    return { state, saveCreds };
  }
  async disconnect(sessionPhone) {
    try {
      const socket = this.connections.get(sessionPhone);
      if (socket) {
        await socket.end({
          cancel: true
        });
        this.connections.delete(sessionPhone);
        logger_default.info(`Disconnected ${sessionPhone}`);
      }
    } catch (error) {
      logger_default.error(`Error disconnecting ${sessionPhone}:`, error);
      this.connections.delete(sessionPhone);
    }
  }
  async disconnectAll() {
    for (const [sessionPhone] of this.connections) {
      await this.disconnect(sessionPhone);
    }
  }
  getConnection(sessionPhone) {
    return this.connections.get(sessionPhone);
  }
  getAllConnections() {
    return this.connections;
  }
  getQRCode(sessionPhone) {
    return this.qrCodes.get(sessionPhone);
  }
  isConnected(sessionPhone) {
    const socket = this.connections.get(sessionPhone);
    return socket && socket.user !== void 0;
  }
  getConnectionStatus(sessionPhone) {
    const socket = this.connections.get(sessionPhone);
    if (!socket) return "disconnected";
    if (socket.user) return "connected";
    if (this.qrCodes.has(sessionPhone)) return "waiting_qr";
    return "connecting";
  }
};
var connection_manager_default = new ConnectionManager();

// src/api/controllers/session.controller.ts
async function createSession(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    logger_default.info(`Creating session for ${phoneNumber}`);
    const socket = await connection_manager_default.createConnection(phoneNumber);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        phoneNumber,
        status: connection_manager_default.getConnectionStatus(phoneNumber),
        qr: connection_manager_default.getQRCode(phoneNumber)
      }
    });
  } catch (error) {
    next(error);
  }
}
async function getSessionStatus(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const status = connection_manager_default.getConnectionStatus(phoneNumber);
    const qr = connection_manager_default.getQRCode(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        phoneNumber,
        status,
        isConnected: connection_manager_default.isConnected(phoneNumber),
        ...qr && { qr }
      }
    });
  } catch (error) {
    next(error);
  }
}
async function disconnectSession(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await connection_manager_default.disconnect(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} disconnected`
    });
  } catch (error) {
    next(error);
  }
}
async function getAllSessions(req, res, next) {
  try {
    const connections = connection_manager_default.getAllConnections();
    const sessions = Array.from(connections.keys()).map((phone) => ({
      phoneNumber: phone,
      status: connection_manager_default.getConnectionStatus(phone),
      isConnected: connection_manager_default.isConnected(phone)
    }));
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: sessions.length,
        sessions
      }
    });
  } catch (error) {
    next(error);
  }
}

// src/api/routes/session.routes.ts
var router = Router();
router.post("/", sessionLimiter, createSession);
router.get("/:phoneNumber/status", getSessionStatus);
router.delete("/:phoneNumber", disconnectSession);
router.get("/", getAllSessions);
var session_routes_default = router;

// src/api/routes/jobs.routes.ts
import { Router as Router2 } from "express";

// src/jobs/scheduler.service.ts
import cron from "node-cron";
import axios from "axios";
import path6 from "path";
var JobScheduler = class {
  constructor() {
    this.scheduledTasks = /* @__PURE__ */ new Map();
    this.jobsFile = config.jobs.storageFile;
    this.store = new json_store_default({
      baseDir: path6.dirname(this.jobsFile),
      autoBackup: true
    });
  }
  async initialize() {
    try {
      logger_default.info("Initializing Job Scheduler...");
      const jobs = await this.loadJobs();
      for (const job of jobs) {
        if (job.isActive) {
          await this.scheduleJob(job);
        }
      }
      logger_default.info(`Loaded and scheduled ${jobs.length} cron jobs`);
    } catch (error) {
      logger_default.error("Error initializing Job Scheduler:", error);
    }
  }
  async createJob(jobData) {
    try {
      if (!validateCronExpression(jobData.cronExpression)) {
        throw new Error("Invalid cron expression");
      }
      const job = {
        id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...jobData,
        metadata: {
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          failureCount: 0
        }
      };
      await this.saveJob(job);
      if (job.isActive) {
        await this.scheduleJob(job);
      }
      logger_default.info(`Created job: ${job.id}`);
      return job;
    } catch (error) {
      logger_default.error("Error creating job:", error);
      throw error;
    }
  }
  async updateJob(id, updates) {
    try {
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === id);
      if (jobIndex === -1) {
        throw new Error(`Job ${id} not found`);
      }
      const job = jobs[jobIndex];
      const updated = {
        ...job,
        ...updates,
        id: job.id,
        // No actualizar ID
        metadata: {
          ...job.metadata,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      };
      const scheduled = this.scheduledTasks.get(id);
      if (scheduled) {
        scheduled.task.stop();
        this.scheduledTasks.delete(id);
      }
      jobs[jobIndex] = updated;
      await this.saveAllJobs(jobs);
      if (updated.isActive) {
        await this.scheduleJob(updated);
      }
      logger_default.info(`Updated job: ${id}`);
      return updated;
    } catch (error) {
      logger_default.error("Error updating job:", error);
      throw error;
    }
  }
  async deleteJob(id) {
    try {
      const scheduled = this.scheduledTasks.get(id);
      if (scheduled) {
        scheduled.task.stop();
        this.scheduledTasks.delete(id);
      }
      const jobs = await this.loadJobs();
      const filtered = jobs.filter((j) => j.id !== id);
      await this.saveAllJobs(filtered);
      logger_default.info(`Deleted job: ${id}`);
    } catch (error) {
      logger_default.error("Error deleting job:", error);
      throw error;
    }
  }
  async runJobNow(id) {
    try {
      const jobs = await this.loadJobs();
      const job = jobs.find((j) => j.id === id);
      if (!job) {
        throw new Error(`Job ${id} not found`);
      }
      logger_default.info(`Running job manually: ${job.name}`);
      await this.executeJob(job);
    } catch (error) {
      logger_default.error(`Error running job ${id}:`, error);
      throw error;
    }
  }
  async getJob(id) {
    const jobs = await this.loadJobs();
    return jobs.find((j) => j.id === id) || null;
  }
  async getAllJobs() {
    return await this.loadJobs();
  }
  async getJobsByCompany(company) {
    const jobs = await this.loadJobs();
    return jobs.filter((j) => j.company === company);
  }
  async scheduleJob(job) {
    try {
      if (!validateCronExpression(job.cronExpression)) {
        throw new Error(`Invalid cron expression for job ${job.id}`);
      }
      const task = cron.schedule(job.cronExpression, async () => {
        await this.executeJob(job);
      });
      this.scheduledTasks.set(job.id, { task, data: job });
      logger_default.debug(`Scheduled job: ${job.id} - ${job.name}`);
    } catch (error) {
      logger_default.error(`Error scheduling job ${job.id}:`, error);
    }
  }
  async executeJob(job) {
    try {
      const startTime = Date.now();
      logger_default.info(`Executing job: ${job.name} (${job.id})`);
      await retry(
        async () => {
          const response = await axios.post(job.url, {
            jobId: job.id,
            jobName: job.name,
            company: job.company,
            executedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          return response;
        },
        job.retryPolicy.maxRetries,
        1e3,
        job.retryPolicy.backoffMultiplier
      );
      const duration = Date.now() - startTime;
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === job.id);
      if (jobIndex !== -1) {
        jobs[jobIndex].metadata.lastRun = (/* @__PURE__ */ new Date()).toISOString();
        jobs[jobIndex].metadata.failureCount = 0;
        await this.saveAllJobs(jobs);
      }
      logger_default.info(`\u2705 Job completed: ${job.name} (${duration}ms)`);
    } catch (error) {
      logger_default.error(`\u274C Job failed: ${job.name}`, error);
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === job.id);
      if (jobIndex !== -1) {
        jobs[jobIndex].metadata.failureCount++;
        jobs[jobIndex].metadata.lastError = error.message;
        await this.saveAllJobs(jobs);
      }
    }
  }
  async loadJobs() {
    try {
      const filename = path6.basename(this.jobsFile);
      const key = filename.replace(".json", "");
      const data = await this.store.get(key);
      return data?.jobs || [];
    } catch (error) {
      logger_default.warn("Error loading jobs, returning empty array:", error);
      return [];
    }
  }
  async saveJob(job) {
    const jobs = await this.loadJobs();
    const index = jobs.findIndex((j) => j.id === job.id);
    if (index >= 0) {
      jobs[index] = job;
    } else {
      jobs.push(job);
    }
    await this.saveAllJobs(jobs);
  }
  async saveAllJobs(jobs) {
    const filename = path6.basename(this.jobsFile);
    const key = filename.replace(".json", "");
    await this.store.set(key, {
      version: "1.0",
      lastModified: (/* @__PURE__ */ new Date()).toISOString(),
      jobs
    });
  }
  async shutdown() {
    for (const [, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }
    this.scheduledTasks.clear();
    logger_default.info("Job Scheduler shut down");
  }
};
var scheduler_service_default = new JobScheduler();

// src/api/controllers/jobs.controller.ts
async function createJob(req, res, next) {
  try {
    const validation = validateCronJob(req.body);
    if (!validation.valid) {
      const error = new Error("Validation failed");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = validation.errors;
      return next(error);
    }
    const job = await scheduler_service_default.createJob(req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
}
async function updateJob(req, res, next) {
  try {
    const { id } = req.params;
    const job = await scheduler_service_default.updateJob(id, req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
}
async function deleteJob(req, res, next) {
  try {
    const { id } = req.params;
    await scheduler_service_default.deleteJob(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Job ${id} deleted`
    });
  } catch (error) {
    next(error);
  }
}
async function getJob(req, res, next) {
  try {
    const { id } = req.params;
    const job = await scheduler_service_default.getJob(id);
    if (!job) {
      const error = new Error("Job not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
}
async function getAllJobs(req, res, next) {
  try {
    const { company } = req.query;
    let jobs;
    if (company && (company === "constroad" || company === "altavia")) {
      jobs = await scheduler_service_default.getJobsByCompany(company);
    } else {
      jobs = await scheduler_service_default.getAllJobs();
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: jobs.length,
        jobs
      }
    });
  } catch (error) {
    next(error);
  }
}
async function runJobNow(req, res, next) {
  try {
    const { id } = req.params;
    await scheduler_service_default.runJobNow(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Job ${id} executed`
    });
  } catch (error) {
    next(error);
  }
}

// src/api/routes/jobs.routes.ts
var router2 = Router2();
router2.post("/", jobsLimiter, createJob);
router2.get("/", getAllJobs);
router2.get("/:id", getJob);
router2.patch("/:id", updateJob);
router2.delete("/:id", deleteJob);
router2.post("/:id/run", runJobNow);
var jobs_routes_default = router2;

// src/api/routes/message.routes.ts
import { Router as Router3 } from "express";

// src/api/controllers/message.controller.ts
async function sendMessage(req, res, next) {
  try {
    const { sessionPhone, chatId, message } = req.body;
    if (!sessionPhone || !chatId || !message) {
      const error = new Error("sessionPhone, chatId, and message are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const socket = connection_manager_default.getConnection(sessionPhone);
    if (!socket) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await socket.sendMessage(chatId, { text: message });
    logger_default.info(`Message sent to ${chatId} via ${sessionPhone}`);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Message sent successfully"
    });
  } catch (error) {
    next(error);
  }
}
async function getConversation(req, res, next) {
  try {
    const { sessionPhone, chatId } = req.params;
    if (!sessionPhone || !chatId) {
      const error = new Error("sessionPhone and chatId are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const conversation = await conversation_manager_default.get(chatId, sessionPhone);
    if (!conversation) {
      const error = new Error("Conversation not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    next(error);
  }
}
async function getAllConversations(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    if (!sessionPhone) {
      const error = new Error("sessionPhone is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const conversations = await conversation_manager_default.getAllForSession(sessionPhone);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: conversations.length,
        conversations
      }
    });
  } catch (error) {
    next(error);
  }
}
async function closeConversation(req, res, next) {
  try {
    const { sessionPhone, chatId } = req.params;
    if (!sessionPhone || !chatId) {
      const error = new Error("sessionPhone and chatId are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await conversation_manager_default.closeConversation(chatId, sessionPhone);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Conversation closed"
    });
  } catch (error) {
    next(error);
  }
}

// src/api/routes/message.routes.ts
var router3 = Router3();
router3.post("/", messageLimiter, sendMessage);
router3.get("/:sessionPhone/:chatId", getConversation);
router3.get("/:sessionPhone", getAllConversations);
router3.delete("/:sessionPhone/:chatId", closeConversation);
var message_routes_default = router3;

// src/api/routes/pdf.routes.ts
import { Router as Router4 } from "express";

// src/pdf/generator.service.ts
var import_fs_extra3 = __toESM(require_lib(), 1);
import puppeteer from "puppeteer";
import Handlebars from "handlebars";
import path7 from "path";
import { randomUUID } from "crypto";
var PDFGenerator = class {
  constructor() {
    this.browser = null;
    this.templatesDir = config.pdf.templatesDir;
    this.uploadsDir = config.pdf.uploadsDir;
  }
  async initialize() {
    try {
      logger_default.info("Initializing PDF Generator...");
      await import_fs_extra3.default.ensureDir(this.templatesDir);
      await import_fs_extra3.default.ensureDir(this.uploadsDir);
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
      logger_default.info("PDF Generator initialized");
    } catch (error) {
      logger_default.error("Error initializing PDF Generator:", error);
      throw error;
    }
  }
  async generatePDF(request) {
    try {
      if (!this.browser) {
        throw new Error("PDF Generator not initialized");
      }
      logger_default.info(`Generating PDF from template: ${request.templateId}`);
      const template = await this.loadTemplate(request.templateId);
      const compiled = Handlebars.compile(template);
      const html = compiled(request.data);
      const filename = request.filename || `pdf-${randomUUID()}.pdf`;
      const filepath = path7.join(this.uploadsDir, filename);
      const page = await this.browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.pdf({
        path: filepath,
        format: "A4",
        margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" }
      });
      await page.close();
      logger_default.info(`PDF generated: ${filepath}`);
      return filepath;
    } catch (error) {
      logger_default.error("Error generating PDF:", error);
      throw error;
    }
  }
  async createTemplate(id, name, htmlContent) {
    try {
      const filepath = path7.join(this.templatesDir, `${id}.hbs`);
      await import_fs_extra3.default.ensureDir(path7.dirname(filepath));
      await import_fs_extra3.default.writeFile(filepath, htmlContent, "utf-8");
      logger_default.info(`Created PDF template: ${id}`);
    } catch (error) {
      logger_default.error("Error creating PDF template:", error);
      throw error;
    }
  }
  async loadTemplate(templateId) {
    try {
      const filepath = path7.join(this.templatesDir, `${templateId}.hbs`);
      if (!await import_fs_extra3.default.pathExists(filepath)) {
        throw new Error(`Template not found: ${templateId}`);
      }
      return await import_fs_extra3.default.readFile(filepath, "utf-8");
    } catch (error) {
      logger_default.error("Error loading template:", error);
      throw error;
    }
  }
  async listTemplates() {
    try {
      const files = await import_fs_extra3.default.readdir(this.templatesDir);
      return files.filter((f) => f.endsWith(".hbs")).map((f) => f.replace(".hbs", ""));
    } catch (error) {
      logger_default.error("Error listing templates:", error);
      return [];
    }
  }
  async deleteTemplate(templateId) {
    try {
      const filepath = path7.join(this.templatesDir, `${templateId}.hbs`);
      if (await import_fs_extra3.default.pathExists(filepath)) {
        await import_fs_extra3.default.remove(filepath);
        logger_default.info(`Deleted template: ${templateId}`);
      }
    } catch (error) {
      logger_default.error("Error deleting template:", error);
      throw error;
    }
  }
  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      logger_default.info("PDF Generator shut down");
    }
  }
};
var generator_service_default = new PDFGenerator();

// src/api/controllers/pdf.controller.ts
async function generatePDF(req, res, next) {
  try {
    const { templateId, data, filename } = req.body;
    if (!templateId || !data) {
      const error = new Error("templateId and data are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const filepath = await generator_service_default.generatePDF({
      templateId,
      data,
      filename
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        filepath,
        filename: filename || `pdf-${Date.now()}.pdf`
      }
    });
  } catch (error) {
    next(error);
  }
}
async function createTemplate(req, res, next) {
  try {
    const { id, name, htmlContent } = req.body;
    if (!id || !name || !htmlContent) {
      const error = new Error("id, name, and htmlContent are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await generator_service_default.createTemplate(id, name, htmlContent);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: `Template ${id} created`
    });
  } catch (error) {
    next(error);
  }
}
async function listTemplates(req, res, next) {
  try {
    const templates = await generator_service_default.listTemplates();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: templates.length,
        templates
      }
    });
  } catch (error) {
    next(error);
  }
}
async function deleteTemplate(req, res, next) {
  try {
    const { templateId } = req.params;
    if (!templateId) {
      const error = new Error("templateId is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await generator_service_default.deleteTemplate(templateId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Template ${templateId} deleted`
    });
  } catch (error) {
    next(error);
  }
}

// src/api/routes/pdf.routes.ts
var router4 = Router4();
router4.post("/generate", generatePDF);
router4.post("/templates", createTemplate);
router4.get("/templates", listTemplates);
router4.delete("/templates/:templateId", deleteTemplate);
var pdf_routes_default = router4;

// src/index.ts
var app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(requestLogger);
app.use(apiLimiter);
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    environment: config.nodeEnv
  });
});
app.use("/api/sessions", session_routes_default);
app.use("/api/jobs", jobs_routes_default);
app.use("/api/messages", message_routes_default);
app.use("/api/pdf", pdf_routes_default);
app.get("/api/status", (req, res) => {
  const connections = connection_manager_default.getAllConnections();
  res.status(200).json({
    success: true,
    data: {
      activeSessions: connections.size,
      nodeEnv: config.nodeEnv,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
});
app.use(notFoundHandler);
app.use(errorHandler);
async function startServer() {
  try {
    logger_default.info("\u{1F680} Starting WhatsApp AI Agent Server...");
    logger_default.info("Initializing PDF Generator...");
    await generator_service_default.initialize();
    logger_default.info("Initializing Job Scheduler...");
    await scheduler_service_default.initialize();
    const server = app.listen(config.port, () => {
      logger_default.info(`\u2705 Server running on port ${config.port}`);
      logger_default.info(`\u{1F4CA} Environment: ${config.nodeEnv}`);
      logger_default.info(`\u{1F4C1} WhatsApp sessions dir: ${config.whatsapp.sessionDir}`);
    });
    const gracefulShutdown = async (signal) => {
      logger_default.info(`
\u{1F4F4} Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        logger_default.info("HTTP server closed");
        try {
          await connection_manager_default.disconnectAll();
          await scheduler_service_default.shutdown();
          await generator_service_default.shutdown();
          logger_default.info("\u2705 All services shut down successfully");
          process.exit(0);
        } catch (error) {
          logger_default.error("Error during shutdown:", error);
          process.exit(1);
        }
      });
      setTimeout(() => {
        logger_default.error("Forced shutdown due to timeout");
        process.exit(1);
      }, 3e4);
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("uncaughtException", (error) => {
      logger_default.error("Uncaught Exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", (reason, promise) => {
      logger_default.error("Unhandled Rejection at:", promise, "reason:", reason);
    });
  } catch (error) {
    logger_default.error("Failed to start server:", error);
    process.exit(1);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
var index_default = app;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
