# a-javascript-and-typescript-documentation-generator-based-on-typescript-compiler
:construction: A documentation generator for JavaScript/TypeScript projects, based on TypeScript compiler, lol.

**This is under construction!**

I am looking for a documentation generator tool that works for me.
I haven’t found one yet, so I am creating one, using the minimal amount of code possible.


## Inspiration

  - Visual Studio Code’s JavaScript IntelliSense (based on TypeScript) is very smart.
    It is based on TypeScript’s Language Service.
    However, most current documentation tools don’t benefit from that smart-ness.

  - Most tools don’t infer type from source code and only reads the JSDoc tags.

  - Some tools requires you to specify types and documentation in a proprietary format,
    which is not compatible with the IntelliSense.

  - The thing I found closest to what I want is [TypeDoc](https://github.com/TypeStrong/typedoc).
    It does use TypeScript compiler,
    but processes modules by walking through the AST,
    instead of looking at all exported symbols of a module
    (e.g. using TypeScript’s `getExportsOfModule()`).

  - Many projects has an `index.js` file
    which only re-exports things from other modules
    (e.g. `export { createStore } from './createStore'`).
    However, [TypeDoc does not support it yet](https://github.com/TypeStrong/typedoc/issues/596).

  - I don’t want to document a file;
    I want to document my __module’s API surface area.__

    > Given that I import a module, what is there for me to use?

  - VS Code’s IntelliSense tries its best to understand your code and infer stuff,
    instead of forcing you to document everything in its own syntax.
    Documentation generator tools should do the same!

  - **The plan:** Learn how TypeScript Language Service achieves that smartness,
    then create a documentation generator (loosely) based on that knowledge.


## Overview

1. Input is a list of public modules. Usually **index.js**.

2. TypeScript compiler tries to compile the module, resolving types and stuff.

3. Look at the **exported symbols** and generate the docs just for them.


## Data model

- Documentation contains modules.

- Module exports symbols.

- A symbol is declared at some node.

- The symbol, together with the node that declared it, allows TypeScript compiler to infer the type.

- A type may refer to other symbols. e.g. `(a: A) => B` refers to types A and B.


## Development

To run the experiment,

```
./node_modules/.bin/ts-node ./experiment.ts
```

It tries to generate some stuff based on `test/fixture/index.js`.
