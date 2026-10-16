/** Keep the active workspace title after Next finishes applying route metadata.
 * The observer belongs to the mounted protected shell and is removed on navigation
 * to a public/auth page. Only title changes can cause a write; no polling is used.
 */
export function retainWorkspaceDocumentTitle(title: string): () => void {
  const update = () => { if (document.title !== title) document.title = title; };
  update();
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target === document.head ||
      (record.target instanceof Element ? record.target : record.target.parentElement)?.closest('title'))) update();
  });
  observer.observe(document.head, { childList: true, characterData: true, subtree: true });
  return () => observer.disconnect();
}
