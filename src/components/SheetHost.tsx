import { AnimatePresence } from 'framer-motion';
import { useUI } from '../lib/ui';
import { Lightbox, SheetFrame } from './Sheet';
import { MemoEditorBody } from './MemoEditor';
import { NewFolderBody, RenameFolderBody } from './NewFolderSheet';
import { GroupBody, NewGroupBody } from './GroupSheet';
import { SpacesBody } from './SpacesSheet';
import { AiSettingsBody } from './AiSheet';
import { ChatsBody } from './ChatsSheet';
import { DeviceNameBody, PasswordBody } from './AccountSecurity';
import { DevicesBody } from './DevicesSheet';

export function SheetHost() {
  const sheet = useUI((s) => s.sheet);
  const close = useUI((s) => s.close);
  const lightbox = useUI((s) => s.lightbox);
  const closeLightbox = useUI((s) => s.closeLightbox);

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
        {sheet && (
          <SheetFrame key={key} onClose={close}>
            {sheet.kind === 'editor' && <MemoEditorBody memoId={sheet.memoId} onClose={close} />}
            {sheet.kind === 'new-folder' && <NewFolderBody onClose={close} />}
            {sheet.kind === 'rename-folder' && (
              <RenameFolderBody folderId={sheet.folderId} onClose={close} />
            )}
            {sheet.kind === 'new-group' && <NewGroupBody onClose={close} />}
            {sheet.kind === 'group' && <GroupBody groupId={sheet.groupId} onClose={close} />}
            {sheet.kind === 'spaces' && <SpacesBody onClose={close} />}
            {sheet.kind === 'ai' && <AiSettingsBody onClose={close} />}
            {sheet.kind === 'chats' && <ChatsBody onClose={close} />}
            {sheet.kind === 'password' && <PasswordBody onClose={close} />}
            {sheet.kind === 'device' && <DeviceNameBody onClose={close} />}
            {sheet.kind === 'devices' && <DevicesBody onClose={close} />}
          </SheetFrame>
        )}
      </AnimatePresence>
      <Lightbox src={lightbox} onClose={closeLightbox} />
    </>
  );
}
