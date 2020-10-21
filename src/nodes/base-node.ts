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
import { DefaultApi } from "../swagger/lib/api";
import MessageQueue from "../../submodules/opto22-node-red-common/src/MessageQueue";
import { ErrorDetails } from "../util/error-handling";

export type MmpDataType =  'int8' | 'uint8' |'int32' | 'uint32' | 'float' | 'string';

// This interface should match the "defaults" field in the Node HTML file.
// There's no way to directly connect the two.
export interface NodeBaseConfiguration extends NodeRed.NodeConfiguration {
    device: string;
    dataType: string;
    moduleIndex: string;
    channelIndex: string;
    mmpAddress: string;
    mmpType: MmpDataType;
    mmpLength: string;
    mmpEncoding: string;
    // itemName: string;
    name: string;
}


export interface PromiseResponse {
    response: http.ClientResponse;
    body: any; // Since we don't do anything much with the response bodies, we can ignore the type.
}


export abstract class NodeBaseImpl {
    protected apiClient: DefaultApi;

    // The user's node configuration.
    protected nodeConfig: NodeBaseConfiguration;


    protected moduleIndex: number;
    protected channelIndex: number;
    protected mmpLength: number;

    // The user's controller device configurations (IP address and HTTPS settings)
    protected deviceConfig: ConfigHandler.DeviceConfiguration;

    // The node object.
    protected node: NodeRed.Node;

    protected deviceConnection: ConfigHandler.GroovManageConnection;

    protected previousResponseError: ErrorDetails | undefined;


    constructor(nodeConfig: NodeBaseConfiguration, deviceConfig: ConfigHandler.DeviceConfiguration, node: NodeRed.Node) {
        this.nodeConfig = nodeConfig;
        this.deviceConfig = deviceConfig;
        this.node = node;

        if (deviceConfig) {
            this.deviceConnection = ConfigHandler.globalConnections.getConnection(deviceConfig.id);
            this.apiClient = this.deviceConnection.apiClient;
        }
        else {
            this.node.error('Missing device configuration', '');
        }

        // Parse the start index and table length. We can't assume that they're numbers.
        this.moduleIndex = parseInt(nodeConfig.moduleIndex);
        this.channelIndex = parseInt(nodeConfig.channelIndex);
        this.mmpLength = parseInt(nodeConfig.mmpLength);

        // Fix any input data.
        // Make sure we have a number.
        if (isNaN(this.moduleIndex))
            this.moduleIndex = 0;
        if (isNaN(this.channelIndex))
            this.channelIndex = 0;
        if (isNaN(this.mmpLength))
            this.mmpLength = 1;
    }

}
export abstract class FunctionNodeBaseImpl extends NodeBaseImpl {
    // Message queue to help throttle messages going to the controller.
    protected msgQueue: MessageQueue;

    constructor(nodeConfig: NodeBaseConfiguration, deviceConfig: ConfigHandler.DeviceConfiguration, node: NodeRed.Node) {
        super(nodeConfig, deviceConfig, node);

        if (deviceConfig) {
            this.msgQueue = this.deviceConnection.queue;
        }

    }

    public abstract onInput(msg: any): void;

    /** Add message to the queue. */
    public addMsg(msg: any): void {
        // Check that we have a connection to use.
        if (!this.apiClient || !this.msgQueue) {
            // If there's no connection, immediately return and effectively
            // drop the message. An error is logged when the node is downloaded, which mirrors
            // what the official nodes do.
            this.node.status({ fill: "red", shape: "dot", text: 'missing Groov configuration' });
            return;
        }
        // Check for basic HTTPS configuration errors. If there are any, then don't even try.
        // Drop the message.
        //    if (this.apiClient.hasConfigError()) {
        //        this.node.status({ fill: "red", shape: "dot", text: 'Configuration error' });
        //        return;
        //    }

        // console.log('addMsg, msg._msgid = ' + JSON.stringify(msg._msgid, undefined, 2));


        // Add the message to the queue.
        var queueLength = this.msgQueue.add(msg, this.node, this, this.onInput);

        // See if there's room for the message.
        // if (queueLength < 0) {
        //     this.node.warn('Message rejected. Queue is full for Groov.');
        // }

        // Update the node's status, but don't overwrite the status if this node is currently
        // being processed.
        var currentMsgBeingProcessed = this.msgQueue.getCurrentMessage();
        if (currentMsgBeingProcessed.inputEventObject !== this) {
            if (queueLength !== 0) {
                this.updateQueuedStatus(queueLength);
            }
        }

    }

    protected updateQueuedStatus(queueLength: number) {
        if (queueLength != 0) {
            if (this.previousResponseError) {
                this.node.status({
                    fill: "red", shape: "ring", text: "queued [" +
                        this.previousResponseError.nodeShortErrorMsg + "]"
                });
            }
            else {
                this.node.status({ fill: "green", shape: "ring", text: 'queued' });
            }
        }
    }
}

interface RequestInfo {
    promise: Promise<PromiseResponse>,
    dataType: string,
    valueName?: string,
    mmpLength?: number
}
