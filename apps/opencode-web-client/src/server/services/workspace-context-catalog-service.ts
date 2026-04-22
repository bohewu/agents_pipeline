import { constants, type Dirent } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  WorkspaceCapabilityCategory,
  WorkspaceCapabilityEntry,
  WorkspaceContextCatalogResponse,
  WorkspaceContextEntryStatus,
  WorkspaceContextSourceLayer,
  WorkspaceInstructionSourceCategory,
  WorkspaceInstructionSourceEntry,
} from '../../shared/types.js';
import type { AppPaths } from './app-paths.js';
import { EffortService } from './effort-service.js';
import { getInstalledOpenCodeAssetPath, getInstalledToolPath } from './install-manifest.js';
import { resolveWorkspacePath, resolveWorkspaceProbePath } from './workspace-paths.js';

const MAX_ITEM_PREVIEW = 5;
const MARKDOWN_FILE_RE = /\.md$/i;
const CURSOR_RULE_RE = /\.mdc$/i;
const SCRIPT_FILE_RE = /\.(?:[cm]?js|jsx|ts|tsx)$/i;
const TOOL_FILE_RE = /\.(?:[cm]?js|ts|py)$/i;
const TEST_FILE_RE = /\.test\./i;
const MCP_FILE_RE = /\.(?:json|ya?ml)$/i;

const SOURCE_LAYER_ORDER: Record<WorkspaceContextSourceLayer, number> = {
  'project-local': 0,
  'user-global': 1,
  'app-bundled': 2,
};

const INSTRUCTION_CATEGORY_ORDER: Record<WorkspaceInstructionSourceCategory, number> = {
  'agents-file': 0,
  'opencode-dir': 1,
  'claude-file': 2,
  'claude-agent': 3,
  'copilot-instructions': 4,
  'cursor-rule': 5,
};

const CAPABILITY_CATEGORY_ORDER: Record<WorkspaceCapabilityCategory, number> = {
  command: 0,
  plugin: 1,
  tool: 2,
  'usage-asset': 3,
  'effort-asset': 4,
  skill: 5,
  'mcp-asset': 6,
};

interface WorkspaceContextCatalogServiceDeps {
  appPaths: AppPaths;
  bundledOpencodeRoot: string;
  bundledToolsRoot: string;
  defaultOpencodeConfigDir?: string;
}

export interface WorkspaceContextCatalogServiceOptions {
  now?: () => Date;
  access?: typeof access;
  readdir?: typeof readdir;
  stat?: typeof stat;
}

interface ProbeResult {
  status: WorkspaceContextEntryStatus;
  path: string;
  detail?: string;
  itemCount?: number;
  items?: string[];
}

interface DirectoryProbeOptions {
  emitWhenMissing: boolean;
  emptyStatus: WorkspaceContextEntryStatus;
  listItems: (directoryPath: string) => Promise<string[]>;
}

export class WorkspaceContextCatalogService {
  private readonly appPaths: AppPaths;
  private readonly bundledOpencodeRoot: string;
  private readonly bundledToolsRoot: string;
  private readonly defaultOpencodeConfigDir?: string;
  private readonly now: () => Date;
  private readonly access: typeof access;
  private readonly readdir: typeof readdir;
  private readonly stat: typeof stat;

  constructor(
    deps: WorkspaceContextCatalogServiceDeps,
    options: WorkspaceContextCatalogServiceOptions = {},
  ) {
    this.appPaths = deps.appPaths;
    this.bundledOpencodeRoot = deps.bundledOpencodeRoot;
    this.bundledToolsRoot = deps.bundledToolsRoot;
    this.defaultOpencodeConfigDir = deps.defaultOpencodeConfigDir;
    this.now = options.now ?? (() => new Date());
    this.access = options.access ?? access;
    this.readdir = options.readdir ?? readdir;
    this.stat = options.stat ?? stat;
  }

  async getContextCatalog(
    workspaceId: string,
    workspaceRoot: string,
    opencodeConfigDir?: string,
  ): Promise<WorkspaceContextCatalogResponse> {
    const userGlobalConfigDir = this.resolveOpencodeConfigDir(opencodeConfigDir);
    const instructionSources = await this.collectInstructionSources(workspaceRoot);
    const capabilityEntries = await this.collectCapabilityEntries(workspaceRoot, userGlobalConfigDir);

    return {
      workspaceId,
      collectedAt: this.now().toISOString(),
      instructionSources: instructionSources.sort(compareInstructionEntries),
      capabilityEntries: capabilityEntries.sort(compareCapabilityEntries),
    };
  }

