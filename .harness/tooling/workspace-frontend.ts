import path from "node:path"
import { readFile, rm } from "node:fs/promises"
import { writeAtomic, writeNew } from "./files.ts"
import { formatInitializationFiles } from "./init.ts"
import { GO_HEALTH_SOURCE, GO_TRANSPORT_SOURCE } from "./workspace-http.ts"
import { httpUiTest } from "./templates/http-ui-test.ts"
import type { ProjectType } from "./types.ts"

/** 为自建服务复用同一传输适配，并让成员只消费根依赖锁。 */
export async function finalizeWorkspaceFrontend(root: string, type: ProjectType, go: boolean) {
  if (go) {
    const runtimePath = path.join(root, "src/data/api/client/httpRuntime.ts")
    const source = await readFile(runtimePath, "utf8")
    await writeAtomic(
      runtimePath,
      'import { requestGoTransport } from "./goTransport"\n' +
        source.replace(
          "client ??= createHttpClient({",
          "client ??= createHttpClient({\n    fetch: requestGoTransport,"
        )
    )
    await writeNew(path.join(root, "src/data/api/client/goTransport.ts"), GO_TRANSPORT_SOURCE)
    await writeNew(path.join(root, "src/data/api/system.ts"), GO_HEALTH_SOURCE)
    const test = "src/data/api/client/httpUi.test.tsx"
    await writeAtomic(path.join(root, test), httpUiTest(type, true))
    await formatInitializationFiles(root, [test, "src/data/api/client/httpRuntime.ts"])
  }
  await rm(path.join(root, "pnpm-lock.yaml"), { force: true })
  await rm(path.join(root, "pnpm-workspace.yaml"), { force: true })
}
