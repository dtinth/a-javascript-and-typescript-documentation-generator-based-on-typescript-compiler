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



## Process

```
                `ts.createProgram()`
                        |
+-------------------+   |   +--------------------+
|    Input files    | ----> | TypeScript program |
| (.js, .ts, .d.ts) |       |   (`ts.Program`)   |
+-------------------+       +--------------------+
                                | walk the modules and symbols
                                V
     +-----------------------------------------+
     | Documentation model (JSON-serializable) |
     +-----------------------------------------+
         | generate             | export
         V                      V
     +-------------------+   +---------------+
     | Web pages (.html) |   | Model (.json) |
     +-------------------+   +---------------+
```

  - Input files are fed into TypeScript compilers, which will resolve all
    modules, infer types, and lots of super-cool stuff.
    It results in a **ts.Program** object.

  - a-javascript-and-typescript-documentation-generator-based-on-typescript-compiler
    goes through the modules, and collect documentation data, into a JSON-serializable model.

  - Then we can generate a web page / readme file / whatever out of it!


## Usage / Development

This thing is still in development.

1.  Clone this project.

2.  Install the dependencies:

    ```
    yarn
    ```

3.  To generate a documentation JSON:

    ```
    ./node_modules/.bin/ts-node src/generator/cli.ts test/fixture/index.ts
    #                            |                    |
    #                           CLI                  Input file
    ```
