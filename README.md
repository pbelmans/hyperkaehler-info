# Hyperkaehler.info

The code behind [Hyperkaehler.info](https://hyperkaehler.info)

## Docker instructions

It seems getting `sass` to work in a minimal Alpine image is hard.
Therefore, the following builds the CSS externally and then copies it over.

```
sass assets/style.scss static/style.css
docker build --tag "hyperkaehler" .

docker run -p 8888:80 -it hyperkaehler
```

For my own purposes:

```
docker build --platform linux/amd64 -t pbelmans/hyperkaehler .

docker login
docker push pbelmans/hyperkaehler
```
