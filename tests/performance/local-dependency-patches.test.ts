import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
const require=createRequire(import.meta.url);
const braces=require('braces');
const {sprintf,vsprintf}=require('sprintf-js');
// F06's immutable public error contract replaces the earlier PERF message text.
const nestingError = {name:'RangeError',code:'ERR_BRACES_NESTING'};

for(const method of ['parse','compile','expand','stringify'] as const) {
  it(`bounds nested brace input through ${method}`,()=>{
    expect(()=>braces[method]('{'.repeat(4000)+'x'+ '}'.repeat(4000)))
      .toThrowError(expect.objectContaining(nestingError));
  });
  it(`bounds nested parentheses through ${method}`,()=>{
    expect(()=>braces[method]('('.repeat(4000)+'x'+ ')'.repeat(4000)))
      .toThrowError(expect.objectContaining(nestingError));
  });
}
it('bounds deeply unclosed input before parse repair',()=>{
  expect(()=>braces.parse('{'.repeat(6000)+'x')).toThrowError(expect.objectContaining(nestingError));
});
for(const method of ['compile','expand','stringify']) {
  it(`guards supplied deep ASTs through public and internal ${method}`,()=>{
    const root={type:'root',nodes:[] as unknown[]}; let current=root;
    for(let i=0;i<6000;i++){const child={type:'paren',nodes:[] as unknown[]};current.nodes.push(child);current=child;}
    expect(()=>braces[method](root)).toThrowError(expect.objectContaining(nestingError));
    expect(()=>require('braces/lib/'+method)(root)).toThrowError(expect.objectContaining(nestingError));
  });
  it(`guards child and parent cycles through ${method}`,()=>{
    const root={type:'root',nodes:[] as unknown[]}; root.nodes.push(root);
    expect(()=>braces[method](root)).toThrowError(expect.objectContaining(nestingError));
    const parentCycle:{type:string,nodes:unknown[],parent?:unknown}={type:'root',nodes:[]};
    parentCycle.parent=parentCycle;
    expect(()=>braces[method](parentCycle)).toThrowError(expect.objectContaining(nestingError));
  });
}
it('keeps escaped, quoted and bracketed delimiters literal',()=>{
  expect(()=>braces.parse('\\{'.repeat(500))).not.toThrow();
  expect(()=>braces.parse('"'+'{'.repeat(500)+'"')).not.toThrow();
  expect(()=>braces.parse('['+'{'.repeat(500)+']')).not.toThrow();
});
it('does not allow options to disable the depth guard',()=>{
  expect(()=>braces.parse('{'.repeat(1000),{maxDepth:Infinity})).toThrowError(expect.objectContaining(nestingError));
});
it('preserves practical nested and range-limited patterns',()=>{
  expect(()=>braces.compile('{'.repeat(20)+'a,b'+'}'.repeat(20))).not.toThrow();
  expect(()=>braces.expand('{1..10000}')).toThrow(/range limit/);
});
it('checks numeric precision boundaries and direct format entrypoint',()=>{
  expect(sprintf('%.0f',1.25)).toBe('1');
  expect(sprintf('%.0g',1.25)).toBe('1');
  expect(sprintf.format(sprintf.parse('%.100000f'),['%.100000f',1.25])).toBe(sprintf('%.100f',1.25));
});
for(const format of ['e','f','g']) {
  it(`clamps excessive ${format} precision instead of throwing native RangeError`,()=>{
    expect(sprintf('%.1000000000'+format,1.25)).toBe(sprintf('%.100'+format,1.25));
    expect(vsprintf('%.999999999999999999999999'+format,[1.25])).toBe(sprintf('%.100'+format,1.25));
  });
}
it('keeps ordinary formatting behavior',()=>{
  expect(sprintf('%s %04d %.2f','ALGT',7,1.25)).toBe('ALGT 0007 1.25');
  expect(sprintf('%(name)s',{name:'ALGT'})).toBe('ALGT');
  expect(vsprintf('%s %d',['ALGT',7])).toBe('ALGT 7');
});
it('keeps ordinary compile, range, escaping and expansion behavior',()=>{
  expect(braces.expand('x/{a,b}/{1..2}')).toEqual(['x/a/1','x/a/2','x/b/1','x/b/2']);
  expect(braces.compile('x/{a,b}')).toBe('x/(a|b)');
  expect(braces.stringify(braces.parse('x/{a,b}'))).toBe('x/{a,b}');
  expect(braces.expand('x/\\{a,b\\}')).toEqual(['x/{a,b}']);
});

for (const method of ['compile','expand','stringify'] as const) {
  it(`preserves the PERF wide-AST budget through public and internal ${method}`,()=>{
    const ast={type:'root',nodes:Array.from({length:131073},()=>({type:'text',value:'a'}))};
    for (const action of [()=>braces[method](ast),()=>require('braces/lib/'+method)(ast)]) {
      expect(action).toThrowError(expect.objectContaining({name:'RangeError',code:'ERR_BRACES_NODE_LIMIT'}));
    }
  });
}
it('bounds wide arrays and AST queues without a caller override',()=>{
  const guard=require('braces/lib/depth-guard');
  const wide=Array.from({length:131073},()=> 'a');
  expect(()=>guard.assertArrays(wide)).toThrowError(expect.objectContaining({name:'RangeError',code:'ERR_BRACES_NODE_LIMIT'}));
  expect(()=>braces.compile({type:'root',nodes:[],queue:wide},{maxNodes:Infinity})).toThrowError(expect.objectContaining({name:'RangeError',code:'ERR_BRACES_NODE_LIMIT'}));
  expect(()=>guard.assertAst({type:'root',nodes:Array.from({length:100},()=>({type:'text',value:'a'}))})).not.toThrow();
});
