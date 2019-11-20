import * as NodeHandlers from "../../src/nodes/base-node";
import * as ConfigHandler from "../../src/nodes/config-node";
import * as NodeRed from 'opto22-node-red-common/typings/nodered';
import * as MockRed from "opto22-node-red-common/lib/mocks/MockRed";
import { NodeWriteConfiguration, createWriteNode } from '../../src/nodes/write-node';
import { InputNodeImpl, NodeInputConfiguration, createInputNode } from "../../src/nodes/input-node";
import { WriteNodeImpl } from "../../src/nodes/write-node";
import { ReadNodeImpl, createReadNode } from "../../src/nodes/read-node";
import { NodeReadConfiguration } from "../../src/nodes/read-node";
import * as ApiLib from "../../src/swagger/lib/api";
import { DefaultApi } from "../../src/swagger/lib/api";
import * as should from 'should';
import { ClientTestUtil } from './client-test-util';
import { MockGroovReadNode, MockGroovWriteNode, MockGroovInputNode, MockNodeEx } from "./mock-groov-io-nodes";
import { MockGroovIoDeviceNode } from "./mock-groov-io-nodes";
import * as async from 'async';
import * as http from 'http';
import { MockNode } from "opto22-node-red-common/lib/mocks/MockNode";
import { visitFunctionBody } from "typescript";
var TestSettings = require('../settings.json');

export var RED = new MockRed.MockRed();


export function createDeviceConfig(address?: string): ConfigHandler.DeviceConfiguration {

    return {
        id: 'deviceId0',
        address: address !== undefined ? address : TestSettings.groovAddress,
        msgQueueFullBehavior: 'REJECT_NEW',
        credentials: {
            apiKey: ClientTestUtil.userData.apiKey,
            publicCertPath: '',
            caCertPath: ClientTestUtil.caCertPath || '',
        }
    };
}

export function createDeviceConfigNode(deviceConfig: ConfigHandler.DeviceConfiguration): MockGroovIoDeviceNode {

    var deviceConfigNode = new MockGroovIoDeviceNode(deviceConfig.id, deviceConfig.address, deviceConfig.credentials);

    RED.nodes.addNode(deviceConfigNode);

    return deviceConfigNode;
}

function createReadNodeImpl(nodeConfig: NodeReadConfiguration,
    deviceConfig: ConfigHandler.DeviceConfiguration, node: NodeRed.Node): NodeHandlers.FunctionNodeBaseImpl {

    return new ReadNodeImpl(nodeConfig, deviceConfig, node);
}

function createWriteNodeImpl(nodeConfig: NodeWriteConfiguration,
    deviceConfig: ConfigHandler.DeviceConfiguration, node: NodeRed.Node): NodeHandlers.FunctionNodeBaseImpl {

    return new WriteNodeImpl(nodeConfig, deviceConfig, node);
}

export function injectMsg(node: MockNodeEx, msg: any) {

    // Send it a basic message, like an Inject Timestamp node does.
    node.input(msg);
}

export function injectTimestampMsg(node: MockNodeEx) {
    injectMsg(node, { "payload": 1466009468654 });
}



export function assertAnalogChannelRead(msgActual: { payload: any, body: ApiLib.AnalogChannelRead },
    bodyExpected: Partial<ApiLib.AnalogChannelRead>) {

    let msgBody = msgActual.body;

    // Check that msg.payload matches the state.
    should(msgActual.payload).be.eql(msgBody.value);

    if (bodyExpected.modelType == undefined)
        should(msgBody.modelType).be.eql('AnalogChannelRead');
    else
        should(msgBody.modelType).be.eql(bodyExpected.modelType);

    if (bodyExpected.moduleIndex != undefined)
        should(msgBody.moduleIndex).be.eql(bodyExpected.moduleIndex);

    if (bodyExpected.channelIndex != undefined)
        should(msgBody.channelIndex).be.eql(bodyExpected.channelIndex);

    if (bodyExpected.qualityDetail == undefined)
        should(msgBody.qualityDetail).be.eql(0);
    else
        should(msgBody.qualityDetail).be.eql(bodyExpected.qualityDetail);

    if (bodyExpected.value != undefined)
        should(msgBody.value).be.approximately(bodyExpected.value, 0.25);

    if (bodyExpected.minValue != undefined)
        should(msgBody.minValue).be.approximately(bodyExpected.minValue, 0.25);

    if (bodyExpected.maxValue != undefined)
        should(msgBody.maxValue).be.approximately(bodyExpected.maxValue, 0.25);

}

