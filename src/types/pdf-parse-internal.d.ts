declare module "pdf-parse/lib/pdf-parse.js" {
  export default function parse(bytes: Buffer, options?: {
    max?: number;
    pagerender?: (page: unknown) => Promise<string>;
  }): Promise<{ numpages: number; text: string }>;
}
