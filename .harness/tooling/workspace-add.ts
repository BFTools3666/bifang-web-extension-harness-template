import { lstat, mkdtemp, readFile, realpath, rename, rm } from "node:fs/promises"
import path from "node:path"
import {
  readBoundFileStable,
  writeBoundFileAtomic,
  type StableFileRead
} from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-mutation.ts"
import { validateAgentPolicyDocument, normalizeAgentPolicy } from "./agent-policy.ts"
import { loadProjectConfig } from "./config.ts"
import { lstatIfPresent, sha256Hex, writeJsonNew, writeNew } from "./files.ts"
import { initializeProject, assertDownstreamInitializationRoot } from "./init.ts"
import { instantiateProject } from "./instantiate.ts"
import {
  captureDirectorySnapshot,
  acquireInitializationLease,
  releaseInitializationLease,
  cleanupStagingRoot,
  commitStagedProject
} from "./instantiate-target.ts"
import { deriveProjectId, validateProjectId } from "./initialization-input.ts"
import { finalizeWorkspaceFrontend } from "./workspace-frontend.ts"
import { workspacePackage } from "./workspace-documents.ts"
import { runCommand } from "./process.ts"
import type { AgentPolicyChoice, InitOptions, ProjectConfig, ProjectType } from "./types.ts"
import type { WorkspaceConfig } from "./workspace.ts"
import { validateLock } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-snapshot.ts"
import { captureTemplateSnapshot, assertTemplateSnapshotUnchanged } from "./source-snapshot.ts"

/** 只在文件已被稳定捕获且确有字节时读取，不用断言掩盖缺失输入。 */
function fileBytes(files: Map<string, StableFileRead>, file: string): Buffer {
  const bytes = files.get(file)?.bytes
  if (bytes === undefined) throw new Error(`Workspace 缺少普通文件：${file}`)
  return bytes
}

/** 追加只消费新身份与根服务，不重新询问或改写 Workspace 策略。 */
export interface AddWorkspaceFrontendOptions {
  sourceRoot: string
  workspaceRoot: string
  projectType: ProjectType
  name: string
  englishName?: string
  id?: string
  description?: string
  brandColor?: string
  logoPath?: string
  testBaseUrl?: string
  releaseBaseUrl?: string
}

/** 仅供隔离回归替换安装，不向 CLI 暴露跳过依赖安装的参数。 */
export interface AddWorkspaceFrontendRuntime {
  commandRunner?: typeof runCommand
  skipInstall?: boolean
}

/** 读取经过文档校验的既有五项策略，保留原始确认来源。 */
function inheritedPolicy(document: string): InitOptions["agentPolicy"] {
  const errors = validateAgentPolicyDocument(document, { allowPending: false })
  if (errors.length) throw new Error(`Workspace 策略未就绪：${errors.join("；")}`)
  const header = document.replaceAll("\r\n", "\n").split("\n---")[0] ?? ""
  const fields = new Map(
    header
      .split("\n")
      .slice(1)
      .filter((line) => line.includes(":"))
      .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()])
  )
  return normalizeAgentPolicy({
    confirmedBy: fields.get("confirmed_by") ?? "",
    confirmedAt: fields.get("confirmed_at") ?? "",
    superpowers: fields.get("superpowers") as AgentPolicyChoice,
    userOwnedTasks: fields.get("user_owned_tasks") as AgentPolicyChoice,
    parallelWorktreeSubagents: fields.get("parallel_worktree_subagents") as AgentPolicyChoice,
    acceptanceSmoke: fields.get("acceptance_smoke") as AgentPolicyChoice,
    e2eHint: fields.get("e2e_hint") as AgentPolicyChoice
  })
}

