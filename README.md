# Action Require Semver Bump


## Sample usage

```
name: Check PR

on: [push]

jobs:
  check-version:
    runs-on: ubuntu-20.04
    steps:
      - uses: hyphengroup/action-require-semver-bump@v3
        with:
          version-regex-pattern: >
            version: (.+)
          version-file-path: 'hyphen-service/Chart.yaml'
```
