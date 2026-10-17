// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { BrandingProfileForm } from '@/features/report-center/branding-profile-form';
import type { ReportBrandingProfile } from '@/lib/report-center/types';
const actions=vi.hoisted(()=>({update:vi.fn(),create:vi.fn(),choices:vi.fn(),read:vi.fn()}));
vi.mock('@/server/actions/reports/templates',()=>({updateBrandingProfile:actions.update,createBrandingProfile:actions.create,getBrandingEditorChoices:actions.choices,getBrandingProfile:actions.read}));
vi.mock('@/features/branding/report-branding-assets-section',()=>({ReportBrandingAssetsSection:()=>null}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:()=>null}));
vi.mock('@/components/ui/switch',()=>({Switch:()=>null}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({open,children,onSubmit}:{open:boolean;children:ReactNode;onSubmit:()=>void})=>open?<div>{children}<button onClick={onSubmit}>Save fixture</button></div>:null}));
const profile=(id:number,name:string)=>({id,workspace_revision:1,owner_company_id:1,can_manage:true,profile_name:name,profile_code:'SYNTHETIC',profile_type:'company',theme_primary_color:'#123456',theme_secondary_color:'#123456',theme_header_bg_color:'#123456',theme_header_text_color:'#ffffff',is_active:true} as ReportBrandingProfile);
beforeEach(()=>{actions.choices.mockResolvedValue({success:true,data:{companies:[{id:1,company_code:'A',legal_name_en:'Synthetic company',can_sign:false}],canCreateGlobal:false,canSignGlobal:false}});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe('actual branding form lifecycle',()=>{
 it('keeps a dirty same-record draft when canonical props refresh, then resets when the record changes',()=>{
  const props={open:true,onOpenChange:vi.fn(),onSaved:vi.fn(),canUpload:false,profile:profile(90001,'Initial')};
  const ui=render(<BrandingProfileForm {...props}/>);
  fireEvent.change(ui.getByPlaceholderText('Company Default'),{target:{value:'Unsaved edit'}});
  ui.rerender(<BrandingProfileForm {...props} profile={profile(90001,'Server refresh')}/>);
  expect((ui.getByPlaceholderText('Company Default') as HTMLInputElement).value).toBe('Unsaved edit');
  ui.rerender(<BrandingProfileForm {...props} profile={profile(90002,'Next record')}/>);
  expect((ui.getByPlaceholderText('Company Default') as HTMLInputElement).value).toBe('Next record');
 });
 it('close/reopen discards the closed session, without invoking a save',()=>{
  const props={open:true,onOpenChange:vi.fn(),onSaved:vi.fn(),canUpload:false,profile:null};
  const ui=render(<BrandingProfileForm {...props}/>);
  fireEvent.change(ui.getByPlaceholderText('Company Default'),{target:{value:'Unsaved'}});
  ui.rerender(<BrandingProfileForm {...props} open={false}/>);
  expect(ui.queryByPlaceholderText('Company Default')).toBeNull();
  ui.rerender(<BrandingProfileForm {...props}/>);
  expect((ui.getByPlaceholderText('Company Default') as HTMLInputElement).value).toBe('');
  expect(actions.create).not.toHaveBeenCalled();
 });
 it('failed saves retain user input and do not report success',async()=>{
  actions.update.mockResolvedValue({success:false,error:'Synthetic save failure'});
  const saved=vi.fn(),close=vi.fn();
  const ui=render(<BrandingProfileForm open onOpenChange={close} onSaved={saved} canUpload={false} profile={profile(90001,'Initial')}/>);
  fireEvent.change(ui.getByPlaceholderText('Company Default'),{target:{value:'Retry draft'}});
  await ui.findByText('A — Synthetic company');
  fireEvent.click(ui.getByText('Save fixture'));
  await waitFor(()=>expect(actions.update).toHaveBeenCalledTimes(1));
  expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  expect((ui.getByPlaceholderText('Company Default') as HTMLInputElement).value).toBe('Retry draft');
 });
});
