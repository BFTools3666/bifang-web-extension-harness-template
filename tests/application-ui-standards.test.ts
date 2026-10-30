import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"
import { applicationFiles } from "../.agents/skills/web-compose-capabilities/templates/application/files.ts"
import type { ApplicationOptions } from "../.agents/skills/web-compose-capabilities/templates/application/contracts.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"
import { repositoryRoot } from "./harness-tooling-support.ts"

const mock = readFileSync(
  path.join(repositoryRoot, "tests/fixtures/application-api/identity/mock.ts.txt"),
  "utf8"
)
const adapter =
  'import {createIdentityMock} from "./mock"\nexport const api=createIdentityMock([{id:"member",account:"demo",password:"demo",displayName:"Member"}])\nexport const personalSettingsApi={\n/** 读取测试资料。 */\nasync read(){return {id:"member",email:"demo@example.invalid",nickname:"Member"}},\n/** 保存测试昵称。 */\nasync rename(){},\n/** 修改测试密码。 */\nasync changePassword(){}\n}\n'

/** 两种宿主的真实 Provider 都消费设计契约中的间距，不只在文档声明。 */
test.each(["web", "extension"] as const)(
  "applies the shared design spacing through the %s provider",
  async (host) => {
    const provider =
      host === "web"
        ? 'import {AppProviders as Providers} from "./app/AppProviders";'
        : 'import {Providers} from "./providers";'
    const testSource = `import {test,expect} from "vitest";
import {render,screen} from "@testing-library/react";
import {useMantineTheme,Title,Text,Button} from "@mantine/core";
import {designVariables} from "./theme/designTokens";
${provider}
/** 从实际根 Provider 读取合并后的令牌。 */
function ThemeProbe() {
  const theme = useMantineTheme()
  return <>
    <output aria-label="Spacing">{JSON.stringify(theme.spacing)}</output>
    <output aria-label="Defaults">{JSON.stringify({
      button: theme.components.Button?.defaultProps?.size,
      input: theme.components.Input?.defaultProps?.size,
      radius: theme.radius.md,
      text: theme.fontSizes.md
    })}</output>
    <output aria-label="Typography">{JSON.stringify({font:theme.fontFamily,mono:theme.fontFamilyMonospace,
      small:theme.fontSizes.sm,bodyLine:theme.lineHeights.md,headingWeight:theme.headings.fontWeight,h1:theme.headings.sizes.h1})}</output>
    <output aria-label="Palette">{JSON.stringify({variables:designVariables(theme),lightText:theme.black,darkText:theme.colors.dark[0]})}</output>
    <Title order={1}>中文 Heading 2026</Title><Text>中文 English 123</Text><Button>长按钮 Long action</Button>
  </>
}
/** 验证实际消费结果保留 4px 栅格及 rem 缩放单位。 */
test("consumes design spacing", () => {
  render(<Providers><ThemeProbe /></Providers>)
  expect(JSON.parse(screen.getByLabelText("Spacing").textContent ?? "null")).toEqual({
    xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem"
  })
  expect(JSON.parse(screen.getByLabelText("Defaults").textContent ?? "null")).toEqual({
    button: "md", input: "md", radius: "0.25rem", text: "0.875rem"
  })
  const typography=JSON.parse(screen.getByLabelText("Typography").textContent ?? "null")
  expect(typography.font).toMatch(/system-ui.*PingFang SC.*Microsoft YaHei.*Noto Sans/u)
  expect(typography.mono).toContain("ui-monospace")
  expect(typography.small).toBe("0.8125rem")
  expect(typography.bodyLine).toBe("1.6")
  expect(typography.h1).toEqual({fontSize:"1.5rem",lineHeight:"1.35"})
  expect(typography.headingWeight).toBe("600")
  expect(screen.getByRole("heading",{level:1,name:"中文 Heading 2026"})).toBeInTheDocument()
  expect(screen.getByRole("button",{name:"长按钮 Long action"})).toBeInTheDocument()
  const palette=JSON.parse(screen.getByLabelText("Palette").textContent ?? "null")
  /** 独立核算文字和焦点对比度，不复用主题内部选择公式。 */
  function luminance(hex:string) {
    const channels=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255)
      .map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4)
    return (channels[0]??0)*0.2126+(channels[1]??0)*0.7152+(channels[2]??0)*0.0722
  }
  /** 共享表面包括斑马、悬停和选中，两种方案都满足普通文字阈值。 */
  function contrast(a:string,b:string) {
    const left=luminance(a),right=luminance(b)
    return (Math.max(left,right)+0.05)/(Math.min(left,right)+0.05)
  }
  for(const scheme of ["light","dark"]) {
    const vars=palette.variables[scheme]
    for(const key of ["--ui-grid-stripe","--ui-grid-hover","--ui-grid-selected"]) {
      expect(contrast(vars[key],scheme==="light"?palette.lightText:palette.darkText)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(vars[key],vars["--ui-placeholder-color"])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(vars[key],vars["--ui-grid-focus"])).toBeGreaterThanOrEqual(3)
    }
  }
});`
    const output = await runApplicationFixture(
      { selection: { host, modules: [] }, homePageSource: HOME_SOURCE, dataMode: "mock" },
      testSource
    )
    expect(output).toMatch(/Tests\s+1 passed/u)
  },
  90_000
)

