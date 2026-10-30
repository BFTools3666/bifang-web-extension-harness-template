import { expect, test } from "vitest"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 两类宿主都编译并执行生成后的真实 Grid，数据只存在于测试。 */
test.each(["web", "extension"] as const)(
  "supports complete neutral grid interactions in %s",
  async (host) => {
    const provider =
      host === "web"
        ? 'import {AppProviders as Providers} from "./app/AppProviders"'
        : 'import {Providers} from "./providers"'
    const output = await runApplicationFixture(
      { selection: { host, modules: [] }, homePageSource: HOME_SOURCE, dataMode: "mock" },
      `import {test,expect,vi} from "vitest"
import {render,screen,within,waitFor} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {Button} from "@mantine/core"
import i18n from "./i18n"
import {DataGrid} from "./pagination/DataGrid"
import {changeGridQuery,projectGrid,type GridColumn,type GridQuery} from "./pagination/gridModel"
${provider}
const rows=Array.from({length:25},(_,index)=>({id:String(index).padStart(2,"0"),name:"Record "+index,group:index%2?"B":"A",amount:Math.floor(index/2)}))
const rowId=(row:typeof rows[number])=>row.id
const action=vi.fn()
const columns:GridColumn<typeof rows[number]>[]=[
  {id:"name",label:"Name",value:row=>row.name,sortable:true,truncate:true},
  {id:"group",label:"Group",value:row=>row.group,filter:[{value:"A",label:"Group A"},{value:"B",label:"Group B"}]},
  {id:"amount",label:"Amount",value:row=>row.amount,sortable:true,numeric:true},
  {id:"action",label:"Action",value:()=>"",render:row=><Button onClick={()=>action(row.id)}>Open {row.name}</Button>}
]
const query:GridQuery={page:1,pageSize:20,search:"",filters:{},sort:null}
/** 稳定排序不修改源集合，搜索和筛选共同约束全集，条件变更原子回第一页。 */
test("projects stable local pages and resets query atomically",()=>{
  const reversed=[...rows].reverse()
  const first=projectGrid(reversed,columns,{...query,sort:{column:"amount",direction:"desc"}},rowId,"en")
  const second=projectGrid(rows,columns,{...query,sort:{column:"amount",direction:"desc"}},rowId,"en")
  expect(first.rows.map(rowId)).toEqual(second.rows.map(rowId))
  expect(first.rows.slice(1,3).map(rowId)).toEqual(["22","23"])
  expect(reversed[0]?.id).toBe("24")
  expect(projectGrid(rows,columns,{...query,page:50,search:"Record",filters:{group:"A"}},rowId,"en")).toMatchObject({page:1,total:13})
  for(const patch of [{search:"x"},{filters:{group:"B"}},{sort:{column:"amount",direction:"asc" as const}},{pageSize:50 as const}])
    expect(changeGridQuery({...query,page:3},patch).page).toBe(1)
  expect(changeGridQuery({...query,page:2},{search:""}).page).toBe(2)
  expect(changeGridQuery({...query,page:2},{filters:{group:""}}).page).toBe(2)
})
/** 多选只全选本页，半选、跨页保留、清空及条件变化保持同一选择范围。 */
test("selects across pages and clears ownership on conditions",async()=>{
  await i18n.changeLanguage("en")
  const user=userEvent.setup(), selection=vi.fn()
  render(<Providers><DataGrid listId="records" label="Records" scope="cross" columns={columns} data={{kind:"local",rows}} rowId={rowId} selectionScope="query" onSelectionChange={selection}/></Providers>)
  const all=screen.getByRole("checkbox",{name:"Select all selectable rows on this page"})
  await user.click(screen.getByRole("checkbox",{name:"Select Record 0"}))
  expect(all).toBePartiallyChecked()
  await user.click(all)
  expect(all).toBeChecked()
  await user.click(screen.getByRole("button",{name:"Page 2"}))
  expect(screen.getByText(/20 selected across pages/)).toBeInTheDocument()
  expect(screen.getByRole("checkbox",{name:"Select all selectable rows on this page"})).not.toBeChecked()
  await user.click(screen.getByRole("checkbox",{name:"Select Record 20"}))
  expect(screen.getByText(/21 selected across pages/)).toBeInTheDocument()
  await user.click(screen.getByRole("button",{name:"Clear selection"}))
  expect(selection).toHaveBeenLastCalledWith([])
  await user.selectOptions(screen.getByRole("combobox",{name:"Group"}),"A")
  expect(screen.getByText("1–13 of 13")).toBeInTheDocument()
  await user.type(screen.getByRole("textbox",{name:"Search"}),"absent")
  await user.click(screen.getByRole("button",{name:"Search"}))
  expect(screen.getByText("No records match these conditions")).toBeInTheDocument()
  const reset=screen.getAllByRole("button",{name:"Clear conditions"})[0]
  if (!reset) throw new Error("Missing reset action")
  await user.click(reset)
  expect(screen.getByText("1–20 of 25")).toBeInTheDocument()
  await user.click(screen.getByRole("button",{name:"Page 2"}))
  await user.click(screen.getByRole("button",{name:"Sort Amount"}))
  expect(screen.getByRole("columnheader",{name:/Amount/})).toHaveAttribute("aria-sort","ascending")
  expect(screen.getByText("1–20 of 25")).toBeInTheDocument()
})
/** 行内控件不冒泡代理选择，行方向键和空格有自己的焦点与动作。 */
test("separates cell actions and keyboard row selection",async()=>{
  await i18n.changeLanguage("en")
  const user=userEvent.setup(), selection=vi.fn()
  const view=render(<Providers><DataGrid listId="records" label="Records" scope="keys" columns={columns} data={{kind:"local",rows:rows.slice(0,3)}} rowId={rowId} onSelectionChange={selection}/></Providers>)
  action.mockClear()
  await user.click(screen.getByRole("button",{name:"Open Record 0"}))
  expect(action).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("checkbox",{name:"Select Record 0"})).not.toBeChecked()
  const row=screen.getByRole("rowheader",{name:"Record 0"}).closest("tr")
  row?.focus()
  await user.keyboard(" {ArrowDown}")
  expect(screen.getByRole("checkbox",{name:"Select Record 0"})).toBeChecked()
  expect(screen.getByRole("rowheader",{name:"Record 1"}).closest("tr")).toHaveFocus()
  await user.click(screen.getByRole("button",{name:"View full Name: Record 0"}))
  const dialog=await screen.findByRole("dialog",{name:"Name"})
  expect(within(dialog).getByText("Record 0")).toBeInTheDocument()
  await user.keyboard("{Escape}")
  await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await waitFor(()=>expect(screen.getByRole("button",{name:"View full Name: Record 0"})).toHaveFocus())
  view.rerender(<Providers><DataGrid listId="records" label="Records" scope="new-owner" columns={columns} data={{kind:"local",rows:rows.slice(0,3)}} rowId={rowId} selection="single"/></Providers>)
  await user.click(screen.getByRole("radio",{name:"Select Record 0"}))
  await user.click(screen.getByRole("radio",{name:"Select Record 1"}))
  expect(screen.getByRole("radio",{name:"Select Record 0"})).not.toBeChecked()
  expect(screen.getByRole("radio",{name:"Select Record 1"})).toBeChecked()
  view.rerender(<Providers><DataGrid listId="records" label="Records" scope="new-owner" columns={columns} data={{kind:"local",rows:rows.slice(0,3)}} rowId={rowId} rowSelectionDisabledReason={row=>row.id==="00"?"Archived record":undefined}/></Providers>)
  expect(screen.getByRole("checkbox",{name:"Select Record 0"})).toBeDisabled()
  expect(screen.getByRole("checkbox",{name:"Select Record 0"})).toHaveAccessibleDescription("Archived record")
})
/** 刷新保留节点和选择；旧页只读、失败恢复和成功纠页使用真实受控回调。 */
test("preserves refresh content and isolates remote pages",async()=>{
  await i18n.changeLanguage("en")
  const user=userEvent.setup(), change=vi.fn(), retry=vi.fn()
  const remote={kind:"remote" as const,rows:rows.slice(0,2),total:25,query,change}
  const view=render(<Providers><DataGrid listId="records" label="Remote" scope="remote" columns={columns} rowId={rowId} data={remote} retry={retry}/></Providers>)
  await user.click(screen.getByRole("checkbox",{name:"Select Record 0"}))
  const region=screen.getByRole("region",{name:"Remote data"})
  view.rerender(<Providers><DataGrid listId="records" label="Remote" scope="remote" columns={columns} rowId={rowId} data={remote} refreshing retry={retry}/></Providers>)
  expect(screen.getByRole("region",{name:"Remote data"})).toBe(region)
  expect(screen.getByRole("checkbox",{name:"Select Record 0"})).toBeChecked()
  expect(screen.getByText("Updating records…")).toBeInTheDocument()
  view.rerender(<Providers><DataGrid listId="records" label="Remote" scope="remote" columns={columns} rowId={rowId} data={remote} error="Update failed" retry={retry}/></Providers>)
  expect(screen.getByRole("alert")).toHaveTextContent("Update failed")
  expect(screen.getByRole("button",{name:"Open Record 0"})).toBeInTheDocument()
  await user.click(screen.getByRole("button",{name:"Retry"}))
  expect(retry).toHaveBeenCalledTimes(1)
  view.rerender(<Providers><DataGrid listId="records" label="Remote" scope="remote" columns={columns} rowId={rowId} data={{...remote,placeholder:true,query:{...query,page:2}}}/></Providers>)
  expect(screen.getByRole("checkbox",{name:"Select Record 0"})).toBeDisabled()
  expect(screen.getByRole("button",{name:"Open Record 0"})).toBeDisabled()
  expect(screen.queryByText("21–25 of 25")).not.toBeInTheDocument()
  expect(change).not.toHaveBeenCalled()
  view.rerender(<Providers><DataGrid listId="records" label="Remote" scope="remote" columns={columns} rowId={rowId} data={{...remote,rows:[],total:1,query:{...query,page:3}}} error="Failed"/></Providers>)
  expect(change).not.toHaveBeenCalled()
  view.rerender(<Providers><DataGrid listId="records" label="Remote" scope="remote" columns={columns} rowId={rowId} data={{...remote,rows:[],total:1,query:{...query,page:3}}}/></Providers>)
  await waitFor(()=>expect(change).toHaveBeenCalledWith({...query,page:1}))
  const selected=vi.fn()
  view.rerender(<Providers><DataGrid listId="cross-refresh" label="Remote" scope="remote" columns={columns} rowId={rowId} data={remote} selectionScope="query" onSelectionChange={selected}/></Providers>)
  await user.click(screen.getByRole("checkbox",{name:"Select Record 0"}))
  const nextPage={...remote,rows:rows.slice(20),query:{...query,page:2}}
  view.rerender(<Providers><DataGrid listId="cross-refresh" label="Remote" scope="remote" columns={columns} rowId={rowId} data={nextPage} selectionScope="query" onSelectionChange={selected}/></Providers>)
  await user.click(screen.getByRole("checkbox",{name:"Select Record 20"}))
  view.rerender(<Providers><DataGrid listId="cross-refresh" label="Remote" scope="remote" columns={columns} rowId={rowId} data={nextPage} selectionScope="query" onSelectionChange={selected} rowSelectionDisabledReason={row=>row.id==="20"?"Archived":undefined}/></Providers>)
  expect(screen.getByRole("checkbox",{name:"Select Record 20"})).not.toBeChecked()
  expect(screen.getByText(/1 selected across pages/)).toBeInTheDocument()
  expect(selected).toHaveBeenLastCalledWith(["00"])
})
/** 当前页选择翻页即清空；全局空态和首次加载均有真实的可感知状态。 */
test("resets page selection and distinguishes first load and empty data",async()=>{
  await i18n.changeLanguage("zh")
  const user=userEvent.setup()
  const view=render(<Providers><DataGrid listId="records" label="记录" scope="page" columns={columns} data={{kind:"local",rows}} rowId={rowId}/></Providers>)
  await user.click(screen.getByRole("checkbox",{name:"选择Record 0"}))
  await user.click(screen.getByRole("button",{name:"第 2 页"}))
  expect(screen.getByText("当前页已选 0 条")).toBeInTheDocument()
  await user.click(screen.getByRole("button",{name:"第 1 页"}))
  expect(screen.getByRole("checkbox",{name:"选择Record 0"})).not.toBeChecked()
  await user.click(screen.getByRole("checkbox",{name:"选择Record 0"}))
  view.rerender(<Providers><DataGrid listId="records" label="记录" scope="page" columns={columns} data={{kind:"local",rows:rows.slice(1)}} rowId={rowId}/></Providers>)
  view.rerender(<Providers><DataGrid listId="records" label="记录" scope="page" columns={columns} data={{kind:"local",rows}} rowId={rowId}/></Providers>)
  expect(screen.getByRole("checkbox",{name:"选择Record 0"})).not.toBeChecked()
  await user.click(screen.getByRole("button",{name:"查看Name完整值：Record 0"}))
  expect(await screen.findByRole("dialog",{name:"Name"})).toBeInTheDocument()
  view.rerender(<Providers><DataGrid listId="records" label="记录" scope="empty" columns={columns} data={{kind:"local",rows:[]}} rowId={rowId} loading/></Providers>)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.getByRole("region",{name:"记录数据"})).toHaveAttribute("aria-busy","true")
  view.rerender(<Providers><DataGrid listId="records" label="记录" scope="empty" columns={columns} data={{kind:"local",rows:[]}} rowId={rowId}/></Providers>)
  expect(screen.getByText("暂无记录")).toBeInTheDocument()
})
/** 极端合法宽度仍回流，列偏好变化不能让手柄相互覆盖。 */
test("reflows valid disproportionate column widths",async()=>{
  const dimensions=vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue(new DOMRect(0,0,1200,400))
  const many:GridColumn<typeof rows[number]>[]=Array.from({length:8},(_,index)=>({id:"col"+index,label:"Column "+index,value:row=>row.name,width:index?640:96}))
  const view=render(<Providers><DataGrid listId="widths" label="Wide" scope="widths" columns={many} rowId={rowId} data={{kind:"local",rows:rows.slice(0,1)}}/></Providers>)
  expect(screen.getByRole("region",{name:"Wide"})).toHaveAttribute("data-stacked","true")
  view.unmount()
  dimensions.mockRestore()
})`
    )
    expect(output).toMatch(/Tests\s+6 passed/u)
  },
  90_000
)
