const { v4 } = require('uuid');
const WS = require('../tools/ws');
const Tar = require('../utils/tar');
const { getPackage, getTmpArchive, stdoutWriteStart } = require('../utils/lib');
const { createReadStream, statSync } = require('fs');
const { LANG } = require('../utils/constants');
const { parseMessageCli } = require('../types/interfaces');

/**
 * @typedef {import('../tools/ws').Options} Options
 * @typedef {import('../tools/ws').CommandOptions} CommandOptions
 * @typedef {import('../types/interfaces').WSMessageDataCli} WSMessageDataCli
 */

module.exports = class Login extends WS {
  /**
   *
   * @param {Options} options
   */
  constructor(options) {
    super(options);
    this.listener();
  }

  /**
   * @type {WS['listener']}
   */
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
        default:
          await this.handleCommonMessages(connId, rawMessage);
      }
    });
  }

  /**
   *
   * @param {number} size
   * @param {number} curSize
   * @returns {number}
   */
  calculatePercents(size, curSize) {
    const percent = (curSize / size) * 100;
    return parseInt(percent.toFixed(0), 10);
  }

  /**
   * @type {WS['handler']}
   */
  async handler({ connId }) {
    const pack = getPackage();
    console.info(`Starting deploy "${pack.name}" project`);
    const fileTar = getTmpArchive();
    const tar = new Tar();
    await tar.create({ fileList: ['./'], file: fileTar });
    const stats = statSync(fileTar);
    const { size } = stats;
    let curSize = 0;

    const rStream = createReadStream(fileTar);
    let num = 0;
    rStream.on('data', (chunk) => {
      /** @type {typeof this.sendMessage<WSMessageDataCli['upload']>} */ (this.sendMessage)({
        token: this.token,
        message: '',
        type: 'upload',
        data: {
          num,
          project: pack.name,
          last: false,
          chunk: new Uint8Array(Buffer.from(chunk)),
          options: null,
        },
        lang: LANG,
        status: 'info',
      });
      num++;
      curSize += chunk.length;
      stdoutWriteStart(
        `Uploading the project to the cloud: ${this.calculatePercents(size, curSize)}%`
      );
    });
    rStream.on('close', () => {
      /** @type {typeof this.sendMessage<WSMessageDataCli['upload']>} */ (this.sendMessage)({
        token: this.token,
        message: '',
        type: 'upload',
        data: {
          num,
          project: pack.name,
          last: true,
          chunk: new Uint8Array(),
          options: { serviceSize, serviceType },
        },
        lang: LANG,
        status: 'info',
      });
      stdoutWriteStart('');
      const percent = this.calculatePercents(size, curSize);
      console.info(`Project files uploaded to the cloud: ${percent}%`);
    });
  }
};
