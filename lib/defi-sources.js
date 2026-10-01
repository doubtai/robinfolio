// Public sources used by the official Morpho and up interfaces on Robinhood mainnet.
const morpho='https://api.morpho.org/graphql';
const up='https://api.goldsky.com/api/public/project_cmhef02640198x7p2cz2w70u8/subgraphs/up-robinhood-gauges-mainnet/0.1.0/gn';
async function graph(url,query,variables){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const d=await r.json();if(d.errors?.length||!d.data)throw Error();return d.data;}
const usd=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const positive=v=>typeof v==='string'&&/^\d+$/.test(v)&&BigInt(v)>0n;
export async function morphoPositions(address){
 const d=await graph(morpho,`query($address:String!){userByAddress(address:$address,chainId:4663){address chain{id} marketPositions{id market{marketId loanAsset{symbol} collateralAsset{symbol}} state{supplyShares borrowShares collateral supplyAssetsUsd borrowAssetsUsd collateralUsd timestamp}} vaultPositions{id vault{address name} state{shares assetsUsd timestamp}} vaultV2Positions{id shares assetsUsd vault{address name}}}}`,{address});
 const user=d.userByAddress;if(!user||user.address.toLowerCase()!==address||user.chain.id!==4663)throw Error();const items=[];let partial=false;
 for(const row of user.marketPositions){if(!row.state){partial=true;continue;}for(const [amount,key,side,symbol] of [['supplyShares','supplyAssetsUsd','Deposit',row.market.loanAsset.symbol],['borrowShares','borrowAssetsUsd','Debt',row.market.loanAsset.symbol],['collateral','collateralUsd','Collateral',row.market.collateralAsset?.symbol||'Collateral']])if(positive(row.state[amount]))items.push({id:'morpho:'+row.id+':'+side,protocol:'Morpho',name:symbol+' market',symbol,side,value:usd(row.state[key]),at:Number(row.state.timestamp)*1000});}
 for(const row of user.vaultPositions){if(!row.state){partial=true;continue;}if(positive(row.state.shares))items.push({id:'morpho:v1:'+row.id,contract:row.vault.address,protocol:'Morpho',name:row.vault.name,side:'Deposit',value:usd(row.state.assetsUsd),at:Number(row.state.timestamp)*1000});}
 for(const row of user.vaultV2Positions)if(positive(row.shares))items.push({id:'morpho:v2:'+row.id,contract:row.vault.address,protocol:'Morpho',name:row.vault.name,side:'Deposit',value:usd(row.assetsUsd),at:null});
 return {items,partial:partial||items.some(i=>i.value===null),scope:'Morpho indexed markets and vaults V1/V2'};
}
export async function upPositions(address){
 const items=[];let cursor='',partial=false;
 for(let page=0;page<5;page++){
 const d=await graph(up,`query($user:Bytes!,$cursor:String!){gaugeStakes(first:100,orderBy:id,orderDirection:asc,where:{user:$user,amount_gt:"0",id_gt:$cursor}){id user amount tokenId timestamp gauge{id pool poolType}} _meta{hasIndexingErrors block{timestamp}}}`,{user:address,cursor});
 if(!Array.isArray(d.gaugeStakes))throw Error();if(d._meta?.hasIndexingErrors)partial=true;
 for(const row of d.gaugeStakes){if(row.user.toLowerCase()!==address||!positive(row.amount)){partial=true;continue;}items.push({id:'up:'+row.id,contract:row.gauge.pool,tokenId:row.tokenId,protocol:'up',name:row.gauge.poolType+' staked liquidity',side:'Deposit',value:null,at:Number(d._meta?.block?.timestamp||row.timestamp)*1000});}
 if(d.gaugeStakes.length<100)break;cursor=d.gaugeStakes.at(-1).id;if(page===4)partial=true;
 }
 return {items,partial,scope:'up indexed gauge stakes only; unstaked liquidity, locks and USD valuation are not covered'};
}

