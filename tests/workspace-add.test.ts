import path from "node:path"
import { pathToFileURL } from "node:url"
import { execFileSync } from "node:child_process"
import { readFile, readdir, writeFile, symlink, realpath, mkdir, rename } from "node:fs/promises"
import { describe, expect, test } from "vitest"
import { addWorkspaceFrontend } from "../.harness/tooling/workspace-add.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { initializeWorkspace } from "../.harness/tooling/workspace.ts"
import { recommendedAgentPolicy } from "../.harness/tooling/agent-policy.ts"
import { validateEnvironmentFiles } from "../.harness/tooling/environment.ts"
import { validatePnpmBuildPolicy } from "../.harness/tooling/pnpm-policy.ts"
import { loadProjectConfig } from "../.harness/tooling/config.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { runPrototypeReview } from "../.agents/skills/web-design-prototype/scripts/prototype-review.ts"
import { repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"

/** 在源外生成真实工程，所有安装替身仅验证事务行为，不代表最终候选。 */
async function fixture(mode: "none" | "create" = "none") {
  const parent = await realpath(await temporaryDirectory("workspace-add-"))
  const root = path.join(parent, "example")
  await instantiateProject(
    {
      sourceRoot: repositoryRoot,
      targetRoot: root,
      init: {
        projectType: "web",
        serverMode: mode,
        id: "example",
        name: "Example",
        description: "Example",
        brandColor: "#4C6EF5",
        developmentBaseUrl: "",
        testBaseUrl: "",
        releaseBaseUrl: "",
        agentPolicy: recommendedAgentPolicy("test"),
        skipInstall: true
      }
    },
    initializeWorkspace
  )
  await writeFile(path.join(root, "example_web/keep.txt"), "existing product\n")
  return { root, sourceRoot: repositoryRoot, workspaceRoot: root }
}

/** 捕获最关键的根控制文件，失败后必须字节相同。 */
async function controls(root: string) {
  return Promise.all(
    ["package.json", "pnpm-workspace.yaml", ".harness/workspace.json", "docs/AGENT_POLICY.md"].map(
      (file) => readFile(path.join(root, file), "utf8")
    )
  )
}

describe("Workspace 命名前端追加", () => {
  /** 同类可重复，名字和目录唯一；纯本地、根依赖与成员选择真实生效。 */
  test("追加两个 Web 与两个 Extension 并保留已有产品", async () => {
    const original = await fixture()
    const initialPrd = "docs/product_spec/20261026_product_spec.md"
    const initialHtml = "docs/prototypes/original/v1/prototype.html"
    await mkdir(path.dirname(path.join(original.root, initialPrd)), { recursive: true })
    await mkdir(path.dirname(path.join(original.root, initialHtml)), { recursive: true })
    await writeFile(
      path.join(original.root, initialPrd),
      "# 原成员\n\n状态：Approved\n\n用户确认原成员流程。\n"
    )
    await writeFile(
      path.join(original.root, initialHtml),
      "<!doctype html><html><title>Original</title><button>Open</button></html>"
    )
    const prepared = await runPrototypeReview(
      ["prepare", "original", "用户消息：原成员设计", initialPrd, initialHtml],
      original.root
    )
    await runPrototypeReview(
      ["present", "original", prepared.reviewHash, "助手消息：已展示原成员"],
      original.root
    )
    await runPrototypeReview(
      ["approve", "original", prepared.reviewHash, "确认", "用户新回复：确认原成员"],
      original.root
    )
    const manifestFile = path.join(original.root, "package.json")
    const customized = JSON.parse(await readFile(manifestFile, "utf8"))
    customized.scripts.report = "node report.mjs"
    await writeFile(manifestFile, JSON.stringify(customized))
    const policyFile = path.join(original.root, "pnpm-workspace.yaml")
    await writeFile(
      policyFile,
      (await readFile(policyFile, "utf8")).replace("packages:\n", "packages:\n  # 用户成员注释\n\n")
    )
    for (const [name, projectType] of [
      ["Admin", "web"],
      ["Collector", "extension"],
      ["Inspector", "extension"]
    ] as const)
      await addWorkspaceFrontend(
        { ...original, name, projectType, description: `${name} app` },
        { skipInstall: true }
      )
    const config = JSON.parse(
      await readFile(path.join(original.root, ".harness/workspace.json"), "utf8")
    )
    expect(config.members.map((member: { directory: string }) => member.directory)).toEqual([
      "example_web",
      "admin_web",
      "collector_extension",
      "inspector_extension"
    ])
    const manifest = JSON.parse(await readFile(path.join(original.root, "package.json"), "utf8"))
    expect(manifest.scripts["dev:web"]).toBeUndefined()
    expect(manifest.scripts["release:admin_web"]).toContain("--member admin_web")
    expect(manifest.scripts.report).toBe("node report.mjs")
    expect(await readFile(policyFile, "utf8")).toContain("# 用户成员注释")
    await expect(
      runPrototypeReview(
        ["check", "original", "用户消息：原成员设计", "--member", "example_web"],
        original.root
      )
    ).resolves.toMatchObject({ projectId: "example", state: "approved" })
    await expect(
      runPrototypeReview(
        ["check", "original", "用户消息：原成员设计", "--member", "admin_web"],
        original.root
      )
    ).rejects.toThrow()
    expect(await readFile(path.join(original.root, "example_web/keep.txt"), "utf8")).toBe(
      "existing product\n"
    )
    for (const member of config.members) {
      const memberRoot = path.join(original.root, member.directory)
      await expect(validateEnvironmentFiles(memberRoot, "release")).resolves.toBeDefined()
      const errors: string[] = []
      await validatePnpmBuildPolicy(memberRoot, errors)
      expect(errors).toEqual([])
      expect(await readdir(memberRoot)).not.toContain("pnpm-lock.yaml")
      expect(await readdir(path.join(memberRoot, ".harness/tooling"))).not.toContain(
        "workspace-add.ts"
      )
    }
    expect(() =>
      execFileSync(
        process.execPath,
        [".harness/runtime/workspace.mjs", "validate", "--structure-only"],
        { cwd: original.root, stdio: "pipe" }
      )
    ).not.toThrow()
    expect(() =>
      execFileSync(process.execPath, [".harness/runtime/workspace.mjs", "build", "--member=web"], {
        cwd: original.root,
        stdio: "pipe"
      })
    ).toThrow(/多个/)
    await expect(loadProjectConfig(original.root)).rejects.toThrow(/多个前端/)
    expect((await loadProjectConfig(original.root, "collector_extension")).id).toBe(
      "collector_extension"
    )
    const prd = "docs/product_spec/20261026_product_spec.md"
    const html = "docs/prototypes/collector/v1/prototype.html"
    await mkdir(path.dirname(path.join(original.root, prd)), { recursive: true })
    await mkdir(path.dirname(path.join(original.root, html)), { recursive: true })
    await writeFile(
      path.join(original.root, prd),
      "# 新成员\n\n状态：Approved\n\n用户确认收集流程。\n"
    )
    await writeFile(
      path.join(original.root, html),
      "<!doctype html><html><title>Collector</title><button>Collect</button></html>"
    )
    const review = await runPrototypeReview(
      [
        "prepare",
        "collector",
        "用户消息：新成员设计",
        prd,
        html,
        "--member",
        "collector_extension"
      ],
      original.root
    )
    expect(review.projectId).toBe("collector_extension")
    expect(review.projectType).toBe("extension")
    const terminalTool = pathToFileURL(
      path.join(original.root, ".agents/skills/web-design-prototype/scripts/prototype-review.ts")
    ).href
    const terminalHtml = "docs/prototypes/terminal-collector/v1/prototype.html"
    await mkdir(path.dirname(path.join(original.root, terminalHtml)), { recursive: true })
    await writeFile(
      path.join(original.root, terminalHtml),
      await readFile(path.join(original.root, html))
    )
    const terminalReview = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const {runPrototypeReview}=await import(${JSON.stringify(terminalTool)}); const review=await runPrototypeReview(["prepare","terminal-collector","当前用户：终端成员设计",${JSON.stringify(prd)},${JSON.stringify(terminalHtml)},"--member","collector_extension"],${JSON.stringify(original.root)}); console.log(JSON.stringify(review));`
        ],
        { encoding: "utf8" }
      )
    )
    expect(terminalReview).toMatchObject({
      projectId: "collector_extension",
      projectType: "extension"
    })
    await expect(
      runPrototypeReview(
        [
          "waive",
          "collector",
          review.reviewHash,
          "跳过本次预览并直接实施",
          "用户新回复",
          "--member",
          "collector_extension"
        ],
        original.root
      )
    ).rejects.toThrow(/首版/)
    await expect(
      runPrototypeReview(
        ["check", "collector", "用户消息：新成员设计", "--member", "inspector_extension"],
        original.root
      )
    ).rejects.toThrow()
  })

  /** 拒绝所有可预见命名错误，且没有安装或根控制文件写入。 */
  test("缺名、同名、同标识、逃逸及已有目录在写入前拒绝", async () => {
    const original = await fixture()
    const before = await controls(original.root)
    const entries = await readdir(original.root)
    for (const patch of [
      { name: "" },
      { name: "  " },
      { name: "example" },
      { name: "Different", id: "example" },
      { name: "Other", id: "../outside" }
    ]) {
      await expect(
        addWorkspaceFrontend(
          { ...original, projectType: "web", ...patch },
          {
            commandRunner: async () => {
              throw new Error("不得安装")
            }
          }
        )
      ).rejects.toThrow()
      expect(await controls(original.root)).toEqual(before)
      expect(await readdir(original.root)).toEqual(entries)
    }
    await symlink(path.join(original.root, "example_web"), path.join(original.root, "admin_web"))
    await expect(
      addWorkspaceFrontend(
        { ...original, projectType: "web", name: "Admin" },
        { skipInstall: true }
      )
    ).rejects.toThrow(/已存在/)
    expect(await readFile(path.join(original.root, "example_web/keep.txt"), "utf8")).toBe(
      "existing product\n"
    )
    await expect(
      runInstantiateCli(["--workspace", original.root, "--type", "web"])
    ).rejects.toThrow(/新名字/)
  })

  /** 根安装失败回滚登记、锁与新目录，既有产品保留。 */
  test("安装失败恢复根登记且清理本次成员", async () => {
    const original = await fixture()
    const before = await controls(original.root)
    await expect(
      addWorkspaceFrontend(
        { ...original, projectType: "web", name: "Admin" },
        {
          commandRunner: async (_command, args, cwd) => {
            if (args.includes("--lockfile-only"))
              await writeFile(path.join(cwd, "pnpm-lock.yaml"), "test lock\n")
            else throw new Error("root install failed")
          }
        }
      )
    ).rejects.toThrow(/root install failed/)
    expect(await controls(original.root)).toEqual(before)
    expect(await readdir(original.root)).not.toContain("admin_web")
    expect(await readdir(path.dirname(original.root))).toEqual(["example"])
    expect(await readFile(path.join(original.root, "example_web/keep.txt"), "utf8")).toBe(
      "existing product\n"
    )
  })

  /** 准备期间改写的真实用户内容必须保留，拒绝发布陈旧根清单。 */
  test("并发根修改阻断追加并保留用户内容", async () => {
    const original = await fixture()
    await expect(
      addWorkspaceFrontend(
        { ...original, projectType: "web", name: "Admin" },
        {
          commandRunner: async (_command, _args, cwd) => {
            await writeFile(path.join(cwd, "pnpm-lock.yaml"), "test lock\n")
            await writeFile(path.join(original.root, "package.json"), '{"user":true}\n')
          }
        }
      )
    ).rejects.toThrow(/发生变化/)
    expect(await readFile(path.join(original.root, "package.json"), "utf8")).toBe('{"user":true}\n')
    expect(await readdir(original.root)).not.toContain("admin_web")
  })

  /** 发布后的后来编辑不能被安装失败回收，必须保留新成员供人工恢复。 */
  test("安装失败保留新成员中的后来编辑", async () => {
    const original = await fixture()
    await expect(
      addWorkspaceFrontend(
        { ...original, projectType: "web", name: "Admin" },
        {
          commandRunner: async (_command, args, cwd) => {
            if (args.includes("--lockfile-only"))
              await writeFile(path.join(cwd, "pnpm-lock.yaml"), "test lock\n")
            else {
              await writeFile(path.join(original.root, "admin_web/user-edit.txt"), "user work\n")
              throw new Error("install failed")
            }
          }
        }
      )
    ).rejects.toThrow(/现场已保留/)
    expect(await readFile(path.join(original.root, "admin_web/user-edit.txt"), "utf8")).toBe(
      "user work\n"
    )
    expect(await readdir(path.dirname(original.root))).toEqual(["example"])
  })

  /** 根在安装期间被替换时不能向替换目录回滚，原目录与新用户内容均保留。 */
  test("安装期间替换 Workspace 根会保留两处现场", async () => {
    const original = await fixture()
    const saved = `${original.root}-saved`
    await expect(
      addWorkspaceFrontend(
        { ...original, projectType: "web", name: "Admin" },
        {
          commandRunner: async (_command, args, cwd) => {
            if (args.includes("--lockfile-only"))
              await writeFile(path.join(cwd, "pnpm-lock.yaml"), "test lock\n")
            else {
              await rename(original.root, saved)
              await mkdir(original.root)
              await writeFile(path.join(original.root, "user.txt"), "replacement user work\n")
            }
          }
        }
      )
    ).rejects.toThrow(/现场已保留/)
    expect(await readdir(original.root)).toEqual(["user.txt"])
    expect(await readFile(path.join(saved, "example_web/keep.txt"), "utf8")).toBe(
      "existing product\n"
    )
    expect(await readdir(saved)).toContain("admin_web")
  })

  /** 自建服务的新成员复用同一真实传输，升级锁仅扩展拓扑。 */
  test("复用自建服务并保持既有升级基线", async () => {
    const original = await fixture("create")
    const workspace = JSON.parse(
      await readFile(path.join(original.root, ".harness/workspace.json"), "utf8")
    )
    const lock = {
      schemaVersion: 1,
      sourceVersion: "202610260000",
      sourceCommit: "test",
      workspace: { id: workspace.id, members: workspace.members },
      files: {
        "README.md": {
          ownership: "managed",
          candidate: { sha256: "a".repeat(64), mode: 420 },
          target: { sha256: "a".repeat(64), mode: 420 }
        }
      }
    }
    await writeFile(path.join(original.root, ".harness/upstream-lock.json"), JSON.stringify(lock))
    await addWorkspaceFrontend(
      {
        ...original,
        projectType: "extension",
        name: "Collector",
        description: "Collect selected content"
      },
      { skipInstall: true }
    )
    const member = path.join(original.root, "collector_extension")
    expect(
      await readFile(path.join(member, "src/data/api/client/httpRuntime.ts"), "utf8")
    ).toContain("fetch: requestGoTransport")
    expect(await readFile(path.join(member, ".env.development"), "utf8")).toContain(
      "http://127.0.0.1:8080"
    )
    const updated = JSON.parse(
      await readFile(path.join(original.root, ".harness/upstream-lock.json"), "utf8")
    )
    expect(updated.files).toEqual(lock.files)
    expect(updated.workspace.members.at(-1).directory).toBe("collector_extension")
  })
})
