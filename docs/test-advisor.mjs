import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/app.js','utf8');
const start=source.indexOf('let advisorOpen=');
const end=source.indexOf('function liveOverview()',start);
assert(start>0&&end>start,'advisor implementation must remain available');

const ctx=vm.createContext({});
vm.runInContext(`
let account='0x${'1'.repeat(40)}',loadingAccount=false,defiLoading=false,holdingsLoading={tokens:false},allocationLoading=false;
let defiData={items:[],partial:false},protocolData={protocols:[]};
const holdings={tokens:{items:[]}};
const walletAssets=()=>holdings.tokens.items;
const walletTokenQuote=item=>item.quote;
const money=value=>'$'+Number(value).toFixed(2);
const esc=value=>String(value??'');
const $=()=>null;
`,ctx);
vm.runInContext(source.slice(start,end),ctx);

const recommendations=script=>JSON.parse(vm.runInContext(`${script};JSON.stringify(advisorRecommendations())`,ctx));
let tips=recommendations(`
 holdings.tokens.items=[
  {symbol:'ETH',balance:1,quote:{value:100}},
  {symbol:'MYSTERY',balance:2,quote:{value:null}}
 ];
 defiData={items:[{side:'Liquidity',inRange:false,value:5}],partial:true};
 protocolData={protocols:[{name:'Morpho',markets:[{name:'USDG',rate:12.5,rateType:'APY',tvlUsd:100000}]}]};
`);
for(const eyebrow of ['LIQUIDITY RANGE','CONCENTRATION'])assert(tips.some(t=>t.eyebrow===eyebrow),eyebrow+' recommendation missing');
assert(!JSON.stringify(tips).toLowerCase().includes('aave'));

tips=recommendations(`
 holdings.tokens.items=[{symbol:'MYSTERY',balance:2,quote:{value:null}}];
 defiData={items:[],partial:false};
 protocolData={protocols:[]};
`);
assert(tips.some(t=>t.eyebrow==='DATA QUALITY'));

tips=recommendations(`
 holdings.tokens.items=[{symbol:'ETH',balance:1,quote:{value:100}}];
 defiData={items:[{side:'Deposit',value:1}],partial:false};
 protocolData={protocols:[{name:'Pendle',markets:[{name:'PT market',rate:9.25,rateType:'APY',tvlUsd:250000}]}]};
`);
assert(tips.some(t=>t.eyebrow==='IDLE CAPITAL'));
assert(tips.some(t=>t.eyebrow==='YIELD WATCH'&&t.metric==='9.25%'));

tips=recommendations(`
 holdings.tokens.items=[{symbol:'ETH',balance:1,quote:{value:100}}];
 defiData={items:[],partial:false};
 protocolData={protocols:[{name:'Ramses',markets:[{name:'Bad outlier',rate:60604.75,rateType:'APR',tvlUsd:250000}]}]};
`);
assert(!tips.some(t=>t.eyebrow==='YIELD WATCH'),'implausible APR outliers must not become advice');

const html=fs.readFileSync('public/app.html','utf8');
assert(html.includes('/robinfolio-advisor.png'));
assert(html.includes('aria-controls="advisor-panel"'));
assert(fs.statSync('public/robinfolio-advisor.png').size>100000);
console.log('PASS advisor asset, accessible control, real-data liquidity, pricing, concentration, idle-capital and yield guidance');
