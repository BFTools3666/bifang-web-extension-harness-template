import { execFile } from "node:child_process"
import { cp, mkdir, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { expect, test } from "vitest"
import { generateGoServer } from "../.harness/tooling/workspace-server.ts"
import { resolveServerOptions } from "../.harness/tooling/server-options.ts"
import { repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"
import { seedGoInfrastructure } from "./server-infrastructure-support.ts"

/** 对真实生成目录执行 Go 工具，不以源码字符串证明 SDK 可编译。 */
async function runGo(root: string, args: string[]): Promise<string> {
  try {
    const result = await promisify(execFile)("go", args, {
      cwd: root,
      env: { ...process.env, GOTOOLCHAIN: "local" },
      timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024
    })
    return result.stdout + result.stderr
  } catch (error) {
    const output = error as { stdout?: string; stderr?: string }
    throw new Error(`${output.stdout ?? ""}\n${output.stderr ?? ""}`, { cause: error })
  }
}

/** 组合覆盖每一种数据库、缓存、推送、MQ、日志与对象存储选项。 */
const MATRIX = [
  ["sqlite", "memory", "none", "none", "console", "none"],
  ["mysql", "redis", "ws", "rabbitmq", "both", "s3"],
  ["postgres", "memory", "sse", "kafka", "file", "aliyun"],
  ["mongo", "redis", "grpc", "nats", "console", "cos"],
  ["sqlite", "memory", "none", "rocketmq", "console", "none"]
] as const

/** 所选代码必须接入配置和进程资源，未选能力不能残留生产提供者代码。 */
test.each(MATRIX)(
  "实际生成并编译 %s/%s/%s/%s/%s/%s",
  async (database, cache, push, mq, log, storage) => {
    const root = await temporaryDirectory("server-infrastructure-")
    const assets = ".agents/skills/go-implement-service/assets/go-service"
    await mkdir(path.dirname(path.join(root, assets)), { recursive: true })
    await cp(path.join(repositoryRoot, assets), path.join(root, assets), { recursive: true })
    await seedGoInfrastructure(root)
    const options = resolveServerOptions("create", {
      serverDatabase: database,
      serverCache: cache,
      serverPush: push,
      serverMq: mq,
      serverLog: log,
      serverStorage: storage
    })
    if (!options) throw new Error("缺少测试选型")
    await generateGoServer(root, "matrix_server", "matrix_server", options)
    const server = path.join(root, "matrix_server")
    const platform = await readdir(path.join(server, "internal/platform"))
    for (const [folder, selected] of [
      ["push", push],
      ["mq", mq],
      ["storage", storage]
    ] as const)
      expect(platform.includes(folder)).toBe(selected !== "none")
    const yaml = await readFile(path.join(server, "configs/config.yaml"), "utf8")
    expect(yaml).toContain(`driver: ${database}`)
    expect(yaml).toContain(`driver: ${cache}`)
    if (database !== "sqlite") expect(yaml).toContain('dsn: ""')
    if (database !== "sqlite") {
      const development = await readFile(path.join(server, "configs/config-dev.yaml"), "utf8")
      expect(development).not.toContain("driver: sqlite")
      expect(development).not.toContain("dsn: data/app.db")
    }
    expect(await readFile(path.join(server, "internal/api/v1/module.go"), "utf8")).toContain(
      "Platform *platform.Runtime"
    )
    if (database === "mongo")
      expect(
        await readFile(path.join(server, "internal/database/database.go"), "utf8")
      ).not.toContain("gorm")
    await runGo(server, ["mod", "tidy"])
    await runGo(server, ["fmt", "./..."])
    const result = await runGo(server, ["test", "./...", "-count=1"])
    expect(result).toContain("ok")
  },
  720_000
)
