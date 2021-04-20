FROM python:alpine3.12

RUN apk add --no-cache restic && restic self-update

RUN apk add --update --no-cache --virtual .tmp git \
    && pip install git+https://github.com/gallofeliz/python-gallocloud-utils \
    && apk del .tmp

RUN pip install flatten-dict watchdog rpyc click tabulate

WORKDIR /app

ADD app.py restic.py fnqueue.py watcher.py client.py tasks.py ./

RUN chmod +x client.py && ln -s /app/client.py /bin/client

CMD python -u ./app.py
