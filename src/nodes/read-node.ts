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
import { FunctionNodeBaseImpl, NodeBaseConfiguration, PromiseResponse } from "./base-node";


var RED: NodeRed.RED;

export function setRED(globalRED: NodeRed.RED) {
    RED = globalRED;
}

export interface NodeReadConfiguration extends NodeBaseConfiguration {
    value: string;
    valueType: string; // 'msg' or 'msg.payload'
    topic: string;
    topicType: string; // 'none', 'auto', or 'user'
}


interface RequestInfo {
    promise: Promise<PromiseResponse>,
    dataType: string,
    valueName?: string,
    mmpLength?: number
}

/**
 * The implementation class for the Read nodes.
 */
export class ReadNodeImpl extends FunctionNodeBaseImpl {
    private nodeReadConfig: NodeReadConfiguration
    private requestDelayedTimer: NodeJS.Timer;

    constructor(nodeConfig: NodeReadConfiguration, deviceConfig: ConfigHandler.DeviceConfiguration, node: NodeRed.Node) {
        super(nodeConfig, deviceConfig, node);
        this.nodeReadConfig = nodeConfig;

        this.node.on('close', () => {
            this.onClose();
        });

        this.node.on('input', (msg: any) => {
            this.addMsg(msg); // add msg to the queue
        });
    }

