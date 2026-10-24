import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {expect,it} from 'vitest';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
it('dependency repair retains the exact approved static CSS and its licence',()=>{
 expect(hash('vendor/shadcn/tailwind.css')).toBe('146941ac3ff65496fdf1cb306e697255328e4dadc7c105d66e36bb031b00f6d6');
 expect(hash('vendor/shadcn/LICENSE.md')).toBe('1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f');
 expect(readFileSync('src/app/globals.css','utf8')).toContain('@import "../../vendor/shadcn/tailwind.css";');
 const pkg=JSON.parse(readFileSync('package.json','utf8'));expect(pkg.dependencies).not.toHaveProperty('shadcn');expect(pkg.dependencies.zod).toBe('4.6.6');
});