  private async collectInstructionSources(workspaceRoot: string): Promise<WorkspaceInstructionSourceEntry[]> {
    const entries = await Promise.all([
      this.buildWorkspaceInstructionFileEntry(workspaceRoot, {
        id: 'project-local:agents-file',
        category: 'agents-file',
        label: 'Workspace AGENTS.md',
        relativePath: 'AGENTS.md',
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Add AGENTS.md at ${entryPath} to document project-local agent instructions for this workspace.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so workspace AGENTS instructions can be read safely.`,
      }),
      this.buildWorkspaceInstructionDirectoryEntry(workspaceRoot, {
        id: 'project-local:opencode-dir',
        category: 'opencode-dir',
        label: 'Workspace .opencode directory',
        relativePath: '.opencode',
        emitWhenMissing: true,
        emptyStatus: 'available',
        listItems: async (directoryPath) => this.listTopLevelEntries(directoryPath),
        missingRemediation: (entryPath) => `Create ${entryPath} in the workspace root to surface project-local OpenCode instruction assets.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local OpenCode instruction assets can be read safely.`,
      }),
      this.buildWorkspaceInstructionFileEntry(workspaceRoot, {
        id: 'project-local:claude-file',
        category: 'claude-file',
        label: 'Workspace CLAUDE.md',
        relativePath: 'CLAUDE.md',
        emitWhenMissing: false,
        missingRemediation: (entryPath) => `Add CLAUDE.md at ${entryPath} if this workspace should expose a project-local Claude instruction file.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local Claude instructions can be read safely.`,
      }),
      this.buildWorkspaceInstructionDirectoryEntry(workspaceRoot, {
        id: 'project-local:claude-agents',
        category: 'claude-agent',
        label: 'Project-local Claude agent instructions',
        relativePath: '.claude/agents',
        emitWhenMissing: false,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listMarkdownFiles(directoryPath),
        missingRemediation: (entryPath) => `Add one or more Claude agent markdown files under ${entryPath} to expose project-local Claude agent instructions.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local Claude agent instructions can be read safely.`,
      }),
      this.buildWorkspaceInstructionFileEntry(workspaceRoot, {
        id: 'project-local:copilot-instructions',
        category: 'copilot-instructions',
        label: 'Project-local Copilot instructions',
        relativePath: '.github/copilot-instructions.md',
        emitWhenMissing: false,
        missingRemediation: (entryPath) => `Add ${entryPath} if this workspace should expose repo-scoped Copilot instructions.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so repo-scoped Copilot instructions can be read safely.`,
      }),
      this.buildWorkspaceInstructionDirectoryEntry(workspaceRoot, {
        id: 'project-local:cursor-rules',
        category: 'cursor-rule',
        label: 'Project-local Cursor rules',
        relativePath: '.cursor/rules',
        emitWhenMissing: false,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listCursorRules(directoryPath),
        missingRemediation: (entryPath) => `Add one or more Cursor rule files under ${entryPath} to expose project-local Cursor instructions.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local Cursor rules can be read safely.`,
      }),
    ]);

    return compactEntries(entries);
  }

  private async collectCapabilityEntries(
    workspaceRoot: string,
    userGlobalConfigDir: string,
  ): Promise<WorkspaceCapabilityEntry[]> {
    const userGlobalToolsDir = this.resolveUserGlobalToolsDir();
    const userGlobalUsageCommandPath = getInstalledOpenCodeAssetPath(this.appPaths.installManifestFile, 'usageCommand')
      ?? path.join(userGlobalConfigDir, 'commands', 'usage.md');
    const userGlobalEffortPluginPath = getInstalledOpenCodeAssetPath(this.appPaths.installManifestFile, 'effortPlugin')
      ?? path.join(userGlobalConfigDir, 'plugins', 'effort-control.js');
    const userGlobalEffortHelperPath = getInstalledOpenCodeAssetPath(this.appPaths.installManifestFile, 'effortStateHelper')
      ?? path.join(userGlobalConfigDir, 'plugins', 'effort-control', 'state.js');
    const userGlobalProviderUsagePath = getInstalledToolPath(this.appPaths.installManifestFile, 'provider-usage.py')
      ?? path.join(userGlobalToolsDir, 'provider-usage.py');

    const entries = await Promise.all([
      this.buildWorkspaceCapabilityDirectoryEntry(workspaceRoot, {
        id: 'project-local:commands',
        category: 'command',
        sourceLayer: 'project-local',
        label: 'Project-local OpenCode commands',
        relativePath: 'opencode/commands',
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listMarkdownFiles(directoryPath),
        missingRemediation: (entryPath) => `Add command markdown files under ${entryPath} to surface project-local slash commands for this workspace.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local command assets can be read safely.`,
      }),
      this.buildWorkspaceCapabilityDirectoryEntry(workspaceRoot, {
        id: 'project-local:plugins',
        category: 'plugin',
        sourceLayer: 'project-local',
        label: 'Project-local OpenCode plugins',
        relativePath: 'opencode/plugins',
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listPluginAssets(directoryPath),
        missingRemediation: (entryPath) => `Add plugin assets under ${entryPath} to surface project-local plugin capabilities for this workspace.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local plugin assets can be read safely.`,
      }),
      this.buildWorkspaceCapabilityDirectoryEntry(workspaceRoot, {
        id: 'project-local:tools',
        category: 'tool',
        sourceLayer: 'project-local',
        label: 'Project-local OpenCode tools',
        relativePath: 'opencode/tools',
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listToolAssets(directoryPath),
        missingRemediation: (entryPath) => `Add executable helper assets under ${entryPath} to surface project-local tools for this workspace.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local tool assets can be read safely.`,
      }),
      this.buildWorkspaceCapabilityDirectoryEntry(workspaceRoot, {
        id: 'project-local:skills',
        category: 'skill',
        sourceLayer: 'project-local',
        label: 'Project-local skills',
        relativePath: 'opencode/skills',
        emitWhenMissing: false,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listSkillAssets(directoryPath),
        missingRemediation: (entryPath) => `Add skill folders with SKILL.md under ${entryPath} to surface project-local skills for this workspace.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local skills can be read safely.`,
      }),
      this.buildWorkspaceCapabilityDirectoryEntry(workspaceRoot, {
        id: 'project-local:mcp-assets',
        category: 'mcp-asset',
        sourceLayer: 'project-local',
        label: 'Project-local MCP assets',
        relativePath: '.opencode/mcp',
        emitWhenMissing: false,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listMcpAssets(directoryPath),
        missingRemediation: (entryPath) => `Add concrete MCP-facing config files under ${entryPath} to surface project-local MCP assets for this workspace.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local MCP assets can be read safely.`,
      }),
      this.buildWorkspaceCapabilityDirectoryEntry(workspaceRoot, {
        id: 'project-local:mcp-assets-opencode',
        category: 'mcp-asset',
        sourceLayer: 'project-local',
        label: 'Project-local OpenCode MCP assets',
        relativePath: 'opencode/mcp',
        emitWhenMissing: false,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listMcpAssets(directoryPath),
        missingRemediation: (entryPath) => `Add concrete MCP-facing config files under ${entryPath} to surface project-local OpenCode MCP assets.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so project-local OpenCode MCP assets can be read safely.`,
      }),
      this.buildWorkspaceCapabilityFileEntry(workspaceRoot, {
        id: 'project-local:usage-command',
        category: 'usage-asset',
        sourceLayer: 'project-local',
        label: 'Project-local usage command asset',
        relativePath: 'opencode/commands/usage.md',
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Add ${entryPath} if this workspace should provide a project-local usage command asset.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the project-local usage command asset can be read safely.`,
      }),
      this.buildWorkspaceCapabilityFileEntry(workspaceRoot, {
        id: 'project-local:provider-usage-tool',
        category: 'usage-asset',
        sourceLayer: 'project-local',
        label: 'Project-local provider usage tool asset',
        relativePath: 'opencode/tools/provider-usage.py',
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Add ${entryPath} if this workspace should provide a project-local provider usage tool.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the project-local provider usage tool can be read safely.`,
      }),
      this.buildWorkspaceCapabilityFileEntry(workspaceRoot, {
        id: 'project-local:effort-plugin',
        category: 'effort-asset',
        sourceLayer: 'project-local',
        label: 'Project-local effort plugin asset',
        relativePath: 'opencode/plugins/effort-control.js',
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Add ${entryPath} if this workspace should provide a project-local effort plugin asset.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the project-local effort plugin asset can be read safely.`,
      }),
      this.buildWorkspaceCapabilityFileEntry(workspaceRoot, {
        id: 'project-local:effort-helper',
        category: 'effort-asset',
        sourceLayer: 'project-local',
        label: 'Project-local effort helper asset',
        relativePath: 'opencode/plugins/effort-control/state.js',
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Add ${entryPath} if this workspace should provide a project-local effort helper asset.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the project-local effort helper asset can be read safely.`,
      }),
      this.buildWorkspaceCapabilityFileEntry(workspaceRoot, {
        id: 'project-local:effort-state-file',
        category: 'effort-asset',
        sourceLayer: 'project-local',
        label: 'Workspace effort state file',
        relativePath: path.relative(workspaceRoot, EffortService.stateFilePath(workspaceRoot)),
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Run a workspace effort command or restore ${entryPath} so the project-local effort state can be discovered honestly.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the workspace effort state file can be read safely.`,
      }),
      this.buildWorkspaceCapabilityFileEntry(workspaceRoot, {
        id: 'project-local:effort-trace-file',
        category: 'effort-asset',
        sourceLayer: 'project-local',
        label: 'Workspace effort trace file',
        relativePath: path.relative(workspaceRoot, EffortService.traceFilePath(workspaceRoot)),
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Generate or restore ${entryPath} so the project-local effort trace can be discovered honestly.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the workspace effort trace can be read safely.`,
      }),
      this.buildAbsoluteCapabilityDirectoryEntry({
        id: 'user-global:commands',
        category: 'command',
        sourceLayer: 'user-global',
        label: 'User-global OpenCode commands',
        absolutePath: path.join(userGlobalConfigDir, 'commands'),
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listMarkdownFiles(directoryPath),
        missingRemediation: (entryPath) => `Install or restore user-global command files under ${entryPath} to surface shared slash commands.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so user-global command assets can be read safely.`,
      }),
      this.buildAbsoluteCapabilityDirectoryEntry({
        id: 'user-global:plugins',
        category: 'plugin',
        sourceLayer: 'user-global',
        label: 'User-global OpenCode plugins',
        absolutePath: path.join(userGlobalConfigDir, 'plugins'),
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listPluginAssets(directoryPath),
        missingRemediation: (entryPath) => `Install or restore user-global plugin assets under ${entryPath} to surface shared plugin capabilities.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so user-global plugin assets can be read safely.`,
      }),
      this.buildAbsoluteCapabilityDirectoryEntry({
        id: 'user-global:tools',
        category: 'tool',
        sourceLayer: 'user-global',
        label: 'User-global support tools',
        absolutePath: userGlobalToolsDir,
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listToolAssets(directoryPath),
        missingRemediation: (entryPath) => `Install or restore user-global support tools under ${entryPath} to surface shared tool capabilities.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so user-global tool assets can be read safely.`,
      }),
      this.buildAbsoluteCapabilityDirectoryEntry({
        id: 'user-global:skills',
        category: 'skill',
        sourceLayer: 'user-global',
        label: 'User-global skills',
        absolutePath: path.join(userGlobalConfigDir, 'skills'),
        emitWhenMissing: false,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listSkillAssets(directoryPath),
        missingRemediation: (entryPath) => `Install or restore user-global skills under ${entryPath} to surface shared skills.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so user-global skills can be read safely.`,
      }),
      this.buildAbsoluteCapabilityDirectoryEntry({
        id: 'user-global:mcp-assets',
        category: 'mcp-asset',
        sourceLayer: 'user-global',
        label: 'User-global MCP assets',
        absolutePath: path.join(userGlobalConfigDir, 'mcp'),
        emitWhenMissing: false,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listMcpAssets(directoryPath),
        missingRemediation: (entryPath) => `Install or restore concrete MCP-facing config files under ${entryPath} to surface user-global MCP assets.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so user-global MCP assets can be read safely.`,
      }),
      this.buildAbsoluteCapabilityFileEntry({
        id: 'user-global:usage-command',
        category: 'usage-asset',
        sourceLayer: 'user-global',
        label: 'User-global usage command asset',
        absolutePath: userGlobalUsageCommandPath,
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Install or restore ${entryPath} so the user-global usage command asset is available.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the user-global usage command asset can be read safely.`,
      }),
      this.buildAbsoluteCapabilityFileEntry({
        id: 'user-global:provider-usage-tool',
        category: 'usage-asset',
        sourceLayer: 'user-global',
        label: 'User-global provider usage tool asset',
        absolutePath: userGlobalProviderUsagePath,
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Install or restore ${entryPath} so the user-global provider usage tool is available.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the user-global provider usage tool can be read safely.`,
      }),
      this.buildAbsoluteCapabilityFileEntry({
        id: 'user-global:effort-plugin',
        category: 'effort-asset',
        sourceLayer: 'user-global',
        label: 'User-global effort plugin asset',
        absolutePath: userGlobalEffortPluginPath,
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Install or restore ${entryPath} so the user-global effort plugin asset is available.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the user-global effort plugin asset can be read safely.`,
      }),
      this.buildAbsoluteCapabilityFileEntry({
        id: 'user-global:effort-helper',
        category: 'effort-asset',
        sourceLayer: 'user-global',
        label: 'User-global effort helper asset',
        absolutePath: userGlobalEffortHelperPath,
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Install or restore ${entryPath} so the user-global effort helper asset is available.`,
        degradedRemediation: (entryPath) => `Fix permissions or replace ${entryPath} so the user-global effort helper asset can be read safely.`,
      }),
      this.buildAbsoluteCapabilityDirectoryEntry({
        id: 'app-bundled:commands',
        category: 'command',
        sourceLayer: 'app-bundled',
        label: 'App-bundled OpenCode commands',
        absolutePath: path.join(this.bundledOpencodeRoot, 'commands'),
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listMarkdownFiles(directoryPath),
        missingRemediation: (entryPath) => `Reinstall or rebuild the web client so bundled command assets are restored under ${entryPath}.`,
        degradedRemediation: (entryPath) => `Fix permissions or reinstall the web client so bundled command assets at ${entryPath} are readable.`,
      }),
      this.buildAbsoluteCapabilityDirectoryEntry({
        id: 'app-bundled:plugins',
        category: 'plugin',
        sourceLayer: 'app-bundled',
        label: 'App-bundled OpenCode plugins',
        absolutePath: path.join(this.bundledOpencodeRoot, 'plugins'),
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listPluginAssets(directoryPath),
        missingRemediation: (entryPath) => `Reinstall or rebuild the web client so bundled plugin assets are restored under ${entryPath}.`,
        degradedRemediation: (entryPath) => `Fix permissions or reinstall the web client so bundled plugin assets at ${entryPath} are readable.`,
      }),
      this.buildAbsoluteCapabilityDirectoryEntry({
        id: 'app-bundled:tools',
        category: 'tool',
        sourceLayer: 'app-bundled',
        label: 'App-bundled support tools',
        absolutePath: this.bundledToolsRoot,
        emitWhenMissing: true,
        emptyStatus: 'missing',
        listItems: async (directoryPath) => this.listToolAssets(directoryPath),
        missingRemediation: (entryPath) => `Reinstall or rebuild the web client so bundled support tools are restored under ${entryPath}.`,
        degradedRemediation: (entryPath) => `Fix permissions or reinstall the web client so bundled support tools at ${entryPath} are readable.`,
      }),
      this.buildAbsoluteCapabilityFileEntry({
        id: 'app-bundled:usage-command',
        category: 'usage-asset',
        sourceLayer: 'app-bundled',
        label: 'App-bundled usage command asset',
        absolutePath: path.join(this.bundledOpencodeRoot, 'commands', 'usage.md'),
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Reinstall or rebuild the web client so the bundled usage command asset at ${entryPath} is restored.`,
        degradedRemediation: (entryPath) => `Fix permissions or reinstall the web client so the bundled usage command asset at ${entryPath} is readable.`,
      }),
      this.buildAbsoluteCapabilityFileEntry({
        id: 'app-bundled:provider-usage-tool',
        category: 'usage-asset',
        sourceLayer: 'app-bundled',
        label: 'App-bundled provider usage tool asset',
        absolutePath: path.join(this.bundledToolsRoot, 'provider-usage.py'),
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Reinstall or rebuild the web client so the bundled provider usage tool at ${entryPath} is restored.`,
        degradedRemediation: (entryPath) => `Fix permissions or reinstall the web client so the bundled provider usage tool at ${entryPath} is readable.`,
      }),
      this.buildAbsoluteCapabilityFileEntry({
        id: 'app-bundled:effort-plugin',
        category: 'effort-asset',
        sourceLayer: 'app-bundled',
        label: 'App-bundled effort plugin asset',
        absolutePath: path.join(this.bundledOpencodeRoot, 'plugins', 'effort-control.js'),
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Reinstall or rebuild the web client so the bundled effort plugin asset at ${entryPath} is restored.`,
        degradedRemediation: (entryPath) => `Fix permissions or reinstall the web client so the bundled effort plugin asset at ${entryPath} is readable.`,
      }),
      this.buildAbsoluteCapabilityFileEntry({
        id: 'app-bundled:effort-helper',
        category: 'effort-asset',
        sourceLayer: 'app-bundled',
        label: 'App-bundled effort helper asset',
        absolutePath: path.join(this.bundledOpencodeRoot, 'plugins', 'effort-control', 'state.js'),
        emitWhenMissing: true,
        missingRemediation: (entryPath) => `Reinstall or rebuild the web client so the bundled effort helper asset at ${entryPath} is restored.`,
        degradedRemediation: (entryPath) => `Fix permissions or reinstall the web client so the bundled effort helper asset at ${entryPath} is readable.`,
      }),
    ]);

    return compactEntries(entries);
  }

