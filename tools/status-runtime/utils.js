const path = require("path");

const SAFE_STATUS_ID_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function isIsoDateTime(value) {
  if (typeof value !== "string") {
    return false;
  }
  const match = RFC3339_RE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > daysInMonth) {
    return false;
  }
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function ensureSafeStatusId(value, name) {
  assert(
    typeof value === "string" && SAFE_STATUS_ID_RE.test(value),
    `${name} must be a safe 1-128 character basename using letters, digits, dot, underscore, or hyphen`
  );
  return value;
}

function resolveContainedFile(parentDir, filename) {
  const resolvedParent = path.resolve(parentDir);
  const resolvedFile = path.resolve(resolvedParent, filename);
  assert(
    path.dirname(resolvedFile) === resolvedParent,
    `Resolved status path escapes its parent directory: ${filename}`
  );
  return resolvedFile;
}

function ensureString(value, name) {
  assert(typeof value === "string" && value.length > 0, `${name} must be a non-empty string`);
  return value;
}

function ensureInteger(value, name, min) {
  assert(Number.isInteger(value), `${name} must be an integer`);
  if (typeof min === "number") {
    assert(value >= min, `${name} must be >= ${min}`);
  }
  return value;
}

function ensureEnum(value, allowed, name) {
  assert(allowed.includes(value), `${name} must be one of: ${allowed.join(", ")}`);
  return value;
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) {
    return undefined;
  }
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function pickDefined(source, keys) {
  const target = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
  return target;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!isObject(value)) {
    return value;
  }
  const target = {};
  for (const key of Object.keys(value).sort()) {
    target[key] = sortObjectKeys(value[key]);
  }
  return target;
}

function orderedObject(source, keyOrder) {
  const target = {};
  for (const key of keyOrder) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
  return target;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolvePathFromBase(basePath, value) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(basePath || process.cwd(), value);
}

function resolvePayloadPathAnchor(basePath, payload) {
  if (payload && typeof payload.working_project_dir === "string" && payload.working_project_dir.length > 0) {
    return resolvePathFromBase(basePath, payload.working_project_dir);
  }
  return basePath || process.cwd();
}

function resolvePayloadPath(basePath, payload, value) {
  return resolvePathFromBase(resolvePayloadPathAnchor(basePath, payload), value);
}

function toRelativeStatusPath(kind, id) {
  ensureSafeStatusId(id, `${kind} id`);
  return path.posix.join("status", kind, `${id}.json`);
}

module.exports = {
  assert,
  cloneJson,
  ensureEnum,
  ensureInteger,
  ensureSafeStatusId,
  ensureString,
  isIsoDateTime,
  isObject,
  nowIso,
  orderedObject,
  pickDefined,
  resolvePathFromBase,
  resolveContainedFile,
  resolvePayloadPath,
  resolvePayloadPathAnchor,
  sortObjectKeys,
  stableJson,
  toRelativeStatusPath,
  uniqueStrings
};
