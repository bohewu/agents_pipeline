const path = require("path");

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
  if (typeof value !== "string" || !value.length) {
    return false;
  }
  const time = Date.parse(value);
  return Number.isFinite(time);
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
  return path.posix.join("status", kind, `${id}.json`);
}

module.exports = {
  assert,
  cloneJson,
  ensureEnum,
  ensureInteger,
  ensureString,
  isIsoDateTime,
  isObject,
  nowIso,
  orderedObject,
  pickDefined,
  resolvePathFromBase,
  resolvePayloadPath,
  resolvePayloadPathAnchor,
  sortObjectKeys,
  stableJson,
  toRelativeStatusPath,
  uniqueStrings
};
