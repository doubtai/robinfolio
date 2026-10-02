import {addr,positive,json,balance,walletTokens,settledMap} from './protocol-utils.js';
import {allCatalogs} from './protocol-markets.js';
function position(protocol,contract,name,extra={}){return {id:protocol+':'+contract,contract:addr(contract),protocol,name,side:'Deposit',value:null,at:null,...extra};}
async function receipts(protocol,markets,wallet,discovery){
 const candidates=new Map();for(const m of markets){if(protocol==='Ramses'&&!m.walletReceipt)continue;
 if(m.contract)candidates.set(m.contract,{market:m,name:m.name,kind:protocol==='Pendle'?'lp':null});
 if(protocol==='Pendle')for(const kind of ['pt','yt','sy'])if(m[kind])candidates.set(m[kind],{market:m,name:m.name+' '+kind.toUpperCase(),kind});}
 if(['Pendle','Longbow','Arcadia'].includes(protocol)){
 const {pendlePrices,receiptValue}=await import('./receipt-valuation.js');
 const entries=[...candidates].slice(0,200),prices=protocol==='Pendle'?await pendlePrices(entries.map(([c])=>c)):new Map();
 const rows=await settledMap(entries,async([contract,v])=>{const data=await receiptValue({protocol,contract,wallet,market:v.market,price:prices.get(contract)});return data?position(protocol,contract,v.name,{...data,side:v.kind==='lp'?'Liquidity':v.kind==='pt'?'Principal token':v.kind==='yt'?'Yield token':'Deposit'}):null;});
 const items=rows.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
 return {items,partial:candidates.size>200||rows.some(r=>r.status==='rejected')||items.some(p=>p.valuationPartial)};
 }
 const found=[...candidates].filter(([contract])=>discovery.items.has(contract));
 const results=await settledMap(found,async([contract,v])=>{const shares=await balance(contract,wallet);return positive(shares)?position(protocol,contract,v.name,{balanceRaw:shares,side:v.market.type.includes('liquidity')?'Liquidity':'Deposit'}):null;});
 return {items:results.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value),partial:discovery.partial||results.some(r=>r.status==='rejected')};
}
import {fablesPositions as fables,ramsesPositions as ramsesCl} from './range-positions.js';
export async function expandedPositions(wallet){
 const [catalogs,discovered,ladders]=await Promise.all([allCatalogs(),walletTokens(wallet).then(data=>({data})).catch(()=>({data:null})),import('./delta-positions.js').then(m=>m.deltaLadderPositions(wallet)).catch(()=>({items:[],partial:true}))]);
 const results=await Promise.all(catalogs.map(async p=>{try{
 if(p.id==='delta'){
 const data={items:[...ladders.items],partial:ladders.partial,block:ladders.block,scope:'Managed V3/V4 ladders verified on-chain; estimated USD covers liquidity principal, excluding fees and deferred credits. Vault shares and farm stakes also discovered, without USD valuation'};
 if(p.status==='available'){
 if(discovered.data){const shares=await receipts(p.name,p.markets,wallet,discovered.data);data.items.push(...shares.items);data.partial ||=shares.partial;}else data.partial=true;
 const farms=await settledMap(p.markets,async m=>{const shares=await balance(m.farm,wallet,'0x27e235e3');return positive(shares)?position('Delta',m.contract,m.name+' farm',{id:'delta:farm:'+m.farm,balanceRaw:shares,side:'Staked liquidity'}):null;});
 data.items.push(...farms.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value));data.partial ||=farms.some(r=>r.status==='rejected');
 }else data.partial=true;
 return {name:p.name,status:data.partial?'partial':'available',...data};
 }
 if(p.status!=='available')throw Error();let data;
 if(p.id==='fables')data=await fables(wallet);
 else{if(!discovered.data&&!['ramses','pendle','longbow','arcadia'].includes(p.id))throw Error();data=discovered.data||['pendle','longbow','arcadia'].includes(p.id)?await receipts(p.name,p.markets,wallet,discovered.data):{items:[],partial:true};data.scope='Wallet-held receipt tokens verified on-chain; externally staked holdings and USD valuation excluded';
 if(p.id==='pendle')data.scope='Wallet PT, YT, SY and LP balances verified on-chain with distinct Pendle USD prices; unclaimed interest and rewards excluded';
 if(['longbow','arcadia'].includes(p.id))data.scope='Vault shares converted to underlying assets on-chain and priced in USD; withdrawal availability and unclaimed rewards excluded';
 if(p.id==='ramses'){try{const cl=await ramsesCl(wallet,p.markets);data.items.push(...cl.items);data.partial ||=cl.partial;}catch{data.partial=true;}data.scope='Indexed concentrated liquidity priced at current pool state; unclaimed fees, rewards and bin liquidity excluded';}
 }
 if(p.catalogPartial){data.partial=true;data.scope+='; known EARN contracts only, live registry unavailable';}
 return {name:p.name,status:data.partial?'partial':'available',...data};
 }catch{return {name:p.name,status:'unavailable',items:[],partial:true,scope:'Position source unavailable; this does not mean zero balance'};}}));
 return {items:results.flatMap(r=>r.items),sources:results.map(({items,...s})=>s),partial:results.some(r=>r.partial)};
}
