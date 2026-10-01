// Official deployment: https://developers.uniswap.org/docs/protocols/v4/deployments
export const POSITION_MANAGER='0x58daec3116aae6d93017baaea7749052e8a04fa7';
const ZERO='0x'+'0'.repeat(40),HEX=/^0x[0-9a-f]+$/i;
async function rpc(method,params){
 const r=await fetch(process.env.ALCHEMY_ROBINHOOD_RPC_URL||'https://rpc.mainnet.chain.robinhood.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('RPC unavailable');const d=await r.json();if(d.error){const e=Error('Contract read failed');e.reverted=d.error.code===3||/execution reverted/i.test(d.error.message||'');throw e;}if(d.result===undefined)throw Error('Invalid RPC response');return d.result;
}
async function call(to,data,block){const value=await rpc('eth_call',[{to,data},block]);if(!HEX.test(value))throw Error('Invalid contract response');return value;}
async function discoverEtherscan(address){
 if(!process.env.ETHERSCAN_API_KEY)throw Error('NFT discovery unavailable');
 const ids=new Set();let complete=false;
 for(let page=1;page<=5;page++){
 const query=new URLSearchParams({chainid:'4663',module:'account',action:'tokennfttx',address,contractaddress:POSITION_MANAGER,page:String(page),offset:'100',sort:'desc',apikey:process.env.ETHERSCAN_API_KEY});
 let d;
 for(let attempt=0;attempt<4;attempt++){
 const r=await fetch('https://api.etherscan.io/v2/api?'+query,{signal:AbortSignal.timeout(10000)});d=await r.json();
 if((r.status===429||/rate limit|too many requests/i.test(String(d.result)))&&attempt<3){await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));continue;}
 if(!r.ok)throw Error();break;
 }
 if(d.status==='0'&&Array.isArray(d.result)&&d.result.length===0&&/no (transactions|records) found/i.test(d.message||'')){complete=true;break;}
 if(d.status!=='1'||!Array.isArray(d.result))throw Error('NFT discovery unavailable');
 for(const row of d.result)if(String(row.contractAddress).toLowerCase()===POSITION_MANAGER&&[row.from,row.to].some(a=>String(a).toLowerCase()===address)&&/^\d+$/.test(row.tokenID))ids.add(BigInt(row.tokenID).toString());
 if(d.result.length<100){complete=true;break;}
 if(ids.size>80)break;
 }
 return {ids:[...ids].slice(0,80),complete:complete&&ids.size<=80};
}

async function discover(address,count){
 // Prefer the NFT indexer: explorer rate limits are shared with the activity reader.
 const endpoint=process.env.ALCHEMY_ROBINHOOD_RPC_URL;
 if(endpoint)try{
 const root=new URL(endpoint);if(root.hostname!=='robinhood-mainnet.g.alchemy.com'||!/^\/v2\/[^/]+$/.test(root.pathname))throw Error();
 const ids=new Set();let pageKey='';
 for(let page=0;page<5;page++){
 const url=new URL('/nft/v3/'+root.pathname.split('/')[2]+'/getNFTsForOwner',root.origin);
 url.search=new URLSearchParams({owner:address,'contractAddresses[]':POSITION_MANAGER,withMetadata:'false',pageSize:'100',...(pageKey?{pageKey}:{})}).toString();
 const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.ownedNfts))throw Error();
 for(const nft of d.ownedNfts)if(String(nft.contract?.address).toLowerCase()===POSITION_MANAGER&&/^(0x[0-9a-f]+|[0-9]+)$/i.test(nft.tokenId))ids.add(BigInt(nft.tokenId).toString());
 if(!d.pageKey){if(BigInt(ids.size)!==count)throw Error('Index incomplete');return {ids:[...ids].slice(0,80),complete:ids.size<=80};}
 if(d.pageKey===pageKey)throw Error();pageKey=d.pageKey;
 }
 }catch{/* Fall back to transfer discovery and verify current owners on-chain. */}
 return discoverEtherscan(address);
}

async function symbol(currency,block){
 if(currency===ZERO)return 'ETH';
 try{const value=await call(currency,'0x95d89b41',block);const hex=value.slice(2);let result;
 if(hex.length===64)result=Buffer.from(hex,'hex').toString('utf8').replace(/\0+$/,'');
 else{const offset=Number(BigInt('0x'+hex.slice(0,64)))*2;if(offset+64>hex.length)throw Error();const size=Number(BigInt('0x'+hex.slice(offset,offset+64)));if(size>80||offset+64+size*2>hex.length)throw Error();result=Buffer.from(hex.slice(offset+64,offset+64+size*2),'hex').toString('utf8');}
 return result.slice(0,40)||currency.slice(0,8);
 }catch{return currency.slice(0,6)+'…'+currency.slice(-4);}
}
export async function uniswapV4Positions(address){
 const block=await rpc('eth_blockNumber',[]),count=BigInt(await call(POSITION_MANAGER,'0x70a08231'+address.slice(2).padStart(64,'0'),block));
 if(count===0n)return {items:[],partial:false,scope:'Uniswap V4 wallet-owned positions verified on-chain',block};
 const discovered=await discover(address,count);let partial=!discovered.complete,owned=0n;const items=[],symbols=new Map();
 const name=currency=>{if(!symbols.has(currency))symbols.set(currency,symbol(currency,block));return symbols.get(currency);};
 for(let offset=0;offset<discovered.ids.length;offset+=4){
 const rows=await Promise.allSettled(discovered.ids.slice(offset,offset+4).map(async tokenId=>{
 const encoded=BigInt(tokenId).toString(16).padStart(64,'0');let owner;
 try{owner=await call(POSITION_MANAGER,'0x6352211e'+encoded,block);}catch(e){if(e.reverted)return null;throw e;}
 if(owner.length!==66)throw Error();if('0x'+owner.slice(-40).toLowerCase()!==address)return null;owned++;
 const liquidity=BigInt(await call(POSITION_MANAGER,'0x1efeed33'+encoded,block));if(liquidity===0n)return null;
 const info=await call(POSITION_MANAGER,'0x7ba03aad'+encoded,block);if(info.length!==386)throw Error('Invalid pool info');const words=info.slice(2).match(/.{64}/g),currencies=words.slice(0,2).map(w=>'0x'+w.slice(24));const names=await Promise.all(currencies.map(name));
 let valuation={value:null,valuationPartial:true};try{const {valueV4Position}=await import('./v4-valuation.js');valuation=await valueV4Position({liquidity,poolWords:words,tokenId,block,call});}catch{}
 return {...valuation,id:'uniswap:v4:'+tokenId,contract:POSITION_MANAGER,tokenId,protocol:'Uniswap V4',name:names.join(' / '),side:'Liquidity',liquidityRaw:liquidity.toString(),currencies,block};
 }));
 for(const row of rows){if(row.status==='rejected')partial=true;else if(row.value)items.push(row.value);}
 }
 if(owned!==count)partial=true;
 return {items,partial:partial||items.some(p=>p.valuationPartial),scope:'Uniswap V4 wallet positions and liquidity read at one block; estimated USD includes accrued fees when available. Externally staked positions excluded',block};
}

