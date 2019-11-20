import * as NodeHandlers from "../src/nodes/base-node";
import * as ConfigHandler from "../src/nodes/config-node";
import * as ApiLib from "../src/swagger/lib/api";
import * as assert from 'assert';
import * as should from 'should';
import * as async from 'async';
import * as TestUtil from "./test-util/test-util";
import { RackInfo } from "./test-util/rack-info";
import * as InputNodeHandler from "../src/nodes/input-node";
import { MockGroovInputNode } from "./test-util/mock-groov-io-nodes";
import { ClientTestUtil } from "./test-util/client-test-util";

var TestSettings = require('./settings.json');


var showLogs = false;
function log(msg: string) {
    if (showLogs)
        console.log(msg);
}

class AsyncIoTestHelper {
    public msgCount = 0;
    public inputNodeImpl: InputNodeHandler.InputNodeImpl;
    public inputNode: MockGroovInputNode;

    constructor(
        public deviceConfig: ConfigHandler.DeviceConfiguration,
        public inModuleIndex: number,
        public outModuleIndex: number,
        public channelIndex: number,
        public nodeDataType: string) {
    }

    resetDigitalChannelPair = (done: (err: any) => void) => {
        log('resetDigitalChannelPair');
        // Turn output off and clear input flags
        TestUtil.resetDigitalChannelPair(this.inModuleIndex, this.outModuleIndex,
            this.channelIndex, done);
    }

    resetAnalogChannelPair = (done: (err: any) => void) => {
        log('resetAnalogChannelPair');
        // Turn output off and clear input flags
        TestUtil.resetAnalogChannelPair(this.inModuleIndex, this.outModuleIndex,
            this.channelIndex, done);
    }

    setAnalogValue = (value: number, done: (err: any) => void) => {
        log('setAnalogValue, value=' + value);
        TestUtil.setAnalogOutput(this.outModuleIndex, this.channelIndex, value, done);
    }

    turnDigitalOn = (done: (err: any) => void) => {
        log('turnDigitalOn');
        // Turn output on
        TestUtil.setDigitalOutput(this.outModuleIndex, this.channelIndex, true, done);
    }

    turnDigitalOff = (done: (err: any) => void) => {
        log('turnDigitalOff');
        // Turn output off
        TestUtil.setDigitalOutput(this.outModuleIndex, this.channelIndex, false, done);
    }

    public msgCallback = (done: () => void) => {
        // start empty
        process.nextTick(done);
    };

    setMsgCallback(msgCallback: (msg: any) => void) {
        // Replace the callback
        this.msgCallback = msgCallback;
    } clearDigital

    forceScan = (next: () => void) => {
        log('forceScan');
        this.inputNodeImpl.onScan();
        setTimeout(next, 100); // Wait a moment before continuing
    }

    createInputNode = (useScannerTimer: boolean, done: (err: any) => void) => {
        log('createInputNode');
        var nodeAndImpl = TestUtil.createFullInputNode(this.deviceConfig.id,
            {
                dataType: this.nodeDataType,
                moduleIndex: this.inModuleIndex.toString(),
                channelIndex: this.channelIndex.toString(),
                scanTimeSec: useScannerTimer ? '0.25' : '-1'
            },
            // Wrap the callback so that the test can replace it as needed.
            (msg: any) => {
                log('new msg, payload=' + msg.payload);
                this.msgCount++;
                this.msgCallback(msg);
            });

        this.inputNode = nodeAndImpl.node;
        this.inputNodeImpl = nodeAndImpl.nodeImpl;

        process.nextTick(done);
    }

    closeNode = () => {
        log('closeNode');
        this.inputNode.close();
    }


    setAssertForNextMsg_DigitalChannelRead(expected: Partial<ApiLib.DigitalChannelRead>,
        expectedPayload: any,
        expectedMsgCount: number, done?: () => void) {

        log('setAssertForNextMsg_DigitalChannelRead');

        this.setMsgCallback((actualMsg: any) => {
            TestUtil.assertDigitalChannelRead(actualMsg, expected, expectedPayload);
            should(actualMsg.inputType).be.eql(this.nodeDataType);
            should(this.msgCount).be.eql(expectedMsgCount);

            if (done) {
                this.inputNode.onClose();
                done();
            }
        });
    }

