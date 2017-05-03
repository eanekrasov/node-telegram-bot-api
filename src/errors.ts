import {Response} from "web-request";

export class BaseError extends Error {
  code: string;
  response: Response<string>;

  /**
   * @class BaseError
   * @constructor
   * @private
   * @param  code Error code
   * @param  message Error message
   */
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

export class FatalError extends BaseError {
  /**
   * Fatal Error. Error code is `"EFATAL"`.
   * @class FatalError
   * @constructor
   * @param data Error object or message
   */
  constructor(data: Error | string) {
    const error = (typeof data === 'string') ? null : data;
    const message = error ? error.message : data as string;
    super('EFATAL', message);
    if (error) this.stack = error.stack;
  }
}

export class ParseError extends BaseError {
  /**
   * Error during parsing. Error code is `"EPARSE"`.
   * @class ParseError
   * @constructor
   * @param message Error message
   * @param response Server response
   */
  constructor(message: string, response?: Response<string>) {
    super('EPARSE', message);
    if (response)
    this.response = response;
  }
}

export class TelegramError extends BaseError {
  /**
   * Error returned from Telegram. Error code is `"ETELEGRAM"`.
   * @class TelegramError
   * @constructor
   * @param message Error message
   * @param response Server response
   */
  constructor(message: string, response: Response<string>) {
    super('ETELEGRAM', message);
    this.response = response;
  }
}