  private resolveOpencodeConfigDir(opencodeConfigDir?: string): string {
    return opencodeConfigDir
      ?? this.defaultOpencodeConfigDir
      ?? process.env['OPENCODE_CONFIG_DIR']
      ?? path.join(process.env['HOME'] || process.env['USERPROFILE'] || '', '.config', 'opencode');
  }

  private resolveUserGlobalToolsDir(): string {
    const installedProviderUsagePath = getInstalledToolPath(this.appPaths.installManifestFile, 'provider-usage.py');
    return installedProviderUsagePath ? path.dirname(installedProviderUsagePath) : this.appPaths.toolsDir;
  }

  private async buildWorkspaceInstructionFileEntry(
    workspaceRoot: string,
    spec: {
      id: string;
      category: WorkspaceInstructionSourceCategory;
      label: string;
      relativePath: string;
      emitWhenMissing: boolean;
      missingRemediation: (entryPath: string) => string;
      degradedRemediation: (entryPath: string) => string;
    },
  ): Promise<WorkspaceInstructionSourceEntry | undefined> {
    const probe = await this.probeWorkspaceFile(workspaceRoot, spec.relativePath, spec.emitWhenMissing);
    return probe
      ? this.createInstructionEntry(spec.id, spec.category, spec.label, probe, spec.missingRemediation, spec.degradedRemediation)
      : undefined;
  }

