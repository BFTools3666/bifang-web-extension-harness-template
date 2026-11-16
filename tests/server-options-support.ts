/** 与服务选型无关的旧创建场景显式固定六项配置，避免隐式替用户接受默认值。 */
export const DEFAULT_SERVER_SELECTION = {
  serverDatabase: "sqlite",
  serverCache: "memory",
  serverPush: "none",
  serverMq: "none",
  serverLog: "console",
  serverStorage: "none"
}
