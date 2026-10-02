import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/app.js','utf8');
const start=source.indexOf("let opportunityFilter=");
const end=source.indexOf("function defiPanel(",start);
assert(start>0&&end>start);
const ctx=vm.createContext({});
vm.runInContext(`
let protocolData={protocols:[]},protocolLoading=false;
const esc=v=>String(v??''),money=v=>'$'+Number(v).toFixed(2);
const defiProtocol=item=>({name:item.protocol,url:'https://example.com',logo:''});
`,ctx);
vm.runInContext(source.slice(start,end),ctx);

const rows=JSON.parse(vm.runInContext(`
protocolData={protocols:[{name:'Ramses',url:'https://ramses.xyz',status:'available',markets:[
 {name:'WETH/USDG',type:'liquidity',rate:24,rateType:'APR',tvlUsd:500000},
 {name:'NEWCOIN/WETH',type:'concentrated-liquidity',rate:80,rateType:'APR',tvlUsd:9000},
 {name:'IMPOSSIBLE/WETH',type:'liquidity',rate:1000.01,rateType:'APR',tvlUsd:1000000},
 {name:'CLOSED/WETH',type:'liquidity',rate:20,rateType:'APR',tvlUsd:100000,closed:true}
]}]};JSON.stringify(opportunityMarkets())
`,ctx));
assert.equal(rows.length,2,'closed and >1000% markets must be excluded');
assert(rows.some(row=>row.name==='WETH/USDG'&&!row.unknownToken&&!row.lowLiquidity));
assert(rows.some(row=>row.name==='NEWCOIN/WETH'&&row.unknownToken&&row.lowLiquidity));
const html=vm.runInContext('opportunitiesPage()',ctx);
assert(html.includes('New or unverified token'));
assert(html.includes('Low liquidity'));
assert(html.includes('APR/APY ceiling · 1000%'));
assert(html.includes('Liquidity pools'));
console.log('PASS opportunity aggregation, 1000% ceiling, pool inclusion, unknown-token and low-liquidity warnings');
