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
import * as NodeRed from '../../submodules/opto22-node-red-common/typings/nodered';
import Promise = require('bluebird');
import * as ErrorHanding from "../util/error-handling";
import { NodeBaseImpl, NodeBaseConfiguration, PromiseResponse } from "./base-node";
import { ENGINE_METHOD_NONE } from "constants";
import { InputNodeScanner, InputNodeChangeType } from "./InputNodeScanner";

var RED: NodeRed.RED;

export function setRED(globalRED: NodeRed.RED) {
    RED = globalRED;
}

export interface NodeInputConfiguration extends NodeBaseConfiguration {
    sendInitialValue: boolean;
    deadband: string;
    scanTimeSec: string;
    topic: string;
    topicType: string; // 'none', 'auto', or 'user'
}



export interface RequestInfo {
    promise: Promise<PromiseResponse>,
    dataType: string,
    valueName?: string,
    mmpLength?: number
}

/**
 * The implementation class for the Input nodes.
 */
export class InputNodeImpl extends NodeBaseImpl {
    // The node object.
    private nodeInputConfig: NodeInputConfiguration;
    private inputNodeHelper: InputNodeScanner;
    private scanTimeMs: number;
    private requestDelayedTimer: NodeJS.Timer;


    constructor(nodeConfig: NodeInputConfiguration, deviceConfig: ConfigHandler.DeviceConfiguration, node: NodeRed.Node) {
        super(nodeConfig, deviceConfig, node);
        this.nodeInputConfig = nodeConfig;

        var deadband: number;
        var nodeChangeType: InputNodeChangeType = InputNodeChangeType.None;


        this.scanTimeMs = parseFloat(nodeConfig.scanTimeSec);
        if (isNaN(this.scanTimeMs))
            this.scanTimeMs = 500;
        else
            this.scanTimeMs = this.scanTimeMs * 1000.0;

        if ((this.nodeInputConfig.dataType == 'channel-analog') ||
            (this.nodeInputConfig.dataType == 'channel-digital-feature-value') ||
            (this.nodeInputConfig.dataType == 'mmp-address' && this.nodeInputConfig.mmpType != 'string')) {
            nodeChangeType = InputNodeChangeType.Deadband;

            deadband = parseFloat(nodeConfig.deadband);
            if (isNaN(deadband))
                deadband = 1;
        }

        if ((this.nodeInputConfig.dataType == 'channel-digital-on-latch') ||
            (this.nodeInputConfig.dataType == 'channel-digital-off-latch') ||
            (this.nodeInputConfig.dataType == 'channel-digital-turn-on')) {
            nodeChangeType = InputNodeChangeType.RisingEdgeOnly;
        }

        if (this.nodeInputConfig.dataType == 'channel-digital-turn-off') {
            nodeChangeType = InputNodeChangeType.FallingEdgeOnly;
        }

        this.inputNodeHelper = new InputNodeScanner(this.scanTimeMs, nodeChangeType, deadband,
            nodeConfig.sendInitialValue, this.onScan);

        // Make sure the device was configured before starting the scan.
        if (this.apiClient) {
            if (this.scanTimeMs > 0) {
                this.inputNodeHelper.startScan();
            }
        }
        else {
            this.node.status({ fill: "red", shape: "dot", text: "No device" });
        }
    }


    static getNodeType(): string {
        return 'groov-io-input';
    }

    // Handler for 'close' events from Node-RED.
    public onClose = () => {
        this.inputNodeHelper.close();

        if (this.requestDelayedTimer) {
            clearTimeout(this.requestDelayedTimer);
        }
    }

    // If a request takes more than a moment, we want to show the user that 
    // it's been delayed. It's very likely that this request or another on the shared HTTP Agent's queue
    // it timing out.
    private scanNotDoneCallback = () => {
        // If there's no current error, update the status to show that the request
        // is delayed. Probably either this or another node on the same device is timing out.
        if (!this.previousResponseError) {
            this.node.status({ fill: "yellow", shape: "dot", text: "scanning (delayed)" });
        }
        this.requestDelayedTimer = null;
    }

