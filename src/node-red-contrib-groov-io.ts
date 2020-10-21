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

import * as NodeHandlers from "./nodes/base-node";
import * as ConfigHandler from "./nodes/config-node";
import * as NodeRed from '../submodules/opto22-node-red-common/typings/nodered/index';
import semver = require('semver');
import * as InputNodeHandler from "./nodes/input-node";
import * as ReadNodeHandler from "./nodes/read-node";
import * as WriteNodeHandler from "./nodes/write-node";

var module: any;


function checkVersion(RED: NodeRed.RED) {
    var minNodeJsRequired = 'v4.4.5';
    if (semver.lt(process.version, minNodeJsRequired)) {
        RED.log.warn('The Opto 22 PAC nodes require Node.js ' + minNodeJsRequired + ' or greater.');
    }
}

// Register the nodes and initialize the implementation module.
// The implementation is kept in a separate module so that the unit test code can access it.
// Node-RED requires this module's 'exports' to be set to 'function(RED)'.
module.exports = function (RED: NodeRed.RED) {
    checkVersion(RED);

    // Pass in the global RED object to our modules. 
    InputNodeHandler.setRED(RED);
    ReadNodeHandler.setRED(RED);
    WriteNodeHandler.setRED(RED);
    ConfigHandler.setRED(RED);

    // Register the nodes and their handlers.
    RED.nodes.registerType(InputNodeHandler.InputNodeImpl.getNodeType(), InputNodeHandler.createInputNode);
    RED.nodes.registerType(ReadNodeHandler.ReadNodeImpl.getNodeType(), ReadNodeHandler.createReadNode);
    RED.nodes.registerType(WriteNodeHandler.WriteNodeImpl.getNodeType(), WriteNodeHandler.createWriteNode);
    RED.nodes.registerType(ConfigHandler.GroovIoDeviceNodeType, ConfigHandler.createDeviceNode,
        {
            credentials: {
                apiKey: { type: "password" },
                publicCertPath: { type: "text" },
                caCertPath: { type: "text" }
            }
        });
}
