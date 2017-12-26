# a-javascript-and-typescript-documentation-generator-based-on-typescript-compiler
:construction: A documentation generator for JavaScript/TypeScript projects, based on TypeScript compiler, lol.

**This is under construction!**

I am looking for a documentation generator tool that works for me.
I haven’t found one yet, so I am creating one, using the minimal amount of code possible.

## Overview

1. Input is a list of public modules. Usually **index.js**.

2. TypeScript compiler tries to compile the module, resolving types and stuff.

3. Look at the **exported symbols** and generate the docs just for them.


## Data model

- Documentation contains modules.

- Module exports symbols.

- Each symbol contains a type.

- A type may refer to other symbols. e.g. `(a: A) => B` refers to types A and B.
