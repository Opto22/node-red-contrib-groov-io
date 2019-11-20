/*
   Copyright 2016 Opto 22

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

import * as ApiLib from "../swagger/lib/api";
// import * as ApiExLib from "./api-ex";
import * as  MessageQueue from 'opto22-node-red-common/lib/MessageQueue';
import * as CertificateUtil from 'opto22-node-red-common/lib/CertificateUtil';
import * as NodeRed from 'opto22-node-red-common/typings/nodered';

import http = require('http');
import https = require('https');
import fs = require('fs');
import path = require('path');
import events = require('events');
import request = require('request');
import { DefaultApi } from "../swagger/lib/api";

var RED: NodeRed.RED;

export function setRED(globalRED: NodeRed.RED) {
    RED = globalRED;
}

/**
 * Data structure matching what comes from Node-RED for the device's configuration via the user interface.
 */
export interface DeviceCredentials {
    apiKey: string;
    publicCertPath: string;
    caCertPath: string;
}

/**
 * Data structure matching what comes from Node-RED for the device's configuration via the user interface.
 */
export interface DeviceConfiguration {
    id: string;
    address: string;
    msgQueueFullBehavior: MessageQueue.FullQueueBehaviorType;
    credentials: DeviceCredentials;
}

export var GroovIoDeviceNodeType = 'groov-io-device';

/**
 * Called by Node-RED to create a 'pac-device' node.
 */
export function createDeviceNode(config: DeviceConfiguration) {
    // Create the node. This will also return the credential information attached to 'this'.
    RED.nodes.createNode(this, config);

    var address = config.address.trim().toLowerCase();
    var isLocalhost = address === 'localhost';
    var msgQueueFullBehavior: MessageQueue.FullQueueBehaviorType =
        config.msgQueueFullBehavior || 'REJECT_NEW';

    // The credentials get attached to 'this'. They do not come in on 
    // the 'config' object.
    var apiKey = this.credentials.apiKey;
    var publicCertPath = this.credentials.publicCertPath;
    var caCertPath = this.credentials.caCertPath;

    // Make sure we have values and that they're clean enough to continue.
    apiKey = apiKey ? apiKey : '';
    publicCertPath = publicCertPath ? publicCertPath.trim() : '';
    caCertPath = caCertPath ? caCertPath.trim() : '';

    var publicCertFile: Buffer;
    var caCertFile: Buffer;

    if (apiKey === '') {
        RED.log.error('Missing API key for ' + address);
    }

    if (!isLocalhost) {
        if (caCertPath.length === 0) {
            RED.log.error('Missing SSL CA certificate for ' + address);
        }

        try {
            publicCertFile = CertificateUtil.getCertFile(RED, publicCertPath);
            caCertFile = CertificateUtil.getCertFile(RED, caCertPath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                RED.log.error('Cannot open certifcate file at \'' + err.path + '\'.');
            }
            else if (err.code === 'EACCES') {
                RED.log.error('Cannot open certifcate file at \'' + err.path + '\' due to file permissions.');
            }
            else {
                RED.log.error(err);
            }
        }
    }

    var ctrl = globalConnections.createConnection(address, apiKey,
        publicCertFile, caCertFile, msgQueueFullBehavior, config.id
        //, false
    );

    this.on('close', () => {
        ctrl.queue.dump(); // dump all but the current in-progress message for this connection.
    });

}

// Holder for controller connections and message queues.
export class GroovManageConnection {
    public apiClient: DefaultApi;
    public queue: MessageQueue.default;

    constructor(apiClient: DefaultApi, queue: MessageQueue.default) {
        this.apiClient = apiClient;
        this.queue = queue;
    }
}

export class GroovManageConnections {
    private connectionCache: GroovManageConnection[] = [];

    public createConnection(address: string, apiKey: string, publicCertFile: Buffer, caCertFile: Buffer,
        msgQueueFullBehavior: MessageQueue.FullQueueBehaviorType, id: string): GroovManageConnection {

        // Create the connection to the Groov API.
        var apiClient = new DefaultApi(address, apiKey, publicCertFile, caCertFile);

        // Cache it, using the Configuration node's id property.
        this.connectionCache[id] = new GroovManageConnection(apiClient, new MessageQueue.default(50, msgQueueFullBehavior));

        return this.connectionCache[id];
    }

    public getConnection(id: string): GroovManageConnection {
        return this.connectionCache[id];
    }

}

// Global cache of connections.
export var globalConnections = new GroovManageConnections();
