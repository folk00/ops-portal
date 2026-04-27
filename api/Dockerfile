# syntax=docker/dockerfile:1.7
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY api /app/api
COPY scripts /app/scripts

RUN --mount=type=secret,id=ai_token,target=/run/secrets/ai_token,required=false \
    if [ -s /run/secrets/ai_token ]; then \
      cp /run/secrets/ai_token /app/api/.ai_gateway_token && \
      chmod 0444 /app/api/.ai_gateway_token; \
    fi

RUN chmod +x /app/api/docker-entrypoint.sh

EXPOSE 8010

CMD ["/app/api/docker-entrypoint.sh"]
