/*
   Copyright 2019 Opto 22

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

// Import our modules
import * as ConfigHandler from "./config-node";

// Import external modules
import http = require('http');
import * as NodeRed from 'opto22-node-red-common/typings/nodered';
import Promise = require('bluebird');
import * as ErrorHanding from "../util/error-handling";
import { FunctionNodeBaseImpl, NodeBaseConfiguration, PromiseResponse, MmpDataType } from "./base-node";

var RED: NodeRed.RED;

export function setRED(globalRED: NodeRed.RED) {
    RED = globalRED;
}


export interface NodeWriteConfiguration extends NodeBaseConfiguration {
    value: string;
    valueType: string; // 'msg', 'msg.payload', or 'value';
}


interface RequestInfo {
    promise: Promise<PromiseResponse>,
    dataType: string,
    valueName?: string,
    mmpLength?: number
}

/**
 * The implementation class for the SNAP PAC Write nodes.
 */
export class WriteNodeImpl extends FunctionNodeBaseImpl {
    private nodeWriteConfig: NodeWriteConfiguration
    static activeMessageCount: number = 0;
    private requestDelayedTimer: NodeJS.Timer;

    constructor(nodeConfig: NodeWriteConfiguration, deviceConfig: ConfigHandler.DeviceConfiguration, node: NodeRed.Node) {
        super(nodeConfig, deviceConfig, node);
        this.nodeWriteConfig = nodeConfig;


        this.node.on('close', () => {
            this.onClose();
        });

        this.node.on('input', (msg: any) => {
            this.addMsg(msg); // add msg to the queue
        });
    }


    static getNodeType(): string {
        return 'groov-io-write';
    }

    // Handler for 'close' events from Node-RED.
    public onClose() {
        this.clearRequestDelayedTimer();
    }

    private clearRequestDelayedTimer() {
        // Clear the Request Delayed timeout
        if (this.requestDelayedTimer) {
            clearTimeout(this.requestDelayedTimer);
            this.requestDelayedTimer = null;
        }
    }

    // If a request takes more than a moment, we want to show the user that 
    // it's been delayed. It's very likely that this request or another on the shared HTTP Agent's queue
    // it timing out.
    private scanNotDoneCallback = () => {
        // If there's no current error, update the status to show that the request
        // is delayed. Probably either this or another node on the same device is timing out.
        if (!this.previousResponseError) {
            this.node.status({ fill: "yellow", shape: "dot", text: "writing (delayed)" });
        }
        this.requestDelayedTimer = null;
    }

    // Handler for 'input' events from Node-RED.
    public onInput = (msg: any): void => {

        try {
            var valueFinal = WriteNodeImpl.getValueToWrite(msg, this.nodeWriteConfig);
        }
        catch (e) {
            var errorMessage: string;
            if (e instanceof Error)
                errorMessage = (<Error>e).message;
            else
                errorMessage = JSON.stringify(e);

            this.node.error(errorMessage, msg);
            this.node.status({ fill: "red", shape: "dot", text: "error" });
            //this.msgQueue.done(0);
            return;
        }

        // Start the Request Delayed timeout
        this.requestDelayedTimer = setTimeout(this.scanNotDoneCallback, 3000);

        // console.log('valueObject = ' + JSON.stringify(valueObject, undefined, 2));

        if (this.previousResponseError) {
            this.node.status({
                fill: "red", shape: "dot", text: "writing [" +
                    this.previousResponseError.nodeShortErrorMsg + "]"
            });
        }
        else {
            this.node.status({ fill: "green", shape: "dot", text: "writing" });
        }

        var promise: Promise<{ response: http.ClientResponse; body?: any; }>

        if (this.apiClient) {
            promise = this.getWriteRequest(msg, valueFinal);
        }
        else {
            this.node.status({ fill: "red", shape: "dot", text: "No device" });
            return;
        }

        if (!promise) {
            this.node.status({ fill: "red", shape: "dot", text: "error" });
            return;
        }

        promise.then(
            // onFullfilled handler
            (fullfilledResponse: PromiseResponse) => {

                this.clearRequestDelayedTimer();

                this.previousResponseError = undefined;

                WriteNodeImpl.activeMessageCount--;

                this.node.status({});
                msg.body = fullfilledResponse.body;
                this.node.send(msg);
                var queueLength = this.msgQueue.done(0);
                this.updateQueuedStatus(queueLength);
            },
            // onRejected handler
            (error: any) => {
                this.clearRequestDelayedTimer();

                WriteNodeImpl.activeMessageCount--;

                this.previousResponseError = ErrorHanding.handleErrorResponse(error, msg, this.node,
                    this.previousResponseError);

                this.msgQueue.done(50);
            }
        );
    }

    static getValueToWrite(msg: any, nodeConfig: NodeWriteConfiguration) {
        var valueFinal = null;
        // console.log('nodeWriteConfig = ' + JSON.stringify(nodeWriteConfig, undefined, 2));
        // console.log('msg = ' + JSON.stringify(msg, undefined, 2));

        // Value might be a property on the "msg" object or from the UI.
        switch (nodeConfig.valueType) {
            case 'msg':
            case 'msg.payload':
                var msgProperty: string;
                if (nodeConfig.valueType === 'msg.payload') {
                    msgProperty = 'payload';
                }
                else {
                    // Get the name of the property
                    msgProperty = nodeConfig.value;
                }
                // Get the value out of the message object.
                // If it's a custom property name, it might be nested, which
                // RED.util.getMessageProperty() knows how to handle.
                var msgValue = RED.util.getMessageProperty(msg, msgProperty);

                // Confirm that we got something out of the message.
                if (msgValue === undefined) {
                    throw new Error('msg.' + msgProperty + ' is undefined.');
                }

                if (typeof msgValue === 'string') {
                    // Kindly see if the string can be converted into something usable.
                    valueFinal = WriteNodeImpl.stringValueToWriteValue(nodeConfig.dataType, msgValue);
                }
                else {
                    valueFinal = msgValue;
                }

                break;
            case 'value':
                var mmpType: MmpDataType | undefined;

                // See if we should use the mmpType value or not.
                if (nodeConfig.dataType === 'mmp-address')
                    mmpType = nodeConfig.mmpType;

                // We have a string from the UI and need to figure it out.
                valueFinal = WriteNodeImpl.stringValueToWriteValue(nodeConfig.dataType,
                    nodeConfig.value, mmpType);

                break;
            default:
                throw new Error('Unexpected value type - ' + nodeConfig.valueType);
        }
        return valueFinal;
    }