  private async buildWorkspaceInstructionDirectoryEntry(
    workspaceRoot: string,
    spec: {
      id: string;
      category: WorkspaceInstructionSourceCategory;
      label: string;
      relativePath: string;
      emitWhenMissing: boolean;
      emptyStatus: WorkspaceContextEntryStatus;
      listItems: (directoryPath: string) => Promise<string[]>;
      missingRemediation: (entryPath: string) => string;
      degradedRemediation: (entryPath: string) => string;
    },
  ): Promise<WorkspaceInstructionSourceEntry | undefined> {
    const probe = await this.probeWorkspaceDirectory(workspaceRoot, spec.relativePath, {
      emitWhenMissing: spec.emitWhenMissing,
      emptyStatus: spec.emptyStatus,
      listItems: spec.listItems,
    });
    return probe
      ? this.createInstructionEntry(spec.id, spec.category, spec.label, probe, spec.missingRemediation, spec.degradedRemediation)
      : undefined;
  }

  private async buildWorkspaceCapabilityFileEntry(
    workspaceRoot: string,
    spec: {
      id: string;
      category: WorkspaceCapabilityCategory;
      sourceLayer: WorkspaceContextSourceLayer;
      label: string;
      relativePath: string;
      emitWhenMissing: boolean;
      missingRemediation: (entryPath: string) => string;
      degradedRemediation: (entryPath: string) => string;
    },
  ): Promise<WorkspaceCapabilityEntry | undefined> {
    const probe = await this.probeWorkspaceFile(workspaceRoot, spec.relativePath, spec.emitWhenMissing);
    return probe
      ? this.createCapabilityEntry(spec.id, spec.category, spec.sourceLayer, spec.label, probe, spec.missingRemediation, spec.degradedRemediation)
      : undefined;
  }

