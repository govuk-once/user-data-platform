@udp
Feature: Consumer Config Api Access
    As and external consumer
    I want to retrieve my API configuration from Secrets manager
    And use those credentials to authenticate and access the API

    Background:
        Given the consumer secret is available

    Scenario: consumer config secret contains all required fields
        Then the consumer config should contain "privateLinkServiceName"
        And the consumer config should contain "region"
        And the consumer config should contain "apiAccountId"
        And the consumer config should contain "availabilityZones"
        And the consumer config should contain "consumerRoleArn"

    Scenario: Consumer can access the API using config credentials
        When I create and API client using the consumer config credentials
        And I send a get to '/identity/test-consumer-access' using consumer credentials
        Then the response status should be 404
        # 404 is expected - user doesnt exist
