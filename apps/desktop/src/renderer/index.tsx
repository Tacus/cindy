/**
 * Renderer 模块图分发入口。
 *
 * 资源用量窗口、右侧栏独立子窗口与主应用共用同一个受信任 HTML/origin，
 * 但从这里开始加载不同的模块图。判断必须发生在任何主应用静态依赖之前，
 * 否则 ESM 会先执行语音、诊断和设置初始化。
 */

import { CURRENT_BRAND_IDENTITY, IS_OFFICIAL_BUILD_IDENTITY } from '../shared/brandRegion';

const urlParams = new URLSearchParams(window.location.search);
const isRemoteDesktopViewer = urlParams.get('remoteDesktopViewer') === '1';
const isResourceUsageWindow = urlParams.get('resourceUsageWindow') === '1';
const isSidebarWindow = urlParams.get('sidebarWindow') === '1';

// 个人构建身份(fork-local)的可见标识:窗口标题 / 任务栏悬停带上 `Cindy Personal`,
// 与同机并存的官方安装一眼区分;官方构建不进入这个分支。
if (!IS_OFFICIAL_BUILD_IDENTITY) {
  document.title = CURRENT_BRAND_IDENTITY.displayName;
}

void (isRemoteDesktopViewer
  ? import('./remote-desktop-viewer-entry')
  : isResourceUsageWindow
  ? import('./resource-usage-entry')
  : isSidebarWindow
    ? import('./sidebar-window-entry')
    : import('./main-entry')
).catch((error: unknown) => {
  // 入口加载失败发生在 React boundary 之前，仍通过统一 renderer logger 落盘。
  window.electronAPI?.logToMain?.(
    'error',
    'renderer/entry',
    `renderer entry load failed: ${error instanceof Error ? error.message : String(error)}`,
  );
});
