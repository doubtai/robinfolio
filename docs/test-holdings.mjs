import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync('public/app.js','utf8');
const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40);
const node={addEventListener(){},classList:{toggle(){}},innerHTML:''};
const ctx=vm.createContext({document:{querySelector:()=>node,querySelectorAll:()=>[]},window:{addEventListener(){}},location:{hash:'#assets'},URLSearchParams,AbortSignal,console});
vm.runInContext(src,ctx);vm.runInContext(`account='${a}';liveData={nativeBalanceRaw:'1'};`,ctx);
let calls=0;ctx.fetch=async()=>({ok:true,json:async()=>{calls++;return {items:calls===1?[]:[{contract:b,symbol:'ABC',name:'Example',balance:'1',verifiedOrigin:'pons launch'}],nextPageKey:calls===1?'p2':null}}});
await vm.runInContext("loadHoldings('tokens')",ctx);assert.equal(calls,2);assert.equal(vm.runInContext('holdings.tokens.items.length',ctx),1);assert(node.innerHTML.includes('0.000000000000000001'));assert(node.innerHTML.indexOf('ETH')<node.innerHTML.indexOf('ABC'));
vm.runInContext("holdings.tokens=null",ctx);calls=0;ctx.fetch=async()=>{calls++;if(calls===2)throw Error('429');return {ok:true,json:async()=>({items:[{contract:b,symbol:'ABC',name:'Example',balance:'1'}],nextPageKey:'p2'})}};
await vm.runInContext("loadHoldings('tokens')",ctx);assert.equal(vm.runInContext('holdings.tokens.items.length',ctx),1);assert(node.innerHTML.includes('Scan incomplete'));
ctx.fetch=async()=>({ok:true,json:async()=>({items:[],nextPageKey:null})});await vm.runInContext("loadHoldings('tokens',true)",ctx);assert.equal(vm.runInContext('holdings.tokens.items.length',ctx),1);
vm.runInContext('holdings.tokens=null',ctx);calls=0;ctx.fetch=async()=>({ok:true,json:async()=>{calls++;return {items:[],nextPageKey:'loop'}}});await vm.runInContext("loadHoldings('tokens')",ctx);assert.equal(calls,2);assert(node.innerHTML.includes('Scan incomplete'));
console.log('PASS automatic pagination, native precision, verified sorting, preserved balances, resume, repeated cursor protection');
const backend=fs.readFileSync('api/holdings.js','utf8').replace('export default async function handler','async function handler');
const backendCtx=vm.createContext({URL,URLSearchParams,AbortSignal,process:{env:{ALCHEMY_ROBINHOOD_RPC_URL:'https://robinhood-mainnet.g.alchemy.com/v2/test'}},fetch:async(url,options)=>{if(String(url).includes('rhj/assets'))return {ok:true,json:async()=>({assets:[{deployments:[{chainId:4663,contractAddress:b}]}]})};const q=JSON.parse(options.body);const result=q.method==='alchemy_getTokenBalances'?{tokenBalances:[{contractAddress:b,tokenBalance:'0x0f4240'},{contractAddress:a,tokenBalance:'0x00'}]}:q.method==='alchemy_getTokenMetadata'?{symbol:'TEST',name:'Stock',decimals:6}:'0x';return {ok:true,json:async()=>({result})}}});vm.runInContext(backend,backendCtx);let body;backendCtx.res={status(code){this.code=code;return this},json(data){body=data;return this},setHeader(){}};await vm.runInContext(`handler({method:'GET',query:{address:'${a}'}},res)`,backendCtx);assert.equal(body.items.length,1);assert.equal(body.items[0].balance,'1');assert.equal(body.items[0].verifiedOrigin,'Robinhood Stock Token');console.log('PASS official contract match, unit precision, zero filtering');

