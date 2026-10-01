import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/app.js','utf8');
const fn=source.slice(source.indexOf('function walletTokenQuote('),source.indexOf('function tokenLists('));
const token='0x'+'1'.repeat(40),receipt='0x'+'2'.repeat(40),unknown='0x'+'3'.repeat(40);
const ctx=vm.createContext({account:'wallet',allocationData:{items:[{contract:token,value:99}]},defiData:{items:[
 {components:[{currency:token,priceUsd:1}]},
 {contract:receipt,side:'Principal token',balanceRaw:'2000000000000000000',value:4},
 {components:[{currency:'0x'+'0'.repeat(40),priceUsd:2000}]}
]}});vm.runInContext(fn,ctx);
const quote=item=>{ctx.item=item;return vm.runInContext('walletTokenQuote(item)',ctx);};
assert.equal(quote({contract:token,balance:'1.5'}).value,1.5,'current balance replaces stale indexed total');
assert.equal(quote({contract:receipt,balance:'1',balanceRaw:'0xde0b6b3a7640000'}).value,2,'receipt price scales to current shares');
assert.equal(quote({contract:unknown,native:true,balance:'0.5'}).value,1000);
assert.equal(quote({contract:unknown,balance:'2'}),null);assert.equal(quote({contract:token,balance:null}),null);
assert.equal(quote({contract:token,balance:'0'}).value,0);
ctx.account='';assert.equal(quote({contract:token,balance:'2'}),null);
console.log('PASS current wallet quantities, receipt exchange values, native price mapping, missing prices and disconnected wallet');
