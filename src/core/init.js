const { v4 } = require('uuid');
const WS = require('../tools/ws');
const Inquirer = require('../utils/inquirer');
const {
  LANG,
  CURRENCY,
  BUILD_COMMAND_DEFAULT,
  INSTALL_COMMAND_DEFAULT,
  START_COMMAND_DEFAULT,
  PORT_DEFAULT,
  CONFIG_EXCLUDE_DEFAULT,
  SIZE_INDEX_DEFAULT,
} = require('../utils/constants');
const { parseMessageCli, computeCostService, NODE_VERSIONS } = require('../types/interfaces');
const { readFileSync, existsSync, writeFileSync } = require('fs');
const { getConfigFilePath } = require('../utils/lib');
const Yaml = require('../utils/yaml');

const yaml = new Yaml();

/**
 * @typedef {import('../tools/ws').Options} Options
 * @typedef {import('../tools/ws').CommandOptions} CommandOptions
 * @typedef {import('../types/interfaces').WSMessageDataCli} WSMessageDataCli
 * @typedef {import('../types/interfaces').ConfigFile} ConfigFile
 * @typedef {import('../tools/ws').Session} Session
 */
/**
 * @template T
 * @typedef {import('../tools/ws').WSMessageCli<T>} WSMessageCli<T>
 */

const inquirer = new Inquirer();

module.exports = class Init extends WS {
  /**
   *
   * @param {Options} options
   */
  constructor(options) {
    super(options);
    /**
     * @type {ConfigFile['services']}
     */
    this.services = [];
    /**
     * @type {string}
     */
    this.configFile = getConfigFilePath();
    /**
     * @type {Options}
     */
    this.options = options;
    this.listener();
  }

  listener() {
    if (!this.conn) {
      return;
    }

    const connId = v4();
    const ws = this;
    this.conn.on('message', async (d) => {
      const rawMessage = /** @type {typeof parseMessageCli<any>} */ (parseMessageCli)(d.toString());
      if (rawMessage === null) {
        return;
      }
      const { type } = rawMessage;
      switch (type) {
        case 'deployData':
          await this.handleDeployData(rawMessage);
          break;
        default:
          await this.handleCommonMessages(connId, rawMessage);
      }
    });
  }

  /**
   * @param {WSMessageDataCli['deployData']['sizes'][0]} item
   * @param {Omit<WSMessageDataCli['deployData'], 'services'>} param1
   * @returns
   */
  getCostString(item, { sizes, baseCost, baseValue }) {
    const cost = computeCostService(item.name, {
      sizes,
      baseCost,
      baseValue,
    });
    if (!cost) {
      console.error(`"${item.name}" is not allowed here`);
      process.exit(1);
    }
    const { month, hour } = cost;
    return `${item.name} (${item.memory.name} RAM): ${month} ${CURRENCY}/month, ${hour} ${CURRENCY}/hour`;
  }

  /**
   *
   * @param {WSMessageCli<WSMessageDataCli['deployData']>} param0
   */
  async handleDeployData(param0) {
    const {
      data: { sizes, baseCost, baseValue, services },
    } = param0;

    console.info("It's adding service to the config file...");

    let install = '';
    /**
     * @type {string | undefined}
     */
    let build;
    let start = '';
    let version = '';
    let PORT = '';

    if (this.options.yes) {
      writeFileSync(
        this.configFile,
        yaml.stringify({
          services: [
            {
              name: 'node',
              version: NODE_VERSIONS[0],
              size: sizes[SIZE_INDEX_DEFAULT].name,
              commands: {
                install: INSTALL_COMMAND_DEFAULT,
                build: BUILD_COMMAND_DEFAULT,
                start: START_COMMAND_DEFAULT,
              },
              environment: {
                PORT: PORT_DEFAULT,
              },
            },
          ],
          exclude: CONFIG_EXCLUDE_DEFAULT,
        })
      );
      console.info('Project successfully initialized', this.configFile);
      process.exit(0);
    }

    const service = await inquirer.list(
      'Select service',
      services.map((item) => `${item.value} (${item.name})`),
      0
    );
    const size = await inquirer.list(
      'Select size of service',
      sizes.map((item) => this.getCostString(item, { sizes, baseCost, baseValue })),
      SIZE_INDEX_DEFAULT
    );

    if (service === 'node') {
      version = await inquirer.input('Specify NodeJS version', NODE_VERSIONS[0]);

      install = await inquirer.input('Specify "install" command', INSTALL_COMMAND_DEFAULT);

      const useBuild = await inquirer.confirm('Is needed to use "build" command?', true);

      if (useBuild) {
        build = await inquirer.input('Specify "build" command', BUILD_COMMAND_DEFAULT);
      }

      start = await inquirer.input('Specify "start" command', START_COMMAND_DEFAULT);

      PORT = await inquirer.input(
        'Specify required environment variable "PORT"',
        PORT_DEFAULT,
        (input) => {
          const num = parseInt(input, 10);
          return Number.isNaN(num) ? 'Port must be a number' : true;
        }
      );
    }
    this.services.push({
      name: service,
      size,
      version: parseInt(version, 10),
      commands: {
        install,
        build,
        start,
      },
      environment: {
        PORT: parseInt(PORT, 10),
      },
    });

    writeFileSync(
      this.configFile,
      yaml.stringify({ services: this.services, exclude: CONFIG_EXCLUDE_DEFAULT })
    );

    const addAnother = await inquirer.confirm('Do you want to add another service?', false);
    if (addAnother) {
      await this.handleDeployData(param0);
    } else {
      console.info('Project successfully initialized', this.configFile);
      process.exit(0);
    }
  }

  /**
   * @type {WS['handler']}
   */
  async handler({ connId }) {
    console.info('Starting init service script...');
    if (!existsSync(this.configFile)) {
      console.info('Config file is not found, creating...', this.configFile);
      /** @type {typeof this.sendMessage<WSMessageDataCli['getDeployData']>} */ this.sendMessage({
        token: this.token,
        type: 'getDeployData',
        message: '',
        data: null,
        lang: LANG,
        status: 'info',
      });
      return;
    }
    console.info('Config file is exists', this.configFile);
    const overwriteConf = await inquirer.confirm(
      'Do you want to overwrite the config file?',
      false
    );
    if (overwriteConf) {
      console.info('Config file will be overwrite');
      /** @type {typeof this.sendMessage<WSMessageDataCli['getDeployData']>} */ this.sendMessage({
        token: this.token,
        type: 'getDeployData',
        message: '',
        data: null,
        lang: LANG,
        status: 'info',
      });
      return;
    }
    console.info('This project has already been initialized');
    process.exit(0);
  }
};