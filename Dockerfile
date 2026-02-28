FROM python:3.12-alpine

# configuration
ENV REPOSITORY=https://github.com/pbelmans/hyperkaehler-info.git

# install
RUN pip install Flask gunicorn pyyaml pybtex \
  && apk add --no-cache git nodejs npm \
  && npm install -g sass \
  && git clone $REPOSITORY /website

# setup
WORKDIR /website
EXPOSE 80

RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'cd /website' \
  'branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed "s#^origin/##")' \
  'if [ -z "$branch" ]; then branch=main; fi' \
  'git fetch --prune origin' \
  'git reset --hard "origin/$branch"' \
  'git clean -fd' \
  'sass --no-source-map assets/style.scss static/style.css' \
  'exec gunicorn --bind :80 --workers 2 --threads 8 --timeout 0 --access-logfile=- application:app' \
  > /usr/local/bin/start.sh \
  && chmod +x /usr/local/bin/start.sh

# run
CMD ["/usr/local/bin/start.sh"]
