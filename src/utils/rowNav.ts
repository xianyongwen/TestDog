// 列表行整行点击进入详情的共用守卫：
// 行内的操作按钮、勾选框、下拉、拖拽手柄等控件点击会冒泡到行，
// 这里过滤掉这些来源，避免误触发行跳转。
const INTERACTIVE = [
  'button',
  'a',
  'input',
  'textarea',
  '.ant-select',
  '.ant-checkbox',
  '.ant-switch',
  '.ant-radio',
  '.ant-popover', // Popconfirm 气泡内点击
  '.ant-table-selection-column', // 勾选列
  '.cursor-grab', // 拖拽手柄
].join(',');

export function rowClickNav(
  nav: (path: string) => void,
  path: string,
): (e: React.MouseEvent<HTMLTableRowElement>) => void {
  return (e) => {
    if (!path) return;
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    nav(path);
  };
}
