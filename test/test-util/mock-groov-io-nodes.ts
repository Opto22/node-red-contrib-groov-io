import { MockNode } from '../../submodules/opto22-node-red-common/src/mocks/MockNode';
import * as ConfigHandler from "../../src/nodes/config-node";
import * as NodeHandlers from "../../src/nodes/base-node";
import { WriteNodeImpl } from '../../src/nodes/write-node';
import { ReadNodeImpl } from '../../src/nodes/read-node';
import { InputNodeImpl } from '../../src/nodes/input-node';
import { FullQueueBehaviorType } from '../../submodules/opto22-node-red-common/src/MessageQueue';

export class MockNodeEx extends MockNode {

    onClose?: () => void;
    onInput?: (msg: any) => void;

    on(type: string, callback: (...rest: any[]) => void): void {
        if (type == 'close')
            this.onClose = callback;
        else if (type == 'input')
            this.onInput = callback;
    }

    close() {
        if (this.onClose)
            this.onClose();
    }

    input(msg: any) {
        if (this.onInput)
            this.onInput(msg);
    }

}



export class MockGroovInputNode extends MockNodeEx {
    constructor(onSend: (msg: any) => void, onError?: (errorText: any, nodeMessage: any) => void) {
        super(InputNodeImpl.getNodeType(), onSend, onError);
    }
}

export class MockGroovReadNode extends MockNodeEx {
    constructor(onSend: (msg: any) => void, onError?: (errorText: any, nodeMessage: any) => void) {
        super(ReadNodeImpl.getNodeType(), onSend, onError);
    }
}

export class MockGroovWriteNode extends MockNodeEx {
    constructor(onSend: (msg: any) => void, onError?: (errorText: any, nodeMessage: any) => void) {
        super(WriteNodeImpl.getNodeType(), onSend, onError);
    }
}

export class MockGroovIoDeviceNode extends MockNodeEx implements ConfigHandler.DeviceConfiguration {
    address: string;
    credentials: ConfigHandler.DeviceCredentials;
    msgQueueFullBehavior: FullQueueBehaviorType;

    constructor(id: string,
        address: string,
        credentials:
            {
                apiKey: string,
                publicCertPath: string,
                caCertPath: string,
            },
        msgQueueFullBehavior: FullQueueBehaviorType) {
        super(ConfigHandler.GroovIoDeviceNodeType);
        this.id = id;
        this.address = address;
        this.credentials = credentials;
        this.msgQueueFullBehavior = msgQueueFullBehavior;
    }
}
