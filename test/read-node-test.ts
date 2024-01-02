import * as NodeHandlers from "../src/nodes/base-node";
import * as ConfigHandler from "../src/nodes/config-node";
import * as ApiLib from "../src/swagger/lib/api";
import * as should from 'should';
import * as async from 'async';
import * as TestUtil from "./test-util/test-util";
import { RackInfo } from "./test-util/rack-info";
import * as ReadNodeHandler from "../src/nodes/read-node";
import * as sinon from 'sinon';
import { log } from "util";
import * as assert from 'assert';
import { ClientTestUtil } from "./test-util/client-test-util";

var TestSettings = require('./settings.json');


describe('Groov I/O Read Nodes', function () {

    let deviceConfigNode: ConfigHandler.DeviceConfiguration;

    before(function (beforeDone: MochaDone) {

        ClientTestUtil.init(
            (error: any, clientInfo?: { publicCertFile: Buffer, sharedApiClient: ApiLib.DefaultApi }) => {
                if (error)
                    assert.fail(error.toString());
                else {
                    var deviceConfig = TestUtil.createDeviceConfig();;
                    deviceConfigNode = TestUtil.createDeviceConfigNode(deviceConfig);

                    ReadNodeHandler.setRED(TestUtil.RED);
                    ConfigHandler.setRED(TestUtil.RED);
                    TestUtil.RED.nodes.addCredentials('deviceId0', deviceConfig.credentials);

                    ConfigHandler.createDeviceNode.call(deviceConfigNode, deviceConfig);
                    // ConfigHandler.globalConnections.createConnection(deviceConfig.address,
                    //     deviceConfig.credentials.apiKey,
                    //     TestUtil.clientLibAndCerts.publicCertFile,
                    //     TestUtil.clientLibAndCerts.caCertFile,
                    //     deviceConfig.id);

                    beforeDone();
                }
            });

    });

    describe('General', function () {

        var channelIndex = 4;

        it('sets an error on the node if device is not set or unknown', function (done) {
            var node = TestUtil.createNewFullReadNode('', {},
                (msg: any) => { },
                (errorText: string, nodeMessage: any) => { });
            var statusSpy = sinon.spy(node, 'status');
            node.input({}); // send a msg to the node
            should(statusSpy.calledOnce).be.true();
            should(statusSpy.getCall(0).args[0]).match({ fill: 'red', shape: 'dot' });
            statusSpy.restore();
            done();
        });

        it('uses a custom property name when configured to do so', function (done) {
            var channelIndex = 7;
            TestUtil.testReadNode(deviceConfigNode.id,
                {
                    dataType: 'channel-config',
                    moduleIndex: RackInfo.di.index.toString(),
                    channelIndex: channelIndex.toString(),
                    valueType: 'msg',
                    value: 'customProperty'
                },
                (msg: any) => {
                    should(msg.customProperty).eql(msg.body);
                    done();
                });
        });
    });

    describe('Message Overrides', function () {


        it('module and channel indexes from msg', function (done) {
            TestUtil.testReadNode(deviceConfigNode.id,
                {
                    dataType: 'channel-config',
                    moduleIndex: '0', // this should be overridden in the msg
                    channelIndex: '0' // this should be overridden in the msg
                },
                (msg: any) => {
                    should(msg.body.moduleIndex).be.eql(4);
                    should(msg.body.channelIndex).be.eql(9);
                    done();
                },
                {
                    moduleIndex: RackInfo.di.index.toString(),
                    channelIndex: '9'
                });
        });


        it('MMP address from msg', function (done) {
            TestUtil.setMmpValue('0xF0D81010', 23456, 'int32', undefined, (err: any) => {
                if (err) { done(err); return; }
                TestUtil.testReadNode(deviceConfigNode.id,
                    {
                        dataType: 'mmp-address',
                        mmpAddress: 'blah blah blah',// overridden in the msg
                        mmpType: 'int32',
                        mmpLength: '1'
                    },
                    (msg: any) => {
                        should(msg.payload).be.a.Number();
                        should(msg.payload).be.eql(23456);
                        done();
                    },
                    {
                        mmpAddress: '0xF0D81010'
                    });
            });
        });
    });

    describe('Digital Channels', function () {

        it('Returns msg.payload is True when ON', function (done) {
            var channelIndex = 7;
            TestUtil.setDigitalOutput(RackInfo.do.index, channelIndex, true,
                (err: any) => {
                    if (err) { done(err); return; }
                    TestUtil.testReadNode(deviceConfigNode.id,
                        {
                            dataType: 'channel-digital',
                            moduleIndex: RackInfo.di.index.toString(),
                            channelIndex: channelIndex.toString()
                        },
                        (msg: any) => {
                            should(msg.payload).be.true();
                            done();
                        });
                });
        });

        it('Returns msg.payload is False when OFF', function (done) {
            var channelIndex = 7;
            TestUtil.setDigitalOutput(RackInfo.do.index, channelIndex, false,
                (err: any) => {
                    if (err) { done(err); return; }
                    TestUtil.testReadNode(deviceConfigNode.id, {
                        dataType: 'channel-digital',
                        moduleIndex: RackInfo.di.index.toString(),
                        channelIndex: channelIndex.toString()
                    }, (msg: any) => {
                        should(msg.payload).be.false();
                        done();
                    });
                });
        });

        it('Clear everything and check body response', function (done) {
            var channelIndex = 7;
            async.series([
                // Reset everything
                (next: () => void) => {
                    TestUtil.resetDigitalChannelPair(RackInfo.di.index, RackInfo.do.index, channelIndex, next);
                },
                (next: (err?: Error, data?: any) => void) => {

                    TestUtil.testReadNode(deviceConfigNode.id, {
                        dataType: 'channel-digital',
                        moduleIndex: RackInfo.di.index.toString(),
                        channelIndex: channelIndex.toString()
                    }, (msg: any) => {
                        should(msg.payload).be.false();
                        TestUtil.assertDigitalChannelRead(msg, {});
                        next();
                    });
                }
            ],
                done);
        });

        it('Sets On and Off Latches', function (done) {
            var channelIndex = 7;
            var devId = deviceConfigNode.id;

            const readNodeConfig = {
                dataType: 'channel-digital',
                moduleIndex: RackInfo.di.index.toString(),
                channelIndex: channelIndex.toString()
            };

            async.series([
                // Reset everything
                (next: () => void) => {
                    TestUtil.resetDigitalChannelPair(RackInfo.di.index, RackInfo.do.index, channelIndex, next);
                },
                // Test
                (next: (err?: Error, data?: any) => void) => {
                    TestUtil.testReadNodeDigitalChannel(devId, RackInfo.di.index, channelIndex, {}, next);
                },
                // Turn ON
                (next: () => void) => {
                    TestUtil.setDigitalOutput(RackInfo.do.index, channelIndex, true, next);
                },
                // Test
                (next: (err?: Error, data?: any) => void) => {
                    TestUtil.testReadNodeDigitalChannel(devId, RackInfo.di.index, channelIndex,
                        { state: true, onLatchState: true }, next);
                },
                // Turn OFF
                (next: () => void) => {
                    TestUtil.setDigitalOutput(RackInfo.do.index, channelIndex, false, next);
                },
                // Test
                (next: (err?: Error, data?: any) => void) => {
                    TestUtil.testReadNodeDigitalChannel(devId, RackInfo.di.index, channelIndex,
                        { state: false, onLatchState: true, offLatchState: true }, next);
                },
            ],
                done);
        });
    });


    describe('Analog Channels', function () {

        var channelIndex = 4;

        it('test 1', function (done) {
            this.timeout(5000);
            ClientTestUtil.sharedApiClient.setAnalogChannelValue('local', RackInfo.ao.index, channelIndex, { value: 4.25 }).then(
                () => {
                    setTimeout(() => {
                        TestUtil.testReadNode(deviceConfigNode.id,
                            {
                                dataType: 'channel-analog',
                                moduleIndex: RackInfo.ai.index.toString(),
                                channelIndex: channelIndex.toString()
                            },
                            (msg: { payload: number, body: ApiLib.AnalogChannelRead }) => {
                                should(msg.payload).be.approximately(4.25, 0.25);
                                should(msg.body.value).be.eql(msg.payload);

                                should(msg.body.channelIndex).be.eql(channelIndex);
                                should(msg.body.moduleIndex).be.eql(RackInfo.ai.index);
                                should(msg.body.modelType).be.eql('AnalogChannelRead');
                                should(msg.body.maxValue).be.type('number');
                                should(msg.body.minValue).be.type('number');
                                should(msg.body.qualityDetail).be.eql(0);
                                done();
                            });
                    }, 4000);
                },
                done);
        });

        it('test 2', function (done) {
            this.timeout(5000);
            ClientTestUtil.sharedApiClient.setAnalogChannelValue('local', RackInfo.ao.index, channelIndex, { value: 1.75 }).then(
                () => {
                    setTimeout(() => {
                        TestUtil.testReadNode(deviceConfigNode.id,
                            {
                                dataType: 'channel-analog',
                                moduleIndex: RackInfo.ai.index.toString(),
                                channelIndex: channelIndex.toString()
                            },
                            (msg: any) => {
                                should(msg.payload).be.approximately(1.75, 0.2);
                                done();
                            });
                    }, 4000);
                },
                done);
        });
    });

    describe('Channel Config', function () {

        it('return a channel\'s configuration', function (done) {
            var channelIndex = 7;
            TestUtil.testReadNode(deviceConfigNode.id,
                {
                    dataType: 'channel-config',
                    moduleIndex: RackInfo.di.index.toString(),
                    channelIndex: channelIndex.toString()
                },
                (msg: any) => {
                    // Snip out the name, since something else might
                    // have given it a name.
                    msg.payload.name = '';

                    should(msg.payload).match({
                        moduleIndex: 4,
                        channelIndex: 7,
                        moduleType: 1342177306,
                        channelType: 1342177327,
                        feature: 0,
                        name: '',
                        unit: '',
                        watchdogValue: 0,
                        watchdogEnabled: false,
                        qualityEnabled: true,
                        offset: 0,
                        gain: 0,
                        scaledUpper: 0,
                        scaledLower: 0,
                        clampUpper: 0,
                        clampLower: 0,
                        averageFilterWeight: 0,
                        simpleMovingAverageReadings: 0,
                        steinhartHartCoefficientA: 0,
                        steinhartHartCoefficientB: 0,
                        steinhartHartCoefficientSecondOrder: 0,
                        steinhartHartCoefficientC: 0
                    });
                    done();
                });
        });
    });

    describe('Analog Module', function () {

        it('returns an array with the correct structure', function (done) {
            TestUtil.testReadNode(deviceConfigNode.id,
                {
                    dataType: 'module-analog',
                    moduleIndex: RackInfo.ai.index.toString()
                },
                (msg: any) => {
                    should(msg.payload).be.an.Array();
                    should(msg.payload.length).be.greaterThanOrEqual(RackInfo.ai.numChannels);
                    should(msg.payload[0].value).be.a.Number();
                    should(msg.payload[0].qualityError).be.a.Boolean();
                    done();
                });
        });
    });

    describe('Digital Module', function () {

        it('returns an array with the correct structure', function (done) {
            var channelIndex = 7;
            TestUtil.testReadNode(deviceConfigNode.id,
                {
                    dataType: 'module-digital',
                    moduleIndex: RackInfo.di.index.toString()
                },
                (msg: any) => {
                    should(msg.payload).be.an.Array();
                    should(msg.payload.length).be.eql(24);
                    should(msg.payload[0].state).be.a.Boolean();
                    should(msg.payload[0].onLatch).be.a.Boolean();
                    should(msg.payload[0].offLatch).be.a.Boolean();
                    should(msg.payload[0].qualityError).be.a.Boolean();
                    done();
                });
        });
    });

    describe('Module Quality', function () {

        it('returns an array with the correct structure', function (done) {
            var channelIndex = 7;
            TestUtil.testReadNode(deviceConfigNode.id,
                {
                    dataType: 'modules-quality',
                    moduleIndex: RackInfo.di.index.toString()
                },
                (msg: any) => {
                    should(msg.payload).be.a.Number();
                    done();
                });
        });
    });

    describe('MMP Addresses', function () {

        it('can read a string value', function (done) {
            TestUtil.setMmpValue('0xF0D83002', 'abc 123', 'string', undefined, (err: any) => {
                if (err) { done(err); return; }
                TestUtil.testReadNode(deviceConfigNode.id,
                    {
                        dataType: 'mmp-address',
                        moduleIndex: RackInfo.di.index.toString(),
                        mmpAddress: '0xF0D83002',
                        mmpType: 'string',
                        mmpLength: '50'
                    },
                    (msg: any) => {
                        should(msg.payload).be.a.String();
                        should(msg.payload).be.eql('abc 123');
                        done();
                    });
            });
        });

        it('can read a string value with ASCII encoding', function (done) {
            TestUtil.setMmpValue('0xF0D83002', 'abc 123 !@#', 'string', 'ascii', (err: any) => {
                if (err) { done(err); return; }
                TestUtil.testReadNode(deviceConfigNode.id,
                    {
                        dataType: 'mmp-address',
                        moduleIndex: RackInfo.di.index.toString(),
                        mmpAddress: '0xF0D83002',
                        mmpType: 'string',
                        mmpLength: '50',
                        mmpEncoding: 'ascii'
                    },
                    (msg: any) => {
                        should(msg.payload).be.a.String();
                        should(msg.payload).be.eql('abc 123 !@#');
                        done();
                    });
            });
        });

        it.skip('can read a string value with UTF-8 encoding', function (done) {
            // Waiting on fix for #88185 (https://trac.opto22.com/internal/ticket/88185)
            TestUtil.setMmpValue('0xF0D83084', 'epic 史詩 épique έπος !@# 😃😂🤑😬123', 'string', 'utf8', (err: any) => {
                if (err) { done(err); return; }
                TestUtil.testReadNode(deviceConfigNode.id,
                    {
                        dataType: 'mmp-address',
                        moduleIndex: RackInfo.di.index.toString(),
                        mmpAddress: '0xF0D83084',
                        mmpType: 'string',
                        mmpLength: '80',
                        mmpEncoding: 'utf8'
                    },
                    (msg: any) => {
                        should(msg.payload).be.a.String();
                        should(msg.payload).be.eql('epic 史詩 épique έπος !@# 😃😂🤑😬123');
                        done();
                    });
            });
        });

        it('can read a numeric value', function (done) {
            TestUtil.setMmpValue('0xF0D81000', 123456, 'int32', undefined, (err: any) => {
                if (err) { done(err); return; }
                TestUtil.testReadNode(deviceConfigNode.id,
                    {
                        dataType: 'mmp-address',
                        mmpAddress: '0xF0D81000',
                        mmpType: 'int32',
                        mmpLength: '1'
                    },
                    (msg: any) => {
                        should(msg.payload).be.a.Number();
                        should(msg.payload).be.eql(123456);
                        done();
                    });
            });
        });
    });
});