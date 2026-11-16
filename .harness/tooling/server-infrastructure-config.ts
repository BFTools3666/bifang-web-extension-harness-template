import type { ServerOptions } from "./types.ts"

/** 枚举会生成独立资源和配置段的基础设施。 */
export function selectedInfrastructure(options: ServerOptions): [string, string][] {
  return [
    ["Cache", options.serverCache],
    ["Push", options.serverPush],
    ["MQ", options.serverMq],
    ["Storage", options.serverStorage]
  ].filter((entry): entry is [string, string] => entry[1] !== "none")
}

/** 生成仅包含已选能力的配置结构与固定提供者校验。 */
export function infrastructureConfig(options: ServerOptions): string {
  const selected = selectedInfrastructure(options)
  return `package config

import "errors"

// Infrastructure 只持有创建时实际装配的能力，不从配置偷偷启用缺失模板。
type Infrastructure struct {
${selected.map(([name]) => `    // ${name} 是所选能力的私有配置。\n    ${name} ${name} \`mapstructure:"${name.toLowerCase()}"\``).join("\n")}
}

// validateInfrastructure 在任何网络连接建立前检查已选提供者及必需参数。
func (c *Config) validateInfrastructure() error {
${selected
  .map(
    ([
      name,
      driver
    ]) => `    if c.Infrastructure.${name}.Driver != "${driver}" { return errors.New("config: ${name} 驱动必须与已装配模板 ${driver} 一致") }
    if err := c.Infrastructure.${name}.validate(${name === "Cache" || name === "MQ" || name === "Storage" ? "c.App.IsProd()" : ""}); err != nil { return err }`
  )
  .join("\n")}
    if c.Log.Format != "json" && c.Log.Format != "text" { return errors.New("config: 日志格式必须为 json 或 text") }
    if c.Log.MaxSize <= 0 || c.Log.MaxBackups < 0 || c.Log.MaxAge < 0 { return errors.New("config: 日志轮转参数无效") }
    ${options.serverLog === "console" ? 'if c.Log.Output != "" || !c.Log.Console { return errors.New("config: 当前模板选择命令行日志") }' : 'if c.Log.Output == "" { return errors.New("config: 文件日志必须配置输出路径") }'}
    return nil
}
`
}

/** 只追加被实际读取的配置段，外部服务地址及凭据保持空白。 */
export function infrastructureYaml(options: ServerOptions, id: string): string {
  const sections = [
    `infrastructure:
  cache:
    driver: ${options.serverCache}
    capacity: 1024
    max_bytes: 65536
    timeout: 10s
    prefix: "${id}:"
${options.serverCache === "redis" ? '    # 部署注入 APP_INFRASTRUCTURE_CACHE_URL；生产必须 rediss://。\n    url: ""\n' : ""}`
  ]
  if (options.serverPush !== "none")
    sections.push(`  push:
    driver: ${options.serverPush}
    buffer: 16
    max_clients: 128
    max_bytes: 65536
`)
  if (options.serverMq !== "none")
    sections.push(`  mq:
    driver: ${options.serverMq}
    # 仅填当前 Broker 使用的地址；部署预建队列、主题和 durable consumer。
    url: ""
    brokers: []
    topic: ""
    group: ""
    stream: ""
    tls: true
    username: ""
    password: ""
    max_bytes: 1048576
    timeout: 10s
`)
  if (options.serverStorage !== "none")
    sections.push(`  storage:
    driver: ${options.serverStorage}
    # endpoint、桶及 APP_INFRASTRUCTURE_STORAGE_* 凭据仅在服务端填写。
    endpoint: ""
    region: ""
    bucket: ""
    access_key: ""
    secret_key: ""
    session_token: ""
    prefix: "${id}/"
    max_bytes: 16777216
    timeout: 60s
`)
  return "\n" + sections.join("")
}

/** 给配置测试提供不联网的确定值，不能作为运行配置或联通证据。 */
export function infrastructureTestYaml(options: ServerOptions, id: string): string {
  return infrastructureYaml(options, id)
    .replace(
      /(cache:[\s\S]*?prefix:[^\n]*\n[^\n]*\n    url:) ""/u,
      '$1 "rediss://cache.example.invalid:6379"'
    )
    .replace('endpoint: ""', 'endpoint: "https://objects.example.invalid"')
    .replace('bucket: ""', 'bucket: "test-bucket"')
    .replace('access_key: ""', 'access_key: "test-access"')
    .replace('secret_key: ""', 'secret_key: "test-secret"')
    .replace('topic: ""', 'topic: "test-topic"')
    .replace('group: ""', 'group: "test-group"')
    .replace('stream: ""', 'stream: "test-stream"')
    .replace("brokers: []", 'brokers: ["broker.example.invalid:9092"]')
    .replace(/(driver: rabbitmq[\s\S]*?url:) ""/u, '$1 "amqps://broker.example.invalid"')
    .replace(/(driver: nats[\s\S]*?url:) ""/u, '$1 "tls://broker.example.invalid"')
}

/** 在实际 Go 配置层验证驱动漂移和必需外部配置缺失会被拒绝。 */
export function infrastructureConfigTest(options: ServerOptions): string {
  const required = [
    ...(options.serverCache === "redis" ? [["Cache", "URL"]] : []),
    ...(options.serverMq !== "none" ? [["MQ", "Topic"]] : []),
    ...(options.serverStorage !== "none"
      ? [
          ["Storage", "Endpoint"],
          ["Storage", "SecretKey"]
        ]
      : [])
  ]
  return `package config

import (
    "os"
    "path/filepath"
    "testing"
)

// TestInfrastructureRejectsDrift 使用真实配置解析，缺失连接信息不能进入资源装配。
func TestInfrastructureRejectsDrift(t *testing.T) {
    isolateEnvironment(t)
    file := filepath.Join(t.TempDir(), "config.yaml")
    if err := os.WriteFile(file, []byte(testConfig), 0600); err != nil { t.Fatal(err) }
    cfg, err := Load(file, ""); if err != nil { t.Fatal(err) }
${selectedInfrastructure(options)
  .map(
    ([name]) =>
      `    t.Run("${name}-driver", func(t *testing.T) { broken := *cfg; broken.Infrastructure.${name}.Driver = "unavailable"; if broken.Validate() == nil { t.Fatal("driver drift accepted") } })`
  )
  .join("\n")}
${required.map(([name, field]) => `    t.Run("${name}-${field}", func(t *testing.T) { broken := *cfg; broken.Infrastructure.${name}.${field} = ""; if broken.Validate() == nil { t.Fatal("missing external configuration accepted") } })`).join("\n")}
}
`
}
