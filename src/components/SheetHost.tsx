import { AnimatePresence } from 'framer-motion';
import { useUI } from '../lib/ui';
import { Lightbox, SheetFrame } from './Sheet';
import { MemoEditorBody } from './MemoEditor';
import { NewFolderBody, RenameFolderBody } from './NewFolderSheet';
import { SettingsBody } from './SettingsSheet';
import { GroupBody, NewGroupBody } from './GroupSheet';
import { SpacesBody } from './SpacesSheet';

export function SheetHost() {
  const sheet = useUI((s) => s.sheet);
  const close = useUI((s) => s.close);

  const key = sheet
    ? sheet.kind === 'editor'
      ? `editor:${sheet.memoId}`
      : sheet.kind === 'rename-folder'
        ? `rename:${sheet.folderId}`
        : sheet.kind === 'group'
            ? `group:${sheet.groupId}`
            : sheet.kind
    : 'none';

  return (
    <>
      <AnimatePresence>
        {sheet && sheet.kind !== 'lightbox' && (
          <SheetFrame key={key} onClose={close}>
            {sheet.kind === 'editor' && <MemoEditorBody memoId={sheet.memoId} onClose={close} />}
            {sheet.kind === 'new-folder' && <NewFolderBody onClose={close} />}
            {sheet.kind === 'rename-folder' && (
              <RenameFolderBody folderId={sheet.folderId} onClose={close} />
            )}
            {sheet.kind === 'settings' && <SettingsBody onClose={close} />}
            {sheet.kind === 'new-group' && <NewGroupBody onClose={close} />}
            {sheet.kind === 'group' && <GroupBody groupId={sheet.groupId} onClose={close} />}
            {sheet.kind === 'spaces' && <SpacesBody onClose={close} />}
          </SheetFrame>
        )}
      </AnimatePresence>
      <Lightbox src={sheet?.kind === 'lightbox' ? sheet.src : null} onClose={close} />
    </>
  );
}
