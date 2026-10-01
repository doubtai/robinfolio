const CHAIN={id:'0x1237',decimal:4663,name:'Robinhood Chain',rpc:'https://rpc.mainnet.chain.robinhood.com',explorer:'https://robin.etherscan.io',symbol:'ETH'};
const $=selector=>document.querySelector(selector), esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let account='',view=(location.hash||'#overview').slice(1),liveData=null;
const short=value=>value?value.slice(0,6)+'…'+value.slice(-4):'';
function placeholder(){const copy={assets:['Assets','Inspect every token and current balance held by this wallet.'],markets:['Tokenized Markets','Follow tokenized equities, ETFs and other real-world assets on Robinhood Chain.'],defi:['DeFi positions','Track Uniswap liquidity, Morpho lending and the next protocols joining the network.'],swap:['Swap','Compare executable routes across Robinhood Chain liquidity.'],activity:['Activity','Reconcile transfers, swaps, bridge movements and contract interactions.'],nfts:['NFTs','Review ERC-721 and ERC-1155 assets verified against current ownership.'],wallets:['Wallets','Connect or track multiple public Robinhood Chain addresses.']}[view]||['Robinfolio','Portfolio intelligence for tokenized markets.'];return `<section class="page"><div class="page-head"><div><h1>${copy[0]}</h1><p>${copy[1]}</p></div></div><div class="glass empty-view"><div><h2>${copy[0]} is ready for live integration.</h2><p>Its layout and Robinhood Chain data model are in place. Connect a wallet to verify the network and begin reading live balances.</p></div></div></section>`}
let loadError='',requestVersion=0,loadingAccount=false;
let holdings={tokens:null,nfts:null},holdingsLoading={tokens:false,nfts:false},holdingsErrors={tokens:'',nfts:''};
let featuredStocks=[],stocksLoading=false,stocksError='',stockRequest=0;
async function loadStocks(){
  const address=account,request=++stockRequest;stocksLoading=true;stocksError='';featuredStocks=featuredStocks.map(item=>({...item,balance:null}));render();
  try{const response=await fetch('/api/stocks'+(address?'?address='+encodeURIComponent(address):''),{signal:AbortSignal.timeout(35000)});if(!response.ok)throw Error();const data=await response.json();if(request!==stockRequest||address!==account)return;if(!Array.isArray(data.items))throw Error();featuredStocks=data.items;if(data.partial)stocksError='Some stock balances are unavailable.';}catch{if(request===stockRequest&&address===account)stocksError='Stock catalog is temporarily unavailable.';}finally{if(request===stockRequest&&address===account){stocksLoading=false;render();}}
}
function nativeUnits(raw){const value=BigInt(raw).toString().padStart(19,'0');return value.slice(0,-18)+(value.slice(-18).replace(/0+$/,'')?'.'+value.slice(-18).replace(/0+$/,''):'');}
const NATIVE='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
let allocationData=null,allocationLoading=false,allocationError='';
async function loadAllocation(){
  if(!account)return;
  const address=account,version=requestVersion;allocationLoading=true;allocationError='';allocationData=null;render();
  try{const response=await fetch('/api/allocation?address='+encodeURIComponent(address),{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error();const data=await response.json();if(account!==address||version!==requestVersion)return;if(!Array.isArray(data.items))throw Error();allocationData=data;}catch{if(account===address&&version===requestVersion)allocationError='Valuations are temporarily unavailable.';}finally{if(account===address&&version===requestVersion){allocationLoading=false;render();}}
}
function walletAssets(){
  const map=new Map(featuredStocks.map(item=>[item.contract.toLowerCase(),{...item,balance:account?item.balance:null}]));
  if(account)for(const item of holdings.tokens?.items||[]){const key=item.contract.toLowerCase();map.set(key,{...map.get(key),...item,logo:map.get(key)?.logo||item.logo,verifiedOrigin:map.get(key)?.verifiedOrigin||item.verifiedOrigin});}
  const items=[...map.values()];
  if(account&&liveData?.nativeBalanceRaw!=null)items.push({native:true,contract:NATIVE,symbol:'ETH',name:'Ether',balance:nativeUnits(liveData.nativeBalanceRaw),verifiedOrigin:'Native asset',logo:'/eth.svg'});
  return items;
}
function assetImage(item){
  const indexed=account?allocationData?.items.find(row=>row.contract===item.contract.toLowerCase()):null;
  const url=item.logo||indexed?.logo;
  const safe=typeof url==='string'&&(url==='/eth.svg'||/^https:\/\//i.test(url));
  return '<span class="token-avatar"><span aria-hidden="true">'+esc((item.symbol||'?').slice(0,2))+'</span>'+(safe?'<img src="'+esc(url)+'" alt="'+esc(item.symbol)+' logo" loading="lazy" referrerpolicy="no-referrer">':'')+'</span>';
}
function tokenLists(){
  const items=walletAssets(),stocks=items.filter(item=>item.verifiedOrigin==='Robinhood Stock Token');
  const tokens=items.filter(item=>item.verifiedOrigin!=='Robinhood Stock Token').sort((a,b)=>Number(Boolean(b.native))-Number(Boolean(a.native))||Number(Boolean(b.verifiedOrigin))-Number(Boolean(a.verifiedOrigin))||a.symbol.localeCompare(b.symbol));
  const note=!account?'Connect a wallet to check balances.':holdingsLoading.tokens?'Scanning wallet assets… '+(holdings.tokens?.pages||0)+' pages checked.':holdingsErrors.tokens||(holdings.tokens?.partial?'Some balances could not be read.':'Current wallet balances');
  const list=(title,rows,stock)=>'<article class="glass asset-list"><div class="card-head"><h2>'+title+'</h2><small>'+rows.length+' assets</small></div><p class="subtle">'+esc(stock?(stocksLoading?'Loading official stocks…':stocksError||'Official Robinhood stock tokens'):note)+'</p><div class="asset-list-scroll"><table class="data-table"><thead><tr><th>ASSET</th><th>BALANCE</th><th>USD VALUE</th></tr></thead><tbody>'+rows.map(item=>{const quote=account?allocationData?.items.find(row=>row.contract===item.contract.toLowerCase()):null;return '<tr><td><div class="asset-cell">'+assetImage(item)+'<span><a class="asset-name" '+(!item.native?'href="'+CHAIN.explorer+'/token/'+encodeURIComponent(item.contract)+'" target="_blank" rel="noopener noreferrer"':'')+'>'+esc(item.symbol)+'</a><small>'+esc(item.name.replace(' • Robinhood Token',''))+'</small></span></div></td><td class="token-balance" title="'+esc(item.balance??'Unavailable')+'">'+esc(item.balance??'—')+'</td><td>'+(!account?'—':item.balance==='0'?'$0.00':quote?.value!=null?esc(money(quote.value)):'—')+'</td></tr>';}).join('')+(rows.length?'':'<tr><td colspan="3">'+esc(account?'No token balances loaded.':'Connect a wallet to view tokens.')+'</td></tr>')+'</tbody></table></div>'+(!stock&&holdingsErrors.tokens?'<button class="connect" data-holdings="tokens">Resume scan</button>':'')+'</article>';
  return '<div class="asset-lists">'+list('Verified stock tokens',stocks,true)+list('Wallet tokens',tokens,false)+'</div>';
}
function allocationPanel(){
  const data=account?allocationData:null;
  const priced=(data?.items||[]).filter(item=>item.value>0).sort((a,b)=>b.value-a.value);
  const total=priced.reduce((sum,item)=>sum+item.value,0);
  const assets=account?walletAssets().filter(item=>item.balance!=null&&Number(item.balance)>0):[];
  const unpriced=assets.filter(item=>!data?.items.some(row=>row.contract===item.contract.toLowerCase()&&row.value!=null)).length;
  const colors=['#55cf78','#a6e8b6','#d5d0a5','#61aba0','#9ba8d9','#829487'];
  const groups=priced.slice(0,5).map(item=>({label:item.symbol,value:item.value}));
  if(priced.length>5)groups.push({label:'Other priced tokens',value:priced.slice(5).reduce((sum,item)=>sum+item.value,0)});
  let offset=0;const slices=groups.map((item,index)=>{const start=offset;offset+=item.value/total*100;return colors[index]+' '+start+'% '+offset+'%';});
  const note=!account?'Connect a wallet to view allocation.':allocationLoading?'Loading token valuations…':allocationError||(!total?'No priced token balances available.':'Wallet tokens only · 1inch'+(unpriced?' · '+unpriced+' assets without prices':'')+(data?.partial?' · partial coverage':''));
  return '<article class="glass allocation"><div class="card-head"><h2>Asset allocation</h2></div><div class="allocation-wrap"><div class="mini-donut" '+(total?'style="background:conic-gradient('+slices.join(',')+')"':'')+' role="img" aria-label="'+esc(total?'Allocation of priced wallet tokens':'Allocation unavailable')+'"><span><b>'+esc(total?money(total):'—')+'</b><small>Priced tokens</small></span></div><ul class="legend">'+groups.map((item,index)=>'<li style="--tone:'+colors[index]+'"><i></i><span>'+esc(item.label)+'</span><b>'+((item.value/total)*100).toFixed(1)+'%</b></li>').join('')+'</ul></div><p class="subtle" role="status">'+esc(note)+'</p>'+(account&&allocationError?'<button class="card-link allocation-retry">Retry valuations</button>':'')+'</article>';
}
function holdingsPanel(kind){
  if(kind==='tokens')return tokenLists();
  const data=holdings[kind],nft=kind==='nfts';
  const note=holdingsLoading[kind]?'Scanning wallet assets… '+(data?.pages||0)+' pages checked.':holdingsErrors[kind]||(data?.partial?'Scan finished. Some asset details could not be read.':data?'Scan finished. Current holdings reported by Alchemy.':'Open this section to load current holdings.');
  let items=account?[...(data?.items||[])]:[];
  if(!nft){
    const featured=new Map(featuredStocks.map(item=>[item.contract.toLowerCase(),{...item}]));
    for(const item of items){const key=item.contract.toLowerCase();if(featured.has(key)&&item.balance!=null)featured.set(key,{...featured.get(key),balance:item.balance});}
    items=items.filter(item=>!featured.has(item.contract.toLowerCase()));
    items.sort((a,b)=>Number(Boolean(b.verifiedOrigin))-Number(Boolean(a.verifiedOrigin))||a.symbol.localeCompare(b.symbol)||a.contract.localeCompare(b.contract));
    if(liveData?.nativeBalanceRaw!=null)items.unshift({native:true,name:'Ether',symbol:'ETH',balance:nativeUnits(liveData.nativeBalanceRaw),verifiedOrigin:'Native asset'});
    items=[...featured.values(),...items.filter(item=>item.verifiedOrigin==='Robinhood Stock Token'),...items.filter(item=>item.verifiedOrigin!=='Robinhood Stock Token')];
  }
  let lastGroup='';
  const rows=items.map(item=>{
    const group=nft?'':item.verifiedOrigin==='Robinhood Stock Token'?'Tokenized stocks':item.verifiedOrigin?'Tokens · verified origin':'Other tokens';
    const heading=group&&group!==lastGroup?'<tr><th colspan="3">'+group+'</th></tr>':'';lastGroup=group;
    return heading+'<tr><td><b>'+esc(nft?item.name:item.symbol)+'</b><br><small class="subtle">'+esc(nft?item.type:item.name)+'</small>'+(item.verifiedOrigin?'<br><small class="up">'+esc(item.verifiedOrigin)+'</small>':'')+'</td><td>'+esc(nft?'#'+item.tokenId:item.balance??'—')+'</td><td>'+(item.native?'Native ETH':'<a class="card-link" href="'+CHAIN.explorer+'/token/'+encodeURIComponent(item.contract)+'" target="_blank" rel="noopener noreferrer">'+esc(short(item.contract))+'</a>')+'</td>'+(nft?'<td>'+esc(item.balance)+'</td>':'')+'</tr>';
  }).join('');
  return '<article class="glass assets-card"><div class="card-head"><h2>'+(nft?'NFTs':'Tokenized stocks and tokens')+'</h2></div><p class="subtle" role="status">'+esc(nft?note:!account?'Connect a wallet to check balances.':note)+'</p>'+(!nft&&(stocksLoading||stocksError)?'<p class="subtle">'+esc(stocksLoading?'Loading official stocks…':stocksError)+'</p>':'')+'<table class="data-table"><thead><tr><th>Asset</th><th>'+(nft?'Token ID':'Balance')+'</th><th>Contract</th>'+(nft?'<th>Quantity</th>':'')+'</tr></thead><tbody>'+(rows||'<tr><td colspan="4">'+(holdingsLoading[kind]?'Searching all pages for positive balances…':data&&!holdingsErrors[kind]?'No holdings reported by the indexer.':'No asset data loaded.')+'</td></tr>')+'</tbody></table>'+(!holdingsLoading[kind]&&holdingsErrors[kind]?'<button class="connect" data-holdings="'+kind+'">Resume scan</button>':'')+'<p class="subtle">'+(nft?'Ownership is reported by the indexer.':'Featured stocks remain visible with confirmed zero balances. Other discovered tokens are shown with positive balances. Verified origin identifies a known issuer or launch platform, not token safety. Other tokens remain visible. USD prices are not connected yet.')+'</p></article>';
}
async function loadHoldings(kind,more=false){
  if(!account||holdingsLoading[kind])return;
  const address=account,version=requestVersion;
  let pageKey=more?holdings[kind]?.nextPageKey:null;
  const seen=new Set(more?holdings[kind]?.cursors||[]:[]);
  holdingsLoading[kind]=true;holdingsErrors[kind]='';render();
  try{
    do{
      if(seen.has(pageKey||''))throw new Error('Repeated pagination cursor');
      const query=new URLSearchParams({address,kind,...(pageKey?{pageKey}:{})});
      const result=await fetch('/api/holdings?'+query,{signal:AbortSignal.timeout(55000)});
      if(!result.ok)throw new Error('unavailable');
      const data=await result.json();
      if(account!==address||version!==requestVersion)return;
      if(!Array.isArray(data.items))throw new Error('invalid response');
      seen.add(pageKey||'');
      const previous=more||seen.size>1?holdings[kind]:null;
      const unique=new Map([...(previous?.items||[]),...data.items].map(item=>[item.contract.toLowerCase()+':'+(item.tokenId||''),item]));
      holdings[kind]={...data,items:[...unique.values()],pages:(previous?.pages||0)+1,cursors:[...seen],partial:Boolean(data.partial||previous?.partial)};
      pageKey=data.nextPageKey;render();
    }while(pageKey);
  }catch{if(account===address&&version===requestVersion)holdingsErrors[kind]='Scan incomplete. Your loaded balances are preserved. Resume to try again.';}
  finally{if(account===address&&version===requestVersion){holdingsLoading[kind]=false;render();}}
}
let historyData=null,historyLoading=false,historyError='',historyPeriod='1month',historyRequest=0;
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
function historyChart(){
  const points=account?historyData?.points||[]:[];
  if(!points.length)return '<div class="chart-empty" role="status">'+esc(!account?'Connect or track a wallet to view its history.':historyLoading?'Loading portfolio history…':historyError||'No historical values available for this period.')+'</div>';
  const min=Math.min(...points.map(p=>p.value)),max=Math.max(...points.map(p=>p.value));
  const first=points[0].at,last=points.at(-1).at,span=last-first;
  const coords=points.map(p=>[(span?(p.at-first)/span:0.5)*850+25,150-(max===min?0.5:(p.value-min)/(max-min))*130]);
  const line=coords.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
  return '<svg class="performance-chart" viewBox="0 0 900 180" role="img" aria-label="Indexed portfolio value in USD"><title>'+esc(points.length+' observations from '+new Date(first).toLocaleDateString()+' to '+new Date(last).toLocaleDateString())+'</title>'+(points.length>1?'<path d="'+line+'" fill="none" stroke="#7fe39a" stroke-width="2.5"/>':'')+coords.map(([x,y],i)=>'<circle cx="'+x+'" cy="'+y+'" r="3" fill="#7fe39a"><title>'+esc(new Date(points[i].at).toLocaleString()+' · '+money(points[i].value))+'</title></circle>').join('')+'</svg><div class="chart-axis"><span>'+esc(new Date(first).toLocaleDateString())+'</span><span>'+esc(money(min)+' – '+money(max))+'</span><span>'+esc(new Date(last).toLocaleDateString())+'</span></div>';
}
async function loadHistory(period=historyPeriod){
  if(!account)return;
  const address=account,version=requestVersion,request=++historyRequest;
  historyPeriod=period;historyLoading=true;historyError='';historyData=null;render();
  try{
    const response=await fetch('/api/history?'+new URLSearchParams({address,period}),{signal:AbortSignal.timeout(25000)});
    const data=await response.json();
    if(account!==address||version!==requestVersion||request!==historyRequest)return;
    if(!response.ok)throw new Error(data.code==='HISTORY_NOT_CONFIGURED'?'Portfolio history is not connected yet.':'Portfolio history is temporarily unavailable.');
    if(!Array.isArray(data.points))throw new Error('Portfolio history is temporarily unavailable.');
    historyData=data;
  }catch(error){if(account===address&&version===requestVersion&&request===historyRequest)historyError=error.name==='TimeoutError'?'Portfolio history timed out. Please retry.':error.message;}
  finally{if(account===address&&version===requestVersion&&request===historyRequest){historyLoading=false;render();}}
}

let defiData=null,defiLoading=false,defiError='';
function mergeDefi(base,extra){
 const items=(base?.items||[]).map(item=>({...item}));
 for(const item of extra?.items||[]){const duplicate=items.find(old=>item.contract&&old.contract?.toLowerCase()===item.contract.toLowerCase()&&old.side===item.side&&old.tokenId===item.tokenId&&!item.id.includes(':cl:')&&!old.id.includes(':cl:'));
 if(duplicate){if(!duplicate.protocol.split(' / ').includes(item.protocol))duplicate.protocol+=' / '+item.protocol;}else items.push({...item});}
 return {items,sources:[...(base?.sources||[]),...(extra?.sources||[])],supported:base?.supported||[],partial:!!(base?.partial||extra?.partial),scope:'Coverage varies by protocol. Unavailable data is not a zero balance.'};
}
async function loadDefi(){
 if(!account||defiLoading)return;const address=account,version=requestVersion;defiLoading=true;defiError='';defiData=null;render();let base=null,extra=null;
 const jobs=[['/api/defi',false],['/api/protocol-positions',true]].map(async([url,expanded])=>{try{const response=await fetch(url+'?address='+encodeURIComponent(address),{signal:AbortSignal.timeout(65000)});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.items))throw Error();if(account!==address||version!==requestVersion)return;if(expanded)extra=data;else base=data;defiData=mergeDefi(base,extra);render();}catch{if(account===address&&version===requestVersion){defiError='Some position sources are unavailable. Loaded positions are preserved.';render();}}});
 await Promise.allSettled(jobs);if(account===address&&version===requestVersion){defiLoading=false;render();}
}
let protocolData=null,protocolLoading=false;
async function loadProtocols(){if(protocolLoading||protocolData)return;protocolLoading=true;try{const r=await fetch('/api/protocols',{signal:AbortSignal.timeout(65000)});if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.protocols))throw Error();protocolData=d;}catch{}finally{protocolLoading=false;render();}}
function protocolCatalogPanel(){const rows=protocolData?.protocols||[];return '<article class="glass protocol-catalog"><div class="card-head"><h2>Connected protocols</h2></div><p class="subtle">Markets are tracked even when your wallet has no positions.</p>'+(!rows.length?'<p class="subtle">'+(protocolLoading?'Loading protocol catalogs…':'Protocol catalogs are temporarily unavailable.')+'</p>':'<div class="protocol-directory">'+rows.map(p=>'<a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer"><b>'+esc(p.name)+'</b><span>'+esc(p.status==='available'?p.markets.length+(p.catalogPartial?' known markets · live catalog unavailable':' markets tracked'):'Catalog unavailable')+'</span></a>').join('')+'</div>')+'<p class="subtle">Market discovery is connected. Yield comparisons and the Opportunities agent will be added separately.</p></article>';}
function defiPositionRow(item){
 const qty=v=>new Intl.NumberFormat('en-US',{maximumSignificantDigits:6}).format(v);
 const parts=item.components||[];
 const label=item.value==null?'—':(item.estimated?'≈ ':'')+(item.side==='Debt'?'−':'')+money(item.value);
 const meta=[item.protocol,item.side,item.rangeCount?item.rangeCount+' ranges':null,item.inRange===true?'In range':item.inRange===false?'Out of range':null,item.stale?'Delayed':null].filter(Boolean).join(' · ');
 const breakdown=parts.map((p,i)=>{const units=(Number(p.amountRaw)+Number(p.feesRaw||0))/10**p.decimals;const symbol=item.name.split(' / ')[i]||short(p.currency);return '<div><span>'+esc(qty(units)+' '+symbol)+'</span><span>'+esc(p.priceUsd==null?'Price unavailable':money(units*p.priceUsd))+'</span></div>';}).join('');
 const details=breakdown+'<p>'+esc(item.value==null?'USD valuation unavailable.':item.valuationSource||'Protocol-reported USD value')+(item.feesIncluded?' · Accrued fees included':item.feesExcluded?' · Fees and deferred credits excluded':item.feesIncluded===false?' · Accrued fees unavailable':'')+'</p>'+(item.tokenIds?'<p>Position NFTs: '+item.tokenIds.map(esc).join(', ')+'</p>':item.tokenId?'<p>Position #'+esc(item.tokenId)+'</p>':'');
 return '<details class="defi-position"><summary><span class="defi-position-label"><b>'+esc(item.name)+'</b><small>'+esc(meta)+'</small></span><span class="defi-position-value"><strong>'+esc(label)+'</strong><small>'+(item.value==null?'Unpriced':item.feesIncluded?'Incl. fees':item.estimated?'Estimated':'USD')+'</small></span><span class="defi-chevron" aria-hidden="true">⌄</span></summary><div class="defi-position-details">'+details+'</div></details>';
}
function opportunitiesPage(){return '<section class="page"><div class="page-head"><div><h1>Market opportunities</h1><p>Discover liquidity pools, lending markets and vault yields on Robinhood Chain.</p></div></div><article class="glass opportunities-empty"><span class="opportunities-status">Coming next</span><h2>Your next opportunity, in one place.</h2><p>This space will bring together DeFi opportunities and highlight options for available wallet balances, with yield, liquidity and risk in view.</p></article></section>';}

