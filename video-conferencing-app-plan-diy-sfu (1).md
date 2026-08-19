# Production Video Conferencing Platform (Elastic Participant Scale)

## 1. Goal and scale model

Build a production video conferencing platform that supports:

- 1:1 and group meetings.
- No hard-coded application limit on participants per room or across the platform.
- Multiple rooms across multiple media nodes.
- Camera, microphone, screen sharing, chat, recording, and reconnects. Moderation is deferred with authorization.
- Secure transport with TURN and TLS, plus monitoring and operational recovery. User authentication and authorization are deferred for now.

Participant capacity is elastic and grows by adding media nodes, TURN capacity, regional infrastructure, and application replicas. Individual clients subscribe only to useful media based on visibility, role, active speaker, and available bandwidth. "No hard-coded limit" does not mean infinite physical capacity: admission and placement decisions must use current measured resources so an overloaded node never degrades an existing meeting.

## 2. Core architecture decision: build our own SFU

This project will not use LiveKit, mediasoup, Janus, ion-sfu, or another ready-made SFU. Owning the media-routing layer is a core project requirement.

Use Python and `aiortc.MediaRelay` to validate signaling, WebRTC ingest, track lifecycle, and small-room fan-out. Do not mistake frame-level `MediaRelay` fan-out for the final large-scale design: it lacks the efficient packet-routing and large-room control required for elastic production scale.

Build a custom packet-forwarding media service for production. The media service must terminate WebRTC transports but forward encoded RTP packets without decoding and re-encoding ordinary calls. It must implement:

- ICE, DTLS-SRTP, RTP, and RTCP transport handling through a low-level WebRTC library.
- SSRC, sequence-number, timestamp, payload-type, and header-extension rewriting.
- Publisher/subscriber track routing and selective subscriptions.
- Simulcast first, with SVC considered after simulcast is stable.
- Receiver bandwidth estimation, congestion feedback, pacing, and layer selection.
- NACK handling, retransmission caches, PLI/FIR routing, keyframe requests, and audio-level forwarding.
- Transport-wide congestion-control feedback and per-subscriber quality decisions.
- Room placement, media-node draining, inter-node cascading, and failure recovery.

Recommended implementation split:

- **FastAPI/Python control plane:** room APIs, anonymous sessions, signaling coordination, persistence, placement, and operations.
- **Custom media node:** Rust is preferred for memory safety and predictable performance; Go is acceptable if the team has stronger Go experience. Use low-level WebRTC/RTP libraries, not a prebuilt SFU.
- **`aiortc` validation service:** retained as a reference implementation and test harness for early milestones, not the final high-scale forwarding path.

## 3. Production architecture

```text
Web/mobile clients
        |
        | HTTPS / WebSocket / WebRTC
        v
Global load balancer / ingress
        |
        +---------------------> Python control plane (FastAPI)
        |                         - anonymous room/session APIs
        |                         - room and meeting APIs
        |                         - internal SFU session credentials
        |                         - lifecycle webhooks
        |                                  |
        |                            PostgreSQL + Redis
        |
        +---------------------> SFU media-node pool
                                  - RTP packet forwarding
                                  - simulcast/SVC selection
                                  - bandwidth estimation
                                  - active-speaker detection
                                  - selective subscriptions
                                         |
                                     coturn pool
                                         |
                              restricted/corporate networks

Recording/egress workers <----- SFU media-node pool -----> Object storage
Metrics, logs and traces <------ all production services
```

### Control plane

Use FastAPI for room APIs, anonymous participant/session identifiers, internal SFU connection credentials, webhook processing, and meeting metadata. Do not require login, accounts, roles, or authorization in the current phase. Do not store live peer connections or authoritative real-time media state in PostgreSQL.

### Media plane

The SFU cluster handles encrypted WebRTC transport, RTP forwarding, simulcast/SVC selection, congestion control, retransmission, active-speaker detection, selective subscriptions, and media-node health. Small rooms may stay on one media node. Large rooms must be able to span nodes through supported cascading/distributed-SFU topology, with room placement and inter-node routing designed from the start and enabled when a room outgrows one node.

### Data layer

