## User Data Platform

# Running tests use the following commands
To test the get data lambda the command: nx run @src/getDataLambda:test 
To test the post data lambda the command: nx run @src/postDataLambda:test 

# Running a local build
To build the get data lambda the command: nx run @src/getDataLambda:build 
To build the post data lambda the command: nx run @src/postDataLambda:build 

# Running the e2e Tests
command: nx run @test/e2e:deploy-and-test will deploy the code to aws and run the feature tests against it
command: nx run @test/e2e:e2e will run the tests against currently deployed code.

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
| e2e
    | src
        | features
        | helpers
        | step-definitions

./build
    getDatalambda.js

.checkov
.semgrep
.prettier
    
.pre-commit

```