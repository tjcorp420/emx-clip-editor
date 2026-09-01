/**
 * Normalize one import payload without assuming that every desktop item is a
 * browser File. Electron deliberately sends native descriptors so source
 * paths stay in the trusted main process instead of exposing file:// URLs.
 */
export function normalizeImportInput(item, isBrowserFile) {
  const wrapper = item && typeof item === 'object' ? item : {};
  const file = isBrowserFile?.(wrapper.file)
    ? wrapper.file
    : (isBrowserFile?.(item) ? item : null);
  const url = typeof wrapper.url === 'string' && wrapper.url ? wrapper.url : '';

  return {
    file,
    url,
    mime: String(wrapper.mime || file?.type || ''),
    name: String(wrapper.name || file?.name || 'Imported media'),
    nativePath: String(wrapper.nativePath || ''),
    mediaToken: String(wrapper.mediaToken || ''),
    isDesktopDescriptor: Boolean(url && !file)
  };
}