- **PostgreSQL:** rooms, anonymous participant sessions, call history, recordings, and lifecycle events.
- **Redis:** ephemeral presence, rate limits, distributed locks, coordination, and cache.
- **Object storage:** recordings, thumbnails, exports, and generated artifacts.

## 4. Large-room media policy

A large room must not subscribe every participant to every video.

- Show approximately 9-25 video tiles, depending on device and layout.
- Prioritize pinned users, screen shares, and active speakers.
- Pause off-screen video subscriptions.
- Use three simulcast layers initially, such as 180p, 360p, and 720p.
- Use low layers for grids and a high layer only for focused video.
- Limit simultaneous screen shares.
- Provide webinar mode with a small speaker set and many receive-only attendees.
- Apply dynamic publisher and subscription safety policies based on layout, client capability, and available infrastructure; do not expose a fixed participant ceiling in product code.

## 5. Recommended technology stack

| Layer | Choice |
|---|---|
| Web client | React + TypeScript |
| Media SFU | Custom packet-forwarding SFU in Rust (preferred) or Go |
| WebRTC foundation | Low-level WebRTC/RTP libraries; no ready-made SFU |
| Application API | Python FastAPI |
| Realtime app events | WebSockets, Redis-backed when horizontally scaled |
| TURN/STUN | Redundant coturn instances |
| Primary database | PostgreSQL |
| Ephemeral state | Redis |
| Recordings | Dedicated egress workers + S3-compatible object storage |
| Deployment | Kubernetes or an operated VM/container cluster |
| Observability | Prometheus, Grafana, OpenTelemetry, centralized logs, error tracking |
| Infrastructure | Terraform and automated CI/CD |

## 6. Repository structure