    static getNodeType(): string {
        return 'groov-io-read';
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
            this.node.status({ fill: "yellow", shape: "dot", text: "reading (delayed)" });
        }
        this.requestDelayedTimer = null;
    }

    // Handler for 'input' events from Node-RED.
    public onInput = (msg: any) => {

        // Start the Request Delayed timeout
        this.requestDelayedTimer = setTimeout(this.scanNotDoneCallback, 3000);

        if (this.previousResponseError) {
            this.node.status({
                fill: "red", shape: "dot", text: "reading [" +
                    this.previousResponseError.nodeShortErrorMsg + "]"
            });
        }
        else {
            this.node.status({ fill: "green", shape: "dot", text: "reading" });
        }

        var reqInfo: RequestInfo;

        if (this.apiClient) {
            reqInfo = this.getReadRequest(msg);
        }
        else {
            this.node.status({ fill: "red", shape: "dot", text: "No device" });
            return;
        }

        if (!reqInfo || !reqInfo.promise) {
            this.node.status({ fill: "red", shape: "dot", text: "error" });
            return;
        }

        reqInfo.promise.then(
            // onFullfilled handler
            (fullfilledResponse: PromiseResponse) => {

                this.clearRequestDelayedTimer();

                this.previousResponseError = undefined;

                this.node.status({});

                // Always attach the response's body to msg.
                msg.body = fullfilledResponse.body;

                this.setValue(msg, fullfilledResponse, reqInfo);
                // this.setTopic(msg);

                this.node.send(msg)
                var queueLength = this.msgQueue.done(0);
                this.updateQueuedStatus(queueLength);
            },
            // onRejected handler
            (error: any) => {
                this.clearRequestDelayedTimer();

                this.previousResponseError = ErrorHanding.handleErrorResponse(error, msg, this.node,
                    this.previousResponseError);

                this.msgQueue.done(50);
            }
        );

    }

    private setValue(msg: any, fullfilledResponse: any, reqInfo: RequestInfo) {
        var newValue;

        // See if we have a property to pull out of the body.
        if (reqInfo.valueName) {
            // Use the given property on the body
            newValue = fullfilledResponse.body[reqInfo.valueName]
        } else {
            // Use the whole body
            newValue = fullfilledResponse.body;
        }

        // If reading an MMP address as a string or a single numeric element, pull
        // the one value out of the array.
        if (reqInfo.dataType == 'mmp-address') {
            if (this.nodeReadConfig.mmpType == 'string' || reqInfo.mmpLength === 1) {
                newValue = newValue[0];
            }
        }

        // See where the value should be placed.
        switch (this.nodeReadConfig.valueType) {
            case 'msg':
                RED.util.setMessageProperty(msg, this.nodeReadConfig.value, newValue, true);;
                break;
            case 'msg.payload':
                msg.payload = newValue;
                break;
            default:
                throw new Error('Unexpected value type - ' + this.nodeReadConfig.valueType);
        }
    }


    /**
     * Returns a promise for the given controller and node configuration.
     * Basically maps the different options to the specific method.
     */
    private getReadRequest(msg: any): RequestInfo {
        var nodeConfig = this.nodeConfig;

        // Message overrides
        var moduleIndex = msg.moduleIndex === undefined ? this.moduleIndex : msg.moduleIndex;
        var channelIndex = msg.channelIndex === undefined ? this.channelIndex : msg.channelIndex;
        var mmpAddress = msg.mmpAddress === undefined ? nodeConfig.mmpAddress : msg.mmpAddress;

        // var itemName = this.nodeConfig.itemName;

        // Map the node's data type to the API path.
        switch (nodeConfig.dataType) {
            case 'channel-digital':
                return {
                    promise: this.apiClient.getChannelDigitalStatus('local', moduleIndex, channelIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'state'
                };
            case 'channel-analog':
                return {
                    promise: this.apiClient.getChannelAnalogStatus('local', moduleIndex, channelIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'value'
                }
            case 'channel-config':
                return {
                    promise: this.apiClient.getChannelConfiguration('local', moduleIndex, channelIndex),
                    dataType: nodeConfig.dataType,
                }
            case 'module-digital':
                return {
                    promise: this.apiClient.getModuleDigitalChannelValues('local', moduleIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'channelValues'
                };
            case 'module-analog':
                return {
                    promise: this.apiClient.getModuleAnalogChannelValues('local', moduleIndex),
                    dataType: nodeConfig.dataType,
                    valueName: 'channelValues'
                }
            // case 'module-info':
            //     return {
            //         promise: this.apiClient.getModuleInfo('local', moduleIndex),
            //         dataType: nodeConfig.dataType,
            //     }
            // case 'module-config':
            //     return {
            //         promise: this.apiClient.getModuleConfiguration('local', moduleIndex),
            //         dataType: nodeConfig.dataType,
            //     }
            // case 'modules-type':
            //     return {
            //         promise: this.apiClient.getModuleTypes('local'),
            //         dataType: nodeConfig.dataType,
            //         valueName: 'types'
            //     }
            // case 'modules-info':
            //     return {
            //         promise: this.apiClient.getModuleInfos('local'),
            //         dataType: nodeConfig.dataType,
            //         valueName: 'modules'
            //     }
            case 'modules-quality':
                return {
                    promise: this.apiClient.getModuleQualityFlags('local'),
                    dataType: nodeConfig.dataType,
                    valueName: 'qualityMask'
                }
            case 'mmp-address':
                return {
                    promise: this.apiClient.getMmpValues('local',
                        mmpAddress, this.nodeConfig.mmpType,
                        this.mmpLength, this.nodeConfig.mmpEncoding),
                    dataType: nodeConfig.dataType,
                    valueName: 'mmpValues',
                    mmpLength: this.mmpLength // return the possibly adjusted value
                };
            // case 'io-unit-info':
            //     return {
            //         promise: this.apiClient.getIoInfo('local'),
            //         dataType: nodeConfig.dataType,
            //     }
            // case 'io-unit-config':
            //     return {
            //         promise: this.apiClient.getIoConfiguration('local'),
            //         dataType: nodeConfig.dataType,
            //     }
            // case 'channel-type-description':
            //     if (itemName) {
            //         return {
            //             promise: this.apiClient.getChannelDescription(itemName),
            //             dataType: nodeConfig.dataType,
            //         }
            //     }
            //     else {
            //         return {
            //             promise: this.apiClient.getChannelDescriptions(),
            //             dataType: nodeConfig.dataType,
            //         }
            //     }
            // case 'module-type-description':
            //     if (itemName) {
            //         return {
            //             promise: this.apiClient.getModuleDescription(itemName),
            //             dataType: nodeConfig.dataType,
            //         }
            //     }
            //     else {
            //         return {
            //             promise: this.apiClient.getModuleDescriptions(),
            //             dataType: nodeConfig.dataType,
            //         }
            //     }
        }
    }

}

export function createReadNode(nodeConfig: NodeReadConfiguration) {
    RED.nodes.createNode(this, nodeConfig);

    var deviceConfig: ConfigHandler.DeviceConfiguration =
        <ConfigHandler.DeviceConfiguration><any>RED.nodes.getNode(nodeConfig.device);

    var node: NodeRed.Node = <NodeRed.Node>this; // for easier reference

    // Create the implementation class.
    var impl = new ReadNodeImpl(nodeConfig, deviceConfig, node);

}
