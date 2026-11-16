import { cp, mkdir } from "node:fs/promises"
import path from "node:path"
import { repositoryRoot } from "./harness-tooling-support.ts"

/** 独立 Go 生成夹具同步受管基础设施模板，生产生成器仍只读取事务冻结副本。 */
export async function seedGoInfrastructure(root: string): Promise<void> {
  const relative = ".agents/skills/go-implement-service/templates/infrastructure"
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
  await cp(path.join(repositoryRoot, relative), path.join(root, relative), { recursive: true })
}
