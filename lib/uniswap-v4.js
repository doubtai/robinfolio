// Official deployment: https://developers.uniswap.org/docs/protocols/v4/deployments
export const POSITION_MANAGER='0x58daec3116aae6d93017baaea7749052e8a04fa7';
const ZERO='0x'+'0'.repeat(40),HEX=/^0x[0-9a-f]+$/i;
async function rpc(method,params){
 const r=await fetch(process.env.ALCHEMY_ROBINHOOD_RPC_URL||'https://rpc.mainnet.chain.robinhood.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('RPC unavailable');const d=await r.json();if(d.error){const e=Error('Contract read failed');e.reverted=d.error.code===3||/execution reverted/i.test(d.error.message||'');throw e;}if(d.result===undefined)throw Error('Invalid RPC response');return d.result;
}
async function call(to,data,block){const value=await rpc('eth_call',[{to,data},block]);if(!HEX.test(value))throw Error('Invalid contract response');return value;}
async function discover(address){
 if(!process.env.ETHERSCAN_API_KEY)throw Error('NFT discovery unavailable');
 const ids=new Set();let complete=false;
 for(let page=1;page<=5;page++){
 const query=new URLSearchParams({chainid:'4663',module:'account',action:'tokennfttx',address,contractaddress:POSITION_MANAGER,page:String(page),offset:'100',sort:'desc',apikey:process.env.ETHERSCAN_API_KEY});
 const r=await fetch('https://api.etherscan.io/v2/api?'+query,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const d=await r.json();
 if(d.status==='0'&&Array.isArray(d.result)&&d.result.length===0&&/no (transactions|records) found/i.test(d.message||'')){complete=true;break;}
 if(d.status!=='1'||!Array.isArray(d.result))throw Error('NFT discovery unavailable');
 for(const row of d.result)if(String(row.contractAddress).toLowerCase()===POSITION_MANAGER&&[row.from,row.to].some(a=>String(a).toLowerCase()===address)&&/^\d+$/.test(row.tokenID))ids.add(BigInt(row.tokenID).toString());
 if(d.result.length<100){complete=true;break;}
 if(ids.size>80)break;
 }
 return {ids:[...ids].slice(0,80),complete:complete&&ids.size<=80};
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
 const discovered=await discover(address);let partial=!discovered.complete,owned=0n;const items=[],symbols=new Map();
 const name=currency=>{if(!symbols.has(currency))symbols.set(currency,symbol(currency,block));return symbols.get(currency);};
 for(let offset=0;offset<discovered.ids.length;offset+=4){
 const rows=await Promise.allSettled(discovered.ids.slice(offset,offset+4).map(async tokenId=>{
 const encoded=BigInt(tokenId).toString(16).padStart(64,'0');let owner;
 try{owner=await call(POSITION_MANAGER,'0x6352211e'+encoded,block);}catch(e){if(e.reverted)return null;throw e;}
 if(owner.length!==66)throw Error();if('0x'+owner.slice(-40).toLowerCase()!==address)return null;owned++;
 const liquidity=BigInt(await call(POSITION_MANAGER,'0x1efeed33'+encoded,block));if(liquidity===0n)return null;
 const info=await call(POSITION_MANAGER,'0x7ba03aad'+encoded,block);if(info.length!==386)throw Error('Invalid pool info');const words=info.slice(2).match(/.{64}/g),currencies=words.slice(0,2).map(w=>'0x'+w.slice(24));const names=await Promise.all(currencies.map(name));
 return {id:'uniswap:v4:'+tokenId,contract:POSITION_MANAGER,tokenId,protocol:'Uniswap V4',name:names.join(' / '),side:'Liquidity',value:null,liquidityRaw:liquidity.toString(),currencies,block,at:null};
 }));
 for(const row of rows){if(row.status==='rejected')partial=true;else if(row.value)items.push(row.value);}
 }
 if(owned!==count)partial=true;
 return {items,partial,scope:'Uniswap V4 wallet-owned positions verified on-chain; USD valuation and externally staked positions are not covered',block};
}

