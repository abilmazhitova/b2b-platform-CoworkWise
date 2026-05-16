FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Минимум пакетов из apt (меньше трафика = реже падает на нестабильной сети).
# geopandas/shapely/pyproj обычно ставятся из готовых wheels без libgdal в образе.
RUN set -eux; \
    printf '%s\n' \
      'Acquire::Retries "10";' \
      'Acquire::http::Timeout "120";' \
      'Acquire::https::Timeout "120";' \
      > /etc/apt/apt.conf.d/99docker-retry; \
    n=0; \
    until apt-get update; do \
      n=$((n + 1)); \
      if [ "$n" -ge 6 ]; then echo "apt-get update failed after $n attempts"; exit 1; fi; \
      echo "apt-get update retry $n/5 in 15s..."; \
      sleep 15; \
    done; \
    apt-get install -y --no-install-recommends postgresql-client; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY docker-entrypoint.b2b.sh /usr/local/bin/docker-entrypoint-b2b.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint-b2b.sh && chmod +x /usr/local/bin/docker-entrypoint-b2b.sh

COPY . .

EXPOSE 8000

ENTRYPOINT ["/bin/sh", "/usr/local/bin/docker-entrypoint-b2b.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