export function assertDigitalChannelRead(msgActual: { payload: any, body: ApiLib.DigitalChannelRead },
    bodyExpected: Partial<ApiLib.DigitalChannelRead>, payloadExpected?: any) {

    let msgBody = msgActual.body;

    if (payloadExpected == undefined)
        // Check that msg.payload matches the state.
        should(msgActual.payload).be.eql(msgBody.state);
    else
        should(msgActual.payload).be.eql(payloadExpected);

    if (bodyExpected.modelType == undefined)
        should(msgBody.modelType).be.eql('DigitalChannelRead');
    else
        should(msgBody.modelType).be.eql(bodyExpected.modelType);

    if (bodyExpected.moduleIndex != undefined)
        should(msgBody.moduleIndex).be.eql(bodyExpected.moduleIndex);

    if (bodyExpected.channelIndex != undefined)
        should(msgBody.channelIndex).be.eql(bodyExpected.channelIndex);

    if (bodyExpected.qualityDetail == undefined)
        should(msgBody.qualityDetail).be.eql(0);
    else
        should(msgBody.qualityDetail).be.eql(bodyExpected.qualityDetail);

    if (bodyExpected.state == undefined)
        should(msgBody.state).be.false();
    else
        should(msgBody.state).be.eql(bodyExpected.state);

    if (bodyExpected.onLatchState == undefined)
        should(msgBody.onLatchState).be.false();
    else
        should(msgBody.onLatchState).be.eql(bodyExpected.onLatchState);

    if (bodyExpected.offLatchState == undefined)
        should(msgBody.offLatchState).be.false();
    else
        should(msgBody.offLatchState).be.eql(bodyExpected.offLatchState);

    if (bodyExpected.featureType == undefined)
        should(msgBody.featureType).be.eql(0);
    else
        should(msgBody.featureType).be.eql(bodyExpected.featureType);

    if (bodyExpected.featureValue == undefined)
        should(msgBody.featureValue).be.eql(0);
    else
        should(msgBody.featureValue).be.eql(bodyExpected.featureValue);

    if (bodyExpected.counterActive == undefined)
        should(msgBody.counterActive).be.false();
    else
        should(msgBody.counterActive).be.eql(bodyExpected.counterActive);
}



export function testReadNodeDigitalChannel(deviceId: string, moduleIndex: number, channelIndex: number,
    expected: Partial<ApiLib.DigitalChannelRead>,
    done: (err?: any) => void) {

    testReadNode(deviceId, {
        dataType: 'channel-digital',
        moduleIndex: moduleIndex.toString(),
        channelIndex: channelIndex.toString()
    }, (msg: any) => {
        assertDigitalChannelRead(msg, expected);
        done();
    });
}


