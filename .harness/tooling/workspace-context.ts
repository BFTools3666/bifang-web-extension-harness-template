import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import type { ProjectConfig } from "./types.ts"

/** 在单前端身份缺席时读取实际 Workspace，供根 PRD/原型工具复用稳定实例。 */
export async function loadWorkspaceProjectConfig(
  root: string,
  loadMember: (root: string) => Promise<ProjectConfig>,
  memberDirectory?: string
): Promise<ProjectConfig> {
  const workspace = JSON.parse(
    await readFile(path.join(root, ".harness/workspace.json"), "utf8")
  ) as Record<string, unknown>
  if (
    workspace.kind !== "workspace" ||
    workspace.schemaVersion !== 1 ||
    typeof workspace.id !== "string" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(workspace.id) ||
    typeof workspace.initializedAt !== "string" ||
    !Array.isArray(workspace.members)
  )
    throw new Error("无效 Workspace 身份")
  const frontends = workspace.members.filter(
    (item: unknown) =>
      item &&
      typeof item === "object" &&
      "type" in item &&
      ["web", "extension"].includes(String(item.type))
  ) as { type: "web" | "extension"; directory: string }[]
  if (frontends.length > 1 && memberDirectory === undefined)
    throw new Error("Workspace 有多个前端，请通过 --member 指定成员目录")
  const selected =
    memberDirectory === undefined
      ? frontends[0]
      : frontends.find((member) => member.directory === memberDirectory)
  if (
    !selected ||
    !new RegExp(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*_${selected.type}$`).test(selected.directory)
  )
    throw new Error("纯服务工作区没有前端原型；请选择真实前端成员")
  const directory = path.join(root, selected.directory)
  if (
    (await lstat(directory)).isSymbolicLink() ||
    (await realpath(directory)) !== path.resolve(directory)
  )
    throw new Error("Workspace 成员路径无效")
  const member = await loadMember(directory)
  if (member.id !== selected.directory || member.projectType !== selected.type)
    throw new Error("Workspace 前端身份不一致")
  // 首个标准成员保留原根评审身份，追加成员始终使用自己的身份。
  const primary =
    selected === frontends[0] && selected.directory === `${workspace.id}_${selected.type}`
  return primary ? { ...member, id: workspace.id, initializedAt: workspace.initializedAt } : member
}

/** 只有精确登记的成员可以把产品记录解析回自己的 Workspace 根。 */
export async function resolveWorkspaceContextRoot(root: string): Promise<string> {
  const parent = path.dirname(root)
  let value: unknown
  try {
    value = JSON.parse(await readFile(path.join(parent, ".harness/workspace.json"), "utf8"))
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return root
    throw error
  }
  const workspace = value as { kind?: unknown; members?: unknown }
  if (
    workspace.kind !== "workspace" ||
    !Array.isArray(workspace.members) ||
    !workspace.members.some(
      (item) =>
        item &&
        typeof item === "object" &&
        "directory" in item &&
        item.directory === path.basename(root)
    )
  )
    throw new Error("当前成员未登记在父 Workspace")
  if ((await realpath(root)) !== path.resolve(root)) throw new Error("成员上下文不得使用链接路径")
  return parent
}

/** 仅精确登记且身份一致的本地成员可免于正式环境的远端地址要求。 */
export async function isLocalWorkspaceMember(
  root: string,
  project: ProjectConfig
): Promise<boolean> {
  const status = await lstat(root)
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("本地成员路径无效")
  const canonicalRoot = await realpath(root)
  const context = await resolveWorkspaceContextRoot(canonicalRoot)
  if (context === canonicalRoot) return false
  const workspace = JSON.parse(
    await readFile(path.join(context, ".harness/workspace.json"), "utf8")
  )
  if (workspace.service?.mode !== "none") return false
  if (
    workspace.schemaVersion !== 1 ||
    typeof workspace.id !== "string" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(workspace.id) ||
    typeof workspace.initializedAt !== "string" ||
    workspace.service.developmentBaseUrl !== "" ||
    workspace.service.apiContract ||
    !workspace.members.every(
      (member: { type: string; directory: string }) =>
        ["web", "extension"].includes(member.type) &&
        new RegExp(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*_${member.type}$`).test(member.directory)
    ) ||
    !workspace.members.some(
      (member: { type: string; directory: string }) =>
        member.directory === project.id &&
        member.type === project.projectType &&
        member.directory === path.basename(canonicalRoot)
    )
  )
    throw new Error("纯本地 Workspace 成员或服务身份不一致")
  const seen = new Set<string>()
  for (const member of workspace.members as { type: string; directory: string }[]) {
    if (seen.has(member.directory)) throw new Error("Workspace 成员不能重复")
    seen.add(member.directory)
    const directory = path.join(context, member.directory)
    const status = await lstat(directory)
    if (
      !status.isDirectory() ||
      status.isSymbolicLink() ||
      (await realpath(directory)) !== directory
    )
      throw new Error("Workspace 成员路径无效")
    const identity = JSON.parse(
      await readFile(path.join(directory, ".harness/project.json"), "utf8")
    )
    if (
      identity.schemaVersion !== 1 ||
      identity.id !== member.directory ||
      identity.projectType !== member.type
    )
      throw new Error("Workspace 成员身份不一致")
  }
  return true
}