    // Callback used by the scanner's timer.
    public onScan = () => {
        // Start the Request Delayed timeout
        this.requestDelayedTimer = setTimeout(this.scanNotDoneCallback, 3000);

        var reqInfo = this.getReadRequest();

        if (!reqInfo || !reqInfo.promise) {
            this.node.status({ fill: "red", shape: "dot", text: "error" });
            return;
        }

        reqInfo.promise.then(
            // onFullfilled handler
            (fullfilledResponse: PromiseResponse) => {

                // Clear the Request Delayed timeout
                clearTimeout(this.requestDelayedTimer);
                this.requestDelayedTimer = null;

                this.node.status({ fill: "green", shape: "dot", text: "scanning" });
                this.previousResponseError = undefined;

                let newValue = fullfilledResponse.body[reqInfo.valueName];

                // If reading an MMP address as a string or a single numeric element, pull
                // the one value out of the array.
                if (this.nodeInputConfig.dataType == 'mmp-address') {
                    if (this.nodeInputConfig.mmpType == 'string' || reqInfo.mmpLength === 1) {
                        newValue = newValue[0];
                    }
                }

                if (this.inputNodeHelper.updateValue(newValue)) {
                    let msg: any = {
                        payload: newValue,
                        body: fullfilledResponse.body,
                        inputType: this.nodeInputConfig.dataType
                        // topic: ????
                    };

                    this.node.send(msg);
                }

            },
            // onRejected handler
            (error: any) => {
                // Clear the Request Delayed timeout
                clearTimeout(this.requestDelayedTimer);
                this.requestDelayedTimer = null;

                this.previousResponseError = ErrorHanding.handleErrorResponse(error, {}, this.node,
                    this.previousResponseError);

                this.inputNodeHelper.updateError();
            }
        );

    }


    /**
     * Returns a promise for the given controller and node configuration.
     * Basically maps the different options to the specific method.
     */
    private getReadRequest(): RequestInfo {
        var nodeConfig = this.nodeInputConfig;

        // Map the node's data type to the API path.
        switch (nodeConfig.dataType) {
            case 'channel-digital-state':
            case 'channel-digital-turn-on':
            case 'channel-digital-turn-off':
                return {
                    promise: this.apiClient.getChannelDigitalStatus('local', this.moduleIndex, this.channelIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'state'
                };
            case 'channel-digital-on-latch':
                return {
                    promise: this.apiClient.getChannelDigitalStatus('local', this.moduleIndex, this.channelIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'onLatchState'
                };
            case 'channel-digital-off-latch':
                return {
                    promise: this.apiClient.getChannelDigitalStatus('local', this.moduleIndex, this.channelIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'offLatchState'
                };
            case 'channel-digital-feature-value':
                return {
                    promise: this.apiClient.getChannelDigitalStatus('local', this.moduleIndex, this.channelIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'featureValue'
                };
            case 'channel-analog':
                return {
                    promise: this.apiClient.getChannelAnalogStatus('local', this.moduleIndex, this.channelIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'value'
                }
            case 'mmp-address':
                return {
                    promise: this.apiClient.getMmpValues('local',
                        this.nodeConfig.mmpAddress, this.nodeConfig.mmpType,
                        this.mmpLength, this.nodeConfig.mmpEncoding),
                    dataType: nodeConfig.dataType,
                    valueName: 'mmpValues',
                    mmpLength: this.mmpLength // return the possibly adjusted value
                };
        }
    }

}

export function createInputNode(nodeConfig: NodeInputConfiguration,
    returnImpl?: boolean): InputNodeImpl | undefined {

    var node: NodeRed.Node = <NodeRed.Node>this; // for easier reference
    RED.nodes.createNode(node, nodeConfig);

    var deviceConfig: ConfigHandler.DeviceConfiguration =
        <ConfigHandler.DeviceConfiguration><any>RED.nodes.getNode(nodeConfig.device);

    // Create the implementation class.
    var impl = new InputNodeImpl(nodeConfig, deviceConfig, node);

    node.on('close', impl.onClose);

    // The unit tests need the implementation object too.
    if (returnImpl) {
        return impl;
    }
}



