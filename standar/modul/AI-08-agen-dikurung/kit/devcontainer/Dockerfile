# AI-08: kontainer kerja agen untuk repo klien.
# Image dipaku digest dan Claude Code dipaku versi, supaya build ulang tidak
# diam-diam menarik rilis yang belum lewat masa tunda (KEA-25, D7).
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da

ARG CLAUDE_CODE_VERSION=2.1.316

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl dnsutils git ipset iproute2 iptables jq less procps sudo \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
  && npm cache clean --force

COPY firewall.sh domain-izin.txt /usr/local/lib/ai08/
RUN chmod 0755 /usr/local/lib/ai08/firewall.sh \
  && chmod 0644 /usr/local/lib/ai08/domain-izin.txt \
  && echo "node ALL=(root) NOPASSWD: /usr/local/lib/ai08/firewall.sh" > /etc/sudoers.d/ai08-firewall \
  && chmod 0440 /etc/sudoers.d/ai08-firewall \
  && mkdir -p /workspace /home/node/.claude \
  && chown -R node:node /workspace /home/node/.claude

# Lalu lintas non-esensial (telemetri Datadog) dimatikan supaya allowlist
# firewall cukup berisi host yang benar-benar dibutuhkan.
ENV DEVCONTAINER=true \
    CLAUDE_CONFIG_DIR=/home/node/.claude \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

USER node
WORKDIR /workspace
