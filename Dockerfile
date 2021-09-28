FROM python:3.8-alpine3.12

RUN apk add --no-cache restic && restic self-update

RUN pip install flatten-dict tabulate requests retrying glom json-rpc

RUN apk add --update --no-cache --virtual .tmp git \
    && echo 12 \
    && pip install git+https://github.com/gallofeliz/python-gallocloud-utils \
    && apk del .tmp

RUN apk add --no-cache tzdata

WORKDIR /app

ADD main.py daemon.py restic.py treenodes.py http_handler.py ./

USER nobody

CMD python -u ./main.py
