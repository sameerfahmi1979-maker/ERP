// @vitest-environment jsdom
import {afterEach, expect, it} from 'vitest';
import {retainWorkspaceDocumentTitle} from '@/lib/workspace/workspace-document-title';
let release:(()=>void)|undefined;
afterEach(()=>{release?.();release=undefined;document.querySelectorAll('title').forEach(node=>node.remove());});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
it('restores the active title after delayed route metadata replaces the title node',async()=>{
 release=retainWorkspaceDocumentTitle('New Document | ALGT ERP');
 const title=document.createElement('title');title.textContent='ALGT ERP';
 document.querySelector('title')!.replaceWith(title);
 await settle();expect(document.title).toBe('New Document | ALGT ERP');
});
it('updates the owner on a workspace switch and releases ownership on logout',async()=>{
 release=retainWorkspaceDocumentTitle('Employees | ALGT ERP');release();
 release=retainWorkspaceDocumentTitle('Documents | ALGT ERP');
 document.title='ALGT ERP';await settle();expect(document.title).toBe('Documents | ALGT ERP');
 release();release=undefined;document.title='Sign in';await settle();expect(document.title).toBe('Sign in');
});
it('ignores unrelated head content and does not rewrite an already correct title',async()=>{
 release=retainWorkspaceDocumentTitle('Employees | ALGT ERP');
 const text=document.querySelector('title')!.firstChild;
 const style=document.createElement('style');document.head.append(style);style.textContent='body { color: inherit; }';
 await settle();expect(document.querySelector('title')!.firstChild).toBe(text);style.remove();
});
it('retains the browser title when streamed metadata adds another title element',async()=>{
 release=retainWorkspaceDocumentTitle('Employees | ALGT ERP');
 const streamed=document.createElement('title');streamed.textContent='ALGT ERP';document.head.prepend(streamed);
 await settle();expect(document.title).toBe('Employees | ALGT ERP');
});