```text
video-conf-app/
|-- apps/
|   |-- web/                         # React/TypeScript meeting client
|   `-- admin/                       # deferred operations UI
|-- services/
|   |-- api/                         # FastAPI control plane
|   |   `-- videoconf/
|   |       |-- meetings/
|   |       |-- rooms/
|   |       |-- sessions/
|   |       |-- webhooks/
|   |       `-- db/
|   |-- realtime/                    # optional app-event service
|   |-- media-node/                  # custom packet-level SFU
|   |   |-- transport/               # ICE, DTLS-SRTP, RTP/RTCP
|   |   |-- router/                  # publishers, subscribers, forwarding
|   |   |-- congestion/              # feedback, pacing, bandwidth estimate
|   |   |-- retransmission/          # packet cache, NACK, PLI/FIR
|   |   |-- layers/                  # simulcast/SVC selection
|   |   `-- cluster/                 # placement, cascading, drain/recovery
|   |-- aiortc-lab/                  # early validation/reference path
|   `-- workers/                     # notifications and post-processing
|-- infra/
|   |-- kubernetes/
|   |-- terraform/
|   |-- coturn/
|   |-- monitoring/
|   `-- local-compose.yml
|-- load-tests/
|   |-- signaling/
|   `-- synthetic-media/
|-- docs/
|   |-- architecture.md
|   |-- capacity-model.md
|   |-- security.md
|   `-- runbooks/
`-- README.md
```

## 7. Delivery roadmap

### Phase 0 - Capacity model

Define expected publisher ratios, visible video subscriptions, resolutions, frame rates, regions, browser/mobile support, recording requirements, and service-level objectives. Create bandwidth and CPU budgets for successively larger load tiers. Capacity must be demonstrated by media load tests, not inferred from socket counts.

### Phase 1 - Production foundation

- Create the FastAPI control plane and React client.
- Deploy PostgreSQL and Redis with migrations and backups.
- Establish the control protocol between FastAPI and the custom media node, using anonymous session credentials; these are transport credentials, not user authentication.
- Deploy TLS, secure WebSockets, and at least two coturn instances with time-limited credentials.
- Add structured logs, metrics, traces, dashboards, and alerts.

**Exit criteria:** repeatable deployment, anonymous room joins, and observable 1:1 calls across different networks.

### Phase 2 - Core group meetings

- Camera, microphone, device selection, and screen sharing.
- Participant roster, presence, and active-speaker layouts.
- Reliable join, leave, refresh, reconnect, sleep, and network-change behavior.
- Basic participant controls; host moderation, room locking, and role permissions are deferred with authorization.
- Simulcast and adaptive subscriptions.

**Exit criteria:** stable 25-person rooms under controlled media load and failure tests.

### Phase 3 - Large-room behavior

- Visibility- and priority-based selective subscriptions.
- Large-room and webinar layouts without privileged roles in the current phase.
- Dynamic publisher/subscription policies and adaptive media allocation.
- Virtualized participant UI.
- Resource-aware admission and placement that can add or select capacity instead of enforcing a fixed product participant count.
- Client CPU and bandwidth protection.

**Exit criteria:** synthetic-media tests at 100 participants and successively larger tiers, plus representative real-device testing, with acceptable packet loss, join latency, CPU, memory, and bandwidth.

### Phase 4 - High availability

- Multiple API replicas behind an ingress.
- Multiple SFU nodes with room-aware placement.
- Health-based removal of unhealthy nodes.
- Graceful deployment and drain procedures.
- Database backup and restore drills.
- TURN redundancy and regional routing.
- Incident alerts, dashboards, and runbooks.

Do not promise transparent recovery after media-node failure unless explicitly engineered and tested. The initial production behavior should be rapid client reconnection to a healthy node.

### Phase 5 - Recording and compliance

- Dedicated recording workers isolated from interactive media nodes.
- Object-storage lifecycle and encryption policies.
- Consent indicators and access controls.
- Audit, retention, deletion, and export workflows.
- Privacy and regional data-handling review.

### Phase 6 - Launch validation

- Multi-hour soak tests.
- Join-storm and reconnect-storm tests.
- Packet-loss, latency, jitter, and TURN-only tests.
- Browser and device compatibility tests.
- Failure injection for API, Redis, database, TURN, and media nodes.
- Security review, rate-limit testing, and dependency scanning.
- Staged launch with capacity headroom and rollback procedures.

## 8. Capacity and reliability measurements

Track:

- Join success rate and time to first media.
- Participants and publishers per media node.
- Inbound and outbound bitrate per node and room.
- Packet loss, jitter, RTT, NACK, PLI, and retransmissions.
- Client freezes, audio concealment, and quality limitation reason.
- CPU, memory, network saturation, event-loop lag, and file descriptors.
- TURN allocation success and relayed traffic percentage.
- Reconnect rate and recovery duration.

Maintain measured capacity headroom. Never schedule a node to its benchmark maximum; stop placing new rooms on it before saturation.

## 9. Current security baseline

- TLS for all public endpoints and secure WebSockets.
- Anonymous, short-lived room sessions with unguessable identifiers.
- Short-lived SFU connection credentials generated by the backend; these do not represent authenticated user identity.
- Time-limited TURN credentials; never expose permanent TURN secrets.
- Rate limits for room creation, anonymous joins, chat, and signaling.
- Strict input validation and message-size limits.
- Secrets stored outside source control.
- Encryption at rest for databases, backups, and recordings.
- Lifecycle and security events for operational diagnosis.
- Dependency and container scanning, patching, and incident procedures.

WebRTC media is encrypted in transit, but an SFU terminates and forwards media transports. Do not claim end-to-end encryption unless an additional application-level E2EE design is implemented and tested.

## 10. Testing strategy

Use three layers:

1. **Protocol and application tests:** APIs, anonymous sessions, SFU credential issuance, webhooks, and reconnect state machines.
2. **Synthetic-media tests:** many real WebRTC peer connections publishing deterministic audio/video. WebSocket-only tests are insufficient.
3. **Real-device tests:** representative browsers, operating systems, cameras, weak CPUs, and constrained networks.

Every scale-test result must record the SFU version, node type, region, codec, participant and publisher counts, subscriptions per client, simulcast layers, TURN percentage, and quality measurements. Participant count alone is not a capacity result.

## 11. Production definition of done

- Rooms pass documented media load and soak tests at every declared operating tier, beginning at 100 participants and expanding without a hard-coded application ceiling.
- Selective subscriptions keep client and server resources within limits.
- Cross-network calls work through redundant TURN servers.
- Anonymous session validation, rate limiting, transport security, and basic abuse controls are server-enforced.
- Metrics, alerts, traces, logs, dashboards, and runbooks are operational.
- Backup restoration has been tested.
- Node failure and deployment behavior are rehearsed.
- Security and privacy reviews are complete.
- The deployment retains measured capacity headroom.

## 12. Suggested implementation starting point

Build one production vertical slice:

1. The React client obtains an anonymous room session and temporary media connection credentials from FastAPI.
2. The browser joins a room on our custom media node.
3. Two users publish audio/video and recover from refresh or a network transition.
4. FastAPI receives and verifies SFU lifecycle webhooks.
5. Metrics expose join time, connection state, packet loss, bitrate, and TURN usage.
6. A synthetic WebRTC client exercises the same deployment.

Increase validated capacity in stages: 2, 10, 25, 50, 100, 250, 500, and higher tiers required by demand. These are validation checkpoints, not product limits. Defer recording, virtual backgrounds, and other expensive features until the large-room media policy and elastic capacity model are proven.

## 13. Incremental build sequence

Use the following sequence to build and validate the core WebRTC behavior before scaling the production media plane.

### Step 1 - Scaffold the application

- Scaffold the FastAPI backend with health checks, configuration, structured logging, tests, and versioned API routes.
- Scaffold a simple React + TypeScript frontend with device preview, meeting join, and call views.
- Add local development configuration for the frontend, API, PostgreSQL, Redis, and coturn.
- Establish CI checks for formatting, linting, type checking, unit tests, and production builds.

### Step 2 - Build and test 1:1 peer-to-peer calling

- Add an anonymous WebSocket signaling endpoint using an unguessable, short-lived session identifier.
- Exchange SDP offers, SDP answers, and ICE candidates between exactly two browsers.
- Keep audio and video peer-to-peer; the FastAPI service handles signaling only.
- Test camera and microphone permissions, mute controls, device changes, disconnects, refreshes, and calls across different networks.
- Verify direct and TURN-relayed paths with browser WebRTC diagnostics.

**Exit criteria:** two anonymous browser sessions can reliably see and hear each other and recover from ordinary disconnects.

### Step 3 - Prove browser-to-`aiortc` media ingest

- Create an isolated development endpoint where one browser sends audio and video to an `aiortc.RTCPeerConnection`.
- Record connection state, codec selection, inbound bitrate, frame counts, packet loss, and cleanup behavior.
- Ensure peer connections and tracks are closed when the browser leaves or signaling expires.
- Keep this endpoint as the reference path while the custom packet-forwarding media node is developed.

**Exit criteria:** the server consistently receives and measures real audio/video from one browser without leaked tracks or peer connections.

### Step 4 - Relay one participant to a second participant

- Subscribe to the first participant's incoming tracks with `aiortc.MediaRelay`.
- Attach relay proxy tracks to a second browser's server-side peer connection.
- Handle audio and video independently and preserve participant/track identity in signaling.
- Test normal leave, abrupt disconnect, browser refresh, and repeated joins.

**Exit criteria:** a second browser receives the first participant's audio/video through the development relay, with deterministic cleanup.

### Step 5 - Add a room manager and three-person calls

- Add a `RoomManager` responsible for rooms, participants, peer connections, published tracks, subscriptions, and lifecycle locks.
- Use stable participant and track identifiers rather than array positions or display names.
- Support three participants publishing and receiving audio/video.
- Make room mutations idempotent so duplicate messages and reconnects do not corrupt state.
- Use configurable development safety guards to protect local machines; never turn them into a fixed production participant limit.

**Exit criteria:** three browsers can repeatedly join, communicate, and leave without stale participants, duplicate tracks, or leaked resources.

### Step 6 - Implement reliable join/leave renegotiation

- Serialize negotiation per peer connection with an asynchronous lock and negotiation revision number.
- Use the perfect-negotiation pattern with explicit polite/impolite roles to prevent offer glare.
- Correlate each offer and answer with transaction and participant identifiers.
- Queue or coalesce changes while negotiation is in progress.
- Ignore stale answers and ICE candidates from earlier connection generations.
- Prefer transceiver reuse and direction changes over repeatedly creating new transceivers.
- Remove subscriptions and close tracks deterministically when a participant leaves.
- Add integration tests for simultaneous joins, simultaneous leaves, refreshes, duplicate events, slow answers, and network interruption.

**Exit criteria:** repeated join/leave stress tests converge to the correct room state without negotiation deadlocks or ghost tracks.

### Step 7 - Add production infrastructure

- Deploy redundant coturn servers using time-limited credentials.
- Keep the current release anonymous. Generate only the temporary connection credentials required to join the SFU and TURN services.
- Persist rooms, anonymous sessions, call history, recording metadata, and lifecycle events in PostgreSQL.
- Use Redis for presence, rate limiting, coordination, and ephemeral state.
- Containerize the services and provide development, staging, and production deployment definitions.
- Add TLS, secret management, database migrations, backups, restore tests, monitoring, alerts, and runbooks.
- Integrate the custom packet-forwarding media node and migrate group-call traffic from the development `aiortc` relay after transport, routing, congestion control, and recovery tests pass.

**Exit criteria:** the complete anonymous call flow runs in staging across real networks and is observable and recoverable.

### Step 8 - Add advanced features only after core stability

Add these features only after the core calling, lifecycle, security, and operational acceptance tests pass:

1. Screen sharing with explicit permissions, one or a small number of simultaneous shares, and subscription priority.
2. Recording through isolated egress workers, with consent, encryption, access control, retention, and deletion policies.
3. Horizontal scaling using room-aware SFU placement, admission control, load tests, capacity headroom, and regional routing.
4. Optional features such as chat persistence, hand raising, reactions, captions, background effects, and analytics.

The `aiortc` milestones provide controlled evidence that the team understands WebRTC ingest, relay, lifecycle, and renegotiation. The production path is our own benchmark-validated packet-forwarding SFU. It must not replace the `aiortc` reference path until automated interoperability, media-quality, failure, soak, and capacity tests pass.

## 14. Custom SFU engineering roadmap

Develop the production media node behind a versioned control interface so the frontend and FastAPI APIs do not depend on its internal implementation.

### Milestone A - One publisher, one subscriber

- Complete ICE and DTLS-SRTP negotiation with real browsers.
- Receive encoded RTP and forward it without decoding.
- Forward essential RTCP and request keyframes when a subscriber joins.
- Rewrite packet identifiers correctly for the subscriber stream.
- Prove audio/video interoperability in supported browsers.

### Milestone B - Room router

- Model transports, producers, consumers, tracks, encodings, and subscriptions.
- Route multiple publishers to multiple selective subscribers.
- Add deterministic teardown, idempotent commands, and bounded queues.
- Isolate rooms so one overloaded room cannot block unrelated rooms.

### Milestone C - Loss recovery and congestion control

- Maintain bounded retransmission caches and service NACK requests.
- Route PLI/FIR feedback and prevent keyframe-request storms.
- Process transport-wide congestion feedback and receiver reports.
- Pace outgoing packets and select a safe target bitrate per subscriber.
- Add metrics for packet loss, RTT, jitter, retransmissions, and dropped packets.

### Milestone D - Simulcast and adaptive subscriptions

- Accept and identify multiple publisher encodings.
- Select spatial layers using tile visibility, target bitrate, and client capability.
- Switch layers on keyframe boundaries without corrupting decoder state.
- Pause invisible video while keeping audio and control state alive.
- Prioritize screen sharing and pinned video.

### Milestone E - Node operations and elastic rooms

- Add room-aware node placement and capacity scoring.
- Drain nodes without placing new rooms on them.
- Implement cascading so a large room can span multiple media nodes.
- Bound inter-node fan-out and avoid routing duplicate encodings unnecessarily.
- Define fast reconnect behavior for node failure.
- Validate rolling deployment, partial network failure, and regional routing.

### Milestone F - Production qualification

- Run WebRTC protocol interoperability tests against every supported browser.
- Fuzz signaling, RTP, RTCP, and control-message parsers.
- Run packet-loss, reordering, duplication, jitter, and bandwidth-change tests.
- Run multi-hour soak, join-storm, reconnect-storm, and cascading-room tests.
- Compare quality and resource metrics against defined service objectives.
- Release progressively only after each load tier has operational headroom.

The custom SFU must never decode and re-encode normal forwarded camera/audio streams. Transcoding belongs in isolated recording or compatibility workers because putting it in the forwarding path would sharply reduce capacity and increase latency.
