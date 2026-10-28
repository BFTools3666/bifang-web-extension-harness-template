/** 生成共享列配置、列宽交互及其独立存储边界，查询和写入仍归领域。 */
export function tableColumnFiles(): Map<string, string> {
  return new Map([
    ["src/data/storage/tableColumns.ts", STORAGE],
    ["src/pagination/TableColumns.tsx", CONTROLS],
    ["src/pagination/tableColumns.module.css", STYLES]
  ])
}

/** 偏好只包含可见列与宽度，不缓存业务行或另存查询排序。 */
const STORAGE = `import { getWebStorage } from "./webStorage"

/** 列身份与默认宽度由真实表格定义。 */
export interface ColumnDefinition {
  id: string
  label: string
  required?: boolean
  width: number
}
/** 第一版偏好只保存显示列和已明确启用的列宽。 */
export interface ColumnPreferences {
  version: 1
  hidden: string[]
  widths: Record<string, number>
}
/** 列宽限制保证内容可读且不会被损坏偏好无限撑开。 */
export function columnWidth(value: number): number {
  return Math.min(640, Math.max(96, Math.round(value)))
}
/** 从未知值恢复有效列，始终显示主业务列和操作列。 */
export function normalizeColumns(value: unknown, columns: readonly ColumnDefinition[]): ColumnPreferences {
  const defaults: ColumnPreferences = { version: 1, hidden: [], widths: {} }
  for (const column of columns) defaults.widths[column.id] = columnWidth(column.width)
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) return defaults
  if ("hidden" in value && Array.isArray(value.hidden)) {
    const hidden: unknown[] = value.hidden
    defaults.hidden = columns.filter((column) => !column.required && hidden.includes(column.id)).map((column) => column.id)
  }
  if ("widths" in value && value.widths && typeof value.widths === "object") {
    const widths = value.widths
    for (const column of columns) {
      const width: unknown = Object.getOwnPropertyDescriptor(widths, column.id)?.value
      if (typeof width === "number" && Number.isFinite(width)) defaults.widths[column.id] = columnWidth(width)
    }
  }
  return defaults
}
/** 拒绝存储、损坏 JSON 或未知版本时回退当前定义；不伪造持久化成功。 */
export function readColumns(key: string, columns: readonly ColumnDefinition[]): ColumnPreferences {
  try {
    const raw = getWebStorage("local")?.getItem(key)
    return normalizeColumns(raw && raw.length < 8192 ? JSON.parse(raw) : null, columns)
  } catch { return normalizeColumns(null, columns) }
}
/** 保存失败时保持本次界面的内存偏好，不影响业务操作。 */
export function writeColumns(key: string, value: ColumnPreferences): void {
  try { getWebStorage("local")?.setItem(key, JSON.stringify(value)) } catch { /* 存储拒绝不撤销内存操作。 */ }
}
`

