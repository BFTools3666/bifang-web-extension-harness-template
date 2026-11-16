import { spawn } from "node:child_process"

// 执行 runCommand 函数的处理逻辑。
export async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  // Windows 的 pnpm 通常由 cmd/PowerShell shim 暴露，直接执行已注入的入口以避免 Shell 拼接。
  const pnpmEntry = command === "pnpm" ? process.env.npm_execpath : undefined
  const executable = pnpmEntry
    ? pnpmEntry.endsWith(".exe")
      ? pnpmEntry
      : process.execPath
    : command
  const commandArgs = pnpmEntry && !pnpmEntry.endsWith(".exe") ? [pnpmEntry, ...args] : args
  await new Promise<void>(
    /* 执行 当前声明 函数的处理逻辑。 */ (resolve, reject) => {
      // 保存 child 变量供当前逻辑使用。
      const child = spawn(executable, commandArgs, { cwd, stdio: "inherit" })
      child.once("error", reject)
      child.once(
        "exit",
        /* 执行 当前声明 函数的处理逻辑。 */ (code, signal) => {
          if (code === 0) {
            resolve()
            return
          }
          // 保存 suffix 变量供当前逻辑使用。
          const suffix = signal === null ? `exit code ${String(code)}` : `signal ${signal}`
          reject(new Error(`${command} ${args.join(" ")} failed with ${suffix}`))
        }
      )
    }
  )
}
