FROM python:alpine

RUN apk add --no-cache restic && restic self-update

RUN pip install croniter python-json-logger

WORKDIR /app

ADD app.py .

ENV RESTIC_CACHE_DIR=/tmp

CMD python -u ./app.py
