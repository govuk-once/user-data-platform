@udp @consumer-config
Feature: Consumer Config Api Access
    As and external consumer
    I want to retrieve my API configuration from Secrets manager
    And use those credentials to authentivate and access the API

    Background:
        Given the consumer consfig secret is available

    Scenario: consumer config secret contains all required fields
        Then the consumer config should contain "privateLinkServiceName"
        And the consumer config should contain "region"
        And the consumer config should contain "apiAccountId"
        And the consumer config should contain "availabilityZones"
        And the consumer config should contain "cognitoTokenEndpoint"
        And the consumer config should contain "cognitoUserPoolId"
        And the consumer config should contain "cognitoClientId"

    Scenario: Consumer can authenticate using config credentials
        When I authenticate using the consumer config credentials
        Then I should recieve a valid access token

    Scenario: Consumer can access the API using config credentials
        When I authenticate using the consumer config credentials
        And I send a get to '/identity/test-consumer-access' using consumer credentials
        then the response status should be 404
        # 404 is expected - user doesnt exist 