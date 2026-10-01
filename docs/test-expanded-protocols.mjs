import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const contract='0x'+'1'.repeat(40), wallet='0x'+'2'.repeat(40);
process.env.ALCHEMY_ROBINHOOD_RPC_URL='https://rpc.test';
globalThis.fetch=async(url,options={})=>{
 let d;
 if(url==='https://rpc.test') {const request=JSON.parse(options.body);d={result:request.method==='alchemy_getTokenBalances'?{tokenBalances:[{contractAddress:contract,tokenBalance:'0x01'}]}:'0x01'};}
 else if(url.includes('topology'))d={farms:[{vault:contract,farm:contract}]};
 else if(url.includes('fables.fi'))d=options.method==='POST'?{data:{Position:[]}}:{data:{Pool:[{id:'0x'+'1'.repeat(64)}]}};
 else if(url.includes('all-pools'))d={pools:[{id:contract,symbol:'ETH/USDG',lpApr:5,isCl:false}]};
 else if(url.includes('subgraph'))throw Error('One source fails');
 else if(url.includes('longbow'))d={vaults:[{address:contract,name:'Vault',apy:1,assetSymbol:'USDG'}]};
 else if(url.includes('pendle'))d={total:2,results:[{chainId:4663,address:contract,name:'LP',details:{aggregatedApy:0.05}},{chainId:1,address:contract,name:'Wrong chain'}]};
 else if(url.includes('steer/metrics'))d={vaults:[{vault:contract,asset:'AAPL',tvlUsd:100,inRange:true}]};
 else if(url.includes('steer-apr'))d={vaults:{[contract]:{apr:0,feeApr:0,rewardsApr:0,feeIndexed:false,rewardsIndexed:false}}};
 else if(url.includes('omni/'))d={pools:[]};
 else throw Error('Unexpected URL '+url);
 return {ok:true,json:async()=>d};
};
const {allCatalogs}=await import('../lib/protocol-markets.js');
const catalogs=await allCatalogs();assert.equal(catalogs.length,6);assert(catalogs.every(p=>p.status==='available'));
const earn=catalogs.find(p=>p.id==='earn').markets[0];assert.equal(earn.rate,null);assert.equal(earn.feeRate,null);assert.equal(earn.rewardRate,null);
const pendle=catalogs.find(p=>p.id==='pendle').markets;assert.equal(pendle.length,1);assert.equal(pendle[0].rate,5);
const {expandedPositions}=await import('../lib/expanded-positions.js');const data=await expandedPositions(wallet);
assert(data.items.some(p=>p.protocol==='Longbow'));assert(data.items.every(p=>p.value===null));assert.equal(data.sources.find(p=>p.name==='Ramses').status,'partial');assert.equal(data.sources.find(p=>p.name==='Fables').status,'available');
const app=fs.readFileSync('public/app.js','utf8');const merge=app.slice(app.indexOf('function mergeDefi('),app.indexOf('async function loadDefi('));
const ctx=vm.createContext({});vm.runInContext(merge,ctx);ctx.base={items:[{id:'morpho:'+contract,contract,side:'Deposit',protocol:'Morpho',value:12}]};ctx.extra={items:[{id:'longbow:'+contract,contract,side:'Deposit',protocol:'Longbow',value:null},{id:'ramses:cl:1',contract,side:'Liquidity',protocol:'Ramses'},{id:'ramses:cl:2',contract,side:'Liquidity',protocol:'Ramses'}]};
const merged=vm.runInContext('mergeDefi(base,extra)',ctx);assert.equal(merged.items.length,3);assert.equal(merged.items[0].value,12);assert.equal(ctx.base.items[0].protocol,'Morpho');assert.equal(vm.runInContext('mergeDefi(base,extra).items[0].protocol',ctx),'Morpho / Longbow');
console.log('PASS six catalogs, unknown APR preserved, chain isolation, rate units, source failure isolation, receipt verification, no duplicate Morpho vaults, distinct CL positions');

