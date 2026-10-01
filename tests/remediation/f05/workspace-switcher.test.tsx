// @vitest-environment jsdom
import './setup';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
const model=vi.hoisted(()=>({setActiveTab:vi.fn(),requestCloseTab:vi.fn(),isHydrated:true,activeTab:{id:'two'},tabs:[{id:'home',title:'Home',pinned:true,closable:false},{id:'one',title:'Employee draft',dirty:true,closable:true},{id:'two',title:'Department',childDialogOpen:true,closable:true}]}));
vi.mock('@/hooks/use-workspace',()=>({useWorkspace:()=>model}));
import { OpenWorkspaces } from '@/components/workspace/open-workspaces';
afterEach(()=>{cleanup();vi.clearAllMocks();});
const setup=()=>render(<FluentProvider theme={webLightTheme}><OpenWorkspaces/></FluentProvider>);
it('renders a compact count and searches all instances without persisting input',()=>{setup();fireEvent.click(screen.getByRole('button',{name:'Open workspaces (3)'}));expect(screen.getByText('Unsaved changes')).toBeTruthy();fireEvent.change(screen.getByRole('textbox',{name:'Search open workspaces'}),{target:{value:'Employee'}});expect(screen.queryByRole('button',{name:/Current/})).toBeNull();expect(screen.getByText('Employee draft')).toBeTruthy();});
it('switch delegates to F04; close never activates the row',()=>{setup();fireEvent.click(screen.getByRole('button',{name:'Open workspaces (3)'}));fireEvent.click(screen.getByRole('button',{name:'Close workspace: Employee draft'}));expect(model.requestCloseTab).toHaveBeenCalledWith('one');expect(model.setActiveTab).not.toHaveBeenCalled();});
it('pending task cannot be closed and home has no close control',()=>{setup();fireEvent.click(screen.getByRole('button',{name:'Open workspaces (3)'}));expect((screen.getByRole('button',{name:'Close workspace: Department'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.queryByRole('button',{name:'Close workspace: Home'})).toBeNull();});
it('row activation calls existing navigation handler',async()=>{setup();fireEvent.click(screen.getByRole('button',{name:'Open workspaces (3)'}));fireEvent.click(await screen.findByRole('button',{name:/^Employee draft/}));expect(model.setActiveTab).toHaveBeenCalledWith('one');});
