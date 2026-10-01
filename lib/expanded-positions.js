import {addr,positive,json,balance,walletTokens,settledMap} from './protocol-utils.js';
import {allCatalogs} from './protocol-markets.js';
function position(protocol,contract,name,extra={}){return {id:protocol+':'+contract,contract:addr(contract),protocol,name,side:'Deposit',value:null,at:null,...extra};}
async function receipts(protocol,markets,wallet,discovery){
 const candidates=new Map();for(const m of markets){if(protocol==='Ramses'&&!m.walletReceipt)continue;
 if(m.contract)candidates.set(m.contract,{market:m,name:m.name});
 if(protocol==='Pendle')for(const kind of ['pt','yt','sy'])if(m[kind])candidates.set(m[kind],{market:m,name:m.name+' '+kind.toUpperCase()});}
 const found=[...candidates].filter(([contract])=>discovery.items.has(contract));
 const results=await settledMap(found,async([contract,v])=>{const shares=await balance(contract,wallet);return positive(shares)?position(protocol,contract,v.name,{balanceRaw:shares,side:v.market.type.includes('liquidity')?'Liquidity':'Deposit'}):null;});
 return {items:results.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value),partial:discovery.partial||results.some(r=>r.status==='rejected')};
}
async function fables(wallet){const items=[];let complete=false,block=null;for(let off=0;off<5000;off+=1000){const d=await json('https://www.fables.fi/api/indexer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'owner',address:wallet,off:String(off)})});if(!Array.isArray(d.data?.Position))throw Error();block=d.data.chain_metadata?.[0]?.latest_processed_block||null;for(const p of d.data.Position)if(positive(p.liquidity)&&/^0x[0-9a-f]{64}$/i.test(p.pool_id)&&/^0x[0-9a-f]{64}$/i.test(p.range_id))items.push(position('Fables',null,'Liquidity range '+p.range_id.slice(0,10),{id:'fables:'+p.pool_id+':'+p.range_id,poolId:p.pool_id,balanceRaw:p.liquidity,side:'Liquidity',block}));if(d.data.Position.length<1000){complete=true;break;}}return {items,partial:!complete,scope:'Indexed active range shares; USD valuation and unclaimed fees excluded',block};}
async function ramsesCl(wallet,markets){const items=[];let complete=false;for(let offset=0;offset<500;offset+=100){const query=`query($owner:String!,$offset:Int!){ClPosition(where:{chainId:{_eq:4663},owner:{_eq:$owner}},order_by:{id:asc},limit:100,offset:$offset){id owner chainId pool liquidity}}`;const d=await json('https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables:{owner:wallet,offset}})});if(!Array.isArray(d.data?.ClPosition))throw Error();for(const p of d.data.ClPosition)if(p.chainId===4663&&p.owner.toLowerCase()===wallet&&positive(p.liquidity)){const pool=markets.find(m=>m.contract===addr(p.pool));items.push(position('Ramses',p.pool,pool?.name||'Concentrated liquidity',{id:'ramses:cl:'+p.id,side:'Liquidity',liquidityRaw:p.liquidity}));}if(d.data.ClPosition.length<100){complete=true;break;}}return {items,partial:!complete};}
export async function expandedPositions(wallet){
 const [catalogs,discovered]=await Promise.all([allCatalogs(),walletTokens(wallet).then(data=>({data})).catch(()=>({data:null}))]);
 const results=await Promise.all(catalogs.map(async p=>{try{
 if(p.status!=='available')throw Error();let data;
 if(p.id==='fables')data=await fables(wallet);
 else{if(!discovered.data&&!['delta','ramses'].includes(p.id))throw Error();data=discovered.data?await receipts(p.name,p.markets,wallet,discovered.data):{items:[],partial:true};data.scope='Wallet-held receipt tokens verified on-chain; externally staked holdings and USD valuation excluded';
 if(p.id==='delta'){
 const farms=await settledMap(p.markets,async m=>{const shares=await balance(m.farm,wallet,'0x27e235e3');return positive(shares)?position('Delta',m.contract,m.name+' farm',{id:'delta:farm:'+m.farm,balanceRaw:shares,side:'Staked liquidity'}):null;});
 data.items.push(...farms.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value));data.partial ||=farms.some(r=>r.status==='rejected');data.scope='Wallet vault shares and farm stakes; fees and USD valuation excluded';}
 if(p.id==='ramses'){try{const cl=await ramsesCl(wallet,p.markets);data.items.push(...cl.items);data.partial ||=cl.partial;}catch{data.partial=true;}data.scope='Wallet LP tokens and indexed concentrated positions; staked, bin liquidity and USD valuation not fully covered';}
 }
 if(p.catalogPartial){data.partial=true;data.scope+='; known EARN contracts only, live registry unavailable';}
 return {name:p.name,status:data.partial?'partial':'available',...data};
 }catch{return {name:p.name,status:'unavailable',items:[],partial:true,scope:'Position source unavailable; this does not mean zero balance'};}}));
 return {items:results.flatMap(r=>r.items),sources:results.map(({items,...s})=>s),partial:results.some(r=>r.partial)};
}