/** 精确替换受管脚本，保留用户新增脚本，冲突在任何发布写入前拒绝。 */
function memberPackage(
  before: WorkspaceConfig,
  after: WorkspaceConfig,
  manifest: Record<string, unknown>
) {
  const source = { ...manifest, devDependencies: { tsx: "", sharp: "" } }
  const previous = workspacePackage(before, source).scripts
  const next = workspacePackage(after, source).scripts
  const scripts = { ...(manifest.scripts as Record<string, string>) }
  for (const [key, value] of Object.entries(previous)) {
    if (scripts[key] !== value) throw new Error(`根脚本 ${key} 已有本地修改，请先合并成员命令合同`)
    delete scripts[key]
  }
  for (const key of Object.keys(next))
    if (key in scripts) throw new Error(`新成员命令与已有脚本冲突：${key}`)
  return { ...manifest, scripts: { ...scripts, ...next } }
}

/** 复核文件内容和权限，连原先缺席的控制文件出现也必须阻断。 */
async function assertFiles(root: string, files: Map<string, StableFileRead>) {
  for (const [file, before] of files) {
    const current = await readBoundFileStable(root, file, undefined, true)
    if (JSON.stringify(current.snapshot) !== JSON.stringify(before.snapshot))
      throw new Error(`Workspace 文件在追加期间发生变化：${file}`)
  }
}

