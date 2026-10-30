/** 生成两个宿主各自持有的品牌色阶与外观切换基础。 */
export function themeFiles(): Map<string, string> {
  return new Map<string, string>([
    [
      "src/theme/designTokens.ts",
      `import type { CSSVariablesResolver, MantineThemeOverride } from "@mantine/core"
import classes from "./design.module.css"

const FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'
const MONO_FAMILY = 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, "PingFang SC", "Microsoft YaHei", monospace'
const CONTROL_SIZE = "md"
const MOTION = { duration: 200, timingFunction: "ease-in-out" }

/** 当前成员唯一基础视觉令牌；品牌色仍由本成员身份派生。 */
export const designTokens: MantineThemeOverride = {
  black: "#1d2129",
  fontFamily: FONT_FAMILY,
  fontFamilyMonospace: MONO_FAMILY,
  fontSizes: { xs: "0.75rem", sm: "0.8125rem", md: "0.875rem", lg: "1rem", xl: "1.125rem" },
  lineHeights: { xs: "1.5", sm: "1.5", md: "1.6", lg: "1.6", xl: "1.5" },
  headings: { fontFamily: FONT_FAMILY, fontWeight: "600", sizes: {
    h1: { fontSize: "1.5rem", lineHeight: "1.35" },
    h2: { fontSize: "1.25rem", lineHeight: "1.4" },
    h3: { fontSize: "1.125rem", lineHeight: "1.45" },
    h4: { fontSize: "1rem", lineHeight: "1.5" },
    h5: { fontSize: "0.875rem", lineHeight: "1.5" },
    h6: { fontSize: "0.8125rem", lineHeight: "1.5" }
  } },
  defaultRadius: "md",
  radius: { xs: "0.125rem", sm: "0.125rem", md: "0.25rem", lg: "0.5rem", xl: "0.75rem" },
  spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  shadows: {
    xs: "0 2px 8px rgba(0, 0, 0, 0.08)",
    sm: "0 4px 16px rgba(0, 0, 0, 0.12)",
    md: "0 8px 24px rgba(0, 0, 0, 0.16)"
  },
  components: {
    Button: { defaultProps: { size: CONTROL_SIZE }, classNames: { root: classes.button, label: classes.label } },
    Text: { defaultProps: { size: "md" } },
    Input: { defaultProps: { size: CONTROL_SIZE }, classNames: { input: classes.placeholder } },
    InputWrapper: { defaultProps: { size: CONTROL_SIZE } },
    TextInput: { defaultProps: { size: CONTROL_SIZE } },
    PasswordInput: { defaultProps: { size: CONTROL_SIZE }, classNames: { innerInput: classes.placeholder } },
    Textarea: { defaultProps: { size: CONTROL_SIZE } },
    NumberInput: { defaultProps: { size: CONTROL_SIZE } },
    Select: { defaultProps: { size: CONTROL_SIZE } },
    NativeSelect: { defaultProps: { size: CONTROL_SIZE } },
    MultiSelect: { defaultProps: { size: CONTROL_SIZE } },
    FileInput: { defaultProps: { size: CONTROL_SIZE } },
    Checkbox: { defaultProps: { size: CONTROL_SIZE } },
    Radio: { defaultProps: { size: CONTROL_SIZE } },
    Switch: { defaultProps: { size: CONTROL_SIZE } },
    Slider: { defaultProps: { size: CONTROL_SIZE } },
    ActionIcon: { defaultProps: { size: CONTROL_SIZE } },
    SegmentedControl: { defaultProps: { size: CONTROL_SIZE } },
    Modal: { defaultProps: { centered: true, transitionProps: MOTION } },
    Drawer: { defaultProps: { transitionProps: MOTION } },
    Popover: { defaultProps: { transitionProps: MOTION } },
    Menu: { defaultProps: { transitionProps: MOTION } },
    Tooltip: { defaultProps: { transitionProps: MOTION } },
    Paper: { defaultProps: { radius: "lg" } },
    Card: { defaultProps: { radius: "lg" } }
  }
}

/** 共享布局、字重、动效和占位文本只从本成员根 Provider 暴露。 */
export const designVariables: CSSVariablesResolver = () => ({
  variables: {
    "--ui-header-height": "4.5rem",
    "--ui-focus-width": "2px",
    "--ui-font-weight-medium": "500",
    "--ui-font-weight-normal": "400",
    "--ui-font-weight-strong": "600",
    "--ui-letter-spacing": "normal",
    "--ui-table-line-height": "1.5",
    "--ui-cell-padding": "0.5rem",
    "--ui-sticky-offset": "0px",
    "--ui-grid-height": "32rem",
    "--ui-skip-layer": "500",
    "--ui-transition-duration": String(MOTION.duration) + "ms",
    "--ui-transition-timing": MOTION.timingFunction
  },
  light: {
    "--ui-placeholder-color": "#495057", "--mantine-color-dimmed": "#495057",
    "--ui-grid-stripe": "#f1f3f5", "--ui-grid-hover": "#e9ecef",
    "--ui-grid-selected": "#dbe4ff", "--ui-grid-border": "#868e96",
    "--ui-grid-focus": "#364fc7"
  },
  dark: {
    "--ui-placeholder-color": "#c1c2c5", "--mantine-color-dimmed": "#c1c2c5",
    "--ui-grid-stripe": "#25262b", "--ui-grid-hover": "#373a40",
    "--ui-grid-selected": "#303f69", "--ui-grid-border": "#909296",
    "--ui-grid-focus": "#bac8ff"
  }
})
`
    ],
    [
      "src/theme/design.module.css",
      `:global(body) {
  font-synthesis: none;
  letter-spacing: var(--ui-letter-spacing);
  overflow-wrap: anywhere;
}
:global(code), :global(pre), :global(kbd) {
  font-family: var(--mantine-font-family-monospace);
}
:global(pre) { white-space: pre-wrap; overflow-wrap: anywhere; }
:global([data-numeric]) { font-variant-numeric: tabular-nums; }
.button { height: auto; min-height: var(--button-height); }
.label { white-space: normal; padding-block: var(--mantine-spacing-xs); }
.placeholder::placeholder {
  color: var(--ui-placeholder-color);
  opacity: 1;
}
`
    ],
    [
      "src/theme/ColorSchemeControl.test.tsx",
      `// @vitest-environment jsdom
import "../i18n"
import { MantineProvider } from "@mantine/core"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import i18n from "../i18n"
import { BRAND } from "../brand"
import { colorSchemeManager } from "../data/storage/colorScheme"
import { ColorSchemeControl } from "./ColorSchemeControl"

/** 独立验证外观基础，不依赖已移除的欢迎页和演示计数器。 */
test.each([false, true])("persists appearance with compact control %s", async (compact) => {
  await i18n.changeLanguage("en")
  localStorage.removeItem(BRAND.id + ":color-scheme:v1")
  const user = userEvent.setup()
  render(<MantineProvider defaultColorScheme="auto" colorSchemeManager={colorSchemeManager}><ColorSchemeControl compact={compact} /></MantineProvider>)
  if (compact) await user.selectOptions(screen.getByRole("combobox", { name: "Appearance" }), "dark")
  else await user.click(screen.getByText("Dark"))
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark")
  expect(localStorage.getItem(BRAND.id + ":color-scheme:v1")).toBe("dark")
})
`
    ],
    [
      "src/theme/brandScale.ts",
      `import type { MantineColorsTuple } from "@mantine/core"

/** 让自动黑白前景色在不透明品牌底色上满足普通文字 4.5:1 对比度。 */
export const BRAND_TEXT_LUMINANCE_THRESHOLD = 0.179

/** 以已校验的品牌色生成不同亮度的十阶主题色。 */
export function createBrandScale(primaryColor: string): MantineColorsTuple {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(primaryColor.slice(offset, offset + 2), 16)
  )
  const average = channels.reduce((sum, channel) => sum + channel, 0) / 3
  const balanced = channels.map((channel) =>
    average < 38
      ? Math.round(channel * 0.7 + 255 * 0.3)
      : average > 217
        ? Math.round(channel * 0.7)
        : channel
  )
  const shade = (target: number, weight: number) =>
    "#" +
    balanced
      .map((channel) =>
        Math.round(channel * (1 - weight) + target * weight)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  return [
    shade(255, 0.94),
    shade(255, 0.84),
    shade(255, 0.7),
    shade(255, 0.54),
    shade(255, 0.36),
    shade(255, 0.18),
    shade(0, 0),
    shade(0, 0.18),
    shade(0, 0.36),
    shade(0, 0.54)
  ]
}
`
    ],
    [
      "src/theme/brandScale.test.ts",
      `import { expect, test } from "vitest"
import { BRAND_TEXT_LUMINANCE_THRESHOLD, createBrandScale } from "./brandScale"

/** 验证中间品牌色和极端输入都生成可区分的十阶色。 */
test("creates distinct light and dark brand shades", () => {
  for (const color of ["#5B5BD6", "#000000", "#FFFFFF"]) {
    const shades = createBrandScale(color)
    expect(shades).toHaveLength(10)
    expect(new Set(shades).size).toBe(10)
    expect(shades.every((shade) => /^#[0-9a-f]{6}$/u.test(shade))).toBe(true)
  }
  expect(createBrandScale("#5B5BD6")[6]).toBe("#5b5bd6")
})

/** 验证合法品牌色的所有填充色阶均可配出 AA 普通文字对比度。 */
test("keeps automatic brand text contrast above 4.5 to 1", () => {
  for (const color of ["#FF0000", "#808080", "#777777", "#000000", "#FFFFFF", "#00FF00", "#0000FF"]) {
    for (const shade of createBrandScale(color)) {
      // 按 WCAG 相对亮度公式独立计算，避免测试复用主题选择实现。
      const linearChannel = (offset: number) => {
        const channel = Number.parseInt(shade.slice(offset, offset + 2), 16) / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      }
      const background =
        linearChannel(1) * 0.2126 + linearChannel(3) * 0.7152 + linearChannel(5) * 0.0722
      const contrast = background > BRAND_TEXT_LUMINANCE_THRESHOLD
        ? (background + 0.05) / 0.05
        : 1.05 / (background + 0.05)
      expect(contrast, color + " " + shade).toBeGreaterThanOrEqual(4.5)
    }
  }
})
`
    ],
    [
      "src/theme/ColorSchemeControl.tsx",
      `import { NativeSelect, SegmentedControl, useMantineColorScheme } from "@mantine/core"
import { useTranslation } from "react-i18next"

/** 限制紧凑外观选择只在 Popup 使用。 */
interface ColorSchemeControlProps {
  compact?: boolean
}

/** 为当前页面提供跟随系统、亮色与暗色的可访问外观选择。 */
export function ColorSchemeControl({ compact = false }: ColorSchemeControlProps) {
  const { t } = useTranslation()
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const data = [
    { value: "auto", label: t("colorSchemeAuto") },
    { value: "light", label: t("colorSchemeLight") },
    { value: "dark", label: t("colorSchemeDark") }
  ]
  const selectColorScheme = (value: string) => {
    if (value === "auto" || value === "light" || value === "dark") {
      setColorScheme(value)
    }
  }

  if (compact) {
    return (
      <NativeSelect
        label={t("colorSchemeLabel")}
        size="sm"
        data={data}
        value={colorScheme}
        onChange={(event) => selectColorScheme(event.currentTarget.value)}
      />
    )
  }

  return <SegmentedControl aria-label={t("colorSchemeLabel")} value={colorScheme} onChange={selectColorScheme} data={data} />
}
`
    ]
  ])
}