/** 两宿主共享真实列配置，恢复和作用域变化不能隐藏必显列或串用偏好。 */
test.each(["web", "extension"] as const)(
  "supports accessible column preferences in %s tables",
  async (host) => {
    const provider =
      host === "web"
        ? 'import {AppProviders as Providers} from "./app/AppProviders";'
        : 'import {Providers} from "./providers";'
    const source = `import {test,expect,vi} from "vitest"
import {render,screen,waitFor,fireEvent} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {Table} from "@mantine/core"
import i18n from "./i18n"
import {useTableColumns,TableColumnControls,TableColumnHeader} from "./pagination/TableColumns"
import {ListSurface,ListTable} from "./pagination/ListSurface"
import {normalizeColumns,readColumns,writeColumns} from "./data/storage/tableColumns"
${provider}
const definitions = [
  {id:"name",label:"Name",required:true,width:240},
  {id:"detail",label:"Detail",width:160}
]
/** 同一表格在主体变更时立即消费新作用域，不等待旧响应清理。 */
function Grid({scope,disabled=false}:{scope:string;disabled?:boolean}) {
  const columns=useTableColumns("records",scope,definitions,true)
  return <Providers><TableColumnControls columns={columns} disabled={disabled}/><ListSurface label="Records">
    <ListTable><Table.Thead><Table.Tr>
      <TableColumnHeader columns={columns} id="name" disabled={disabled}>Name</TableColumnHeader>
      {columns.visible("detail") && <TableColumnHeader columns={columns} id="detail" disabled={disabled}>Detail</TableColumnHeader>}
    </Table.Tr></Table.Thead><Table.Tbody><Table.Tr><Table.Th scope="row">A</Table.Th>
      {columns.visible("detail") && <Table.Td>B</Table.Td>}
    </Table.Tr></Table.Tbody></ListTable>
  </ListSurface></Providers>
}
/** 键盘调整、显隐、重开恢复与账号/组织隔离都经过同一实际 UI。 */
test("restores preferences and isolates ownership",async()=>{
  await i18n.changeLanguage("en")
  const user=userEvent.setup()
  const view=render(<Grid scope="account-a:organization-a"/>)
  const resize=screen.getByRole("separator",{name:"Resize Detail"})
  resize.focus()
  await user.keyboard("{ArrowRight}")
  expect(resize).toHaveAttribute("aria-valuenow","164")
  await user.click(screen.getByRole("button",{name:"Configure columns"}))
  expect(screen.getByRole("checkbox",{name:"Name"})).toBeDisabled()
  await user.click(screen.getByRole("checkbox",{name:"Detail"}))
  expect(screen.queryByRole("separator",{name:"Resize Detail"})).not.toBeInTheDocument()
  await user.keyboard("{Escape}")
  await waitFor(()=>expect(screen.getByRole("button",{name:"Configure columns"})).toHaveFocus())
  view.unmount()
  const restored=render(<Grid scope="account-a:organization-a"/>)
  expect(screen.queryByRole("separator",{name:"Resize Detail"})).not.toBeInTheDocument()
  restored.rerender(<Grid scope="account-a:organization-b"/>)
  expect(screen.getByRole("separator",{name:"Resize Detail"})).toHaveAttribute("aria-valuenow","160")
  await user.click(screen.getByRole("button",{name:"Configure columns"}))
  await user.click(screen.getByRole("button",{name:"Reset columns"}))
  expect(screen.getByRole("checkbox",{name:"Detail"})).toBeChecked()
})
/** 合成事件只替代 jsdom 缺失的指针构造，不替换真实 React 交互逻辑。 */
function pointer(target:HTMLElement,type:string,pointerId:number,clientX:number) {
  const event=new Event(type,{bubbles:true})
  Object.defineProperties(event,{pointerId:{value:pointerId},button:{value:0},clientX:{value:clientX}})
  fireEvent(target,event)
}
/** 拖拽只接受原指针，禁用、取消和作用域改变立即终止旧手势。 */
test("cancels resizing across disabled and ownership changes",async()=>{
  await i18n.changeLanguage("en")
  const view=render(<Grid scope="drag-a"/>)
  const resize=screen.getByRole("separator",{name:"Resize Detail"})
  const release=vi.fn()
  Object.defineProperties(resize,{
    setPointerCapture:{value:vi.fn()},hasPointerCapture:{value:()=>true},releasePointerCapture:{value:release}
  })
  pointer(resize,"pointerdown",1,100)
  pointer(resize,"pointermove",2,180)
  expect(resize).toHaveAttribute("aria-valuenow","160")
  pointer(resize,"pointermove",1,132)
  expect(resize).toHaveAttribute("aria-valuenow","192")
  view.rerender(<Grid scope="drag-a" disabled/>)
  expect(release).toHaveBeenCalledWith(1)
  pointer(resize,"pointermove",1,220)
  expect(resize).toHaveAttribute("aria-valuenow","192")
  view.rerender(<Grid scope="drag-a"/>)
  pointer(resize,"pointerdown",3,100)
  pointer(resize,"pointercancel",3,100)
  pointer(resize,"pointermove",3,200)
  expect(resize).toHaveAttribute("aria-valuenow","192")
  pointer(resize,"pointerdown",4,100)
  view.rerender(<Grid scope="drag-b"/>)
  pointer(resize,"pointermove",4,240)
  expect(screen.getByRole("separator",{name:"Resize Detail"})).toHaveAttribute("aria-valuenow","160")
})
/** 损坏值、未知版本、必显列、宽度边界和存储拒绝均安全回退。 */
test("rejects invalid persisted columns",()=>{
  expect(normalizeColumns({version:1,hidden:["name","detail","unknown"],widths:{name:-1,detail:99999}},definitions))
    .toEqual({version:1,hidden:["detail"],widths:{name:96,detail:640}})
  expect(normalizeColumns({version:2,hidden:["detail"]},definitions).hidden).toEqual([])
  localStorage.setItem("broken-columns","invalid json")
  expect(readColumns("broken-columns",definitions).hidden).toEqual([])
  const denied=vi.spyOn(localStorage,"getItem").mockImplementation(()=>{throw new Error("denied")})
  expect(readColumns("denied",definitions).widths.name).toBe(240)
  denied.mockRestore()
  const blocked=vi.spyOn(localStorage,"setItem").mockImplementation(()=>{throw new Error("denied")})
  expect(()=>writeColumns("denied",normalizeColumns(null,definitions))).not.toThrow()
  blocked.mockRestore()
})`
    const output = await runApplicationFixture(
      { selection: { host, modules: [] }, homePageSource: HOME_SOURCE, dataMode: "mock" },
      source
    )
    expect(output).toMatch(/Tests\s+3 passed/u)
  },
  90_000
)

