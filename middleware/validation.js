const looksLikeObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const hasUnsafeMongoKeys = (value) => {
  if (Array.isArray(value)) return value.some(hasUnsafeMongoKeys);
  if (!looksLikeObject(value)) return false;
  return Object.entries(value).some(([key, nested]) => {
    if (key.startsWith('$') || key.includes('.')) return true;
    return hasUnsafeMongoKeys(nested);
  });
};

export const validateBody = ({ allowlist = [], required = [] } = {}) => (req, res, next) => {
  const body = req.body || {};

  if (!looksLikeObject(body)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_BODY', message: 'Request body must be a JSON object.' },
      requestId: req.requestId,
    });
  }

  if (hasUnsafeMongoKeys(body)) {
    return res.status(400).json({
      success: false,
      error: { code: 'UNSAFE_BODY', message: 'Request body contains unsafe keys.' },
      requestId: req.requestId,
    });
  }

  const unknownKeys = Object.keys(body).filter((key) => !allowlist.includes(key));
  if (unknownKeys.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UNKNOWN_FIELDS',
        message: `Unknown fields are not allowed: ${unknownKeys.join(', ')}`,
      },
      requestId: req.requestId,
    });
  }

  const missing = required.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_FIELDS',
        message: `Missing required fields: ${missing.join(', ')}`,
      },
      requestId: req.requestId,
    });
  }

  return next();
};
