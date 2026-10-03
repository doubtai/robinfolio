import fs from 'node:fs';
fs.copyFileSync('node_modules/ethers/dist/ethers.min.js','public/launch-ethers.js');
for(const [src,dst] of [['src/launch-session.js','public/launch-session.js'],['src/pons-launch-core.js','public/pons-launch-core.js'],['src/pons-launch.js','public/launch.js']])fs.writeFileSync(dst,fs.readFileSync(src,'utf8').replace("from 'ethers'","from './launch-ethers.js'"));
