FROM python:3.12-alpine

# configuration
ENV REPOSITORY=https://github.com/pbelmans/hyperkaehler-info.git

# install
RUN pip install Flask gunicorn pyyaml pybtex
RUN apk update \
  && apk add git  \
  && git clone $REPOSITORY website \
  && apk del git

# setup
WORKDIR /website
EXPOSE 80

COPY static/style.css static/style.css

# run
CMD exec gunicorn --bind :80 --workers 2 --threads 8 --timeout 0 --access-logfile=- application:app
