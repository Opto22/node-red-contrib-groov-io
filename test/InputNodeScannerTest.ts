import http = require('http');
import * as NodeHandlers from "../src/nodes/base-node";
import * as ConfigHandler from "../src/nodes/config-node";
import * as ApiLib from "../src/swagger/lib/api";
import * as should from 'should';
import * as async from 'async';
import * as TestUtil from "./test-util/test-util";
import { RackInfo } from "./test-util/rack-info";
import { WriteNodeImpl } from '../src/nodes/write-node';
import { InputNodeScanner, InputNodeChangeType } from "../src/nodes/InputNodeScanner";

var TestSettings = require('./settings.json');


describe('InputNodeScanner', function () {

    let deviceConfig: ConfigHandler.DeviceConfiguration;

    before(function (beforeDone: MochaDone) {
        beforeDone();
    });

    describe('timer', function () {
        it('fires a timer', function (done) {
            let ins = new InputNodeScanner(5, InputNodeChangeType.None, undefined, true, () => {
                should(ins.updateValue(456)).be.true();
                ins.close();
                done();
            });
            ins.startScan();
        });

        it('fires multiple timers', function (done) {
            var timerCounter = 0;
            let ins = new InputNodeScanner(5, InputNodeChangeType.None, undefined, true, () => {
                timerCounter++;

                if (timerCounter > 5) {
                    ins.close();
                    done();
                    return;
                }

                ins.updateValue(1);
            });
            ins.startScan();
        });

        it('fires a timer after an error is reported', function (done) {
            var timerCounter = 0;
            let ins = new InputNodeScanner(5, InputNodeChangeType.None, undefined, true, () => {
                timerCounter++;

                if (timerCounter == 5) {
                    // If there's no new value, the user of this class is expected to call
                    // updateError() so that scanning can continue.
                    ins.updateError();
                    return;
                }

                if (timerCounter > 6) {
                    ins.close();
                    done();
                    return;
                }

                ins.updateValue(1);
            });
            ins.startScan();
        });
    });

    describe('updateValue()', function () {
        describe('InputNodeChangeType.None', function () {
            it('returns True when sendInitialValue is True', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.None, undefined, true);
                should(ins.updateValue(456)).be.true();
            });

            it('returns False when sendInitialValue is False', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.None, undefined, false);
                should(ins.updateValue(456)).be.false();
            });

            it('returns True when a value changes; Floats', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.None, undefined, false);
                should(ins.updateValue(456)).be.false();
                should(ins.updateValue(457)).be.true(); // change
                should(ins.updateValue(457)).be.false();
                should(ins.updateValue(457.001)).be.true(); // change
            });

            it('returns True when a value changes; Boolean', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.None, undefined, false);
                should(ins.updateValue(true)).be.false();
                should(ins.updateValue(false)).be.true(); // change
                should(ins.updateValue(false)).be.false();
                should(ins.updateValue(true)).be.true(); // change
            });

            it('returns True when a value changes; String', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.None, undefined, false);
                should(ins.updateValue('alpha')).be.false();
                should(ins.updateValue('beta')).be.true(); // change
                should(ins.updateValue('beta')).be.false();
                should(ins.updateValue('gamma')).be.true(); // change
                should(ins.updateValue('gamma')).be.false();
                should(ins.updateValue('gamma ')).be.true(); // change
            });
        });

        describe('InputNodeChangeType.Deadband', function () {
            it('returns True when sendInitialValue is True', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.Deadband, 1, true);
                should(ins.updateValue(456)).be.true();
            });

            it('returns False when sendInitialValue is False', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.Deadband, 1, false);
                should(ins.updateValue(456)).be.false();
            });

            it('returns True when a value changes beyond the deadband', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.Deadband, 1, false);
                should(ins.updateValue(456)).be.false();
                should(ins.updateValue(457)).be.true(); // change beyond the deadband
                should(ins.updateValue(457)).be.false();
                should(ins.updateValue(457.001)).be.false();
                should(ins.updateValue(457.9)).be.false();
                should(ins.updateValue(458)).be.true(); // change beyond the deadband
                should(ins.updateValue(457.1)).be.false();
                should(ins.updateValue(457.0)).be.true(); // change beyond the deadband
                should(ins.updateValue(-50.0)).be.true(); // change beyond the deadband
                should(ins.updateValue(-50.5)).be.false();
                should(ins.updateValue(-51.0)).be.true(); // change beyond the deadband
                should(ins.updateValue(-51.5)).be.false();
                should(ins.updateValue(-50.5)).be.false();
                should(ins.updateValue(-50.0)).be.true(); // change beyond the deadband
                should(ins.updateValue(-49.5)).be.false();
                should(ins.updateValue(-45.1)).be.true(); // change beyond the deadband
                should(ins.updateValue(-44.2)).be.false();
                should(ins.updateValue(-44.1)).be.true(); // change beyond the deadband
            });
        });

        describe('InputNodeChangeType.RisingEdgeOnly', function () {
            it('returns True when value is True and sendInitialValue is True', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.RisingEdgeOnly, 1, true);
                should(ins.updateValue(true)).be.true();
            });

            it('returns False when value is False and sendInitialValue is True', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.RisingEdgeOnly, 1, true);
                should(ins.updateValue(false)).be.false();
            });

            it('returns False when value is True and sendInitialValue is False', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.RisingEdgeOnly, 1, false);
                should(ins.updateValue(true)).be.false();
            });

            it('returns False when value is False and sendInitialValue is False', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.RisingEdgeOnly, 1, false);
                should(ins.updateValue(false)).be.false();
            });

            it('returns True when a value changes', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.RisingEdgeOnly, 1, false);
                should(ins.updateValue(false)).be.false();
                should(ins.updateValue(false)).be.false();
                should(ins.updateValue(true)).be.true(); // rising edge
                should(ins.updateValue(true)).be.false();
                should(ins.updateValue(false)).be.false();
                should(ins.updateValue(false)).be.false();
                should(ins.updateValue(true)).be.true(); // rising edge
            });

        });

        describe('InputNodeChangeType.FallingEdgeOnly', function () {
            it('returns False when value is True and sendInitialValue is True', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.FallingEdgeOnly, 1, true);
                should(ins.updateValue(true)).be.false();
            });

            it('returns True when value is False and sendInitialValue is True', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.FallingEdgeOnly, 1, true);
                should(ins.updateValue(false)).be.true();
            });

            it('returns False when value is True and sendInitialValue is False', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.FallingEdgeOnly, 1, false);
                should(ins.updateValue(true)).be.false();
            });

            it('returns False when value is False and sendInitialValue is False', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.FallingEdgeOnly, 1, false);
                should(ins.updateValue(false)).be.false();
            });

            it('returns True when a value changes', function () {
                let ins = new InputNodeScanner(5, InputNodeChangeType.FallingEdgeOnly, 1, false);
                should(ins.updateValue(false)).be.false();
                should(ins.updateValue(false)).be.false();
                should(ins.updateValue(true)).be.false();
                should(ins.updateValue(true)).be.false();
                should(ins.updateValue(false)).be.true(); // falling edge
                should(ins.updateValue(false)).be.false();
                should(ins.updateValue(true)).be.false();
                should(ins.updateValue(true)).be.false();
                should(ins.updateValue(false)).be.true(); // falling edge
                should(ins.updateValue(false)).be.false();
            });

        });
    });


});