  private async buildWorkspaceCapabilityDirectoryEntry(
    workspaceRoot: string,
    spec: {
      id: string;
      category: WorkspaceCapabilityCategory;
      sourceLayer: WorkspaceContextSourceLayer;
      label: string;
      relativePath: string;
      emitWhenMissing: boolean;
      emptyStatus: WorkspaceContextEntryStatus;
      listItems: (directoryPath: string) => Promise<string[]>;
      missingRemediation: (entryPath: string) => string;
      degradedRemediation: (entryPath: string) => string;
    },
  ): Promise<WorkspaceCapabilityEntry | undefined> {
    const probe = await this.probeWorkspaceDirectory(workspaceRoot, spec.relativePath, {
      emitWhenMissing: spec.emitWhenMissing,
      emptyStatus: spec.emptyStatus,
      listItems: spec.listItems,
    });
    return probe
      ? this.createCapabilityEntry(spec.id, spec.category, spec.sourceLayer, spec.label, probe, spec.missingRemediation, spec.degradedRemediation)
      : undefined;
  }

  private async buildAbsoluteCapabilityFileEntry(
    spec: {
      id: string;
      category: WorkspaceCapabilityCategory;
      sourceLayer: WorkspaceContextSourceLayer;
      label: string;
      absolutePath: string;
      emitWhenMissing: boolean;
      missingRemediation: (entryPath: string) => string;
      degradedRemediation: (entryPath: string) => string;
    },
  ): Promise<WorkspaceCapabilityEntry | undefined> {
    const probe = await this.probeAbsoluteFile(spec.absolutePath, spec.emitWhenMissing);
    return probe
      ? this.createCapabilityEntry(spec.id, spec.category, spec.sourceLayer, spec.label, probe, spec.missingRemediation, spec.degradedRemediation)
      : undefined;
  }

