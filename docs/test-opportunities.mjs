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
 {id:'ramses:0x1111111111111111111111111111111111111111',protocol:'ramses',contract:'0x1111111111111111111111111111111111111111',name:'WETH/USDG',type:'concentrated-liquidity',rate:24,rateType:'APR',tvlUsd:500000,risks:['concentrated-liquidity']},
 {name:'NEWCOIN/WETH',type:'concentrated-liquidity',rate:80,rateType:'APR',tvlUsd:9000},
 {name:'IMPOSSIBLE/WETH',type:'liquidity',rate:1000.01,rateType:'APR',tvlUsd:1000000},
 {name:'CLOSED/WETH',type:'liquidity',rate:20,rateType:'APR',tvlUsd:100000,closed:true}
]},{name:'Pendle',url:'https://app.pendle.finance',status:'available',markets:[
 {id:'pendle:0x2222222222222222222222222222222222222222',protocol:'pendle',contract:'0x2222222222222222222222222222222222222222',name:'USDG PT',type:'yield-liquidity',rate:12,rateType:'APY',tvlUsd:200000}
]}]};JSON.stringify(opportunityMarkets())
`,ctx));
assert.equal(rows.length,3,'closed and >1000% markets must be excluded');
assert(rows.some(row=>row.name==='WETH/USDG'&&!row.unknownToken&&!row.lowLiquidity));
assert(rows.some(row=>row.name==='NEWCOIN/WETH'&&row.unknownToken&&row.lowLiquidity));
assert(rows.find(row=>row.name==='WETH/USDG').score>rows.find(row=>row.name==='NEWCOIN/WETH').score,'risk-adjusted ranking must strongly discount an unknown low-liquidity token');
const html=vm.runInContext('opportunitiesPage()',ctx);
assert(html.includes('New or unverified token'));
assert(html.includes('Low liquidity'));
assert(html.includes('Active range'));
assert(html.includes('APR/APY ceiling · 1000%'));
assert(html.includes('Liquidity pools'));
assert(html.includes('data-opportunity-protocol="Ramses"'));
assert(html.includes('data-opportunity-protocol="Pendle"'));
assert(html.includes('class="opportunity-list"'));
assert.equal(vm.runInContext("opportunityMarketUrl({protocol:'ramses',contract:'0x1111111111111111111111111111111111111111'})",ctx),'https://www.ramses.xyz/deposit/0x1111111111111111111111111111111111111111');
assert.equal(vm.runInContext("opportunityMarketUrl({protocol:'pendle',contract:'0x2222222222222222222222222222222222222222'})",ctx),'https://app.pendle.finance/trade/markets/0x2222222222222222222222222222222222222222?chain=robinhood');
console.log('PASS opportunity aggregation, protocol filters, compact list, direct market links and risk warnings');

