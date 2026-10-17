import {it,expect} from 'vitest';
import {documentLifecycle} from '@/lib/dms/lifecycle';
const doc={status:'draft',review_status:'not_required',approval_status:null,current_version_id:2,is_archived:false,superseded_by_document_id:null,owner_user_id:3};
it.each([
 [{status:'superseded',is_archived:true},'Replaced','expiry'],
 [{status:'archived',is_archived:true},'Archived','audit'],
 [{approval_status:'pending_approval'},'Awaiting approval','approvals'],
 [{approval_status:'rejected'},'Changes requested','approvals'],
 [{current_version_id:null},'Needs original','versions'],
 [{review_status:'pending_review'},'Review needed','ai'],
 [{status:'active'},'Published','expiry'],
 [{status:'expired'},'Expired','expiry'],
 [{},'Preparation','overview'],
])('current lifecycle %j is described without a write', (change,stage,section)=>{const original={...doc,...change};expect(documentLifecycle(original)).toMatchObject({stage,section});expect(original).toEqual({...doc,...change});});
it('does not invent a replacement link or assigned owner',()=>{expect(documentLifecycle({...doc,status:'superseded'}).blocker).toContain('no link');expect(documentLifecycle({...doc,owner_user_id:null}).owner).toContain('No document owner');});
it('explicitly distinguishes assigned-stage reviewers from the document owner',()=>{expect(documentLifecycle({...doc,approval_status:'pending_approval'}).owner).toBe('Assigned approval-stage reviewers');});
