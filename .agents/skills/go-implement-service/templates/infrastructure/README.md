# 服务端基础设施模板

由创建题库 `service.options` 选择，生成器只装配选中提供者；原始 `assets/` 迁入快照不变。`.go.txt` 生成到服务内部包，统一由 `bootstrap` 创建、`Dependencies.Platform` 注入、`Container.Close` 释放。外部配置为空时明确拒绝启动，模板不提供业务路由或自动启动消费。

| 能力     | 模板与实现                                                                             |
| -------- | -------------------------------------------------------------------------------------- |
| 数据库   | SQLite / MySQL / PostgreSQL 所选 GORM 驱动；MongoDB 原生客户端、组织过滤与乐观版本仓储 |
| 缓存     | Memory 有界 LRU/TTL；Redis go-redis                                                    |
| 推送     | SSE；WS coder/websocket；gRPC 服务端流                                                 |
| MQ       | RabbitMQ amqp091-go；Kafka franz-go；NATS JetStream；RocketMQ 4.x 原生协议             |
| 日志     | logrus 独立实例，命令行 / lumberjack 轮转文件 / 双输出                                 |
| 对象存储 | S3 minio-go；阿里云 OSS SDK；腾讯云 COS SDK                                            |

SDK 版本固定在 `.harness/tooling/server-infrastructure.ts`，生成项目执行 `go mod tidy` 形成自己的依赖图与摘要。SDK 按自身许可证使用，不把模板许可替代上游许可。对应官方接口文档：[Redis](https://pkg.go.dev/github.com/redis/go-redis/v9)、[RabbitMQ](https://pkg.go.dev/github.com/rabbitmq/amqp091-go)、[Kafka](https://pkg.go.dev/github.com/twmb/franz-go/pkg/kgo)、[NATS](https://pkg.go.dev/github.com/nats-io/nats.go)、[RocketMQ](https://pkg.go.dev/github.com/apache/rocketmq-client-go/v2)、[S3](https://pkg.go.dev/github.com/minio/minio-go/v7)、[OSS](https://pkg.go.dev/github.com/aliyun/aliyun-oss-go-sdk/oss)、[COS](https://pkg.go.dev/github.com/tencentyun/cos-go-sdk-v5)、[MongoDB](https://pkg.go.dev/go.mongodb.org/mongo-driver/v2/mongo)。

生成说明 `INFRASTRUCTURE.md` 是业务接线入口。作用域必须来自真实鉴权；MQ 至少一次投递要求业务事务去重、部署重试上限和死信；推送重连重新读取快照；下载必须 Close。真实外部服务联通、生产索引/事务以及部署兼容性仍在对应下游验证。
