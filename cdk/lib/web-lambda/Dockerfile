FROM public.ecr.aws/lambda/nodejs:20

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /var/task

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY build ./build

ENV PORT=8080
ENV AWS_LWA_PORT=8080

ENTRYPOINT ["node", "build/index.js"]
