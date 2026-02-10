@udp @kms
Feature: KMS Key Rotation
    As a platform operator
    I want to verify data survives KMS Key RotationSo that i can be confident key rotation does not cause data loss


    Background:
        Given i am authenticated

    Scenario: Data remains accessible after KMS key rotation
        # Store data
        When I send a post to `/user' with the body '{ "appId": "kms-test-user", "serviceName": "kms-rotation-test" }
        Then I should recieve a successful response
        When I send a post to '/vi/topics' with the body '{"data": {"rotation": "test-data"}}'
        Then I should recieve a successful response

        # Read data before rotation
        When I send a get to '/v1/topic'
        Then I should recieve a  successful response
        Then The response body contain body '{"data": {"rotation": "test-data"}}'

        # Rotate the KMS Key
        When I rotate the KMS encryption key
        Then the key rotation should succeed

        # Read data after rotation
        When I send a get to '/v1/topic'
        Then I should recieve a  successful response
        Then The response body contain body '{"data": {"rotation": "test-data"}}'

        # cleanup
        When I send a delete to '/v1/topics'
        Then I should recieve a successful response
        When I send a delete to '/identity/kms-rotation-test/kms-test-user'
        Then I should recieve a successful response
