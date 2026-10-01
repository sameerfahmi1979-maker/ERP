'use client';
import { StrictMode, useState } from 'react';
import Link from 'next/link';
import { Button, Input, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem } from '@fluentui/react-components';
import { useTheme } from 'next-themes';
import { AlgtFluentProvider } from './fluent-provider';
import { AlgtDialog } from './algt-dialog';

function Controls() {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  return <>
    <h1>ALGT focus lifecycle regression</h1>
    <p data-testid="revision">Original fixture</p>
    <Button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>Toggle theme</Button>
    <AlgtDialog open={open} onOpenChange={setOpen} title="Focus test" trigger={<Button>Open test dialog</Button>}
      actions={<Button onClick={() => setOpen(false)}>Apply</Button>}>
      <Input aria-label="Synthetic draft" />
      <Button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>Toggle dialog theme</Button>
      <Button>Second dialog control</Button>
    </AlgtDialog>
    <Menu><MenuTrigger disableButtonEnhancement><Button>Open test menu</Button></MenuTrigger>
      <MenuPopover><MenuList><MenuItem>First choice</MenuItem><MenuItem>Second choice</MenuItem></MenuList></MenuPopover>
    </Menu>
    <Link href="/other">Go to second route</Link>
  </>;
}

export function FocusFixture() {
  const [generation, setGeneration] = useState(0);
  const [mounted, setMounted] = useState(true);
  return <StrictMode>
    <button onClick={() => setMounted(value => !value)}>Toggle provider mount</button>
    <button onClick={() => setGeneration(value => value + 1)}>Remount provider</button>
    {mounted && <AlgtFluentProvider key={generation}><Controls /></AlgtFluentProvider>}
  </StrictMode>;
}
