# minits

a simple and small CI server.

## setting up

put a file `ci.json` in a directory with the server files containing access tokens (can be anything) for each user, the port, and maximum payload size.

```json
{
    "maxZipballMiB": 50,
    "port": 8080,
    "tokens": {
        "token2": "kiera",
        "token1": "kamila"
    }
}
```

then use `npm run start` to launch the server. it'd be beneficial if the server used HTTPS, but modifying the code to support that is left as an exercise to the reader.

## using minits

currently only a cli frontend is supported; it's not finished just yet (only spews out json responses). example configuration (to put in minits.json file in the root directory of your project):

```json
{
    "server": "http://localhost:8080",
    "key": "token1"
}
```

then, create `config.json` in the directory with unit tests (named `test` or `tests`; it's possible to override it):

```json
{
    "fast_fail": true,
    "jobs": [
        "job1",
        "job2",
        "job3",
        "job4"
    ]
}
```

The jobs will be ran in parallel and once one of them fails, the rest will be stopped.

## not production ready.
