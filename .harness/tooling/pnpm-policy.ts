import { readFile } from "node:fs/promises"
import path from "node:path"

// 保存 PNPM_POLICY_PATH 常量，定位单包项目的 pnpm 构建策略。
const PNPM_POLICY_PATH = "pnpm-workspace.yaml"

// 保存 REQUIRED_BUILD_ALLOWLIST 常量，锁定实际需要安装脚本的依赖。
const REQUIRED_BUILD_ALLOWLIST = ["@parcel/watcher", "esbuild", "sharp"] as const

/** 消费根的精确成员段，允许注释和空行但拒绝重复、通配或未登记成员。 */
function consumeWorkspacePackages(policy: string, expected: string[]): string {
  const lines = policy.split(/\r?\n/u)
  const headers = lines.filter((line) => /^[ \t]*["']?packages["']?[ \t]*:/u.test(line))
  const header = headers[0]
  if (
    headers.length !== 1 ||
    header === undefined ||
    !/^packages:[ \t]*(?:\[\])?[ \t]*$/u.test(header)
  )
    throw new Error("根 pnpm 成员段必须是唯一精确清单")
  const start = lines.indexOf(header)
  let end = start + 1
  const actual: string[] = []
  for (; end < lines.length; end++) {
    const line = lines[end] ?? ""
    if (/^[ \t]*(?:#.*)?$/u.test(line)) continue
    if (/^\S/u.test(line)) break
    const item = /^[ \t]+-[ \t]+("(?:[^"\\]|\\.)*")[ \t]*$/u.exec(line)
    if (!item?.[1] || header.includes("[]")) throw new Error("根 pnpm 成员段格式无效")
    actual.push(JSON.parse(item[1]) as string)
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("根 pnpm 成员与 Workspace 不一致")
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n")
}

/** 校验配置型 pnpm 文件只管理单包构建策略，不声明多包工作区。 */
export async function validatePnpmBuildPolicy(root: string, errors: string[]): Promise<void> {
  // 保存 policy 变量供本地策略检查使用。
  let policy: string
  try {
    policy = await readFile(path.join(root, PNPM_POLICY_PATH), "utf8")
  } catch {
    // Workspace 成员只消费根的精确 packages 与构建许可，不放第二份 pnpm 配置。
    try {
      const parent = path.dirname(root)
      const workspace = JSON.parse(
        await readFile(path.join(parent, ".harness/workspace.json"), "utf8")
      ) as {
        kind?: string
        id: string
        members: { type: string; directory: string }[]
      }
      if (
        workspace.kind !== "workspace" ||
        !Array.isArray(workspace.members) ||
        !workspace.members.some(
          (member) =>
            member.directory === path.basename(root) &&
            ["web", "extension"].includes(member.type) &&
            new RegExp(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*_${member.type}$`).test(member.directory)
        )
      )
        throw new Error("当前目录不是已登记成员")
      policy = await readFile(path.join(parent, PNPM_POLICY_PATH), "utf8")
      const expected = workspace.members
        .filter((member) => member.type !== "server")
        .map((member) => member.directory)
      policy = consumeWorkspacePackages(policy, expected)
    } catch {
      errors.push(`Missing required file or valid Workspace policy: ${PNPM_POLICY_PATH}`)
      return
    }
  }
  if (!/^allowBuilds:\s*$/mu.test(policy)) {
    errors.push("pnpm build policy must declare allowBuilds")
  }
  if (/^[ \t]*["']?packages["']?[ \t]*:/mu.test(policy)) {
    errors.push("pnpm build policy must not declare workspace packages")
  }
  // 保存 declarations 变量供受控构建脚本名单检查使用。
  const declarations = policy.split(/\r?\n/u).map((line) => line.trim())
  for (const dependency of REQUIRED_BUILD_ALLOWLIST) {
    if (
      !declarations.includes(`${dependency}: true`) &&
      !declarations.includes(`"${dependency}": true`) &&
      !declarations.includes(`'${dependency}': true`)
    ) {
      errors.push(`pnpm build policy must allow ${dependency}`)
    }
  }
}
