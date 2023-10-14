const lambda = require('./index')

test_definition = [
    {
        "description": "Test 1",
        "input": "AwI=",
        "fport": 1,
        "PayloadDecoderName": "sample_device",
        "expected_status": 200,
        "expected_output": {
            "direction": "W",
            "speed": 2

        }
    },
    {
        "description": "Test 2",
        "input": "AwI=",
        "fport": 1,
        "PayloadDecoderName": "sample_device",
        "expected_status": 200,
        "expected_output": {
            "direction": "W",
            "speed": 2

        }
    },
    {
        "description": "Test 3",
        "input": "AwI=",
        "fport": 1,
        "PayloadDecoderName": "../sample_device",
        "expected_status": 500,
        "expected_error_message": "Name of decoder ../sample_device does not match the regex in the variable ALLOWED_DECODER_NAME_REGEX"
    },

    {
        "description": "Test 4",
        "input": "AwI=",
        "fport": 1,
        "PayloadDecoderName": "*sample_device",
        "expected_status": 500,
        "expected_error_message": "Name of decoder *sample_device does not match the regex in the variable ALLOWED_DECODER_NAME_REGEX"
    }


]


for (var i = 0; i < test_definition.length; i++) {

    test_event = {
        "PayloadData": test_definition[i].input,
        "WirelessDeviceId": "57728ff8-5d1d-4130-9de2-f004d8722bc2",
        "PayloadDecoderName": test_definition[i].PayloadDecoderName,
        "WirelessMetadata": {
            "LoRaWAN": {
                "DataRate": 0,
                "DevEui": "a84041d55182720b",
                "FPort": test_definition[i].fport,
                "Frequency": 867900000,
                "Gateways": [
                    {
                        "GatewayEui": "dca632fffe45b3c0",
                        "Rssi": -76,
                        "Snr": 9.75
                    }
                ],
                "Timestamp": "2020-12-07T14:41:48Z"
            }
        }
    }

    console.log(test_event)
    console.log("Running test " + test_definition[i].description)

    async function app(test_definition, i) {

        var actual_output = await lambda.handler(test_event, {})

        // console.log("Binary decoding output=" + JSON.stringify(actual_output, null, " "))
        console.log("---------" + test_definition[i].description + "--------------------------")
        if (actual_output.status != test_definition[i].expected_status) {
            throw ("ERROR: status " + actual_output.status + " received, but " + test_definition[i].expected_status + " expected")
        } else {
            console.log("OK: status code " + actual_output.status)
        }

        if (actual_output.status != 200) {
            if (actual_output.errorMessage != test_definition[i].expected_error_message) {
                throw ("ERROR: error message '" + actual_output.errorMessage + "' received, but '" + test_definition[i].expected_error_message + "' expected")
            } else {
                console.log("OK: error message  " + actual_output.errorMessage)
            }
        }

        for (var key in test_definition[i].expected_output) {
            if (test_definition[i].expected_output[key] == null) {
                console.log("ERROR: attribute " + key + " is undefined in test definition")
                throw "ERROR: attribute " + key + " is undefined in test definition";
            }
            if (test_definition[i].expected_output[key] == actual_output[key]) {
                console.log("OK: attribute " + key + " has an expected value of " + actual_output[key])
            } else {
                console.log("ERROR: for attribute " + key + ": expected " + test_definition[i].expected_output[key] + " but received " + actual_output[key] + ". Dump of actual output:" + JSON.stringify(actual_output) + ", dump of expected output: " + JSON.stringify(test_definition[i].expected_output))
            }

        }
    }


    app(test_definition, i)


}



