import test from 'node:test';
import assert from 'node:assert/strict';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { extractionSchema } from '../src/prompts.js';
import { regexRuleSchema } from '../src/config-contracts.js';
import { requestDiff } from '../src/compiler.js';
import { stable } from '../src/config.js';

test('compiler unit: observable diff includes model, tools and role changes without normalizing prose',()=>{
  const input={model:'one',messages:[{role:'user',text:'她说：\n\n  好。'}],tools:[{name:'result',parameters:{type:'object'}}]};
  assert.equal(stable(input),stable({tools:input.tools,messages:input.messages,model:input.model}));
  assert.equal(requestDiff(input,{...input,model:'two'}).firstChangedPath,'$.model');
  assert.equal(requestDiff(input,{...input,tools:[]}).firstChangedPath,'$.tools.0');
  assert.equal(requestDiff(input,{...input,messages:[{role:'system',text:input.messages[0].text}]}).firstChangedPath,'$.messages.0.role');
  assert.equal(requestDiff(input,{...input,messages:[{role:'user',text:'她说：好。'}]}).identical,false);
});

test('compiler unit: extraction wire schema excludes ideas and native regex rejects unmapped scope/depth',()=>{
  const schema:any=zodToJsonSchema(extractionSchema,{$refStrategy:'none'});
  assert.deepEqual(schema.properties.objects.items.properties.kind.enum,['character','world','fact','event']);
  assert.equal(extractionSchema.safeParse({objects:[{kind:'idea',title:'明天再说'}]}).success,false);
  const rule={id:'r',name:'界限',pattern:'文',replacement:'字',stage:'after',scope:'goal'};
  assert.equal(regexRuleSchema.safeParse(rule).success,false);
  assert.equal(regexRuleSchema.safeParse({...rule,scope:'prose',minDepth:1}).success,false);
  assert.equal(regexRuleSchema.safeParse({...rule,scope:'prose',stage:'before'}).success,false);
  assert.equal(regexRuleSchema.safeParse({...rule,supported:false}).success,true);
});
