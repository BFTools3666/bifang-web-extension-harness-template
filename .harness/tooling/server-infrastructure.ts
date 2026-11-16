import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { writeNew } from "./files.ts"
import type { ServerOptions } from "./types.ts"
import { formatServerOptions } from "./server-options.ts"
import {
  infrastructureConfig,
  infrastructureConfigTest,
  infrastructureYaml,
  selectedInfrastructure
} from "./server-infrastructure-config.ts"

/** 依赖固定为本次核对的 SDK 版本，只为实际选中模板添加。 */
const PROVIDER_DEPENDENCIES: Record<string, string> = {
  redis: "github.com/redis/go-redis/v9 v9.23.0",
  ws: "github.com/coder/websocket v1.8.15",
  grpc: "google.golang.org/grpc v1.85.0",
  rabbitmq: "github.com/rabbitmq/amqp091-go v1.16.0",
  kafka: "github.com/twmb/franz-go v1.22.3",
  nats: "github.com/nats-io/nats.go v1.55.0",
  rocketmq: "github.com/apache/rocketmq-client-go/v2 v2.1.2",
  s3: "github.com/minio/minio-go/v7 v7.4.1",
  aliyun: "github.com/aliyun/aliyun-oss-go-sdk v3.0.2+incompatible",
  cos: "github.com/tencentyun/cos-go-sdk-v5 v0.7.77"
}

/** 生成进程级资源拥有者，将依赖显式提供给业务模块。 */
function runtimeSource(options: ServerOptions): string {
  const selected = selectedInfrastructure(options)
  return `// Package platform 装配所选基础设施并拥有关闭责任。
package platform

import (
    "context"
    "errors"
    "sync"
    "time"
    "project_id/internal/config"
${selected.map(([name]) => `    "project_id/internal/platform/${name.toLowerCase()}"`).join("\n")}
)

// Runtime 向业务注入实际客户端，未选能力没有字段、客户端或后台协程。
type Runtime struct {
${selected.map(([name]) => `    // ${name} 是已装配的能力。\n    ${name} *${name.toLowerCase()}.${name === "MQ" ? "Client" : name === "Push" ? "Hub" : "Store"}`).join("\n")}
    closers []func() error
    once sync.Once
    closeErr error
}

// New 验证全部配置后按顺序启动资源，任一失败逆序回收已启动资源。
func New(cfg *config.Config) (_ *Runtime, err error) {
    if cfg.Database.Driver != "${options.serverDatabase}" { return nil, errors.New("platform: 数据库驱动必须与创建选型一致") }
    if err := cfg.Validate(); err != nil { return nil, err }
    result := &Runtime{}
    defer func() { if err != nil { _ = result.Close() } }()
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second); defer cancel()
${selected
  .map(
    ([
      name
    ]) => `    result.${name}, err = ${name.toLowerCase()}.New(ctx, cfg.Infrastructure.${name})
    if err != nil { return nil, err }
    result.closers = append(result.closers, result.${name}.Close)`
  )
  .join("\n")}
    return result, nil
}

