/** 生成职责独立的 Grid 查询或交互模块，不引入请求与第二份缓存。 */
export const GRID_INTERACTIONS = `import { Button, Modal } from "@mantine/core"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import classes from "./dataGrid.module.css"

/** 按实际列数与文字大小选择字段回流，不让大量列挤压控件。 */
export function useGridLayout(
  columnCount: number,
  widths: readonly number[] = [],
  reservedWidth = 0
) {
  const ref = useRef<HTMLElement>(null)
  const [stacked, setStacked] = useState(false)
  const signature = JSON.stringify(widths)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const size = Number.parseFloat(getComputedStyle(element).fontSize) || 14
      const width = element.getBoundingClientRect().width
      const total = widths.reduce((sum, value) => sum + value, 0)
      const smallest =
        total > 0
          ? (Math.min(...widths) / total) * Math.max(0, width - reservedWidth * size)
          : width
      if (width > 0) setStacked(width < Math.max(40, columnCount * 9) * size || smallest < 9 * size)
      const header = element.querySelector<HTMLElement>("thead")
      if (header)
        element.style.setProperty(
          "--ui-grid-header-height",
          header.getBoundingClientRect().height + "px"
        )
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    // em 探针同时感知只改变文字大小、未改变容器宽度的设置。
    const probe = element.querySelector<HTMLElement>("[data-grid-probe]")
    if (probe) observer.observe(probe)
    const header = element.querySelector<HTMLElement>("thead")
    if (header) observer.observe(header)
    return () => observer.disconnect()
  }, [columnCount, signature, reservedWidth])
  return { ref, stacked }
}

/** 选择仅存稳定业务身份，拥有者变化立即丢弃旧范围。 */
export function useGridSelection(
  owner: string,
  allowed: readonly string[] | null,
  mode: "none" | "single" | "multiple",
  notify?: (ids: readonly string[]) => void,
  excluded: readonly string[] = []
) {
  const [snapshot, setSnapshot] = useState<{ owner: string; ids: readonly string[] }>({
    owner,
    ids: []
  })
  const previous = snapshot.owner === owner && mode !== "none" ? snapshot.ids : []
  const ids = previous.filter((id) => (!allowed || allowed.includes(id)) && !excluded.includes(id))
  const signature = JSON.stringify(ids)
  if (snapshot.owner !== owner || JSON.stringify(snapshot.ids) !== signature)
    setSnapshot({ owner, ids })
  const notified = useRef("[]")
  useEffect(() => {
    if (notified.current !== signature) {
      notified.current = signature
      notify?.(ids)
    }
  }, [signature, notify])
  /** 单选替换，多选对当前页执行合并或移除，清空覆盖全部已选页。 */
  function update(next: readonly string[]) {
    setSnapshot({ owner, ids: mode === "single" ? next.slice(-1) : next })
  }
  return {
    ids,
    update,
    toggle: (id: string) =>
      update(
        ids.includes(id)
          ? ids.filter((value) => value !== id)
          : mode === "single"
            ? [id]
            : [...ids, id]
      )
  }
}

/** 截断值用实际按钮和可关闭弹窗查看，触摸与键盘都能访问。 */
export function GridValue({
  value,
  label,
  truncate = false
}: {
  value: string
  label: string
  truncate?: boolean
}) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  if (!truncate) return <span className={classes.value}>{value}</span>
  return (
    <>
      <Button
        type="button"
        variant="subtle"
        size="xs"
        className={classes.valueButton}
        classNames={{ label: classes.valueLabel }}
        aria-label={t("gridFullValue", { column: label, value })}
        onClick={() => setOpened(true)}
      >
        <span className={classes.ellipsis}>{value}</span>
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={label}
        returnFocus
        closeButtonProps={{ "aria-label": t("gridClose") }}
      >
        <p className={classes.value}>{value}</p>
      </Modal>
    </>
  )
}
`
