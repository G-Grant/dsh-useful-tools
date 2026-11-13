# 0007 — 侧边栏收起功能退役

日期 2026-11-13  
状态 已接受

## 背景

本包合并 `dsh-sidebar-collapse` 时，客户端还没有侧边栏折叠能力，插件只能靠命令式插入一个「分隔线 + 按钮」，在 `localStorage` 记状态，再用一条 `<style>` 隐藏功能入口栏。

DSH 0.2.2 客户端把侧边栏外壳改为 grid 布局，并内置了整栏收起（宽栏 / 图标栏切换）。0.1.1 把按钮改成位置插槽渲染后样式问题解决，但此时两项能力语义已被内置功能覆盖，再多一个只隐藏功能入口栏的按钮属于重复入口。

## 决策

0.2.0 起移除侧边栏相关实现：

- 删除 `src/client/SidebarCollapse.tsx`，不再注册 `sidebar.footer.action`。
- `dsh.client.inject` 去掉 `ui-sidebar` 与 `ui-layout`，`immediately` 一并无须保留。
- locale 去掉 `panels.hide` / `panels.show`，包描述、README 与 icon 回到 worktree 单一主题。

侧边栏折叠交给客户端自带能力，插件不再介入侧边栏 DOM。

## 影响

- 旧用户浏览器里的 `dsh-useful-tools:panels-hidden` 与遗留的 `dsh-sidebar-collapse:panels-hidden` 留在存储里不再被读取，无需清理。
- 从旧版升上来的用户如果此前收起过功能入口栏，需要在客户端用自带的侧边栏折叠恢复视图。
- 包名与「有用的插件集合」保持不变，为后续继续收纳工具留位置。
