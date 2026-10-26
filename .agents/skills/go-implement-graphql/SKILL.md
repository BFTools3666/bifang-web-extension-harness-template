---
name: go-implement-graphql
description: 仅为列表查询或其他带业务查询条件的 GET 类读取实现 Go GraphQL SDL、resolver 和前端 typed Query，其余请求使用 RESTful，复用领域 service。
---

# Web Harness：实施 Go 查询契约

按 [工程规则](../../../docs/ENGINEERING_RULES.md) 与 [数据访问规范](../../../docs/DATA_ACCESS.md#12-rest-与-graphql-分工)，仅列表查询或其他带业务查询条件的 GET 类读取必须使用 GraphQL，返回单对象、数量或布尔值也适用；其余请求全部 RESTful，路径 ID 和作用域仅定位资源时不算业务查询条件。只为已选查询创建 SDL：按真实返回形状明确条件、字段与授权；分页集合再明确过滤、排序、1-based page/pageSize 和 items/total，不给单对象或标量强加分页。health/me 是锁定来源的引导样例，最终公开 SDL 必须移除这些无条件根字段；不能仅因读取复杂或聚合而改走 GraphQL。已有服务使用其真实 Schema；自建服务复用领域 service/repository，resolver 不复制业务规则。

按真实查询契约区分公开与受限 resolver：公开查询允许匿名成功，只返回已批准的公开字段，不为 GraphQL 自动新增账号表、用户 service、Token 或验证码依赖；受限查询才消费既有认证与组织/权限上下文，在 service/repository 内校验作用域，匿名或越权不泄漏条目/total。混合端点允许解析可选身份，各字段仍按自身契约授权，不能在传输层统一拒绝匿名。

[参考资产](../go-implement-service/assets/go-service-graphql/README.md) 为账号查询引导，gqlgen 固定 v0.17.95、Go >=1.26。只读所选分支，不修改锁定上游：

- 已有 GraphQL 模块按当前 SDL、resolver 和领域 service 增量修改。首次公开查询使用当前领域的最小 SDL、gqlgen.yml 和 resolver；在执行引擎生成前不挂载依赖它的 HTTP 模块，不复制含缺失账号依赖的引导树。先在 go.mod 显式声明 github.com/99designs/gqlgen v0.17.95，运行 `go run -mod=mod github.com/99designs/gqlgen generate`，成功后执行 `go mod tidy`。
- 首次确需复用账号引导资产时，先具备所选 resolver 实际消费的用户 service/token 依赖；替换 project_id，把 generated/internal/graphql/generated.go 引导快照恢复到目标 internal/graphql/generated.go，并保留 model/models_gen.go。完整引导树恢复后才运行 go mod tidy，再运行 gqlgen generate；不能先 tidy 一个缺本地 model/执行引擎的树。团队增量适配见[团队装配器](../go-implement-service/scripts/team-baseline.ts)。快照只是生成物，不代替业务 resolver。

最终 SDL 仅定义已选列表/条件 GET 类读取，删除来源 health/me，并将 Playground 示例改为真实操作。按目标 SDL 重新生成后，仅当 deps.Config.GraphQL.Enabled 时装配当前领域 HTTP 模块；同步配置 graphql.enabled、真实 endpoint 及该成员 go.mod/go.sum，不把缺生成文件当成已交付。

标准 GraphQL {data,errors} 与 REST 信封分开解析；Query 缓存继续归前端 TanStack Query。拒绝无限 pageSize 与无界树。无条件读取、路径 ID 详情与全部写操作沿 RESTful 合同，不新增 Mutation 或 Subscription。通过 `$go-test-service` 覆盖本次查询的真实 HTTP 成功、空页和非法变量；公开查询验证匿名成功及字段边界，受限查询验证匿名拒绝与跨组织拒绝，再返回调用方并携带已有证据。