/** 每种宿主和账号操作均生成真实代码，菜单弹窗不能改底层地址或丢失焦点。 */
test.each(
  (["web", "extension"] as const).flatMap((host) =>
    (["identity.profile", "identity.password.change"] as const).map((operation) => ({
      host,
      operation
    }))
  )
)(
  "generates $host $operation account dialogs without organization switching",
  async ({ host, operation }) => {
    const web = host === "web",
      label = operation === "identity.profile" ? "Personal settings" : "Change password"
    const opts: ApplicationOptions = {
      selection: { host, operations: [operation] },
      homePageSource: HOME_SOURCE,
      dataMode: "adapter",
      adapters: { identity: adapter }
    }
    const testSource =
      'import {test,expect} from "vitest";import {render,screen,within,waitFor} from "@testing-library/react";import userEvent from "@testing-library/user-event";import {RouterProvider,createRouter,createMemoryHistory} from "@tanstack/react-router";import i18n from "./i18n";import "./i18n/application";import {identitySession} from "./features/application/runtime";' +
      (web
        ? 'import {routeTree} from "./routeTree.gen";import {AppProviders as Providers} from "./app/AppProviders";'
        : 'import {createExtensionRouter} from "./extension-router";import {Providers} from "./providers";') +
      'test("account operation without switch",async()=>{await i18n.changeLanguage("en");await identitySession.login({account:"demo",password:"demo"});const router=' +
      (web
        ? 'createRouter({routeTree,history:createMemoryHistory({initialEntries:["/"]})})'
        : 'createExtensionRouter("popup")') +
      ';const user=userEvent.setup();render(<Providers><RouterProvider router={router}/></Providers>);await screen.findByRole("heading",{name:"Text tool"});await user.click(screen.getByRole("button",{name:/User center/}));expect(screen.queryByRole("menuitem",{name:"Switch organization"})).not.toBeInTheDocument();await user.click(screen.getByRole("menuitem",{name:"' +
      label +
      '"}));const dialog=await screen.findByRole("dialog",{name:"' +
      label +
      '"});expect(router.state.location.pathname).toBe("/");' +
      (operation === "identity.profile"
        ? 'await within(dialog).findByRole("textbox",{name:"Email"});'
        : 'expect(within(dialog).getByPlaceholderText("Enter your current password")).toBeInTheDocument();') +
      'await user.keyboard("{Escape}");await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());await waitFor(()=>expect(screen.getByRole("button",{name:/User center/})).toHaveFocus());});'
    const output = await runApplicationFixture(opts, testSource, {
      baseUrl: "https://api.fixture.invalid/v1",
      /** 只为隔离生成测试补充身份替身，不进入产品装配。 */
      assemble(base) {
        const files = applicationFiles(base, opts)
        files.set("src/data/api/identity/mock.ts", mock)
        return files
      }
    })
    expect(output).toMatch(/Tests\s+1 passed/u)
  },
  90_000
)

