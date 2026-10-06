/** Escape literal SQL wildcards, then quote values used inside PostgREST OR syntax. */
export function literalLike(value:string):string {
  return `%${value.replace(/\\/g,"\\\\").replace(/%/g,"\\%").replace(/_/g,"\\_")}%`;
}
export function literalContains(value:string):string {
  return `"${literalLike(value).replace(/\\/g,"\\\\").replace(/"/g,'\\"')}"`;
}
