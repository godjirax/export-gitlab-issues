# Export gitlab issues

You need to have envs vars with:

Example:
```
export FROM_DOMAIN=https://my.gitlab.fr
export FROM_PROJECT_ID=113
export FROM_TOKEN=XXXXXX
export FROM_PROJECT_NAME=my-workspace/my-project

export TO_PROJECT_ID=5555
export TO_DOMAIN=https://gitlab.com
export TO_TOKEN=ZZZZZ
```

## Usage

Just launch:

```
node index.js
```
