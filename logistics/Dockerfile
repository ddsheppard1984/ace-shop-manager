FROM python:3.12-alpine
WORKDIR /app
COPY server.py /app/server.py
COPY static /app/static
RUN addgroup -S ace && adduser -S -G ace ace && mkdir -p /app/data && chown -R ace:ace /app
USER ace
ENV PYTHONUNBUFFERED=1 ACE_DATA_DIR=/app/data ACE_HOST=0.0.0.0 ACE_PORT=8086
EXPOSE 8086
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8086/healthz',timeout=3)"
CMD ["python","/app/server.py"]
