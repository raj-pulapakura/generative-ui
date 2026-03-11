type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export function logInfo(event: string, details?: Record<string, unknown>): void {
  writeLog('INFO', event, details);
}

export function logWarn(event: string, details?: Record<string, unknown>): void {
  writeLog('WARN', event, details);
}

export function logError(event: string, details?: Record<string, unknown>): void {
  writeLog('ERROR', event, details);
}

function writeLog(level: LogLevel, event: string, details?: Record<string, unknown>): void {
  const line = `[${new Date().toISOString()}] [${level}] ${event}`;
  if (!details) {
    console.log(line);
    return;
  }

  console.log(`${line} ${JSON.stringify(details)}`);
}
