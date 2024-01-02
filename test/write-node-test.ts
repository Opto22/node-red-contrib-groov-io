import http = require('http');
import * as assert from 'assert';
import * as NodeHandlers from "../src/nodes/base-node";
import * as ConfigHandler from "../src/nodes/config-node";
import * as ApiLib from "../src/swagger/lib/api";
import * as should from 'should';
import * as async from 'async';
import * as TestUtil from "./test-util/test-util";
import { RackInfo } from "./test-util/rack-info";
import { WriteNodeImpl } from '../src/nodes/write-node';
import * as WriteNodeHandler from "../src/nodes/write-node";
import * as sinon from 'sinon';
import { ClientTestUtil } from './test-util/client-test-util';

var TestSettings = require('./settings.json');


describe('Groov I/O Write Nodes', function () {

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

                    WriteNodeHandler.setRED(TestUtil.RED);
                    ConfigHandler.setRED(TestUtil.RED);

                    beforeDone();
                }
            });

    });


    describe('General', function () {

        var channelIndex = 4;

        it('sets an error on the node if device is not set or unknown', function (done) {
            var node = TestUtil.createNewFullWriteNode('',
                TestUtil.getFullWriteNodeConfigFromPartial({}),
                (msg: any) => { },
                (errorText: string, nodeMessage: any) => { });
            var statusSpy = sinon.spy(node, 'status');
            node.input({ payload: 123 }); // send a msg to the node
            should(statusSpy.calledOnce).be.true();
            should(statusSpy.getCall(0).args[0]).match({ fill: 'red', shape: 'dot' });
            statusSpy.restore();
            done();
        });

        it('sets an error on the node if message has no value', function (done) {
            var node = TestUtil.createNewFullWriteNode('',
                TestUtil.getFullWriteNodeConfigFromPartial({}),
                (msg: any) => { },
                (errorText: string, nodeMessage: any) => { });
            var statusSpy = sinon.spy(node, 'status');
            node.input({}); // send a msg to the node without a value
            should(statusSpy.calledOnce).be.true();
            should(statusSpy.getCall(0).args[0]).match({ fill: 'red', shape: 'dot' });
            statusSpy.restore();
            done();
        });
    });

    describe('Digital Channel', function () {


        function testDigitalWrite(channelIndex: number,
            valueType: string,
            onMsgOrValueString: object | string,
            offMsgOrValueString: object | string,
            done: MochaDone
        ) {

            var channelIndex = 3;
            var onNodeConfig = {
                dataType: 'channel-digital',
                moduleIndex: RackInfo.do.index.toString(),
                channelIndex: channelIndex.toString(),
                valueType: valueType
            };
            var offNodeConfig = Object.assign({}, onNodeConfig); // clone it

            // Figure out how the OFF value will be set
            var offMsg = {};
            if (typeof offMsgOrValueString === 'object')
                offMsg = offMsgOrValueString;
            else if (typeof offMsgOrValueString === 'string')
                offNodeConfig['value'] = offMsgOrValueString;

            // Figure out how the ON value will be set
            var onMsg = {};
            if (typeof onMsgOrValueString === 'object')
                onMsg = onMsgOrValueString;
            else if (typeof onMsgOrValueString === 'string')
                onNodeConfig['value'] = onMsgOrValueString;

            async.series([
                // Use the client lib to turn ON the channel
                (next: (err?: Error) => void) => {
                    ClientTestUtil.sharedApiClient.setDigitalChannelState('local', RackInfo.do.index, channelIndex, { value: true }).then(
                        (fullfilledResponse: { response: http.ClientResponse; body: ApiLib.DigitalChannelRead; }) => {
                            next();
                        });
                },
                // Use the Write node to turn OFF the channel (probably is off already)
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, offNodeConfig,
                        offMsg, // the msg
                        (msg: any) => {
                            next();
                        });
                },
                // Read the state and test
                (next: (err?: Error) => void) => {
                    ClientTestUtil.sharedApiClient.getChannelDigitalStatus('local', RackInfo.do.index, channelIndex).then(
                        (fullfilledResponse: { response: http.ClientResponse; body: ApiLib.DigitalChannelRead; }) => {
                            should(fullfilledResponse.body.state).be.false();
                            next();
                        });
                },
                // Use the Write node to turn ON the channel (probably is off already)
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, onNodeConfig,
                        onMsg, // the msg
                        (msg: any) => {
                            next();
                        });
                },
                // Read the state and test
                (next: (err?: Error) => void) => {
                    ClientTestUtil.sharedApiClient.getChannelDigitalStatus('local', RackInfo.do.index, channelIndex).then(
                        (fullfilledResponse: { response: http.ClientResponse; body: ApiLib.DigitalChannelRead; }) => {
                            should(fullfilledResponse.body.state).be.true();
                            next();
                        },
                        done
                    );
                },
            ],
                done);

        }

        it('can turn a digital output on and off (booleans in msg.payload)', function (done) {
            testDigitalWrite(3, 'msg.payload',
                { payload: true },  // on msg
                { payload: false },  // off msg
                done);
        });

        it('can turn a digital output on and off (strings in msg.payload)', function (done) {
            testDigitalWrite(4, 'msg.payload',
                { payload: 'true' },  // on msg
                { payload: 'false' },  // off msg
                done);
        });

        it('can turn a digital output on and off (strings in msg.payload)', function (done) {
            testDigitalWrite(5, 'msg.payload',
                { payload: 'on' },  // on msg
                { payload: 'off' },  // off msg
                done);
        });

        it('can turn a digital output on and off (strings from UI)', function (done) {
            testDigitalWrite(6, 'value',
                'true',  // bare string
                'false',  // bare string
                done);
        });

        it('can turn a digital output on and off (strings from UI)', function (done) {
            testDigitalWrite(7, 'value',
                'on',  // bare string
                'off',  // bare string
                done);
        });

        it('can clear latch flags', function (done) {
            var channelIndex = 3;
            const nodeConfigClearOnLatch = {
                dataType: 'channel-clear-on-latch',
                moduleIndex: RackInfo.di.index.toString(),
                channelIndex: channelIndex.toString()
            };
            const nodeConfigClearOffLatch = {
                dataType: 'channel-clear-off-latch',
                moduleIndex: RackInfo.di.index.toString(),
                channelIndex: channelIndex.toString()
            };

            async.series([
                // Reset everything
                (next: () => void) => {
                    TestUtil.resetDigitalChannelPair(RackInfo.di.index, RackInfo.do.index, channelIndex, next);
                },
                // Turn ON
                (next: () => void) => {
                    TestUtil.setDigitalOutput(RackInfo.do.index, channelIndex, true, next);
                },
                // Turn OFF
                (next: () => void) => {
                    TestUtil.setDigitalOutput(RackInfo.do.index, channelIndex, false, next);
                },
                // Make sure everything's as expected before the real test.
                (next: () => void) => {
                    TestUtil.getDigitalInput(RackInfo.di.index, channelIndex,
                        (err: any, status?: ApiLib.DigitalChannelRead) => {
                            should(status.onLatchState).be.true();
                            should(status.offLatchState).be.true();
                            next();
                        });
                },
                // Use the Write node to turn ON the channel
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, nodeConfigClearOnLatch, { payload: 'anything' },
                        (msg: any) => {
                            next();
                        });
                },
                (next: () => void) => {
                    TestUtil.getDigitalInput(RackInfo.di.index, channelIndex,
                        (err: any, status?: ApiLib.DigitalChannelRead) => {
                            should(status.onLatchState).be.false(); // NOW IS FALSE
                            should(status.offLatchState).be.true();
                            next();
                        });
                },
                // Use the Write node to turn OFF the channel
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, nodeConfigClearOffLatch, { payload: 'anything' },
                        (msg: any) => {
                            next();
                        });
                },
                (next: () => void) => {
                    TestUtil.getDigitalInput(RackInfo.di.index, channelIndex,
                        (err: any, status?: ApiLib.DigitalChannelRead) => {
                            should(status.onLatchState).be.false();
                            should(status.offLatchState).be.false(); // NOW IS FALSE
                            next();
                        });
                },
            ],
                done);
        });
    });

    describe('Analog Channel', function () {

        it('can write a numeric value from "msg.payload"', function (done) {
            this.timeout(8000);
            var channelIndex = 3;
            const nodeConfig = {
                dataType: 'channel-analog',
                moduleIndex: RackInfo.ao.index.toString(),
                channelIndex: channelIndex.toString()
            };

            async.series([
                // Use the client lib to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.setAnalogOutput(RackInfo.ao.index, channelIndex, 0.0, next);
                },
                // Use the Write node to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, nodeConfig, { payload: 6.2 },
                        (msg: any) => {
                            next();
                        });
                },
                (next: () => void) => { setTimeout(next, 1000); },
                // Read the input and test
                (next: (err?: Error) => void) => {
                    TestUtil.getAnalogInput(RackInfo.ai.index, channelIndex, (err: any, value?: number) => {
                        if (err) { next(err); return; }
                        should(value).be.approximately(6.2, 0.2);
                        next();
                    });
                },
            ],
                done);
        });

        it('can write a string value from "msg.custom_property"', function (done) {
            this.timeout(8000);
            var channelIndex = 3;
            var testValue = 1.39;
            const nodeConfig = {
                dataType: 'channel-analog',
                moduleIndex: RackInfo.ao.index.toString(),
                channelIndex: channelIndex.toString(),
                value: 'custom_property',
                valueType: 'msg'
            };

            async.series([
                // Use the client lib to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.setAnalogOutput(RackInfo.ao.index, channelIndex, 0.0, next);
                },
                // Use the Write node to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, nodeConfig,
                        {
                            custom_property: testValue.toString() // use a string here
                        },
                        (msg: any) => {
                            next();
                        });
                },
                (next: () => void) => { setTimeout(next, 1000); },
                // Read the input and test
                (next: (err?: Error) => void) => {
                    TestUtil.getAnalogInput(RackInfo.ai.index, channelIndex, (err: any, value?: number) => {
                        if (err) { next(err); return; }
                        should(value).be.approximately(testValue, testValue * 0.05);
                        next();
                    });
                },
            ],
                done);
        });

        it('can write a value from a Value string (i.e. from the UI)', function (done) {
            this.timeout(8000);
            var channelIndex = 4;
            var testValue = 5.85;

            const nodeConfig = {
                dataType: 'channel-analog',
                moduleIndex: RackInfo.ao.index.toString(),
                channelIndex: channelIndex.toString(),
                valueType: 'value',
                value: testValue.toString()
            };

            async.series([
                // Use the client lib to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.setAnalogOutput(RackInfo.ao.index, channelIndex, 0.0, next);
                },
                // Use the Write node to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, nodeConfig,
                        {
                            payload: 6.2 /* not going to be used in this test */
                        },
                        (msg: any) => {
                            next();
                        });
                },
                (next: () => void) => { setTimeout(next, 1000); },
                // Read the input and test
                (next: (err?: Error) => void) => {
                    TestUtil.getAnalogInput(RackInfo.ai.index, channelIndex, (err: any, value?: number) => {
                        if (err) { next(err); return; }
                        should(value).be.approximately(testValue, testValue * 0.05);
                        next();
                    });
                },
            ],
                done);
        });

        it('can clear min and max values', function (done) {
            this.timeout(12000);
            var channelIndex = 3;
            const nodeConfig = {
                dataType: 'channel-clear-max-value',
                moduleIndex: RackInfo.ao.index.toString(),
                channelIndex: channelIndex.toString()
            };

            async.series([
                // Use the client lib to set value to 0
                (next: (err?: Error) => void) => {
                    TestUtil.setAnalogOutput(RackInfo.ao.index, channelIndex, 0.0, next);
                },
                // Use the client lib to set value to 10
                (next: (err?: Error) => void) => {
                    TestUtil.setAnalogOutput(RackInfo.ao.index, channelIndex, 10.0, next);
                },
                // Use the client lib to set value to 5
                (next: (err?: Error) => void) => {
                    TestUtil.setAnalogOutput(RackInfo.ao.index, channelIndex, 5.0, next);
                },
                // Use the Write node to Clear the Maximum value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id,
                        {
                            dataType: 'channel-clear-max-value',
                            moduleIndex: RackInfo.ai.index.toString(),
                            channelIndex: channelIndex.toString()
                        },
                        {
                            payload: 0 // doesn't matter
                        },
                        (msg: any) => {
                            next();
                        });
                },
                // Use the Write node to Clear the Minimum value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id,
                        {
                            dataType: 'channel-clear-min-value',
                            moduleIndex: RackInfo.ai.index.toString(),
                            channelIndex: channelIndex.toString()
                        },
                        {
                            payload: 0 // doesn't matter
                        },
                        (msg: any) => {
                            next();
                        });
                },
                (next: () => void) => { setTimeout(next, 500); },
                // Read the input and test
                (next: (err?: Error) => void) => {
                    TestUtil.getAnalogInput(RackInfo.ai.index, channelIndex,
                        (err: any, value?: number, fullModel?: ApiLib.AnalogChannelRead) => {
                            if (err) { next(err); return; }
                            should(value).be.approximately(5.0, 0.1);
                            should(fullModel.minValue).be.approximately(5.0, 0.3);
                            should(fullModel.maxValue).be.approximately(5.0, 0.3);
                            next();
                        });
                },
            ],
                done);
        });



    });

    describe('MMP Addresses', function () {

        it('Can write an INT32 value from msg.payload', function (done) {
            this.timeout(5000);
            var mmpAddress = '0xF0D81000';

            async.series([
                // Use the client lib to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.setMmpValue(mmpAddress, 0, 'int32', '', next);
                },
                // Use the Write node to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, {
                        dataType: 'mmp-address',
                        mmpAddress: mmpAddress,
                        mmpType: 'int32',
                        mmpLength: '1'
                    }, { payload: 654321 },
                        (msg: any) => {
                            next();
                        });
                },
                (next: (err?: Error) => void) => {
                    TestUtil.getMmpValue(mmpAddress, 'int32', undefined, undefined, (err: any, value?: number) => {
                        if (err) { next(err); return; }
                        should(value).be.eql(654321);
                        next();
                    });
                },
            ],
                done);
        });

        it('Can write an INT32 value from UI value', function (done) {
            this.timeout(5000);
            var mmpAddress = '0xF0D81004';

            async.series([
                // Use the client lib to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.setMmpValue(mmpAddress, 0, 'int32', '', next);
                },
                // Use the Write node to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, {
                        dataType: 'mmp-address',
                        mmpAddress: mmpAddress,
                        mmpType: 'int32',
                        mmpLength: '1',
                        valueType: 'value',
                        value: '456'
                    }, { payload: 654321 },
                        (msg: any) => {
                            next();
                        });
                },
                (next: (err?: Error) => void) => {
                    TestUtil.getMmpValue(mmpAddress, 'int32', undefined, undefined, (err: any, value?: number) => {
                        if (err) { next(err); return; }
                        should(value).be.eql(456);
                        next();
                    });
                },
            ],
                done);
        });

        it('Can write a string value from msg.payload', function (done) {
            this.timeout(5000);
            var mmpAddress = '0xF0D83106';

            async.series([
                // Use the client lib to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.setMmpValue(mmpAddress, 'XXXXXXXX', 'string', 'ascii', next);
                },
                // Use the Write node to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, {
                        dataType: 'mmp-address',
                        mmpAddress: mmpAddress,
                        mmpType: 'string',
                        mmpLength: '100'
                    }, { payload: 'this is a test string' },
                        (msg: any) => {
                            next();
                        });
                },
                (next: (err?: Error) => void) => {
                    TestUtil.getMmpValue(mmpAddress, 'string', 100, undefined, (err: any, value?: string) => {
                        if (err) { next(err); return; }
                        should(value).be.eql('this is a test string');
                        next();
                    });
                },
            ],
                done);
        });
        it('Can write a string value from a UI value', function (done) {
            this.timeout(5000);
            var mmpAddress = '0xF0D83106';

            async.series([
                // Use the client lib to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.setMmpValue(mmpAddress, 'XXXXXXXX', 'string', 'ascii', next);
                },
                // Use the Write node to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, {
                        dataType: 'mmp-address',
                        mmpAddress: mmpAddress,
                        mmpType: 'string',
                        mmpLength: '100',
                        valueType: 'value',
                        value: 'this is a DIFFERENT test string'
                    }, { payload: 12345 },
                        (msg: any) => {
                            next();
                        });
                },
                (next: (err?: Error) => void) => {
                    TestUtil.getMmpValue(mmpAddress, 'string', 100, undefined, (err: any, value?: string) => {
                        if (err) { next(err); return; }
                        should(value).be.eql('this is a DIFFERENT test string');
                        next();
                    });
                },
            ],
                done);
        });

    });

    describe('Message Overrides', function () {

        it('module and channel indexes from msg', function (done) {
            var channelIndex = 5;
            const nodeConfig = {
                dataType: 'channel-digital',
                moduleIndex: '0',
                channelIndex: '0'
            };

            async.series([
                // Use the client lib to turn ON the channel
                (next: (err?: Error) => void) => {
                    ClientTestUtil.sharedApiClient.setDigitalChannelState('local', RackInfo.do.index, channelIndex, { value: true }).then(
                        (fullfilledResponse: { response: http.ClientResponse; body: ApiLib.DigitalChannelRead; }) => {
                            next();
                        });
                },
                // Read the state and test (this is just a sanity check on the channel's state)
                (next: (err?: Error) => void) => {
                    ClientTestUtil.sharedApiClient.getChannelDigitalStatus('local', RackInfo.do.index, channelIndex).then(
                        (fullfilledResponse: { response: http.ClientResponse; body: ApiLib.DigitalChannelRead; }) => {
                            should(fullfilledResponse.body.state).be.true();
                            next();
                        });
                },
                // Use the Write node to turn OFF the channel
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id,
                        {
                            dataType: 'channel-digital',
                            moduleIndex: '0', // this should be overridden in the msg
                            channelIndex: '0' // this should be overridden in the msg
                        },
                        {
                            payload: false,
                            moduleIndex: RackInfo.do.index, // override value
                            channelIndex: channelIndex.toString() // override value
                        },
                        (msg: any) => {
                            next();
                        });
                },
                // Read the state and test
                (next: (err?: Error) => void) => {
                    ClientTestUtil.sharedApiClient.getChannelDigitalStatus('local', RackInfo.do.index, channelIndex).then(
                        (fullfilledResponse: { response: http.ClientResponse; body: ApiLib.DigitalChannelRead; }) => {
                            should(fullfilledResponse.body.state).be.false();
                            next();
                        });
                }
            ],
                done);
        });

        it('MMP address from msg', function (done) {
            this.timeout(5000);

            async.series([
                // Use the client lib to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.setMmpValue('0xF0D81008', 0, 'int32', '', next);
                },
                // Use the Write node to set a value
                (next: (err?: Error) => void) => {
                    TestUtil.testWriteNode(deviceConfigNode.id, {
                        dataType: 'mmp-address',
                        mmpAddress: 'bing bong',// overridden in the msg
                        mmpType: 'int32',
                        mmpLength: '1'
                    },
                        {
                            payload: 998877,
                            mmpAddress: '0xF0D81008'
                        },
                        (msg: any) => {
                            next();
                        });
                },
                (next: (err?: Error) => void) => {
                    TestUtil.getMmpValue('0xF0D81008', 'int32', undefined, undefined, (err: any, value?: number) => {
                        if (err) { next(err); return; }
                        should(value).be.eql(998877);
                        next();
                    });
                },
            ],
                done);
        });
    });

    describe('Static Methods', function () {

        var stringValueToWriteValue = WriteNodeImpl.stringValueToWriteValue;
        var getValueToWrite = WriteNodeImpl.getValueToWrite;

        it('getValueToWrite() with "msg.payload" option', () => {

            should(
                getValueToWrite(
                    { payload: 'value from the msg.payload property' },
                    TestUtil.getFullWriteNodeConfigFromPartial({ valueType: 'msg.payload' })
                ))
                .be.eql('value from the msg.payload property');
        });

        it('getValueToWrite() with "msg" option', () => {
            should(
                getValueToWrite({ custom_value_property: 'value from the msg but from a custom property' },
                    TestUtil.getFullWriteNodeConfigFromPartial(
                        { valueType: 'msg', value: 'custom_value_property' })
                ))
                .be.eql('value from the msg but from a custom property');

        });

        it('getValueToWrite() with "msg" option, throws if property is missing.', () => {
            should(
                function () { // must wrap in an anonymous function
                    getValueToWrite({ custom_value_property: 'abc' },
                        TestUtil.getFullWriteNodeConfigFromPartial(
                            { valueType: 'msg', value: 'wrong_value_property' })
                    );
                })
                .throw();
        });

        it('getValueToWrite() throws error with unknown option.', () => {
            should(
                function () { // must wrap in an anonymous function
                    getValueToWrite({},
                        TestUtil.getFullWriteNodeConfigFromPartial(
                            { valueType: 'bad option' })
                    );
                })
                .throw();
        });

        it('getValueToWrite() with "value" option', () => {
            should(
                getValueToWrite({},
                    TestUtil.getFullWriteNodeConfigFromPartial(
                        { valueType: 'value', value: 'this is the value directly from the UI' })
                ))
                .be.eql('this is the value directly from the UI');

        });


        it('stringValueToWriteValue() ; channel-digital ; good input', () => {

            var dataType = 'channel-digital';
            should(stringValueToWriteValue(dataType, 'off')).be.false();
            should(stringValueToWriteValue(dataType, ' OFF ')).be.false();
            should(stringValueToWriteValue(dataType, 'false')).be.false();
            should(stringValueToWriteValue(dataType, '  FALSE  ')).be.false();

            should(stringValueToWriteValue(dataType, 'on')).be.true();
            should(stringValueToWriteValue(dataType, 'On ')).be.true();
            should(stringValueToWriteValue(dataType, 'true')).be.true();
            should(stringValueToWriteValue(dataType, ' TrUE ')).be.true();
        });

        it('stringValueToWriteValue() ; channel-digital ; bad input', () => {

            var dataType = 'channel-digital';

            should(function () { stringValueToWriteValue(dataType, '') }).throw();
            should(function () { stringValueToWriteValue(dataType, ' ') }).throw();
            should(function () { stringValueToWriteValue(dataType, ' anything ') }).throw();
            should(function () { stringValueToWriteValue(dataType, 'anything') }).throw();
            should(function () { stringValueToWriteValue(dataType, '0') }).throw();
            should(function () { stringValueToWriteValue(dataType, '1') }).throw();
            should(function () { stringValueToWriteValue(dataType, '1.0') }).throw();
            should(function () { stringValueToWriteValue(dataType, '2') }).throw();

            // Try to sneak in some non-string types.
            should(function () { stringValueToWriteValue(dataType, <any>null) }).throw();
            should(function () { stringValueToWriteValue(dataType, <any>['abc']) }).throw();
            should(function () { stringValueToWriteValue(dataType, <any>{ value: 'abc' }) }).throw();
        });

        it('stringValueToWriteValue() ; channel-analog  ; good input', () => {
            var dataType = 'channel-analog';
            should(stringValueToWriteValue(dataType, '-1')).be.eql(-1);
            should(stringValueToWriteValue(dataType, '0')).be.eql(0);
            should(stringValueToWriteValue(dataType, ' 1 ')).be.eql(1);
            should(stringValueToWriteValue(dataType, '1234.5678')).be.eql(1234.5678);
            should(stringValueToWriteValue(dataType, ' -1234.5678  ')).be.eql(-1234.5678);
            should(stringValueToWriteValue(dataType, '12.3e-45')).be.eql(1.23e-44);
        });

        it('stringValueToWriteValue() ; channel-analog  ; bad input', () => {
            var dataType = 'channel-analog';
            should(function () { stringValueToWriteValue(dataType, 'abc') }).throw();
            should(function () { stringValueToWriteValue(dataType, 'seven') }).throw();
            should(function () { stringValueToWriteValue(dataType, 'seven') }).throw();

            // Try to sneak in some non-string types.
            should(function () { stringValueToWriteValue(dataType, '') }).throw();
            should(function () { stringValueToWriteValue(dataType, '   ') }).throw();
            should(function () { stringValueToWriteValue(dataType, <any>null) }).throw();
            should(function () { stringValueToWriteValue(dataType, <any>['abc']) }).throw();
            should(function () { stringValueToWriteValue(dataType, <any>{ value: 'abc' }) }).throw();
        });


        it('stringValueToWriteValue() ; mmp  ; good input', () => {
            var dataType = 'mmp-address';
            should(stringValueToWriteValue(dataType, '123', 'int8')).be.eql(123);
            should(stringValueToWriteValue(dataType, '123', 'uint8')).be.eql(123);
            should(stringValueToWriteValue(dataType, '123', 'int32')).be.eql(123);
            should(stringValueToWriteValue(dataType, '123', 'uint32')).be.eql(123);
            should(stringValueToWriteValue(dataType, '123', 'float')).be.eql(123);
            should(stringValueToWriteValue(dataType, '123', 'string')).be.eql('123');


            // int8 and uint8 don't actually limit the ranges at all.
            // The REST API itself will handle any of that.
            // We just want to make sure that the string is converted into a number.
            should(stringValueToWriteValue(dataType, '-1234', 'int8')).be.eql(-1234);
            should(stringValueToWriteValue(dataType, '-1234', 'uint8')).be.eql(-1234);
            should(stringValueToWriteValue(dataType, '-1234', 'int32')).be.eql(-1234);
            should(stringValueToWriteValue(dataType, '-1234', 'uint32')).be.eql(-1234);
            should(stringValueToWriteValue(dataType, '-1234', 'float')).be.eql(-1234);
            should(stringValueToWriteValue(dataType, '-1234', 'string')).be.eql('-1234');


            should(stringValueToWriteValue(dataType, '-1', 'int32')).be.eql(-1);
            should(stringValueToWriteValue(dataType, '0', 'int32')).be.eql(0);
            should(stringValueToWriteValue(dataType, ' 1 ', 'int32')).be.eql(1);
            should(stringValueToWriteValue(dataType, '1234.5678', 'int32')).be.eql(1234);
            should(stringValueToWriteValue(dataType, '1234.5678', 'float')).be.eql(1234.5678);
            should(stringValueToWriteValue(dataType, ' -1234.5678  ', 'int32')).be.eql(-1234);
            should(stringValueToWriteValue(dataType, ' -1234.5678  ', 'float')).be.eql(-1234.5678);
            should(stringValueToWriteValue(dataType, '12.3e-45', 'float')).be.eql(1.23e-44);
        });
    });
});