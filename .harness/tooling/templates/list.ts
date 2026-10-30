import { tableColumnFiles } from "./table-columns.ts"
import { gridFiles } from "./grid.ts"

/** 列表表面与语义表格组合。 */
const LIST_SURFACE = `import { Paper, Table, type TableProps } from "@mantine/core"
import type { ReactNode } from "react"
import { useGridLayout } from "./gridInteractions"
import classes from "./listSurface.module.css"

/** 列表表面统一边框、滚动区和页脚，保留调用方的数据与状态归属。 */
export function ListSurface({
  children,
  label,
  footer,
  scroll = true
}: {
  children: ReactNode
  label: string
  footer?: ReactNode
  minWidth?: number
  scroll?: boolean
}) {
  return (
    <Paper
      component="div"
      withBorder
      radius="lg"
      className={classes.surface}
      role={scroll ? undefined : "region"}
      aria-label={scroll ? undefined : label}
    >
      {scroll ? (
        <div
          role="region"
          aria-label={label}
          tabIndex={0}
          className={classes.scroll}
        >
          {children}
        </div>
      ) : (
        children
      )}
      {footer}
    </Paper>
  )
}

/** 同一表格组合固定密度和表头样式，领域仅声明列与行。 */
export function ListTable({ className, responsiveColumns = [], ...props }: TableProps & { responsiveColumns?: readonly { label: string; width: number }[] }) {
  const layout = useGridLayout(responsiveColumns.length || 1, responsiveColumns.map((column) => column.width))
  return (
    <div ref={(element) => { layout.ref.current = element }} className={classes.layout} data-stacked={layout.stacked || undefined}>
      <span data-grid-probe aria-hidden="true" className={classes.probe} />
    <Table
      {...props}
      layout="fixed"
      stickyHeader
      stickyHeaderOffset={0}
      horizontalSpacing="sm"
      verticalSpacing="sm"
      striped
      highlightOnHover
      role="table"
      className={[classes.table, className].filter(Boolean).join(" ")}
    />
    </div>
  )
}

/** 旧领域表格显式提供字段标签，在窄容器保留内容及动作的完整访问。 */
export function ListCell({ label, children, rowHeader = false, className }: { label: string; children: ReactNode; rowHeader?: boolean; className?: string }) {
  const content = <><span aria-hidden="true" className={classes.cellLabel}>{label}</span><div className={classes.content}>{children}</div></>
  return rowHeader ? <Table.Th role="rowheader" scope="row" className={className}>{content}</Table.Th> : <Table.Td role="cell" className={className}>{content}</Table.Td>
}
`

/** 列表、行与页脚统一使用现有 Mantine 令牌。 */
const LIST_STYLES = `.surface {
  min-width: 0;
  overflow: hidden;
}
.scroll { min-width: 0; max-width: 100%; max-height: var(--ui-grid-height); overflow-y: auto; overflow-x: hidden; }
.layout { min-width: 0; max-width: 100%; container-type: inline-size; }
.probe { position: absolute; width: 1em; height: 1em; visibility: hidden; pointer-events: none; }
.table { width: 100%; max-width: 100%; font-size: var(--mantine-font-size-md); }
.table th, .table td { overflow-wrap: anywhere; min-width: 0; line-height: var(--ui-table-line-height); }
.table button, .table a { max-width: 100%; overflow-wrap: anywhere; }
.table tbody tr { scroll-margin-block: calc(var(--ui-grid-header-height, 6rem) + var(--mantine-spacing-sm)); }
.cellLabel { display: none; }
.content { min-width: 0; max-width: 100%; }
.layout[data-stacked] .table, .layout[data-stacked] thead, .layout[data-stacked] tbody { display: block; }
.layout[data-stacked] thead { max-height: 12em; overflow-y: auto; }
.layout[data-stacked] thead tr { display: flex; flex-wrap: wrap; }
.layout[data-stacked] thead th { display: block; flex: 1 1 9em; }
.layout[data-stacked] tbody tr { display: block; border-bottom: 1px solid var(--ui-grid-border); }
.layout[data-stacked] tbody th, .layout[data-stacked] tbody td { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: var(--mantine-spacing-sm); text-align: start; }
.layout[data-stacked] .cellLabel { display: block; color: var(--mantine-color-dimmed); }
.layout[data-stacked] td:last-child > div, .layout[data-stacked] td:last-child > .content > div { justify-content: flex-start; }
@container (max-width: 24em) {
  .layout[data-stacked] tbody th, .layout[data-stacked] tbody td { grid-template-columns: minmax(0, 1fr); }
}
.scroll:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-grid-focus);
  outline-offset: -2px;
}
.table thead th {
  background: var(--mantine-color-body);
  color: var(--mantine-color-dimmed);
  font-weight: var(--ui-font-weight-strong);
}
.table td:last-child,
.table thead th:last-child {
  text-align: end;
}
.table td:last-child > div,
.table td:last-child > .content > div {
  justify-content: flex-end;
}
.footer {
  border-top: 1px solid var(--mantine-color-default-border);
  padding: var(--mantine-spacing-md) var(--mantine-spacing-lg);
}
.controls {
  display: flex;
  align-items: center;
  gap: var(--mantine-spacing-md);
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  flex: 1 1 24rem;
}
.pagination { flex: 1 1 16rem; min-width: 0; max-width: 100%; }
.capacity { width: 6em; min-width: 0; max-width: 100%; }
.pageSize {
  display: flex;
  align-items: center;
  gap: var(--mantine-spacing-xs);
  color: var(--mantine-color-dimmed);
  font-size: var(--mantine-font-size-sm);
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
}
.row {
  padding: var(--mantine-spacing-md) var(--mantine-spacing-lg);
  border-bottom: 1px solid var(--mantine-color-default-border);
}
.row:last-child {
  border-bottom: 0;
}
.state {
  padding: var(--mantine-spacing-xl);
}
`

