## User Data Platform

# Running tests use the following commands
To test the get data lambda the command: nx run @src/getDataLambda:test 
To test the post data lambda the command: nx run @src/postDataLambda:test 

# Running a local build
To build the get data lambda the command: nx run @src/getDataLambda:build 
To build the post data lambda the command: nx run @src/postDataLambda:build 

# Folder Structure
```
| .github
    | deploy.yaml
| libs
    | middleware-utils
        |...ts
        |...unit.test.ts
    | test-utils
        | ...ts
| modules
    | Auth
        |main.tf
        |...tf
        |project.json
    | Data Stores
        |main.tf
        |project.json
    | Api
| src
    | getDataLambda
        handler.ts
        handler.unit.test.ts
    | postDataLambda
        handler.ts
| integration-test
    | BDD
        |...ts

./build
    getDatalambda.js

.checkov
.semgrep
.prettier
    
.pre-commit

```