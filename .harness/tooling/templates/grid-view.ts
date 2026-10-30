/** 展示入口集中拥有公开 props、状态与语义呈现；查询计算、选择生命周期与样式已独立，保留同一 UI 编排以避免透传片段。 */
export const GRID_VIEW = `import {
  Button,
  Checkbox,
  Group,
  NativeSelect,
  Radio,
  Stack,
  Table,
  Text,
  TextInput
} from "@mantine/core"
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { ListFooter } from "./ListFooter"
import { TableColumnControls, TableColumnHeader, useTableColumns } from "./TableColumns"
import { GridValue, useGridLayout, useGridSelection } from "./gridInteractions"
import {
  changeGridQuery,
  projectGrid,
  type GridColumn,
  type GridData,
  type GridQuery
} from "./gridModel"
import classes from "./dataGrid.module.css"
import "../i18n/grid"

/** scope 隔离账号、组织和列表；远端 Query/错误/取消仍归调用方。 */
export interface DataGridProps<T> {
  listId: string
  label: string
  scope: string
  columns: readonly GridColumn<T>[]
  data: GridData<T>
  rowId(row: T): string
  selection?: "none" | "single" | "multiple"
  selectionScope?: "page" | "query"
  selectable?(row: T): boolean
  rowSelectionDisabledReason?(row: T): string | undefined
  selectionDisabledReason?: string
  onSelectionChange?(ids: readonly string[]): void
  loading?: boolean
  refreshing?: boolean
  error?: string
  retry?(): void
}

/** 原生 table 保留行列关系；行焦点的方向键不截获内部控件事件。 */
function moveRowFocus(
  event: KeyboardEvent<HTMLTableRowElement>,
  toggle: () => void,
  selectable: boolean
) {
  if (event.target !== event.currentTarget) return
  if (event.key === " " && selectable) {
    event.preventDefault()
    toggle()
    return
  }
  const rows = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>("tr[data-grid-row]") ??
      []
  )
  const index = rows.indexOf(event.currentTarget)
  const next =
    event.key === "ArrowDown"
      ? Math.min(rows.length - 1, index + 1)
      : event.key === "ArrowUp"
        ? Math.max(0, index - 1)
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? rows.length - 1
            : -1
  if (next >= 0) {
    event.preventDefault()
    rows[next]?.focus()
  }
}

/** 完整本地集合或受控远端页共用同一展示，远端页绝不再次本地搜索/排序。 */
export function DataGrid<T>({
  listId,
  label,
  scope,
  columns,
  data,
  rowId,
  selection = "multiple",
  selectionScope = "page",
  selectable,
  rowSelectionDisabledReason,
  selectionDisabledReason,
  onSelectionChange,
  loading = false,
  refreshing = false,
  error,
  retry
}: DataGridProps<T>) {
  const { t, i18n } = useTranslation()
  const instance = useId()
  const [local, setLocal] = useState<{ scope: string; query: GridQuery }>({
    scope,
    query: { page: 1, pageSize: 20, search: "", filters: {}, sort: null }
  })
  const initial: GridQuery = { page: 1, pageSize: 20, search: "", filters: {}, sort: null }
  const query = data.kind === "remote" ? data.query : local.scope === scope ? local.query : initial
  const projection = useMemo(
    () =>
      data.kind === "local" ? projectGrid(data.rows, columns, query, rowId, i18n.language) : null,
    [data.kind, data.rows, columns, query, rowId, i18n.language]
  )
  const rows = projection?.rows ?? data.rows
  const total = projection?.total ?? (data.kind === "remote" ? data.total : 0)
  const placeholder = data.kind === "remote" && data.placeholder === true
  const locked = loading || placeholder
  const filtered = Boolean(query.search.trim() || Object.values(query.filters).some(Boolean))
  const [draft, setDraft] = useState(query.search)
  useEffect(() => {
    setDraft(query.search)
  }, [query.search, scope])
  /** 所有条件变更经过一个入口，远端原子交给 Router/feature。 */
  function change(patch: Partial<GridQuery>) {
    const next = changeGridQuery(query, patch)
    if (JSON.stringify(next) === JSON.stringify(query)) return
    if (data.kind === "remote") data.change(next)
    else setLocal({ scope, query: next })
  }
  const correction = useRef("")
  const lastPage = Math.max(1, Math.ceil(total / query.pageSize))
  useEffect(() => {
    if (locked || refreshing || error) return
    const key = JSON.stringify([scope, query, total])
    if (query.page <= lastPage) {
      correction.current = ""
      return
    }
    if (correction.current !== key) {
      correction.current = key
      change({ page: lastPage })
    }
  }, [scope, query, total, locked, refreshing, error, lastPage])
  const displayPage = projection?.page ?? query.page
  const canSelect = (row: T) =>
    !selectionDisabledReason && !rowSelectionDisabledReason?.(row) && (selectable?.(row) ?? true)
  const pageIds = rows.filter(canSelect).map(rowId)
  const owner = JSON.stringify([
    listId,
    scope,
    selection,
    selectionScope,
    query.search,
    query.filters,
    ...(selectionScope === "page" ? [query.sort, displayPage, query.pageSize] : [])
  ])
  const allowed =
    locked || refreshing || error
      ? null
      : selectionScope === "page"
        ? pageIds
        : data.kind === "local"
          ? data.rows.filter(canSelect).map(rowId)
          : null
  const excluded =
    !locked && !refreshing && !error ? rows.filter((row) => !canSelect(row)).map(rowId) : []
  const selected = useGridSelection(owner, allowed, selection, onSelectionChange, excluded)
  const checked = pageIds.length > 0 && pageIds.every((id) => selected.ids.includes(id))
  const partial = !checked && pageIds.some((id) => selected.ids.includes(id))
  const definitions = useMemo(
    () =>
      columns.map((column, index) => ({
        id: column.id,
        label: column.label,
        required: index === 0,
        width: column.width ?? 160
      })),
    [columns]
  )
  const preferences = useTableColumns("grid:" + listId, scope, definitions)
  const visible = columns.filter((column) => preferences.visible(column.id))
  const layout = useGridLayout(
    visible.length + (selection === "none" ? 0 : 1),
    visible.map((column) => preferences.width(column.id)),
    selection === "none" ? 0 : 3
  )
  const empty = rows.length === 0
  const blocking = empty && (loading || Boolean(error))
  const selectionLocked = locked || Boolean(selectionDisabledReason)
  const sortLabel = query.sort
    ? t(query.sort.direction === "asc" ? "gridAscending" : "gridDescending")
    : t("gridUnsorted")
  /** 表头仅选择当前页，跨页模式保留其他页身份，清空按钮清除全部。 */
  function selectPage() {
    selected.update(
      checked
        ? selected.ids.filter((id) => !pageIds.includes(id))
        : [...new Set([...selected.ids, ...pageIds])]
    )
  }
  return (
    <section
      ref={layout.ref}
      className={classes.root}
      aria-label={label}
      data-stacked={layout.stacked || undefined}
    >
      <span data-grid-probe aria-hidden="true" className={classes.probe} />
      <Stack gap="sm" className={classes.toolbar}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!locked) change({ search: draft.trim() })
          }}
        >
          <Group align="end" wrap="wrap">
            <TextInput
              label={t("gridSearch")}
              placeholder={t("gridSearchPlaceholder")}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              disabled={locked}
              className={classes.search}
            />
            <Button type="submit" disabled={locked}>
              {t("gridSearch")}
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={locked || (!filtered && !query.sort && !draft)}
              onClick={() => {
                setDraft("")
                change({ search: "", filters: {}, sort: null })
              }}
            >
              {t("gridReset")}
            </Button>
            {retry && (
              <Button
                type="button"
                variant="default"
                disabled={loading || refreshing || placeholder}
                onClick={retry}
              >
                {t("gridRefresh")}
              </Button>
            )}
            <TableColumnControls columns={preferences} disabled={locked} />
          </Group>
        </form>
        <Group align="end" wrap="wrap">
          {columns
            .filter((column) => column.filter)
            .map((column) => (
              <NativeSelect
                key={column.id}
                label={column.label}
                value={query.filters[column.id] ?? ""}
                disabled={locked}
                className={classes.filter}
                data={[{ value: "", label: t("gridAll") }, ...(column.filter ?? [])]}
                onChange={(event) =>
                  change({ filters: { ...query.filters, [column.id]: event.currentTarget.value } })
                }
              />
            ))}
        </Group>
        <Text size="sm">
          {t("gridConditions", {
            search: query.search || t("gridAll"),
            filters:
              columns
                .filter((column) => query.filters[column.id])
                .map(
                  (column) =>
                    column.label +
                    ": " +
                    (column.filter?.find((option) => option.value === query.filters[column.id])
                      ?.label ?? query.filters[column.id])
                )
                .join(" · ") || t("gridAll"),
            sort: query.sort
              ? (columns.find((column) => column.id === query.sort?.column)?.label ?? "") +
                " · " +
                sortLabel
              : sortLabel
          })}
        </Text>
        {selection !== "none" && (
          <Group wrap="wrap">
            <Text size="sm" role="status" aria-live="polite">
              {t(selectionScope === "page" ? "gridSelectedPage" : "gridSelectedQuery", {
                count: selected.ids.length
              })}
            </Text>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              disabled={selectionLocked || !selected.ids.length}
              onClick={() => selected.update([])}
            >
              {t("gridClearSelection")}
            </Button>
            {selectionDisabledReason && <Text size="sm">{selectionDisabledReason}</Text>}
          </Group>
        )}
      </Stack>
      <div
        className={classes.feedback}
        role={error ? "alert" : "status"}
        aria-live={error ? "assertive" : "polite"}
      >
        {loading
          ? t("gridLoading")
          : refreshing
            ? t("gridRefreshing")
            : placeholder
              ? t("gridPlaceholder")
              : ""}
        {error && (
          <>
            {error}{" "}
            {retry && (
              <Button
                type="button"
                size="sm"
                variant="subtle"
                disabled={loading || refreshing}
                onClick={retry}
              >
                {t("gridRetry")}
              </Button>
            )}
          </>
        )}
      </div>
      <div
        role="region"
        aria-label={t("gridViewport", { label })}
        tabIndex={0}
        className={classes.viewport}
        aria-busy={loading || refreshing || placeholder}
      >
        <Table
          role="table"
          layout="fixed"
          stickyHeader
          stickyHeaderOffset={0}
          className={classes.table}
        >
          <Table.Thead role="rowgroup">
            <Table.Tr role="row">
              {selection !== "none" && (
                <Table.Th role="columnheader" scope="col" className={classes.selection}>
                  {selection === "multiple" ? (
                    <Checkbox
                      aria-label={t("gridSelectPage")}
                      checked={checked}
                      indeterminate={partial}
                      disabled={selectionLocked || !pageIds.length}
                      onChange={selectPage}
                    />
                  ) : (
                    t("gridSelect")
                  )}
                </Table.Th>
              )}
              {visible.map((column) => (
                <TableColumnHeader
                  key={column.id}
                  columns={preferences}
                  id={column.id}
                  disabled={locked}
                  reservedWidth={selection === "none" ? 0 : 3}
                  aria-sort={
                    query.sort?.column === column.id
                      ? query.sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {column.sortable ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="subtle"
                      disabled={locked}
                      className={classes.sort}
                      classNames={{ label: classes.valueLabel }}
                      aria-label={t("gridSort", { column: column.label })}
                      onClick={() =>
                        change({
                          sort:
                            query.sort?.column !== column.id
                              ? { column: column.id, direction: "asc" }
                              : query.sort.direction === "asc"
                                ? { column: column.id, direction: "desc" }
                                : null
                        })
                      }
                    >
                      {column.label}{" "}
                      <span aria-hidden="true">
                        {query.sort?.column === column.id
                          ? query.sort.direction === "asc"
                            ? " ↑"
                            : " ↓"
                          : " ↕"}
                      </span>
                    </Button>
                  ) : (
                    column.label
                  )}
                </TableColumnHeader>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody role="rowgroup">
            {!blocking &&
              rows.map((row) => {
                const id = rowId(row),
                  active = selected.ids.includes(id)
                const reason =
                  selectionDisabledReason ||
                  rowSelectionDisabledReason?.(row) ||
                  (!canSelect(row) ? t("gridUnavailable") : undefined)
                const reasonId = instance + ":" + id + ":reason"
                return (
                  <Table.Tr
                    key={JSON.stringify([listId, scope, id])}
                    role="row"
                    data-grid-row
                    data-selected={active || undefined}
                    aria-selected={selection === "none" ? undefined : active}
                    tabIndex={0}
                    onKeyDown={(event) =>
                      moveRowFocus(
                        event,
                        () => selected.toggle(id),
                        selection !== "none" && !selectionLocked && canSelect(row)
                      )
                    }
                  >
                    {selection !== "none" && (
                      <Table.Td role="cell" className={classes.selection}>
                        {selection === "single" ? (
                          <Radio
                            name={JSON.stringify(["grid", instance, listId, scope])}
                            aria-label={t("gridSelectRow", {
                              value: String(columns[0]?.value(row) ?? id)
                            })}
                            aria-describedby={reason ? reasonId : undefined}
                            checked={active}
                            disabled={selectionLocked || !canSelect(row)}
                            onChange={() => selected.update([id])}
                          />
                        ) : (
                          <Checkbox
                            aria-label={t("gridSelectRow", {
                              value: String(columns[0]?.value(row) ?? id)
                            })}
                            aria-describedby={reason ? reasonId : undefined}
                            checked={active}
                            disabled={selectionLocked || !canSelect(row)}
                            onChange={() => selected.toggle(id)}
                          />
                        )}
                        {reason && (
                          <Text id={reasonId} size="sm">
                            {reason}
                          </Text>
                        )}
                      </Table.Td>
                    )}
                    {visible.map((column, index) => {
                      const content = (
                        <>
                          <span aria-hidden="true" className={classes.cellLabel}>
                            {column.label}
                          </span>
                          <span
                            className={classes.content}
                            data-numeric={column.numeric || undefined}
                          >
                            {column.render ? (
                              <fieldset
                                disabled={locked}
                                inert={locked}
                                className={classes.actions}
                              >
                                {column.render(row)}
                              </fieldset>
                            ) : (
                              <GridValue
                                value={String(column.value(row) ?? "—")}
                                label={column.label}
                                truncate={column.truncate}
                              />
                            )}
                          </span>
                        </>
                      )
                      return index === 0 ? (
                        <Table.Th role="rowheader" scope="row" key={column.id}>
                          {content}
                        </Table.Th>
                      ) : (
                        <Table.Td role="cell" key={column.id}>
                          {content}
                        </Table.Td>
                      )
                    })}
                  </Table.Tr>
                )
              })}
            {empty && (
              <Table.Tr role="row">
                <Table.Td
                  role="cell"
                  colSpan={visible.length + (selection !== "none" ? 1 : 0)}
                  className={classes.empty}
                >
                  {blocking
                    ? loading
                      ? t("gridLoading")
                      : error
                    : filtered
                      ? t("gridNoMatch")
                      : t("gridEmpty")}
                  {!blocking && filtered && (
                    <Button
                      type="button"
                      variant="subtle"
                      onClick={() => change({ search: "", filters: {} })}
                    >
                      {t("gridReset")}
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>
      <ListFooter
        state={{ page: displayPage, pageSize: query.pageSize }}
        total={total}
        disabled={locked}
        showRange={!locked && !blocking}
        change={change}
      />
    </section>
  )
}
`
