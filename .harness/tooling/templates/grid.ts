import { GRID_MODEL } from "./grid-model.ts"
import { GRID_INTERACTIONS } from "./grid-interactions.ts"
import { GRID_VIEW } from "./grid-view.ts"

/** Grid 不包含示例记录，按调用方传入的真实本地集合或远端页渲染。 */
export function gridFiles(): Map<string, string> {
  return new Map([
    ["src/pagination/gridModel.ts", GRID_MODEL],
    ["src/pagination/gridInteractions.tsx", GRID_INTERACTIONS],
    ["src/pagination/DataGrid.tsx", GRID_VIEW],
    ["src/pagination/dataGrid.module.css", STYLES],
    ["src/i18n/grid.ts", LOCALES]
  ])
}

/** 宽容器保持列对齐，窄容器按具名字段回流，所有状态消费同一主题。 */
const STYLES = `.root {
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--ui-grid-border);
  border-radius: var(--mantine-radius-lg);
  container-type: inline-size;
  color: var(--mantine-color-text);
  background: var(--mantine-color-body);
  font-size: var(--mantine-font-size-md);
  line-height: var(--ui-table-line-height);
}
.toolbar { padding: var(--mantine-spacing-sm); }
.search { flex: 1 1 12rem; min-width: 0; }
.filter { flex: 0 1 12rem; min-width: 0; max-width: 100%; }
.feedback { min-height: 2.5em; padding-inline: var(--mantine-spacing-sm); overflow-wrap: anywhere; }
.viewport { min-width: 0; max-width: 100%; max-height: var(--ui-grid-height); overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; }
.viewport:focus-visible, .table tr:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-grid-focus);
  outline-offset: -2px;
}
.table { width: 100%; max-width: 100%; border-collapse: separate; border-spacing: 0; font-size: inherit; line-height: var(--ui-table-line-height); }
.table th, .table td { min-width: 0; padding: var(--ui-cell-padding); overflow-wrap: anywhere; vertical-align: top; border-bottom: 1px solid var(--mantine-color-default-border); }
.table thead { top: var(--ui-sticky-offset); z-index: 2; background: var(--mantine-color-body); }
.table thead th { background-color: var(--mantine-color-body); color: var(--mantine-color-text); font-weight: var(--ui-font-weight-strong); }
.table tbody th { font-weight: var(--ui-font-weight-medium); text-align: start; }
.table tbody tr { scroll-margin-block: calc(var(--ui-grid-header-height, 6rem) + var(--mantine-spacing-sm)); }
.table tbody tr:nth-child(even) { background: var(--ui-grid-stripe); }
.table tbody tr:hover { background: var(--ui-grid-hover); }
.table tbody tr[data-selected] { background: var(--ui-grid-selected); }
.table tbody tr[data-selected] > :first-child { box-shadow: inset 3px 0 var(--ui-grid-focus); }
.selection { width: 3rem; }
.content { display: block; min-width: 0; max-width: 100%; }
.content[data-numeric] { text-align: end; font-variant-numeric: tabular-nums; }
.cellLabel { display: none; }
.value { white-space: pre-wrap; overflow-wrap: anywhere; }
.valueButton { display: block; max-width: 100%; min-width: 0; min-height: 24px; padding-inline: 0; text-align: start; color: inherit; font-size: inherit; font-weight: var(--ui-font-weight-normal); }
.valueLabel { padding-block: 0; min-width: 0; }
.ellipsis { display: block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sort { max-width: 100%; min-height: 24px; padding-inline: 0; text-align: start; color: inherit; font-size: inherit; font-weight: var(--ui-font-weight-strong); }
.actions { margin: 0; padding: 0; border: 0; min-width: 0; max-width: 100%; }
.actions a, .actions button { max-width: 100%; overflow-wrap: anywhere; }
.empty { text-align: center; padding: var(--mantine-spacing-lg); }
.probe { position: absolute; width: 1em; height: 1em; visibility: hidden; pointer-events: none; }
.root[data-stacked] .table, .root[data-stacked] .table thead, .root[data-stacked] .table tbody { display: block; }
.root[data-stacked] .table thead { position: sticky; max-height: 12em; overflow-y: auto; }
.root[data-stacked] .table thead tr { display: flex; flex-wrap: wrap; }
.root[data-stacked] .table thead th { display: block; flex: 1 1 9em; }
.root[data-stacked] .table tbody tr { display: block; border-bottom: 1px solid var(--ui-grid-border); }
.root[data-stacked] .table tbody th, .root[data-stacked] .table tbody td { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: var(--mantine-spacing-sm); border: 0; }
.root[data-stacked] .table tbody .selection, .root[data-stacked] .table tbody .empty { display: block; width: auto; }
.root[data-stacked] .cellLabel { display: block; color: var(--mantine-color-dimmed); font-weight: var(--ui-font-weight-medium); }
@container (max-width: 40em) {
  .table, .table thead, .table tbody { display: block; }
  .table thead { position: sticky; max-height: 12em; overflow-y: auto; }
  .table thead tr { display: flex; flex-wrap: wrap; }
  .table thead th { display: block; flex: 1 1 9em; }
  .table tbody tr { display: block; border-bottom: 1px solid var(--ui-grid-border); }
  .table tbody th, .table tbody td { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: var(--mantine-spacing-sm); border: 0; }
  .table tbody .selection, .table tbody .empty { display: block; width: auto; }
  .cellLabel { display: block; color: var(--mantine-color-dimmed); font-weight: var(--ui-font-weight-medium); }
}
@container (max-width: 24em) {
  .root[data-stacked] .table tbody th, .root[data-stacked] .table tbody td,
  .table tbody th, .table tbody td { grid-template-columns: minmax(0, 1fr); gap: var(--mantine-spacing-xs); }
}
`

