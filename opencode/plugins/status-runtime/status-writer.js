const fs = require("fs/promises");
const path = require("path");

const {
  canonicalizeAgentStatus,
  canonicalizeCheckpoint,
  canonicalizeRunStatus,
  canonicalizeTaskStatus
} = require("./schema-lite");
const { stableJson } = require("./utils");

class StatusWriter {
  async readJson(filePath) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async writeRunStatus(filePath, value) {
    return this.writeJsonAtomic(filePath, canonicalizeRunStatus(value));
  }

  async writeTaskStatus(filePath, value) {
    return this.writeJsonAtomic(filePath, canonicalizeTaskStatus(value));
  }

  async writeAgentStatus(filePath, value) {
    return this.writeJsonAtomic(filePath, canonicalizeAgentStatus(value));
  }

  async writeCheckpoint(filePath, value) {
    return this.writeJsonAtomic(filePath, canonicalizeCheckpoint(value));
  }

  async writeJsonAtomic(filePath, value) {
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });

    const tempPath = path.join(
      dirPath,
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
    );

    await fs.writeFile(tempPath, stableJson(value), "utf8");

    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      if (error && (error.code === "EEXIST" || error.code === "EPERM")) {
        await fs.rm(filePath, { force: true });
        await fs.rename(tempPath, filePath);
      } else {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
      }
    }
  }
}

module.exports = { StatusWriter };
