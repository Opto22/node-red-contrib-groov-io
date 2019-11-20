export enum InputNodeChangeType {
    None,
    Deadband,
    RisingEdgeOnly,
    FallingEdgeOnly
}


export class InputNodeScanner {
    private timer: NodeJS.Timer;
    private lastValue: any;
    private initialValueSent: boolean = false;
    private deadband: number;
    private scanTimeMs: number;
    private doScan: boolean;
    private nodeChangeType: InputNodeChangeType;
    private sendInitialValue: boolean
    private scanCallback: () => void;

    constructor(scanTimeMs: number, nodeChangeType: InputNodeChangeType,
        deadband: number | undefined,
        sendInitialValue: boolean,
        scanCallback?: () => void) {
        this.deadband = deadband;
        this.scanTimeMs = scanTimeMs;
        this.nodeChangeType = nodeChangeType;
        this.sendInitialValue = sendInitialValue;
        this.scanCallback = scanCallback;
    }

    public close() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.doScan = false;
    }

    public startScan() {
        this.doScan = true;
        this.timer = setTimeout(this.scanCallback, this.scanTimeMs);
    }

    public updateValue(newValue: number | string | boolean): boolean {
        var valueChanged = false;
        var sendInitialValue = !this.initialValueSent && this.sendInitialValue;
        this.initialValueSent = true;

        if (this.lastValue === undefined) {
            // Probably the first time here.
            this.lastValue = newValue;
        }

        if (this.nodeChangeType == InputNodeChangeType.Deadband) {
            if (sendInitialValue) {
                valueChanged = true;
            }
            else {
                // Check if the new value is different enough.
                // Deadband might be 0, in which case all new values get sent.
                if ((newValue >= (this.lastValue + this.deadband)) ||
                    (newValue <= (this.lastValue - this.deadband))) {
                    valueChanged = true;
                }
            }
        }
        else if (this.nodeChangeType == InputNodeChangeType.RisingEdgeOnly) {
            if (sendInitialValue && newValue) {
                // ONLY send an initial value if the current value is True
                valueChanged = true;
            }
            else {
                // Going from False to True?
                valueChanged = newValue && !this.lastValue;
            }

            // Always capture the current value, so that we have a fallen edge preserved.
            this.lastValue = newValue;
        }
        else if (this.nodeChangeType == InputNodeChangeType.FallingEdgeOnly) {
            if (sendInitialValue && !newValue) {
                // ONLY send an initial value if the current value is False
                valueChanged = true;
            }
            else {
                // Going from True to False?
                valueChanged = !newValue && this.lastValue;
            }

            // Always capture the current value, so that we have a risen edge preserved.
            this.lastValue = newValue;
        }
        else {
            if (sendInitialValue) {
                valueChanged = true;
            }
            else {
                // Just a straight comparison.
                valueChanged = this.lastValue != newValue;
            }
        }

        if (valueChanged) {
            // console.log('this.nodeInputConfig = ' + JSON.stringify(this.nodeInputConfig, undefined, 2));
            // console.log('newValue = ' + JSON.stringify(newValue, undefined, 2));

            // Capture the current value. 
            this.lastValue = newValue;
        }

        // Only start the next timer after a response, and only if 
        // the scanning flag is still set. (it goes false when closing the nodes)
        if (this.doScan) {
            this.timer = setTimeout(this.scanCallback, this.scanTimeMs);
        }

        return valueChanged;
    }

    public updateError() {
        // Only start the next timer after a response, and only if 
        // the scanning flag is still set. (it goes false when closing the nodes)
        if (this.doScan) {
            this.timer = setTimeout(this.scanCallback, this.scanTimeMs);
        }
    }
}

