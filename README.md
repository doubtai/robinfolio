# Robinfolio

Portfolio intelligence for tokenized markets on Robinhood Chain.

## Network

- Chain ID: `4663`
- Native gas token: `ETH`
- Explorer: `https://robin.etherscan.io`
- Public RPC fallback: `https://rpc.mainnet.chain.robinhood.com`

## Environment

Copy `.env.example` to `.env.local` and provide a Robinhood Chain Alchemy endpoint and an Etherscan V2 API key. The interface remains usable in preview mode when keys are absent.

## Portfolio history

The dashboard has no example balances or synthetic historical points, including when disconnected. Native/token balances remain available independently of the historical provider.

Set ONEINCH_API_KEY as a sensitive server-only Vercel environment variable for Production and Preview, then redeploy. GET /api/history accepts one wallet and 1day, 1week or 1month (default). It calls the 1inch v5 general chart for Robinhood chain 4663, caches for five minutes, validates observations and preserves provider quality warnings. The chart labels its value as the latest indexed observation, not a current valuation or investment return. Provider coverage may omit unsupported assets; allocation and DeFi stay empty until their actual integrations are available.

Sources: https://business.1inch.com/portal/documentation/apis/portfolio/introduction and https://business.1inch.com/portal/documentation/apis/portfolio/methods/portfolio/v5.0/general/chart/method/get

Checks: node docs/test-dashboard.mjs and node docs/test-holdings.mjs.