function defiPanel(full=false){
 const data=account?defiData:null,items=data?.items||[];
 const note=!account?'Connect a wallet to view your positions.':defiLoading?(defiData?.items.length?'Loading remaining protocols…':'Loading DeFi positions…'):defiError||(!data?'Positions have not been loaded.':items.length?'Indexed DeFi positions':'No positions reported within indexed coverage.');
 const protocols=[['Morpho','morpho','https://app.morpho.org'],['Uniswap V2/V3','uniswap v2','https://app.uniswap.org'],['Uniswap V4','uniswap v4','https://app.uniswap.org'],['up','up','https://up33.xyz/'],['Delta','delta','https://deltaliquidity.app/pools'],['Fables','fables','https://www.fables.fi/markets'],['Ramses','ramses','https://www.ramses.xyz/'],['Longbow','longbow','https://www.longbow.cash/earn'],['Pendle','pendle','https://app.pendle.finance/trade/markets?chains=robinhood'],['EARN','earn','https://earnonhood.com/auto']];
 return '<article class="glass compact-card defi-card"><div class="card-head"><h2>DeFi positions</h2>'+(full?(account?'<button class="card-link defi-retry" '+(defiLoading?'disabled':'')+'>Refresh positions</button>':''):'<a class="card-link" href="#defi">View all →</a>')+'</div><p class="subtle" role="status">'+esc(note)+'</p><div class="defi-position-scroll">'+items.map(defiPositionRow).join('')+'</div>'+(account&&defiError?'<button class="card-link defi-retry">Retry positions</button>':'')+(data&&full?'<p class="subtle">'+esc(data.scope)+' Unstaked up liquidity is not covered.'+(data.partial?' Some sources are delayed or incomplete. See full coverage.':'')+'</p>':'')+(!full&&data?'<a class="defi-coverage-link" href="#defi">'+(data.partial?'Partial coverage':'Coverage')+' · View details →</a>':'')+(full?'<div class="defi-coverage">'+protocols.map(([name,key,url])=>{const source=data?.sources?.find(p=>p.name.toLowerCase().startsWith(key));const supported=data?.supported?.some(p=>(p.id+' '+p.name).toLowerCase().includes(key));return '<p><a class="card-link" href="'+url+'" target="_blank" rel="noopener noreferrer">'+name+' ↗</a><span>'+(source?['available','partial','stale'].includes(source.status)?esc(source.scope)+(source.status==='stale'?(source.indexedAt?' · Index delayed since '+esc(new Date(source.indexedAt).toLocaleDateString()):' · Index freshness unverified'):''):'Source temporarily unavailable':!data?.supported?'Coverage not checked':supported?'Indexed coverage available':'Not covered by this indexer')+'</span></p>';}).join('')+'</div>':'')+'</article>';
}