    // Static so that it's easily testable.
    static stringValueToWriteValue(dataType: string, value: any, mmpType?: MmpDataType): any {
        // Make sure we only have a string. If we get here, it's probably our own fault.
        if (typeof value !== 'string')
            throw new Error('Invalid Input');

        var writeVal: any = null;

        var isString = false;
        var isInteger = false;
        var isFloat = false;
        var isDigital = (dataType === 'channel-digital');

        if (dataType === 'channel-digital')
            isDigital = true;
        else if (dataType === 'channel-analog')
            isFloat = true;
        else if (dataType === 'mmp-address') {
            if (mmpType) {
                switch (mmpType) {
                    case 'int8':
                    case 'uint8':
                    case 'int32':
                    case 'uint32':
                        isInteger = true;
                        break;
                    case 'float':
                        isFloat = true;
                        break;
                    case 'string':
                        isString = true;
                }
            }
        }

        if (isDigital) {
            var result = false;

            // For digital outputs, we don't want to go with the standard JavaScript string-to-boolean rules.
            // We also want to support 'off' and 'on' string values.
            var testValue = value.toLowerCase().trim();
            if ((testValue === 'off') || (testValue === 'false'))
                result = false;
            else if ((testValue === 'on') || (testValue === 'true'))
                result = true;
            else
                throw new Error('"' + value + '" is not a valid value for a digital output.');

            writeVal = result;

        }
        else if (isFloat || isInteger) {
            var valueTrimmed = value.trim();

            if (valueTrimmed === '') {
                throw new Error('"' + value + '" is not a valid number.');
            }

            var valueAsNumber: number;

            if (isFloat)
                valueAsNumber = Number.parseFloat(valueTrimmed);
            else if (isInteger)
                valueAsNumber = Number.parseInt(valueTrimmed)

            if (isNaN(valueAsNumber)) {
                throw new Error('"' + value + '" is not a valid number.');
            } else {
                writeVal = valueAsNumber;
            }
        }
        else if (isString) {
            writeVal = value;
        }
        else {
            writeVal = value;
        }


        return writeVal;
    }

    /**
 * Returns a promise for the given controller and node configuration.
 * Basically maps the different options to the specific method.
 */
    private getWriteRequest(msg: any, value: any): Promise<{ response: http.ClientResponse; body?: any; }> {
        var nodeConfig = this.nodeConfig;

        // Message overrides
        var moduleIndex = msg.moduleIndex === undefined ? this.moduleIndex : msg.moduleIndex;
        var channelIndex = msg.channelIndex === undefined ? this.channelIndex : msg.channelIndex;
        var mmpAddress = msg.mmpAddress === undefined ? nodeConfig.mmpAddress : msg.mmpAddress;

        // Map the node's data type to the API path.
        switch (nodeConfig.dataType) {
            case 'channel-digital':
                return this.apiClient.setDigitalChannelState('local', moduleIndex, channelIndex, { value: value });
            case 'channel-analog':
                return this.apiClient.setAnalogChannelValue('local', moduleIndex, channelIndex, { value: value });
            case 'channel-clear-on-latch':
                return this.apiClient.clearDigitalChannelOnLatch('local', moduleIndex, channelIndex);
            case 'channel-clear-off-latch':
                return this.apiClient.clearDigitalChannelOffLatch('local', moduleIndex, channelIndex);
            case 'channel-clear-feature-value':
                return this.apiClient.clearDigitalChannelFeature('local', moduleIndex, channelIndex);
            case 'channel-clear-min-value':
                return this.apiClient.clearAnalogChannelMinValue('local', moduleIndex, channelIndex);
            case 'channel-clear-max-value':
                return this.apiClient.clearAnalogChannelMaxValue('local', moduleIndex, channelIndex);
            case 'channel-counter-start':
                return this.apiClient.setDigitalChannelCounterActive('local', moduleIndex, channelIndex, { value: true });
            case 'channel-counter-stop':
                return this.apiClient.setDigitalChannelCounterActive('local', moduleIndex, channelIndex, { value: false });
            case 'channel-config':
                return this.apiClient.setChannelConfiguration('local', moduleIndex, channelIndex, value);
            case 'mmp-address':
                let body = {
                    value: value,
                    type: this.nodeConfig.mmpType
                };
                if (this.nodeConfig.mmpType == 'string') {
                    body['encoding'] = this.nodeConfig.mmpEncoding;
                }

                return this.apiClient.setMmpValue('local', mmpAddress, body);
        }
    }
}

export function createWriteNode(nodeConfig: NodeWriteConfiguration) {
    RED.nodes.createNode(this, nodeConfig);
    var deviceConfig: ConfigHandler.DeviceConfiguration =
        <ConfigHandler.DeviceConfiguration><any>RED.nodes.getNode(nodeConfig.device);
    var node: NodeRed.Node = <NodeRed.Node>this; // for easier reference

    // Create the implementation class.
    var impl = new WriteNodeImpl(nodeConfig, deviceConfig, node);
}
