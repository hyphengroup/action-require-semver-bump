# Action Require Semver Bump

Require Semantic Versioning Bump of head compared to PR base.

## Sample usage

```
name: Check PR
on: [ pull_request, push ]
jobs:
  require-semver-bump:
    runs-on: ubuntu-20.04
    steps:
      - uses: hyphengroup/action-require-semver-bump@v3
        with:
          # must include capture group for actual version value
          version-regex-pattern: 'version: (.+)'
          version-file-path: 'hyphen-service/Chart.yaml'
```
