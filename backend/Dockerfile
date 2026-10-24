FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=5

WORKDIR /app

COPY requirements.txt /tmp/requirements.txt
# Build the source-only Paytm package with preinstalled tools. Keep its version
# aligned with requirements.txt; other packages retain build isolation.
RUN python -m pip install --no-cache-dir "setuptools>=70,<81" wheel \
    && python -m pip wheel --no-cache-dir --no-build-isolation --no-deps \
        --wheel-dir /tmp/paytm-wheels paytmchecksum==1.7.0 \
    && python -m pip install --no-cache-dir --find-links=/tmp/paytm-wheels -r /tmp/requirements.txt \
    && python -c "from paytmchecksum import PaytmChecksum; assert callable(PaytmChecksum.generateSignature)"

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn bhcc.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout 120"]