/** 控件只更新列偏好，不改变数据、排序、分页或权限。 */
const CONTROLS = `import { Button, Checkbox, Group, NumberInput, Popover, Stack, Table, Text, UnstyledButton } from "@mantine/core"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { BRAND } from "../brand"
import { columnWidth, normalizeColumns, readColumns, writeColumns, type ColumnDefinition, type ColumnPreferences } from "../data/storage/tableColumns"
import classes from "./tableColumns.module.css"
import "../i18n/lists"

/** 列偏好绑定稳定账号、组织和列表，切换作用域立即停止显示旧偏好。 */
export function useTableColumns(listId: string, scope: string, columns: readonly ColumnDefinition[], persistWidths = false) {
  const key = JSON.stringify([BRAND.id, "table-columns", listId, scope])
  const schema = JSON.stringify(columns.map(({ id, required, width }) => ({ id, required, width })))
  const initial = useMemo(() => {
    const saved = readColumns(key, columns)
    return persistWidths ? saved : normalizeColumns({ ...saved, widths: {} }, columns)
  }, [key, schema, persistWidths])
  const [snapshot, setSnapshot] = useState({ key, schema, value: initial })
  const value = snapshot.key === key && snapshot.schema === schema ? snapshot.value : initial
  /** 状态变更只写入原作用域，必显列和列宽始终经过统一校验。 */
  function update(next: ColumnPreferences) {
    const valid = normalizeColumns(next, columns)
    setSnapshot({ key, schema, value: valid })
    writeColumns(key, persistWidths ? valid : { ...valid, widths: {} })
  }
  return {
    columns,
    ownerKey: key,
    totalWidth: columns.filter((column) => !value.hidden.includes(column.id)).reduce((sum, column) => sum + (value.widths[column.id] ?? column.width), 0),
    visible: (id: string) => !value.hidden.includes(id),
    width: (id: string) => value.widths[id] ?? 160,
    /** 显隐变更不能隐藏固定业务身份或动作入口。 */
    toggle(id: string, visible: boolean) {
      update({ ...value, hidden: visible ? value.hidden.filter((item) => item !== id) : [...value.hidden, id] })
    },
    /** 同一入口同时服务拖拽、键盘与数值调整。 */
    resize(id: string, width: number) {
      update({ ...value, widths: { ...value.widths, [id]: columnWidth(width) } })
    },
    /** 恢复当前列定义，不擦除其他列表或主体的偏好。 */
    reset() { update(normalizeColumns(null, columns)) }
  }
}

/** 保留共享 hook 的窄交互合同。 */
type Columns = ReturnType<typeof useTableColumns>

/** 列显隐与命名数值输入提供不依赖拖拽的替代，必显列不能关闭。 */
export function TableColumnControls({ columns, disabled = false }: { columns: Columns; disabled?: boolean }) {
  const { t } = useTranslation()
  return <Popover position="bottom-end" withinPortal trapFocus returnFocus>
    <Popover.Target><Button type="button" variant="default" disabled={disabled}>{t("listColumns")}</Button></Popover.Target>
    <Popover.Dropdown><Stack>
      {columns.columns.map((column) => <Group key={column.id} justify="space-between" wrap="wrap">
        <Checkbox label={column.label} checked={columns.visible(column.id)} disabled={column.required || disabled}
          onChange={(event) => columns.toggle(column.id, event.currentTarget.checked)} />
        <NumberInput label={t("listColumnWidth", { column: column.label })} min={96} max={640} step={4} size="sm"
          placeholder={t("listColumnWidthPlaceholder")}
          value={columns.width(column.id)} disabled={disabled} allowDecimal={false}
          onChange={(value) => { if (typeof value === "number") columns.resize(column.id, value) }} />
      </Group>)}
      <Button type="button" variant="subtle" disabled={disabled} onClick={() => columns.reset()}>{t("listResetColumns")}</Button>
    </Stack></Popover.Dropdown>
  </Popover>
}

/** 真实表头拥有列宽；指针捕获、键盘箭头与数值替代共用受控状态。 */
export function TableColumnHeader({ columns, id, children, disabled = false }: {
  columns: Columns; id: string; children: ReactNode; disabled?: boolean
}) {
  const { t } = useTranslation()
  const drag = useRef<{ pointerId: number; ownerKey: string; x: number; width: number } | null>(null)
  const handle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const active = drag.current
    drag.current = null
    if (active && handle.current?.hasPointerCapture(active.pointerId)) handle.current.releasePointerCapture(active.pointerId)
  }, [disabled, columns.ownerKey])
  const label = columns.columns.find((column) => column.id === id)?.label ?? id
  return <Table.Th scope="col" style={{ width: columns.width(id) }}>
    <Group wrap="nowrap" justify="space-between"><Text component="span" inherit>{children}</Text>
      <UnstyledButton ref={handle} type="button" className={classes.resize} role="separator" aria-orientation="vertical"
        aria-label={t("listResizeColumn", { column: label })} aria-valuenow={columns.width(id)} aria-valuemin={96} aria-valuemax={640}
        disabled={disabled}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0 || drag.current) return
          drag.current = { pointerId: event.pointerId, ownerKey: columns.ownerKey, x: event.clientX, width: columns.width(id) }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const active = drag.current
          if (!disabled && active?.pointerId === event.pointerId && active.ownerKey === columns.ownerKey) columns.resize(id, active.width + event.clientX - active.x)
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return
          drag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = null }}
        onLostPointerCapture={() => { drag.current = null }}
        onKeyDown={(event) => {
          if (disabled) return
          const width = event.key === "Home" ? 96 : event.key === "End" ? 640
            : event.key === "ArrowLeft" ? columns.width(id) - 4 : event.key === "ArrowRight" ? columns.width(id) + 4 : null
          if (width !== null) { event.preventDefault(); columns.resize(id, width) }
        }} />
    </Group>
  </Table.Th>
}
`

/** 调整手柄具备可点击区域和焦点，不覆写主题基础控件样式。 */
const STYLES = `.resize {
  min-width: 24px;
  min-height: 24px;
  flex-shrink: 0;
  cursor: col-resize;
  touch-action: none;
  border-inline-end: 1px solid var(--mantine-color-default-border);
}
.resize:focus-visible {
  outline: var(--ui-focus-width) solid var(--mantine-primary-color-filled);
}
`