// Close 幂等逆序释放所有资源，调用方应先取消并等待自己启动的消费循环。
func (r *Runtime) Close() error {
    if r == nil { return nil }
    r.once.Do(func() { for index := len(r.closers)-1; index >= 0; index-- { r.closeErr = errors.Join(r.closeErr, r.closers[index]()) } })
    return r.closeErr
}
`
}

/** 唯一锚点失效即拒绝，防止模板变化后静默遗漏接线。 */
function replaceOnce(source: string, before: string, after: string, file: string): string {
  if (source.split(before).length !== 2) throw new Error(`基础设施模板锚点漂移：${file}`)
  return source.replace(before, after)
}

/** 在工程事务中预读全部选中资产，不读取未启用提供者。 */
export async function infrastructureFiles(
  workspaceRoot: string,
  options: ServerOptions
): Promise<Map<string, string>> {
  const templates = path.join(
    workspaceRoot,
    ".agents/skills/go-implement-service/templates/infrastructure"
  )
  const files = new Map<string, string>()
  const selected = selectedInfrastructure(options)
  for (const [name, driver] of selected) {
    const folder = name.toLowerCase()
    for (const file of ["shared", driver]) {
      if (name === "Push" && file === "shared") continue
      files.set(
        `internal/platform/${folder}/${file === driver ? "provider" : file}.go`,
        await readFile(path.join(templates, folder, `${file}.go.txt`), "utf8")
      )
    }
    if (name === "Push")
      files.set(
        "internal/platform/push/hub.go",
        await readFile(path.join(templates, folder, "hub.go.txt"), "utf8")
      )
    files.set(
      `internal/config/${folder}.go`,
      await readFile(path.join(templates, "config", `${folder}.go.txt`), "utf8")
    )
    const test =
      name === "Push"
        ? "hub_test"
        : name === "Storage"
          ? "shared_test"
          : name === "Cache" && driver === "memory"
            ? "memory_test"
            : undefined
    if (test)
      files.set(
        `internal/platform/${folder}/${test}.go`,
        await readFile(path.join(templates, folder, `${test}.go.txt`), "utf8")
      )
    if (name === "Push")
      files.set(
        `internal/platform/push/transport_test.go`,
        await readFile(path.join(templates, folder, `${driver}_test.go.txt`), "utf8")
      )
  }
  if (options.serverDatabase === "mongo") {
    files.set(
      "internal/database/database.go",
      await readFile(path.join(templates, "database/mongo.go.txt"), "utf8")
    )
    files.set(
      "internal/repository/repository.go",
      await readFile(path.join(templates, "database/mongo-repository.go.txt"), "utf8")
    )
    files.set(
      "internal/model/base.go",
      await readFile(path.join(templates, "database/mongo-model.go.txt"), "utf8")
    )
  }
  files.set(
    "internal/pkg/logger/logger.go",
    await readFile(path.join(templates, "logging/logger.go.txt"), "utf8")
  )
  files.set(
    "internal/pkg/logger/logger_test.go",
    await readFile(path.join(templates, "logging/logger_test.go.txt"), "utf8")
  )
  files.set("internal/platform/runtime.go", runtimeSource(options))
  files.set("internal/config/infrastructure.go", infrastructureConfig(options))
  files.set("internal/config/infrastructure_test.go", infrastructureConfigTest(options))
  return files
}

/** 校准生成的现有文件；原始摘要锁定资产保持不变。 */
export function adaptInfrastructureFile(
  file: string,
  source: string,
  options: ServerOptions,
  id: string
): string {
  source = source.replaceAll("\r\n", "\n")
  const replace = (before: string, after: string): void => {
    source = replaceOnce(source, before, after, file)
  }
  if (file === "configs/config-dev.yaml" && options.serverDatabase !== "sqlite") {
    // 开发覆盖只调整日志级别，不能把已选数据库和显式连接串覆盖回 SQLite。
    replace("  driver: sqlite\n", "")
    replace("  dsn: data/app.db\n", "")
    replace("  # 开发环境使用本地 sqlite 文件。", "  # 数据库驱动与连接串沿用基线或显式环境变量。")
  }
  if (file === "internal/config/config.go") {
    replace(
      "type Config struct {",
      'type Config struct {\n// Infrastructure 是实际装配的中性基础设施。\nInfrastructure Infrastructure `mapstructure:"infrastructure"`'
    )
    replace(
      "type Log struct {",
      'type Log struct {\n// Console 控制文件日志是否同时写入命令行。\nConsole bool `mapstructure:"console"`'
    )
    replace(
      "func (c *Config) Validate() error {",
      "func (c *Config) Validate() error {\nif err := c.validateInfrastructure(); err != nil { return err }"
    )
    replace(
      '!strings.Contains(c.Database.DSN, "parsetime=true")',
      '!strings.Contains(strings.ToLower(c.Database.DSN), "parsetime=true")'
    )
    if (options.serverDatabase === "mongo") {
      replace(
        "type Database struct {",
        'type Database struct {\n// Name 是明确的 MongoDB 数据库名。\nName string `mapstructure:"name"`'
      )
      replace('case "sqlite", "mysql", "postgres":', 'case "sqlite", "mysql", "postgres", "mongo":')
      replace(
        'if strings.TrimSpace(c.Database.DSN) == "" {',
        'if c.Database.Driver == "mongo" && (c.Database.Name == "" || c.Database.AutoMigrate) { return errors.New("config: MongoDB 必须配置 name，且禁止 GORM 自动迁移") }\nif strings.TrimSpace(c.Database.DSN) == "" {'
      )
    }
  }
  if (file === "configs/config.yaml") {
    replace("  driver: sqlite", `  driver: ${options.serverDatabase}`)
    replace(
      "  dsn: data/app.db",
      options.serverDatabase === "sqlite"
        ? "  dsn: data/app.db"
        : `  # 通过 APP_DATABASE_DSN 注入真实连接串，不在模板保存地址或凭据。\n  dsn: ""${options.serverDatabase === "mongo" ? '\n  name: ""' : ""}`
    )
    if (options.serverDatabase !== "sqlite")
      replace("  auto_migrate: true", "  auto_migrate: false")
    replace(
      '  output: ""',
      `  console: ${options.serverLog !== "file"}\n  output: ${options.serverLog === "console" ? '""' : '"logs/server.log"'}`
    )
    source += infrastructureYaml(options, id)
  }
  if (file === "internal/bootstrap/container.go") {
    replace(
      '"project_id/internal/api"',
      '"project_id/internal/api"\n"project_id/internal/platform"'
    )
    replace(
      "type Container struct {",
      "type Container struct {\n// Platform 拥有全部选中基础设施。\nPlatform *platform.Runtime"
    )
    replace(
      "log := logger.Setup(cfg.Log)",
      "log, err := logger.Setup(cfg.Log)\nif err != nil { return nil, err }\nplatformRuntime, err := platform.New(cfg)\nif err != nil { logger.Close(log); return nil, err }\ncomplete := false\ndefer func() { if !complete { _ = platformRuntime.Close(); logger.Close(log) } }()"
    )
    replace("DB:     db,", "DB:     db,\nPlatform: platformRuntime,")
    replace(
      "return &Container{Config: cfg, Logger: log, DB: db, Engine: engine}, nil",
      "complete = true\nreturn &Container{Config: cfg, Logger: log, DB: db, Engine: engine, Platform: platformRuntime}, nil"
    )
    replace("database.Close(c.DB)", "database.Close(c.DB)\n_ = c.Platform.Close()")
    // 数据库在后续装配失败时同样归当前事务回收。
    replace(
      "if cfg.Database.AutoMigrate {",
      "defer func() { if !complete { database.Close(db) } }()\nif cfg.Database.AutoMigrate {"
    )
    if (options.serverDatabase === "mongo") {
      replace('"gorm.io/gorm"', '"go.mongodb.org/mongo-driver/v2/mongo"')
      replace("DB *gorm.DB", "Mongo *mongo.Database")
      replace(
        "if cfg.Database.AutoMigrate {\n\t\tif err := database.Migrate(db); err != nil {\n\t\t\treturn nil, err\n\t\t}\n\t}",
        "// MongoDB 索引与事务由真实领域仓储显式维护。"
      )
      source = source
        .replaceAll("DB:     db,", "Mongo:  db,")
        .replace("DB: db,", "Mongo: db,")
        .replace("database.Close(c.DB)", "database.Close(c.Mongo)")
    }
  }
  if (file === "internal/api/v1/module.go") {
    replace(
      '"project_id/internal/config"',
      '"project_id/internal/config"\n"project_id/internal/platform"'
    )
    replace(
      "type Dependencies struct {",
      "type Dependencies struct {\n// Platform 提供实际选中客户端，业务自行注册经过鉴权的消费者。\nPlatform *platform.Runtime"
    )
    if (options.serverDatabase === "mongo") {
      replace('"gorm.io/gorm"', '"go.mongodb.org/mongo-driver/v2/mongo"')
      replace("DB *gorm.DB", "Mongo *mongo.Database")
    }
  }
  if (file === "cmd/server/main.go") {
    replace(
      "defer container.Close()\n\tdefer logger.Close(container.Logger)",
      "defer logger.Close(container.Logger)\n\tdefer container.Close()"
    )
  }
  if (file === "internal/database/database.go" && options.serverDatabase !== "mongo") {
    for (const [driver, importPath] of [
      ["sqlite", "github.com/glebarez/sqlite"],
      ["mysql", "gorm.io/driver/mysql"],
      ["postgres", "gorm.io/driver/postgres"]
    ]) {
      if (driver === options.serverDatabase) continue
      source = source
        .replace(`\t"${importPath}"\n`, "")
        .replace(`\tcase "${driver}":\n\t\treturn ${driver}.Open(cfg.DSN), nil\n`, "")
    }
  }
  if (file === "go.mod") {
    const dependencies = selectedInfrastructure(options)
      .map(([, driver]) => PROVIDER_DEPENDENCIES[driver])
      .filter((dependency): dependency is string => dependency !== undefined)
    if (options.serverDatabase === "mongo") {
      source = source.replace(/^\s*go.mongodb.org\/mongo-driver\/v2 .*\n/gmu, "")
      dependencies.push("go.mongodb.org/mongo-driver/v2 v2.5.0")
    }
    if (dependencies.length)
      source += `\nrequire (\n${dependencies.map((dependency) => "\t" + dependency).join("\n")}\n)\n`
  }
  return source
}

