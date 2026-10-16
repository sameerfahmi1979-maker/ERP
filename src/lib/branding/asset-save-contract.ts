import type {WorkspaceSaveReceipt} from '@/lib/workspace/save-contract';
export type BrandingAssetSaveContract={operationId:string;assetId:number|null;revision:string|null;parentRevision:string};
export type BrandingAssetMutationResult={success:boolean;data?:WorkspaceSaveReceipt & {parent_revision:string};error?:string;uncertain?:boolean};
