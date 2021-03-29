FROM python:alpine

RUN apk add --no-cache restic && restic self-update

RUN apk add --update --no-cache --virtual .tmp git \
    && echo 4 \
    && pip install git+https://github.com/gallofeliz/python-gallocloud-utils \
    && apk del .tmp

RUN pip install flatten-dict

WORKDIR /app

ADD app.py restic.py fnqueue.py ./

CMD python -u ./app.py
