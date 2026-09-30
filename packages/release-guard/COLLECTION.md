# Bounded live collection

`collectEvidence(request)` collects the declared asset URLs with bodyless GET requests. Request fields are the existing `schemaVersion`, `expected`, `policy`, optional sanitized `ci` and `browser`, plus `collection`:

```json
{"allowLocalhost":false,"timeoutMs":5000,"maxBodyBytes":4194304,"maxRequests":64}
```

Unknown fields are rejected. Budgets may be reduced; timeout maximum is 30 seconds, body maximum 4 MiB, requests maximum 128, total response bytes 16 MiB, redirects maximum 5 per asset. Requests run sequentially, without retries. DNS and HTTP have separate bounded deadlines. Redirect targets must remain on the exact origin; final asset paths are independently compared by Deploy Verify. HTTPS uses normal TLS certificate verification. Every resolved public hostname address must pass a conservative public-address policy; a selected address is pinned for the connection. Explicit `allowLocalhost:true` permits only literal `http://127.0.0.1:PORT` or `http://[::1]:PORT`; ordinary offline validation continues rejecting HTTP unless the verifier is explicitly given the same option. No local hostname discovery occurs.

Bodies are hashed in memory and discarded. The output never includes response bodies, cookies, authentication headers or raw error messages. The collector sends no user headers, credentials or query parameters. It records dedicated `x-deploy-commit` (40 lowercase hex) and `x-deploy-build-id` (bounded safe identifier) public response headers; it never invents observed identity from expected identity. Missing headers produce unknown version checks. Non-2xx, 304 and encoded bodies do not produce body hashes. HTTP `Age` is preserved when bounded numeric. `cache.source:network` describes this direct GET, not a browser or installed-device cache.

CI and browser snapshots must be supplied as sanitized evidence under the existing schema. This MVP does not connect to authenticated GitHub, launch browsers, execute page scripts, read credentials or run manifest commands. The returned `bundle` is directly usable by `verifyDeployment(bundle, {allowLocalhost:true})` for an explicitly local collection. `provenance` records the request digest, request count, body budget accounting and observation pointers. Collection failures leave assets without fabricated observations and emit bounded diagnostic codes. The verifier remains the authority for pass/fail/unknown. Installed-device PWA update status always remains unknown.

`maxDurationMs` additionally bounds the whole collection (default 30 seconds, maximum 60 seconds); DNS/request deadlines shrink to the remaining budget and later assets are left unknown after it expires. The output policy `asOf` is the actual collection completion cutoff, so newly observed evidence is not incorrectly classified as future evidence. The original request remains identified by its digest. CI/browser timestamps remain untouched and can therefore still be stale or future.
