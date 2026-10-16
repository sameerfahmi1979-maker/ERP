import {z} from 'zod';
export const geographyEntities=['countries','emirates','cities','areas_zones','ports'] as const;
export type GeographyEntity=typeof geographyEntities[number];
export const geographyPaths:Record<GeographyEntity,string>={countries:'countries',emirates:'emirates',cities:'cities',areas_zones:'areas',ports:'ports'};
export const geographySaveReceiptSchema=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
