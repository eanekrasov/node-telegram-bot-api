"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class BaseError extends Error {
    /**
     * @class BaseError
     * @constructor
     * @private
     * @param  code Error code
     * @param  message Error message
     */
    constructor(code, message) {
        super(`${code}: ${message}`);
        this.code = code;
    }
}
exports.BaseError = BaseError;
class FatalError extends BaseError {
    /**
     * Fatal Error. Error code is `"EFATAL"`.
     * @class FatalError
     * @constructor
     * @param data Error object or message
     */
    constructor(data) {
        const error = (typeof data === 'string') ? null : data;
        const message = error ? error.message : data;
        super('EFATAL', message);
        if (error)
            this.stack = error.stack;
    }
}
exports.FatalError = FatalError;
class ParseError extends BaseError {
    /**
     * Error during parsing. Error code is `"EPARSE"`.
     * @class ParseError
     * @constructor
     * @param message Error message
     * @param response Server response
     */
    constructor(message, response) {
        super('EPARSE', message);
        if (response)
            this.response = response;
    }
}
exports.ParseError = ParseError;
class TelegramError extends BaseError {
    /**
     * Error returned from Telegram. Error code is `"ETELEGRAM"`.
     * @class TelegramError
     * @constructor
     * @param message Error message
     * @param response Server response
     */
    constructor(message, response) {
        super('ETELEGRAM', message);
        this.response = response;
    }
}
exports.TelegramError = TelegramError;
//# sourceMappingURL=errors.js.map