const { createLogger, format, transports } = require('winston');
const fs = require('fs-extra');

fs.ensureDirSync('logs');

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/execution.log' })
  ]
});

module.exports = logger;