  private async buildAbsoluteCapabilityDirectoryEntry(
    spec: {
      id: string;
      category: WorkspaceCapabilityCategory;
      sourceLayer: WorkspaceContextSourceLayer;
      label: string;
      absolutePath: string;
      emitWhenMissing: boolean;
      emptyStatus: WorkspaceContextEntryStatus;
      listItems: (directoryPath: string) => Promise<string[]>;
      missingRemediation: (entryPath: string) => string;
      degradedRemediation: (entryPath: string) => string;
    },
  ): Promise<WorkspaceCapabilityEntry | undefined> {
    const probe = await this.probeAbsoluteDirectory(spec.absolutePath, {
      emitWhenMissing: spec.emitWhenMissing,
      emptyStatus: spec.emptyStatus,
      listItems: spec.listItems,
    });
    return probe
      ? this.createCapabilityEntry(spec.id, spec.category, spec.sourceLayer, spec.label, probe, spec.missingRemediation, spec.degradedRemediation)
      : undefined;
  }

  private createInstructionEntry(
    id: string,
    category: WorkspaceInstructionSourceCategory,
    label: string,
    probe: ProbeResult,
    missingRemediation: (entryPath: string) => string,
    degradedRemediation: (entryPath: string) => string,
  ): WorkspaceInstructionSourceEntry {
    return {
      id,
      category,
      sourceLayer: 'project-local',
      label,
      status: probe.status,
      path: probe.path,
      ...(probe.detail ? { detail: probe.detail } : {}),
      ...(probe.itemCount !== undefined ? { itemCount: probe.itemCount } : {}),
      ...(probe.items ? { items: probe.items } : {}),
      ...(probe.status === 'available'
        ? {}
        : { remediation: probe.status === 'missing' ? missingRemediation(probe.path) : degradedRemediation(probe.path) }),
    };
  }

