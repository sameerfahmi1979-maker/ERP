'use client';
import {useLayoutEffect,useMemo} from 'react';
const currentOwners=new WeakSet<object>();
function createOwner(identity:string){
 const owner:{readonly identity:string;readonly active:boolean}={identity,get active(){return currentOwners.has(owner);}};
 return owner;
}
/** Pausing a mounted workspace is not an account/authority retirement.
 * Separate ownership cleanup from the read lifetime so hidden drafts survive. */
export function useHrChildOwnerLifetime(identity:string){
 const owner=useMemo(()=>createOwner(identity),[identity]);
 useLayoutEffect(()=>{currentOwners.add(owner);return()=>{currentOwners.delete(owner);};},[owner]);
 return owner;
}
