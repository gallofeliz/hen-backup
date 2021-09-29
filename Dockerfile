FROM node:alpine3.12

RUN apk add --no-cache restic tzdata && restic self-update

WORKDIR /app

ADD package.json package-lock.json ./

RUN npm i

ADD src tsconfig.json ./

RUN node_modules/.bin/tsc

USER nobody

CMD node dist