/** 写入新增文件和选型使用说明，覆盖只发生在本次尚未发布的生成目录。 */
export async function writeInfrastructure(
  root: string,
  files: Map<string, string>,
  options: ServerOptions,
  id: string
): Promise<void> {
  for (const [file, source] of files) {
    const target = path.join(root, file)
    const content = source.replaceAll("project_id", id)
    if (
      [
        "internal/database/database.go",
        "internal/repository/repository.go",
        "internal/model/base.go",
        "internal/pkg/logger/logger.go"
      ].includes(file)
    )
      await writeFile(target, content)
    else await writeNew(target, content)
  }
  await writeNew(
    path.join(root, "INFRASTRUCTURE.md"),
    `# 已装配的服务端基础设施\n\n${formatServerOptions(options)}\n\n源码在 internal/platform；bootstrap.New 在启动时创建所有选中客户端，api/v1.Dependencies.Platform 向领域模块注入，Container.Close 逆序释放。未选能力不生成代码或依赖。MongoDB 使用独立 database/repository 与 Dependencies.Mongo，SQL 使用 Dependencies.DB。所有外部地址和秘密必须经配置或 APP_* 注入，配置缺失明确拒绝启动；模板存在不证明外部服务已经联通。\n\n缓存：Get/Set/Delete，Set 要求正 TTL，Memory 为有界 LRU、单进程语义；Redis 要求服务端 prefix，多实例共享。推送：领域鉴权后以可信 scope 调用 ServeSSE / ServeWS / RegisterGRPC，并通过 Publish 发布；不自动开放匿名路由。缓冲溢出断开慢订阅；无持久重放，重连应重新查询快照。gRPC 使用 google.protobuf.Empty 请求与 BytesValue 服务端流，宿主负责 TLS、认证和截止时间。\n\nMQ：Publish(ctx, Message{ID, Body})；Consume(ctx, Handler) 由业务显式启动，成功才确认。部署预建队列/主题/Stream/durable。至少一次投递，消费必须按 ID 在业务事务去重，毒消息需部署死信与最大重试策略；发布超时结果可能未知，不做无条件业务重发。调用方先取消并等待消费协程，再关闭 Container。RocketMQ 使用 4.x 原生协议客户端，其 TLS 能力按部署兼容性验证。\n\n对象存储：Put/Get/Delete(ctx, scope, key, ...)，scope 必须来自已授权业务上下文；上传最多读取 max_bytes+1 后才写远端，下载必须 Close。上传缓冲最多 64 MiB，接入 HTTP 时还需请求体和并发限额；不公开签名、桶权限或匿名上传接口。S3 支持兼容端点；COS endpoint 必须为目标桶完整域名。日志：默认命令行，可选轮转文件或同时输出，所有文件写失败会明确返回。\n\n运行 go mod tidy 固定当前装配依赖与 go.sum，再运行 go test ./...；外部服务未配置时不能把模板测试当成真实联通证据。\n`
  )
}
