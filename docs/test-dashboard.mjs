import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('public/app.js','utf8');
const node=()=>({addEventListener(){},setAttribute(){},focus(){},classList:{toggle(){}},innerHTML:'',textContent:'',hidden:false});
const element=node(),nodes=new Map([['#main-content',element]]);
const ctx=vm.createContext({document:{querySelector:selector=>nodes.get(selector)||nodes.set(selector,node()).get(selector),querySelectorAll:()=>[]},window:{addEventListener(){}},location:{hash:'#overview'},URLSearchParams,AbortSignal,Intl,console,clearTimeout(){},setTimeout(){return 1;}});
vm.runInContext(source,ctx);
for(const text of ['124,530','AAPLx','Rialto','12.48%','demoAssets'])assert(!source.includes(text));
for(const title of ['Portfolio value','Verified stock tokens','Wallet tokens','DeFi positions','Market insight'])assert(element.innerHTML.includes(title));
assert(!element.innerHTML.includes('<path'));assert(!element.innerHTML.includes('$'));
vm.runInContext("account='0x'+'1'.repeat(40);historyData={points:[{at:1000,value:10},{at:2000,value:20}],partial:false};render()",ctx);assert(element.innerHTML.includes('$20.00'));assert(element.innerHTML.includes('Indexed portfolio'));assert(!element.innerHTML.includes('profit'));
vm.runInContext("account='';render()",ctx);assert(!element.innerHTML.includes('$20.00'));assert(!element.innerHTML.includes('<path'));
console.log('PASS empty dashboard, no demo numbers, real-point chart, disconnect removes wallet history');
const handlerSource=fs.readFileSync('api/history.js','utf8').replace('export default async function handler','async function handler');
let output,status,requestUrl;const now=Math.floor(Date.now()/1000);
const backend=vm.createContext({URLSearchParams,AbortSignal,process:{env:{ONEINCH_API_KEY:'test-secret'}},fetch:async(url,options)=>{requestUrl=url;assert.equal(options.headers.Authorization,'Bearer test-secret');return {ok:true,json:async()=>({result:[{timestamp:now-100,value_usd:5},{timestamp:now-200,value_usd:0},{timestamp:now-100,value_usd:7},{timestamp:now,value_usd:null},{timestamp:now+100,value_usd:99}],meta:{data_issues:{price_outliers:[{}]}}})}}});vm.runInContext(handlerSource,backend);backend.res={status(n){status=n;return this},json(d){output=d;return this},setHeader(){}};
await vm.runInContext("handler({method:'GET',query:{address:'0x'+'1'.repeat(40),period:'1month'}},res)",backend);assert.equal(status,200);assert.equal(output.points.length,2);assert.equal(output.points[0].value,0);assert.equal(output.points[1].value,7);assert(output.partial);assert(requestUrl.includes('chain_id=4663'));assert(!JSON.stringify(output).includes('test-secret'));
backend.process.env.ONEINCH_API_KEY='';await vm.runInContext("handler({method:'GET',query:{address:'0x'+'1'.repeat(40)}},res)",backend);assert.equal(status,503);assert.equal(output.code,'HISTORY_NOT_CONFIGURED');
console.log('PASS history chain filter, sorting, deduplication, invalid values, quality flag, missing credential');

assert(!element.innerHTML.includes('Asset allocation'));
vm.runInContext("view='opportunities';render()",ctx);assert(element.innerHTML.includes('Market opportunities'));assert(element.innerHTML.includes('APR/APY ceiling · 1000%'));assert(!element.innerHTML.includes('Coming next'));assert(!source.toLowerCase().includes('aave'));
console.log('PASS allocation removed, live opportunities route present, Aave absent');

vm.runInContext("view='defi';account='0x'+'1'.repeat(40);defiData={items:[],scope:'Indexed sources.',partial:true,sources:[{name:'Morpho',status:'available',scope:'Markets and vaults indexed.'}],supported:[{id:'morpho',name:'Morpho'}]};protocolData={protocols:[{name:'Arcadia',url:'https://example.com/arcadia',status:'available',markets:[{},{}],catalogPartial:false}]};render()",ctx);
assert(element.innerHTML.includes('<details class="defi-coverage-disclosure">'));
assert(element.innerHTML.includes('Index coverage'));
assert(element.innerHTML.includes('What Robinfolio can read from each protocol'));
assert(element.innerHTML.includes('class="protocol-tile"'));
assert(element.innerHTML.includes('Compare opportunities'));
assert(!element.innerHTML.includes('will be added separately'));
console.log('PASS collapsible DeFi coverage and structured connected-protocol cards');

