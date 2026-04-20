import AuditLog from '../models/AuditLog.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'smtp_pass',
  'api_key',
  'api_secret',
]);

const redact = (value) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== 'object') return value;

  const output = {};
  for (const [key, val] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    output[key] = SENSITIVE_KEYS.has(normalized) ? '[REDACTED]' : redact(val);
  }
  return output;
};

export const logAudit = async (event, payload = {}) => {
  try {
    const {
      req,
      outcome = 'success',
      actorId,
      actorEmail,
      scope,
      ...metadata
    } = payload;

    await AuditLog.create({
      event,
      actorId: actorId || req?.user?.id || null,
      actorEmail: actorEmail || req?.user?.email || null,
      scope: scope || req?.user?.scope || null,
      ip: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null,
      requestId: req?.requestId || null,
      outcome,
      metadata: redact(metadata),
    });
  } catch (error) {
    console.error('Audit logging failed:', error.message);
  }
};