/** 替换完整 packages 段并保留段内注释，不能留下原成员造成重复声明。 */
function appendPnpmMember(policy: string, config: WorkspaceConfig): string {
  const lines = policy.replaceAll("\r\n", "\n").split("\n")
  const start = lines.findIndex((line) => /^packages:/u.test(line))
  if (start < 0) throw new Error("缺少精确的 pnpm 成员段")
  let end = start + 1
  while (
    (end < lines.length && /^[ \t]*(?:#.*)?$/u.test(lines[end] ?? "")) ||
    (end < lines.length && /^[ \t]/u.test(lines[end] ?? ""))
  )
    end++
  const comments = lines.slice(start + 1, end).filter((line) => /^[ \t]*#/u.test(line))
  lines.splice(
    start,
    end - start,
    "packages:",
    ...comments,
    ...config.members
      .filter((item) => item.type !== "server")
      .map((item) => `  - ${JSON.stringify(item.directory)}`)
  )
  return lines.join("\n")
}

/** 从源快照准备独立前端，精确登记到现有根；失败只回收本次持有的目录与写入。 */
export async function addWorkspaceFrontend(
  options: AddWorkspaceFrontendOptions,
  runtime: AddWorkspaceFrontendRuntime = {}
): Promise<ProjectConfig> {
  const requestedRoot = path.resolve(options.workspaceRoot)
  await assertDownstreamInitializationRoot(requestedRoot)
  if ((await lstat(requestedRoot)).isSymbolicLink()) throw new Error("Workspace 根不能是符号链接")
  const root = await realpath(requestedRoot)
  const rootIdentity = await captureDirectorySnapshot(root, "Workspace")
  /** 每次根写入和恢复都复验同一目录，不能沿替换后的根覆盖用户文件。 */
  async function assertWorkspaceRoot(): Promise<void> {
    if (
      JSON.stringify(await captureDirectorySnapshot(root, "Workspace")) !==
      JSON.stringify(rootIdentity)
    )
      throw new Error("Workspace 目录身份在追加期间变化")
  }
  const sourceRoot = await realpath(options.sourceRoot)
  const relative = path.relative(sourceRoot, root)
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  )
    throw new Error("Workspace 必须在源 Harness 之外")
  if (!["web", "extension"].includes(options.projectType))
    throw new Error("追加成员必须明确选择 Web / Extension")
  const name = options.name?.trim()
  if (!name || /[\r\n]/u.test(name) || name.includes("\0"))
    throw new Error("新增前端必须由用户明确提供非空的新名称")
  if (options.projectType === "extension" && !options.description?.trim())
    throw new Error("新增 Extension 必须提供非空简短说明（--description）")
  const id = options.id ?? deriveProjectId(name, options.englishName)
  if (!id) throw new Error("请提供新名称的英文译名，不能自动编号或沿用已有名称")
  validateProjectId(id)
  const directory = `${id}_${options.projectType}`
  const module = await import(new URL("../runtime/workspace.mjs", import.meta.url).href)
  const readWorkspace: (root: string) => Promise<WorkspaceConfig> = module.readWorkspace
  const parent = path.dirname(root)
  const parentIdentity = await captureDirectorySnapshot(parent, "Workspace parent")
  const lease = await acquireInitializationLease(parent, path.basename(root), parentIdentity)
  let stage: string | undefined
  let stageIdentity: Awaited<ReturnType<typeof captureDirectorySnapshot>> | undefined
  const stagePrefix = `.${path.basename(root)}.harness-stage-`
  const runner = runtime.commandRunner ?? runCommand
  try {
    const workspace = await readWorkspace(root)
    const runtimeSource = await readFile(path.join(root, ".harness/runtime/workspace.mjs"), "utf8")
    if (!runtimeSource.includes("selectWorkspaceMembers"))
      throw new Error("此 Workspace 尚不支持多前端，请先按 $web-upgrade-harness 升级工程层")
    const snapshots = new Map<string, StableFileRead>()
    for (const file of [
      ".harness/workspace.json",
      "package.json",
      "pnpm-workspace.yaml",
      "pnpm-lock.yaml",
      "docs/AGENT_POLICY.md",
      ".harness/upstream-lock.json",
      ".harness/runtime/workspace.mjs",
      ".harness/runtime/release.mjs"
    ])
      snapshots.set(file, await readBoundFileStable(root, file, undefined, true))
    if (
      JSON.stringify(
        JSON.parse(fileBytes(snapshots, ".harness/workspace.json").toString("utf8"))
      ) !== JSON.stringify(workspace)
    )
      throw new Error("Workspace 身份在读取期间变化")
    const names = new Set([workspace.name.trim().normalize("NFKC").toLowerCase()])
    const ids = new Set([workspace.id])
    for (const member of workspace.members) {
      ids.add(member.directory.replace(/_(?:web|extension|server)$/u, ""))
      if (member.type === "server") continue
      const identityFile = `${member.directory}/.harness/project.json`
      snapshots.set(identityFile, await readBoundFileStable(root, identityFile))
      const identity = await loadProjectConfig(path.join(root, member.directory))
      names.add(identity.name.normalize("NFKC").trim().toLowerCase())
    }
    if (names.has(name.normalize("NFKC").toLowerCase()) || ids.has(id))
      throw new Error("新增前端名称或英文标识已存在，请由用户提供新的名字")
    if (await lstatIfPresent(path.join(root, directory)))
      throw new Error(`成员目标已存在：${directory}`)
    const config: WorkspaceConfig = {
      ...workspace,
      members: [...workspace.members, { type: options.projectType, directory, name }]
    }
    const manifest = JSON.parse(fileBytes(snapshots, "package.json").toString("utf8")) as Record<
      string,
      unknown
    >
    const packageJson = memberPackage(workspace, config, manifest)
    const policy = fileBytes(snapshots, "pnpm-workspace.yaml").toString("utf8")
    const workspacePolicy = appendPnpmMember(policy, config)
    for (const file of [".pnpmfile.cjs", ".pnpmfile.mjs"]) {
      const observed = await readBoundFileStable(root, file, undefined, true)
      snapshots.set(file, observed)
      if (observed.exists) throw new Error("追加暂不支持自定义 pnpm hook；请先处理依赖解析合同")
    }
    if (/"(?:file|link|portal):/u.test(JSON.stringify(manifest)))
      throw new Error("追加暂不支持根 manifest 的本地路径依赖，请先处理根依赖解析合同")
    if (/^(?:patchedDependencies|catalogs?|configDependencies):/mu.test(policy))
      throw new Error("追加暂不支持依赖补丁或 catalog；请先处理根依赖解析合同")
    const npmrc = await readBoundFileStable(root, ".npmrc", undefined, true)
    snapshots.set(".npmrc", npmrc)
    if (
      npmrc.bytes &&
      /(?:pnpmfile|cafile|certfile|keyfile)\s*=|=[ \t]*\.{1,2}[/\\]/mu.test(
        npmrc.bytes.toString("utf8")
      )
    )
      throw new Error("追加暂不支持 .npmrc 的本地文件引用；请先处理根依赖解析合同")
    const init: Omit<InitOptions, "root"> = {
      projectType: options.projectType,
      id: directory,
      name,
      description: options.description ?? name,
      brandColor: options.brandColor ?? "#4C6EF5",
      logoPath: options.logoPath,
      serverMode: workspace.service.mode,
      developmentBaseUrl: workspace.service.developmentBaseUrl,
      testBaseUrl: options.testBaseUrl ?? "",
      releaseBaseUrl: options.releaseBaseUrl ?? "",
      agentPolicy: inheritedPolicy(fileBytes(snapshots, "docs/AGENT_POLICY.md").toString("utf8")),
      skipInstall: true
    }
    if (workspace.service.mode === "none" && (init.testBaseUrl || init.releaseBaseUrl))
      throw new Error("纯本地 Workspace 不能给新成员配置服务地址")
    // 先核对升级基线，追加只扩展拓扑，不重写既有文件指纹。
    const upstream = snapshots.get(".harness/upstream-lock.json")?.bytes
    let updatedLock: Record<string, unknown> | undefined
    if (upstream) {
      const previous = validateLock(JSON.parse(upstream.toString("utf8")))
      if (
        JSON.stringify(previous.workspace) !==
        JSON.stringify({ id: workspace.id, members: workspace.members })
      )
        throw new Error("升级基线与当前 Workspace 拓扑不一致，请先完成既有升级处理")
      updatedLock = { ...previous, workspace: { id: workspace.id, members: config.members } }
    }
    stage = await mkdtemp(path.join(parent, stagePrefix))
    stageIdentity = await captureDirectorySnapshot(stage, "Member staging")
    const memberRoot = path.join(stage, directory)
    const project = await instantiateProject(
      { sourceRoot, targetRoot: memberRoot, init },
      initializeProject
    )
    await finalizeWorkspaceFrontend(
      memberRoot,
      options.projectType,
      workspace.service.mode === "create"
    )
    await rm(path.join(memberRoot, "docs/requirements"), { recursive: true, force: true })
    // 只复制既有成员的 manifest 来解析依赖，不复制其产品源码或运行其生命周期脚本。
    for (const member of workspace.members.filter((item) => item.type !== "server")) {
      const file = `${member.directory}/package.json`
      const source = await readBoundFileStable(root, file)
      snapshots.set(file, source)
      if (/"(?:file|link|portal):/u.test(source.bytes?.toString("utf8") ?? ""))
        throw new Error("追加暂不支持成员 manifest 的本地路径依赖，请先处理根依赖解析合同")
      await writeNew(path.join(stage, file), fileBytes(snapshots, file))
    }
    await writeJsonNew(path.join(stage, "package.json"), packageJson)
    await writeNew(path.join(stage, "pnpm-workspace.yaml"), workspacePolicy)
    if (npmrc.bytes) await writeNew(path.join(stage, ".npmrc"), npmrc.bytes)
    const previousLock = snapshots.get("pnpm-lock.yaml")?.bytes
    if (previousLock) await writeNew(path.join(stage, "pnpm-lock.yaml"), previousLock)
    if (!runtime.skipInstall)
      await runner(
        "pnpm",
        [
          "install",
          "--lockfile-only",
          "--ignore-scripts",
          "--no-frozen-lockfile",
          "--prefer-offline"
        ],
        stage
      )
    await assertFiles(root, snapshots)
    await assertWorkspaceRoot()
    if (await lstatIfPresent(path.join(root, directory)))
      throw new Error("新成员目录在准备期间出现")
    const changes = new Map<string, Buffer>([
      ["package.json", Buffer.from(JSON.stringify(packageJson, null, 2) + "\n")],
      ["pnpm-workspace.yaml", Buffer.from(workspacePolicy)],
      [".harness/workspace.json", Buffer.from(JSON.stringify(config, null, 2) + "\n")]
    ])
    if (!runtime.skipInstall)
      changes.set("pnpm-lock.yaml", await readFile(path.join(stage, "pnpm-lock.yaml")))
    if (updatedLock)
      changes.set(
        ".harness/upstream-lock.json",
        Buffer.from(JSON.stringify(updatedLock, null, 2) + "\n")
      )
    const applied: string[] = []
    const published = await captureDirectorySnapshot(memberRoot, "New member")
    await commitStagedProject(
      memberRoot,
      path.join(root, directory),
      { kind: "absent" },
      rootIdentity,
      published
    )
    const publishedContents = await captureTemplateSnapshot(
      path.join(root, directory),
      (_relative, name) => name !== "node_modules"
    )
    try {
      for (const [file, contents] of changes) {
        await assertWorkspaceRoot()
        const before = snapshots.get(file)
        await writeBoundFileAtomic(
          root,
          file,
          contents,
          before?.snapshot ?? null,
          before?.snapshot?.mode ?? 0o644,
          sha256Hex(contents)
        )
        applied.push(file)
      }
      await readWorkspace(root)
      if (!runtime.skipInstall)
        await runner("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], root)
      await assertWorkspaceRoot()
      await readWorkspace(root)
      await assertFiles(root, new Map([...snapshots].filter(([file]) => !changes.has(file))))
      for (const [file, contents] of changes)
        await readBoundFileStable(root, file, {
          sha256: sha256Hex(contents),
          mode: snapshots.get(file)?.snapshot?.mode ?? 0o644
        })
      return project
    } catch (error) {
      const failures: unknown[] = []
      for (const file of applied.reverse()) {
        try {
          await assertWorkspaceRoot()
          const contents = changes.get(file)
          if (!contents) throw new Error("缺少本次写入快照", { cause: error })
          const before = snapshots.get(file)
          const current = await readBoundFileStable(root, file, {
            sha256: sha256Hex(contents),
            mode: before?.snapshot?.mode ?? 0o644
          })
          if (before?.bytes && before.snapshot && current.snapshot)
            await writeBoundFileAtomic(
              root,
              file,
              before.bytes,
              current.snapshot,
              before.snapshot.mode,
              sha256Hex(before.bytes)
            )
          else await rm(path.join(root, file))
        } catch (failure) {
          failures.push(failure)
        }
      }
      if (!failures.length) {
        try {
          await assertWorkspaceRoot()
          if (
            JSON.stringify(
              await captureDirectorySnapshot(path.join(root, directory), "Published member")
            ) !== JSON.stringify(published)
          )
            throw new Error("新成员已被替换，拒绝回收", { cause: error })
          await assertTemplateSnapshotUnchanged(
            publishedContents,
            (_relative, name) => name !== "node_modules"
          )
          await rename(path.join(root, directory), memberRoot)
        } catch (failure) {
          failures.push(failure)
        }
      }
      if (failures.length)
        throw new AggregateError(
          [error, ...failures],
          "追加失败，现场已保留；请核对根登记与新成员后恢复",
          { cause: error }
        )
      throw error
    }
  } finally {
    if (stage && stageIdentity)
      await cleanupStagingRoot(stage, parent, stagePrefix, parentIdentity, stageIdentity)
    await releaseInitializationLease(parent, parentIdentity, lease.root, lease.snapshot)
  }
}
