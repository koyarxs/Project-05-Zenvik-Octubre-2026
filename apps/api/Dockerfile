# syntax=docker/dockerfile:1
ARG PYTHON_IMAGE=python:3.13-alpine@sha256:6926a1245f1c4a6382607ebb4483e91f8cf1a84a323b69083f50b6d76b8663c7
FROM ${PYTHON_IMAGE} AS wheels
WORKDIR /build
COPY apps/api/requirements*.txt ./
RUN python -m pip wheel --no-cache-dir --only-binary=:all: -r requirements-production.txt -w /wheels

FROM ${PYTHON_IMAGE} AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_READ_DOTENV=False
RUN addgroup -g 10001 -S zenvik && adduser -u 10001 -S -G zenvik -H -s /sbin/nologin zenvik
WORKDIR /app/apps/api
COPY --from=wheels /wheels /wheels
COPY apps/api/requirements*.txt ./
RUN python -m pip install --no-cache-dir --no-index --find-links=/wheels -r requirements-production.txt && rm -rf /wheels
RUN python -m pip uninstall --yes pip setuptools wheel
COPY apps/api/ ./
COPY infra/gunicorn.conf.py /app/infra/gunicorn.conf.py
COPY infra/container_health.py /app/infra/container_health.py
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=6s --start-period=20s --retries=3 CMD ["python", "/app/infra/container_health.py"]
STOPSIGNAL SIGTERM
CMD ["gunicorn", "config.wsgi:application", "--config", "/app/infra/gunicorn.conf.py"]