export function createFullInputNode(deviceId: string,
    nodeConfigPartial: Partial<NodeInputConfiguration>,
    onSendCallback: (msg: any) => void,
    onErrorCallback?: (errorText: string, nodeMessage: any) => void) {

    // Create a node's configuration.
    var nodeConfig: NodeInputConfiguration = {
        id: "930e8d11.9abbf", // This is just an example ID. Nothing special about it.
        type: InputNodeImpl.getNodeType(),
        device: deviceId,
        dataType: nodeConfigPartial.dataType,
        sendInitialValue: nodeConfigPartial.sendInitialValue || false,
        deadband: nodeConfigPartial.deadband || '1',
        scanTimeSec: nodeConfigPartial.scanTimeSec || '1',
        topicType: nodeConfigPartial.topicType || 'none',
        topic: nodeConfigPartial.topic || '',
        moduleIndex: nodeConfigPartial.moduleIndex || '',
        channelIndex: nodeConfigPartial.channelIndex || '',
        mmpAddress: nodeConfigPartial.mmpAddress || '',
        mmpType: nodeConfigPartial.mmpType || 'int32',
        mmpLength: nodeConfigPartial.mmpLength || '1',
        mmpEncoding: nodeConfigPartial.mmpEncoding || 'ascii',
        name: nodeConfigPartial.name || ''
    };
    var node = createRawInputNode(deviceId, nodeConfigPartial,
        onSendCallback, onErrorCallback);

    var nodeImpl = createInputNode.call(node, nodeConfig, true);

    return { node, nodeImpl };
}

export function createRawInputNode(deviceId: string, nodeConfigPartial: Partial<NodeInputConfiguration>,
    onSendCallback: (msg: any) => void,
    onErrorCallback?: (errorText: string, nodeMessage: any) => void): MockGroovReadNode {

    // Create a mock node.
    var node = new MockGroovInputNode(onSendCallback, onErrorCallback);

    return node;
}

export function createRawReadNode(
    onSendCallback: (msg: any) => void,
    onErrorCallback: (errorText: string, nodeMessage: any) => void): MockGroovReadNode {

    // Create a mock node.
    var node = new MockGroovReadNode(onSendCallback, onErrorCallback);

    return node;
}

export function testReadNode(deviceId: string, nodeConfigPartial: Partial<NodeReadConfiguration>,
    onSendCallback: (msg: any) => void, msg?: any): MockGroovReadNode {


    // Create a node's configuration.
    var node = createNewFullReadNode(deviceId, nodeConfigPartial, onSendCallback);

    if (msg !== undefined) {
        injectMsg(node, msg);
    }
    else {
        injectTimestampMsg(node);
    }

    return node;
}

export function createNewFullReadNode(deviceId: string, nodeConfigPartial: Partial<NodeReadConfiguration>,
    onSendCallback: (msg: any) => void,
    onErrorCallback?: (errorText: string, nodeMessage: any) => void) {

    var nodeConfig: NodeReadConfiguration = {
        id: "930e8d11.9abbf",
        type: ReadNodeImpl.getNodeType(),
        device: deviceId,
        dataType: nodeConfigPartial.dataType,
        valueType: nodeConfigPartial.valueType || 'msg.payload',
        value: nodeConfigPartial.value || '',
        topicType: nodeConfigPartial.topicType || 'none',
        topic: nodeConfigPartial.topic || '',
        moduleIndex: nodeConfigPartial.moduleIndex || '',
        channelIndex: nodeConfigPartial.channelIndex || '',
        mmpAddress: nodeConfigPartial.mmpAddress || '',
        mmpType: nodeConfigPartial.mmpType || 'int32',
        mmpLength: nodeConfigPartial.mmpLength || '1',
        mmpEncoding: nodeConfigPartial.mmpEncoding || 'ascii',
        // itemName: nodeConfigPartial.itemName || '',
        name: nodeConfigPartial.name || ''
    };

    // Create a mock node.
    var node = createRawReadNode(onSendCallback, onErrorCallback);
    createReadNode.call(node, nodeConfig);

    return node;
}

export function createRawWriteNode(deviceId: string, nodeConfigPartial: Partial<NodeWriteConfiguration>,
    onSendCallback: (msg: any) => void,
    onErrorCallback?: (errorText: string, nodeMessage: any) => void): MockGroovWriteNode {

    // Create a mock node.
    var node = new MockGroovWriteNode(onSendCallback, onErrorCallback);

    return node;
}

