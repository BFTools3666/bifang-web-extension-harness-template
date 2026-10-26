import path from "node:path"
import { assertKnownOptions, parseArgs, readStringOption } from "../.harness/tooling/args.ts"
import { addWorkspaceFrontend } from "../.harness/tooling/workspace-add.ts"
import { parseProjectType } from "../.harness/tooling/initialization-input.ts"
import type { ProjectConfig } from "../.harness/tooling/types.ts"

/** 源公开入口的追加模式；新名字必填，不从工作区名或已有成员推断。 */
export async function runAddWorkspaceFrontendCli(
  argv: string[],
  sourceRoot: string
): Promise<ProjectConfig> {
  const args = parseArgs(argv)
  assertKnownOptions(args, [
    "workspace",
    "type",
    "name",
    "english-name",
    "id",
    "description",
    "brand-color",
    "logo",
    "test-base-url",
    "release-base-url"
  ])
  if (args.positionals.length)
    throw new Error("追加模式只接受 --workspace，不接受新 Workspace 父目录")
  const workspace = readStringOption(args, "workspace")
  const name = readStringOption(args, "name")
  const type = readStringOption(args, "type")
  if (!workspace || !path.isAbsolute(workspace) || !name || !type)
    throw new Error(
      "追加需要 --workspace <已有工作区绝对路径> --type web|extension --name <用户提供的新名字>"
    )
  const logo = readStringOption(args, "logo")
  return addWorkspaceFrontend({
    sourceRoot,
    workspaceRoot: workspace,
    projectType: parseProjectType(type),
    name,
    englishName: readStringOption(args, "english-name"),
    id: readStringOption(args, "id"),
    description: readStringOption(args, "description"),
    brandColor: readStringOption(args, "brand-color"),
    logoPath: logo ? path.resolve(logo) : undefined,
    testBaseUrl: readStringOption(args, "test-base-url"),
    releaseBaseUrl: readStringOption(args, "release-base-url")
  })
}
