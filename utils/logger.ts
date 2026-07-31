import { createLogger, format, transports } from 'winston';
import fs from 'fs-extra';
// Winston logger used to print execution logs to console and logs/execution.log.

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

export default logger;
