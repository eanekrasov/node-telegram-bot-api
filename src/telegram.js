"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
///<reference path="../typings/globals/node/index.d.ts"/>
const events_1 = require("events");
const fileType = require("file-type");
const stream = require("stream");
const path = require("path");
const URL = require("url");
const fs = require("fs");
const mime = require("mime");
const pump = require("pump");
const qs = require("querystring");
const WebRequest = require("web-request");
const debug0 = require("debug");
const telegramPolling_1 = require("./telegramPolling");
const telegramWebHook_1 = require("./telegramWebHook");
const errors_1 = require("./errors");
// shims
require('array.prototype.findindex').shim(); // for Node.js v0.x
const debug = debug0('node-telegram-bot-api');
const streamedRequest = require('request');
const _messageTypes = [
    'text', 'audio', 'document', 'photo', 'sticker', 'video', 'voice', 'contact',
    'location', 'new_chat_participant', 'left_chat_participant', 'new_chat_title',
    'new_chat_photo', 'delete_chat_photo', 'group_chat_created'
];
function isPollingOptions(obj) {
    return true;
}
function isWebHookOptions(obj) {
    return true;
}
class TelegramBot extends events_1.EventEmitter {
    static get messageTypes() {
        return _messageTypes;
    }
    /**
     * Both request method to obtain messages are implemented. To use standard polling, set `polling: true`
     * on `options`. Notice that [webHook](https://core.telegram.org/bots/api#setwebhook) will need a SSL certificate.
     * Emits `message` when a message arrives.
     *
     * @class TelegramBot
     * @constructor
     * @param {String} token Bot Token
     * @param {Object} [options]
     * @param {Boolean|Object} [options.polling=false] Set true to enable polling or set options.
     *  If a WebHook has been set, it will be deleted automatically.
     * @param {String|Number} [options.polling.timeout=10] *Deprecated. Use `options.polling.params` instead*.
     *  Timeout in seconds for long polling.
     * @param {String|Number} [options.polling.interval=300] Interval between requests in miliseconds
     * @param {Boolean} [options.polling.autoStart=true] Start polling immediately
     * @param {Object} [options.polling.params] Parameters to be used in polling API requests.
     *  See https://core.telegram.org/bots/api#getupdates for more information.
     * @param  {Number} [options.polling.params.timeout=10] Timeout in seconds for long polling.
     * @param {Boolean|Object} [options.webHook=false] Set true to enable WebHook or set options
     * @param {String} [options.webHook.host=0.0.0.0] Host to bind to
     * @param {Number} [options.webHook.port=8443] Port to bind to
     * @param {String} [options.webHook.key] Path to file with PEM private key for webHook server.
     *  The file is read **synchronously**!
     * @param {String} [options.webHook.cert] Path to file with PEM certificate (public) for webHook server.
     *  The file is read **synchronously**!
     * @param {String} [options.webHook.pfx] Path to file with PFX private key and certificate chain for webHook server.
     *  The file is read **synchronously**!
     * @param {Boolean} [options.webHook.autoOpen=true] Open webHook immediately
     * @param {Object} [options.webHook.https] Options to be passed to `https.createServer()`.
     *  Note that `options.webHook.key`, `options.webHook.cert` and `options.webHook.pfx`, if provided, will be
     *  used to override `key`, `cert` and `pfx` in this object, respectively.
     *  See https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener for more information.
     * @param {String} [options.webHook.healthEndpoint=/healthz] An endpoint for health checks that always responds with 200 OK
     * @param {Boolean} [options.onlyFirstMatch=false] Set to true to stop after first match. Otherwise, all regexps are executed
     * @param {Object} [options.request] Options which will be added for all requests to telegram api.
     *  See https://github.com/request/request#requestoptions-callback for more information.
     * @param {String} [options.baseApiUrl=https://api.telegram.org] API Base URl; useful for proxying and testing
     * @param {Boolean} [options.filepath=true] Allow passing file-paths as arguments when sending files,
     *  such as photos using `TelegramBot#sendPhoto()`. See [usage information][usage-sending-files-performance]
     *  for more information on this option and its consequences.
     * @see https://core.telegram.org/bots/api
     */
    constructor(token, options = {}) {
        super();
        this.token = token;
        options.baseApiUrl = options.baseApiUrl || 'https://api.telegram.org';
        if (typeof options.filepath === 'undefined')
            options.filepath = true;
        this.options = options;
        this._textRegexpCallbacks = [];
        this._replyListenerId = 0;
        this._replyListeners = [];
        this._polling = null;
        this._webHook = null;
        const autoStart = isPollingOptions(options.polling) ? options.polling.autoStart : options.polling;
        if (typeof autoStart === 'undefined' || autoStart === true) {
            this.startPolling();
        }
        const autoOpen = isWebHookOptions(options.webHook) ? options.webHook.autoOpen : options.webHook;
        if (typeof autoOpen === 'undefined' || autoOpen === true) {
            this.openWebHook();
        }
    }
    /**
     * Generates url with bot token and provided path/method you want to be got/executed by bot
     * @param  path
     * @return {String} url
     * @see https://core.telegram.org/bots/api#making-requests
     */
    _buildURL(path) {
        return `${this.options.baseApiUrl}/bot${this.token}/${path}`;
    }
    /**
     * Fix 'reply_markup' parameter by making it JSON-serialized, as
     * required by the Telegram Bot API
     * @param {Object} replyMarkup
     * @private
     * @see https://core.telegram.org/bots/api#sendmessage
     */
    _fixReplyMarkup(replyMarkup) {
        return (replyMarkup && typeof replyMarkup !== 'string')
            ? JSON.stringify(replyMarkup)
            : replyMarkup;
    }
    /**
     * Make request against the API
     * @param  {String} _path API endpoint
     * @param requestOptions
     * @param  {Object} [options]
     * @private
     * @return {Promise}
     */
    _request(_path, requestOptions = {}, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.token) {
                throw new errors_1.FatalError('Telegram Bot Token not provided!');
            }
            if (this.options.request) {
                Object.assign(requestOptions, this.options.request);
            }
            options.reply_markup = this._fixReplyMarkup(options.reply_markup);
            requestOptions.forever = true;
            debug('HTTP request: %j', requestOptions);
            let resp = yield WebRequest.post(this._buildURL(_path), requestOptions, options);
            let data = JSON.parse(resp.content);
            //throw new ParseError(`Error parsing Telegram response: ${resp.content}`, resp);
            if (!data.ok) {
                throw new errors_1.TelegramError(`${data.error_code} ${data.description}`, resp);
            }
            return data.result;
        });
    }
    /**
     * Format data to be uploaded; handles file paths, streams and buffers
     * @param  {String} type
     * @param  {String|stream.ReadStream|Buffer} data
     * @return {Array} formatted
     * @return {Object} formatted[0] formData
     * @return {String} formatted[1] fileId
     * @throws Error if Buffer file type is not supported.
     * @see https://npmjs.com/package/file-type
     * @private
     */
    _formatSendData(type, data) {
        let formData;
        let fileName;
        let fileId;
        if (data instanceof stream.Stream || data.hasOwnProperty('path')) {
            // Will be 'null' if could not be parsed. Default to 'filename'.
            // For example, 'data.path' === '/?id=123' from 'request("https://example.com/?id=123")'
            fileName = URL.parse(path.basename(data.path.toString())).pathname || 'filename';
            formData = {};
            formData[type] = {
                value: data,
                options: {
                    filename: qs.unescape(fileName),
                    contentType: mime.lookup(fileName)
                }
            };
        }
        else if (Buffer.isBuffer(data)) {
            const fileTypeValue = fileType(data);
            if (!fileTypeValue) {
                throw new errors_1.FatalError('Unsupported Buffer file type');
            }
            formData = {};
            formData[type] = {
                value: data,
                options: {
                    filename: `data.${fileTypeValue.ext}`,
                    contentType: fileTypeValue.mime
                }
            };
        }
        else if (!this.options.filepath) {
            /**
             * When the constructor option 'filepath' is set to
             * 'false', we do not support passing file-paths.
             */
            fileId = data;
        }
        else if (fs.existsSync(data)) {
            fileName = path.basename(data);
            formData = {};
            formData[type] = {
                value: fs.createReadStream(data),
                options: {
                    filename: fileName,
                    contentType: mime.lookup(fileName)
                }
            };
        }
        else {
            fileId = data;
        }
        return [formData, fileId];
    }
    /**
     * Start polling.
     * Rejects returned promise if a WebHook is being used by this instance.
     * @param  [options]
     * @param  [options.restart=true] Consecutive calls to this method causes polling to be restarted
     * @return {Promise}
     */
    startPolling(options = {}) {
        if (this.hasOpenWebHook()) {
            return Promise.reject(new errors_1.FatalError('Polling and WebHook are mutually exclusive'));
        }
        options.restart = typeof options.restart === 'undefined' ? true : options.restart;
        if (!this._polling) {
            this._polling = new telegramPolling_1.default(this);
        }
        return this._polling.start(options);
    }
    /**
     * Stops polling after the last polling request resolves.
     * Multiple invocations do nothing if polling is already stopped.
     * Returning the promise of the last polling request is **deprecated**.
     * @return {Promise}
     */
    stopPolling() {
        if (!this._polling) {
            return Promise.resolve();
        }
        return this._polling.stop();
    }
    /**
     * Return true if polling. Otherwise, false.
     * @return {Boolean}
     */
    isPolling() {
        return this._polling ? this._polling.isPolling() : false;
    }
    /**3
     * Open webhook.
     * Multiple invocations do nothing if webhook is already open.
     * Rejects returned promise if Polling is being used by this instance.
     * @return {Promise}
     */
    openWebHook() {
        if (this.isPolling()) {
            return Promise.reject(new errors_1.FatalError('WebHook and Polling are mutually exclusive'));
        }
        if (!this._webHook) {
            this._webHook = new telegramWebHook_1.default(this);
        }
        return this._webHook.open();
    }
    /**
     * Close webhook after closing all current connections.
     * Multiple invocations do nothing if webhook is already closed.
     * @return {Promise} promise
     */
    closeWebHook() {
        if (!this._webHook) {
            return Promise.resolve();
        }
        return this._webHook.close();
    }
    /**
     * Return true if using webhook and it is open i.e. accepts connections.
     * Otherwise, false.
     * @return {Boolean}
     */
    hasOpenWebHook() {
        return this._webHook ? this._webHook.isOpen() : false;
    }
    /**
     * Returns basic information about the bot in form of a `User` object.
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getme
     */
    getMe() {
        const _path = 'getMe';
        return this._request(_path);
    }
    /**
     * Specify an url to receive incoming updates via an outgoing webHook.
     * This method has an [older, compatible signature][setWebHook-v0.25.0]
     * that is being deprecated.
     *
     * @param  {String} url URL where Telegram will make HTTP Post. Leave empty to
     * delete webHook.
     * @param  {Object} [options] Additional Telegram query options
     * @param  {String|stream.Stream} [options.certificate] PEM certificate key (public).
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#setwebhook
     */
    setWebHook(url, options = {}) {
        /* The older method signature was setWebHook(url, cert).
         * We need to ensure backwards-compatibility while maintaining
         * consistency of the method signatures throughout the library */
        let cert;
        // Note: 'options' could be an object, if a stream was provided (in place of 'cert')
        cert = options.certificate;
        const opts = {
            qs: options,
        };
        opts.qs.url = url;
        if (cert) {
            try {
                const sendData = this._formatSendData('certificate', cert);
                opts.formData = sendData[0];
                opts.qs.certificate = sendData[1];
            }
            catch (ex) {
                return Promise.reject(ex);
            }
        }
        return this._request('setWebHook', opts);
    }
    /**
     * Use this method to remove webhook integration if you decide to
     * switch back to getUpdates. Returns True on success.
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#deletewebhook
     */
    deleteWebHook() {
        return this._request('deleteWebhook');
    }
    /**
     * Use this method to get current webhook status.
     * On success, returns a [WebhookInfo](https://core.telegram.org/bots/api#webhookinfo) object.
     * If the bot is using getUpdates, will return an object with the
     * url field empty.
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getwebhookinfo
     */
    getWebHookInfo() {
        return this._request('getWebhookInfo');
    }
    /**
     * Use this method to receive incoming updates using long polling.
     * This method has an [older, compatible signature][getUpdates-v0.25.0]
     * that is being deprecated.
     *
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getupdates
     */
    getUpdates(form = {}) {
        return this._request('getUpdates', { form });
    }
    /**
     * Process an update; emitting the proper events and executing regexp
     * callbacks. This method is useful should you be using a different
     * way to fetch updates, other than those provided by TelegramBot.
     * @param  {Object} update
     * @see https://core.telegram.org/bots/api#update
     */
    processUpdate(update) {
        debug('Process Update %j', update);
        const message = update.message;
        const editedMessage = update.edited_message;
        const channelPost = update.channel_post;
        const editedChannelPost = update.edited_channel_post;
        const inlineQuery = update.inline_query;
        const chosenInlineResult = update.chosen_inline_result;
        const callbackQuery = update.callback_query;
        if (message) {
            debug('Process Update message %j', message);
            this.emit('message', message);
            const processMessageType = (messageType) => {
                if (message[messageType]) {
                    debug('Emitting %s: %j', messageType, message);
                    this.emit(messageType, message);
                }
            };
            TelegramBot.messageTypes.forEach(processMessageType);
            if (message.text) {
                debug('Text message');
                this._textRegexpCallbacks.some((reg) => {
                    debug('Matching %s with %s', message.text, reg.regexp);
                    const result = reg.regexp.exec(message.text);
                    if (!result) {
                        return false;
                    }
                    debug('Matches %s', reg.regexp);
                    reg.callback(message, result);
                    // returning truthy value exits .some
                    return this.options.onlyFirstMatch;
                });
            }
            if (message.reply_to_message) {
                // Only callbacks waiting for this message
                this._replyListeners.forEach((reply) => {
                    // Message from the same chat
                    if (reply.chatId === message.chat.id) {
                        // Responding to that message
                        if (reply.messageId === message.reply_to_message.message_id) {
                            // Resolve the promise
                            reply.callback(message);
                        }
                    }
                });
            }
        }
        else if (editedMessage) {
            debug('Process Update edited_message %j', editedMessage);
            this.emit('edited_message', editedMessage);
            if (editedMessage.text) {
                this.emit('edited_message_text', editedMessage);
            }
            if (editedMessage.caption) {
                this.emit('edited_message_caption', editedMessage);
            }
        }
        else if (channelPost) {
            debug('Process Update channel_post %j', channelPost);
            this.emit('channel_post', channelPost);
        }
        else if (editedChannelPost) {
            debug('Process Update edited_channel_post %j', editedChannelPost);
            this.emit('edited_channel_post', editedChannelPost);
            if (editedChannelPost.text) {
                this.emit('edited_channel_post_text', editedChannelPost);
            }
            if (editedChannelPost.caption) {
                this.emit('edited_channel_post_caption', editedChannelPost);
            }
        }
        else if (inlineQuery) {
            debug('Process Update inline_query %j', inlineQuery);
            this.emit('inline_query', inlineQuery);
        }
        else if (chosenInlineResult) {
            debug('Process Update chosen_inline_result %j', chosenInlineResult);
            this.emit('chosen_inline_result', chosenInlineResult);
        }
        else if (callbackQuery) {
            debug('Process Update callback_query %j', callbackQuery);
            this.emit('callback_query', callbackQuery);
        }
    }
    /**
     * Send text message.
     * @param  {Number|String} chatId Unique identifier for the message recipient
     * @param  {String} text Text of the message to be sent
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendmessage
     */
    sendMessage(chatId, text, options = {}) {
        let opts = options;
        opts.chat_id = chatId;
        opts.text = text;
        return this._request('sendMessage', {}, opts);
    }
    /**
     * Send answers to an inline query.
     * @param results An array of results for the inline query
     * @param [form] Additional Telegram query options
     * @param inlineQueryId Unique identifier of the query
     * @see https://core.telegram.org/bots/api#answerinlinequery
     * @returns {Promise}
     */
    answerInlineQuery(inlineQueryId, results, form = {}) {
        form.inline_query_id = inlineQueryId;
        form.results = JSON.stringify(results);
        return this._request('answerInlineQuery', { form });
    }
    /**
     * Forward messages of any kind.
     * @param  {Number|String} chatId     Unique identifier for the message recipient
     * @param  {Number|String} fromChatId Unique identifier for the chat where the
     * original message was sent
     * @param  {Number|String} messageId  Unique message identifier
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     */
    forwardMessage(chatId, fromChatId, messageId, form = {}) {
        form.chat_id = chatId;
        form.from_chat_id = fromChatId;
        form.message_id = messageId;
        return this._request('forwardMessage', { form });
    }
    /**
     * Send photo
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} photo A file path or a Stream. Can
     * also be a `file_id` previously uploaded
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendphoto
     */
    sendPhoto(chatId, photo, options = {}) {
        const opts = {
            qs: options,
        };
        opts.qs.chat_id = chatId;
        try {
            const sendData = this._formatSendData('photo', photo);
            opts.formData = sendData[0];
            opts.qs.photo = sendData[1];
        }
        catch (ex) {
            return Promise.reject(ex);
        }
        return this._request('sendPhoto', opts);
    }
    /**
     * Send audio
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} audio A file path, Stream or Buffer.
     * Can also be a `file_id` previously uploaded.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendaudio
     */
    sendAudio(chatId, audio, options = {}) {
        const opts = {
            qs: options
        };
        opts.qs.chat_id = chatId;
        try {
            const sendData = this._formatSendData('audio', audio);
            opts.formData = sendData[0];
            opts.qs.audio = sendData[1];
        }
        catch (ex) {
            return Promise.reject(ex);
        }
        return this._request('sendAudio', opts);
    }
    /**
     * Send Document
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} doc A file path, Stream or Buffer.
     * Can also be a `file_id` previously uploaded.
     * @param  {Object} [options] Additional Telegram query options
     * @param  {Object} [fileOpts] Optional file related meta-data
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendDocument
     */
    sendDocument(chatId, doc, options = {}, fileOpts = {}) {
        const opts = {
            qs: options
        };
        opts.qs.chat_id = chatId;
        try {
            const sendData = this._formatSendData('document', doc);
            opts.formData = sendData[0];
            opts.qs.document = sendData[1];
        }
        catch (ex) {
            return Promise.reject(ex);
        }
        if (opts.formData && Object.keys(fileOpts).length) {
            opts.formData.document.options = fileOpts;
        }
        return this._request('sendDocument', opts);
    }
    /**
     * Send .webp stickers.
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} sticker A file path, Stream or Buffer.
     * Can also be a `file_id` previously uploaded. Stickers are WebP format files.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendsticker
     */
    sendSticker(chatId, sticker, options = {}) {
        const opts = {
            qs: options
        };
        opts.qs.chat_id = chatId;
        try {
            const sendData = this._formatSendData('sticker', sticker);
            opts.formData = sendData[0];
            opts.qs.sticker = sendData[1];
        }
        catch (ex) {
            return Promise.reject(ex);
        }
        return this._request('sendSticker', opts);
    }
    /**
     * Use this method to send video files, Telegram clients support mp4 videos (other formats may be sent as Document).
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} video A file path or Stream.
     * Can also be a `file_id` previously uploaded.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendvideo
     */
    sendVideo(chatId, video, options = {}) {
        const opts = {
            qs: options
        };
        opts.qs.chat_id = chatId;
        try {
            const sendData = this._formatSendData('video', video);
            opts.formData = sendData[0];
            opts.qs.video = sendData[1];
        }
        catch (ex) {
            return Promise.reject(ex);
        }
        return this._request('sendVideo', opts);
    }
    /**
     * Send voice
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} voice A file path, Stream or Buffer.
     * Can also be a `file_id` previously uploaded.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendvoice
     */
    sendVoice(chatId, voice, options = {}) {
        const opts = {
            qs: options
        };
        opts.qs.chat_id = chatId;
        try {
            const sendData = this._formatSendData('voice', voice);
            opts.formData = sendData[0];
            opts.qs.voice = sendData[1];
        }
        catch (ex) {
            return Promise.reject(ex);
        }
        return this._request('sendVoice', opts);
    }
    /**
     * Send chat action.
     * `typing` for text messages,
     * `upload_photo` for photos, `record_video` or `upload_video` for videos,
     * `record_audio` or `upload_audio` for audio files, `upload_document` for general files,
     * `find_location` for location data.
     *
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String} action Type of action to broadcast.
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendchataction
     */
    sendChatAction(chatId, action) {
        const form = {
            action,
            chat_id: chatId
        };
        return this._request('sendChatAction', { form });
    }
    /**
     * Use this method to kick a user from a group or a supergroup.
     * In the case of supergroups, the user will not be able to return
     * to the group on their own using invite links, etc., unless unbanned
     * first. The bot must be an administrator in the group for this to work.
     * Returns True on success.
     *
     * @param  {Number|String} chatId  Unique identifier for the target group or username of the target supergroup
     * @param  {String} userId  Unique identifier of the target user
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#kickchatmember
     */
    kickChatMember(chatId, userId) {
        const form = {
            chat_id: chatId,
            user_id: userId
        };
        return this._request('kickChatMember', { form });
    }
    /**
     * Use this method to unban a previously kicked user in a supergroup.
     * The user will not return to the group automatically, but will be
     * able to join via link, etc. The bot must be an administrator in
     * the group for this to work. Returns True on success.
     *
     * @param  {Number|String} chatId  Unique identifier for the target group or username of the target supergroup
     * @param  {String} userId  Unique identifier of the target user
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#unbanchatmember
     */
    unbanChatMember(chatId, userId) {
        return this._request('unbanChatMember', {}, {
            chat_id: chatId,
            user_id: userId
        });
    }
    /**
     * Use this method to send answers to callback queries sent from
     * inline keyboards. The answer will be displayed to the user as
     * a notification at the top of the chat screen or as an alert.
     * On success, True is returned.
     *
     * @param  {Number|String} callbackQueryId  Unique identifier for the query to be answered
     * @param  {String} text  Text of the notification. If not specified, nothing will be shown to the user
     * @param  {Boolean} showAlert  Whether to show an alert or a notification at the top of the screen
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#answercallbackquery
     */
    answerCallbackQuery(callbackQueryId, text, showAlert, form = {}) {
        form.callback_query_id = callbackQueryId;
        form.text = text;
        form.show_alert = showAlert;
        return this._request('answerCallbackQuery', { form });
    }
    /**
     * Use this method to edit text messages sent by the bot or via
     * the bot (for inline bots). On success, the edited Message is
     * returned.
     *
     * Note that you must provide one of chat_id, message_id, or
     * inline_message_id in your request.
     *
     * @param  {String} text  New text of the message
     * @param  {Object} [form] Additional Telegram query options (provide either one of chat_id, message_id, or inline_message_id here)
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#editmessagetext
     */
    editMessageText(text, form = {}) {
        form.text = text;
        return this._request('editMessageText', { form });
    }
    /**
     * Use this method to edit captions of messages sent by the
     * bot or via the bot (for inline bots). On success, the
     * edited Message is returned.
     *
     * Note that you must provide one of chat_id, message_id, or
     * inline_message_id in your request.
     *
     * @param  {String} caption  New caption of the message
     * @param  {Object} [form] Additional Telegram query options (provide either one of chat_id, message_id, or inline_message_id here)
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#editmessagecaption
     */
    editMessageCaption(caption, form = {}) {
        form.caption = caption;
        return this._request('editMessageCaption', { form });
    }
    /**
     * Use this method to edit only the reply markup of messages
     * sent by the bot or via the bot (for inline bots).
     * On success, the edited Message is returned.
     *
     * Note that you must provide one of chat_id, message_id, or
     * inline_message_id in your request.
     *
     * @param  {Object} replyMarkup  A JSON-serialized object for an inline keyboard.
     * @param  {Object} [form] Additional Telegram query options (provide either one of chat_id, message_id, or inline_message_id here)
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#editmessagetext
     */
    editMessageReplyMarkup(replyMarkup, form = {}) {
        form.reply_markup = replyMarkup;
        return this._request('editMessageReplyMarkup', { form });
    }
    /**
     * Use this method to get a list of profile pictures for a user.
     * Returns a [UserProfilePhotos](https://core.telegram.org/bots/api#userprofilephotos) object.
     * This method has an [older, compatible signature][getUserProfilePhotos-v0.25.0]
     * that is being deprecated.
     *
     * @param  {Number|String} userId  Unique identifier of the target user
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getuserprofilephotos
     */
    getUserProfilePhotos(userId, form = {}) {
        form.user_id = userId;
        return this._request('getUserProfilePhotos', { form });
    }
    /**
     * Send location.
     * Use this method to send point on the map.
     *
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {Number} latitude Latitude of location
     * @param  {Number} longitude Longitude of location
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendlocation
     */
    sendLocation(chatId, latitude, longitude, form = {}) {
        form.chat_id = chatId;
        form.latitude = latitude;
        form.longitude = longitude;
        return this._request('sendLocation', { form });
    }
    /**
     * Send venue.
     * Use this method to send information about a venue.
     *
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {Number} latitude Latitude of location
     * @param  {Number} longitude Longitude of location
     * @param  {String} title Name of the venue
     * @param  {String} address Address of the venue
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendvenue
     */
    sendVenue(chatId, latitude, longitude, title, address, form = {}) {
        form.chat_id = chatId;
        form.latitude = latitude;
        form.longitude = longitude;
        form.title = title;
        form.address = address;
        return this._request('sendVenue', { form });
    }
    /**
     * Send contact.
     * Use this method to send phone contacts.
     *
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String} phoneNumber Contact's phone number
     * @param  {String} firstName Contact's first name
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendcontact
     */
    sendContact(chatId, phoneNumber, firstName, form = {}) {
        form.chat_id = chatId;
        form.phone_number = phoneNumber;
        form.first_name = firstName;
        return this._request('sendContact', { form });
    }
    /**
     * Get file.
     * Use this method to get basic info about a file and prepare it for downloading.
     * Attention: link will be valid for 1 hour.
     *
     * @param  {String} fileId  File identifier to get info about
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getfile
     */
    getFile(fileId) {
        const form = { file_id: fileId };
        return this._request('getFile', { form });
    }
    /**
     * Get link for file.
     * Use this method to get link for file for subsequent use.
     * Attention: link will be valid for 1 hour.
     *
     * This method is a sugar extension of the (getFile)[#getfilefileid] method,
     * which returns just path to file on remote server (you will have to manually build full uri after that).
     *
     * @param  {String} fileId  File identifier to get info about
     * @return {Promise} promise Promise which will have *fileURI* in resolve callback
     * @see https://core.telegram.org/bots/api#getfile
     */
    getFileLink(fileId) {
        return this.getFile(fileId)
            .then((resp) => `${this.options.baseApiUrl}/file/bot${this.token}/${resp.file_path}`);
    }
    /**
     * Downloads file in the specified folder.
     * This is just a sugar for (getFile)[#getfilefiled] method
     *
     * @param  {String} fileId  File identifier to get info about
     * @param  {String} downloadDir Absolute path to the folder in which file will be saved
     * @return {Promise} promise Promise, which will have *filePath* of downloaded file in resolve callback
     */
    downloadFile(fileId, downloadDir) {
        return this
            .getFileLink(fileId)
            .then((fileURI) => {
            const fileName = fileURI.slice(fileURI.lastIndexOf('/') + 1);
            // TODO: Ensure fileName doesn't contains slashes
            const filePath = `${downloadDir}/${fileName}`;
            // properly handles errors and closes all streams
            return new Promise((y, n) => {
                pump(streamedRequest({ uri: fileURI }), fs.createWriteStream(filePath), () => y(filePath));
            });
        });
    }
    /**
     * Register a RegExp to test against an incomming text message.
     * @param  {RegExp}   regexp       RegExp to be executed with `exec`.
     * @param  {Function} callback     Callback will be called with 2 parameters,
     * the `msg` and the result of executing `regexp.exec` on message text.
     */
    onText(regexp, callback) {
        this._textRegexpCallbacks.push({ regexp, callback });
    }
    /**
     * Register a reply to wait for a message response.
     * @param  {Number|String}   chatId       The chat id where the message cames from.
     * @param  {Number|String}   messageId    The message id to be replied.
     * @param  {Function} callback     Callback will be called with the reply
     *  message.
     * @return {Number} id                    The ID of the inserted reply listener.
     */
    onReplyToMessage(chatId, messageId, callback) {
        const id = ++this._replyListenerId;
        this._replyListeners.push({
            id,
            chatId,
            messageId,
            callback
        });
        return id;
    }
    /**
     * Removes a reply that has been prev. registered for a message response.
     * @param   {Number} replyListenerId      The ID of the reply listener.
     * @return  {Object} deletedListener      The removed reply listener if
     *   found. This object has `id`, `chatId`, `messageId` and `callback`
     *   properties. If not found, returns `null`.
     */
    removeReplyListener(replyListenerId) {
        const index = this._replyListeners.findIndex((replyListener) => {
            return replyListener.id === replyListenerId;
        });
        if (index === -1) {
            return null;
        }
        return this._replyListeners.splice(index, 1)[0];
    }
    /**
     * Use this method to get up to date information about the chat
     * (current name of the user for one-on-one conversations, current
     * username of a user, group or channel, etc.).
     * @param  {Number|String} chatId Unique identifier for the target chat or username of the target supergroup or channel
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getchat
     */
    getChat(chatId) {
        const form = {
            chat_id: chatId
        };
        return this._request('getChat', { form });
    }
    /**
     * Returns the administrators in a chat in form of an Array of `ChatMember` objects.
     * @param chatId  Unique identifier for the target group or username of the target supergroup
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getchatadministrators
     */
    getChatAdministrators(chatId) {
        const form = {
            chat_id: chatId
        };
        return this._request('getChatAdministrators', { form });
    }
    /**
     * Use this method to get the number of members in a chat.
     * @param chatId  Unique identifier for the target group or username of the target supergroup
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getchatmemberscount
     */
    getChatMembersCount(chatId) {
        const form = {
            chat_id: chatId
        };
        return this._request('getChatMembersCount', { form });
    }
    /**
     * Use this method to get information about a member of a chat.
     * @param  chatId  Unique identifier for the target group or username of the target supergroup
     * @param  userId  Unique identifier of the target user
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getchatmember
     */
    getChatMember(chatId, userId) {
        const form = {
            chat_id: chatId,
            user_id: userId
        };
        return this._request('getChatMember', { form });
    }
    /**
     * Leave a group, supergroup or channel.
     * @param chatId Unique identifier for the target group or username of the target supergroup (in the format @supergroupusername)
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#leavechat
     */
    leaveChat(chatId) {
        const form = {
            chat_id: chatId
        };
        return this._request('leaveChat', { form });
    }
    /**
     * Use this method to send a game.
     * @param  chatId Unique identifier for the message recipient
     * @param  gameShortName name of the game to be sent.
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendgame
     */
    sendGame(chatId, gameShortName, form = {}) {
        form.chat_id = chatId;
        form.game_short_name = gameShortName;
        return this._request('sendGame', { form });
    }
    /**
     * Use this method to set the score of the specified user in a game.
     * @param userId  Unique identifier of the target user
     * @param score New score value.
     * @param {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#setgamescore
     */
    setGameScore(userId, score, form = {}) {
        form.user_id = userId;
        form.score = score;
        return this._request('setGameScore', { form });
    }
    /**
     * Use this method to get data for high score table.
     * @param  userId  Unique identifier of the target user
     * @param  {Object} [form] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getgamehighscores
     */
    getGameHighScores(userId, form = {}) {
        form.user_id = userId;
        return this._request('getGameHighScores', { form });
    }
}
exports.default = TelegramBot;
//# sourceMappingURL=telegram.js.map