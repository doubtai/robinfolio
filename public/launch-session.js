export const PENDING_KEY='robinfolio-pons-pending', HISTORY_KEY='robinfolio-pons-history';
export function validLaunch(p){return /^0x[0-9a-f]{64}$/i.test(p?.hash)&&/^0x[0-9a-f]{40}$/i.test(p?.token);}
export function loadPending(storage){try{const p=JSON.parse(storage.getItem(PENDING_KEY));return validLaunch(p)?p:null;}catch{return null;}}
export function loadHistory(storage){try{return JSON.parse(storage.getItem(HISTORY_KEY)).filter(validLaunch).slice(0,50);}catch{return [];}}
export function settleLaunch(storage,launch,receipt){
 if(!receipt||receipt.transactionHash?.toLowerCase()!==launch.hash.toLowerCase())return null;
 if(!['0x1','0x0'].includes(receipt.status))return null;
 const entry={...launch,state:receipt.status==='0x1'?'confirmed':'failed',confirmedAt:Date.now()};
 const history=[entry,...loadHistory(storage).filter(p=>p.hash!==launch.hash)].slice(0,50);
 storage.setItem(HISTORY_KEY,JSON.stringify(history));
 if(loadPending(storage)?.hash===launch.hash)storage.removeItem(PENDING_KEY);
 return entry;
}
