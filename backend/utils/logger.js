const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = levels[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? levels.info;

function emit(level, message, meta) {
  if (levels[level] < threshold) return;
  const entry = { time: new Date().toISOString(), level, message };
  if (meta) entry.meta = meta;
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message, meta) => emit('debug', message, meta),
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta)
};
