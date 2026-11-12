import { PanelBody } from './SidePanel';

/**
 * 移动端的二级导航抽屉：桌面用左侧面板做这件事，手机上收进这里。
 * 内容与面板同源（视图 / 共享空间 / 文件夹），点了就关。
 */
export function SpacesBody({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="sheet__title">导航</div>
      <div className="sheet__desc">切换记录的视角，或进入某个共享空间。</div>
      <div className="sheet__body">
        <PanelBody onNavigate={onClose} />
      </div>
    </>
  );
}
