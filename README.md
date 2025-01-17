# copy-npm-package

A utility to copy packages from one NPM server to another.

Inspired by the now unmaintained [npm-copy](https://github.com/goodeggs/npm-copy) package. It finds all of the published versions on the `from` repository, and publish them on the `to` repository.  It's that easy.

## Usage

The example should explain things. We accept either token auth or username/password auth.

```
npx copy-npm-package --from https://old.npm.mycorp.com --from-token foo --to https://new.npm.mycorp.com --to-username bob --to-password secret --package="@myorg/my-special-package"
```