/** 分页摘要、容量选择与数字页码的本地化组合。 */
const LIST_FOOTER = `import { useTranslation } from "react-i18next"
import { PaginationControls } from "./PaginationControls"
import type { PageRequest } from "./useSessionPagination"
import "../i18n/lists"

/** 所有列表页脚共用范围摘要、条数选择和页码，领域保留状态适配。 */
export function ListFooter({
  state,
  total,
  disabled = false,
  showRange = true,
  change
}: {
  state: PageRequest
  total: number
  disabled?: boolean
  showRange?: boolean
  change(patch: Partial<PageRequest>): void
}) {
  const { t } = useTranslation()
  return (
    <PaginationControls
      request={state}
      total={total}
      disabled={disabled}
      showRange={showRange}
      onPageChange={(page) => change({ page })}
      onPageSizeChange={(pageSize) => change({ page: 1, pageSize })}
      labels={{
        navigation: t("listPagination"),
        page: (page) => t("listPage", { page }),
        summary: (page, totalPages) => t("listPageSummary", { page, totalPages }),
        previous: t("listPrevious"),
        next: t("listNext"),
        pageSize: t("listPageSize"),
        pageSizePlaceholder: t("listChoosePageSize"),
        range: (from, to, total) => t(total ? "listRange" : "listTotal", { from, to, total })
      }}
    />
  )
}
`

/** 弹窗本地分页与主体隔离。 */
const LOCAL_PAGINATION = `import { useState } from "react"
import { type PageRequest, isPageSize } from "./useSessionPagination"

/** 弹窗分页独立于底层路由；主体变化立即使用默认页，不请求上一主体的页码。 */
export function useLocalPagination(owner: string) {
  const [snapshot, setSnapshot] = useState<{ owner: string; request: PageRequest }>({
    owner,
    request: { page: 1, pageSize: 20 }
  })
  const request = snapshot.owner === owner ? snapshot.request : { page: 1, pageSize: 20 as const }
  /** 每页数量修改与回到第一页原子发生。 */
  function change(patch: Partial<PageRequest>) {
    setSnapshot((previous) => {
      const current =
        previous.owner === owner ? previous.request : { page: 1, pageSize: 20 as const }
      const pageSize = isPageSize(patch.pageSize) ? patch.pageSize : current.pageSize
      return {
        owner,
        request: {
          pageSize,
          page: pageSize !== current.pageSize ? 1 : (patch.page ?? current.page)
        }
      }
    })
  }
  /** 成功读取后才纠正越界页，不从失败推断总数。 */
  function correct(total: number) {
    if (!Number.isSafeInteger(total) || total < 0) return
    const page = Math.max(1, Math.ceil(total / request.pageSize))
    if (request.page > page) change({ page })
  }
  return { request, change, correct }
}
`

/** 标准列表的两种语言文案。 */
const LIST_LOCALES = `import i18n from "../i18n"

i18n.addResourceBundle(
  "en",
  "translation",
  {
    listPagination: "List pagination",
    listPage: "Page {{page}}",
    listPageSummary: "Page {{page}} of {{totalPages}}",
    listPrevious: "Previous page",
    listNext: "Next page",
    listPageSize: "Rows per page",
    listChoosePageSize: "Choose rows per page",
    listRange: "{{from}}–{{to}} of {{total}}",
    listTotal: "{{total}} records"
    ,listColumns: "Configure columns",
    listColumnWidth: "{{column}} preferred width",
    listColumnWidthPlaceholder: "Enter a relative width between 96 and 640",
    listRequiredColumn: "Required column",
    listResizeColumn: "Resize {{column}}",
    listResetColumns: "Reset columns"
  },
  true,
  true
)
i18n.addResourceBundle(
  "zh",
  "translation",
  {
    listPagination: "列表分页",
    listPage: "第 {{page}} 页",
    listPageSummary: "第 {{page}} 页，共 {{totalPages}} 页",
    listPrevious: "上一页",
    listNext: "下一页",
    listPageSize: "每页条数",
    listChoosePageSize: "选择每页显示数量",
    listRange: "第 {{from}}–{{to}} 条，共 {{total}} 条",
    listTotal: "共 {{total}} 条"
    ,listColumns: "配置列",
    listColumnWidth: "{{column}}首选宽度",
    listColumnWidthPlaceholder: "填写 96 至 640 的相对宽度",
    listRequiredColumn: "此列必须显示",
    listResizeColumn: "调整{{column}}列宽",
    listResetColumns: "重置列配置"
  },
  true,
  true
)
`

/** 标准列表同时生成到两种宿主，数据与请求仍由消费者拥有。 */
export function listFiles(): Map<string, string> {
  return new Map([
    ...gridFiles(),
    ...tableColumnFiles(),
    ["src/pagination/ListSurface.tsx", LIST_SURFACE],
    ["src/pagination/listSurface.module.css", LIST_STYLES],
    ["src/pagination/ListFooter.tsx", LIST_FOOTER],
    ["src/pagination/useLocalPagination.ts", LOCAL_PAGINATION],
    ["src/i18n/lists.ts", LIST_LOCALES]
  ])
}