  private createCapabilityEntry(
    id: string,
    category: WorkspaceCapabilityCategory,
    sourceLayer: WorkspaceContextSourceLayer,
    label: string,
    probe: ProbeResult,
    missingRemediation: (entryPath: string) => string,
    degradedRemediation: (entryPath: string) => string,
  ): WorkspaceCapabilityEntry {
    return {
      id,
      category,
      sourceLayer,
      label,
      status: probe.status,
      path: probe.path,
      ...(probe.detail ? { detail: probe.detail } : {}),
      ...(probe.itemCount !== undefined ? { itemCount: probe.itemCount } : {}),
      ...(probe.items ? { items: probe.items } : {}),
      ...(probe.status === 'available'
        ? {}
        : { remediation: probe.status === 'missing' ? missingRemediation(probe.path) : degradedRemediation(probe.path) }),
    };
  }

  private async probeWorkspaceFile(
    workspaceRoot: string,
    relativePath: string,
    emitWhenMissing: boolean,
  ): Promise<ProbeResult | undefined> {
    const candidatePath = resolveWorkspaceProbePath(workspaceRoot, relativePath);

    let actualPath: string;
    try {
      actualPath = resolveWorkspacePath(workspaceRoot, relativePath);
    } catch (error) {
      if (isMissingPathError(error)) {
        return emitWhenMissing ? { status: 'missing', path: candidatePath, detail: 'Expected file was not found.' } : undefined;
      }
      return { status: 'degraded', path: candidatePath, detail: toErrorMessage(error) };
    }

    return this.probeResolvedFile(actualPath, candidatePath, emitWhenMissing);
  }

  private async probeAbsoluteFile(absolutePath: string, emitWhenMissing: boolean): Promise<ProbeResult | undefined> {
    return this.probeResolvedFile(absolutePath, absolutePath, emitWhenMissing);
  }

  private async probeResolvedFile(
    actualPath: string,
    displayPath: string,
    emitWhenMissing: boolean,
  ): Promise<ProbeResult | undefined> {
    try {
      const stats = await this.stat(actualPath);
      if (!stats.isFile()) {
        return { status: 'degraded', path: displayPath, detail: 'Expected a file but found a different kind of path.' };
      }
      await this.access(actualPath, constants.R_OK);
      return { status: 'available', path: displayPath, detail: 'Readable file detected.' };
    } catch (error) {
      if (isMissingPathError(error)) {
        return emitWhenMissing ? { status: 'missing', path: displayPath, detail: 'Expected file was not found.' } : undefined;
      }
      return { status: 'degraded', path: displayPath, detail: toErrorMessage(error) };
    }
  }

  private async probeWorkspaceDirectory(
    workspaceRoot: string,
    relativePath: string,
    options: DirectoryProbeOptions,
  ): Promise<ProbeResult | undefined> {
    const candidatePath = resolveWorkspaceProbePath(workspaceRoot, relativePath);

    let actualPath: string;
    try {
      actualPath = resolveWorkspacePath(workspaceRoot, relativePath);
    } catch (error) {
      if (isMissingPathError(error)) {
        return options.emitWhenMissing ? { status: 'missing', path: candidatePath, detail: 'Expected directory was not found.' } : undefined;
      }
      return { status: 'degraded', path: candidatePath, detail: toErrorMessage(error) };
    }

    return this.probeResolvedDirectory(actualPath, candidatePath, options);
  }

  private async probeAbsoluteDirectory(
    absolutePath: string,
    options: DirectoryProbeOptions,
  ): Promise<ProbeResult | undefined> {
    return this.probeResolvedDirectory(absolutePath, absolutePath, options);
  }

