import * as should from 'should';
import * as TestUtil from "../test-util/test-util";
import { RackInfo } from "../test-util/rack-info";
import * as ReadNodeHandler from "../../src/nodes/read-node";
import * as ConfigHandler from "../../src/nodes/config-node";
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as Promise from 'bluebird';
import * as http from 'http';
import { ResponseErrorMessages, StatusCodeMessages, handleErrorResponse } from '../../src/util/error-handling';


describe('Error Handling', function () {

    // Make sure that the handlers are ready to go.
    ReadNodeHandler.setRED(TestUtil.RED);
    ConfigHandler.setRED(TestUtil.RED);

    describe('ResponseErrorMessages', function () {

        it('returns a generic message for an empty error', function () {
            var errorMsg = ResponseErrorMessages.getErrorMsg(1);
            should(errorMsg).match({
                nodeShortErrorMsg: 'Error',
                logLongErrorMsg: 'Error'
            });
        });

        it('returns a generic message for an unknown error code', function () {
            var errorMsg = ResponseErrorMessages.getErrorMsg({ code: 1 });
            should(errorMsg).match({
                nodeShortErrorMsg: 1,
                logLongErrorMsg: 'Error code: 1'
            });
        });

        it('returns a proper message for an known error code', function () {
            var errorMsg = ResponseErrorMessages.getErrorMsg({ code: 'ETIMEDOUT' });
            should(errorMsg).match({
                nodeShortErrorMsg: 'Timeout',
                logLongErrorMsg: 'Timeout. Error code: ETIMEDOUT'
            });
        });

        it('returns a proper message for an given reason', function () {
            var errorMsg = ResponseErrorMessages.getErrorMsg({ reason: 'the reason' });
            should(errorMsg).match({
                nodeShortErrorMsg: 'the reason',
                logLongErrorMsg: 'Error: the reason'
            });
        });

        it('returns a proper message for an known error code with a syscall detail', function () {
            var errorMsg = ResponseErrorMessages.getErrorMsg({ code: 'ETIMEDOUT', syscall: 'some_sys_call' });
            should(errorMsg).match({
                nodeShortErrorMsg: 'Timeout',
                logLongErrorMsg: 'Timeout. Error code: ETIMEDOUT from system call "some_sys_call"'
            });
        });

    });


    describe('StatusCodeMessages', function () {

        it('returns a generic message for an empty error', function () {
            var errorMsg = ResponseErrorMessages.getErrorMsg(1);
            should(errorMsg).match({
                nodeShortErrorMsg: 'Error',
                logLongErrorMsg: 'Error'
            });
        });

        it('returns a message for an unknown status code', function () {
            var errorMsg = StatusCodeMessages.getErrorMsg('499');
            should(errorMsg).match({
                nodeShortErrorMsg: 'Status code 499',
                logLongErrorMsg: 'Status code 499. HTTP response error : 499'
            });
        });

        it('returns a message for a known status code', function () {
            var errorMsg = StatusCodeMessages.getErrorMsg('400');
            should(errorMsg).match({
                nodeShortErrorMsg: 'Bad request',
                logLongErrorMsg: 'Bad request. HTTP response error : 400'
            });
        });
    });

    describe('handleErrorResponse()', function () {


        it("a real-world error (invalid API key) sets the node's status and response error", function (done) {

            // Using a Read node, attempt to use a device with an incorrect
            // API Key. An error will be returned and the node should have its
            // status and error set.

            // Device setup
            var deviceConfig = TestUtil.createDeviceConfig();
            deviceConfig.credentials.apiKey = "ha ha, this isn't an API key";
            TestUtil.RED.nodes.addCredentials('deviceId0', deviceConfig.credentials);

            var deviceConfigNode = TestUtil.createDeviceConfigNode(deviceConfig);
            ConfigHandler.createDeviceNode.call(deviceConfigNode, deviceConfig);

            // Create a Read node.
            var node = TestUtil.createNewFullReadNode(deviceConfig.id,
                {
                    dataType: 'channel-digital',
                    moduleIndex: RackInfo.di.index.toString(),
                    channelIndex: '6'
                },
                (msg: any) => {
                    assert.fail(); // should never get here.
                },
                (errorText: string, nodeMsg: any) => {
                    // Check that the error was sent to the node.

                    should(errorSpy.firstCall.args[0]).be.oneOf([
                        'Bad API key or server error. HTTP response error : 500', // Auth v1
                        'Bad API key. HTTP response error : 401' // Auth v2
                    ]);


                    // Confirm the REQUEST error
                    should(errorSpy.firstCall.args[1].resError.statusCode).be.oneOf([401, 500]);
                    should(errorSpy.firstCall.args[1].resError.body).be.a.type('string');

                    // Check that the node's status was set.
                    should(node.getStatus()).be.oneOf([
                        {
                            fill: "red",
                            shape: "dot",
                            text: 'Bad API key or server error' // Yes, the Auth v1 service is returning a 500, not a 401.
                        },
                        {
                            fill: "red",
                            shape: "dot",
                            text: 'Bad API key'
                        }]);

                    errorSpy.restore();
                    statusSpy.restore();
                    done();
                });

            // Attach some spies to the node.
            var errorSpy = sinon.spy(node, 'error');
            var statusSpy = sinon.spy(node, 'status');

            // Send a msg to the Read node.
            TestUtil.injectTimestampMsg(node);
        });

        it("a real-world error (no IP) sets the node's status and request error", function (done) {

            // Using a Read node, attempt to use a device with an incorrect
            // API Key. An error will be returned and the node should have its
            // status and error set.

            // Device setup
            var deviceConfig = TestUtil.createDeviceConfig('999.999.999.999');
            TestUtil.RED.nodes.addCredentials('deviceId0', deviceConfig.credentials);

            var deviceConfigNode = TestUtil.createDeviceConfigNode(deviceConfig);
            ConfigHandler.createDeviceNode.call(deviceConfigNode, deviceConfig);

            // Create a Read node.
            var node = TestUtil.createNewFullReadNode(deviceConfig.id,
                {
                    dataType: 'channel-digital',
                    moduleIndex: RackInfo.di.index.toString(),
                    channelIndex: '6'
                },
                (msg: any) => {
                    assert.fail(); // should never get here.
                },
                (errorText: string, nodeMsg: any) => {
                    // Check that the error was sent to the node.
                    should(errorSpy.firstCall.args[0]).be.eql('Address not found. Error code: ENOTFOUND from system call "getaddrinfo"');

                    // Confirm the REQUEST error
                    should(errorSpy.firstCall.args[1].reqError).be.match({
                        "code": "ENOTFOUND",
                        "errno": "ENOTFOUND",
                        "syscall": "getaddrinfo",
                        "hostname": "999.999.999.999",
                        "host": "999.999.999.999",
                        "port": 443,
                        "message": "getaddrinfo ENOTFOUND 999.999.999.999 999.999.999.999:443"
                    });

                    // Check that the node's status was set.
                    should(node.getStatus()).match({
                        fill: "red",
                        shape: "dot",
                        text: 'Address not found' // Yes, the Auth service is returning a 500, not a 403.
                    });

                    errorSpy.restore();
                    statusSpy.restore();
                    done();
                });

            // Attach some spies to the node.
            var errorSpy = sinon.spy(node, 'error');
            var statusSpy = sinon.spy(node, 'status');

            // Send a msg to the Read node.
            TestUtil.injectTimestampMsg(node);
        });

    });
});