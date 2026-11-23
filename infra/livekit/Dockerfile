# SPDX-License-Identifier: AGPL-3.0-only
# LiveKit server 1.13.11 with one fix (ADR 0013): `audio.enable_loss_proxying`
# exists in the configuration but is never applied to the receive buffers, so
# a listener's packet loss never reaches the speaker and Opus in-band FEC stays
# off. Remove this image once LiveKit ships the fix.
FROM golang:1.27.3-alpine3.24@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS builder
ARG LIVEKIT_VERSION=v1.13.11
ENV GOTOOLCHAIN=local
RUN apk add --no-cache git
WORKDIR /workspace
RUN git clone --depth 1 --branch ${LIVEKIT_VERSION} https://github.com/livekit/livekit.git .
COPY wire-audio-loss-proxying.patch /tmp/
RUN git apply /tmp/wire-audio-loss-proxying.patch && go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o livekit-server ./cmd/server

FROM alpine:3.24.3@sha256:c6b073f8e9e58d881f6ffba6ebf3b9ebd60b9e7d6e8337018c0e68bb5c356873
RUN apk upgrade --no-cache
COPY --from=builder /workspace/livekit-server /livekit-server
ENTRYPOINT ["/livekit-server"]
