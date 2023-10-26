// @ts-check
const { spawn } = require("child_process");
const { HOME_DIR, PACKAGE_NAME, DEBUG } = require("./constants");
const Console = require("console");
const path = require("path");

/**
 * @typedef {number | null} StatusCode
 */

/**
 * @typedef {{
 *  test?: boolean
 * }} Options
 */

const console = {
  /**
   *
   * @param  {...any} args
   * @returns {void}
   */
  log: (...args) => {
    if (DEBUG) {
      Console.log(...args);
    }
  },
  /**
   *
   * @param  {...any} args
   * @returns {void}
   */
  info: (...args) => {
    Console.info(...args);
  },
  /**
   *
   * @param  {...any} args
   * @returns {void}
   */
  warn: (...args) => {
    Console.warn(...args);
  },
  /**
   *
   * @param  {...any} args
   * @returns {void}
   */
  error: (...args) => {
    Console.error(...args);
  },
};

/**
 * @param {string} ex
 * @param {string[]} args
 * @param {{
 *  quiet?: boolean
 * }} options
 * @returns {Promise<StatusCode>}
 */
async function spawnCommand(ex, args, { quiet } = {}) {
  return new Promise((resolve) => {
    const command = spawn(ex, args);
    command.on("error", (e) => {
      console.error("Command failed", e);
    });
    command.stdout.on("data", (data) => {
      if (!quiet) {
        console.log(`stdout: ${data}`);
      }
    });

    command.stderr.on("data", (data) => {
      if (!quiet) {
        console.log(`stderr: ${data}`);
      }
    });

    command.on("close", (code) => {
      if (!quiet) {
        console.log(
          `command "${ex} ${args.join(" ")}" exited with code ${code}`
        );
      }
      resolve(code);
    });
  });
}

/**
 * @param {string} url
 * @returns {Promise<StatusCode>}
 */
async function openBrowser(url) {
  const start =
    process.platform == "darwin"
      ? "open"
      : process.platform == "win32"
      ? "start"
      : "xdg-open";
  return spawnCommand(start, [url]);
}

/**
 *
 * @param {string} postfix
 * @returns
 */
function getPackagePath(postfix = "") {
  return `${HOME_DIR}/.${PACKAGE_NAME}/${postfix}`;
}

/**
 *
 * @param {string} title
 * @param {{
 *  hidden?: boolean
 * }?} options
 * @returns {Promise<string>}
 */
async function readUserValue(title, options = {}) {
  const hidden = options ? options.hidden : false;
  return new Promise((resolve) => {
    let content = "";
    const stdin = process.stdin;
    stdin.setRawMode(true);
    process.stdout.write(title);

    stdin.resume();

    stdin.on("data", (d) => {
      const chunk = d.toLocaleString();
      const chunkJson = d.toJSON();
      const code = chunkJson.data[0];
      // Enter
      if (code === 13) {
        process.stdout.write("\n");
        resolve(content);
      }
      // Ctrl+c
      if (code === 3) {
        process.exit();
      }
      // Backspace
      if (code === 127) {
        content = content.substring(0, content.length - 1);
        if (!hidden) {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(title);
          process.stdout.write(content);
        }
        return;
      }
      if (!hidden) {
        process.stdout.write(chunk);
      }
      content += chunk;
    });
  });
}

function getPackage() {
  const cwd = process.cwd();
  const package = require(path.resolve(cwd, "package.json"));
  return package;
}

module.exports = {
  openBrowser,
  getPackagePath,
  readUserValue,
  console,
  getPackage,
};