const protocolBrands=[
 ['Morpho','https://cdn.morpho.org/v2/assets/images/favicon.svg'],
 ['Uniswap','https://cdn.app.uniswap.org/favicon.png'],
 ['up','https://up33.xyz/favicon.svg'],
 ['Delta','https://deltaliquidity.app/icon.svg?icon.3_6i6um2g-429.svg'],
 ['Fables','https://www.fables.fi/apple-touch-icon.png'],
 ['Ramses','https://www.ramses.xyz/favicon/favicon.ico'],
 ['Longbow','https://www.longbow.cash/favicon.png'],
 ['Pendle','https://app.pendle.finance/favicon.ico'],
 ['EARN','https://earnonhood.com/earn-favicon-v2.png']
];
function protocolTicker(){
 const items=protocolBrands.map(([name,logo])=>'<span class="protocol-brand"><img src="'+logo+'" alt="" width="23" height="23" referrerpolicy="no-referrer"><span>'+name+'</span></span>').join('');
 return '<div class="protocol-ticker" tabindex="0" role="group" aria-label="Protocols integrated: '+protocolBrands.map(p=>p[0]).join(', ')+'. Focus or hover to pause."><span class="protocol-ticker-title">Protocols integrated</span><div class="protocol-ticker-window" aria-hidden="true"><div class="protocol-ticker-track"><div class="protocol-ticker-group">'+items+'</div><div class="protocol-ticker-group">'+items+'</div></div></div></div>';
}

