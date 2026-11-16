import path from "node:path"
import type { CreationFormInput } from "../.harness/tooling/initialization-form.ts"
import { createLogo } from "../.harness/tooling/logo.ts"
import { temporaryDirectory, writeFile } from "./harness-tooling-support.ts"
import { DEFAULT_SERVER_SELECTION } from "./server-options-support.ts"

/** 创建外部隔离输入，使用真实 Logo，工程执行由断言替身截住。 */
export async function fixture(): Promise<{ root: string; file: string; input: CreationFormInput }> {
  const root = await temporaryDirectory("creation-form-")
  const logoPath = path.join(root, "selected.png")
  await writeFile(
    logoPath,
    await createLogo({ root, name: "Notes", id: "notes", color: "#4C6EF5" })
  )
  return {
    root,
    file: path.join(root, "input.json"),
    input: {
      values: {
        projectType: "web",
        serverMode: "create",
        ...DEFAULT_SERVER_SELECTION,
        requirementsFile: "",
        name: "Notes",
        targetRoot: path.join(root, "new-parent"),
        policyMode: "recommended"
      },
      scope: {
        users: "个人",
        home: "文本笔记编辑器",
        pages: "首页",
        operations: "编辑、清空，无远端能力",
        design: "桌面单页编辑器和状态反馈",
        data: "本地内存，不调用服务",
        acceptance: "输入显示、清空恢复空状态；相关类型、行为测试和实际浏览器走查"
      },
      logoPath
    }
  }
}
