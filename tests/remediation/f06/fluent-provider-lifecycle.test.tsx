// @vitest-environment jsdom
import '../f05/setup';
import {act,render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {useState} from 'react';
import {AlgtDialog} from '@/components/design-system/algt-dialog';

function Journey(){
 const [open,setOpen]=useState(false);
 return <FluentProvider theme={webLightTheme}>
  <button onClick={()=>setOpen(true)}>Open synthetic settings</button>
  <AlgtDialog open={open} onOpenChange={setOpen} title="Synthetic settings"><input aria-label="Synthetic value"/></AlgtDialog>
 </FluentProvider>;
}

it('real Fluent provider and modal mount/unmount without Keyborg lifecycle errors',async()=>{
 // Observe and forward errors; never hide a dependency lifecycle failure.
 const original=console.error;
 const errors=vi.spyOn(console,'error').mockImplementation((...args)=>original(...args));
 const mounted=render(<Journey/>);
 try{
  fireEvent.click(screen.getByRole('button',{name:'Open synthetic settings'}));
  await screen.findByRole('dialog',{name:'Synthetic settings'});
  fireEvent.click(screen.getByRole('button',{name:'Close Synthetic settings'}));
  mounted.unmount();
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
  expect(errors.mock.calls.filter(args=>args.some(arg=>String(arg).includes('Keyborg')))).toEqual([]);
 }finally{mounted.unmount();errors.mockRestore();}
});