function liveOverview(){
  const points=account?historyData?.points||[]:[],latest=points.at(-1);
  const periods=[['1day','1D'],['1week','1W'],['1month','1M']].map(([value,label])=>'<button data-period="'+value+'" class="'+(historyPeriod===value?'active':'')+'" '+(!account?'disabled':'')+'>'+label+'</button>').join('');
  const balances=holdingsPanel('tokens');
  return '<section class="page"><div class="page-head overview-head"><div><h1>Portfolio overview</h1><p>Tokenized equities, ETFs, crypto, stablecoins and DeFi on Robinhood Chain.</p></div>'+protocolTicker()+'<span class="wallet-context">'+esc(account?'Wallet '+short(account):'Connect a wallet for live data')+'</span></div><div class="dashboard-grid overview-columns"><div class="overview-left"><article class="glass performance"><div class="card-head"><h2>Portfolio value</h2><div class="chart-periods">'+periods+'</div></div><div class="value">'+(latest?esc(money(latest.value)):'—')+'</div><div class="subtle">'+(latest?'Latest indexed value · '+esc(new Date(latest.at).toLocaleString()):'Historical valuation in USD')+'</div>'+historyChart()+(account&&historyError?'<button class="card-link history-retry">Retry history</button>':'')+(latest?'<p class="subtle">1inch indexed coverage. May exclude unsupported assets and positions.'+(historyData.partial?' Some observations were unavailable.':'')+'</p>':'')+'</article>'+balances+'</div><div class="overview-right"><div class="defi-column">'+defiPanel()+'<article class="glass compact-card"><div class="card-head"><h2>Market insight</h2></div><div class="dashboard-empty">'+(account?'Insights will appear once balances, prices and positions are available.':'Your portfolio insights will appear here.')+'</div></article></div></div></div></section>';
}
function liveActivity(){
  const source=liveData?.sources?.transactions;
  const rows=(liveData?.transactions||[]).filter(tx=>/^0x[0-9a-f]{64}$/i.test(tx.hash||'')).map(tx=>`<tr><td><a class="card-link" href="${CHAIN.explorer}/tx/${tx.hash}" target="_blank" rel="noopener noreferrer">${esc(short(tx.hash))}</a></td><td>${esc(short(tx.from))}</td><td>${esc(short(tx.to))}</td><td>${tx.isError==='1'?'Failed':'Confirmed'}</td></tr>`).join('');
  return `<section class="page"><div class="page-head"><div><h1>Activity</h1><p>${source?.status==='available'?(source.truncated?'Latest 100 transactions. Earlier history is not loaded.':'Indexed transactions for this wallet.'):'Transaction history is currently unavailable.'}</p></div></div><article class="glass assets-card"><table class="data-table"><thead><tr><th>Transaction</th><th>From</th><th>To</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No transactions to display.</td></tr>'}</tbody></table></article></section>`;
}
function render(){if(view==='markets')view='assets';document.querySelectorAll('#app-nav a').forEach(link=>link.classList.toggle('active',link.dataset.view===view));$('#main-content').innerHTML=view==='overview'?liveOverview():view==='opportunities'?opportunitiesPage():view==='defi'?'<section class="page">'+defiPanel(true)+protocolCatalogPanel()+'</section>':(view==='activity'&&account?liveActivity():(view==='assets'||account&&view==='nfts')?`<section class="page">${holdingsPanel(view==='nfts'?'nfts':'tokens')}</section>`:placeholder());document.querySelectorAll('[data-holdings]').forEach(button=>button.addEventListener('click',()=>loadHoldings(button.dataset.holdings,Boolean(holdings[button.dataset.holdings]?.nextPageKey))));document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>loadHistory(button.dataset.period)));document.querySelectorAll('.token-avatar img').forEach(img=>img.addEventListener('error',()=>img.remove()));document.querySelectorAll('.allocation-retry').forEach(button=>button.addEventListener('click',()=>loadAllocation()));document.querySelectorAll('.defi-retry').forEach(button=>button.addEventListener('click',()=>loadDefi()));document.querySelectorAll('.history-retry').forEach(button=>button.addEventListener('click',()=>loadHistory()));}
async function switchChain(){const provider=window.ethereum;if(!provider)throw new Error('Install an EVM wallet to connect.');try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN.id}]})}catch(error){if(error.code!==4902)throw error;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN.id,chainName:CHAIN.name,nativeCurrency:{name:'Ether',symbol:CHAIN.symbol,decimals:18},rpcUrls:[CHAIN.rpc],blockExplorerUrls:[CHAIN.explorer]}]})}}
async function loadAccount(address){const version=++requestVersion;holdings={tokens:null,nfts:null};holdingsLoading={tokens:false,nfts:false};holdingsErrors={tokens:'',nfts:''};liveData=null;historyData=null;historyError='';historyLoading=false;allocationData=null;allocationError='';allocationLoading=false;defiData=null;defiLoading=false;defiError='';loadError='';loadingAccount=true;render();loadDefi();loadStocks();loadHistory();loadAllocation();loadHoldings(view==='nfts'?'nfts':'tokens');try{const response=await fetch('/api/portfolio?address='+encodeURIComponent(address),{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('Wallet data is temporarily unavailable.');const data=await response.json();if(version!==requestVersion||account!==address)return;liveData=data;}catch{if(version===requestVersion&&account===address)loadError='Wallet data is temporarily unavailable. Try again.';}finally{if(version===requestVersion){loadingAccount=false;render();}}}
$('#connect-wallet').addEventListener('click',async()=>{try{await switchChain();const [address]=await window.ethereum.request({method:'eth_requestAccounts'});account=address;$('#connect-wallet').textContent=short(account);await loadAccount(account)}catch(error){$('#connect-wallet').textContent=error.message.slice(0,34)}});
$('#address-input').addEventListener('keydown',event=>{if(event.key!=='Enter')return;const value=event.currentTarget.value.trim();if(/^0x[a-fA-F0-9]{40}$/.test(value)){account=value;loadAccount(value)}});
window.addEventListener('hashchange',()=>{view=(location.hash||'#overview').slice(1);render();if(account&&view==='defi'&&!defiLoading)loadDefi();const kind=view==='nfts'?'nfts':'tokens';if(account&&['overview','assets','nfts'].includes(view)&&!holdings[kind]&&!holdingsErrors[kind])loadHoldings(kind)});
if(window.ethereum)window.ethereum.on?.('accountsChanged',accounts=>{account=accounts[0]||'';liveData=null;account?loadAccount(account):(featuredStocks=featuredStocks.map(item=>({...item,balance:null})),render(),loadStocks())});
render();
loadStocks();
loadProtocols();