export function getFullWriteNodeConfigFromPartial(
    nodeConfigPartial: Partial<NodeWriteConfiguration>,
    deviceId?: string,
): NodeWriteConfiguration {
    // Create a node's configuration.
    var nodeConfig: NodeWriteConfiguration = {
        id: "930e8d11.9abbf", // This is just an example ID. Nothing special about it.
        type: WriteNodeImpl.getNodeType(),
        device: deviceId || '',
        dataType: nodeConfigPartial.dataType,
        valueType: nodeConfigPartial.valueType || 'msg.payload',
        value: nodeConfigPartial.value || '',
        moduleIndex: nodeConfigPartial.moduleIndex || '',
        channelIndex: nodeConfigPartial.channelIndex || '',
        mmpAddress: nodeConfigPartial.mmpAddress || '',
        mmpType: nodeConfigPartial.mmpType || 'int32',
        mmpLength: nodeConfigPartial.mmpLength || '1',
        mmpEncoding: nodeConfigPartial.mmpEncoding || 'ascii',
        // itemName: nodeConfigPartial.itemName || '',
        name: nodeConfigPartial.name || ''
    };

    return nodeConfig;
}


export function createNewFullWriteNode(deviceId: string,
    nodeConfigPartial: Partial<NodeWriteConfiguration>,
    onSendCallback: (msg: any) => void,
    onErrorCallback?: (errorText: string, nodeMessage: any) => void) {

    var nodeConfig = getFullWriteNodeConfigFromPartial(nodeConfigPartial, deviceId);

    // Create a mock node.
    var node = createRawWriteNode(deviceId, nodeConfigPartial, onSendCallback, onErrorCallback);
    createWriteNode.call(node, nodeConfig);

    return node;
}
export function testWriteNode(deviceId: string, nodeConfigPartial: Partial<NodeWriteConfiguration>,
    msg: any, responseCallback: (msg: any) => void): MockGroovWriteNode {

    // Create a mock node.
    var node = createNewFullWriteNode(deviceId, nodeConfigPartial, responseCallback);

    if (msg !== undefined) {
        injectMsg(node, msg);
    }

    return node;
}


export function getMmpValue(mmpAddress: string,
    dataType: string,
    length: number | undefined,
    stringEncoding: string | undefined,
    done: (err?: any, value?: any) => void) {

    ClientTestUtil.sharedApiClient.getMmpValues('local', mmpAddress, dataType, length || 1, stringEncoding)
        .then((fulfilledResponse: { response: http.ClientResponse; body: ApiLib.MmpNumericValues }) => {

            done(undefined, fulfilledResponse.body.mmpValues[0]);
        }, done);
}

export function setMmpValue(mmpAddress: string, value: number | string,
    valueType: ApiLib.MmpValueType,
    stringEncoding: string | undefined,
    done: (err: any) => void) {

    async.series([
        (next: (err?: Error, data?: any) => void) => {
            var body = {
                value: value,
                type: valueType
            };

            if (stringEncoding)
                body['encoding'] = stringEncoding;

            ClientTestUtil.sharedApiClient.setMmpValue('local', mmpAddress, <any>body)
                .then(() => { next(); }, next);
        },
        // Slight delay
        (next: (err?: Error, data?: any) => void) => {
            setTimeout(next, 50);
        }
    ], done);
}

export function getAnalogInput(outModuleIndex: number, channelIndex: number,
    done: (err: any, value?: number) => void) {
    ClientTestUtil.sharedApiClient.getChannelAnalogStatus('local', outModuleIndex, channelIndex)
        .then(
            (fulfilledResponse: { response: http.ClientResponse; body: ApiLib.AnalogChannelRead }) => {
                done(undefined, fulfilledResponse.body.value);
            },
            done // pass back any errors
        );
}

export function getDigitalInput(outModuleIndex: number, channelIndex: number,
    done: (err: any, status?: ApiLib.DigitalChannelRead) => void) {
    ClientTestUtil.sharedApiClient.getChannelDigitalStatus('local', outModuleIndex, channelIndex)
        .then(
            (fulfilledResponse: { response: http.ClientResponse; body: ApiLib.DigitalChannelRead }) => {
                done(undefined, fulfilledResponse.body);
            },
            done // pass back any errors
        );
}