  private async probeResolvedDirectory(
    actualPath: string,
    displayPath: string,
    options: DirectoryProbeOptions,
  ): Promise<ProbeResult | undefined> {
    try {
      const stats = await this.stat(actualPath);
      if (!stats.isDirectory()) {
        return { status: 'degraded', path: displayPath, detail: 'Expected a directory but found a different kind of path.' };
      }
      await this.access(actualPath, constants.R_OK | constants.X_OK);
      const items = await options.listItems(actualPath);
      if (items.length === 0) {
        return {
          status: options.emptyStatus,
          path: displayPath,
          detail: options.emptyStatus === 'available'
            ? 'The directory is present but no supported items were discovered.'
            : 'No supported items were discovered in this directory.',
          itemCount: 0,
          items: [],
        };
      }
      return {
        status: 'available',
        path: displayPath,
        detail: `${items.length} supported item${items.length === 1 ? '' : 's'} discovered.`,
        itemCount: items.length,
        items: items.slice(0, MAX_ITEM_PREVIEW),
      };
    } catch (error) {
      if (isMissingPathError(error)) {
        return options.emitWhenMissing ? { status: 'missing', path: displayPath, detail: 'Expected directory was not found.' } : undefined;
      }
      return { status: 'degraded', path: displayPath, detail: toErrorMessage(error) };
    }
  }

  private async listTopLevelEntries(directoryPath: string): Promise<string[]> {
    const entries = await this.readDirEntries(directoryPath);
    return entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  private async listMarkdownFiles(directoryPath: string): Promise<string[]> {
    const entries = await this.readDirEntries(directoryPath);
    return entries
      .filter((entry) => entry.isFile() && MARKDOWN_FILE_RE.test(entry.name) && !TEST_FILE_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  private async listCursorRules(directoryPath: string): Promise<string[]> {
    const entries = await this.readDirEntries(directoryPath);
    return entries
      .filter((entry) => entry.isFile() && CURSOR_RULE_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  private async listPluginAssets(directoryPath: string): Promise<string[]> {
    const entries = await this.readDirEntries(directoryPath);
    return entries
      .filter((entry) => !entry.name.startsWith('.'))
      .filter((entry) => entry.isDirectory() || (entry.isFile() && SCRIPT_FILE_RE.test(entry.name) && !TEST_FILE_RE.test(entry.name)))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  private async listToolAssets(directoryPath: string): Promise<string[]> {
    const entries = await this.readDirEntries(directoryPath);
    return entries
      .filter((entry) => entry.isFile() && TOOL_FILE_RE.test(entry.name) && !TEST_FILE_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  private async listSkillAssets(directoryPath: string): Promise<string[]> {
    const entries = await this.readDirEntries(directoryPath);
    const skillNames: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }
      const skillFilePath = path.join(directoryPath, entry.name, 'SKILL.md');
      try {
        await this.access(skillFilePath, constants.R_OK);
        skillNames.push(entry.name);
      } catch (error) {
        if (isMissingPathError(error)) {
          continue;
        }
        throw error;
      }
    }

    return skillNames.sort((left, right) => left.localeCompare(right));
  }

  private async listMcpAssets(directoryPath: string): Promise<string[]> {
    const entries = await this.readDirEntries(directoryPath);
    return entries
      .filter((entry) => !entry.name.startsWith('.'))
      .filter((entry) => entry.isDirectory() || (entry.isFile() && MCP_FILE_RE.test(entry.name)))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  private async readDirEntries(directoryPath: string): Promise<Dirent[]> {
    return await this.readdir(directoryPath, { withFileTypes: true, encoding: 'utf-8' }) as Dirent[];
  }
}

function compareInstructionEntries(
  left: WorkspaceInstructionSourceEntry,
  right: WorkspaceInstructionSourceEntry,
): number {
  const categoryDelta = INSTRUCTION_CATEGORY_ORDER[left.category] - INSTRUCTION_CATEGORY_ORDER[right.category];
  if (categoryDelta !== 0) {
    return categoryDelta;
  }
  return left.label.localeCompare(right.label);
}

function compareCapabilityEntries(
  left: WorkspaceCapabilityEntry,
  right: WorkspaceCapabilityEntry,
): number {
  const sourceDelta = SOURCE_LAYER_ORDER[left.sourceLayer] - SOURCE_LAYER_ORDER[right.sourceLayer];
  if (sourceDelta !== 0) {
    return sourceDelta;
  }
  const categoryDelta = CAPABILITY_CATEGORY_ORDER[left.category] - CAPABILITY_CATEGORY_ORDER[right.category];
  if (categoryDelta !== 0) {
    return categoryDelta;
  }
  return left.label.localeCompare(right.label);
}

function compactEntries<T>(entries: Array<T | undefined>): T[] {
  return entries.filter((entry): entry is T => entry !== undefined);
}

function isMissingPathError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { code?: unknown }).code === 'ENOENT';
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Unknown error';
}
