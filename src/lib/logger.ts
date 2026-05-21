import pino from 'pino';

export function createLogger(name: string) {
  return pino({
    name,
    transport: process.env.PRETTY_LOGGING === 'true' ? { target: 'pino-pretty' } : undefined,
  });
}

