## User Data Platform

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