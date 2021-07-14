FROM python:3.8-alpine3.12

RUN apk add --no-cache restic && restic self-update

RUN pip install flatten-dict rpyc click tabulate requests retrying glom

RUN apk add --update --no-cache --virtual .tmp git \
    && echo 12 \
    && pip install git+https://github.com/gallofeliz/python-gallocloud-utils \
    && apk del .tmp

WORKDIR /app

ADD main.py daemon.py restic.py client.py treenodes.py ./

RUN chmod +x client.py && ln -s /app/client.py /bin/client

CMD python -u ./main.py
