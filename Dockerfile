FROM python:alpine

RUN apk add --no-cache restic && restic self-update

RUN apk add --update --no-cache --virtual .tmp git \
    && echo 2 \
    && pip install git+https://github.com/gallofeliz/python-gallocloud-utils \
    && apk del .tmp

RUN pip install flatten-dict

WORKDIR /app

ADD app.py .

ENV RESTIC_CACHE_DIR=/tmp

CMD python -u ./app.py