export function setAnalogOutput(outModuleIndex: number, channelIndex: number, value: number,
    done: (err: any) => void) {

    async.series([
        (next: (err?: Error, data?: any) => void) => {
            ClientTestUtil.sharedApiClient.setAnalogChannelValue('local', outModuleIndex, channelIndex,
                { value: value })
                .then(() => { next(); }, next);
        },
        // Slight delay since we probably need the input to change too.
        // Analog is kinda slow.
        (next: (err?: Error, data?: any) => void) => {
            setTimeout(next, 3000);
        }
    ], done);
}

export function setDigitalOutput(outModuleIndex: number, channelIndex: number, state: boolean,
    done: (err: any) => void) {

    async.series([
        // Turn Output Off
        (next: (err?: Error, data?: any) => void) => {
            ClientTestUtil.sharedApiClient.setDigitalChannelState('local', outModuleIndex, channelIndex,
                { value: state })
                .then(() => { next(); }, next);
        },
        // Slight delay
        (next: (err?: Error, data?: any) => void) => {
            setTimeout(next, 200);
        }
    ], done);
}

export function clearDigital(moduleIndex: number, channelIndex: number, clearOnLatch: boolean,
    clearOffLatch: boolean, clearFeatureValue: boolean,
    done: (err: any) => void) {
    async.series([
        // Clear On-Latch
        (next: (err?: Error, data?: any) => void) => {
            if (clearOnLatch)
                ClientTestUtil.sharedApiClient.clearDigitalChannelOnLatch('local', moduleIndex, channelIndex)
                    .then(() => { next(); }, next);
            else
                process.nextTick(next);
        },
        // Clear Off-Latch
        (next: (err?: Error, data?: any) => void) => {
            if (clearOffLatch)
                ClientTestUtil.sharedApiClient.clearDigitalChannelOffLatch('local', moduleIndex, channelIndex)
                    .then(() => { next(); }, next);
            else
                process.nextTick(next);
        },
        // Clear Counter
        (next: (err?: Error, data?: any) => void) => {
            if (clearFeatureValue)
                ClientTestUtil.sharedApiClient.clearDigitalChannelFeature('local', moduleIndex, channelIndex)
                    .then(() => { next(); }, next);
            else
                process.nextTick(next);
        }
    ], done);
}

export function resetDigitalChannelPair(inModuleIndex: number, outModuleIndex: number, channelIndex: number,
    done: (err: any) => void) {

    async.series([
        // Turn Output Off
        (next: (err?: Error, data?: any) => void) => {
            ClientTestUtil.sharedApiClient.setDigitalChannelState('local', outModuleIndex, channelIndex,
                { value: false })
                .then(() => { next(); }, next);
        },
        // Slight delay
        (next: (err?: Error, data?: any) => void) => {
            setTimeout(next, 50);
        },
        // Clear things on the input 
        (next: (err?: Error, data?: any) => void) => {
            clearDigital(inModuleIndex, channelIndex, true, true, true, next);
        }
    ], done);
}

export function resetAnalogChannelPair(inModuleIndex: number, outModuleIndex: number, channelIndex: number,
    done: (err: any) => void) {

    async.series([
        // Turn Output Off
        (next: (err?: Error, data?: any) => void) => {
            ClientTestUtil.sharedApiClient.setAnalogChannelValue('local', outModuleIndex, channelIndex,
                { value: 0.0 })
                .then(() => { next(); }, next);
        },
        // Slight delay
        (next: (err?: Error, data?: any) => void) => {
            setTimeout(next, 1000);
        },
        // Clear Min Values
        (next: (err?: Error, data?: any) => void) => {
            ClientTestUtil.sharedApiClient.clearAnalogChannelMinValue('local', inModuleIndex, channelIndex)
                .then(() => { next(); }, next);
        },
        // Clear Max Values
        (next: (err?: Error, data?: any) => void) => {
            ClientTestUtil.sharedApiClient.clearAnalogChannelMaxValue('local', inModuleIndex, channelIndex)
                .then(() => { next(); }, next);
        },
    ], done);
}


