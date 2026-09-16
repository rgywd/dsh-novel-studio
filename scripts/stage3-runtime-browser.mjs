import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const checks=[],errors=[],writes=[],failedReads=[];
try{
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.stack??error.message));
  page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push({method:request.method(),path:new URL(request.url()).pathname});});
  page.on('response',response=>{if(response.status()>=400)failedReads.push({status:response.status(),path:new URL(response.url()).pathname});});
  const root='http://127.0.0.1:4318';
  await page.goto(root+'/novel-studio/');await page.getByRole('heading',{name:'作品书架',exact:true}).waitFor();
  const shelf=await (await page.request.get(root+'/api/novel-studio/shelf')).json();
  if(!shelf.length)throw new Error('DSH shelf unexpectedly empty');
  checks.push({name:'DSH shelf',status:'PASS',visibleProjects:shelf.length});
  await page.getByRole('button',{name:'创作资产',exact:true}).first().click();
  await page.getByText('实际生效的全局规则').waitFor();
  checks.push({name:'global creative assets',status:'PASS'});
  await page.getByRole('button',{name:'原作资料',exact:true}).click();
  await page.getByRole('heading',{name:'原作资料库 · 从已有作品创作'}).waitFor();
  checks.push({name:'global source library',status:'PASS'});
  await page.getByRole('button',{name:'作品书架',exact:true}).click();
  const first=shelf.find(project=>!project.archived);if(!first)throw new Error('No active project to read');
  await page.getByRole('button',{name:`打开${first.title}`}).click();
  await page.getByRole('button',{name:'导演模式',exact:true}).click();
  const expectedTasks=await (await page.request.get(root+`/api/novel-studio/projects/${first.id}/tasks`)).json();
  const taskButtons=page.locator('.director-task-list button');
  if(await taskButtons.count()!==expectedTasks.length)throw new Error('Director task list does not match the project task endpoint');
  if(expectedTasks.length){await taskButtons.first().click();await page.locator('.director-task-list button.active').waitFor();}
  await page.getByRole('button',{name:'写作模式',exact:true}).click();
  if(!page.url().includes(`project=${first.id}`))throw new Error('Selected project lost during mode switch');
  checks.push({name:'shared project and both modes',status:'PASS',taskCount:expectedTasks.length});
  if(errors.length||writes.length||failedReads.length)throw new Error(`Browser errors or unexpected writes: ${JSON.stringify({errors,writes,failedReads})}`);
  const receipt={at:new Date().toISOString(),status:'PASS',browser:'headless Chrome 1280x800, fresh context, read-only',checks,errors,writes};
  writeFileSync('docs/novel-studio/evidence/stage3-runtime-browser.json',JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt,null,2));
  await context.close();
}finally{await browser.close();}
