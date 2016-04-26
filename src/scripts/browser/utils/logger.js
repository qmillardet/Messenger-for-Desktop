import colors from 'colors/safe';
import debug from 'debug';
import util from 'util';
import app from 'app';

export function namespaceOfFile(filename) {
  let name = filename.replace(app.getAppPath(), '').replace('.js', '');
  if (name[0] == '/') {
    name = name.substr(1);
  }
  return global.manifest.name + ':' + name;
}

export function anonymizeException(ex) {
  ex.message = ex.message.replace(app.getPath('home'), '<home>');
}

export function trimLongPaths(ex) {
  ex.stack = ex.stack
    .split('\n')
    .map(line => line.replace(/\/.+atom\.asar/, 'atom.asar'))
    .map(line => line.replace(app.getAppPath(), 'app'))
    .join('\n');
}

export function printDebug() {
  console.log(...arguments);
  const fileLogger = require('./file-logger');
  fileLogger.writeLog(...arguments);
}

export function debugLogger(filename) {
  let logger = null;
  return function() {
    if (!logger) {
      logger = debug(namespaceOfFile(filename));
    }
    logger.log = printDebug;
    logger(util.format(...arguments));
  };
}

function reportToPiwik(namespace, isFatal, ex) {
  const piwik = require('./piwik').default;
  if (piwik) {
    piwik.trackEvent(
      'Exceptions',
      isFatal ? 'Fatal Error' : 'Error',
      ex.name,
      `[${namespace}]: ${ex.message}`
    );
  }
}

function reportToSentry(namespace, isFatal, ex) {
  const sentry = require('./sentry').default;
  if (sentry) {
    const log = debugLogger(__filename);

    anonymizeException(ex);
    trimLongPaths(ex);

    log('reporting to sentry', ex);
    sentry.captureException(ex, {
      level: isFatal ? 'fatal' : 'error',
      extra: {
        trace: new Error().stack
      },
      tag: {
        namespace: namespace
      }
    }, function(result) {
      log('reported', ex, 'to sentry', result);
    });
  }
}

export function printError(namespace, ex) {
  const errorPrefix = `[${new Date().toUTCString()}] ${namespace}:`;
  console.error(colors.white.bold.bgRed(errorPrefix), ex);
  const fileLogger = require('./file-logger');
  fileLogger.writeLog(errorPrefix, ex);
}

export function errorLogger(filename, isFatal) {
  let namespace = null;
  return function(ex) {
    if (!namespace) {
      namespace = namespaceOfFile(filename);
    }

    if (!(ex instanceof Error)) {
      ex = new Error(util.format(...arguments));
    }

    printError(namespace, util.format(ex));
    reportToPiwik(namespace, isFatal, ex);
    reportToSentry(namespace, isFatal, ex);
  };
}