/** 默认基础与能力装配共用列表，不允许私有分页或重复地标回归。 */
test.each(["web", "extension"] as const)(
  "generates the standard %s list and footer",
  async (host) => {
    const provider =
      host === "web"
        ? 'import {AppProviders as Providers} from "./app/AppProviders";'
        : 'import {Providers} from "./providers";'
    const testSource =
      'import {test,expect,vi} from "vitest";import {render,screen} from "@testing-library/react";import userEvent from "@testing-library/user-event";import i18n from "./i18n";import {ListSurface,ListTable} from "./pagination/ListSurface";import {ListFooter} from "./pagination/ListFooter";import {Table} from "@mantine/core";' +
      provider +
      'test("neutral list surface and footer use one landmark and both languages",async()=>{await i18n.changeLanguage("zh");const change=vi.fn();const view=(page:number,total:number)=><Providers><ListSurface label="Records" footer={<ListFooter state={{page,pageSize:20}} total={total} change={change}/>}><ListTable><Table.Thead><Table.Tr><Table.Th scope="col">Name</Table.Th></Table.Tr></Table.Thead><Table.Tbody><Table.Tr><Table.Th scope="row">Record</Table.Th></Table.Tr></Table.Tbody></ListTable></ListSurface></Providers>;const rendered=render(view(1,41));expect(screen.getAllByRole("region",{name:"Records"})).toHaveLength(1);expect(screen.getByRole("navigation",{name:"列表分页"})).toBeInTheDocument();expect(screen.getByRole("status")).toHaveTextContent("第 1–20 条，共 41 条");const user=userEvent.setup();await user.click(screen.getByRole("button",{name:"第 3 页"}));expect(change).toHaveBeenLastCalledWith({page:3});await user.click(screen.getByRole("combobox",{name:"每页条数"}));await user.click(screen.getByRole("option",{name:"50"}));expect(change).toHaveBeenLastCalledWith({page:1,pageSize:50});rendered.rerender(view(3,21));expect(screen.queryByRole("status")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"第 3 页"})).not.toBeInTheDocument();rendered.rerender(view(1,0));expect(screen.getByRole("status")).toHaveTextContent("共 0 条");await i18n.changeLanguage("en");expect(await screen.findByRole("navigation",{name:"List pagination"})).toBeInTheDocument();expect(screen.getByRole("combobox",{name:"Rows per page"})).toBeInTheDocument();});'
    const output = await runApplicationFixture(
      { selection: { host, modules: [] }, homePageSource: HOME_SOURCE, dataMode: "mock" },
      testSource
    )
    expect(output).toMatch(/Tests\s+1 passed/u)
  },
  90_000
)
