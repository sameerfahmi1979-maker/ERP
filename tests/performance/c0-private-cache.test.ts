import {afterEach, expect, it, vi} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {clearPrivateCaches, registerPrivateCache} from '@/lib/query/private-cache';

const disposals:(()=>void)[]=[];
afterEach(()=>{disposals.splice(0).forEach(dispose=>dispose());vi.restoreAllMocks();});
it.each(['clear','unmount'])('retires admission synchronously before cancellation and clearing on %s',mode=>{
 const client=new QueryClient(),order:string[]=[];
 vi.spyOn(client,'cancelQueries').mockImplementation(()=>{order.push('cancel');return Promise.resolve();});
 vi.spyOn(client,'clear').mockImplementation(()=>{order.push('clear');});
 const dispose=registerPrivateCache(client,()=>order.push('retire'));disposals.push(dispose);
 if(mode==='clear')clearPrivateCaches();else dispose();
 expect(order).toEqual(['retire','cancel','clear']);
});
it('retains registration compatibility without an owner callback',()=>{
 const client=new QueryClient();client.setQueryData(['legacy'],1);
 const dispose=registerPrivateCache(client);disposals.push(dispose);clearPrivateCaches();
 expect(client.getQueryCache().getAll()).toHaveLength(0);
});
