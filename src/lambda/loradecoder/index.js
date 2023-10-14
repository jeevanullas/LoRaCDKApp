// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// Permission is hereby granted, free of charge, to any person obtaining a copy of this
// software and associated documentation files (the "Software"), to deal in the Software
// without restriction, including without limitation the rights to use, copy, modify,
// merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// Set default parametersv
var DECODER_PATH = "/var/task/decoders/";
const DECODER_SUFFUX = ".js";

/* The handler of this Lambda function will derive the name of the file with a binary decoder
by adding ".js" to the value of input parameter event.PayloadDecoderName (e.g. "/opt/node/mydecoder.js" 
for "event.PayloadDecoderName==mydecoder" ).

Please note, that the whole file (e.g. "/opt/node/mydecoder.js") will be evaluated in the context of this function.

Two measures will be taken to restrict values of allowed binary decoder files:
1. Regex check (enabled by default) 
2. Whitelisting(disabled by default , recommended to enable for non-prototyping usage)*/
const ALLOWED_DECODER_NAME_REGEX = /^[A-Za-z\_01-9]+$/;
const ENABLE_DECODER_NAME_WHITELIST = false;
const ALLOWED_DECODER_NAME_WHITELIST = ["rak4630"];


// Read command line parameters. You can provide parameter "local" to override path for decoder libraries,
// as specified below
var command_line_args = process.argv.slice(2);

// Allow to override decoder path to run local tests
if (command_line_args.length == 1 && command_line_args[0] == "local") {
    DECODER_PATH = "/var/task/decoders/";
}

// Global variable to cache decoder functions
global.decoders = new Map();

// Function to dynamically load decoders
var fs = require('fs');
var vm = require('vm');
var includeInThisContext = function (path) {
    var code = fs.readFileSync(path);
    vm.runInThisContext(code, path);
}.bind(this);

exports.handler = async function (event, context) {
    /* Transforms a binary payload by invoking "decode_{event.type}" function
            Parameters 
            ----------
            event.PayloadData : str (obligatory parameter)
                Base64 encoded input payload
    
            event.PayloadDecoderName : string (obligatory parameter)
                The value of this attribute defines the name of a a Javasceript file which will be used to perform binary decoding. If value of "PayloadDecoderName" is for example "sample_device", then this function will evaluate file "sample_device.js" and perform an invocation of "decodeUplink" function from this file. 
                
                A prerequisite for this is that the file sample_device.js is stored in the path specified by
                DECODER_PATH. Per default we assume that sample_device.js will be stored in an AWS Lambda layer, so that it accessible via /opt/node
    
            event.WirelessMetadata.LoRaWAN.FPort : int (obligatory parameter)
                LoRaWAN FPort 
    
    
            Returns
            -------
            This function returns a JSON object with the following keys:
    
            - status: 200 or 500
            - decoder_name: value of input parameter event.PayloadDecoderName
            - transformed_payload: result of  "decodeUpLink().data" invocation  (only if status == 200)
            - error_message                                                     (only if status == 500)
    
    */


    console.log('## EVENT: ' + JSON.stringify(event));

    // Read input parameters
    var input_base64 = event.PayloadData;
    var payload_decoder_name = event.PayloadDecoderName;
    var fport = event.WirelessMetadata.LoRaWAN.FPort;
    var result; 
    // Check if decoder name mathes the regex
    if (!payload_decoder_name.match(ALLOWED_DECODER_NAME_REGEX)) {
        result = {
            "status": 500,
            "errorMessage": "Name of decoder " + payload_decoder_name + " does not match the regex in the variable ALLOWED_DECODER_NAME_REGEX",
            "decoder_name": payload_decoder_name
        };
        return result;
    }

    // Check if decoder name matches the whitelist (disabled by default , recommended to enable for non-prototyping usage)
    if (ENABLE_DECODER_NAME_WHITELIST && (ALLOWED_DECODER_NAME_WHITELIST.indexOf(payload_decoder_name) == -1)) {
        result = {
            "status": 500,
            "errorMessage": "Name of decoder " + payload_decoder_name + " does not match the list in the variable ALLOWED_DECODER_NAME_WHITELIST",
            "decoder_name": payload_decoder_name
        };
        return result;
    }


    // Logging
    console.log("Decoding payload " + input_base64 + " with fport " + fport + " using decoder " + payload_decoder_name);


    // Convert base64 payload into bytes
    let bytes = Uint8Array.from(Buffer.from(input_base64, 'base64'));

    try {

        // Cache the decoder function if not done yet
        if (!global.decoders.has(payload_decoder_name)) {
            includeInThisContext(DECODER_PATH + payload_decoder_name + DECODER_SUFFUX);
            global.decoders.set(payload_decoder_name, decodeUplink);
        }

        // Execute the decoder
        var decoded = (global.decoders.get(payload_decoder_name))({
            "fPort": fport,
            "bytes": bytes
        })

        console.log("Decoded payload is " + JSON.stringify(decoded));

        // Check if decoder has returned any errors
        if (decoded.hasOwnProperty("errors")) {
            console.log("Error decoding :" + decoded.errors);
            throw ("Error decoding:" + decoded.errors);
        }

        result = decoded.data;
        result.status = 200;
        result.decoder_name = payload_decoder_name;
        console.log("Returning result " + JSON.stringify(result));
        return result;
    } catch (e) {
        // Perform exception handling
        console.log(e);

        result = {
            "status": 500,
            "errorMessage": e,
            "decoder_name": payload_decoder_name
        };
        return result;


    }

}