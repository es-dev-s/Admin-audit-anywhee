# Audit App Backend Wiring Guide

This document explains how the Audit frontend is wired to the existing `signaling-server` for:

- admin-grade session/auth
- org/client data visibility
- live telemetry updates
- WebRTC screen streaming

Use this as handoff context for another AI/frontend implementation.

---

## 1) Goal And Constraints

- Keep existing backend protocol unchanged.
- Audit frontend should **not** expose account-creation UX.
- Audit frontend should auto-bootstrap a privileged audit session and consume the same data/stream contracts already used by desktop admin.
- Do not change client app or admin desktop logic.

---

## 2) Required Environment Variables (Audit frontend)

In `Audit-dashboard/audit-dashboard/.env`:

- `NEXT_PUBLIC_ANYWHERE_SIGNALING_WSS`
- `NEXT_PUBLIC_WS_CONNECT_TOKEN` (only if server enforces WS handshake token)
- `NEXT_PUBLIC_AUDIT_ORG_NAME`
- `NEXT_PUBLIC_AUDIT_USERNAME`
- `NEXT_PUBLIC_AUDIT_PASSWORD`

Current implementation reads these in:

- `components/dashboard/workspace-main.tsx`

---

## 3) WebSocket Boot Sequence

### Step A: connect

1. Create `WebSocket` to `NEXT_PUBLIC_ANYWHERE_SIGNALING_WSS`
2. If present, append query param `token=NEXT_PUBLIC_WS_CONNECT_TOKEN`

### Step B: authenticate audit admin

On `socket.onopen`, send:

```json
{
  "type": "admin-login",
  "orgName": "<NEXT_PUBLIC_AUDIT_ORG_NAME>",
  "username": "<NEXT_PUBLIC_AUDIT_USERNAME>",
  "password": "<NEXT_PUBLIC_AUDIT_PASSWORD>"
}
```

Expected response:

- `type: "admin-login-response"`
- `success: true`
- `token` (session token for admin-authenticated operations)
- `admin.role`, `org`, etc.

Server route switch lives in:

- `signaling-server/server.js` (`case 'admin-login'`)

---

## 4) Data Access Flow (Teams + Members)

After successful `admin-login-response`, use returned `token` and send:

1. `admin-get-orgs`
2. `admin-get-clients`

Payload shape:

```json
{ "type": "admin-get-orgs", "token": "<sessionToken>" }
```

```json
{ "type": "admin-get-clients", "token": "<sessionToken>" }
```

Expected responses:

- `admin-get-orgs-response` with `orgs[]`
- `admin-get-clients-response` with `clients[]`

Also subscribe to push updates:

- `admin-clients-updated`

Server handlers:

- `case 'admin-get-orgs'` -> `_handleAdminGetOrgs`
- `case 'admin-get-clients'` -> `_handleAdminGetClients`

---

## 5) Live Telemetry Push Events

Audit/admin sockets receive server-broadcast telemetry updates:

- `call-events-update`
- `taskbar-events-update`
- `browser-tab-events-update`

Broadcast logic is role-gated server-side and includes `super_admin`, `it_ops`, and org-scoped `org_admin`.

Relevant server logic:

- `_broadcastCallEventsToAdmins`
- `_broadcastTaskbarEventsToAdmins`
- `_broadcastBrowserTabEventsToAdmins`

---

## 6) Historical Telemetry Pull APIs (Optional UI panels)

HTTP endpoints exist on signaling server:

- `GET /api/call-events?clientId=<id>&page=<n>&limit=<n>`
- `GET /api/taskbar-events?clientId=<id>&page=<n>&limit=<n>`
- `GET /api/browser-tab-events?clientId=<id>&page=<n>&limit=<n>`

Use header:

- `Authorization: Bearer <sessionToken>`

Notes:

- If frontend only needs live push data, these are optional.
- If enabling these from browser, ensure CORS/network topology allows it.

---

## 7) Screen Stream (WebRTC) Wiring

### Step A: request connection to client

Send:

```json
{
  "type": "connect-to-client",
  "token": "<sessionToken>",
  "clientId": 123
}
```

Server path:

- `case 'connect-to-client'` with token -> `_handleAdminConnectToClient`

Server returns:

- `start-offer` including `clientSocketId`, `clientId`, `sessionId`

### Step B: create PeerConnection and offer

On `start-offer`:

1. `new RTCPeerConnection({ iceServers })`
2. `addTransceiver('video', { direction: 'recvonly' })`
3. create/set local offer
4. send:

```json
{
  "type": "offer",
  "targetSocketId": "<clientSocketId>",
  "sdp": { "...": "..." }
}
```

### Step C: ICE exchange

- On local ICE candidate:

```json
{
  "type": "ice-candidate",
  "targetSocketId": "<clientSocketId>",
  "candidate": { "...": "..." }
}
```

- On remote `answer`: `pc.setRemoteDescription(answer)`
- On remote `ice-candidate`: `pc.addIceCandidate(candidate)`

### Step D: media attach

- On `pc.ontrack`, attach stream to `<video>` element

ICE servers source:

- server sends `welcome` with `iceServers`

---

## 8) Important Role/Policy Notes

- Account creation remains super-admin only on server (`admin-register` requires super admin token).
- Audit frontend should simply avoid implementing account-creation controls.
- Stream access still passes `_checkAdminSensitiveAccess` in `_handleAdminConnectToClient`:
  - if server policy requires office network/approved access, it can return `access-restricted`.
- Current server comment says stream policy gates are disabled once authenticated and online client exists, but network policy check still applies.

---

## 9) Current File With Working Reference Logic

Reference implementation path:

- `Audit-dashboard/audit-dashboard/components/dashboard/workspace-main.tsx`

It currently runs backend connection/auth/stream logic with minimal hidden UI.

---

## 10) Suggested Frontend Rebuild Contract

When rebuilding UI, keep this sequence:

1. boot socket
2. login audit admin
3. fetch orgs + clients
4. subscribe to push updates
5. allow selecting client -> send `connect-to-client`
6. run WebRTC offer/answer/ICE lifecycle
7. optionally add HTTP history panels

As long as message types and token usage above are preserved, new UI can be redesigned freely without backend changes.

