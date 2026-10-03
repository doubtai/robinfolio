# Launcher image hosting

The launcher remains usable with HTTPS/IPFS image URLs without storage configuration.

To enable file uploads, connect a **public Vercel Blob** store to this project in Production and Preview. The server uses BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID with VERCEL_OIDC_TOKEN. Never put credentials in public JavaScript.

Set LAUNCH_UPLOAD_WALLETS to a comma-separated list of authorized creator wallet addresses. The creator of the launch supplied in this task is 0x03c91d6a79d74935e210f564d4bbc45cc113d65a. Add other owned wallets explicitly when needed. Anyone can still launch using a public image URL; storage is restricted to authorized creators to prevent anonymous uploads.

Redeploy after connecting storage or changing environment variables. GET /api/launch-image reports enabled only when storage and an allowlist are configured. Uploads are PNG/JPEG/WebP, at most 1 MiB, signed over the exact image hash and timestamp by an allowed wallet. Paths are content-addressed and cannot overwrite existing files. The signature is an upload approval, not a transaction.

Smoke test: connect an authorized wallet, select a harmless test image, click Upload image, sign the message yourself, and verify the returned public URL loads. Do not click Confirm in wallet unless actually launching a token.

Repeat launches: the receipt is checked automatically through the read-only RPC endpoint, even before connecting a wallet. Successful and reverted transactions move to browser-local history and unlock Create another token. Pending transactions are retained across reloads. Starting another token clears all token metadata and the previous review, preserving the selected launch configuration. Every review uses a fresh salt and current onchain terms.

Image mode is exclusive: upload mode keeps the hosted URL internally and does not require a URL input. URL mode does not require a file. Pair candidates come from the official Pons catalog and are filtered by live factory approval and nonzero economics. Native ETH uses the zero address and launch-config economics. Creator tax accepts two decimal places and is rechecked against the onchain cap on every review.
