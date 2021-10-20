FROM node:alpine3.12

RUN apk add --no-cache restic tzdata && restic self-update

WORKDIR /app

ADD package.json package-lock.json ./

RUN npm i

RUN mkdir /var/cache/restic \
    && chmod 1777 /var/cache/restic

VOLUME /var/cache/restic

ADD src tsconfig.json ./

RUN node_modules/.bin/tsc

USER nobody

CMD node dist