    setAssertForNextMsg_AnalogChannelRead(expected: Partial<ApiLib.AnalogChannelRead>,
        expectedMsgCount: number, done?: () => void) {

        log('setAssertForNextMsg_AnalogChannelRead');

        this.setMsgCallback((actualMsg: any) => {

            log('setAssertForNextMsg_AnalogChannelRead, actualMsg=' + JSON.stringify(actualMsg, undefined, 2));

            TestUtil.assertAnalogChannelRead(actualMsg, expected);
            should(actualMsg.inputType).be.eql(this.nodeDataType);
            should(this.msgCount).be.eql(expectedMsgCount);

            if (done) {
                this.inputNode.onClose();
                done();
            }
        });
    }
}


describe('Groov I/O Input Nodes', function () {

    let deviceConfigNode: ConfigHandler.DeviceConfiguration;

    before(function (beforeDone: MochaDone) {
        ClientTestUtil.init(
            (error: any, clientInfo?: { publicCertFile: Buffer, sharedApiClient: ApiLib.DefaultApi }) => {
                if (error)
                    assert.fail(error.toString());
                else {
                    var deviceConfig = TestUtil.createDeviceConfig();;
                    deviceConfigNode = TestUtil.createDeviceConfigNode(deviceConfig);

                    ConfigHandler.globalConnections.createConnection(deviceConfig.address,
                        deviceConfig.credentials.apiKey,
                        ClientTestUtil.publicCertFile,
                        ClientTestUtil.caCertFile,
                        'REJECT_NEW',
                        deviceConfig.id);

                    InputNodeHandler.setRED(TestUtil.RED);
                    ConfigHandler.setRED(TestUtil.RED);

                    beforeDone();
                }
            });
    });

    describe('Defaults', function () {

        it('uses sensible defaults for invalid user input', function (testDone) {
            var inputNodeAndImpl = TestUtil.createFullInputNode(deviceConfigNode.id, {
                moduleIndex: 'not a number',
                channelIndex: 'not a number',
                mmpLength: 'not a number'
            }, (msg) => {
            });

            var inputNodeImpl = inputNodeAndImpl.nodeImpl;
            should(inputNodeImpl).property('moduleIndex').be.eql(0);
            should(inputNodeImpl).property('channelIndex').be.eql(0);
            should(inputNodeImpl).property('mmpLength').be.eql(1);
            testDone();
        });
    });

    describe('Timer for scanner', function () {

        it('timer drives the scanner', function (testDone) {

            // Use digital channels to test the scanner's timer.

            this.timeout(15000);
            var asyncTestHelper = new AsyncIoTestHelper(deviceConfigNode, RackInfo.di.index,
                RackInfo.do.index, 7, 'channel-digital-state');

            async.series([
                // Set out to Off and reset input values
                (next: () => void) => { asyncTestHelper.resetDigitalChannelPair(next) },
                // Create the node
                (next: () => void) => { asyncTestHelper.createInputNode(true, next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: true,
                        onLatchState: true
                    },
                        true, // payload
                        1);
                    process.nextTick(next);
                },
                // Wait for the Input node to start up.
                (next: () => void) => { setTimeout(next, 500); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Wait for the Input node to process the new value.
                (next: () => void) => { setTimeout(next, 500); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead(
                        {
                            state: false,
                            onLatchState: true,
                            offLatchState: true
                        },
                        false, // payload
                        2,
                        () => {
                            asyncTestHelper.closeNode();
                            testDone();
                        }
                    );
                    process.nextTick(next);
                },
                // Wait for the Input node to scan
                (next: () => void) => { setTimeout(next, 500); },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) }
            ], (err?: Error) => {
                should(err).be.null();
            });
        });
    });

    describe('Digital Channels', function () {

        it('sends message when digital state changes', function (testDone) {
            this.timeout(10000);
            var asyncTestHelper = new AsyncIoTestHelper(deviceConfigNode, RackInfo.di.index,
                RackInfo.do.index, 7, 'channel-digital-state');

            async.series([
                // Set out to Off and reset input values
                (next: () => void) => { asyncTestHelper.resetDigitalChannelPair(next) },
                // Create the node
                (next: () => void) => { asyncTestHelper.createInputNode(false, next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: true,
                        onLatchState: true
                    },
                        true,
                        1);
                    process.nextTick(next);
                },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: false,
                        onLatchState: true,
                        offLatchState: true
                    },
                        false,
                        2,
                        testDone);
                    process.nextTick(next);
                },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
            ], (err?: Error) => {
                asyncTestHelper.closeNode();
                should(err).be.null();
            });
        });

        it('sends message for rising edge', function (testDone) {
            this.timeout(10000);
            var asyncTestHelper = new AsyncIoTestHelper(deviceConfigNode, RackInfo.di.index,
                RackInfo.do.index, 7, 'channel-digital-turn-on');

            async.series([
                // Set out to Off and reset input values
                (next: () => void) => { asyncTestHelper.resetDigitalChannelPair(next) },
                // Create the node
                (next: () => void) => { asyncTestHelper.createInputNode(false, next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: true,
                        onLatchState: true
                    }, true, 1);
                    process.nextTick(next);
                },
                // Force a scan (to capture the initial value)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan (for which we don't expect a message)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: true,
                        onLatchState: true,
                        offLatchState: true
                    }, true, 2, testDone);
                    process.nextTick(next);
                },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
            ], (err?: Error) => {
                asyncTestHelper.closeNode();
                should(err).be.null();
            });
        });

        it('sends message for falling edge', function (testDone) {
            this.timeout(10000);
            var asyncTestHelper = new AsyncIoTestHelper(deviceConfigNode, RackInfo.di.index,
                RackInfo.do.index, 7, 'channel-digital-turn-off');

            async.series([
                // Set out to Off and reset input values
                (next: () => void) => { asyncTestHelper.resetDigitalChannelPair(next) },
                // Create the node
                (next: () => void) => { asyncTestHelper.createInputNode(false, next); },
                // Force a scan (to capture the initial value)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan (for which we don't expect a message)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: false,
                        onLatchState: true,
                        offLatchState: true
                    }, false, 1);
                    process.nextTick(next);
                },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan (for which we don't expect a message)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: false,
                        onLatchState: true,
                        offLatchState: true
                    }, false, 2, testDone);
                    process.nextTick(next);
                },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
            ], (err?: Error) => {
                asyncTestHelper.closeNode();
                should(err).be.null();
            });
        });

        it('sends message when digital On Latch changes', function (testDone) {
            this.timeout(7000);
            const channelIndex = 7;
            var asyncTestHelper = new AsyncIoTestHelper(deviceConfigNode, RackInfo.di.index,
                RackInfo.do.index, channelIndex, 'channel-digital-on-latch');

            async.series([
                // Set out to Off and reset input values
                (next: () => void) => { asyncTestHelper.resetDigitalChannelPair(next) },
                // Create the node
                (next: () => void) => { asyncTestHelper.createInputNode(false, next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: true,
                        onLatchState: true
                    }, true, 1);
                    process.nextTick(next);
                },
                // Force a scan (to capture the initial state)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan (to see the point is now on and latched)
                // ASSERT: The above assert will get called and check the message.
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead(
                        {
                            state: true,
                            onLatchState: true,
                            offLatchState: true
                        },
                        true, // expected payload
                        2, // 2nd msg
                        () => {
                            asyncTestHelper.closeNode();
                            testDone();// Test is finally all done.
                        }
                    );
                    process.nextTick(next);
                },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan (the on-latch is still set, so no msg will be sent)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan (the on-latch is still set, so no msg will be sent)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan (the on-latch is still set, so no msg will be sent)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Clear the On-Latch
                (next: () => void) => { TestUtil.clearDigital(RackInfo.di.index, channelIndex, true, false, false, next); },
                // Force a scan (now the on-latch is cleared, which will be captured. No msg will be sent.)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan (on-latch is set again.)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
            ],
                (err?: Error) => {

                    should(err).be.null();
                });
        });

        it('sends message when digital Off Latch changes', function (testDone) {
            this.timeout(7000);
            const channelIndex = 6;
            var asyncTestHelper = new AsyncIoTestHelper(deviceConfigNode, RackInfo.di.index,
                RackInfo.do.index, channelIndex, 'channel-digital-off-latch');

            async.series([
                // Set out to Off and reset input values
                (next: () => void) => { asyncTestHelper.resetDigitalChannelPair(next) },
                // Create the node
                (next: () => void) => { asyncTestHelper.createInputNode(false, next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead({
                        state: false,
                        onLatchState: true,
                        offLatchState: true
                    },
                        true, // expected payload
                        1);
                    process.nextTick(next);
                },
                // Force a scan (to capture the initial state)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan (to see the point is now off and latched)
                // ASSERT: The above assert will get called and check the message.
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_DigitalChannelRead(
                        {
                            state: false,
                            offLatchState: true
                        },
                        true, // expected payload
                        2, // 2nd msg
                        () => {
                            asyncTestHelper.closeNode();
                            testDone();// Test is finally all done.
                        }
                    );
                    process.nextTick(next);
                },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan (the off-latch is still set, so no msg will be sent)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan (the off-latch is still set, so no msg will be sent)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn on the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOn(next) },
                // Force a scan (the off-latch is still set, so no msg will be sent)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Clear the On-Latch and Off-Latch
                (next: () => void) => { TestUtil.clearDigital(RackInfo.di.index, channelIndex, true, true, false, next); },
                // Force a scan (now both latches are cleared, which will be captured. No msg will be sent.)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Turn off the output 
                (next: () => void) => { asyncTestHelper.turnDigitalOff(next) },
                // Force a scan (just the off-latch is set again.)
                (next: () => void) => { asyncTestHelper.forceScan(next); },
            ],
                (err?: Error) => {
                    asyncTestHelper.closeNode();
                    should(err).be.null();
                });
        });
    });


    describe('Analog Channels', function () {

        it('sends message when analog value changes', function (testDone) {
            this.timeout(8000);

            var testValue = 6.75;
            var asyncTestHelper = new AsyncIoTestHelper(deviceConfigNode, RackInfo.ai.index,
                RackInfo.ao.index, 5, 'channel-analog');

            async.series([
                // Set output to 0 and reset input values
                (next: () => void) => { asyncTestHelper.resetAnalogChannelPair(next) },
                // Create the node
                (next: () => void) => { asyncTestHelper.createInputNode(false, next); },
                // Force a scan (to capture the initial state).
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_AnalogChannelRead({
                        value: testValue
                    }, 1, testDone);
                    process.nextTick(next);
                },
                // Set the output's value
                (next: () => void) => { asyncTestHelper.setAnalogValue(testValue, next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
            ], (err?: Error) => {
                should(err).be.null();
            });
        });

        it('sends messages and tracks min and max value changes.', function (testDone) {
            this.timeout(10000);

            var testValue1 = 5.25;
            var testValue2 = -1.75;
            var asyncTestHelper = new AsyncIoTestHelper(deviceConfigNode, RackInfo.ai.index,
                RackInfo.ao.index, 5, 'channel-analog');

            async.series([
                // Set output to 0 and reset input values
                (next: () => void) => { asyncTestHelper.resetAnalogChannelPair(next) },
                // Create the node
                (next: () => void) => { asyncTestHelper.createInputNode(false, next); },
                // Force a scan (to capture the initial state).
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_AnalogChannelRead({
                        value: testValue1
                    }, 1);
                    process.nextTick(next);
                },
                // Set the output's value
                (next: () => void) => { asyncTestHelper.setAnalogValue(testValue1, next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
                // Register the assert for the expected next message.
                (next: () => void) => {
                    asyncTestHelper.setAssertForNextMsg_AnalogChannelRead({
                        value: testValue2,
                        minValue: testValue2,
                        maxValue: testValue1
                    }, 2, testDone);
                    process.nextTick(next);
                },
                // Set the output's value
                (next: () => void) => { asyncTestHelper.setAnalogValue(testValue2, next) },
                // Force a scan
                (next: () => void) => { asyncTestHelper.forceScan(next); },
            ], (err?: Error) => {
                should(err).be.null();
            });
        });

    });
});