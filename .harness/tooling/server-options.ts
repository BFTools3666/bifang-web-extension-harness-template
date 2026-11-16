import type { ServerOptions } from "./types.ts"
export type { ServerOptions } from "./types.ts"

import questions from "../../.agents/skills/web-instantiate-project/references/initialization-questions.json" with { type: "json" }

/** 服务创建选项与公开参数共用映射，不收集连接地址或秘密。 */
export const SERVER_OPTIONS = {
  serverDatabase: "server-database",
  serverCache: "server-cache",
  serverPush: "server-push",
  serverMq: "server-mq",
  serverLog: "server-log",
  serverStorage: "server-storage"
} as const

/** 约束创建阶段的服务端选项字段。 */
export type ServerOptionField = keyof typeof SERVER_OPTIONS

/** 判断当前基础题是否属于自建服务选型。 */
export function isServerOption(field: string): field is ServerOptionField {
  return Object.hasOwn(SERVER_OPTIONS, field)
}

/** 读取题库维护的唯一默认值。 */
export function defaultServerOption(field: ServerOptionField): string {
  return questions.basic[field].defaultValue
}

/** 统一解析题库编号及英文名称，非法值不能静默退回默认项。 */
export function parseServerOption(field: ServerOptionField, value: string): string {
  const normalized = value.trim().toLowerCase()
  const options = questions.basic[field].options
  const option = options.find(
    (item, index) => item.value === normalized || String(index + 1) === normalized
  )
  if (!option) throw new Error(`${questions.basic[field].title}请选择有效编号或选项名称`)
  return option.value
}

/** 解析非交互输入及已确认选项；普通 CLI 省略时采用题库默认值。 */
export function resolveServerOptions(
  mode: string,
  values: Partial<Record<ServerOptionField, string>>
): ServerOptions | undefined {
  const entries = Object.keys(SERVER_OPTIONS) as ServerOptionField[]
  if (mode !== "create") {
    if (entries.some((field) => values[field]?.trim()))
      throw new Error("服务端选项仅适用于自建 Go 服务，请移除旧选型")
    return undefined
  }
  return Object.fromEntries(
    entries.map((field) => [
      field,
      parseServerOption(field, values[field] ?? defaultServerOption(field))
    ])
  ) as ServerOptions
}

/** 汇总仅展示用户可读名称，供确认和下游交接复用。 */
export function formatServerOptions(options: ServerOptions): string {
  return (Object.keys(SERVER_OPTIONS) as ServerOptionField[])
    .map((field) => {
      const definition = questions.basic[field]
      const selected = definition.options.find((item) => item.value === options[field])
      if (!selected) throw new Error(`非法服务端选型：${field}`)
      return `- ${definition.title}：${selected.label.replace(/^\d+\./u, "")}`
    })
    .join("\n")
}