/** Grid 文案和辅助技术名称与既有 locale 同步。 */
const LOCALES = `import i18n from "../i18n"
i18n.addResourceBundle("en", "translation", {
  gridSearch: "Search", gridSearchPlaceholder: "Search all available fields", gridReset: "Clear conditions",
  gridAll: "All", gridRefresh: "Refresh", gridRetry: "Retry", gridClose: "Close",
  gridConditions: "Search: {{search}} · Filters: {{filters}} · Sort: {{sort}}",
  gridUnsorted: "Default order", gridAscending: "Ascending", gridDescending: "Descending", gridSort: "Sort {{column}}",
  gridSelectedPage: "{{count}} selected on this page", gridSelectedQuery: "{{count}} selected across pages · Select all applies to this page",
  gridClearSelection: "Clear selection", gridSelect: "Select", gridSelectPage: "Select all selectable rows on this page",
  gridSelectRow: "Select {{value}}", gridUnavailable: "This record is unavailable for selection", gridFullValue: "View full {{column}}: {{value}}", gridViewport: "{{label}} data",
  gridLoading: "Loading records…", gridRefreshing: "Updating records…", gridPlaceholder: "Loading the requested page; previous rows are read-only",
  gridEmpty: "No records yet", gridNoMatch: "No records match these conditions"
}, true, true)
i18n.addResourceBundle("zh", "translation", {
  gridSearch: "搜索", gridSearchPlaceholder: "搜索各字段中的内容", gridReset: "清除条件",
  gridAll: "全部", gridRefresh: "刷新", gridRetry: "重试", gridClose: "关闭",
  gridConditions: "搜索：{{search}} · 筛选：{{filters}} · 排序：{{sort}}",
  gridUnsorted: "默认顺序", gridAscending: "升序", gridDescending: "降序", gridSort: "按{{column}}排序",
  gridSelectedPage: "当前页已选 {{count}} 条", gridSelectedQuery: "跨页已选 {{count}} 条 · 全选仅作用于当前页",
  gridClearSelection: "清空选择", gridSelect: "选择", gridSelectPage: "全选当前页可选记录",
  gridSelectRow: "选择{{value}}", gridUnavailable: "此记录暂不可选择", gridFullValue: "查看{{column}}完整值：{{value}}", gridViewport: "{{label}}数据",
  gridLoading: "正在加载记录…", gridRefreshing: "正在更新记录…", gridPlaceholder: "正在加载目标页，原有记录暂时只读",
  gridEmpty: "暂无记录", gridNoMatch: "没有符合当前条件的记录"
}, true, true)
`
