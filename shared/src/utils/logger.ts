import winston from 'winston';

/**
 * Creates a standardized Winston logger for microservices.
 * Supports structured JSON logging for production and readable colorized logging for development.
 *
 * @param serviceName - The name of the service (e.g., 'canvas-service').
 */
export const createLogger = (serviceName: string) => {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: serviceName },
    format: winston.format.combine(
      winston.format.timestamp(),
      isDevelopment ? winston.format.colorize() : winston.format.json(),
      isDevelopment
        ? winston.format.printf(
            ({ timestamp, level, message, service, ...meta }) => {
              return `[${timestamp}] ${level} [${service}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
            }
          )
        : winston.format.json()
    ),
    transports: [new winston.transports.Console()],
  });
};
