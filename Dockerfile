FROM node:12-alpine

COPY package.json \
     yarn.lock \
     /app/

WORKDIR /app

RUN yarn
COPY . /app/
RUN yarn build

ENV PORT 80

EXPOSE 80
CMD ["yarn", "start"]
