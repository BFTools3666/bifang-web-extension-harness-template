import { describe, expect, test } from "vitest"
import { collectPromptedIdentity } from "../.harness/tooling/prompts.ts"
import { inspectCreationForm } from "../.harness/tooling/initialization-form.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import { parseArgs } from "../.harness/tooling/args.ts"
import { createWorkspaceConfig } from "../.harness/tooling/workspace.ts"
import { reviseInitializationAnswers } from "../.harness/tooling/initialization-answers.ts"
import { SERVER_OPTIONS, resolveServerOptions } from "../.harness/tooling/server-options.ts"
import { repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"
import { fixture } from "./creation-form-support.ts"
import { writeFile } from "node:fs/promises"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { inspectInitializationCatalog } from "../scripts/harness-validation/tooling.ts"
import { INITIALIZATION_QUESTIONS } from "../.harness/tooling/initialization-input.ts"

/** 固定基础输入，让场景聚焦六项自建服务选择。 */
async function input() {
  return {
    requirementsFile: "",
    projectType: "web",
    serverMode: "create",
    name: "Options",
    targetRoot: await temporaryDirectory("server-options-")
  }
}

/** 验证共享问答与参数传递的可观察行为。 */
describe("复用创建题库询问服务端选项", () => {
  /** 已确认选型必须经真实表单参数传给工程事务，修改后旧批准失效。 */
  test("完整确认与公开创建入口保留选型", async () => {
    const { input: form, file } = await fixture()
    Object.assign(form.values, {
      serverDatabase: "mongo",
      serverCache: "redis",
      serverPush: "sse",
      serverMq: "rabbitmq",
      serverLog: "both",
      serverStorage: "s3"
    })
    const preview = await inspectCreationForm(repositoryRoot, form)
    expect(preview.phase).toBe("awaiting-confirmation")
    expect(preview.summary).toContain("MongoDB")
    if (!preview.revision) throw new Error("缺少当前汇总修订")
    form.decision = { revision: preview.revision, answer: "确认", source: "测试用户明确确认" }
    await writeFile(file, JSON.stringify(form))
    let called = false
    await runInstantiateCli(["--form", file], {
      sourceRoot: repositoryRoot,
      output: () => undefined,
      instantiate: async (options) => {
        called = true
        expect(options.init.serverOptions).toEqual({
          serverDatabase: "mongo",
          serverCache: "redis",
          serverPush: "sse",
          serverMq: "rabbitmq",
          serverLog: "both",
          serverStorage: "s3"
        })
        expect(
          createWorkspaceConfig({ ...options.init, root: options.targetRoot }).service.options
        ).toEqual(options.init.serverOptions)
        return createProjectConfig(options.init)
      }
    })
    expect(called).toBe(true)
    form.values.serverDatabase = "sqlite"
    expect((await inspectCreationForm(repositoryRoot, form)).phase).toBe("awaiting-confirmation")
  })

  /** 题库默认值不能指向不存在或无法执行解析的选择。 */
  test("拒绝题库中非法默认值", () => {
    const catalog = structuredClone(INITIALIZATION_QUESTIONS)
    catalog.basic.serverDatabase.defaultValue = "invalid"
    expect(inspectInitializationCatalog(catalog)).toContain(
      "初始化题目 serverDatabase 默认值必须属于选项"
    )
  })
  /** 覆盖当前服务选型的成功与拒绝边界。 */
  /** 验证选型输入与交接行为。 */
  test("聊天逐项补问并复用用户答案，默认不替代回答", async () => {
    const values = await input()
    const scope = {
      users: "成员",
      home: "首页",
      pages: "首页",
      operations: "保存",
      design: "表单",
      data: "自建服务",
      acceptance: "保存后读取"
    }
    const state = await inspectCreationForm(repositoryRoot, { values, scope })
    expect(state.field).toBe("serverDatabase")
    expect(state.question).toContain("SQLite（默认）")
    expect(state.question).toContain("MongoDB")
    const next = await inspectCreationForm(repositoryRoot, {
      values: { ...values, serverDatabase: "mongo" },
      scope
    })
    expect(next.field).toBe("serverCache")
    expect(next.question).toContain("Memory（默认）")
  })

  /** 验证选型输入与交接行为。 */
  test("CLI 回车逐项接受默认值并进入工作区选型记录", async () => {
    const fields: string[] = []
    const identity = await collectPromptedIdentity(await input(), async (question, context) => {
      fields.push(context?.field ?? "")
      expect(question).toContain("回车采用")
      return ""
    })
    expect(fields).toEqual(Object.keys(SERVER_OPTIONS))
    expect(identity.serverOptions).toEqual({
      serverDatabase: "sqlite",
      serverCache: "memory",
      serverPush: "none",
      serverMq: "none",
      serverLog: "console",
      serverStorage: "none"
    })
    const config = createWorkspaceConfig({
      ...identity,
      root: identity.targetRoot,
      identityI18n: undefined
    })
    expect(config.service.options).toEqual(identity.serverOptions)
  })

  /** 验证选型输入与交接行为。 */
  test("非法输入只重问当前题，已答值不会丢失", async () => {
    const fields: string[] = []
    const replies = ["invalid", "4", "2", "sse", "kafka", "both", "s3"]
    const identity = await collectPromptedIdentity(await input(), async (_question, context) => {
      fields.push(context?.field ?? "")
      const reply = replies.shift()
      if (reply === undefined) throw new Error("出现多余问题")
      return reply
    })
    expect(fields.slice(0, 3)).toEqual(["serverDatabase", "serverDatabase", "serverCache"])
    expect(identity.serverOptions).toEqual({
      serverDatabase: "mongo",
      serverCache: "redis",
      serverPush: "sse",
      serverMq: "kafka",
      serverLog: "both",
      serverStorage: "s3"
    })
  })

  /** 非自建服务不得携带或询问自建选型。 */
  test.each(["existing", "none"])("%s 不询问自建选项，拒绝遗留选型", async (serverMode) => {
    const values = {
      ...(await input()),
      serverMode,
      developmentBaseUrl: serverMode === "existing" ? "https://api.example.invalid" : ""
    }
    const identity = await collectPromptedIdentity(values, async () => {
      throw new Error("不应提问")
    })
    expect(identity.serverOptions).toBeUndefined()
    expect(() => resolveServerOptions(serverMode, { serverDatabase: "mongo" })).toThrow("仅适用于")
    const revised = reviseInitializationAnswers(
      { ...values, serverMode: "create", serverDatabase: "mongo" },
      { serverMode }
    )
    expect(revised.serverDatabase).toBeUndefined()
  })

  /** 验证选型输入与交接行为。 */
  test("非交互 CLI 传递全部选型，非法值拒绝", async () => {
    const args = [
      "--type=web",
      "--server=create",
      "--name=Options",
      "--server-database=postgres",
      "--server-cache=redis",
      "--server-push=ws",
      "--server-mq=nats",
      "--server-log=file",
      "--server-storage=aliyun"
    ]
    const options = await resolveInitOptions(parseArgs(args), "../options", { interactive: false })
    expect(options.serverOptions).toEqual({
      serverDatabase: "postgres",
      serverCache: "redis",
      serverPush: "ws",
      serverMq: "nats",
      serverLog: "file",
      serverStorage: "aliyun"
    })
    await expect(
      resolveInitOptions(
        parseArgs([...args.slice(0, 3), "--server-database=unknown"]),
        "../options",
        { interactive: false }
      )
    ).rejects.toThrow("有效编号")
  })
})
