/** 生成职责独立的 Grid 查询或交互模块，不引入请求与第二份缓存。 */
export const GRID_MODEL = `import type { ReactNode } from "react"
import type { PageRequest } from "./useSessionPagination"

/** 列值用于搜索、筛选和排序；展示可以独立提供语义控件。 */
export interface GridColumn<T> {
  id: string
  label: string
  value(row: T): string | number | null
  render?(row: T): ReactNode
  sortable?: boolean
  numeric?: boolean
  truncate?: boolean
  width?: number
  filter?: readonly { value: string; label: string }[]
}
/** 已应用条件只有一个拥有者；远端模式由 Router/feature 持有。 */
export interface GridQuery extends PageRequest {
  search: string
  filters: Record<string, string>
  sort: { column: string; direction: "asc" | "desc" } | null
}
/** 本地模式接收完整集合，远端模式只展示已校验的当前页。 */
export type GridData<T> =
  | { kind: "local"; rows: readonly T[] }
  | {
      kind: "remote"
      rows: readonly T[]
      total: number
      query: GridQuery
      change(query: GridQuery): void
      placeholder?: boolean
    }

/** 搜索、筛选、排序或容量改变时，原子回到第一页。 */
export function changeGridQuery(query: GridQuery, patch: Partial<GridQuery>): GridQuery {
  const filters = Object.fromEntries(
    Object.entries(patch.filters ?? query.filters)
      .filter(([, value]) => value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )
  const next = { ...query, ...patch, filters }
  const reset =
    next.search !== query.search ||
    next.pageSize !== query.pageSize ||
    JSON.stringify(next.sort) !== JSON.stringify(query.sort) ||
    JSON.stringify(filters) !==
      JSON.stringify(
        Object.fromEntries(
          Object.entries(query.filters)
            .filter(([, value]) => value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      )
  return { ...next, page: reset ? 1 : (patch.page ?? query.page) }
}
/** 本地完整集合只派生当前页；稳定业务身份打破相同排序值的平局。 */
export function projectGrid<T>(
  rows: readonly T[],
  columns: readonly GridColumn<T>[],
  query: GridQuery,
  rowId: (row: T) => string,
  locale: string
) {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" })
  const search = query.search.trim().toLocaleLowerCase(locale)
  const filtered = rows.filter(
    (row) =>
      (!search ||
        columns.some((column) =>
          String(column.value(row) ?? "")
            .toLocaleLowerCase(locale)
            .includes(search)
        )) &&
      columns.every(
        (column) =>
          !query.filters[column.id] || String(column.value(row) ?? "") === query.filters[column.id]
      )
  )
  const column = columns.find(
    (candidate) => candidate.id === query.sort?.column && candidate.sortable
  )
  const ordered = [...filtered].sort((left, right) => {
    let compared = 0
    if (column) {
      const a = column.value(left),
        b = column.value(right)
      compared =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : collator.compare(String(a ?? ""), String(b ?? ""))
      if (query.sort?.direction === "desc") compared = -compared
    }
    const a = rowId(left),
      b = rowId(right)
    return compared || (a < b ? -1 : a > b ? 1 : 0)
  })
  const page = Math.min(query.page, Math.max(1, Math.ceil(ordered.length / query.pageSize)))
  return {
    rows: ordered.slice((page - 1) * query.pageSize, page * query.pageSize),
    total: ordered.length,
    page
  }
}
`
